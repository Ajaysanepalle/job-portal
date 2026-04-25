import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker


def _default_sqlite_url() -> str:
    """
    Default to a stable, repo-local path so data doesn't "disappear"
    when the app is started from different working directories.
    """
    data_dir = Path(__file__).resolve().parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "job_portal.db"
    # Absolute path for sqlite URLs must have 4 slashes.
    return f"sqlite:///{db_path.as_posix()}"


DATABASE_URL = os.getenv("DATABASE_URL") or _default_sqlite_url()

connect_args = {}
if DATABASE_URL.lower().startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
