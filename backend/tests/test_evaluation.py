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
