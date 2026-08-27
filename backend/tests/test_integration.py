def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200


def test_ingest_creates_case_and_runs_first_decision(client):
    payload = {
        "payment_id": "PAY_TEST_001",
        "amount": 15000,
        "failure_code": "BANK_503",
        "customer_success_rate": 0.9,
        "previous_recovery_attempts": 0,
        "remaining_recovery_opportunities": 2,
    }
    resp = client.post("/cases/ingest", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["payment_id"] == "PAY_TEST_001"
    assert body["decision"] is not None
    assert body["policy"] is not None
    assert body["duplicate"] is False


def test_duplicate_ingest_is_detected(client):
    payload = {"payment_id": "PAY_TEST_DUP", "amount": 1000, "failure_code": "CARD_DECLINED"}
    r1 = client.post("/cases/ingest", json=payload)
    assert r1.json()["duplicate"] is False

    r2 = client.post("/cases/ingest", json=payload)
    assert r2.json()["duplicate"] is True


def test_get_case_detail_includes_audit_trail(client):
    payload = {"payment_id": "PAY_TEST_DETAIL", "amount": 3000, "failure_code": "AUTH_FAILURE"}
    client.post("/cases/ingest", json=payload)

    resp = client.get("/cases/PAY_TEST_DETAIL")
    assert resp.status_code == 200
    body = resp.json()
    assert body["payment_id"] == "PAY_TEST_DETAIL"
    assert len(body["audit_log"]) > 0
    assert len(body["decisions"]) >= 1


def test_get_missing_case_404s(client):
    resp = client.get("/cases/DOES_NOT_EXIST")
    assert resp.status_code == 404


def test_list_cases(client):
    client.post("/cases/ingest", json={"payment_id": "PAY_LIST_1", "amount": 1000, "failure_code": "BANK_503"})
    resp = client.get("/cases")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_evaluation_run_via_api(client):
    resp = client.post("/evaluation/run", json={"dataset_size": 12, "seed": 5})
    assert resp.status_code == 200
    body = resp.json()
    assert "TRACE" in body["results"]
    assert "BASELINE" in body["results"]

    run_id = body["run_id"]
    fetch = client.get(f"/evaluation/runs/{run_id}")
    assert fetch.status_code == 200


def test_dashboard_comparison_after_run(client):
    run_resp = client.post("/evaluation/run", json={"dataset_size": 12, "seed": 5})
    run_id = run_resp.json()["run_id"]

    resp = client.get(f"/dashboard/comparison?eval_run_id={run_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert "TRACE" in body and "BASELINE" in body


def test_click_endpoint_resolves_pending_outcome(client):
    # Force a case that should get SEND_RECOVERY_LINK by using CARD_DECLINED
    payload = {
        "payment_id": "PAY_CLICK_TEST", "amount": 8000, "failure_code": "CARD_DECLINED",
        "customer_success_rate": 0.8, "remaining_recovery_opportunities": 2,
    }
    client.post("/cases/ingest", json=payload)
    detail = client.get("/cases/PAY_CLICK_TEST").json()

    if detail["status"] == "OPEN" and any(o["outcome"] == "PENDING" for o in detail["outcomes"]):
        click_resp = client.post("/cases/PAY_CLICK_TEST/click")
        assert click_resp.status_code == 200
        updated = click_resp.json()
        assert updated["customer_engagement"] == "LINK_CLICKED"
