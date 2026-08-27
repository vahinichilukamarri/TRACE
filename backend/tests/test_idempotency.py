from app.models import RecoveryCase
from app.idempotency import get_existing_case, register_new_event, mark_duplicate
from app.audit import log_event
from app.enums import AuditEventType


def _make_case(db, payment_id="PAY_1"):
    case = RecoveryCase(payment_id=payment_id, amount=1000, status="OPEN", source="live", system="TRACE")
    db.add(case)
    db.flush()
    return case


def test_new_event_has_no_existing_case(db_session):
    assert get_existing_case(db_session, "PAY_NEW") is None


def test_registering_then_lookup_returns_case(db_session):
    case = _make_case(db_session)
    register_new_event(db_session, case.payment_id, case)
    db_session.commit()

    found = get_existing_case(db_session, case.payment_id)
    assert found is not None
    assert found.id == case.id


def test_duplicate_event_does_not_create_new_case(db_session):
    case = _make_case(db_session)
    register_new_event(db_session, case.payment_id, case)
    db_session.commit()

    total_cases_before = db_session.query(RecoveryCase).count()

    existing = get_existing_case(db_session, case.payment_id)
    mark_duplicate(db_session, case.payment_id, existing)
    db_session.commit()

    total_cases_after = db_session.query(RecoveryCase).count()
    assert total_cases_before == total_cases_after


def test_duplicate_event_is_logged(db_session):
    case = _make_case(db_session)
    register_new_event(db_session, case.payment_id, case)
    db_session.commit()

    existing = get_existing_case(db_session, case.payment_id)
    mark_duplicate(db_session, case.payment_id, existing)
    db_session.commit()

    from app.models import AuditLogEntry
    dup_logs = db_session.query(AuditLogEntry).filter(
        AuditLogEntry.case_id == case.id, AuditLogEntry.event_type == AuditEventType.DUPLICATE_EVENT.value
    ).all()
    assert len(dup_logs) == 1
