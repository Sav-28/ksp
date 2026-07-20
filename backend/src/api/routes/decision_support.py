"""
Investigator Decision Support (Area 6), Financial Crime Analysis (Area 7),
and Crime Forecasting & Early Warning (Area 8).

Endpoints:
  - GET /api/cases/{fir}/summary   — automated case summary + timeline + leads
  - GET /api/cases/{fir}/similar   — similar past cases & their outcomes
  - GET /api/financial/trails      — suspicious transaction money-trails
  - GET /api/forecast              — crime forecast + early-warning alerts
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Dict, Any, List
from datetime import date, timedelta
from collections import defaultdict

from src.database.session import get_db
from src.database.models import (
    Crime, FIRDetails, CasePerson, Person, FinancialAccount, Transaction
)
from src.api.auth import get_current_user
from src.services.crime_detail import get_crime_detail

router = APIRouter()


# ---------------------------------------------------------------------------
# Area 6 — Investigator decision support
# ---------------------------------------------------------------------------
@router.get("/cases/{fir_number}/summary")
async def case_summary(
    fir_number: str,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Automated case summary, timeline, and investigative leads."""
    detail = get_crime_detail(db, fir_number)
    if not detail:
        raise HTTPException(status_code=404, detail=f"FIR {fir_number} not found")

    crime = db.query(Crime).filter(Crime.fir_number == fir_number).first()
    fir = db.query(FIRDetails).filter(FIRDetails.crime_id == crime.id).first()

    accused_names = [a["name"] for a in detail["accused"]]
    victim_names = [v["name"] for v in detail["victims"]]

    # Natural-language summary
    summary = (
        f"FIR {fir_number} pertains to a {crime.crime_type.lower()} reported in "
        f"{crime.district} (Station: {crime.police_station}) on {crime.date_occurred}. "
    )
    if accused_names:
        summary += f"Accused: {', '.join(accused_names)}. "
    if victim_names:
        summary += f"Victim(s): {', '.join(victim_names)}. "
    if fir:
        summary += (
            f"The investigation is currently '{fir.investigation_status}' under "
            f"{fir.investigating_officer} (IPC {fir.ipc_sections}). "
            f"Outcome: {fir.case_outcome}."
        )

    # Timeline
    timeline = [{"date": str(crime.date_occurred), "event": "Crime occurred / reported"}]
    if fir and fir.filed_date:
        timeline.append({"date": str(fir.filed_date), "event": "FIR filed"})
    if fir and fir.arrest_made:
        timeline.append({"date": str(fir.filed_date), "event": "Arrest made"})
    if fir and fir.closed_date:
        timeline.append({"date": str(fir.closed_date), "event": f"Case {fir.case_outcome}"})

    # Investigative leads
    leads: List[str] = []
    for a in detail["accused"]:
        # Is the accused a repeat offender?
        n = db.query(CasePerson).filter(
            CasePerson.person_id == a["id"], CasePerson.role == "accused"
        ).count()
        if n >= 2:
            leads.append(f"{a['name']} is a repeat offender ({n} cases) — review prior case associates.")
    # Suspicious financial activity tied to this crime
    susp = db.query(Transaction).filter(
        Transaction.crime_id == crime.id, Transaction.is_suspicious == True  # noqa: E712
    ).count()
    if susp:
        leads.append(f"{susp} suspicious transaction(s) linked — pursue the financial trail.")
    if not leads:
        leads.append("No automated leads surfaced. Standard investigative procedure recommended.")

    return {
        "fir_number": fir_number,
        "summary": summary,
        "timeline": timeline,
        "leads": leads,
        "detail": detail,
    }


