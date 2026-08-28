"""
Case compliance and pendency monitoring.

WHY THIS EXISTS
---------------
The rest of the platform answers analytical questions ("where is crime rising?").
A police station runs on a different question entirely: *which of my cases is
about to breach a deadline?* That is the daily operational pressure, and it was
the one thing the platform could not answer.

Two distinct clocks are tracked, and keeping them separate is the whole point:

1. CUSTODY CLOCK (statutory).
   Under the Bharatiya Nagarik Suraksha Sanhita, 2023 s.187(3) - the successor to
   s.167(2) of the Code of Criminal Procedure - the investigation must be
   completed and a police report (chargesheet) filed within:
       90 days  for offences punishable with death, life imprisonment, or
                imprisonment of 10 years or more, and
       60 days  for other offences.
   The period runs from the date the accused was FIRST REMANDED TO CUSTODY, not
   from FIR registration. If the chargesheet is not filed in time, the accused
   becomes entitled to release on default bail. This is a hard legal consequence,
   which is why it is surfaced separately and prominently.

2. INVESTIGATION PENDENCY (performance).
   How long open cases have been open. There is no automatic legal consequence
   here; it is a disposal/performance measure of the kind reviewed at station and
   district level. Conflating it with the custody clock would raise false alarms
   on the large number of open cases with no arrested accused.

IMPORTANT: this module implements a MONITORING AID, not legal advice. Gravity
classification here is derived from the recorded offence category, and the actual
applicable period depends on the specific sections invoked and on orders of the
court. Every figure is traceable to a case so an officer can verify it.
"""
from __future__ import annotations

from typing import Dict, Any, List, Optional
from datetime import date
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import text

from src.database.models import Crime, FIRDetails
from src.database import models_fir as F

# Statutory chargesheet periods, in days, keyed by whether the offence is grave.
CUSTODY_LIMIT_HEINOUS = 90
CUSTODY_LIMIT_ORDINARY = 60

# How close to the limit before a case is escalated. These are operational
# review thresholds, not legal ones.
CRITICAL_DAYS_LEFT = 7
WARNING_DAYS_LEFT = 21

# Investigation-age buckets used for pendency reporting, in days.
AGE_BUCKETS = [(30, "0-30"), (60, "31-60"), (90, "61-90"), (180, "91-180")]
AGE_BUCKET_OVERFLOW = "Over 180"

LEGAL_BASIS = (
    "BNSS 2023 s.187(3) (formerly CrPC s.167(2)): chargesheet due within 90 days "
    "for offences punishable with death, life imprisonment or 10 years or more, "
    "and 60 days otherwise, counted from first remand. Lapse entitles the accused "
    "to default bail."
)

DISCLAIMER = (
    "Monitoring aid only, not legal advice. The applicable period depends on the "
    "sections invoked and on orders of the court; verify each case before acting."
)


def _bucket_for(days: int) -> str:
    for limit, label in AGE_BUCKETS:
        if days <= limit:
            return label
    return AGE_BUCKET_OVERFLOW


def _status_for(days_left: int) -> str:
    """Escalation band for a case still within, or past, its custody period."""
    if days_left < 0:
        return "Breached"
    if days_left <= CRITICAL_DAYS_LEFT:
        return "Critical"
    if days_left <= WARNING_DAYS_LEFT:
        return "Warning"
    return "On track"


