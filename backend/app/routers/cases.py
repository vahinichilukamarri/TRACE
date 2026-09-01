import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app import schemas
from app.models import RecoveryCase, ProcessedEvent
from app.enums import CaseStatus, AuditEventType
from app.idempotency import get_existing_case, register_new_event, mark_duplicate
from app.engine import ensure_classified, run_iteration, TERMINAL_STATUSES
from app.execution import resolve_after_click
from app.audit import log_event

router = APIRouter(prefix="/cases", tags=["cases"])


def _case_to_detail(case: RecoveryCase) -> schemas.CaseDetailOut:
    data = schemas.CaseOut.model_validate(case).model_dump()
    data["decisions"] = [schemas.AgentDecisionOut.model_validate(d) for d in case.decisions]
    data["policy_checks"] = [schemas.PolicyCheckOut.model_validate(p) for p in case.policy_checks]
    data["executions"] = [schemas.ExecutionOut.model_validate(e) for e in case.executions]
    data["outcomes"] = [schemas.OutcomeOut.model_validate(o) for o in case.outcomes]
    data["audit_log"] = [schemas.AuditLogOut.model_validate(a) for a in
                          sorted(case.audit_logs, key=lambda x: x.timestamp)]
    return schemas.CaseDetailOut(**data)


@router.post("/ingest", response_model=schemas.ProcessResultOut)
def ingest_event(event: schemas.PaymentEventIn, run_first_iteration: bool = True,
                  db: Session = Depends(get_db)):
    existing = get_existing_case(db, event.payment_id)
    if existing:
        mark_duplicate(db, event.payment_id, existing)
        db.commit()
        return schemas.ProcessResultOut(
            payment_id=event.payment_id, status=existing.status,
            decision=None, policy=None, execution=None, outcome=None, duplicate=True,
        )

    case = RecoveryCase(
        payment_id=event.payment_id,
        amount=event.amount,
        currency=event.currency,
        customer_success_rate=event.customer_success_rate,
        previous_failures=event.previous_failures,
        previous_recovery_attempts=event.previous_recovery_attempts,
        previous_recovery_action=event.previous_recovery_action,
        previous_outcome=event.previous_outcome,
        customer_engagement=event.customer_engagement,
        time_since_failure_minutes=event.time_since_failure_minutes,
        remaining_recovery_opportunities=event.remaining_recovery_opportunities,
        customer_email=event.customer_email,
        status=CaseStatus.OPEN.value,
        source=event.source,
        system="TRACE",
    )
    db.add(case)
    db.flush()
    log_event(db, case.id, AuditEventType.CASE_CREATED, payload=event.model_dump())

    register_new_event(db, event.payment_id, case)
    ensure_classified(db, case, failure_code=event.failure_code, failure_message=event.failure_message)
    db.commit()
    db.refresh(case)

    if not run_first_iteration:
        return schemas.ProcessResultOut(
            payment_id=case.payment_id, status=case.status,
            decision=None, policy=None, execution=None, outcome=None,
        )

    rng = random.Random()
    step = run_iteration(db, case, rng, iteration=0, auto_resolve=False)
    db.commit()
    db.refresh(case)

    return schemas.ProcessResultOut(
        payment_id=case.payment_id,
        status=case.status,
        decision=schemas.AgentDecisionOut.model_validate(step["decision"]) if step["decision"] else None,
        policy=schemas.PolicyCheckOut.model_validate(step["policy"]) if step["policy"] else None,
        execution=schemas.ExecutionOut.model_validate(step["execution"]) if step["execution"] else None,
        outcome=schemas.OutcomeOut.model_validate(step["outcome"]) if step["outcome"] else None,
    )


@router.post("/{payment_id}/reassess", response_model=schemas.ProcessResultOut)
def reassess_case(payment_id: str, db: Session = Depends(get_db)):
    case = db.query(RecoveryCase).filter(RecoveryCase.payment_id == payment_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    if case.status in TERMINAL_STATUSES:
        raise HTTPException(409, f"Case is already in terminal status {case.status}; cannot reassess.")

    iteration = len(case.decisions)
    rng = random.Random()
    step = run_iteration(db, case, rng, iteration=iteration, auto_resolve=False)
    db.commit()
    db.refresh(case)

    return schemas.ProcessResultOut(
        payment_id=case.payment_id,
        status=case.status,
        decision=schemas.AgentDecisionOut.model_validate(step["decision"]) if step["decision"] else None,
        policy=schemas.PolicyCheckOut.model_validate(step["policy"]) if step["policy"] else None,
        execution=schemas.ExecutionOut.model_validate(step["execution"]) if step["execution"] else None,
        outcome=schemas.OutcomeOut.model_validate(step["outcome"]) if step["outcome"] else None,
    )


@router.post("/{payment_id}/click", response_model=schemas.CaseDetailOut)
def click_recovery_link(payment_id: str, db: Session = Depends(get_db)):
    case = db.query(RecoveryCase).filter(RecoveryCase.payment_id == payment_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    if case.status in TERMINAL_STATUSES:
        raise HTTPException(409, f"Case is already in terminal status {case.status}.")

    rng = random.Random()
    resolve_after_click(db, case, rng)
    db.commit()
    db.refresh(case)
    return _case_to_detail(case)


@router.get("/{payment_id}", response_model=schemas.CaseDetailOut)
def get_case(payment_id: str, db: Session = Depends(get_db)):
    case = (
        db.query(RecoveryCase)
        .options(joinedload(RecoveryCase.decisions), joinedload(RecoveryCase.policy_checks),
                 joinedload(RecoveryCase.executions), joinedload(RecoveryCase.outcomes),
                 joinedload(RecoveryCase.audit_logs))
        .filter(RecoveryCase.payment_id == payment_id)
        .first()
    )
    if not case:
        raise HTTPException(404, "Case not found")
    return _case_to_detail(case)


@router.get("", response_model=list[schemas.CaseOut])
def list_cases(status: str | None = None, system: str | None = None, source: str | None = None,
               eval_run_id: str | None = None,
               limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    query = db.query(RecoveryCase)
    if status:
        query = query.filter(RecoveryCase.status == status)
    if system:
        query = query.filter(RecoveryCase.system == system)
    if source:
        query = query.filter(RecoveryCase.source == source)
    if eval_run_id:
        query = query.filter(RecoveryCase.eval_run_id == eval_run_id)
    cases = query.order_by(RecoveryCase.created_at.desc()).offset(offset).limit(limit).all()
    return [schemas.CaseOut.model_validate(c) for c in cases]
