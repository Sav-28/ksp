"""
Statistics / analytics endpoints for the KSP Crime AI dashboard.

Provides aggregated crime data used by the frontend Dashboard view:
- Overall totals
- Breakdown by district
- Breakdown by crime type
- Monthly trend
- Recent records
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, List
import logging

from src.database.session import get_db
from src.api.auth import get_current_user

router = APIRouter()


@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Return aggregated statistics for the dashboard.

    OUTPUT JSON:
    {
        "total_crimes": int,
        "total_districts": int,
        "total_crime_types": int,
        "by_district": [{"label": str, "count": int}, ...],
        "by_crime_type": [{"label": str, "count": int}, ...],
        "by_month": [{"label": "YYYY-MM", "count": int}, ...],
        "recent": [{...crime...}, ...]
    }
    """
    try:
        # Total crimes
        total_crimes = db.execute(text("SELECT COUNT(*) FROM crimes")).scalar() or 0

        # Distinct districts / crime types
        total_districts = db.execute(
            text("SELECT COUNT(DISTINCT district) FROM crimes WHERE district IS NOT NULL")
        ).scalar() or 0
        total_crime_types = db.execute(
            text("SELECT COUNT(DISTINCT crime_type) FROM crimes WHERE crime_type IS NOT NULL")
        ).scalar() or 0

        # Breakdown by district
        by_district = _rows_to_label_count(
            db.execute(text(
                """
                SELECT district AS label, COUNT(*) AS count
                FROM crimes
                WHERE district IS NOT NULL AND district != ''
                GROUP BY district
                ORDER BY count DESC
                """
            ))
        )

        # Breakdown by crime type
        by_crime_type = _rows_to_label_count(
            db.execute(text(
                """
                SELECT crime_type AS label, COUNT(*) AS count
                FROM crimes
                WHERE crime_type IS NOT NULL AND crime_type != ''
                GROUP BY crime_type
                ORDER BY count DESC
                """
            ))
        )

        # Monthly trend (SQLite strftime on the date_occurred column)
        by_month = _rows_to_label_count(
            db.execute(text(
                """
                SELECT strftime('%Y-%m', date_occurred) AS label, COUNT(*) AS count
                FROM crimes
                WHERE date_occurred IS NOT NULL
                GROUP BY label
                ORDER BY label ASC
                """
            ))
        )

        # Recent records (latest 10 by date)
        recent_proxy = db.execute(text(
            """
            SELECT * FROM crimes
            ORDER BY date_occurred DESC
            LIMIT 10
            """
        ))
        recent: List[Dict[str, Any]] = []
        for row in recent_proxy.fetchall():
            if hasattr(row, "_asdict"):
                recent.append(row._asdict())
            else:
                recent.append(dict(row._mapping))

        return {
            "total_crimes": total_crimes,
            "total_districts": total_districts,
            "total_crime_types": total_crime_types,
            "by_district": by_district,
            "by_crime_type": by_crime_type,
            "by_month": by_month,
            "recent": recent,
            "error": None,
        }

    except Exception as e:
        logging.error(f"Stats error: {str(e)}")
        return {
            "total_crimes": 0,
            "total_districts": 0,
            "total_crime_types": 0,
            "by_district": [],
            "by_crime_type": [],
            "by_month": [],
            "recent": [],
            "error": str(e),
        }


def _rows_to_label_count(result_proxy) -> List[Dict[str, Any]]:
    """Convert a (label, count) result set into a list of dicts."""
    out: List[Dict[str, Any]] = []
    for row in result_proxy.fetchall():
        mapping = row._mapping if hasattr(row, "_mapping") else row
        out.append({"label": mapping["label"], "count": mapping["count"]})
    return out
