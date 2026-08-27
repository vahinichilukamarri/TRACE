from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.evaluation.runner import run_evaluation, get_run
from app.models import EvaluationRun

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.post("/run", response_model=schemas.EvaluationRunOut)
def trigger_evaluation(req: schemas.EvaluationRunRequest, db: Session = Depends(get_db)):
    result = run_evaluation(db, dataset_size=req.dataset_size, seed=req.seed)
    return schemas.EvaluationRunOut(**result)


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
