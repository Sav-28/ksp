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
    create_views()


# SQL that projects the normalized official FIR tables back into the flat
# "crimes" shape the analytics/query layer reads. This is the compatibility
# layer that lets the app run ON the official schema without rewriting every
# query: readers select FROM v_crimes instead of the old crimes table.
_V_CRIMES_SQL = """
CREATE VIEW v_crimes AS
SELECT cm.CaseMasterID          AS id,
       cm.CrimeNo               AS fir_number,
       cm.CrimeRegisteredDate   AS date_occurred,
       d.DistrictName           AS district,
       d.DistrictName           AS taluk,
       u.UnitName               AS police_station,
       sh.CrimeHeadName         AS crime_type,
       io.BriefFacts            AS description,
       io.latitude              AS latitude,
       io.longitude             AS longitude
FROM CaseMaster cm
LEFT JOIN CrimeSubHead sh     ON sh.CrimeSubHeadID = cm.CrimeMinorHeadID
LEFT JOIN Unit u              ON u.UnitID          = cm.PoliceStationID
LEFT JOIN District d          ON d.DistrictID      = u.DistrictID
LEFT JOIN Inv_OccuranceTime io ON io.CaseMasterID  = cm.CaseMasterID
"""


def create_views():
    """(Re)create compatibility views over the official FIR schema."""
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP VIEW IF EXISTS v_crimes"))
            conn.execute(text(_V_CRIMES_SQL.strip()))
    except Exception:
        # Views are read-optimizations; never block startup if they can't build.
        pass