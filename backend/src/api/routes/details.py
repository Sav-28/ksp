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
        "photo": p.photo,
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
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    # Cases this person is involved in. Crimes are loaded in one query keyed by
    # id; previously each link triggered its own lookup, which is a network
    # round-trip per case against managed PostgreSQL.
    links = db.query(CasePerson).filter(CasePerson.person_id == person_id).all()
    crime_ids = [l.crime_id for l in links if l.crime_id]
    crimes = {c.id: c for c in db.query(Crime).filter(Crime.id.in_(crime_ids))} \
        if crime_ids else {}
    cases = []
    accused_count = 0
    for link in links:
        crime = crimes.get(link.crime_id)
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

    # Gang memberships, joined in a single query instead of one per membership.
    memberships = db.query(GangMember).filter(GangMember.person_id == person_id).all()
    gang_ids = [gm.gang_id for gm in memberships if gm.gang_id]
    gang_map = {g.id: g for g in db.query(Gang).filter(Gang.id.in_(gang_ids))} \
        if gang_ids else {}
    gangs = [
        {"gang": gang_map[gm.gang_id].name, "role": gm.role,
         "activity": gang_map[gm.gang_id].primary_activity}
        for gm in memberships if gm.gang_id in gang_map
    ]

    # Known associates (relationship edges). The previous list comprehension
    # queried each associate TWICE - once in the `if` guard and once to build the
    # value - so a person with 10 associates cost 20 round-trips.
    associate_ids = set()
    for rel in db.query(Relationship).filter(
        (Relationship.person_a_id == person_id) | (Relationship.person_b_id == person_id)
    ).all():
        other = rel.person_b_id if rel.person_a_id == person_id else rel.person_a_id
        if other:
            associate_ids.add(other)
    associates = [
        _person_brief(p) for p in (
            db.query(Person).filter(Person.id.in_(associate_ids)).all()
            if associate_ids else []
        )
    ]

    # Financial accounts
    accounts = [{
        "bank": a.bank_name, "type": a.account_type,
        "account": a.account_number_masked, "flagged": a.flagged,
    } for a in db.query(FinancialAccount).filter(FinancialAccount.person_id == person_id).all()]

    return {
        "id": person.id,
        "name": person.full_name,
        "photo": person.photo,
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
