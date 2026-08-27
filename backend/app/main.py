from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import cases, evaluation, dashboard

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


@app.on_event("startup")
def on_startup():
    init_db()


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
