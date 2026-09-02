import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import init_db, SessionLocal
from app.models import EvaluationRun, EvaluationResult
from app.evaluation.runner import run_evaluation, EVAL_RUN_LOCK
from app.routers import cases, evaluation, dashboard, policy_info

# uvicorn configures this logger, so these lines land in deployment logs.
logger = logging.getLogger("uvicorn.error")

app = FastAPI(
    title="TRACE - Transaction Recovery Agent with Contextual Evaluation",
    description=(
        "Bounded AI revenue-recovery agent. Evaluates whether a failed transaction "
        "is worth pursuing, selects and executes the most appropriate next "
        "intervention, adapts to outcomes, and proves its value against a static "
        "baseline workflow."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _has_completed_run(db: Session) -> bool:
    """Whether any *completed* evaluation run exists.

    Uses the same definition as the dashboard's _resolve_run_id: a run counts
    only once its EvaluationResult rows are written. A bare EvaluationRun row
    can be a crashed half-batch, which must not suppress seeding.
    """
    return (
        db.query(EvaluationRun)
        .join(EvaluationResult, EvaluationResult.run_id == EvaluationRun.id)
        .first()
        is not None
    )


def seed_initial_evaluation() -> None:
    """Give a freshly deployed instance real data to open on.

    Without this, every dashboard endpoint 404s on an empty database and the
    deployed link looks broken. Never raises: a failed seed degrades to that
    previous behaviour rather than taking the service down or looping the boot.
    """
    if not settings.AUTO_SEED_ON_STARTUP:
        logger.info("AUTO_SEED_ON_STARTUP is disabled; skipping startup seed.")
        return

    # Share the API's lock instead of bypassing it, so a request arriving
    # mid-boot cannot race the seed for SQLite's single writer slot.
    if not EVAL_RUN_LOCK.acquire(blocking=False):
        logger.warning("An evaluation run is already in progress; skipping startup seed.")
        return

    # Its own session, always closed, so the seed can never leave a stranded
    # SQLite write transaction behind.
    db = SessionLocal()
    try:
        if _has_completed_run(db):
            logger.info("Completed evaluation run already present; no startup seed needed.")
            return

        size = settings.AUTO_SEED_SIZE
        seed = settings.SIMULATION_SEED
        logger.info(
            "No completed evaluation run found; seeding one (size=%d, seed=%d)...", size, seed
        )
        started = time.perf_counter()

        # HEURISTIC is forced, never inherited from settings.AGENT_MODE: an
        # LLM-mode deployment would otherwise fire hundreds of API calls during
        # boot and hang startup.
        result = run_evaluation(db, dataset_size=size, seed=seed, agent_mode="HEURISTIC")

        elapsed = time.perf_counter() - started
        trace = result["results"]["TRACE"]
        logger.info(
            "Startup seed complete in %.2fs -- run_id=%s, %d cases, "
            "TRACE recovered %d/%d (Rs %.0f).",
            elapsed, result["run_id"], size,
            trace["transactions_recovered"], trace["total_failed_payments"],
            trace["revenue_recovered"],
        )
    except Exception:
        db.rollback()
        logger.exception(
            "Startup seed failed; starting anyway. The dashboard will stay empty "
            "until POST /evaluation/run is called."
        )
    finally:
        db.close()
        EVAL_RUN_LOCK.release()


@app.on_event("startup")
def on_startup():
    init_db()
    seed_initial_evaluation()


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "status": "ok",
        "agent_mode": settings.AGENT_MODE,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(cases.router)
app.include_router(evaluation.router)
app.include_router(dashboard.router)
app.include_router(policy_info.router)
