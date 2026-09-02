from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    RecoveryCase, AgentDecisionRecord, PolicyCheckRecord, EvaluationRun,
    EvaluationResult, ExecutionRecord,
)
from app.evaluation.metrics import compute_metrics, ACTIVE_INTERVENTION_ACTIONS
from app.enums import AgentMode

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _resolve_run_id(db: Session, eval_run_id: str | None) -> str:
    if eval_run_id:
        return eval_run_id
    # Resolve to the latest *completed* run only. EvaluationResult rows are
    # written once, at the very end of run_evaluation, so their presence is
    # the marker that a batch actually finished. Without this the dashboard
    # latches onto the run currently being written and appears to fill in one
    # case at a time (and a crashed half-run would linger forever).
    latest = (
        db.query(EvaluationRun)
        .join(EvaluationResult, EvaluationResult.run_id == EvaluationRun.id)
        .order_by(EvaluationRun.created_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(404, "No completed evaluation runs yet. POST /evaluation/run first.")
    return latest.run_id


@router.get("/overview")
def overview(eval_run_id: str | None = None, system: str = "TRACE", db: Session = Depends(get_db)):
    run_id = _resolve_run_id(db, eval_run_id)
    metrics = compute_metrics(db, run_id, system)
    return {"eval_run_id": run_id, **metrics}


@router.get("/failures")
def failure_analysis(eval_run_id: str | None = None, system: str = "TRACE", db: Session = Depends(get_db)):
    run_id = _resolve_run_id(db, eval_run_id)
    rows = (
        db.query(RecoveryCase.failure_type, func.count(RecoveryCase.id), func.sum(RecoveryCase.amount))
        .filter(RecoveryCase.eval_run_id == run_id, RecoveryCase.system == system)
        .group_by(RecoveryCase.failure_type)
        .all()
    )
    return {
        "eval_run_id": run_id,
        "by_failure_type": [
            {"failure_type": ft, "count": cnt, "revenue_at_risk": round(rev or 0, 2)}
            for ft, cnt, rev in rows
        ],
    }


@router.get("/decisions")
def decisions_breakdown(eval_run_id: str | None = None, system: str = "TRACE", db: Session = Depends(get_db)):
    run_id = _resolve_run_id(db, eval_run_id)
    case_ids = [c.id for c in db.query(RecoveryCase.id).filter(
        RecoveryCase.eval_run_id == run_id, RecoveryCase.system == system
    ).all()]
    if not case_ids:
        return {"eval_run_id": run_id, "actions_selected": [], "policy_results": [],
                "total_live_decisions": 0, "llm_routed_decisions": 0, "llm_routed_pct": 0.0,
                "total_decisions": 0, "llm_routed_decisions_in_run": 0,
                "llm_routed_pct_in_run": 0.0, "note": "No cases in this run."}

    action_rows = (
        db.query(AgentDecisionRecord.action, func.count(AgentDecisionRecord.id))
        .filter(AgentDecisionRecord.case_id.in_(case_ids))
        .group_by(AgentDecisionRecord.action)
        .all()
    )
    policy_rows = (
        db.query(PolicyCheckRecord.result, func.count(PolicyCheckRecord.id))
        .filter(PolicyCheckRecord.case_id.in_(case_ids))
        .group_by(PolicyCheckRecord.result)
        .all()
    )
    # Decision counts for the selected benchmark run. These stay force-HEURISTIC
    # by design, so their LLM share is structurally zero -- kept under their own
    # keys rather than reported as "the AI never runs".
    total_decisions = (
        db.query(func.count(AgentDecisionRecord.id))
        .filter(AgentDecisionRecord.case_id.in_(case_ids))
        .scalar()
    ) or 0
    llm_routed_in_run = (
        db.query(func.count(AgentDecisionRecord.id))
        .filter(AgentDecisionRecord.case_id.in_(case_ids),
                AgentDecisionRecord.agent_mode == AgentMode.LLM.value)
        .scalar()
    ) or 0

    # The headline routing stat is scoped to LIVE cases (no eval_run_id): that is
    # the only population where ROUTED mode actually dispatches, so it is the only
    # honest answer to "what share of decisions needed AI reasoning?".
    live_case_ids = [
        c.id for c in db.query(RecoveryCase.id).filter(
            RecoveryCase.eval_run_id.is_(None)
        ).all()
    ]
    if live_case_ids:
        total_live = (
            db.query(func.count(AgentDecisionRecord.id))
            .filter(AgentDecisionRecord.case_id.in_(live_case_ids))
            .scalar()
        ) or 0
        llm_routed_live = (
            db.query(func.count(AgentDecisionRecord.id))
            .filter(AgentDecisionRecord.case_id.in_(live_case_ids),
                    AgentDecisionRecord.agent_mode == AgentMode.LLM.value)
            .scalar()
        ) or 0
    else:
        total_live, llm_routed_live = 0, 0

    return {
        "eval_run_id": run_id,
        "actions_selected": [{"action": a, "count": c} for a, c in action_rows],
        "policy_results": [{"result": r, "count": c} for r, c in policy_rows],
        # Live-scoped routing stat (the headline).
        "total_live_decisions": total_live,
        "llm_routed_decisions": llm_routed_live,
        "llm_routed_pct": round(llm_routed_live / total_live, 4) if total_live else 0.0,
        # Benchmark-run totals, kept separate.
        "total_decisions": total_decisions,
        "llm_routed_decisions_in_run": llm_routed_in_run,
        "llm_routed_pct_in_run": (
            round(llm_routed_in_run / total_decisions, 4) if total_decisions else 0.0
        ),
        "note": (
            "llm_routed_* is measured over live ingested cases only. Benchmark "
            "evaluation runs are forced to the deterministic HEURISTIC engine by "
            "design, so they are reproducible and make no network calls -- their "
            "LLM share is structurally zero, not evidence that routing is idle."
        ),
    }


@router.get("/comparison")
def baseline_comparison(eval_run_id: str | None = None, db: Session = Depends(get_db)):
    run_id = _resolve_run_id(db, eval_run_id)
    trace_metrics = compute_metrics(db, run_id, "TRACE")
    baseline_metrics = compute_metrics(db, run_id, "BASELINE")
    return {"eval_run_id": run_id, "TRACE": trace_metrics, "BASELINE": baseline_metrics}


@router.get("/frontier")
def recovery_frontier(eval_run_id: str | None = None, db: Session = Depends(get_db)):
    """Recovery-efficiency frontier: for each system, walk its cases in
    descending order of value density (revenue recovered per active
    intervention) and accumulate a cumulative (interventions, revenue)
    curve. A curve that climbs faster per intervention is spending effort
    more intelligently, not just spending more of it."""
    run_id = _resolve_run_id(db, eval_run_id)
    out: dict = {"eval_run_id": run_id}

    for system in ("TRACE", "BASELINE"):
        cases = (
            db.query(RecoveryCase)
            .filter(RecoveryCase.eval_run_id == run_id, RecoveryCase.system == system)
            .all()
        )
        case_ids = [c.id for c in cases]
        executions = (
            db.query(ExecutionRecord).filter(ExecutionRecord.case_id.in_(case_ids)).all()
            if case_ids else []
        )

        interventions_by_case: dict[int, int] = {}
        for e in executions:
            if e.action in ACTIVE_INTERVENTION_ACTIONS:
                interventions_by_case[e.case_id] = interventions_by_case.get(e.case_id, 0) + 1

        rows = []
        for c in cases:
            n_interventions = interventions_by_case.get(c.id, 0)
            if n_interventions == 0:
                continue
            revenue = (c.revenue_recovered or 0.0) if c.status == "RECOVERED" else 0.0
            rows.append((n_interventions, revenue))

        rows.sort(key=lambda r: r[1] / r[0], reverse=True)

        points = [{"interventions": 0, "revenue_recovered": 0.0}]
        cum_interventions = 0
        cum_revenue = 0.0
        for n_interventions, revenue in rows:
            cum_interventions += n_interventions
            cum_revenue += revenue
            points.append({
                "interventions": cum_interventions,
                "revenue_recovered": round(cum_revenue, 2),
            })
        out[system] = points

    return out
