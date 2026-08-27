from app.policy import check_policy
from app.enums import PolicyResult, ActionType


def base_context(**overrides):
    ctx = {
        "amount": 5000,
        "failure_type": "BANK_TIMEOUT",
        "classification_confidence": 0.9,
        "customer_success_rate": 0.7,
        "previous_failures": 0,
        "previous_recovery_attempts": 0,
        "previous_recovery_action": None,
        "previous_outcome": None,
        "customer_engagement": "NONE",
        "time_since_failure_minutes": 20,
        "remaining_recovery_opportunities": 3,
        "status": "OPEN",
    }
    ctx.update(overrides)
    return ctx


def test_approves_reasonable_first_action():
    result = check_policy(base_context(), ActionType.RETRY_PAYMENT.value, confidence=0.8, action_history=[])
    assert result.result == PolicyResult.APPROVED
    assert result.final_action == ActionType.RETRY_PAYMENT.value


def test_blocks_when_case_already_recovered():
    ctx = base_context(status="RECOVERED")
    result = check_policy(ctx, ActionType.SEND_RECOVERY_LINK.value, confidence=0.9, action_history=[])
    assert result.result == PolicyResult.BLOCKED


def test_blocks_when_recovery_window_expired():
    ctx = base_context(time_since_failure_minutes=999999)
    result = check_policy(ctx, ActionType.RETRY_PAYMENT.value, confidence=0.9, action_history=[])
    assert result.result == PolicyResult.BLOCKED
    assert result.final_action == ActionType.STOP_RECOVERY.value


def test_blocks_when_max_attempts_reached():
    ctx = base_context(previous_recovery_attempts=3)
    result = check_policy(ctx, ActionType.SEND_RECOVERY_LINK.value, confidence=0.9, action_history=[])
    assert result.result == PolicyResult.BLOCKED
    assert result.final_action == ActionType.STOP_RECOVERY.value


def test_blocks_when_no_remaining_opportunities():
    ctx = base_context(remaining_recovery_opportunities=0)
    result = check_policy(ctx, ActionType.RETRY_PAYMENT.value, confidence=0.9, action_history=[])
    assert result.result == PolicyResult.BLOCKED


def test_stop_recovery_always_permitted_even_with_no_opportunities():
    ctx = base_context(remaining_recovery_opportunities=0)
    result = check_policy(ctx, ActionType.STOP_RECOVERY.value, confidence=0.9, action_history=[])
    assert result.result in (PolicyResult.APPROVED, PolicyResult.FLAGGED_FOR_REVIEW)


def test_blocks_repeated_action_beyond_limit():
    ctx = base_context()
    history = [ActionType.SEND_RECOVERY_LINK.value, ActionType.SEND_RECOVERY_LINK.value]
    result = check_policy(ctx, ActionType.SEND_RECOVERY_LINK.value, confidence=0.9, action_history=history)
    assert result.result == PolicyResult.BLOCKED
    assert result.final_action == ActionType.ESCALATE_FOR_REVIEW.value


def test_low_confidence_flagged_for_review():
    ctx = base_context()
    result = check_policy(ctx, ActionType.SEND_RECOVERY_LINK.value, confidence=0.1, action_history=[])
    assert result.result == PolicyResult.FLAGGED_FOR_REVIEW


def test_high_value_first_stop_flagged_for_review():
    ctx = base_context(amount=100000, previous_recovery_attempts=0)
    result = check_policy(ctx, ActionType.STOP_RECOVERY.value, confidence=0.9, action_history=[])
    assert result.result == PolicyResult.FLAGGED_FOR_REVIEW


def test_escalate_for_review_always_approved_path():
    ctx = base_context(previous_recovery_attempts=3)
    result = check_policy(ctx, ActionType.ESCALATE_FOR_REVIEW.value, confidence=0.9, action_history=[])
    assert result.result == PolicyResult.APPROVED
