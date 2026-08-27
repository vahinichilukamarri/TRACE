"""
Execution layer (spec section 13).

Real: email delivery, link click-through, system event logging.
Simulated: payment completion / failure, recovered revenue -- explicitly
labeled as such everywhere it surfaces (models, schemas, dashboard).

`execute_action` handles the REAL/system side effect for an approved
action. Where the action *can* immediately resolve a payment outcome
(RETRY_PAYMENT, or link-based actions when auto_resolve=True -- used by
the batch simulation harness so 300 cases don't wait on human clicks),
it also computes and persists the OutcomeRecord using the hidden outcome
model. Otherwise the outcome is left PENDING until a later event (a real
customer click via the /click endpoint, or the next reassessment tick).
"""
import random

from sqlalchemy.orm import Session

from app.models import RecoveryCase, ExecutionRecord, OutcomeRecord
from app.enums import ActionType, ExecutionType, OutcomeType, CaseStatus, CustomerEngagement, AuditEventType
from app.email_service import send_recovery_email
from app.audit import log_event
from app.simulation import hidden_outcome_model


def _record_outcome(db: Session, case: RecoveryCase, execution: ExecutionRecord,
                     recovered: bool, probability: float) -> OutcomeRecord:
    revenue = case.amount if recovered else None
    outcome = OutcomeRecord(
        case_id=case.id,
        execution_id=execution.id,
        outcome=OutcomeType.RECOVERED.value if recovered else OutcomeType.NOT_RECOVERED.value,
        simulated=True,
        revenue_recovered=revenue,
    )
    db.add(outcome)
    db.flush()

    log_event(db, case.id, AuditEventType.OUTCOME, payload={
        "outcome": outcome.outcome,
        "simulated": True,
        "probability_used": round(probability, 4),
        "revenue_recovered": revenue,
    })

    if recovered:
        case.status = CaseStatus.RECOVERED.value
        case.revenue_recovered = revenue
        case.revenue_recovered_simulated = True
        log_event(db, case.id, AuditEventType.STATUS_CHANGE, payload={"new_status": "RECOVERED"})
    else:
        case.previous_outcome = "FAILED"

    db.flush()
    return outcome


