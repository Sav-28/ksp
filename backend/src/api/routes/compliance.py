"""
Station compliance and pendency endpoints.

Separate from the analytics routes on purpose: these answer the operational
question a station actually opens the system for - which cases are about to
breach a deadline, and where is work piling up.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

from src.database.session import get_db
from src.api import auth
from src.api.auth import get_current_user
from src.services import compliance as svc
from src.services import cache

router = APIRouter()


def get_current_user_or_scheduler(authorization: Optional[str],
                                  job_token: Optional[str]) -> str:
    """
    Resolve the caller as either an officer or the scheduler.

    Local to this module, and used by exactly one route. Returning the principal
    rather than a bool means the endpoint can record WHICH credential was used.

    The job token is checked first because a scheduled call carries no
    Authorization header at all, and falling through to the bearer check would
    reject it with a message about a missing bearer token that would send someone
    debugging in the wrong direction.
    """
    if job_token is not None:
        if auth.verify_job_token(job_token):
            return auth.SCHEDULER_PRINCIPAL
        # A presented-but-wrong token is a failure in its own right. Falling back
        # to the bearer path here would turn a bad secret into a confusing 401
        # about a missing header.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid scheduler token.",
        )
    return get_current_user(authorization)


@router.get("/compliance/report")
async def compliance_report(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Full compliance picture: custody clock, pendency, stations, officers."""
    # Cached for 5 minutes: it aggregates four separate analyses and the custody
    # clock only changes when a case is registered, arrested or chargesheeted.
    data, source = cache.get_or_compute(
        "compliance:report:v1", 300, lambda: svc.compliance_report(db))
    # Shallow-copy before adding the cache block. On an in-process hit the object
    # returned IS the cached object, so annotating it in place would write this
    # request's cache metadata back into the stored entry - a response describing
    # the wrong tier is exactly the silent substitution this project reports
    # against. The nested analysis dicts are never mutated, so a shallow copy is
    # enough and avoids deep-copying a ~20 KB payload per request.
    return {**data, "cache": {"source": source, "ttl_seconds": 300}}


@router.get("/compliance/custody-clock")
async def custody_clock(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Cases where an accused is in custody and the chargesheet is not yet filed."""
    return svc.custody_clock(db)


@router.get("/compliance/digest")
async def compliance_digest(
    send: bool = False,
    authorization: Optional[str] = Header(default=None),
    x_ksp_job_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Custody-clock digest for a supervising officer.

    Defaults to send=false so opening the endpoint never dispatches mail; pass
    send=true (or point a scheduler at it) to deliver. When Mail is unconfigured
    the digest still renders and is returned as a preview.

    THIS IS THE ONLY ROUTE THAT ACCEPTS A SCHEDULER TOKEN. A Catalyst cron has no
    password and cannot hold a session, so it authenticates with the shared
    secret in X-KSP-Job-Token instead of a bearer token. The check is written out
    here rather than expressed as a reusable dependency on purpose: a dependency
    that grants access without a user identity would eventually be attached to a
    route that must never have it.

    Either credential is sufficient, neither is optional, and the response records
    which one was used so the audit trail distinguishes a scheduled run from an
    officer opening the screen.
    """
    caller = get_current_user_or_scheduler(authorization, x_ksp_job_token)

    from src.services import digest
    result = digest.build_and_maybe_send(db, send=send)
    result["requested_by"] = caller
    return result


@router.get("/compliance/stations")
async def station_scoreboard(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Per-station registration and disposal performance."""
    return svc.station_scoreboard(db)
