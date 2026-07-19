"""
AI Case Intelligence Briefing endpoint (Areas 2, 5, 6, 7, 9).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any

from src.database.session import get_db
from src.api.auth import get_current_user
from src.services.briefing import build_person_briefing

router = APIRouter()


@router.get("/briefing/person/{person_id}")
async def person_briefing(
    person_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate an AI intelligence briefing for a person, grounded in real data."""
    result = build_person_briefing(db, person_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    return result
