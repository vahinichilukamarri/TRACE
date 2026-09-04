"""Rate-limit resilience for the live LLM decision path.

A 429 is transient back-pressure, not a reasoning failure: it says nothing about
the case and is worth another attempt. Every other error class is deterministic,
so retrying only delays the fallback and burns more of the same quota.
"""
import time
import types

import pytest

import app.agent as agent_mod
from app.agent import _llm_decide, _is_rate_limit, RATE_LIMITED, decide
from app.config import settings
from app.enums import ActionType, DecisionType


GOOD_JSON = (
    '{"decision": "RECOVERY_WORTH_PURSUING", "action": "RETRY_PAYMENT", '
    '"confidence": 0.8, "reasoning": "ok"}'
)


class FakeRateLimitError(Exception):
    """Mimics groq.RateLimitError closely enough for the detector."""
    status_code = 429


class FakeAuthError(Exception):
    status_code = 401


def _resp(content):
    msg = types.SimpleNamespace(content=content)
    choice = types.SimpleNamespace(message=msg, finish_reason="stop")
    return types.SimpleNamespace(choices=[choice])


def install_fake_groq(monkeypatch, script):
    """`script` is a list of either exceptions to raise or contents to return."""
    calls = {"n": 0}

    class _Client:
        def __init__(self, **kw):
            self.chat = self
            self.completions = self

        def create(self, **kw):
            i = calls["n"]
            calls["n"] += 1
            step = script[min(i, len(script) - 1)]
            if isinstance(step, Exception):
                raise step
            return _resp(step)

    fake = types.ModuleType("groq")
    fake.Groq = _Client
    monkeypatch.setitem(__import__("sys").modules, "groq", fake)
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-key-present")
    return calls


def base_context(**overrides):
    ctx = {
        "payment_id": "PAY-TEST-0001",
        "amount": 7400,
        "failure_type": "CARD_DECLINED",
        "classification_confidence": 0.95,
        "customer_success_rate": 0.8,
        "previous_failures": 0,
        "previous_recovery_attempts": 0,
        "previous_recovery_action": None,
        "previous_outcome": None,
        "customer_engagement": "NONE",
        "time_since_failure_minutes": 10,
        "remaining_recovery_opportunities": 3,
        "status": "OPEN",
    }
    ctx.update(overrides)
    return ctx


# --- detector ------------------------------------------------------------

def test_rate_limit_detector_is_narrow():
    assert _is_rate_limit(FakeRateLimitError("429")) is True
    assert _is_rate_limit(Exception("rate_limit_exceeded on tokens")) is True
    assert _is_rate_limit(FakeAuthError("Invalid API Key")) is False
    assert _is_rate_limit(ValueError("bad json")) is False


# --- 429 retries, then succeeds -----------------------------------------

def test_rate_limit_retries_then_succeeds(monkeypatch):
    monkeypatch.setattr(settings, "LLM_RATE_LIMIT_BACKOFF_SECONDS", 0.01)
    calls = install_fake_groq(
        monkeypatch, [FakeRateLimitError("429"), GOOD_JSON]
    )
    result = _llm_decide(base_context())
    assert calls["n"] == 2, "should have retried exactly once"
    assert result is not None and result is not RATE_LIMITED
    assert result.action == ActionType.RETRY_PAYMENT
    assert result.is_fallback is False


def test_rate_limit_retries_up_to_the_configured_ceiling(monkeypatch):
    monkeypatch.setattr(settings, "LLM_RATE_LIMIT_MAX_RETRIES", 2)
    monkeypatch.setattr(settings, "LLM_RATE_LIMIT_BACKOFF_SECONDS", 0.01)
    calls = install_fake_groq(monkeypatch, [FakeRateLimitError("429")])
    result = _llm_decide(base_context())
    assert calls["n"] == 3, "1 initial attempt + 2 retries"
    assert result is RATE_LIMITED


# --- non-429 must NOT retry ---------------------------------------------

@pytest.mark.parametrize("err", [FakeAuthError("Invalid API Key"), ValueError("boom")])
def test_non_rate_limit_errors_never_retry(monkeypatch, err):
    monkeypatch.setattr(settings, "LLM_RATE_LIMIT_BACKOFF_SECONDS", 0.01)
    calls = install_fake_groq(monkeypatch, [err])
    result = _llm_decide(base_context())
    assert calls["n"] == 1, f"{type(err).__name__} must not be retried"
    assert result is None, "a non-429 failure is a plain failure, not RATE_LIMITED"


def test_empty_content_does_not_retry(monkeypatch):
    calls = install_fake_groq(monkeypatch, [""])
    assert _llm_decide(base_context()) is None
    assert calls["n"] == 1


def test_out_of_vocabulary_action_does_not_retry(monkeypatch):
    calls = install_fake_groq(monkeypatch, [
        '{"decision": "RECOVERY_WORTH_PURSUING", "action": "REFUND_EVERYTHING", '
        '"confidence": 0.9, "reasoning": "x"}'
    ])
    assert _llm_decide(base_context()) is None
    assert calls["n"] == 1


# --- wall-clock ceiling --------------------------------------------------

def test_retries_never_exceed_the_wall_clock_budget(monkeypatch):
    """A retry that would not fit inside the budget is skipped, not slept through."""
    monkeypatch.setattr(settings, "LLM_RATE_LIMIT_MAX_RETRIES", 5)
    monkeypatch.setattr(settings, "LLM_RATE_LIMIT_BACKOFF_SECONDS", 0.4)
    monkeypatch.setattr(settings, "LLM_CALL_MAX_WALL_CLOCK_SECONDS", 0.5)
    install_fake_groq(monkeypatch, [FakeRateLimitError("429")])
    started = time.monotonic()
    result = _llm_decide(base_context())
    elapsed = time.monotonic() - started
    assert result is RATE_LIMITED
    assert elapsed < 1.5, f"took {elapsed:.2f}s, budget was 0.5s"


# --- the fallback distinguishes the two events ---------------------------

def test_exhausted_rate_limit_is_labelled_differently_from_a_reasoning_failure(monkeypatch):
    monkeypatch.setattr(settings, "LLM_RATE_LIMIT_BACKOFF_SECONDS", 0.01)
    install_fake_groq(monkeypatch, [FakeRateLimitError("429")])
    rate_limited = decide(base_context(), mode="LLM")

    monkeypatch.setattr(agent_mod, "_llm_decide", lambda ctx: None)
    reasoning_failure = decide(base_context(), mode="LLM")

    for r in (rate_limited, reasoning_failure):
        # Both escalate and neither claims a judgement it never made.
        assert r.is_fallback is True
        assert r.action == ActionType.ESCALATE_FOR_REVIEW
        assert r.decision == DecisionType.EVALUATION_UNAVAILABLE

    assert rate_limited.fallback_cause == "RATE_LIMITED"
    assert reasoning_failure.fallback_cause == "REASONING_FAILURE"
    assert rate_limited.reasoning != reasoning_failure.reasoning
    assert "rate limited" in rate_limited.reasoning.lower()


def test_token_reservation_is_lowered(monkeypatch):
    """Groq bills the REQUESTED max_tokens against the per-minute budget."""
    assert agent_mod.LLM_DECIDE_MAX_TOKENS == 800
