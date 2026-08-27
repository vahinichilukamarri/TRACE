from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import RecoveryCase, AgentDecisionRecord, PolicyCheckRecord, EvaluationRun
from app.evaluation.metrics import compute_metrics

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _resolve_run_id(db: Session, eval_run_id: str | None) -> str:
    if eval_run_id:
        return eval_run_id
    latest = db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).first()
    if not latest:
        raise HTTPException(404, "No evaluation runs exist yet. POST /evaluation/run first.")
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
        return {"eval_run_id": run_id, "actions_selected": [], "policy_results": []}

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
    return {
        "eval_run_id": run_id,
        "actions_selected": [{"action": a, "count": c} for a, c in action_rows],
        "policy_results": [{"result": r, "count": c} for r, c in policy_rows],
    }


@router.get("/comparison")
def baseline_comparison(eval_run_id: str | None = None, db: Session = Depends(get_db)):
    run_id = _resolve_run_id(db, eval_run_id)
    trace_metrics = compute_metrics(db, run_id, "TRACE")
    baseline_metrics = compute_metrics(db, run_id, "BASELINE")
    return {"eval_run_id": run_id, "TRACE": trace_metrics, "BASELINE": baseline_metrics}
