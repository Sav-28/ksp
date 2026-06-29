"""
Crime Pattern, Trend & Hotspot Analytics (Challenge Area 3).

Endpoints:
  - GET /api/hotspots          — geographic crime points + district hotspots + emerging surges
  - GET /api/patterns/mo       — modus-operandi patterns (common descriptions per crime type)
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import Dict, Any, List
from datetime import date, timedelta

from src.database.session import get_db
from src.database.models import Crime
from src.api.auth import get_current_user

router = APIRouter()


@router.get("/hotspots")
async def get_hotspots(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Geographic crime distribution for the hotspot map + emerging surges."""
    crimes = db.query(Crime).all()

    # Individual points for the scatter/heat map
    points: List[Dict[str, Any]] = []
    for c in crimes:
        if c.latitude is not None and c.longitude is not None:
            points.append({
                "lat": c.latitude,
                "lng": c.longitude,
                "district": c.district,
                "crime_type": c.crime_type,
                "fir": c.fir_number,
                "date": str(c.date_occurred),
            })

    # District hotspots: count + centroid
    district_rows = db.execute(text(
        """
        SELECT district AS d, COUNT(*) AS cnt,
               AVG(latitude) AS lat, AVG(longitude) AS lng
        FROM crimes
        WHERE district IS NOT NULL AND district != ''
        GROUP BY district
        ORDER BY cnt DESC
        """
    )).fetchall()
    district_hotspots = [
        {"district": r._mapping["d"], "count": r._mapping["cnt"],
         "lat": round(r._mapping["lat"], 4) if r._mapping["lat"] else None,
         "lng": round(r._mapping["lng"], 4) if r._mapping["lng"] else None}
        for r in district_rows
    ]

    # Emerging surge: last 90 days vs previous 90 days, per district
    today = date.today()
    recent_start = today - timedelta(days=90)
    prev_start = today - timedelta(days=180)

    def counts_between(start, end):
        rows = db.execute(text(
            """
            SELECT district AS d, COUNT(*) AS cnt FROM crimes
            WHERE date_occurred >= :start AND date_occurred < :end
              AND district IS NOT NULL
            GROUP BY district
            """
        ), {"start": str(start), "end": str(end)}).fetchall()
        return {r._mapping["d"]: r._mapping["cnt"] for r in rows}

    recent = counts_between(recent_start, today)
    prev = counts_between(prev_start, recent_start)

    surges = []
    for district, rc in recent.items():
        pc = prev.get(district, 0)
        change = rc - pc
        pct = (change / pc * 100) if pc > 0 else (100.0 if rc > 0 else 0.0)
        if change > 0:
            surges.append({
                "district": district, "recent": rc, "previous": pc,
                "change": change, "pct_change": round(pct, 1),
            })
    surges.sort(key=lambda x: x["change"], reverse=True)

    # Bounding box of Karnataka data (for the map projection on the frontend)
    lats = [p["lat"] for p in points]
    lngs = [p["lng"] for p in points]
    bounds = {
        "min_lat": min(lats) if lats else 11.5, "max_lat": max(lats) if lats else 18.5,
        "min_lng": min(lngs) if lngs else 74.0, "max_lng": max(lngs) if lngs else 78.5,
    }

    return {
        "total_points": len(points),
        "points": points,
        "district_hotspots": district_hotspots,
        "emerging_surges": surges[:8],
        "bounds": bounds,
    }


@router.get("/patterns/mo")
async def get_mo_patterns(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Modus-operandi patterns: most common descriptions per crime type."""
    rows = db.execute(text(
        """
        SELECT crime_type AS ct, description AS descr, COUNT(*) AS cnt
        FROM crimes
        WHERE crime_type IS NOT NULL
        GROUP BY crime_type, description
        ORDER BY crime_type, cnt DESC
        """
    )).fetchall()

    patterns: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        m = r._mapping
        patterns.setdefault(m["ct"], []).append({"description": m["descr"], "count": m["cnt"]})

    # Keep top 3 MO per crime type
    result = [
        {"crime_type": ct, "patterns": pats[:3], "total": sum(p["count"] for p in pats)}
        for ct, pats in patterns.items()
    ]
    result.sort(key=lambda x: x["total"], reverse=True)
    return {"modus_operandi": result}
