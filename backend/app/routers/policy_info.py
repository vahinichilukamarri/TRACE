"""
Read-only introspection of the deterministic policy/control layer (app/policy.py).

This exists purely so the frontend's Policy & Control Center page can display
TRACE's actual guardrails instead of a hand-maintained copy that could drift
from app/config.py. No state is mutated here.
"""
from fastapi import APIRouter

from app.config import settings
from app.enums import ActionType
from app.policy import RECOVERY_WINDOW_BY_FAILURE_TYPE
from app.agent import INTERVENTION_COST, DIRECT_RECOVERY_ACTIONS

router = APIRouter(prefix="/policy", tags=["policy"])


@router.get("/config")
def get_policy_config():
    return {
        "max_recovery_attempts": settings.MAX_RECOVERY_ATTEMPTS,
        "recovery_window_minutes": settings.RECOVERY_WINDOW_MINUTES,
        "max_same_action_repeats": settings.MAX_SAME_ACTION_REPEATS,
        "high_value_threshold": settings.HIGH_VALUE_THRESHOLD,
        "policy_min_confidence": settings.POLICY_MIN_CONFIDENCE,
        "agent_min_confidence": settings.AGENT_MIN_CONFIDENCE,
        "max_reassessment_iterations": settings.MAX_REASSESSMENT_ITERATIONS,
        "agent_mode": settings.AGENT_MODE,
        "llm_routing": {
            "min_classification_confidence": settings.LLM_ROUTE_MIN_CLASSIFICATION_CONFIDENCE,
            "ev_margin_pct": settings.LLM_ROUTE_EV_MARGIN_PCT,
            "high_value_min_attempts": settings.LLM_ROUTE_HIGH_VALUE_MIN_ATTEMPTS,
            "high_value_threshold": settings.HIGH_VALUE_THRESHOLD,
            "active": settings.AGENT_MODE.upper() == "ROUTED",
            "llm_available": bool(settings.GROQ_API_KEY),
            "note": (
                "In ROUTED mode the deterministic heuristic runs on every case and the "
                "LLM is called only when the heuristic is not trustworthy on its own: an "
                "uncertain failure classification, a top-two expected-value gap inside the "
                "margin, or a high-value transaction that has already failed a recovery "
                "attempt. Every decision records which engine ran and why, in route_reason."
            ),
        },
        "email_delivery": {
            # Boolean only -- host, user, password and the API key are never
            # returned. This exists so the UI can stop promising a real send
            # when the server has no SMTP configured to make one.
            "smtp_configured": bool(
                settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD
            ),
            "note": (
                "A real email is sent only when SMTP is configured AND the case carries "
                "an explicitly-set customer_email. Otherwise TRACE still renders the full "
                "email and records delivery as SIMULATED. Batch evaluation cases never "
                "carry an address, so a run never sends mail."
            ),
        },
        "allowed_actions": [a.value for a in ActionType],
        "recovery_window_overrides": {
            "by_failure_type": RECOVERY_WINDOW_BY_FAILURE_TYPE,
            "note": (
                "NPCI mandates auto-reversal of most failed UPI transactions within ~60 minutes. "
                "BANK_TIMEOUT is TRACE's proxy for a bank / UPI-rail failure, so once that window "
                "passes the money has already been reversed to the customer and continued automated "
                "recovery is moot. All other failure types have no equivalent regulatory "
                f"auto-reversal and keep the default {settings.RECOVERY_WINDOW_MINUTES}-minute window."
            ),
        },
        "intervention_costs": {
            "by_action": {action.value: cost for action, cost in INTERVENTION_COST.items()},
            "direct_recovery_actions": [a.value for a in DIRECT_RECOVERY_ACTIONS],
            "note": (
                "Only direct-recovery actions (retry payment, send recovery link, suggest "
                "alternative method) actually attempt to complete the payment on this turn, so "
                "only they earn an expected recovery value. WAIT_AND_REASSESS / ESCALATE_FOR_REVIEW "
                "/ STOP_RECOVERY carry their cost with no offsetting expected value."
            ),
        },
        "rules": [
            {
                "id": "already_recovered",
                "description": "Case already marked RECOVERED -> no further action permitted.",
                "result": "BLOCKED",
            },
            {
                "id": "already_terminal",
                "description": "Case is STOPPED or EXPIRED -> no further automated action permitted.",
                "result": "BLOCKED",
            },
            {
                "id": "recovery_window_expired",
                "description": (
                    f"Time since failure exceeds the recovery window "
                    f"({settings.RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT} minutes for BANK_TIMEOUT, "
                    f"{settings.RECOVERY_WINDOW_MINUTES} minutes for all other failure types) "
                    f"-> forced STOP_RECOVERY."
                ),
                "result": "BLOCKED",
            },
            {
                "id": "max_attempts_reached",
                "description": f"Previous recovery attempts >= {settings.MAX_RECOVERY_ATTEMPTS} -> forced STOP_RECOVERY.",
                "result": "BLOCKED",
            },
            {
                "id": "no_opportunities_left",
                "description": "Remaining recovery opportunities <= 0 -> forced STOP_RECOVERY.",
                "result": "BLOCKED",
            },
            {
                "id": "same_action_repeat_limit",
                "description": f"Same action already attempted more than {settings.MAX_SAME_ACTION_REPEATS} time(s) -> ESCALATE_FOR_REVIEW.",
                "result": "BLOCKED",
            },
            {
                "id": "confidence_floor",
                "description": f"Agent confidence below {settings.POLICY_MIN_CONFIDENCE} -> FLAGGED_FOR_REVIEW instead of auto-executing.",
                "result": "FLAGGED_FOR_REVIEW",
            },
            {
                "id": "high_value_first_stop",
                "description": f"High-value transaction (>= ₹{settings.HIGH_VALUE_THRESHOLD:.0f}) proposed for STOP_RECOVERY on the first attempt -> FLAGGED_FOR_REVIEW.",
                "result": "FLAGGED_FOR_REVIEW",
            },
            {
                "id": "all_checks_passed",
                "description": "All checks passed -> APPROVED.",
                "result": "APPROVED",
            },
        ],
    }