def custody_clock(db: Session, today: Optional[date] = None) -> Dict[str, Any]:
    """
    Cases with an arrested accused and no chargesheet on record, with days
    remaining against the statutory period.

    Joined off the official FIR schema, which is where arrest events and
    chargesheets actually live: ArrestSurrender gives the remand date and
    ChargesheetDetails records whether a report has been filed.
    """
    today = today or date.today()

    # One query. Earliest arrest per case is the one the clock runs from.
    rows = db.execute(text(
        """
        SELECT cm."CaseMasterID"        AS case_id,
               cm."CrimeNo"             AS crime_no,
               MIN(a."ArrestSurrenderDate") AS arrest_date,
               g."LookupValue"          AS gravity,
               sh."CrimeHeadName"       AS crime_type,
               u."UnitName"             AS police_station,
               d."DistrictName"         AS district,
               st."CaseStatusName"      AS case_status
        FROM "ArrestSurrender" a
        JOIN "CaseMaster" cm            ON cm."CaseMasterID" = a."CaseMasterID"
        LEFT JOIN "ChargesheetDetails" cs ON cs."CaseMasterID" = cm."CaseMasterID"
        LEFT JOIN "GravityOffence" g    ON g."GravityOffenceID" = cm."GravityOffenceID"
        LEFT JOIN "CrimeSubHead" sh     ON sh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
        LEFT JOIN "Unit" u              ON u."UnitID" = cm."PoliceStationID"
        LEFT JOIN "District" d          ON d."DistrictID" = u."DistrictID"
        LEFT JOIN "CaseStatusMaster" st ON st."CaseStatusID" = cm."CaseStatusID"
        WHERE cs."CSID" IS NULL
          AND a."ArrestSurrenderDate" IS NOT NULL
        GROUP BY cm."CaseMasterID", cm."CrimeNo", g."LookupValue",
                 sh."CrimeHeadName", u."UnitName", d."DistrictName",
                 st."CaseStatusName"
        """
    )).fetchall()

    cases: List[Dict[str, Any]] = []
    counts: Dict[str, int] = defaultdict(int)

    for r in rows:
        m = r._mapping
        arrest = m["arrest_date"]
        if arrest is None:
            continue
        # SQLite hands back a string here; PostgreSQL a date object.
        if isinstance(arrest, str):
            try:
                arrest = date.fromisoformat(arrest[:10])
            except ValueError:
                continue
        elif hasattr(arrest, "date"):
            arrest = arrest.date()

        heinous = (m["gravity"] or "").strip().lower() == "heinous"
        limit = CUSTODY_LIMIT_HEINOUS if heinous else CUSTODY_LIMIT_ORDINARY
        elapsed = (today - arrest).days
        days_left = limit - elapsed
        status = _status_for(days_left)
        counts[status] += 1

        cases.append({
            "crime_no": m["crime_no"],
            "crime_type": m["crime_type"],
            "police_station": m["police_station"],
            "district": m["district"],
            "case_status": m["case_status"],
            "gravity": m["gravity"],
            "arrest_date": arrest.isoformat(),
            "days_in_custody": elapsed,
            "statutory_limit_days": limit,
            "days_remaining": days_left,
            "compliance_status": status,
        })

    # Most urgent first: breaches, then least time remaining.
    cases.sort(key=lambda c: c["days_remaining"])

    return {
        "total_under_clock": len(cases),
        "counts": {
            "breached": counts["Breached"],
            "critical": counts["Critical"],
            "warning": counts["Warning"],
            "on_track": counts["On track"],
        },
        "action_required": counts["Breached"] + counts["Critical"],
        "cases": cases,
        "legal_basis": LEGAL_BASIS,
        "disclaimer": DISCLAIMER,
    }


def investigation_pendency(db: Session, today: Optional[date] = None) -> Dict[str, Any]:
    """Age profile of open investigations - a disposal measure, not a legal one."""
    today = today or date.today()

    rows = db.query(FIRDetails.filed_date, FIRDetails.investigation_status,
                    Crime.district, Crime.police_station) \
             .join(Crime, Crime.id == FIRDetails.crime_id) \
             .filter(FIRDetails.closed_date.is_(None),
                     FIRDetails.filed_date.isnot(None)).all()

    buckets: Dict[str, int] = defaultdict(int)
    oldest_days = 0
    total = 0
    for filed, _status, _district, _station in rows:
        if isinstance(filed, str):
            try:
                filed = date.fromisoformat(filed[:10])
            except ValueError:
                continue
        days = (today - filed).days
        if days < 0:
            continue
        buckets[_bucket_for(days)] += 1
        oldest_days = max(oldest_days, days)
        total += 1

    ordered = [label for _, label in AGE_BUCKETS] + [AGE_BUCKET_OVERFLOW]
    return {
        "total_open": total,
        "oldest_open_days": oldest_days,
        "age_profile": [{"bucket": b, "count": buckets.get(b, 0)} for b in ordered],
        "note": ("Age of open investigations. This is a disposal measure with no "
                 "automatic legal consequence - distinct from the custody clock, "
                 "which applies only where an accused is in custody."),
    }