def execute_action(db: Session, case: RecoveryCase, action: str, rng: random.Random,
                    auto_resolve: bool = False, customer_email: str | None = None) -> tuple[ExecutionRecord, OutcomeRecord | None]:
    action_enum = ActionType(action)
    customer_email = customer_email or f"customer+{case.payment_id}@example.com"

    if action_enum == ActionType.RETRY_PAYMENT:
        execution = ExecutionRecord(
            case_id=case.id, action=action, execution_type=ExecutionType.SIMULATED.value,
            status="EXECUTED", details={"note": "Simulated payment retry (no real payment gateway in MVP)."},
        )
        db.add(execution)
        db.flush()
        log_event(db, case.id, AuditEventType.EXECUTION, payload={"action": action, "execution_type": "SIMULATED"})

        recovered, prob = hidden_outcome_model.resolve(case.to_context_dict(), action, rng)
        outcome = _record_outcome(db, case, execution, recovered, prob)
        return execution, outcome

    if action_enum in (ActionType.SEND_RECOVERY_LINK, ActionType.SUGGEST_ALTERNATIVE_METHOD):
        kind = "alternative_method" if action_enum == ActionType.SUGGEST_ALTERNATIVE_METHOD else "recovery_link"
        email_result = send_recovery_email(customer_email, case.payment_id, case.amount, kind=kind)
        execution = ExecutionRecord(
            case_id=case.id, action=action,
            execution_type=ExecutionType.REAL.value if email_result["delivery"] == "REAL" else ExecutionType.SIMULATED.value,
            status=email_result["delivery"],
            details=email_result,
        )
        db.add(execution)
        db.flush()
        log_event(db, case.id, AuditEventType.EXECUTION, payload={
            "action": action, "execution_type": execution.execution_type, "delivery": email_result["delivery"],
        })

        case.customer_engagement = CustomerEngagement.LINK_SENT.value
        db.flush()

        if not auto_resolve:
            # Live/demo path: leave PENDING for a real (or manually-simulated) click event.
            outcome = OutcomeRecord(
                case_id=case.id, execution_id=execution.id,
                outcome=OutcomeType.PENDING.value, simulated=True, revenue_recovered=None,
            )
            db.add(outcome)
            db.flush()
            return execution, outcome

        # Batch simulation path: immediately simulate engagement + payment completion.
        engaged = rng.random() < (0.55 * (0.4 + 0.6 * case.customer_success_rate))
        case.customer_engagement = (
            CustomerEngagement.LINK_CLICKED.value if engaged else CustomerEngagement.LINK_SENT.value
        )
        db.flush()
        recovered, prob = hidden_outcome_model.resolve(case.to_context_dict(), action, rng)
        recovered = recovered and engaged  # can't complete payment without engaging first
        outcome = _record_outcome(db, case, execution, recovered, prob if engaged else 0.0)
        return execution, outcome

    if action_enum == ActionType.WAIT_AND_REASSESS:
        execution = ExecutionRecord(
            case_id=case.id, action=action, execution_type=ExecutionType.SIMULATED.value,
            status="SCHEDULED", details={"note": "No immediate action; case queued for reassessment."},
        )
        db.add(execution)
        db.flush()
        log_event(db, case.id, AuditEventType.EXECUTION, payload={"action": action, "execution_type": "SIMULATED"})
        outcome = OutcomeRecord(
            case_id=case.id, execution_id=execution.id,
            outcome=OutcomeType.PENDING.value, simulated=True, revenue_recovered=None,
        )
        db.add(outcome)
        db.flush()
        return execution, outcome

    if action_enum == ActionType.ESCALATE_FOR_REVIEW:
        execution = ExecutionRecord(
            case_id=case.id, action=action, execution_type=ExecutionType.SIMULATED.value,
            status="EXECUTED", details={"note": "Case flagged and routed to human review queue."},
        )
        db.add(execution)
        db.flush()
        case.status = CaseStatus.ESCALATED.value
        log_event(db, case.id, AuditEventType.EXECUTION, payload={"action": action, "execution_type": "SIMULATED"})
        log_event(db, case.id, AuditEventType.STATUS_CHANGE, payload={"new_status": "ESCALATED"})
        outcome = OutcomeRecord(
            case_id=case.id, execution_id=execution.id,
            outcome=OutcomeType.NOT_APPLICABLE.value, simulated=True, revenue_recovered=None,
        )
        db.add(outcome)
        db.flush()
        return execution, outcome

    if action_enum == ActionType.STOP_RECOVERY:
        execution = ExecutionRecord(
            case_id=case.id, action=action, execution_type=ExecutionType.SIMULATED.value,
            status="EXECUTED", details={"note": "Automated recovery effort stopped for this case."},
        )
        db.add(execution)
        db.flush()
        case.status = CaseStatus.STOPPED.value
        log_event(db, case.id, AuditEventType.EXECUTION, payload={"action": action, "execution_type": "SIMULATED"})
        log_event(db, case.id, AuditEventType.STATUS_CHANGE, payload={"new_status": "STOPPED"})
        outcome = OutcomeRecord(
            case_id=case.id, execution_id=execution.id,
            outcome=OutcomeType.NOT_APPLICABLE.value, simulated=True, revenue_recovered=None,
        )
        db.add(outcome)
        db.flush()
        return execution, outcome

    raise ValueError(f"Unknown action: {action}")


def resolve_after_click(db: Session, case: RecoveryCase, rng: random.Random) -> OutcomeRecord | None:
    """Called when a real customer click event arrives for a case whose
    last execution (SEND_RECOVERY_LINK / SUGGEST_ALTERNATIVE_METHOD) is
    still PENDING. Resolves the simulated payment-completion outcome now
    that we know the customer engaged."""
    last_execution = (
        db.query(ExecutionRecord)
        .filter(ExecutionRecord.case_id == case.id,
                ExecutionRecord.action.in_([ActionType.SEND_RECOVERY_LINK.value,
                                             ActionType.SUGGEST_ALTERNATIVE_METHOD.value]))
        .order_by(ExecutionRecord.id.desc())
        .first()
    )
    if not last_execution:
        return None

    case.customer_engagement = CustomerEngagement.LINK_CLICKED.value
    db.flush()
    log_event(db, case.id, AuditEventType.CUSTOMER_ENGAGEMENT, payload={"engagement": "LINK_CLICKED"})

    recovered, prob = hidden_outcome_model.resolve(case.to_context_dict(), last_execution.action, rng)
    return _record_outcome(db, case, last_execution, recovered, prob)
