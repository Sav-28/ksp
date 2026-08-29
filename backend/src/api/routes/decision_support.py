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
from src.database.dialect import year_month
from src.ml.forecast_model import (
    backtest, forecast_next, split_complete_months, prediction_interval,
)

router = APIRouter()


def _next_month(month: str) -> str:
    """'2026-07' -> '2026-08'. Labels the forecast so the chart can name it."""
    try:
        y, m = (int(p) for p in month.split("-"))
        return f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"
    except (ValueError, AttributeError):
        return ""


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
    """
    Suspicious money trails, plus the aggregate views an investigator actually
    needs: who moves the most money, and which accounts look like layering.

    Previously this endpoint issued three queries PER transaction (account,
    owner, crime) to build the table. That is ~100 round-trips for the demo
    dataset, which is unnoticeable against local SQLite but adds seconds against
    managed PostgreSQL where every round-trip crosses the network. Everything is
    now bulk-loaded into dictionaries up front.
    """
    suspicious = db.query(Transaction).filter(Transaction.is_suspicious == True).all()  # noqa: E712

    # --- Bulk preload, so the loop below touches no database -----------------
    account_ids = {tx.from_account_id for tx in suspicious if tx.from_account_id} | \
                  {tx.to_account_id for tx in suspicious if tx.to_account_id}
    crime_ids = {tx.crime_id for tx in suspicious if tx.crime_id}

    accounts = {a.id: a for a in db.query(FinancialAccount)
                .filter(FinancialAccount.id.in_(account_ids))} if account_ids else {}
    person_ids = {a.person_id for a in accounts.values() if a.person_id}
    persons = {p.id: p for p in db.query(Person)
               .filter(Person.id.in_(person_ids))} if person_ids else {}
    crimes = {c.id: c for c in db.query(Crime)
              .filter(Crime.id.in_(crime_ids))} if crime_ids else {}

    def acct_view(account_id):
        """(display name, bank, account key) for one side of a transfer."""
        acc = accounts.get(account_id)
        if not acc:
            return None, None, None
        owner = persons.get(acc.person_id)
        return (owner.full_name if owner else "Unknown"), acc.bank_name, acc.id

    # --- Build the trail rows -----------------------------------------------
    trails: List[Dict[str, Any]] = []
    total_amount = 0.0
    # Per-account totals, used for the aggregate views.
    sent: Dict[int, float] = defaultdict(float)
    received: Dict[int, float] = defaultdict(float)
    sent_n: Dict[int, int] = defaultdict(int)
    received_n: Dict[int, int] = defaultdict(int)
    labels: Dict[int, Dict[str, Any]] = {}

    for tx in suspicious:
        from_name, from_bank, from_id = acct_view(tx.from_account_id)
        to_name, to_bank, to_id = acct_view(tx.to_account_id)
        crime = crimes.get(tx.crime_id) if tx.crime_id else None
        amount = tx.amount or 0
        total_amount += amount

        if from_id is not None:
            sent[from_id] += amount
            sent_n[from_id] += 1
            labels[from_id] = {"name": from_name, "bank": from_bank}
        if to_id is not None:
            received[to_id] += amount
            received_n[to_id] += 1
            labels[to_id] = {"name": to_name, "bank": to_bank}

        # State WHY the row is here. The rest of the platform shows its
        # reasoning, and a flat "suspicious" flag with no explanation is the one
        # place that didn't.
        reasons = []
        if amount >= 500000:
            reasons.append("high value")
        if crime is not None:
            reasons.append(f"linked to an active {crime.crime_type} case")
        acc_from = accounts.get(tx.from_account_id)
        acc_to = accounts.get(tx.to_account_id)
        if (acc_from is not None and acc_from.flagged) or \
           (acc_to is not None and acc_to.flagged):
            reasons.append("counterparty account flagged")

        trails.append({
            "id": tx.id,
            "amount": amount,
            "date": str(tx.date),
            "type": tx.transaction_type,
            "from": {"name": from_name, "bank": from_bank, "account_id": from_id},
            "to": {"name": to_name, "bank": to_bank, "account_id": to_id},
            "linked_fir": crime.fir_number if crime else None,
            "linked_crime_type": crime.crime_type if crime else None,
            "reasons": reasons or ["flagged by the monitoring rules"],
        })

    trails.sort(key=lambda x: x["amount"], reverse=True)

    # --- Top counterparties by total suspicious value ------------------------
    def top_accounts(totals: Dict[int, float], counts: Dict[int, int],
                     limit: int = 5) -> List[Dict[str, Any]]:
        ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:limit]
        return [{
            "account_id": aid,
            "name": labels.get(aid, {}).get("name") or "Unknown",
            "bank": labels.get(aid, {}).get("bank"),
            "amount": round(total, 2),
            "transactions": counts.get(aid, 0),
        } for aid, total in ranked]

    # --- Layering / pass-through detection ----------------------------------
    # An account that both RECEIVES and SENDS suspicious money is a classic
    # layering signal: value moves through it rather than terminating there.
    # This is what turns a flat transaction list into an actual finding, and the
    # seeded dataset contains a laundering ring built exactly this way.
    pass_through: List[Dict[str, Any]] = []
    for aid in set(sent) & set(received):
        in_amt, out_amt = received[aid], sent[aid]
        # How much of what came in went back out. Near 1.0 means the account is
        # a conduit; low values mean it mostly retained the funds.
        ratio = (out_amt / in_amt) if in_amt else 0.0
        pass_through.append({
            "account_id": aid,
            "name": labels.get(aid, {}).get("name") or "Unknown",
            "bank": labels.get(aid, {}).get("bank"),
            "received": round(in_amt, 2),
            "sent": round(out_amt, 2),
            "throughput_ratio": round(ratio, 2),
            "transactions": received_n.get(aid, 0) + sent_n.get(aid, 0),
            "signal": ("conduit - nearly all funds passed onward"
                       if ratio >= 0.8 else
                       "partial pass-through - some funds retained"),
        })
    pass_through.sort(key=lambda a: a["received"] + a["sent"], reverse=True)

    flagged_accounts = db.query(FinancialAccount).filter(FinancialAccount.flagged == True).count()  # noqa: E712

    return {
        "suspicious_transaction_count": len(trails),
        "total_suspicious_amount": round(total_amount, 2),
        "flagged_accounts": flagged_accounts,
        "largest_transaction": trails[0]["amount"] if trails else 0,
        "trails": trails,
        "top_senders": top_accounts(sent, sent_n),
        "top_receivers": top_accounts(received, received_n),
        "pass_through_accounts": pass_through[:6],
        "analysis_note": (
            "Pass-through accounts both receive and send flagged funds, which is a "
            "layering indicator. Throughput ratio is value sent divided by value "
            "received; near 1.0 means the account acted as a conduit."
        ),
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
        f"""
        SELECT {year_month('date_occurred')} AS m, COUNT(*) AS c
        FROM v_crimes WHERE date_occurred IS NOT NULL
        GROUP BY m ORDER BY m ASC
        """
    )).fetchall()
    monthly = [{"month": r._mapping["m"], "count": r._mapping["c"]} for r in rows]

    # Forecast the next month using the model selected by walk-forward
    # backtesting, and report its measured error (see src/ml/forecast_model.py).
    # The current calendar month is still accumulating records, so it is excluded
    # from training/evaluation — otherwise the partial count drags the trend down.
    current_month = date.today().strftime("%Y-%m")
    complete, partial = split_complete_months(monthly, current_month)
    series = [m["count"] for m in complete]

    backtest_result = backtest(series)
    chosen = backtest_result.get("method") if backtest_result.get("available") else None
    forecast_value = forecast_next(series, chosen)

    # A bare point forecast invites false confidence. Derive a range from the
    # error the backtest actually measured, so the number carries its own
    # uncertainty instead of looking exact.
    interval = None
    if forecast_value is not None and backtest_result.get("available"):
        interval = prediction_interval(
            forecast_value, (backtest_result.get("metrics") or {}).get("rmse"))

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

    def type_counts(start, end):
        r = db.execute(text(
            """
            SELECT crime_type AS d, COUNT(*) AS c FROM v_crimes
            WHERE date_occurred >= :s AND date_occurred < :e AND crime_type IS NOT NULL
            GROUP BY crime_type
            """
        ), {"s": str(start), "e": str(end)}).fetchall()
        return {row._mapping["d"]: row._mapping["c"] for row in r}

    def build_alerts(recent: dict, prev: dict, scope: str) -> List[Dict[str, Any]]:
        """
        Flag entities whose recent 60 days exceed the preceding 60 days.

        A jump from zero is treated as High: previously the severity rule required
        `pc > 0`, so a district going 0 -> 12 was reported as Medium while one
        going 6 -> 12 was High. That inverted the actual urgency.
        """
        out: List[Dict[str, Any]] = []
        for name, rc in recent.items():
            pc = prev.get(name, 0)
            if rc <= pc or rc < 3:
                continue
            if pc == 0:
                severity, change = "High", "new activity"
            elif rc >= pc * 2:
                severity, change = "High", f"{round((rc - pc) / pc * 100)}% increase"
            else:
                severity, change = "Medium", f"{round((rc - pc) / pc * 100)}% increase"
            out.append({
                "type": f"{scope} surge",
                "scope": scope.lower(),
                # `district` is kept for backward compatibility with the existing
                # UI, which reads it directly.
                "district": name,
                "name": name,
                "recent": rc,
                "previous": pc,
                "change": change,
                "severity": severity,
                "message": (f"{name}: {rc} cases in the last 60 days vs {pc} in the "
                            f"60 before ({change})."),
            })
        return out

    recent = dist_counts(recent_start, today)
    prev = dist_counts(prev_start, recent_start)
    alerts = build_alerts(recent, prev, "District")
    # Crime-type surges as well, so the `type` field carries real information
    # instead of always saying "District surge".
    alerts += build_alerts(type_counts(recent_start, today),
                           type_counts(prev_start, recent_start), "Crime type")
    alerts.sort(key=lambda a: (a["severity"] == "High", a["recent"] - a["previous"]),
                reverse=True)

    return {
        "monthly_history": monthly,
        "next_month_forecast": forecast_value,
        "forecast_interval": interval,
        # The forecast is one step past the last COMPLETE month, which is
        # normally the month currently in progress. Saying so - and showing the
        # running count - is more useful than an unqualified "next month", and
        # avoids implying we are predicting a month that has not started.
        "forecast_month": _next_month(complete[-1]["month"]) if complete else None,
        "forecast_is_current_month": bool(partial and
                                          _next_month(complete[-1]["month"]) == partial["month"]
                                          if complete else False),
        "partial_month": partial["month"] if partial else None,
        "partial_month_count_so_far": partial["count"] if partial else None,
        "alerts": alerts[:10],
        "alert_count": len(alerts),
        # Explainable AI: the forecast now carries its own accuracy, measured by
        # walk-forward backtesting, plus the naive baseline it beats.
        "model": {
            "name": backtest_result.get("method"),
            "validation": backtest_result.get("validation"),
            "metrics": backtest_result.get("metrics"),
            "baseline": backtest_result.get("baseline"),
            "improvement_over_baseline_pct": backtest_result.get("improvement_over_baseline_pct"),
            "evaluated_months": backtest_result.get("evaluated_months"),
            "available": backtest_result.get("available", False),
            "reason": backtest_result.get("reason"),
            "excluded_partial_month": partial["month"] if partial else None,
        },
    }
