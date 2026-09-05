"""
Batch evaluation harness (spec sections 16-17).

Runs the SAME batch of synthetic cases through both TRACE (contextual,
policy-controlled, reassessing agent) and the static baseline workflow,
using matched per-case randomness so differences in outcome are driven by
the *decisions* made, not by lucky/unlucky draws of the RNG.
"""
import logging
import random
import threading
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import _is_sqlite
from app.models import RecoveryCase, EvaluationRun, EvaluationResult
from app.simulation.generator import generate_dataset, SyntheticCase
from app.engine import ensure_classified, run_to_completion
from app.baseline import run_baseline
from app.evaluation.metrics import compute_metrics
from app.config import settings
from app.enums import AgentMode

logger = logging.getLogger("uvicorn.error")


# A batch run is long and write-heavy, and SQLite allows only one writer.
# Serialize runs process-wide. The lock lives here, beside the operation it
# guards, so the API route and the startup auto-seed share ONE lock instead
# of each defining their own and racing each other.
EVAL_RUN_LOCK = threading.Lock()


def _case_seed(global_seed: int, index: int) -> int:
    return (global_seed * 1_000_003 + index) & 0xFFFFFFFF


def _make_recovery_case(db: Session, sc: SyntheticCase, system: str, eval_run_id: str) -> RecoveryCase:
    case = RecoveryCase(
        payment_id=f"{sc.payment_id}_{system}_{eval_run_id[:8]}",
        amount=sc.amount,
        currency=sc.currency,
        customer_success_rate=sc.customer_success_rate,
        previous_failures=sc.previous_failures,
        previous_recovery_attempts=sc.previous_recovery_attempts,
        previous_recovery_action=sc.previous_recovery_action,
        previous_outcome=sc.previous_outcome,
        customer_engagement=sc.customer_engagement,
        time_since_failure_minutes=sc.time_since_failure_minutes,
        remaining_recovery_opportunities=sc.remaining_recovery_opportunities,
        status="OPEN",
        source="simulation",
        system=system,
        eval_run_id=eval_run_id,
    )
    db.add(case)
    db.flush()
    # allow_llm=False: no network calls inside the batch. Keeps the run fast,
    # reproducible, and free of blocking I/O inside the write transaction.
    ensure_classified(db, case, failure_code=sc.failure_code,
                      failure_message=sc.failure_message, allow_llm=False)
    return case


def run_evaluation(db: Session, dataset_size: int = 300, seed: int | None = None,
                    agent_mode: str | None = None, demo_email: str | None = None,
                    demo_email_count: int = 1) -> dict:
    # The 300-case benchmark must be byte-reproducible, so it can never make
    # network calls. Pin the engine here.
    #
    # agent_mode=None is the dangerous case, not just an explicit "ROUTED":
    # None propagates all the way down to agent.decide(), which then falls back
    # to settings.AGENT_MODE. With AGENT_MODE=ROUTED in the environment that
    # silently turned every batch run into hundreds of live LLM calls -- exactly
    # the guarantee this is supposed to protect. Default to HEURISTIC, and coerce
    # an explicit ROUTED loudly.
    if agent_mode is None:
        agent_mode = AgentMode.HEURISTIC.value
    elif agent_mode.upper() == AgentMode.ROUTED.value:
        logger.warning(
            "run_evaluation() was passed agent_mode=ROUTED; coercing to HEURISTIC. "
            "Batch evaluation must stay deterministic and offline."
        )
        agent_mode = AgentMode.HEURISTIC.value

    seed = seed if seed is not None else settings.SIMULATION_SEED
    dataset = generate_dataset(dataset_size, seed)

    eval_run_id = str(uuid.uuid4())
    run_record = EvaluationRun(
        run_id=eval_run_id,
        dataset_size=dataset_size,
        seed=seed,
        config={"agent_mode": agent_mode or settings.AGENT_MODE},
    )
    db.add(run_record)
    db.commit()  # persist the run row up front so the write lock isn't held across the whole loop
    run_record_pk = run_record.id  # keep the PK; the loop below detaches session objects

    for index, sc in enumerate(dataset):
        case_seed = _case_seed(seed, index)

        trace_case = _make_recovery_case(db, sc, "TRACE", eval_run_id)
        if demo_email and index < demo_email_count:
            # Route just this handful of TRACE cases to a real inbox instead
            # of the usual fake placeholder, so a live demo can show an
            # actual recovery email landing -- these are still ordinary
            # random synthetic cases otherwise (not hand-tuned to guarantee
            # an email-sending action fires), and only TRACE's copy gets the
            # real address so you don't get two emails for the same case.
            trace_case.customer_email = demo_email
            db.flush()
        rng_trace = random.Random(case_seed)
        run_to_completion(db, trace_case, rng_trace, agent_mode=agent_mode, auto_resolve=True)

        baseline_case = _make_recovery_case(db, sc, "BASELINE", eval_run_id)
        rng_baseline = random.Random(case_seed)
        run_baseline(db, baseline_case, rng_baseline)

        # Both cases are committed and will never be touched again. Drop them
        # from the session: each per-case commit expires every object still in
        # the identity map, so letting it grow to thousands of rows makes the
        # batch progressively slower (and is why a 300-case run appeared to
        # crawl through cases one at a time).
        db.expunge_all()

    db.commit()

    trace_metrics = compute_metrics(db, eval_run_id, "TRACE")
    baseline_metrics = compute_metrics(db, eval_run_id, "BASELINE")

    for system, metrics in (("TRACE", trace_metrics), ("BASELINE", baseline_metrics)):
        db.add(EvaluationResult(run_id=run_record_pk, system=system, metrics=metrics))
    db.commit()

    # Best-effort: fold the WAL back into the main db file so it doesn't grow
    # without bound across many runs. SQLite-only (Postgres has no WAL file to
    # checkpoint this way); never let a checkpoint hiccup fail the run.
    if _is_sqlite:
        try:
            db.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
        except Exception:
            pass

    created_at = db.query(EvaluationRun.created_at).filter(
        EvaluationRun.id == run_record_pk
    ).scalar()

    return {
        "run_id": eval_run_id,
        "dataset_size": dataset_size,
        "seed": seed,
        "created_at": created_at,
        "results": {"TRACE": trace_metrics, "BASELINE": baseline_metrics},
    }


def get_run(db: Session, run_id: str) -> dict | None:
    run_record = db.query(EvaluationRun).filter(EvaluationRun.run_id == run_id).first()
    if not run_record:
        return None
    results = {r.system: r.metrics for r in run_record.results}
    return {
        "run_id": run_record.run_id,
        "dataset_size": run_record.dataset_size,
        "seed": run_record.seed,
        "created_at": run_record.created_at,
        "results": results,
    }