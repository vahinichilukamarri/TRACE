from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

# check_same_thread=False: FastAPI serves sync endpoints from a threadpool.
# timeout: how long a connection waits for a lock before raising
# "database is locked" (SQLite default is only 5s, too short for a long
# multi-write batch like run_evaluation while the dashboard is polling).
connect_args = {"check_same_thread": False, "timeout": 30} if _is_sqlite else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)


if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        # WAL lets readers and a single writer run concurrently instead of
        # blocking each other -- without this, dashboard GETs during an
        # evaluation run can starve the run's writes until they time out.
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    # Import models so they're registered on Base.metadata before create_all
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # create_all only creates *missing tables* -- it will not add an index to a
    # table that already exists. Create them explicitly (checkfirst=True makes
    # this a no-op when they're already there) so an existing trace.db picks up
    # newly-declared indexes without being deleted and rebuilt.
    with engine.begin() as conn:
        for table in Base.metadata.tables.values():
            for index in table.indexes:
                index.create(bind=conn, checkfirst=True)
