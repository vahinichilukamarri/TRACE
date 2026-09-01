import random
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.evaluation.runner import run_evaluation, get_run
from app.models import EvaluationRun

router = APIRouter(prefix="/evaluation", tags=["evaluation"])

# A batch run is a long, write-heavy job and SQLite allows only one writer.
# Serialize runs process-wide: a second concurrent POST /evaluation/run gets
# a clean 409 instead of racing the first for the write lock (which used to
# leave a half-finished run and a stranded transaction holding the lock).
_eval_run_lock = threading.Lock()


@router.post("/run", response_model=schemas.EvaluationRunOut)
def trigger_evaluation(req: schemas.EvaluationRunRequest, db: Session = Depends(get_db)):
    if not _eval_run_lock.acquire(blocking=False):
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
        _eval_run_lock.release()


@router.get("/runs/{run_id}", response_model=schemas.EvaluationRunOut)
def fetch_run(run_id: str, db: Session = Depends(get_db)):
    result = get_run(db, run_id)
    if not result:
        raise HTTPException(404, "Evaluation run not found")
    return schemas.EvaluationRunOut(**result)


@router.get("/runs")
def list_runs(limit: int = 20, db: Session = Depends(get_db)):
    runs = db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(limit).all()
    return [
        {"run_id": r.run_id, "dataset_size": r.dataset_size, "seed": r.seed, "created_at": r.created_at}
        for r in runs
    ]
