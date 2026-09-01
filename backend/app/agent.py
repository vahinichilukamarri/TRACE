"""
The TRACE agent decision engine (spec sections 4, 5, 9, 11).

Two interchangeable engines behind one interface, selected by
settings.AGENT_MODE:

  HEURISTIC -- deterministic, explainable scoring engine. No network
               calls, runs instantly, fully reproducible. This is what
               batch evaluation over hundreds of cases uses by default,
               and it IS a legitimate contextual decision engine (it's
               exactly the kind of case-by-case reasoning a static
               workflow in section 16 explicitly does NOT do).

  LLM       -- real Groq API call with structured JSON output.
               Used for the live/demo path. If the call fails, we do NOT
               fall back to the heuristic engine -- per spec section 20,
               an LLM reasoning failure must surface as FLAGGED_FOR_REVIEW,
               not silently swap decision engines.

Both engines return an AgentDecisionResult with the same shape, so
everything downstream (policy, execution, audit) is engine-agnostic.
"""
import json
from dataclasses import dataclass, field

from app.enums import ActionType, DecisionType, AgentMode, FailureType
from app.config import settings

ALLOWED_ACTIONS = {a.value for a in ActionType}


@dataclass
class AgentDecisionResult:
    decision: DecisionType
    action: ActionType
    confidence: float
    reasoning: str
    agent_mode: AgentMode
    is_fallback: bool = False
    raw: dict = field(default_factory=dict)
    expected_value: float = 0.0
    intervention_cost: float = 0.0
    net_expected_value: float = 0.0


# Only these actions directly attempt to recover the payment on this turn.
# WAIT_AND_REASSESS / ESCALATE_FOR_REVIEW / STOP_RECOVERY don't recover
# anything themselves, so they never earn an expected recovery value.
DIRECT_RECOVERY_ACTIONS = {
    ActionType.RETRY_PAYMENT,
    ActionType.SEND_RECOVERY_LINK,
    ActionType.SUGGEST_ALTERNATIVE_METHOD,
}

# Rough per-action operating cost in INR (email send, gateway retry fee,
# human review time for escalation). Used to turn a raw expected recovery
# value into a *net* expected value the policy/audit layer can reason about.
INTERVENTION_COST = {
    ActionType.RETRY_PAYMENT: 0.50,
    ActionType.SEND_RECOVERY_LINK: 2.0,
    ActionType.SUGGEST_ALTERNATIVE_METHOD: 2.0,
    ActionType.WAIT_AND_REASSESS: 0.0,
    ActionType.ESCALATE_FOR_REVIEW: 150.0,
    ActionType.STOP_RECOVERY: 0.0,
}


# ---------------------------------------------------------------------
# Heuristic engine
# ---------------------------------------------------------------------

# Rough relative recovery-likelihood weights per action, keyed by failure
# type. These mirror the *shape* of the hidden outcome model's intuition
# (retry works well for transient failures, links work better for
# declines/auth) without knowing its exact numbers -- the agent is not
# supposed to see the hidden model.
_ACTION_FIT = {
    FailureType.BANK_TIMEOUT: {
        ActionType.RETRY_PAYMENT: 0.75,
        ActionType.WAIT_AND_REASSESS: 0.55,
        ActionType.SEND_RECOVERY_LINK: 0.45,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.35,
    },
    FailureType.CARD_DECLINED: {
        ActionType.SEND_RECOVERY_LINK: 0.55,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.6,
        ActionType.RETRY_PAYMENT: 0.15,
        ActionType.WAIT_AND_REASSESS: 0.25,
    },
    FailureType.INSUFFICIENT_FUNDS: {
        ActionType.WAIT_AND_REASSESS: 0.5,
        ActionType.SEND_RECOVERY_LINK: 0.4,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.45,
        ActionType.RETRY_PAYMENT: 0.15,
    },
    FailureType.AUTH_FAILURE: {
        ActionType.SEND_RECOVERY_LINK: 0.6,
        ActionType.RETRY_PAYMENT: 0.4,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.35,
        ActionType.WAIT_AND_REASSESS: 0.2,
    },
    FailureType.PROCESSING_ERROR: {
        ActionType.RETRY_PAYMENT: 0.35,
        ActionType.WAIT_AND_REASSESS: 0.35,
        ActionType.SEND_RECOVERY_LINK: 0.3,
        ActionType.SUGGEST_ALTERNATIVE_METHOD: 0.25,
    },
}

MIN_EXPECTED_VALUE = 150.0  # below this, recovery effort generally isn't justified (in INR)


