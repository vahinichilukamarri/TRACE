"""
Read-only introspection of the deterministic policy/control layer (app/policy.py).

This exists purely so the frontend's Policy & Control Center page can display
TRACE's actual guardrails instead of a hand-maintained copy that could drift
from app/config.py. No state is mutated here.
"""
from fastapi import APIRouter

from app.config import settings
from app.enums import ActionType

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
        "allowed_actions": [a.value for a in ActionType],
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
                "description": f"Time since failure exceeds the {settings.RECOVERY_WINDOW_MINUTES}-minute recovery window -> forced STOP_RECOVERY.",
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
