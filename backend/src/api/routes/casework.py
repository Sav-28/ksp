"""
Official-schema-native case analytics (built on the FIR system of record):

  - GET /api/clearance          — arrest rate + chargesheet/clearance rate,
                                  overall and per district
  - GET /api/officer-caseload   — cases handled per investigating officer

These are standard police performance metrics that the flat analytics schema
could not produce — they rely on the official CaseMaster / ArrestSurrender /
ChargesheetDetails / Unit / District / Employee tables.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, List

from src.database.session import get_db
from src.api.auth import get_current_user

router = APIRouter()


def _rate(n: int, total: int) -> float:
    return round(100.0 * n / total, 1) if total else 0.0


@router.get("/clearance")
async def clearance_metrics(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Arrest and chargesheet (clearance) rates, overall and per district."""
    total = db.execute(text("SELECT COUNT(*) FROM CaseMaster")).scalar() or 0
    with_arrest = db.execute(text(
        "SELECT COUNT(DISTINCT CaseMasterID) FROM ArrestSurrender")).scalar() or 0
    # cstype 'A' = chargesheet filed → the case is considered cleared/charged.
    chargesheeted = db.execute(text(
        "SELECT COUNT(DISTINCT CaseMasterID) FROM ChargesheetDetails WHERE cstype='A'")).scalar() or 0

    # Per-district breakdown (CaseMaster → Unit → District)
    rows = db.execute(text(
        """
        SELECT d.DistrictName AS district,
               COUNT(DISTINCT cm.CaseMasterID) AS total,
               COUNT(DISTINCT ars.CaseMasterID) AS arrested,
               COUNT(DISTINCT cs.CaseMasterID)  AS chargesheeted
        FROM CaseMaster cm
        LEFT JOIN Unit u      ON u.UnitID = cm.PoliceStationID
        LEFT JOIN District d  ON d.DistrictID = u.DistrictID
        LEFT JOIN ArrestSurrender ars ON ars.CaseMasterID = cm.CaseMasterID
        LEFT JOIN ChargesheetDetails cs ON cs.CaseMasterID = cm.CaseMasterID AND cs.cstype='A'
        WHERE d.DistrictName IS NOT NULL
        GROUP BY d.DistrictName
        ORDER BY total DESC
        """
    )).fetchall()
    by_district: List[Dict[str, Any]] = []
    for r in rows:
        m = r._mapping
        by_district.append({
            "district": m["district"],
            "total_cases": m["total"],
            "arrest_rate": _rate(m["arrested"], m["total"]),
            "clearance_rate": _rate(m["chargesheeted"], m["total"]),
        })

    return {
        "total_cases": total,
        "arrest_rate": _rate(with_arrest, total),
        "clearance_rate": _rate(chargesheeted, total),
        "cases_with_arrest": with_arrest,
        "cases_chargesheeted": chargesheeted,
        "by_district": by_district,
    }


@router.get("/officer-caseload")
async def officer_caseload(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Caseload per investigating officer (CaseMaster.PolicePersonID → Employee)."""
    rows = db.execute(text(
        """
        SELECT e.FirstName AS officer, r.RankName AS rank,
               COUNT(cm.CaseMasterID) AS cases
        FROM CaseMaster cm
        JOIN Employee e ON e.EmployeeID = cm.PolicePersonID
        LEFT JOIN Rank r ON r.RankID = e.RankID
        GROUP BY e.EmployeeID
        ORDER BY cases DESC
        """
    )).fetchall()
    officers = [{"officer": m["officer"], "rank": m["rank"], "cases": m["cases"]}
                for m in (row._mapping for row in rows)]
    return {"officers": officers, "officer_count": len(officers)}
