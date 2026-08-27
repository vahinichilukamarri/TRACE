"""
Orchestrates one full TRACE loop iteration (spec section 5):

    OBSERVE -> UNDERSTAND CONTEXT -> EVALUATE -> DECIDE -> POLICY CHECK ->
    EXECUTE -> OBSERVE OUTCOME -> REASSESS -> CONTINUE / ADAPT / STOP

This module is shared by the live API routes (app/routers/cases.py) and
the batch evaluation harness (app/evaluation/runner.py) so both paths run
through *exactly* the same agent + policy + execution logic -- the only
difference is auto_resolve (batch mode resolves outcomes immediately
instead of waiting for a real customer click) and how many iterations are
driven in a row.
"""
import random

from sqlalchemy.orm import Session

from app.models import RecoveryCase, AgentDecisionRecord, PolicyCheckRecord
from app.enums import ActionType, PolicyResult, CaseStatus, AuditEventType, DecisionType
from app.classification import classify_failure
from app.agent import decide as agent_decide
from app.policy import check_policy
from app.execution import execute_action
from app.audit import log_event
from app.config import settings

TERMINAL_STATUSES = {CaseStatus.RECOVERED.value, CaseStatus.STOPPED.value,
                      CaseStatus.ESCALATED.value, CaseStatus.EXPIRED.value}


def ensure_classified(db: Session, case: RecoveryCase, failure_code: str | None = None,
                       failure_message: str | None = None) -> None:
    if case.failure_type:
        return  # already classified
    result = classify_failure(failure_code, failure_message)
    case.failure_type = result.failure_type.value
    case.classification_confidence = result.confidence
    case.classification_method = result.method.value
    case.failure_raw_message = result.raw_message
    db.flush()
    log_event(db, case.id, AuditEventType.CLASSIFIED, payload={
        "failure_type": case.failure_type,
        "confidence": case.classification_confidence,
        "method": case.classification_method,
    })


def _action_history(db: Session, case: RecoveryCase) -> list[str]:
    from app.models import ExecutionRecord
    rows = db.query(ExecutionRecord.action).filter(ExecutionRecord.case_id == case.id).all()
    return [r[0] for r in rows]


def run_iteration(db: Session, case: RecoveryCase, rng: random.Random, agent_mode: str | None = None,
                   auto_resolve: bool = False, iteration: int = 0) -> dict:
    """Runs exactly one DECIDE -> POLICY -> EXECUTE step. Returns a dict of
    the records produced. Assumes classification has already happened."""

    context = case.to_context_dict()
    decision_result = agent_decide(context, mode=agent_mode)

    decision_record = AgentDecisionRecord(
        case_id=case.id,
        decision=decision_result.decision.value,
        action=decision_result.action.value,
        confidence=decision_result.confidence,
        reasoning=decision_result.reasoning,
        agent_mode=decision_result.agent_mode.value,
        is_fallback=decision_result.is_fallback,
        iteration=iteration,
    )
    db.add(decision_record)
    db.flush()
    log_event(db, case.id, AuditEventType.AGENT_DECISION, payload={
        "decision": decision_record.decision,
        "action": decision_record.action,
        "confidence": decision_record.confidence,
        "reasoning": decision_record.reasoning,
        "agent_mode": decision_record.agent_mode,
        "is_fallback": decision_record.is_fallback,
        "iteration": iteration,
    })
    if decision_result.is_fallback:
        log_event(db, case.id, AuditEventType.AGENT_FALLBACK,
                   notes="LLM reasoning call failed; safe fallback (FLAGGED_FOR_REVIEW) applied.")

    history = _action_history(db, case)
    policy_result = check_policy(context, decision_record.action, decision_record.confidence, history)

    policy_record = PolicyCheckRecord(
        case_id=case.id,
        decision_id=decision_record.id,
        proposed_action=decision_record.action,
        result=policy_result.result.value,
        reasons=policy_result.reasons,
        final_action=policy_result.final_action,
    )
    db.add(policy_record)
    db.flush()
    log_event(db, case.id, AuditEventType.POLICY_CHECK, payload={
        "proposed_action": policy_record.proposed_action,
        "result": policy_record.result,
        "reasons": policy_record.reasons,
        "final_action": policy_record.final_action,
    })

    execution_record, outcome_record = None, None

    if policy_result.result == PolicyResult.BLOCKED:
        # Blocked proposals either force a safe terminal action (final_action set)
        # or simply halt this iteration with no execution.
        if policy_result.final_action:
            execution_record, outcome_record = execute_action(
                db, case, policy_result.final_action, rng, auto_resolve=auto_resolve
            )
    elif policy_result.result == PolicyResult.FLAGGED_FOR_REVIEW:
        # Route to human review rather than auto-executing an uncertain/high-stakes action.
        execution_record, outcome_record = execute_action(
            db, case, ActionType.ESCALATE_FOR_REVIEW.value, rng, auto_resolve=auto_resolve
        )
    else:  # APPROVED
        execution_record, outcome_record = execute_action(
            db, case, policy_result.final_action, rng, auto_resolve=auto_resolve
        )

    return {
        "decision": decision_record,
        "policy": policy_record,
        "execution": execution_record,
        "outcome": outcome_record,
    }


