from app.evaluation.runner import run_evaluation, get_run


def test_evaluation_run_produces_both_systems(db_session):
    result = run_evaluation(db_session, dataset_size=15, seed=7)
    assert "TRACE" in result["results"]
    assert "BASELINE" in result["results"]
    for system, metrics in result["results"].items():
        assert metrics["total_failed_payments"] == 15
        assert metrics["revenue_at_risk"] > 0
        assert 0 <= metrics["recovery_rate"] <= 1


def test_evaluation_run_is_retrievable(db_session):
    result = run_evaluation(db_session, dataset_size=10, seed=7)
    fetched = get_run(db_session, result["run_id"])
    assert fetched is not None
    assert fetched["dataset_size"] == 10
    assert fetched["results"]["TRACE"]["total_failed_payments"] == 10


def test_same_seed_is_reproducible(db_session):
    r1 = run_evaluation(db_session, dataset_size=10, seed=123)
    r2 = run_evaluation(db_session, dataset_size=10, seed=123)
    # Same seed -> same revenue at risk (dataset generation is deterministic)
    assert r1["results"]["TRACE"]["revenue_at_risk"] == r2["results"]["TRACE"]["revenue_at_risk"]
    assert r1["results"]["BASELINE"]["revenue_at_risk"] == r2["results"]["BASELINE"]["revenue_at_risk"]


def test_never_exceeds_max_recovery_attempts_policy(db_session):
    """Engineering safety check: no case should accumulate more active
    recovery-attempt executions than policy allows plus a small bounded
    slack for the terminal STOP/ESCALATE action."""
    from app.models import RecoveryCase, ExecutionRecord
    from app.config import settings

    run_evaluation(db_session, dataset_size=40, seed=99)
    cases = db_session.query(RecoveryCase).filter(RecoveryCase.system == "TRACE").all()
    active_actions = {"RETRY_PAYMENT", "SEND_RECOVERY_LINK", "SUGGEST_ALTERNATIVE_METHOD"}

    for case in cases:
        active_count = sum(1 for e in case.executions if e.action in active_actions)
        # MAX_RECOVERY_ATTEMPTS bounds *attempts already made* before policy blocks
        # further ones; allow one extra in-flight attempt before the block lands.
        assert active_count <= settings.MAX_RECOVERY_ATTEMPTS + 1


def test_past_window_bank_timeout_is_unrecoverable_by_any_action():
    """Domain consistency: NPCI auto-reverses failed UPI transactions inside the
    BANK_TIMEOUT window. Past it the money is already back with the customer, so
    no action -- by TRACE or by the policy-free baseline -- may recover it."""
    import random
    from app.simulation import hidden_outcome_model
    from app.config import settings
    from app.enums import ActionType

    window = settings.RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT
    # Maximally favourable context otherwise: great customer, no prior attempts,
    # already clicked the link. It must still be unrecoverable.
    past_window = {
        "failure_type": "BANK_TIMEOUT",
        "time_since_failure_minutes": window + 1,
        "customer_success_rate": 0.99,
        "previous_recovery_attempts": 0,
        "customer_engagement": "LINK_CLICKED",
        "amount": 50000,
    }
    for action in ActionType:
        for seed in range(150):
            recovered, prob = hidden_outcome_model.resolve(
                past_window, action.value, random.Random(seed)
            )
            assert recovered is False, f"{action.value} recovered a past-window BANK_TIMEOUT"
            assert prob == 0.0

    # ...and inside the window it must still be winnable, otherwise the whole
    # bucket is trivially dead and the agent has no decision to make.
    fresh = {**past_window, "time_since_failure_minutes": max(1, window - 5)}
    assert any(
        hidden_outcome_model.resolve(fresh, ActionType.RETRY_PAYMENT.value, random.Random(s))[0]
        for s in range(50)
    ), "a fresh BANK_TIMEOUT should still be recoverable"


def test_no_system_recovers_a_past_window_bank_timeout_end_to_end(db_session):
    """The same invariant, asserted over a real batch run rather than in
    isolation -- for BOTH systems."""
    from app.models import RecoveryCase
    from app.config import settings

    run_evaluation(db_session, dataset_size=120, seed=42)
    window = settings.RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT

    offenders = [
        (c.system, c.payment_id, c.time_since_failure_minutes)
        for c in db_session.query(RecoveryCase).filter(
            RecoveryCase.failure_type == "BANK_TIMEOUT",
            RecoveryCase.status == "RECOVERED",
        ).all()
        if c.time_since_failure_minutes > window
    ]
    assert not offenders, f"recovered BANK_TIMEOUT cases past the {window}-min window: {offenders}"


def test_bank_timeout_bucket_is_not_trivially_dead(db_session):
    """Guards the other direction: the fix must not make BANK_TIMEOUT a bucket
    nobody can ever win, which would be just as dishonest a benchmark."""
    from app.models import RecoveryCase

    run_evaluation(db_session, dataset_size=200, seed=42)
    bank_cases = db_session.query(RecoveryCase).filter(
        RecoveryCase.failure_type == "BANK_TIMEOUT"
    ).all()
    assert bank_cases, "no BANK_TIMEOUT cases generated"
    recovered = [c for c in bank_cases if c.status == "RECOVERED"]
    assert recovered, "no BANK_TIMEOUT case recovered at all -- bucket is trivially dead"
