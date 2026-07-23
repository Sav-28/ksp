"""
Statistical anomaly detection (Statement 2: "Anomaly Detection — visual
call-outs for incidents that deviate from standard behavioral patterns").

For each district and each crime type we build the monthly count series and
flag any month whose count deviates beyond a z-score threshold from that
series' historical mean — i.e. a statistically significant spike or drop.
This is deterministic, explainable statistics (no black box), suitable for a
law-enforcement setting.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, List
from datetime import date
import statistics

from src.database.session import get_db
from src.api.auth import get_current_user

router = APIRouter()

Z_THRESHOLD = 2.0        # flag months beyond 2 standard deviations
MIN_MONTHS = 4           # need enough history for a meaningful baseline
MIN_COUNT = 4            # ignore tiny series (noise)


def _series_anomalies(scope: str, name: str, series: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Flag anomalous months in one (district or crime-type) monthly series."""
    counts = [s["count"] for s in series]
    if len(counts) < MIN_MONTHS:
        return []
    mean = statistics.mean(counts)
    std = statistics.pstdev(counts)
    if std == 0:
        return []
    out = []
    for s in series:
        z = (s["count"] - mean) / std
        if abs(z) >= Z_THRESHOLD and s["count"] >= MIN_COUNT:
            direction = "spike" if z > 0 else "drop"
            severity = "High" if abs(z) >= 3 else "Medium"
            out.append({
                "scope": scope,
                "name": name,
                "month": s["month"],
                "count": s["count"],
                "baseline_mean": round(mean, 1),
                "std_dev": round(std, 1),
                "z_score": round(z, 2),
                "direction": direction,
                "severity": severity,
                "message": (
                    f"{name}: {s['count']} in {s['month']} is {abs(round(z, 1))}σ "
                    f"{'above' if z > 0 else 'below'} its {round(mean, 1)}/month norm."
                ),
            })
    return out


@router.get("/anomalies")
async def get_anomalies(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Detect statistically anomalous monthly crime counts per district & type."""
    def grouped_series(dimension: str) -> Dict[str, List[Dict[str, Any]]]:
        rows = db.execute(text(
            f"""
            SELECT {dimension} AS g, strftime('%Y-%m', date_occurred) AS m, COUNT(*) AS c
            FROM v_crimes
            WHERE date_occurred IS NOT NULL AND {dimension} IS NOT NULL
            GROUP BY g, m ORDER BY g, m ASC
            """
        )).fetchall()
        out: Dict[str, List[Dict[str, Any]]] = {}
        for r in rows:
            out.setdefault(r._mapping["g"], []).append(
                {"month": r._mapping["m"], "count": r._mapping["c"]})
        return out

    anomalies: List[Dict[str, Any]] = []
    for name, series in grouped_series("district").items():
        anomalies.extend(_series_anomalies("district", name, series))
    for name, series in grouped_series("crime_type").items():
        anomalies.extend(_series_anomalies("crime_type", name, series))

    # Mark anomalies in the most recent 2 months as "current" (actionable now).
    recent_months = sorted({a["month"] for a in anomalies}, reverse=True)[:2]
    for a in anomalies:
        a["current"] = a["month"] in recent_months

    # Sort: current first, then by magnitude.
    anomalies.sort(key=lambda a: (a["current"], abs(a["z_score"])), reverse=True)

    return {
        "anomalies": anomalies[:20],
        "total": len(anomalies),
        "current_count": sum(1 for a in anomalies if a["current"]),
        "method": f"z-score > {Z_THRESHOLD}σ on monthly counts per district and crime type",
    }
