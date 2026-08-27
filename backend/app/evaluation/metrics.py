"""
Aggregate metrics computation (spec section 17). Computed purely from
persisted DB rows -- no metric here is fabricated or hand-tuned; if the
simulation behaves badly, the numbers will show it.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import RecoveryCase, ExecutionRecord, PolicyCheckRecord

ACTIVE_INTERVENTION_ACTIONS = {"RETRY_PAYMENT", "SEND_RECOVERY_LINK", "SUGGEST_ALTERNATIVE_METHOD"}


def compute_metrics(db: Session, eval_run_id: str, system: str) -> dict:
    cases = db.query(RecoveryCase).filter(
        RecoveryCase.eval_run_id == eval_run_id, RecoveryCase.system == system
    ).all()
    case_ids = [c.id for c in cases]

    total_failed_payments = len(cases)
    revenue_at_risk = round(sum(c.amount for c in cases), 2)

    recovered_cases = [c for c in cases if c.status == "RECOVERED"]
    transactions_recovered = len(recovered_cases)
    revenue_recovered = round(sum((c.revenue_recovered or 0) for c in recovered_cases), 2)
    recovery_rate = round(transactions_recovered / total_failed_payments, 4) if total_failed_payments else 0.0

    stopped = sum(1 for c in cases if c.status == "STOPPED")
    escalated = sum(1 for c in cases if c.status == "ESCALATED")

    if case_ids:
        executions = db.query(ExecutionRecord).filter(ExecutionRecord.case_id.in_(case_ids)).all()
    else:
        executions = []

    recovery_attempts = sum(1 for e in executions if e.action in ACTIVE_INTERVENTION_ACTIONS)

    # Wasted effort: active interventions executed on cases that did not end up recovered.
    recovered_case_ids = {c.id for c in recovered_cases}
    unnecessary_interventions = sum(
        1 for e in executions
        if e.action in ACTIVE_INTERVENTION_ACTIONS and e.case_id not in recovered_case_ids
    )

    # Interventions avoided: cases where the very first decision was to not
    # actively intervene at all (STOP_RECOVERY / ESCALATE_FOR_REVIEW with zero
    # prior attempts) -- effort that a static baseline would have spent anyway.
    interventions_avoided = sum(
        1 for c in cases
        if c.previous_recovery_attempts == 0 and c.status in ("STOPPED", "ESCALATED")
        and not any(e.case_id == c.id and e.action in ACTIVE_INTERVENTION_ACTIONS for e in executions)
    )

    if case_ids:
        policy_blocked = db.query(PolicyCheckRecord).filter(
            PolicyCheckRecord.case_id.in_(case_ids), PolicyCheckRecord.result == "BLOCKED"
        ).count()
    else:
        policy_blocked = 0

    recovery_value_per_intervention = (
        round(revenue_recovered / recovery_attempts, 2) if recovery_attempts else 0.0
    )

    return {
        "system": system,
        "total_failed_payments": total_failed_payments,
        "revenue_at_risk": revenue_at_risk,
        "recovery_attempts": recovery_attempts,
        "transactions_recovered": transactions_recovered,
        "revenue_recovered": revenue_recovered,
        "revenue_recovered_is_simulated": True,
        "recovery_rate": recovery_rate,
        "unnecessary_interventions": unnecessary_interventions,
        "interventions_avoided": interventions_avoided,
        "cases_stopped": stopped,
        "cases_escalated": escalated,
        "policy_blocked_actions": policy_blocked,
        "recovery_value_per_intervention": recovery_value_per_intervention,
    }
