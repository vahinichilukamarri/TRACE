"""
Batch evaluation harness (spec sections 16-17).

Runs the SAME batch of synthetic cases through both TRACE (contextual,
policy-controlled, reassessing agent) and the static baseline workflow,
using matched per-case randomness so differences in outcome are driven by
the *decisions* made, not by lucky/unlucky draws of the RNG.
"""
import random
import uuid

from sqlalchemy.orm import Session

from app.models import RecoveryCase, EvaluationRun, EvaluationResult
from app.simulation.generator import generate_dataset, SyntheticCase
from app.engine import ensure_classified, run_to_completion
from app.baseline import run_baseline
from app.evaluation.metrics import compute_metrics
from app.config import settings


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
    ensure_classified(db, case, failure_code=sc.failure_code, failure_message=sc.failure_message)
    return case


def run_evaluation(db: Session, dataset_size: int = 300, seed: int | None = None,
                    agent_mode: str | None = None) -> dict:
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
    db.flush()

    for index, sc in enumerate(dataset):
        case_seed = _case_seed(seed, index)

        trace_case = _make_recovery_case(db, sc, "TRACE", eval_run_id)
        rng_trace = random.Random(case_seed)
        run_to_completion(db, trace_case, rng_trace, agent_mode=agent_mode, auto_resolve=True)

        baseline_case = _make_recovery_case(db, sc, "BASELINE", eval_run_id)
        rng_baseline = random.Random(case_seed)
        run_baseline(db, baseline_case, rng_baseline)

    db.commit()

    trace_metrics = compute_metrics(db, eval_run_id, "TRACE")
    baseline_metrics = compute_metrics(db, eval_run_id, "BASELINE")

    for system, metrics in (("TRACE", trace_metrics), ("BASELINE", baseline_metrics)):
        db.add(EvaluationResult(run_id=run_record.id, system=system, metrics=metrics))
    db.commit()

    return {
        "run_id": eval_run_id,
        "dataset_size": dataset_size,
        "seed": seed,
        "created_at": run_record.created_at,
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
