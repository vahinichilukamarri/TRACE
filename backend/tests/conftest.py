import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture(autouse=True)
def _hermetic_agent_mode(monkeypatch):
    """Pin the agent to HEURISTIC for the whole suite.

    AGENT_MODE is read from .env, so a developer running with ROUTED (or LLM)
    and a real key would have the test suite make live, billed, non-deterministic
    network calls -- observed: the suite went from ~21s to minutes. Tests that
    exercise routing pass mode= explicitly or monkeypatch settings themselves.
    """
    from app.config import settings
    monkeypatch.setattr(settings, "AGENT_MODE", "HEURISTIC")


@pytest.fixture()
def db_session(monkeypatch):
    """Fresh, isolated SQLite file per test so tests never share state."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)

    from app.database import Base
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    from app import models  # noqa: F401  (register models on Base.metadata)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    session = TestingSessionLocal()
    yield session
    session.close()
    engine.dispose()  # release all pooled connections so Windows will let go of the file handle
    try:
        os.remove(path)
    except PermissionError:
        # Windows sometimes needs a beat for the file handle to fully release
        # even after dispose(); it's a temp file, so leaking it is harmless.
        pass


@pytest.fixture()
def client(db_session, monkeypatch):
    """FastAPI TestClient wired to the isolated db_session fixture."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db
    from app.config import settings

    # Entering TestClient as a context manager fires the startup hook. Leave
    # auto-seed on and every client-using test would run a full evaluation
    # batch into the REAL trace.db -- slow, and it would pollute the developer's
    # database. Tests that want data create it explicitly.
    monkeypatch.setattr(settings, "AUTO_SEED_ON_STARTUP", False)

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
