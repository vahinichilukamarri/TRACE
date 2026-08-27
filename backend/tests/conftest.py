import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


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
def client(db_session):
    """FastAPI TestClient wired to the isolated db_session fixture."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
