"""ROUTED mode: per-case engine selection.

The point of ROUTED is that "we use AI where it's needed and deterministic
logic where it isn't" becomes an observable runtime behaviour, so these tests
assert on the routing decision itself, not just on the final action.
"""
from app.agent import decide, _heuristic_decide, _routing_reason, HEURISTIC_SUFFICIENT
from app.config import settings
from app.enums import AgentMode, ActionType


def base_context(**overrides):
    ctx = {
        "amount": 5000,
        "failure_type": "CARD_DECLINED",
        "classification_confidence": 0.95,
        "customer_success_rate": 0.7,
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


def reason_for(ctx):
    return _routing_reason(ctx, _heuristic_decide(ctx))


# --- trigger 1: uncertain classification ---------------------------------

def test_low_classification_confidence_routes_to_llm():
    # Above the hard-stop floor (0.35) but below the routing floor.
    ctx = base_context(classification_confidence=0.41)
    assert settings.LLM_ROUTE_MIN_CLASSIFICATION_CONFIDENCE > 0.41
    reason = reason_for(ctx)
    assert reason is not None and "classification confidence" in reason


def test_confident_classification_does_not_route():
    # AUTH_FAILURE has a wide top-two gap (0.60 vs 0.40), so no trigger fires
    # and the heuristic answer stands on its own.
    ctx = base_context(failure_type="AUTH_FAILURE", classification_confidence=0.95)
    assert reason_for(ctx) is None


# --- trigger 2: top-two expected values too close ------------------------

def test_narrow_ev_margin_routes_to_llm():
    # PROCESSING_ERROR's top two candidates are genuinely tied (RETRY_PAYMENT and
    # WAIT_AND_REASSESS are both 0.35), so the argmax is pure tie-breaking noise.
    # CARD_DECLINED's 8.3% gap deliberately no longer qualifies at the 5% margin.
    ctx = base_context(failure_type="PROCESSING_ERROR", classification_confidence=0.95)
    scored = _heuristic_decide(ctx).raw["scored_actions"]
    gap = (scored[0][2] - scored[1][2]) / scored[0][2]
    assert gap < settings.LLM_ROUTE_EV_MARGIN_PCT, f"fixture gap {gap:.0%} not narrow"
    reason = reason_for(ctx)
    assert reason is not None and "EV gap" in reason


def test_wide_ev_margin_does_not_route_on_that_trigger():
    ctx = base_context(failure_type="AUTH_FAILURE")
    scored = _heuristic_decide(ctx).raw["scored_actions"]
    gap = (scored[0][2] - scored[1][2]) / scored[0][2]
    assert gap >= settings.LLM_ROUTE_EV_MARGIN_PCT
    reason = reason_for(ctx)
    assert reason is None or "EV gap" not in reason


# --- trigger 3: high value with prior attempts ---------------------------

def test_high_value_with_prior_attempts_routes_to_llm():
    ctx = base_context(
        amount=settings.HIGH_VALUE_THRESHOLD + 32000,
        previous_recovery_attempts=max(1, settings.LLM_ROUTE_HIGH_VALUE_MIN_ATTEMPTS),
        previous_recovery_action="SEND_RECOVERY_LINK",
        previous_outcome="FAILED",
        classification_confidence=0.95,
    )
    reason = reason_for(ctx)
    assert reason is not None
    assert "high-value" in reason or "EV gap" in reason


def test_high_value_with_no_prior_attempts_does_not_route_on_stakes():
    ctx = base_context(amount=settings.HIGH_VALUE_THRESHOLD + 32000,
                       previous_recovery_attempts=0)
    reason = reason_for(ctx)
    assert reason is None or "high-value" not in reason


# --- hard stops must never route -----------------------------------------

def test_hard_stops_never_route_to_llm():
    """No opportunities left / classification below the safety floor are safety
    rules, not judgement calls -- an LLM has nothing to add."""
    no_opportunities = base_context(remaining_recovery_opportunities=0,
                                    amount=999999, classification_confidence=0.10)
    unclassifiable = base_context(classification_confidence=0.10, amount=999999,
                                  previous_recovery_attempts=3)
    for ctx in (no_opportunities, unclassifiable):
        h = _heuristic_decide(ctx)
        assert h.raw.get("hard_stop") is True
        assert _routing_reason(ctx, h) is None, "a hard stop must never route to the LLM"


# --- missing API key degrades, never escalates ---------------------------

def test_missing_api_key_degrades_to_heuristic_without_escalating(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    ctx = base_context(classification_confidence=0.41)   # would route
    assert reason_for(ctx) is not None

    result = decide(ctx, mode="ROUTED")
    assert result.agent_mode == AgentMode.HEURISTIC
    assert result.is_fallback is False
    assert result.action != ActionType.ESCALATE_FOR_REVIEW or result.decision is not None
    assert "no GROQ_API_KEY" in result.route_reason
    # It must not become the LLM-failure escalation path.
    assert "LLM call failed" not in result.route_reason


def test_route_reason_is_always_populated_in_routed_mode(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    contexts = [
        base_context(),
        base_context(classification_confidence=0.41),
        base_context(remaining_recovery_opportunities=0),
        base_context(amount=90000, previous_recovery_attempts=2,
                     previous_recovery_action="RETRY_PAYMENT", previous_outcome="FAILED"),
        base_context(failure_type="INSUFFICIENT_FUNDS", customer_success_rate=0.1,
                     previous_recovery_attempts=2),
    ]
    for ctx in contexts:
        r = decide(ctx, mode="ROUTED")
        assert r.route_reason, f"route_reason missing for {ctx}"
        # agent_mode must be the engine that actually decided, never ROUTED.
        assert r.agent_mode in (AgentMode.HEURISTIC, AgentMode.LLM)
        assert r.agent_mode != AgentMode.ROUTED


def test_genuine_llm_failure_still_escalates(monkeypatch):
    """Key present but the call fails -> keep the existing FLAGGED_FOR_REVIEW
    behaviour. Silently substituting the heuristic would misrepresent what
    reasoned about the case."""
    import app.agent as agent_mod
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-key-present")
    monkeypatch.setattr(agent_mod, "_llm_decide", lambda ctx: None)

    result = decide(base_context(classification_confidence=0.41), mode="ROUTED")
    assert result.is_fallback is True
    assert result.action == ActionType.ESCALATE_FOR_REVIEW
    assert result.agent_mode == AgentMode.LLM
    assert "LLM call failed" in result.route_reason


# --- the batch harness must never run ROUTED -----------------------------

def test_run_evaluation_coerces_routed_to_heuristic(db_session):
    from app.evaluation.runner import run_evaluation
    from app.models import AgentDecisionRecord

    result = run_evaluation(db_session, dataset_size=15, seed=7, agent_mode="ROUTED")
    assert result["run_id"]
    modes = {m[0] for m in db_session.query(AgentDecisionRecord.agent_mode).distinct().all()}
    assert modes == {"HEURISTIC"}, f"batch must stay deterministic, saw {modes}"


def test_routed_batch_matches_heuristic_batch_exactly(db_session):
    """Coercion must be a true no-op on the numbers, not merely 'close'."""
    from app.evaluation.runner import run_evaluation
    a = run_evaluation(db_session, dataset_size=20, seed=99, agent_mode="ROUTED")
    b = run_evaluation(db_session, dataset_size=20, seed=99, agent_mode="HEURISTIC")
    assert a["results"] == b["results"]


# --- trigger 4: accumulated evidence the fit table cannot represent --------

def test_failed_prior_attempt_routes_on_evidence():
    """_ACTION_FIT is keyed on failure_type alone -- it has no slot for 'we
    already tried this and it failed', so that case is exactly where the
    heuristic is reasoning from a table that forgot the case's own history."""
    ctx = base_context(
        failure_type="AUTH_FAILURE",          # wide EV gap, so trigger 2 can't fire
        classification_confidence=0.95,        # trigger 1 can't fire
        amount=4000,                           # trigger 3 can't fire
        previous_recovery_attempts=1,
        previous_recovery_action="SEND_RECOVERY_LINK",
        previous_outcome="FAILED",
    )
    reason = reason_for(ctx)
    assert reason is not None
    assert "prior attempt" in reason and "SEND_RECOVERY_LINK" in reason
    assert "fit table has no memory" in reason


def test_link_clicked_but_unrecovered_routes_on_evidence():
    """A genuine contradiction: the customer engaged but still didn't pay."""
    ctx = base_context(
        failure_type="AUTH_FAILURE",
        classification_confidence=0.95,
        amount=4000,
        previous_recovery_attempts=0,
        previous_outcome=None,
        customer_engagement="LINK_CLICKED",
        status="OPEN",
    )
    reason = reason_for(ctx)
    assert reason is not None
    assert "clicked" in reason and "unrecovered" in reason


def test_clean_first_pass_case_does_not_route():
    """No history, confident classification, wide EV gap, ordinary amount:
    the heuristic answer stands on its own and costs nothing."""
    ctx = base_context(
        failure_type="AUTH_FAILURE",
        classification_confidence=0.95,
        amount=4000,
        previous_recovery_attempts=0,
        previous_recovery_action=None,
        previous_outcome=None,
        customer_engagement="NONE",
    )
    assert reason_for(ctx) is None


def test_evidence_trigger_respects_its_config_flag(monkeypatch):
    ctx = base_context(
        failure_type="AUTH_FAILURE", classification_confidence=0.95, amount=4000,
        previous_recovery_attempts=1, previous_recovery_action="RETRY_PAYMENT",
        previous_outcome="FAILED",
    )
    assert reason_for(ctx) is not None
    monkeypatch.setattr(settings, "LLM_ROUTE_ON_PRIOR_EVIDENCE", False)
    assert reason_for(ctx) is None


def test_hard_stops_still_short_circuit_before_the_evidence_trigger():
    """A hard stop carries maximal 'evidence' (failed attempts, engagement) yet
    must never route -- it is a safety rule, not a judgement call."""
    ctx = base_context(
        remaining_recovery_opportunities=0,          # hard stop
        previous_recovery_attempts=3,
        previous_recovery_action="SEND_RECOVERY_LINK",
        previous_outcome="FAILED",
        customer_engagement="LINK_CLICKED",
        amount=999999,
    )
    h = _heuristic_decide(ctx)
    assert h.raw.get("hard_stop") is True
    assert _routing_reason(ctx, h) is None


def test_ev_margin_default_is_tight_enough_to_not_be_a_type_lookup():
    """At a 10% margin, trigger 2 fired on 91% of CARD_DECLINED purely because
    that type's top-two base fits sit 8.3% apart. The default must be below it."""
    assert settings.LLM_ROUTE_EV_MARGIN_PCT <= 0.05
    ctx = base_context(failure_type="CARD_DECLINED", classification_confidence=0.95)
    scored = _heuristic_decide(ctx).raw["scored_actions"]
    gap = (scored[0][2] - scored[1][2]) / scored[0][2]
    assert gap >= settings.LLM_ROUTE_EV_MARGIN_PCT, (
        "a clean CARD_DECLINED case must no longer route on the EV margin alone"
    )


def test_run_evaluation_ignores_a_routed_global_agent_mode(db_session, monkeypatch):
    """The dangerous case is agent_mode=None, not an explicit "ROUTED".

    /evaluation/run calls run_evaluation() without an agent_mode, so None used to
    propagate all the way to decide(), which falls back to settings.AGENT_MODE.
    With AGENT_MODE=ROUTED in the environment that silently turned the benchmark
    into hundreds of live LLM calls -- non-reproducible, slow, and billed."""
    from app.evaluation.runner import run_evaluation
    from app.models import AgentDecisionRecord
    import app.agent as agent_mod

    monkeypatch.setattr(settings, "AGENT_MODE", "ROUTED")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-key-present")

    def explode(_ctx):
        raise AssertionError("batch evaluation must never call the LLM")
    monkeypatch.setattr(agent_mod, "_llm_decide", explode)

    run_evaluation(db_session, dataset_size=12, seed=7)   # no agent_mode passed
    modes = {m[0] for m in db_session.query(AgentDecisionRecord.agent_mode).distinct().all()}
    assert modes == {"HEURISTIC"}, f"batch leaked a non-heuristic engine: {modes}"