@router.get("/cases/{fir_number}/similar")
async def similar_cases(
    fir_number: str,
    limit: int = 5,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Find similar past cases by crime type, district, and modus operandi
    (description), returning their investigation outcomes.
    """
    crime = db.query(Crime).filter(Crime.fir_number == fir_number).first()
    if not crime:
        raise HTTPException(status_code=404, detail=f"FIR {fir_number} not found")

    candidates = db.query(Crime).filter(
        Crime.crime_type == crime.crime_type, Crime.id != crime.id
    ).all()

    def score(other: Crime) -> int:
        s = 2  # same crime type baseline
        if other.district == crime.district:
            s += 2
        if other.description and crime.description and other.description == crime.description:
            s += 3  # same MO
        return s

    ranked = sorted(candidates, key=score, reverse=True)[:limit]
    results = []
    for c in ranked:
        fir = db.query(FIRDetails).filter(FIRDetails.crime_id == c.id).first()
        results.append({
            "fir_number": c.fir_number,
            "crime_type": c.crime_type,
            "district": c.district,
            "date": str(c.date_occurred),
            "modus_operandi": c.description,
            "similarity": score(c),
            "outcome": fir.case_outcome if fir else None,
            "status": fir.investigation_status if fir else None,
        })

    # Outcome stats for these similar cases
    outcomes = defaultdict(int)
    for r in results:
        outcomes[r["outcome"] or "Unknown"] += 1

    return {
        "fir_number": fir_number,
        "reference_mo": crime.description,
        "similar_cases": results,
        "outcome_distribution": [{"label": k, "count": v} for k, v in outcomes.items()],
    }


# ---------------------------------------------------------------------------
# Area 7 — Financial crime & transaction analysis
# ---------------------------------------------------------------------------
@router.get("/financial/trails")
async def financial_trails(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Suspicious transaction money-trails linked to crimes."""
    suspicious = db.query(Transaction).filter(Transaction.is_suspicious == True).all()  # noqa: E712

    def acct_owner(account_id):
        acc = db.query(FinancialAccount).get(account_id) if account_id else None
        if not acc:
            return None, None
        owner = db.query(Person).get(acc.person_id)
        return (owner.full_name if owner else "Unknown"), acc.bank_name

    trails: List[Dict[str, Any]] = []
    total_amount = 0.0
    for tx in suspicious:
        from_name, from_bank = acct_owner(tx.from_account_id)
        to_name, to_bank = acct_owner(tx.to_account_id)
        crime = db.query(Crime).get(tx.crime_id) if tx.crime_id else None
        total_amount += tx.amount or 0
        trails.append({
            "id": tx.id,
            "amount": tx.amount,
            "date": str(tx.date),
            "from": {"name": from_name, "bank": from_bank},
            "to": {"name": to_name, "bank": to_bank},
            "linked_fir": crime.fir_number if crime else None,
            "linked_crime_type": crime.crime_type if crime else None,
        })

    trails.sort(key=lambda x: x["amount"], reverse=True)
    flagged_accounts = db.query(FinancialAccount).filter(FinancialAccount.flagged == True).count()  # noqa: E712

    return {
        "suspicious_transaction_count": len(trails),
        "total_suspicious_amount": round(total_amount, 2),
        "flagged_accounts": flagged_accounts,
        "trails": trails,
    }


# ---------------------------------------------------------------------------
# Area 8 — Crime forecasting & early warning
# ---------------------------------------------------------------------------
@router.get("/forecast")
async def forecast(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Simple trend-based forecast of monthly crime volume plus early-warning
    alerts for districts/crime types showing recent acceleration.
    """
    # Monthly totals
    rows = db.execute(text(
        """
        SELECT strftime('%Y-%m', date_occurred) AS m, COUNT(*) AS c
        FROM v_crimes WHERE date_occurred IS NOT NULL
        GROUP BY m ORDER BY m ASC
        """
    )).fetchall()
    monthly = [{"month": r._mapping["m"], "count": r._mapping["c"]} for r in rows]

    # Forecast next month via a 3-month moving average + simple trend
    forecast_value = None
    if len(monthly) >= 3:
        last3 = [m["count"] for m in monthly[-3:]]
        avg = sum(last3) / 3
        trend = (last3[-1] - last3[0]) / 2  # slope over the window
        forecast_value = max(0, round(avg + trend))

    # Early-warning alerts: districts with rising recent activity
    today = date.today()
    recent_start = today - timedelta(days=60)
    prev_start = today - timedelta(days=120)

    def dist_counts(start, end):
        r = db.execute(text(
            """
            SELECT district AS d, COUNT(*) AS c FROM v_crimes
            WHERE date_occurred >= :s AND date_occurred < :e AND district IS NOT NULL
            GROUP BY district
            """
        ), {"s": str(start), "e": str(end)}).fetchall()
        return {row._mapping["d"]: row._mapping["c"] for row in r}

    recent = dist_counts(recent_start, today)
    prev = dist_counts(prev_start, recent_start)
    alerts = []
    for d, rc in recent.items():
        pc = prev.get(d, 0)
        if rc > pc and rc >= 3:
            severity = "High" if rc >= pc * 2 and pc > 0 else "Medium"
            alerts.append({
                "type": "District surge",
                "district": d,
                "recent": rc,
                "previous": pc,
                "severity": severity,
                "message": f"{d}: crime up from {pc} to {rc} in the last 60 days.",
            })
    alerts.sort(key=lambda a: a["recent"] - a["previous"], reverse=True)

    return {
        "monthly_history": monthly,
        "next_month_forecast": forecast_value,
        "alerts": alerts[:8],
        "alert_count": len(alerts),
    }