def station_scoreboard(db: Session, limit: int = 12) -> Dict[str, Any]:
    """
    Per-station disposal performance, the way station and district reviews are
    actually run: registered, disposed, still open, and disposal rate.
    """
    rows = db.execute(text(
        """
        SELECT c.police_station AS station,
               c.district       AS district,
               COUNT(*)                                            AS registered,
               SUM(CASE WHEN f.closed_date IS NOT NULL THEN 1 ELSE 0 END) AS disposed,
               SUM(CASE WHEN f.closed_date IS NULL THEN 1 ELSE 0 END)     AS still_open
        FROM crimes c
        JOIN fir_details f ON f.crime_id = c.id
        WHERE c.police_station IS NOT NULL
        GROUP BY c.police_station, c.district
        HAVING COUNT(*) >= 5
        ORDER BY still_open DESC
        """
    )).fetchall()

    stations = []
    for r in rows:
        m = r._mapping
        registered = m["registered"] or 0
        disposed = m["disposed"] or 0
        stations.append({
            "police_station": m["station"],
            "district": m["district"],
            "registered": registered,
            "disposed": disposed,
            "still_open": m["still_open"] or 0,
            "disposal_rate_pct": round(disposed / registered * 100, 1) if registered else 0.0,
        })

    # Rank by disposal rate so the scoreboard reads like a review sheet.
    by_rate = sorted(stations, key=lambda s: s["disposal_rate_pct"])
    return {
        "stations": stations[:limit],
        "lowest_disposal": by_rate[:5],
        "highest_disposal": list(reversed(by_rate[-5:])),
        "stations_reviewed": len(stations),
        "note": "Stations with at least 5 registered cases. Disposal rate is "
                "cases closed as a share of cases registered.",
    }


def officer_workload(db: Session) -> Dict[str, Any]:
    """
    Open cases per investigating officer. Uneven load is a real supervisory
    concern and is invisible in every other view.
    """
    rows = db.execute(text(
        """
        SELECT f.investigating_officer AS io,
               COUNT(*)                                                   AS total,
               SUM(CASE WHEN f.closed_date IS NULL THEN 1 ELSE 0 END)     AS open_cases,
               SUM(CASE WHEN f.arrest_made = 1 AND f.closed_date IS NULL
                        THEN 1 ELSE 0 END)                                AS open_with_arrest
        FROM fir_details f
        WHERE f.investigating_officer IS NOT NULL
        GROUP BY f.investigating_officer
        ORDER BY open_cases DESC
        """
    )).fetchall()

    officers = [{
        "officer": r._mapping["io"],
        "total_cases": r._mapping["total"] or 0,
        "open_cases": r._mapping["open_cases"] or 0,
        "open_with_accused_in_custody": r._mapping["open_with_arrest"] or 0,
    } for r in rows]

    open_counts = [o["open_cases"] for o in officers] or [0]
    average = sum(open_counts) / len(open_counts)
    # Flag anyone carrying materially more than the average.
    for o in officers:
        o["load_vs_average_pct"] = round(
            (o["open_cases"] - average) / average * 100, 1) if average else 0.0
        o["overloaded"] = o["open_cases"] > average * 1.25

    return {
        "officers": officers,
        "average_open_per_officer": round(average, 1),
        "overloaded_count": sum(1 for o in officers if o["overloaded"]),
        "note": "Open caseload per investigating officer. Overloaded flags an "
                "officer carrying more than 125% of the average open load.",
    }


def compliance_report(db: Session) -> Dict[str, Any]:
    """The whole station-compliance picture in one payload."""
    today = date.today()
    clock = custody_clock(db, today)
    pendency = investigation_pendency(db, today)
    return {
        "generated_at": today.isoformat(),
        "custody_clock": clock,
        "investigation_pendency": pendency,
        "station_scoreboard": station_scoreboard(db),
        "officer_workload": officer_workload(db),
        # Headline figures for the summary strip.
        "headline": {
            "action_required": clock["action_required"],
            "breached": clock["counts"]["breached"],
            "critical": clock["counts"]["critical"],
            "open_investigations": pendency["total_open"],
            "oldest_open_days": pendency["oldest_open_days"],
        },
    }
