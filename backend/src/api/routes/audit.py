"""
Audit log endpoints — view the persisted query audit trail.
Restricted to authenticated users (admin role recommended).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Dict, Any, List

from src.database.session import get_db
from src.database.models import AuditLog
from src.api.auth import get_current_user

router = APIRouter()


@router.get("/audit")
async def get_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Return the most recent audit log entries.
    Requires authentication.
    """
    limit = max(1, min(limit, 500))  # clamp

    rows = (
        db.query(AuditLog)
        .order_by(desc(AuditLog.timestamp))
        .limit(limit)
        .all()
    )

    logs: List[Dict[str, Any]] = [
        {
            "id": r.id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "username": r.username,
            "query_text": r.query_text,
            "language": r.language,
            "intent": r.intent,
            "confidence": round(r.confidence, 3) if r.confidence is not None else None,
            "row_count": r.row_count,
        }
        for r in rows
    ]

    total = db.query(AuditLog).count()

    return {"total": total, "returned": len(logs), "logs": logs}