def _heuristic_decide(context: dict) -> AgentDecisionResult:
    amount = context["amount"]
    failure_type = FailureType(context["failure_type"])
    success_rate = context["customer_success_rate"]
    prev_attempts = context["previous_recovery_attempts"]
    prev_action = context.get("previous_recovery_action")
    prev_outcome = context.get("previous_outcome")
    engagement = context.get("customer_engagement", "NONE")
    remaining = context["remaining_recovery_opportunities"]
    classification_confidence = context.get("classification_confidence") or 1.0

    reasons = []

    # Hard stop: no opportunities left, or classification too uncertain
    if remaining <= 0:
        return AgentDecisionResult(
            decision=DecisionType.NOT_WORTH_PURSUING,
            action=ActionType.STOP_RECOVERY,
            confidence=0.95,
            reasoning="No remaining recovery opportunities for this transaction.",
            agent_mode=AgentMode.HEURISTIC,
        )

    if classification_confidence < 0.35:
        return AgentDecisionResult(
            decision=DecisionType.NOT_WORTH_PURSUING,
            action=ActionType.ESCALATE_FOR_REVIEW,
            confidence=classification_confidence,
            reasoning="Failure classification confidence is too low to safely automate a decision.",
            agent_mode=AgentMode.HEURISTIC,
        )

    # Candidate actions for this failure type, excluding one already tried
    # in the immediately preceding attempt (avoid repeating a failed action).
    fit_table = dict(_ACTION_FIT[failure_type])
    if prev_action and prev_outcome == "FAILED":
        fit_table.pop(ActionType(prev_action), None)
        reasons.append(f"excluded {prev_action} (already tried and failed)")

    if engagement == "LINK_CLICKED":
        # customer engaged but payment still not recorded as recovered:
        # nudge toward alternative method rather than repeating the link
        fit_table[ActionType.SUGGEST_ALTERNATIVE_METHOD] = fit_table.get(
            ActionType.SUGGEST_ALTERNATIVE_METHOD, 0.3
        ) + 0.2

    if not fit_table:
        return AgentDecisionResult(
            decision=DecisionType.NOT_WORTH_PURSUING,
            action=ActionType.STOP_RECOVERY,
            confidence=0.7,
            reasoning="All reasonably-fitting actions for this failure type have already been attempted.",
            agent_mode=AgentMode.HEURISTIC,
        )

    # Score each candidate action by expected value = amount * blended probability
    # blended probability combines the action's base fit with the customer's
    # own historical success rate, discounted by repeated failed attempts.
    attempt_discount = max(0.3, 1 - 0.2 * prev_attempts)
    scored = []
    for action, base_fit in fit_table.items():
        probability = base_fit * (0.4 + 0.6 * success_rate) * attempt_discount
        probability = min(max(probability, 0.02), 0.95)
        expected_value = amount * probability
        scored.append((action, probability, expected_value))

    scored.sort(key=lambda t: t[2], reverse=True)
    best_action, best_prob, best_ev = scored[0]

    # Decide whether recovery is worth pursuing at all
    low_value_and_exhausted = best_ev < MIN_EXPECTED_VALUE and prev_attempts >= 2
    poor_history = success_rate < 0.2 and prev_attempts >= 2

    if low_value_and_exhausted or poor_history:
        return AgentDecisionResult(
            decision=DecisionType.NOT_WORTH_PURSUING,
            action=ActionType.STOP_RECOVERY,
            confidence=round(min(0.6 + (0.5 - success_rate), 0.95), 2),
            reasoning=(
                f"Expected recovery value (~₹{best_ev:.0f}) no longer justifies further automated "
                f"effort after {prev_attempts} prior attempt(s) with a {success_rate:.0%} customer "
                f"success rate."
            ),
            agent_mode=AgentMode.HEURISTIC,
        )

    # Very high value + repeated failures -> escalate rather than keep auto-acting
    if amount >= settings.HIGH_VALUE_THRESHOLD and prev_attempts >= 1 and prev_outcome == "FAILED":
        return AgentDecisionResult(
            decision=DecisionType.RECOVERY_WORTH_PURSUING,
            action=ActionType.ESCALATE_FOR_REVIEW,
            confidence=0.75,
            reasoning=(
                f"High-value transaction (₹{amount:.0f}) with a failed prior recovery attempt "
                "warrants human review rather than continued automated action."
            ),
            agent_mode=AgentMode.HEURISTIC,
        )

    confidence = round(min(0.5 + best_prob * 0.5, 0.95), 2)
    reasoning = (
        f"{failure_type.value} with {success_rate:.0%} customer success rate and "
        f"{prev_attempts} prior attempt(s); {best_action.value} has the best expected "
        f"recovery value (~₹{best_ev:.0f}) among permitted next actions"
        + (f" ({', '.join(reasons)})" if reasons else "")
        + "."
    )

    return AgentDecisionResult(
        decision=DecisionType.RECOVERY_WORTH_PURSUING,
        action=best_action,
        confidence=confidence,
        reasoning=reasoning,
        agent_mode=AgentMode.HEURISTIC,
        raw={"scored_actions": [(a.value, round(p, 3), round(ev, 2)) for a, p, ev in scored]},
    )