def run_to_completion(db: Session, case: RecoveryCase, rng: random.Random, agent_mode: str | None = None,
                       auto_resolve: bool = True, max_iterations: int | None = None) -> list[dict]:
    """Drives the bounded reassessment loop (spec section 11) until the case
    reaches a terminal status or the iteration/attempt bounds are hit. Used
    by batch evaluation; the live API instead calls run_iteration once per
    HTTP request and lets reassessment be triggered explicitly."""
    max_iterations = max_iterations or settings.MAX_REASSESSMENT_ITERATIONS
    results = []

    for iteration in range(max_iterations):
        if case.status in TERMINAL_STATUSES:
            break

        step = run_iteration(db, case, rng, agent_mode=agent_mode, auto_resolve=auto_resolve, iteration=iteration)
        results.append(step)

        if case.status in TERMINAL_STATUSES:
            break

        outcome = step["outcome"]
        action = step["execution"].action if step["execution"] else None

        if outcome and outcome.outcome == "RECOVERED":
            break  # case.status already set to RECOVERED inside execute_action

        # Not recovered and case still open -> advance state for the next
        # reassessment pass, then loop (bounded by max_iterations above).
        if action == ActionType.WAIT_AND_REASSESS.value:
            case.time_since_failure_minutes += rng.randint(60, 180)
        elif action in (ActionType.RETRY_PAYMENT.value, ActionType.SEND_RECOVERY_LINK.value,
                        ActionType.SUGGEST_ALTERNATIVE_METHOD.value):
            case.previous_recovery_attempts += 1
            case.previous_recovery_action = action
            case.previous_outcome = "FAILED"
            case.remaining_recovery_opportunities = max(0, case.remaining_recovery_opportunities - 1)
            case.time_since_failure_minutes += rng.randint(15, 60)
        db.flush()

        log_event(db, case.id, AuditEventType.REASSESSMENT, payload={
            "iteration": iteration + 1,
            "case_state": case.to_context_dict(),
        })
    else:
        # Loop exhausted without reaching a terminal state -- force-stop rather
        # than allow an unbounded autonomous loop (spec section 11).
        if case.status not in TERMINAL_STATUSES:
            forced = execute_action(db, case, ActionType.STOP_RECOVERY.value, rng, auto_resolve=auto_resolve)
            log_event(db, case.id, AuditEventType.STATUS_CHANGE,
                      notes="Reassessment iteration bound reached; forced STOP_RECOVERY.")
            results.append({"decision": None, "policy": None, "execution": forced[0], "outcome": forced[1]})

    db.commit()
    return results
