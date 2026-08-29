"""
System / deployment diagnostics.

Exposes which database backend is active and whether storage is PERSISTENT —
important because SQLite on an ephemeral path (e.g. Catalyst /tmp) is wiped on
restart, whereas PostgreSQL persists. Surfacing this makes the deployment mode
explicit instead of a silent surprise.
"""
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any
import os

from src.database.session import get_db, engine, DATABASE_URL
from src.database.models import Crime, Person
from src.api.auth import get_current_user, require_role
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


# The digest is wanted before the morning briefing, not at midnight.
DIGEST_CRON_HOUR = int(os.getenv("KSP_DIGEST_HOUR", "7"))
DIGEST_CRON_NAME = "ksp-custody-clock-digest"


@router.get("/system/jobs")
async def list_jobs(
    username: str = Depends(require_role("admin")),
) -> Dict[str, Any]:
    """
    The project's jobpools and crons, as Catalyst reports them.

    Admin-only: a cron definition carries the scheduler's target URL, and there is
    no reason for anyone else to read the schedule.
    """
    from src.services import catalyst
    from src.api import auth as auth_mod

    pools = catalyst.list_jobpools()
    crons = catalyst.list_crons()
    diag = catalyst.diagnostics()

    return {
        "jobpools": pools,
        "crons": crons,
        "digest_schedule": {
            "cron_name": DIGEST_CRON_NAME,
            "hour_local": DIGEST_CRON_HOUR,
            "timezone": "Asia/Kolkata",
            "target": "AppSail -> GET /api/compliance/digest?send=true",
            "exists": bool(crons and any(
                c.get("cron_name") == DIGEST_CRON_NAME for c in crons)),
        },
        # Presence only. The token itself is never returned by any endpoint.
        "scheduler_token_configured": auth_mod.job_token_configured(),
        "appsail_target_id_present": bool(catalyst.appsail_target_id()),
        "prerequisites": {
            "jobpool": ("present" if pools else
                        "MISSING - create one in the Catalyst console (Job "
                        "Scheduling > Jobpool). This is the only blocker."),
            "scheduler_token": ("present" if auth_mod.job_token_configured() else
                                f"MISSING - set KSP_JOB_TOKEN to at least "
                                f"{auth_mod.MIN_JOB_TOKEN_LENGTH} random characters, "
                                f"otherwise the scheduled call cannot authenticate."),
        },
        "sdk_error": diag.get("last_job_error"),
    }


@router.post("/system/jobs/digest")
async def schedule_digest(
    username: str = Depends(require_role("admin")),
) -> Dict[str, Any]:
    """
    Schedule the custody-clock digest to run daily against this deployment.

    Admin-only, and refuses rather than half-works: without a scheduler token the
    created cron would fire and be rejected every morning, which is worse than
    not existing because it looks configured.

    The job targets this AppSail deployment directly - Catalyst Job Scheduling
    supports an AppSail target carrying a URL and headers, so no Catalyst
    Function and no second deployable is involved.
    """
    from src.services import catalyst
    from src.api import auth as auth_mod

    if not auth_mod.job_token_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"KSP_JOB_TOKEN is not set, or is shorter than "
                    f"{auth_mod.MIN_JOB_TOKEN_LENGTH} characters. Without it the "
                    f"scheduled request could not authenticate, so the cron would "
                    f"fail every morning while appearing to be configured."),
        )

    target_id = catalyst.appsail_target_id()
    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=("X_ZOHO_CATALYST_RESOURCE_ID is not set, so this process "
                    "cannot identify itself as the AppSail target. This endpoint "
                    "only works when running on Catalyst."),
        )

    pools = catalyst.list_jobpools()
    if not pools:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=("No jobpool exists in this Catalyst project. Create one in the "
                    "console under Job Scheduling, then retry. Reason from the "
                    "SDK: " + str(catalyst.diagnostics().get("last_job_error"))),
        )
    pool = pools[0]

    existing = catalyst.list_crons() or []
    already = next((c for c in existing
                    if c.get("cron_name") == DIGEST_CRON_NAME), None)
    if already:
        return {"created": False, "reason": "A digest cron already exists.",
                "cron": already}

    result = catalyst.create_daily_cron(
        cron_name=DIGEST_CRON_NAME,
        hour=DIGEST_CRON_HOUR,
        job_meta={
            "job_name": "custody-clock-digest",
            "jobpool_id": str(pool.get("id")),
            "jobpool_name": pool.get("name"),
            "target_type": "AppSail",
            "target_id": target_id,
            "url": "/api/compliance/digest?send=true",
            "request_method": "GET",
            # The secret travels in the job definition, which lives in Catalyst.
            # It is never echoed back by this endpoint or by /api/system/jobs.
            "headers": {auth_mod.JOB_TOKEN_HEADER: os.getenv("KSP_JOB_TOKEN", "")},
        },
    )

    if not result["created"]:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "Catalyst rejected the cron definition.",
                # Both cron_type spellings are attempted because the SDK
                # contradicts itself; the errors say which the API wanted.
                "attempts": result["attempts"],
            },
        )

    return {
        "created": True,
        "cron": result["cron"],
        "cron_type_accepted": result["cron_type_accepted"],
        "jobpool": {"id": pool.get("id"), "name": pool.get("name")},
        "schedule": f"daily at {DIGEST_CRON_HOUR:02d}:00 Asia/Kolkata",
        "note": ("The job calls this deployment's own digest endpoint with the "
                 "scheduler token. Mail delivery still depends on MAIL_FROM and "
                 "KSP_DIGEST_TO; without them the digest renders as a preview and "
                 "reports that it did not send."),
    }


@router.get("/system/zia-probe")
async def zia_probe(
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Discover whether Zia answers here, and in what shape.

    The Catalyst Python SDK's Zia response shapes are undocumented, and guessing
    SDK shapes has already cost this project three defects. So this sends one fixed
    sentence through each of the three text-analytics calls and returns the result
    VERBATIM - no normalising, no key picking - so the shape can be read off a real
    response before any feature is built on it.

    The sample is a synthetic complainant statement, chosen to contain the things a
    real one would: a person, a place, a vehicle, a valuable and an amount.
    """
    from src.services import catalyst

    sample = (
        "On 14 August 2026 at about 9 PM, the complainant Ramesh Kumar was "
        "returning to Jayanagar in Bengaluru when two men on a black Pulsar "
        "motorcycle snatched his gold chain worth Rs 85,000 near the bus stand "
        "and fled towards Wilson Garden."
    )

    def _attempt(label: str, fn) -> Dict[str, Any]:
        raw = fn([sample])
        return {
            "returned": raw is not None,
            "python_type": type(raw).__name__ if raw is not None else None,
            "raw": raw,
            "error": catalyst.diagnostics()["last_zia_error"] if raw is None else None,
        }

    return {
        "why": ("Zia response shapes are undocumented. This returns them raw so a "
                "feature can be built on the observed shape rather than a guess."),
        "sample_document": sample,
        "attempts": {
            "get_NER_prediction": _attempt("ner", catalyst.zia_ner),
            "get_keyword_extraction": _attempt("keywords", catalyst.zia_keywords),
            "get_sentiment_analysis": _attempt("sentiment", catalyst.zia_sentiment),
        },
        "sdk": catalyst.diagnostics(),
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
