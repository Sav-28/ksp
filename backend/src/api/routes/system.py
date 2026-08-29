"""
System / deployment diagnostics.

Exposes which database backend is active and whether storage is PERSISTENT —
important because SQLite on an ephemeral path (e.g. Catalyst /tmp) is wiped on
restart, whereas PostgreSQL persists. Surfacing this makes the deployment mode
explicit instead of a silent surprise.
"""
from fastapi import APIRouter, Depends, Request
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


# Header and env names whose VALUES are safe to show: they are identifiers or
# URLs, not credentials. Everything else is reduced to present/absent + length.
_SAFE_TO_SHOW = {
    "x-zc-projectid", "x-zc-project-domain", "x-zc-environment",
    "x-zc-user-type", "x-zc-admin-cred-type", "x-zc-user-cred-type",
    "x_zoho_catalyst_org_id", "x_zoho_catalyst_console_url",
    "x_zoho_catalyst_accounts_url", "x_zoho_catalyst_is_local",
    "x_zoho_stratus_resource_suffix", "catalyst_portal_domain",
}


def _peek(name: str, value: str) -> Any:
    """Show identifiers, reduce anything that could be a credential to a shape."""
    if name.lower() in _SAFE_TO_SHOW:
        return value
    return {"present": True, "length": len(value)}


@router.get("/system/catalyst-probe")
async def catalyst_probe(
    request: Request,
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Evidence for why the Catalyst SDK does or does not initialise here.

    The SDK builds its credentials from X-ZC-* request headers held in a
    thread-local, so whether it works depends entirely on what the AppSail
    gateway forwards to this process. That is not documented anywhere we could
    find, so this endpoint reports the observed facts. Credential values are
    never returned, only their presence and length.
    """
    incoming = {k.lower(): v for k, v in request.headers.items()}
    catalyst_headers = {
        k: _peek(k, v) for k, v in sorted(incoming.items())
        if k.startswith("x-zc") or "catalyst" in k or k.startswith("x-zoho")
    }
    catalyst_env = {
        k: _peek(k, v) for k, v in sorted(os.environ.items())
        if "CATALYST" in k.upper() or "ZOHO" in k.upper() or "STRATUS" in k.upper()
    }

    # Both initialisation paths, attempted for real so the result is observed
    # rather than assumed. Neither can take the process down.
    attempts: Dict[str, Any] = {}
    try:
        import zcatalyst_sdk
        for label, call in (
            ("initialize()", lambda: zcatalyst_sdk.initialize()),
            ("initialize(req=request)", lambda: zcatalyst_sdk.initialize(req=request)),
        ):
            try:
                app = call()
                attempts[label] = {"ok": app is not None,
                                   "app": type(app).__name__ if app else None}
            except Exception as exc:
                attempts[label] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    except Exception as exc:
        attempts["import"] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    return {
        "why": "Determines whether AppSail forwards the X-ZC-* headers the SDK needs.",
        "all_incoming_header_names": sorted(incoming.keys()),
        "catalyst_request_headers": catalyst_headers,
        "catalyst_env_vars": catalyst_env,
        "sdk_init_attempts": attempts,
        "headers_the_sdk_needs": [
            "X-ZC-ProjectId", "X-ZC-Project-Domain", "X-ZC-Project-Key",
            "X-ZC-Environment", "X-ZC-Admin-Cred-Token", "X-ZC-Admin-Cred-Type",
            "X-ZC-User-Cred-Token or x-zc-cookie",
        ],
    }


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
    observed = store.get("evidence")
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
        # The wording names which half of the round trip was actually observed,
        # because "it is configured" and "it has been seen to work" are different
        # claims and only the second one belongs in this field.
        seen = (
            "This instance has already uploaded the database to Stratus, so its "
            "writes are safe."
            if observed == "upload" else
            "This instance cold-started with an empty /tmp and pulled the database "
            "back out of Stratus, so writes made before the restart demonstrably "
            "survived it."
        )
        persistent, note = True, (
            "SQLite on an ephemeral path, persisted by snapshotting the database file "
            "to the Catalyst Stratus object store after each write and restoring it on "
            f"the first request after a restart. {seen} Single-instance: the whole file "
            "is the unit of transfer, so with more than one instance the last writer wins."
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
