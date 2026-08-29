"""
Station compliance and pendency endpoints.

Separate from the analytics routes on purpose: these answer the operational
question a station actually opens the system for - which cases are about to
breach a deadline, and where is work piling up.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any

from src.database.session import get_db
from src.api.auth import get_current_user
from src.services import compliance as svc
from src.services import cache

router = APIRouter()


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
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Custody-clock digest for a supervising officer.

    Defaults to send=false so opening the endpoint never dispatches mail; pass
    send=true (or point a scheduler at it) to deliver. When Mail is unconfigured
    the digest still renders and is returned as a preview.
    """
    from src.services import digest
    return digest.build_and_maybe_send(db, send=send)


@router.get("/compliance/stations")
async def station_scoreboard(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Per-station registration and disposal performance."""
    return svc.station_scoreboard(db)
