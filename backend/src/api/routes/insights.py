"""
Sociological Crime Insights (Area 4) and Criminology-Based Offender
Profiling (Area 5).

Endpoints:
  - GET /api/sociological        — crime distribution by demographic/socio-economic attributes
  - GET /api/offenders           — ranked repeat offenders with computed risk scores
  - GET /api/offenders/{id}      — detailed offender profile + behavioural summary
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List
from collections import Counter
from datetime import date

from src.database.session import get_db
from src.database.models import Person, CasePerson, Crime, GangMember, Gang
from src.api.auth import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Area 4 — Sociological insights
# ---------------------------------------------------------------------------
def _age_band(age: int) -> str:
    if age is None:
        return "Unknown"
    if age < 25:
        return "18-24"
    if age < 35:
        return "25-34"
    if age < 45:
        return "35-44"
    if age < 60:
        return "45-59"
    return "60+"


@router.get("/sociological")
async def sociological_insights(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Demographic & socio-economic breakdown of ACCUSED persons."""
    # Join accused persons
    accused_links = db.query(CasePerson).filter(CasePerson.role == "accused").all()
    person_ids = [l.person_id for l in accused_links]
    persons = db.query(Person).filter(Person.id.in_(set(person_ids))).all() if person_ids else []
    pmap = {p.id: p for p in persons}

    age_bands = Counter()
    genders = Counter()
    ses = Counter()
    education = Counter()
    occupations = Counter()

    # Count by accused involvement (each accused link counts)
    for link in accused_links:
        p = pmap.get(link.person_id)
        if not p:
            continue
        age_bands[_age_band(p.age)] += 1
        genders[p.gender or "Unknown"] += 1
        ses[p.socio_economic_status or "Unknown"] += 1
        education[p.education_level or "Unknown"] += 1
        occupations[p.occupation or "Unknown"] += 1

    def to_list(counter, order=None):
        items = sorted(counter.items(), key=lambda x: x[1], reverse=True)
        return [{"label": k, "count": v} for k, v in items]

    # A simple social-risk insight: SES band with highest accused share
    top_ses = ses.most_common(1)[0][0] if ses else None
    top_age = age_bands.most_common(1)[0][0] if age_bands else None

    return {
        "by_age_band": to_list(age_bands),
        "by_gender": to_list(genders),
        "by_socio_economic": to_list(ses),
        "by_education": to_list(education),
        "by_occupation": to_list(occupations)[:8],
        "insights": {
            "highest_risk_ses": top_ses,
            "most_common_age_band": top_age,
            "total_accused_records": len(accused_links),
        },
    }


# ---------------------------------------------------------------------------
# Area 5 — Offender profiling & risk scoring
# ---------------------------------------------------------------------------
# Severity weights per crime type (criminological seriousness)
SEVERITY = {
    "Murder": 10, "Robbery": 8, "Rioting": 7, "Burglary": 6, "Assault": 6,
    "Snatching": 5, "Counterfeiting": 5, "Cheating": 4, "Forgery": 4, "Theft": 3,
}


def compute_risk(db: Session, person_id: int) -> Dict[str, Any]:
    """
    Compute a 0-100 risk score for a person from:
      - number of cases as accused (recidivism)
      - severity of associated crimes
      - gang membership
      - recency of activity
    Returns the score plus the factors used (for explainability — Area 9).
    """
    links = db.query(CasePerson).filter(
        CasePerson.person_id == person_id, CasePerson.role == "accused"
    ).all()
    n_cases = len(links)

    crime_types = []
    latest_year = 0
    for l in links:
        crime = db.query(Crime).get(l.crime_id)
        if crime:
            crime_types.append(crime.crime_type)
            if crime.date_occurred:
                latest_year = max(latest_year, crime.date_occurred.year)

    severity_total = sum(SEVERITY.get(ct, 3) for ct in crime_types)
    is_gang = db.query(GangMember).filter(GangMember.person_id == person_id).count() > 0

    # Recency: active within the last 2 years adds weight
    recency_bonus = 10 if latest_year >= (date.today().year - 1) else 0

    # Weighted score, capped at 100
    raw = (n_cases * 8) + (severity_total * 1.5) + (20 if is_gang else 0) + recency_bonus
    score = round(min(raw, 100.0), 1)

    return {
        "risk_score": score,
        "factors": {
            "cases_as_accused": n_cases,
            "severity_total": severity_total,
            "gang_member": is_gang,
            "recent_activity": recency_bonus > 0,
            "crime_types": list(Counter(crime_types).keys()),
        },
    }


@router.get("/offenders")
async def list_offenders(
    limit: int = 20,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Ranked list of repeat offenders by computed risk score."""
    # Persons accused in 2+ cases = repeat offenders
    rows = (
        db.query(CasePerson.person_id, func.count(CasePerson.id).label("n"))
        .filter(CasePerson.role == "accused")
        .group_by(CasePerson.person_id)
        .having(func.count(CasePerson.id) >= 2)
        .all()
    )

    offenders = []
    for person_id, n in rows:
        p = db.query(Person).get(person_id)
        if not p:
            continue
        risk = compute_risk(db, person_id)
        # Persist the score for reuse elsewhere
        p.risk_score = risk["risk_score"]
        offenders.append({
            "person_id": p.id,
            "name": p.full_name,
            "age": p.age,
            "gender": p.gender,
            "district": p.district,
            "cases": n,
            "risk_score": risk["risk_score"],
            "gang_member": risk["factors"]["gang_member"],
            "crime_types": risk["factors"]["crime_types"],
        })
    db.commit()

    offenders.sort(key=lambda x: x["risk_score"], reverse=True)
    return {"total_repeat_offenders": len(offenders), "offenders": offenders[:limit]}


@router.get("/offenders/{person_id}")
async def offender_profile(
    person_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Detailed behavioural profile of an offender (Area 5)."""
    p = db.query(Person).get(person_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    risk = compute_risk(db, person_id)
    p.risk_score = risk["risk_score"]
    db.commit()

    # Case history
    links = db.query(CasePerson).filter(
        CasePerson.person_id == person_id, CasePerson.role == "accused"
    ).all()
    cases = []
    crime_types = []
    for l in links:
        crime = db.query(Crime).get(l.crime_id)
        if crime:
            crime_types.append(crime.crime_type)
            cases.append({
                "fir_number": crime.fir_number, "crime_type": crime.crime_type,
                "district": crime.district, "date": str(crime.date_occurred),
            })
    cases.sort(key=lambda c: c["date"], reverse=True)

    # Gang affiliations
    gangs = []
    for gm in db.query(GangMember).filter(GangMember.person_id == person_id).all():
        g = db.query(Gang).get(gm.gang_id)
        if g:
            gangs.append({"gang": g.name, "role": gm.role, "activity": g.primary_activity})

    # Behavioural summary
    mo = Counter(crime_types)
    primary_mo = mo.most_common(1)[0][0] if mo else None
    risk_level = "High" if risk["risk_score"] >= 70 else "Medium" if risk["risk_score"] >= 40 else "Low"

    return {
        "person_id": p.id,
        "name": p.full_name,
        "demographics": {
            "age": p.age, "gender": p.gender, "occupation": p.occupation,
            "education": p.education_level, "socio_economic_status": p.socio_economic_status,
            "district": p.district,
        },
        "risk_score": risk["risk_score"],
        "risk_level": risk_level,
        "risk_factors": risk["factors"],
        "primary_modus_operandi": primary_mo,
        "crime_type_distribution": [{"label": k, "count": v} for k, v in mo.most_common()],
        "total_cases": len(cases),
        "case_history": cases,
        "gangs": gangs,
    }
