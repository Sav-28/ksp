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


@router.get("/system/services")
async def system_services(
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Auditable inventory of Catalyst services.

    Every entry carries a status, the call site, and where a service is not live
    the exact reason. Services deliberately not used are included with the
    reasoning, so this is an account rather than a highlight reel.
    """
    from src.services import service_inventory
    return service_inventory.build()


@router.get("/system/info")
async def system_info(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Report the active database backend, persistence mode, and data counts."""
    from src.services import catalyst_store

    backend = engine.dialect.name
    is_sqlite = backend.startswith("sqlite")
    ephemeral_path = is_sqlite and ("/tmp" in DATABASE_URL or "\\temp" in DATABASE_URL.lower())
    store = catalyst_store.status()

    # SQLite on an ephemeral path is persistent ONLY when the Stratus snapshot
    # mechanism has actually completed an upload. Claiming persistence because
    # the mechanism is merely configured would be the same class of overstatement
    # this endpoint exists to prevent.
    snapshot_working = bool(store.get("writes_survive_restart"))
    if not is_sqlite:
        persistent, note = True, (
            "PostgreSQL — data persists across restarts and is shared by all instances."
        )
    elif not ephemeral_path:
        persistent, note = True, (
            "SQLite file storage on a durable path — persists locally, but is not "
            "shared across instances."
        )
    elif snapshot_working:
        persistent, note = True, (
            "SQLite on an ephemeral path, persisted by snapshotting the database file "
            "to the Catalyst Stratus object store after each write and restoring it on "
            "the first request after a restart. Single-instance: the whole file is the "
            "unit of transfer, so with more than one instance the last writer wins."
        )
    else:
        persistent, note = False, (
            "SQLite on an ephemeral path and no Stratus snapshot has completed yet, so "
            "writes would NOT survive a restart. The dataset itself is present because "
            "the seeded database ships with the deployment. "
            f"Snapshot state: restore={store.get('restore_result')}, "
            f"uploads={store.get('uploads_completed')}, "
            f"last_error={store.get('last_upload_error')}."
        )

    return {
        "database": {
            "backend": backend,
            "url": _redact(DATABASE_URL),
            "persistent": persistent,
            "note": note,
        },
        # Full snapshot state, so persistence can be audited rather than trusted.
        "persistence": store,
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
