"""
System / deployment diagnostics.

Exposes which database backend is active and whether storage is PERSISTENT —
important because SQLite on an ephemeral path (e.g. Catalyst /tmp) is wiped on
restart, whereas PostgreSQL persists. Surfacing this makes the deployment mode
explicit instead of a silent surprise.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any
import os

from src.database.session import get_db, engine, DATABASE_URL
from src.database.models import Crime, Person
from src.api.auth import get_current_user
from src.ml import risk_model

router = APIRouter()


def _redact(url: str) -> str:
    """Hide credentials in a database URL before returning it."""
    if "@" in url and "//" in url:
        head, tail = url.split("//", 1)
        if "@" in tail:
            return f"{head}//***:***@{tail.split('@', 1)[1]}"
    return url


@router.get("/system/info")
async def system_info(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Report the active database backend, persistence mode, and data counts."""
    backend = engine.dialect.name
    is_sqlite = backend.startswith("sqlite")
    # SQLite in a temp/ephemeral directory does not survive a restart.
    ephemeral_path = is_sqlite and ("/tmp" in DATABASE_URL or "\\temp" in DATABASE_URL.lower())
    persistent = (not is_sqlite) or (is_sqlite and not ephemeral_path)

    return {
        "database": {
            "backend": backend,
            "url": _redact(DATABASE_URL),
            "persistent": persistent,
            "note": (
                "PostgreSQL — data persists across restarts and is shared by all instances."
                if not is_sqlite else
                "SQLite on an ephemeral path — data is reset on restart. Set DATABASE_URL "
                "to PostgreSQL for production persistence."
                if ephemeral_path else
                "SQLite file storage — persists locally, but is not shared across instances."
            ),
        },
        "seeding": {
            "autoseed_enabled": os.getenv("KSP_AUTOSEED", "true").lower() != "false",
            "note": "Set KSP_AUTOSEED=false on a persistent database so real data is never re-seeded.",
        },
        "data": {
            "crimes": db.query(Crime).count(),
            "persons": db.query(Person).count(),
        },
        "ml_model": {
            "active": risk_model.is_available(),
            "runtime": "pure-Python inference (no sklearn/numpy required)",
        },
    }
