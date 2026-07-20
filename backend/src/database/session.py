"""
Database session management for KSP Crime AI.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
import os
from typing import Generator

# Database URL - can be overridden by environment variable
# For development, using SQLite for simplicity
# In production, use PostgreSQL as mentioned in README
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./ksp_crime_ai.db"  # SQLite for development
)

# For SQLite, we need special settings
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    # For PostgreSQL and other databases
    engine = create_engine(DATABASE_URL)

# Session maker
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    Dependency that provides a database session.
    Yields a session and ensures it's closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all database tables (analytics schema + official FIR schema)."""
    from .models import Base
    Base.metadata.create_all(bind=engine)
    # Official Karnataka Police FIR schema (system-of-record tables).
    try:
        from .models_fir import FIRBase
        FIRBase.metadata.create_all(bind=engine)
    except Exception:
        # Official schema is additive; never block startup if it can't build.
        pass