"""
Policy and control layer (spec section 10).

"Agent decides. Policy controls." This module is 100% deterministic and
has zero dependency on the LLM/heuristic engine -- it would behave
identically no matter what produced the proposed action. That separation
is what makes the system's safety properties auditable independent of
the AI component.
"""
from dataclasses import dataclass, field

from app.enums import ActionType, PolicyResult
from app.config import settings


@dataclass
class PolicyCheckResult:
    result: PolicyResult
    reasons: list[str] = field(default_factory=list)
    final_action: str | None = None  # action actually cleared to execute; None if BLOCKED


def check_policy(case_context: dict, proposed_action: str, confidence: float,
                  action_history: list[str] | None = None) -> PolicyCheckResult:
    """
    case_context: RecoveryCase.to_context_dict()
    proposed_action: ActionType value string from the agent
    confidence: agent's confidence score for this decision
    action_history: list of ActionType values already executed for this case
    """
    action_history = action_history or []
    reasons: list[str] = []

    # 1. Case already recovered -> nothing more should ever execute
    if case_context["status"] == "RECOVERED":
        return PolicyCheckResult(
            result=PolicyResult.BLOCKED,
            reasons=["Case already marked RECOVERED; no further action permitted."],
        )

    if case_context["status"] in ("STOPPED", "EXPIRED"):
        return PolicyCheckResult(
            result=PolicyResult.BLOCKED,
            reasons=[f"Case status is {case_context['status']}; no further automated action permitted."],
        )

    # 2. Recovery window expired
    if case_context["time_since_failure_minutes"] > settings.RECOVERY_WINDOW_MINUTES:
        return PolicyCheckResult(
            result=PolicyResult.BLOCKED,
            reasons=[
                f"Recovery window of {settings.RECOVERY_WINDOW_MINUTES} minutes has expired "
                f"({case_context['time_since_failure_minutes']} minutes elapsed)."
            ],
            final_action=ActionType.STOP_RECOVERY.value,
        )

    # 3. Attempt-count ceiling
    if case_context["previous_recovery_attempts"] >= settings.MAX_RECOVERY_ATTEMPTS and \
            proposed_action not in (ActionType.STOP_RECOVERY.value, ActionType.ESCALATE_FOR_REVIEW.value):
        return PolicyCheckResult(
            result=PolicyResult.BLOCKED,
            reasons=[
                f"Maximum recovery attempts ({settings.MAX_RECOVERY_ATTEMPTS}) reached."
            ],
            final_action=ActionType.STOP_RECOVERY.value,
        )

    # 4. Remaining opportunities exhausted
    if case_context["remaining_recovery_opportunities"] <= 0 and \
            proposed_action not in (ActionType.STOP_RECOVERY.value, ActionType.ESCALATE_FOR_REVIEW.value):
        return PolicyCheckResult(
            result=PolicyResult.BLOCKED,
            reasons=["No remaining recovery opportunities."],
            final_action=ActionType.STOP_RECOVERY.value,
        )

    # 5. Same-action repeat ceiling (never hammer the same action indefinitely)
    same_action_count = action_history.count(proposed_action)
    if same_action_count > settings.MAX_SAME_ACTION_REPEATS and \
            proposed_action not in (ActionType.STOP_RECOVERY.value, ActionType.ESCALATE_FOR_REVIEW.value,
                                     ActionType.WAIT_AND_REASSESS.value):
        return PolicyCheckResult(
            result=PolicyResult.BLOCKED,
            reasons=[
                f"Action {proposed_action} already attempted {same_action_count} time(s); "
                f"repeat limit ({settings.MAX_SAME_ACTION_REPEATS}) exceeded."
            ],
            final_action=ActionType.ESCALATE_FOR_REVIEW.value,
        )

    # 6. Confidence floor -- low-confidence proposals get human review, not autonomy
    if confidence < settings.POLICY_MIN_CONFIDENCE and proposed_action not in (
        ActionType.STOP_RECOVERY.value, ActionType.ESCALATE_FOR_REVIEW.value
    ):
        return PolicyCheckResult(
            result=PolicyResult.FLAGGED_FOR_REVIEW,
            reasons=[
                f"Agent confidence ({confidence:.2f}) below policy minimum "
                f"({settings.POLICY_MIN_CONFIDENCE})."
            ],
            final_action=None,
        )

    # 7. Compliant escalation for high-value transactions before auto-stopping
    if proposed_action == ActionType.STOP_RECOVERY.value and \
            case_context["amount"] >= settings.HIGH_VALUE_THRESHOLD and \
            case_context["previous_recovery_attempts"] == 0:
        reasons.append(
            f"High-value transaction (>= ₹{settings.HIGH_VALUE_THRESHOLD:.0f}) stopped on first "
            "attempt requires human review before fully closing the case."
        )
        return PolicyCheckResult(
            result=PolicyResult.FLAGGED_FOR_REVIEW,
            reasons=reasons,
            final_action=None,
        )

    # 8. ESCALATE_FOR_REVIEW is always approved to proceed (it *is* the safe path)
    reasons.append("All policy checks passed.")
    return PolicyCheckResult(
        result=PolicyResult.APPROVED,
        reasons=reasons,
        final_action=proposed_action,
    )
