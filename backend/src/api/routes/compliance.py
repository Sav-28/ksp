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

router = APIRouter()


@router.get("/compliance/report")
async def compliance_report(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Full compliance picture: custody clock, pendency, stations, officers."""
    return svc.compliance_report(db)


@router.get("/compliance/custody-clock")
async def custody_clock(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Cases where an accused is in custody and the chargesheet is not yet filed."""
    return svc.custody_clock(db)


@router.get("/compliance/stations")
async def station_scoreboard(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Per-station registration and disposal performance."""
    return svc.station_scoreboard(db)
