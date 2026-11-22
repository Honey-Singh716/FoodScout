import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[1] / "foodscout_auth.sqlite3"
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    configured = os.getenv("FOODSCOUT_AUTH_DB")
    sqlite_path = Path(configured).expanduser() if configured else DEFAULT_SQLITE_PATH
    DATABASE_URL = f"sqlite:///{sqlite_path.as_posix()}"

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine_options = {
    "pool_pre_ping": True,
    "pool_recycle": 1800,
}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    engine_options.update(pool_size=10, max_overflow=20)

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