# ---------------------------------------------------------------------
# LLM engine
# ---------------------------------------------------------------------

_SYSTEM_PROMPT = """You are TRACE, a bounded revenue-recovery decision agent for a payments company.

Given a recovery case's context, decide:
1. Whether continued automated recovery effort is justified.
2. If yes, the single best next action from this fixed set (never invent a new one):
   RETRY_PAYMENT, SEND_RECOVERY_LINK, SUGGEST_ALTERNATIVE_METHOD, WAIT_AND_REASSESS, ESCALATE_FOR_REVIEW, STOP_RECOVERY

Rules:
- If recovery is not worth pursuing, action must be STOP_RECOVERY or ESCALATE_FOR_REVIEW.
- Do not repeat an action that was just tried and failed.
- Consider transaction value, customer payment history, failure type, prior attempts/outcomes, engagement, and remaining opportunities.
- Be conservative with high-value transactions after repeated failures -- prefer escalation over continued automation.

Respond with ONLY a JSON object, no other text:
{"decision": "RECOVERY_WORTH_PURSUING"|"NOT_WORTH_PURSUING", "action": "<one of the actions above>", "confidence": 0.0-1.0, "reasoning": "<1-3 sentences>"}
"""


def _llm_decide(context: dict) -> AgentDecisionResult | None:
    """Returns None on any failure -- caller applies the safe FLAGGED_FOR_REVIEW fallback."""
    if not settings.GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        # Bounded like the classifier: never let a slow/retrying API call stall
        # the request and hold the DB write transaction open.
        client = Groq(api_key=settings.GROQ_API_KEY, timeout=15.0, max_retries=0)
        user_prompt = "Recovery case context:\n" + json.dumps(context, indent=2)
        resp = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            max_tokens=400,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
        data = json.loads(text)

        action = data["action"]
        if action not in ALLOWED_ACTIONS:
            return None  # agent invented an action -- treat as failure, never execute it

        return AgentDecisionResult(
            decision=DecisionType(data["decision"]),
            action=ActionType(action),
            confidence=float(data["confidence"]),
            reasoning=str(data["reasoning"]),
            agent_mode=AgentMode.LLM,
            raw=data,
        )
    except Exception:
        return None


def _llm_failure_fallback() -> AgentDecisionResult:
    return AgentDecisionResult(
        decision=DecisionType.NOT_WORTH_PURSUING,
        action=ActionType.ESCALATE_FOR_REVIEW,
        confidence=0.0,
        reasoning="Agent reasoning call failed or returned an invalid response; flagged for human review rather than guessing.",
        agent_mode=AgentMode.LLM,
        is_fallback=True,
    )


# ---------------------------------------------------------------------
# Expected-value economics (engine-agnostic)
# ---------------------------------------------------------------------

def _estimate_probability(context: dict, action: ActionType) -> float:
    """Deterministic recovery-probability estimate for ANY action, using the
    exact blended-probability formula the heuristic scoring loop uses
    internally. Kept as a standalone function so "expected value" is
    reproducible and auditable regardless of whether the heuristic engine or
    the LLM produced the decision -- it is never just another model output."""
    failure_type = FailureType(context["failure_type"])
    success_rate = context.get("customer_success_rate") or 0.0
    prev_attempts = context.get("previous_recovery_attempts") or 0

    base_fit = _ACTION_FIT.get(failure_type, {}).get(action, 0.0)
    probability = (
        base_fit
        * (0.4 + 0.6 * success_rate)
        * max(0.3, 1 - 0.2 * prev_attempts)
    )
    return min(max(probability, 0.02), 0.95)


def _attach_expected_value(context: dict, result: AgentDecisionResult) -> None:
    """Populates expected_value / intervention_cost / net_expected_value on a
    decision result. Runs for every decision, whatever engine produced it."""
    cost = INTERVENTION_COST.get(result.action, 0.0)

    if result.action not in DIRECT_RECOVERY_ACTIONS:
        result.expected_value = 0.0
        result.intervention_cost = round(cost, 2)
        result.net_expected_value = round(-cost, 2)
        return

    probability = _estimate_probability(context, result.action)
    expected_value = (context.get("amount") or 0.0) * probability
    result.expected_value = round(expected_value, 2)
    result.intervention_cost = round(cost, 2)
    result.net_expected_value = round(expected_value - cost, 2)


# ---------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------

def decide(context: dict, mode: str | None = None) -> AgentDecisionResult:
    mode = (mode or settings.AGENT_MODE).upper()
    if mode == AgentMode.LLM.value:
        result = _llm_decide(context)
        if result is None:
            result = _llm_failure_fallback()
    else:
        result = _heuristic_decide(context)

    _attach_expected_value(context, result)
    return result
