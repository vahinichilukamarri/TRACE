"""
Static baseline recovery workflow (spec section 16).

Deliberately dumb: one fixed mapping from failure_type to action,
executed exactly once, with no awareness of transaction value, customer
history, prior attempts, or engagement. This is the "payment fails ->
retry -> wait -> remind -> stop" pattern TRACE is meant to improve on.
"""
import random

from sqlalchemy.orm import Session

from app.models import RecoveryCase
from app.enums import FailureType, ActionType, CaseStatus
from app.execution import execute_action
from app.audit import log_event
from app.enums import AuditEventType

STATIC_MAPPING = {
    FailureType.BANK_TIMEOUT: ActionType.RETRY_PAYMENT,
    FailureType.CARD_DECLINED: ActionType.SEND_RECOVERY_LINK,
    FailureType.INSUFFICIENT_FUNDS: ActionType.WAIT_AND_REASSESS,
    FailureType.AUTH_FAILURE: ActionType.SEND_RECOVERY_LINK,
    FailureType.PROCESSING_ERROR: ActionType.RETRY_PAYMENT,
}


def run_baseline(db: Session, case: RecoveryCase, rng: random.Random) -> dict:
    """Executes the single statically-mapped action once, then stops --
    no contextual reasoning, no reassessment, no policy layer (the
    baseline has no control layer to compare against)."""
    failure_type = FailureType(case.failure_type)
    action = STATIC_MAPPING[failure_type]

    log_event(db, case.id, AuditEventType.AGENT_DECISION, payload={
        "decision": "STATIC_MAPPING", "action": action.value, "confidence": None,
        "reasoning": f"Static mapping: {failure_type.value} -> {action.value}",
    })

    execution, outcome = execute_action(db, case, action.value, rng, auto_resolve=True)
    primary_outcome = outcome

    if case.status != CaseStatus.RECOVERED.value:
        # Baseline always stops after its single action -- no reassessment.
        execute_action(db, case, ActionType.STOP_RECOVERY.value, rng, auto_resolve=True)

    db.commit()
    return {"action": action.value, "execution": execution, "outcome": primary_outcome}
