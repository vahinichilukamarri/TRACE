import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.evaluation.runner import run_evaluation, get_run, EVAL_RUN_LOCK
from app.models import EvaluationRun

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.post("/run", response_model=schemas.EvaluationRunOut)
def trigger_evaluation(req: schemas.EvaluationRunRequest, db: Session = Depends(get_db)):
    if not EVAL_RUN_LOCK.acquire(blocking=False):
        raise HTTPException(409, "An evaluation run is already in progress; wait for it to finish.")
    # A request that does not pin a seed means "give me a NEW batch". Falling
    # through to settings.SIMULATION_SEED would replay the identical dataset
    # every time, so a second run finishes but changes nothing on screen and
    # looks like it did nothing. Pin `seed` explicitly to reproduce a run.
    seed = req.seed if req.seed is not None else random.randrange(1, 2**31 - 1)
    try:
        result = run_evaluation(
            db, dataset_size=req.dataset_size, seed=seed,
            demo_email=req.demo_email, demo_email_count=req.demo_email_count,
        )
        return schemas.EvaluationRunOut(**result)
    except Exception:
        # Never leave a partial batch's write transaction open on the pooled
        # connection -- that is what strands the SQLite writer lock.
        db.rollback()
        raise
    finally:
        EVAL_RUN_LOCK.release()


@router.get("/runs/{run_id}", response_model=schemas.EvaluationRunOut)
def fetch_run(run_id: str, db: Session = Depends(get_db)):
    result = get_run(db, run_id)
    if not result:
        raise HTTPException(404, "Evaluation run not found")
    return schemas.EvaluationRunOut(**result)


@router.get("/runs", response_model=list[schemas.EvaluationRunSummaryOut])
def list_runs(limit: int = 20, db: Session = Depends(get_db)):
    return db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(limit).all()
