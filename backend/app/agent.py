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
import logging
from dataclasses import dataclass, field

from app.enums import ActionType, DecisionType, AgentMode, FailureType
from app.config import settings

ALLOWED_ACTIONS = {a.value for a in ActionType}

# uvicorn configures this logger, so warnings land in deployment logs.
logger = logging.getLogger("uvicorn.error")


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
    # ROUTED mode only: why this engine was chosen for this case.
    route_reason: str | None = None


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
            raw={"hard_stop": True},
        )

    if classification_confidence < 0.35:
        return AgentDecisionResult(
            decision=DecisionType.NOT_WORTH_PURSUING,
            action=ActionType.ESCALATE_FOR_REVIEW,
            confidence=classification_confidence,
            reasoning="Failure classification confidence is too low to safely automate a decision.",
            agent_mode=AgentMode.HEURISTIC,
            raw={"hard_stop": True},
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
    scored_raw = {"scored_actions": [(a.value, round(p, 3), round(ev, 2)) for a, p, ev in scored]}

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
            raw=scored_raw,
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
            raw=scored_raw,
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
        raw=scored_raw,
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


# Token budget for one decision call. GROQ_MODEL defaults to a *reasoning*
# model (gpt-oss-120b) whose internal reasoning tokens are billed against
# max_tokens BEFORE any visible content is emitted. At 400 this sat right on
# the boundary -- observed live: completion_tokens=323 succeeded, but a
# slightly longer chain hit finish_reason="length" and returned EMPTY content,
# which failed JSON parsing and silently escalated the case to human review.
# 1500 leaves real headroom (observed usage ~410-430 tokens).
LLM_DECIDE_MAX_TOKENS = 1500


def _llm_decide(context: dict) -> AgentDecisionResult | None:
    """Returns None on any failure -- caller applies the safe FLAGGED_FOR_REVIEW
    fallback. Every failure path is logged: a silent `except: return None` is
    why a real failure of this call stayed invisible through testing."""
    if not settings.GROQ_API_KEY:
        return None
    payment_id = context.get("payment_id", "<unknown>")
    try:
        from groq import Groq
        # Bounded like the classifier: never let a slow/retrying API call stall
        # the request and hold the DB write transaction open.
        client = Groq(api_key=settings.GROQ_API_KEY, timeout=15.0, max_retries=0)
        user_prompt = "Recovery case context:\n" + json.dumps(context, indent=2)
        resp = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            max_tokens=LLM_DECIDE_MAX_TOKENS,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        choice = resp.choices[0]
        text = (choice.message.content or "").strip()

        if not text:
            # Almost always finish_reason="length" on a reasoning model: the
            # budget was spent thinking and nothing was left for the answer.
            logger.warning(
                "LLM decision for %s returned empty content (finish_reason=%s); "
                "falling back to human review.", payment_id, choice.finish_reason,
            )
            return None

        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
        data = json.loads(text)

        decision = data["decision"]
        if decision == DecisionType.EVALUATION_UNAVAILABLE.value:
            # Reserved for a failed reasoning call. A model that answered
            # cannot also claim it was unable to evaluate.
            logger.warning(
                "LLM decision for %s returned reserved decision %r; rejected.",
                payment_id, decision,
            )
            return None

        action = data["action"]
        if action not in ALLOWED_ACTIONS:
            # Agent invented an action -- treat as failure, never execute it.
            logger.warning(
                "LLM decision for %s proposed out-of-vocabulary action %r; rejected.",
                payment_id, action,
            )
            return None

        return AgentDecisionResult(
            decision=DecisionType(decision),
            action=ActionType(action),
            confidence=float(data["confidence"]),
            reasoning=str(data["reasoning"]),
            agent_mode=AgentMode.LLM,
            raw=data,
        )
    except Exception as exc:
        logger.warning(
            "LLM decision for %s failed (%s: %s); falling back to human review.",
            payment_id, type(exc).__name__, exc,
        )
        return None


def _llm_failure_fallback() -> AgentDecisionResult:
    return AgentDecisionResult(
        # NOT a decline: the engine never got to evaluate this case.
        decision=DecisionType.EVALUATION_UNAVAILABLE,
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
# ROUTED mode: per-case engine selection
# ---------------------------------------------------------------------

HEURISTIC_SUFFICIENT = "heuristic sufficient"

_missing_key_warned = False


def _warn_missing_key_once() -> None:
    global _missing_key_warned
    if not _missing_key_warned:
        _missing_key_warned = True
        logger.warning(
            "AGENT_MODE=ROUTED but GROQ_API_KEY is empty: cases that would benefit "
            "from LLM reasoning will use the heuristic result instead. Set GROQ_API_KEY "
            "to enable real routing."
        )


def _routing_reason(context: dict, heuristic: AgentDecisionResult) -> str | None:
    """Should this case escalate to the LLM? Returns the reason, or None.

    The heuristic has already run (it is free and deterministic), and its
    internals tell us whether it is actually confident. We only pay for
    inference when the expected cost of being wrong exceeds the cost of
    thinking harder.
    """
    # Hard stops are safety rules, not judgement calls. There is nothing an LLM
    # can add when the case has no recovery opportunities left, or when the
    # failure type is too uncertain to act on at all -- these short-circuit.
    if heuristic.raw.get("hard_stop"):
        return None

    # 1. Uncertain classification. The heuristic picks from a table keyed on
    #    failure_type; if the type is a guess, the table is standing on sand.
    confidence = context.get("classification_confidence")
    floor = settings.LLM_ROUTE_MIN_CLASSIFICATION_CONFIDENCE
    if confidence is not None and confidence < floor:
        return f"classification confidence {confidence:.2f} below {floor:.2f}"

    # 2. Too close to call. If the top two candidates are within the margin,
    #    the argmax is separating noise rather than signal.
    scored = heuristic.raw.get("scored_actions") or []
    if len(scored) >= 2:
        top_ev, second_ev = scored[0][2], scored[1][2]
        if top_ev > 0:
            gap = (top_ev - second_ev) / top_ev
            if gap < settings.LLM_ROUTE_EV_MARGIN_PCT:
                return (f"top-two EV gap {gap:.0%} below "
                        f"{settings.LLM_ROUTE_EV_MARGIN_PCT:.0%} margin")

    # 3. Stakes justify deliberation. An LLM call costs ~Rs 0.50; a wrong call
    #    on a high-value transaction costs the transaction.
    amount = context.get("amount") or 0.0
    attempts = context.get("previous_recovery_attempts") or 0
    if (amount >= settings.HIGH_VALUE_THRESHOLD
            and attempts >= settings.LLM_ROUTE_HIGH_VALUE_MIN_ATTEMPTS):
        return f"Rs {amount:,.0f} high-value with {attempts} prior attempt(s)"

    # 4. Accumulated evidence the fit table structurally cannot represent.
    #    _ACTION_FIT is keyed on failure_type alone: it has no slot for "we already
    #    tried this and it failed" or "they clicked and still didn't pay". Those are
    #    precisely the cases where the heuristic is reasoning from a table that has
    #    forgotten the case's own history, and where an LLM reading the full context
    #    has something real to add.
    if settings.LLM_ROUTE_ON_PRIOR_EVIDENCE:
        if attempts >= 1 and context.get("previous_outcome") == "FAILED":
            prev_action = context.get("previous_recovery_action")
            tried = f" ({prev_action})" if prev_action else ""
            plural = "s" if attempts != 1 else ""
            return (f"{attempts} prior attempt{plural} failed{tried}; "
                    f"fit table has no memory of it")

        if (context.get("customer_engagement") == "LINK_CLICKED"
                and context.get("status") != "RECOVERED"):
            return ("customer clicked the recovery link but the payment is still "
                    "unrecovered; fit table cannot represent that contradiction")

    return None


def _routed_decide(context: dict) -> AgentDecisionResult:
    """Run the heuristic on every case; escalate to the LLM only when it earns
    its cost. The returned result's agent_mode is always the engine that
    ACTUALLY decided (HEURISTIC or LLM) -- never ROUTED, which is a dispatch
    mode, not a reasoner."""
    heuristic = _heuristic_decide(context)
    reason = _routing_reason(context, heuristic)

    if reason is None:
        heuristic.route_reason = HEURISTIC_SUFFICIENT
        return heuristic

    if not settings.GROQ_API_KEY:
        # Routing means "would benefit from an LLM", not "requires one". With no
        # key configured we keep the heuristic answer rather than escalating to a
        # human -- a fresh clone with no key must still be a fully working app.
        _warn_missing_key_once()
        heuristic.route_reason = f"{reason}; no GROQ_API_KEY, kept heuristic"
        return heuristic

    llm_result = _llm_decide(context)
    if llm_result is None:
        # A genuine mid-flight failure is NOT the same as never having tried.
        # Something was asked to reason and failed, so per spec section 20 that
        # surfaces as FLAGGED_FOR_REVIEW. Silently substituting the heuristic
        # answer here would misrepresent what actually decided this case.
        fallback = _llm_failure_fallback()
        fallback.route_reason = f"{reason}; LLM call failed"
        return fallback

    llm_result.route_reason = reason
    return llm_result


# ---------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------

def decide(context: dict, mode: str | None = None) -> AgentDecisionResult:
    mode = (mode or settings.AGENT_MODE).upper()
    if mode == AgentMode.LLM.value:
        result = _llm_decide(context)
        if result is None:
            result = _llm_failure_fallback()
    elif mode == AgentMode.ROUTED.value:
        result = _routed_decide(context)
    else:
        result = _heuristic_decide(context)

    _attach_expected_value(context, result)
    return result
