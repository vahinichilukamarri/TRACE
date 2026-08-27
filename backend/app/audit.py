"""Helpers for writing to the immutable audit trail (spec section 18)."""
from sqlalchemy.orm import Session

from app.models import AuditLogEntry
from app.enums import AuditEventType


def log_event(db: Session, case_id: int, event_type: AuditEventType, payload: dict | None = None,
              notes: str | None = None, commit: bool = True) -> AuditLogEntry:
    entry = AuditLogEntry(
        case_id=case_id,
        event_type=event_type.value if isinstance(event_type, AuditEventType) else event_type,
        payload=payload or {},
        notes=notes,
    )
    db.add(entry)
    if commit:
        db.flush()
    return entry
