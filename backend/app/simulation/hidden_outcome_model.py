"""
Hidden outcome model (spec section 15).

THIS MODULE MUST NEVER BE IMPORTED BY app/agent.py OR app/policy.py.
It is the "ground truth" used only by the simulation/evaluation harness
to decide, after the fact, whether a given (context, action) pair would
have recovered the payment. The agent only ever sees case context, never
these probabilities -- that separation is what makes batch evaluation a
fair test rather than the agent grading its own homework.
"""
import random

from app.enums import FailureType, ActionType
from app.config import settings

# Ground-truth base recovery probability per (failure_type, action).
# Deliberately NOT identical to the agent's heuristic fit table in
# app/agent.py, though it rhymes with it -- a good agent should learn
# reasonable priors, not have the answer key memorized.
_GROUND_TRUTH = {
    FailureType.BANK_TIMEOUT: {
        ActionType.RETRY_PAYMENT: 0.68,
        ActionType.WAIT_AND_REASSESS: 0.42,
        ActionType.SEND_RECOVERY_LINK: 0.38,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.30,
    },
    FailureType.CARD_DECLINED: {
        ActionType.SEND_RECOVERY_LINK: 0.46,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.52,
        ActionType.RETRY_PAYMENT: 0.10,
        ActionType.WAIT_AND_REASSESS: 0.18,
    },
    FailureType.INSUFFICIENT_FUNDS: {
        ActionType.WAIT_AND_REASSESS: 0.44,
        ActionType.SEND_RECOVERY_LINK: 0.33,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.37,
        ActionType.RETRY_PAYMENT: 0.12,
    },
    FailureType.AUTH_FAILURE: {
        ActionType.SEND_RECOVERY_LINK: 0.50,
        ActionType.RETRY_PAYMENT: 0.33,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.28,
        ActionType.WAIT_AND_REASSESS: 0.15,
    },
    FailureType.PROCESSING_ERROR: {
        ActionType.RETRY_PAYMENT: 0.30,
        ActionType.WAIT_AND_REASSESS: 0.28,
        ActionType.SEND_RECOVERY_LINK: 0.24,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.20,
    },
}

# Actions that never move a payment (no probability of recovery)
_NO_RECOVERY_ACTIONS = {ActionType.ESCALATE_FOR_REVIEW, ActionType.STOP_RECOVERY}


def resolve(context: dict, action: str, rng: random.Random) -> tuple[bool, float]:
    """
    Returns (recovered: bool, effective_probability: float).
    `rng` must be a seeded random.Random instance owned by the caller so
    batch runs are reproducible.
    """
    action_enum = ActionType(action)
    if action_enum in _NO_RECOVERY_ACTIONS:
        return False, 0.0

    failure_type = FailureType(context["failure_type"])

    # Domain rule, enforced as ground truth.
    #
    # NPCI mandates auto-reversal of most failed UPI transactions within
    # ~RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT. Once that window has passed the
    # money is already back with the customer, so there is simply nothing left
    # to recover -- no action, by any system, can succeed.
    #
    # app/policy.py already stops TRACE from spending effort here. Without the
    # same rule in the ground truth the simulator contradicted its own premise:
    # it handed the policy-free baseline "recoveries" on transactions the domain
    # says were already reversed. Threshold is read from config so the rule and
    # the guardrail can never drift apart.
    if failure_type == FailureType.BANK_TIMEOUT:
        age_minutes = context.get("time_since_failure_minutes") or 0
        if age_minutes > settings.RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT:
            return False, 0.0

    base_prob = _GROUND_TRUTH[failure_type].get(action_enum, 0.1)

    success_rate = context.get("customer_success_rate", 0.5)
    prev_attempts = context.get("previous_recovery_attempts", 0)
    engagement = context.get("customer_engagement", "NONE")
    amount = context.get("amount", 1000)

    # Customer history influence
    prob = base_prob * (0.5 + 0.5 * success_rate)

    # Fatigue: each prior failed attempt erodes willingness to complete
    prob *= max(0.35, 1 - 0.15 * prev_attempts)

    # Engagement boost for link-based actions
    if action_enum in (ActionType.SEND_RECOVERY_LINK, ActionType.SUGGEST_ALTERNATIVE_METHOD):
        if engagement == "LINK_CLICKED":
            prob *= 1.35
        elif engagement == "LINK_OPENED":
            prob *= 1.1

    # Very high amounts see mild additional drop-off (friction/hesitation)
    if amount > 75000:
        prob *= 0.9

    prob = min(max(prob, 0.01), 0.97)
    recovered = rng.random() < prob
    return recovered, prob
