"""
Detail endpoints that expose the Phase 4 normalized intelligence model.

These return the full linked picture for a crime or a person — the foundation
the conversational interface (Phase 5) and analytics phases build on.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from src.database.session import get_db
from src.database.models import (
    Crime, FIRDetails, CasePerson, Person, Relationship,
    GangMember, Gang, FinancialAccount, Transaction
)
from src.api.auth import get_current_user

router = APIRouter()


def _person_brief(p: Person) -> Dict[str, Any]:
    return {
        "id": p.id,
        "name": p.full_name,
        "age": p.age,
        "gender": p.gender,
        "district": p.district,
        "occupation": p.occupation,
        "risk_score": p.risk_score,
    }


@router.get("/crime/{fir_number}")
async def get_crime_detail(
    fir_number: str,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Full detail for a single FIR: incident, investigation, people, and the
    official police/court details. Delegates to the shared service so the REST
    endpoint and the conversational follow-ups return identical, complete data."""
    from src.services.crime_detail import get_crime_detail as build_detail
    detail = build_detail(db, fir_number)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Case {fir_number} not found")
    return detail


@router.get("/person/{person_id}")
async def get_person_detail(
    person_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Full profile for a person: demographics, cases, gangs, associates, accounts."""
    person = db.query(Person).get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    # Cases this person is involved in
    links = db.query(CasePerson).filter(CasePerson.person_id == person_id).all()
    cases = []
    accused_count = 0
    for link in links:
        crime = db.query(Crime).get(link.crime_id)
        if crime:
            cases.append({
                "fir_number": crime.fir_number,
                "crime_type": crime.crime_type,
                "district": crime.district,
                "date": str(crime.date_occurred),
                "role": link.role,
            })
            if link.role == "accused":
                accused_count += 1

    # Gang memberships
    gangs = []
    for gm in db.query(GangMember).filter(GangMember.person_id == person_id).all():
        gang = db.query(Gang).get(gm.gang_id)
        if gang:
            gangs.append({"gang": gang.name, "role": gm.role, "activity": gang.primary_activity})

    # Known associates (relationship edges)
    associate_ids = set()
    for rel in db.query(Relationship).filter(
        (Relationship.person_a_id == person_id) | (Relationship.person_b_id == person_id)
    ).all():
        other = rel.person_b_id if rel.person_a_id == person_id else rel.person_a_id
        associate_ids.add(other)
    associates = [_person_brief(db.query(Person).get(pid)) for pid in associate_ids if db.query(Person).get(pid)]

    # Financial accounts
    accounts = [{
        "bank": a.bank_name, "type": a.account_type,
        "account": a.account_number_masked, "flagged": a.flagged,
    } for a in db.query(FinancialAccount).filter(FinancialAccount.person_id == person_id).all()]

    return {
        "id": person.id,
        "name": person.full_name,
        "demographics": {
            "age": person.age,
            "gender": person.gender,
            "occupation": person.occupation,
            "education": person.education_level,
            "socio_economic_status": person.socio_economic_status,
            "district": person.district,
            "phone": person.phone_masked,
        },
        "risk_score": person.risk_score,
        "is_repeat_offender": accused_count >= 2,
        "accused_in_n_cases": accused_count,
        "cases": cases,
        "gangs": gangs,
        "associates": associates,
        "financial_accounts": accounts,
    }
