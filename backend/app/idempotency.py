"""
Duplicate-event protection (spec section 19).

Every payment_id may only ever create one RecoveryCase. If the same event
arrives again, we must not create a duplicate case, not rerun the agent,
not resend anything, not re-execute anything -- we log the duplicate and
point back at the existing record.
"""
from sqlalchemy.orm import Session

from app.models import ProcessedEvent, RecoveryCase
from app.audit import log_event
from app.enums import AuditEventType


def get_existing_case(db: Session, payment_id: str) -> RecoveryCase | None:
    processed = db.query(ProcessedEvent).filter(ProcessedEvent.payment_id == payment_id).first()
    if processed:
        return db.query(RecoveryCase).filter(RecoveryCase.id == processed.case_id).first()
    return None


def register_new_event(db: Session, payment_id: str, case: RecoveryCase) -> ProcessedEvent:
    record = ProcessedEvent(payment_id=payment_id, case_id=case.id)
    db.add(record)
    db.flush()
    return record


def mark_duplicate(db: Session, payment_id: str, case: RecoveryCase) -> None:
    processed = db.query(ProcessedEvent).filter(ProcessedEvent.payment_id == payment_id).first()
    if processed:
        processed.duplicate_count += 1
        db.flush()
    log_event(
        db, case.id, AuditEventType.DUPLICATE_EVENT,
        payload={"payment_id": payment_id},
        notes="Duplicate payment event received; existing case reused, no reprocessing performed.",
    )
