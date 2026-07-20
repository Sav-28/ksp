"""
Shared service for assembling the full linked detail of a crime/FIR.
Used by both the conversational endpoint (follow-up detail questions) and
the REST detail endpoint.
"""
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

from src.database.models import Crime, FIRDetails, CasePerson, Person
from src.database import models_fir as F


def _official_police_details(db: Session, crime_no: str) -> Optional[Dict[str, Any]]:
    """Pull the police/court details for a case from the official FIR schema
    (joined off the CrimeNo, which equals the crime's fir_number)."""
    cm = db.query(F.CaseMaster).filter(F.CaseMaster.CrimeNo == crime_no).first()
    if not cm:
        return None
    emp = db.get(F.Employee, cm.PolicePersonID) if cm.PolicePersonID else None
    rank = db.get(F.Rank, emp.RankID) if emp and emp.RankID else None
    desig = db.get(F.Designation, emp.DesignationID) if emp and emp.DesignationID else None
    unit = db.get(F.Unit, cm.PoliceStationID) if cm.PoliceStationID else None
    court = db.get(F.Court, cm.CourtID) if cm.CourtID else None
    grav = db.get(F.GravityOffence, cm.GravityOffenceID) if cm.GravityOffenceID else None
    cat = db.get(F.CaseCategory, cm.CaseCategoryID) if cm.CaseCategoryID else None
    st = db.get(F.CaseStatusMaster, cm.CaseStatusID) if cm.CaseStatusID else None
    occ = db.query(F.Inv_OccuranceTime).filter(
        F.Inv_OccuranceTime.CaseMasterID == cm.CaseMasterID).first()
    return {
        "crime_no": cm.CrimeNo,
        "case_no": cm.CaseNo,
        "registered_date": str(cm.CrimeRegisteredDate) if cm.CrimeRegisteredDate else None,
        "category": cat.LookupValue if cat else None,
        "gravity": grav.LookupValue if grav else None,
        "case_status": st.CaseStatusName if st else None,
        "police_station": unit.UnitName if unit else None,
        "officer": emp.FirstName if emp else None,
        "officer_rank": rank.RankName if rank else None,
        "officer_designation": desig.DesignationName if desig else None,
        "court": court.CourtName if court else None,
        "incident_from": str(occ.IncidentFromDate) if occ and occ.IncidentFromDate else None,
        "incident_to": str(occ.IncidentToDate) if occ and occ.IncidentToDate else None,
        "info_received": str(occ.InfoReceivedPSDate) if occ and occ.InfoReceivedPSDate else None,
    }


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
        # Police station / officer / court from the official FIR schema.
        "police": _official_police_details(db, crime.fir_number),
    }
