"""
Shared service for assembling the full linked detail of a crime/FIR.
Used by both the conversational endpoint (follow-up detail questions) and
the REST detail endpoint.
"""
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

from src.database.models import Crime, FIRDetails, CasePerson, Person


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


def get_crime_detail(db: Session, fir_number: str) -> Optional[Dict[str, Any]]:
    """Return the full linked detail for an FIR, or None if not found."""
    crime = db.query(Crime).filter(Crime.fir_number == fir_number).first()
    if not crime:
        return None

    fir = db.query(FIRDetails).filter(FIRDetails.crime_id == crime.id).first()
    links = db.query(CasePerson).filter(CasePerson.crime_id == crime.id).all()

    people_by_role: Dict[str, List[Dict[str, Any]]] = {}
    for link in links:
        person = db.query(Person).get(link.person_id)
        if person:
            people_by_role.setdefault(link.role, []).append(_person_brief(person))

    return {
        "fir_number": crime.fir_number,
        "crime_type": crime.crime_type,
        "date_occurred": str(crime.date_occurred),
        "district": crime.district,
        "police_station": crime.police_station,
        "description": crime.description,
        "location": {"latitude": crime.latitude, "longitude": crime.longitude},
        "investigation": {
            "status": fir.investigation_status if fir else None,
            "officer": fir.investigating_officer if fir else None,
            "ipc_sections": fir.ipc_sections if fir else None,
            "arrest_made": fir.arrest_made if fir else None,
            "outcome": fir.case_outcome if fir else None,
            "court_status": fir.court_status if fir else None,
        } if fir else None,
        "accused": people_by_role.get("accused", []),
        "victims": people_by_role.get("victim", []),
        "witnesses": people_by_role.get("witness", []),
    }
