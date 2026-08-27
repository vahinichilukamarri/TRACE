from app.agent import decide
from app.enums import DecisionType, ActionType, AgentMode


def base_context(**overrides):
    ctx = {
        "amount": 20000,
        "failure_type": "BANK_TIMEOUT",
        "classification_confidence": 0.95,
        "customer_success_rate": 0.95,
        "previous_failures": 0,
        "previous_recovery_attempts": 0,
        "previous_recovery_action": None,
        "previous_outcome": None,
        "customer_engagement": "NONE",
        "time_since_failure_minutes": 10,
        "remaining_recovery_opportunities": 1,
        "status": "OPEN",
    }
    ctx.update(overrides)
    return ctx


def test_high_value_strong_history_pursues_recovery():
    """Spec Case A: high value, strong history, temporary failure -> should pursue."""
    result = decide(base_context(), mode="HEURISTIC")
    assert result.decision == DecisionType.RECOVERY_WORTH_PURSUING
    assert result.agent_mode == AgentMode.HEURISTIC
    assert result.action in (ActionType.RETRY_PAYMENT, ActionType.WAIT_AND_REASSESS)


def test_low_value_poor_history_exhausted_attempts_stops():
    """Spec Case B: low value, poor history, repeated failed attempts -> should stop."""
    ctx = base_context(
        amount=500, customer_success_rate=0.4, previous_recovery_attempts=3,
        previous_recovery_action="SEND_RECOVERY_LINK", previous_outcome="FAILED",
        remaining_recovery_opportunities=1,
    )
    result = decide(ctx, mode="HEURISTIC")
    assert result.decision == DecisionType.NOT_WORTH_PURSUING
    assert result.action in (ActionType.STOP_RECOVERY, ActionType.ESCALATE_FOR_REVIEW)


def test_no_remaining_opportunities_always_stops():
    ctx = base_context(remaining_recovery_opportunities=0)
    result = decide(ctx, mode="HEURISTIC")
    assert result.action == ActionType.STOP_RECOVERY
    assert result.decision == DecisionType.NOT_WORTH_PURSUING


def test_low_classification_confidence_escalates():
    ctx = base_context(classification_confidence=0.1)
    result = decide(ctx, mode="HEURISTIC")
    assert result.action == ActionType.ESCALATE_FOR_REVIEW


def test_never_repeats_action_that_just_failed():
    ctx = base_context(
        previous_recovery_attempts=1, previous_recovery_action="RETRY_PAYMENT", previous_outcome="FAILED",
        remaining_recovery_opportunities=2,
    )
    result = decide(ctx, mode="HEURISTIC")
    if result.decision == DecisionType.RECOVERY_WORTH_PURSUING:
        assert result.action != ActionType.RETRY_PAYMENT


def test_action_is_always_in_bounded_action_space():
    from app.enums import ActionType as AT
    allowed = {a for a in AT}
    for success_rate in (0.1, 0.5, 0.9):
        for attempts in (0, 1, 2, 3):
            ctx = base_context(customer_success_rate=success_rate, previous_recovery_attempts=attempts)
            result = decide(ctx, mode="HEURISTIC")
            assert result.action in allowed


def test_llm_mode_without_api_key_falls_back_safely(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    result = decide(base_context(), mode="LLM")
    assert result.is_fallback is True
    assert result.action == ActionType.ESCALATE_FOR_REVIEW
    assert result.decision == DecisionType.NOT_WORTH_PURSUING
