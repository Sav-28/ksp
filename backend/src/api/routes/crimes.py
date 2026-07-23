"""
Crime / FIR registration endpoints — the platform's first WRITE workflow.

Registering an FIR creates rows across the linked intelligence schema in a
single atomic transaction:
  crimes          — the FIR core (+ auto-generated fir_number, created_by)
  fir_details     — investigation record (status starts at "Registered")
  persons         — new person rows (only if not already known)
  case_persons    — links each person to the crime with their role
  audit_logs      — an accountability entry (who registered what, when)

Access is role-gated (Area 10): investigators, duty officers, supervisors and
admins may register; analysts and policymakers may not (HTTP 403).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List, Optional
from datetime import datetime, date
import logging

from src.database.session import get_db
from src.database.models import Crime, FIRDetails, Person, CasePerson, AuditLog
from src.database import models_fir as F
from src.api.auth import (
    require_role, get_user_role, CAN_REGISTER_ROLES, CAN_UPDATE_ROLES,
    CAN_CLOSE_ROLES,
)
from src.services.crime_detail import get_crime_detail
from src.data.karnataka import DISTRICTS, DISTRICT_COORDS, POLICE_STATIONS

router = APIRouter()

# --- Reference data for the registration form -----------------------------
# Districts / coordinates / police stations come from src/data/karnataka.py
# (all 31 Karnataka districts + representative police stations).

CRIME_TYPES = [
    ("379", "Theft"), ("302", "Murder"), ("356", "Snatching"), ("392", "Robbery"),
    ("351", "Assault"), ("454", "Burglary"), ("146", "Rioting"), ("420", "Cheating"),
    ("463", "Forgery"), ("489A", "Counterfeiting"),
]
IPC_BY_TYPE = {name: sec for sec, name in CRIME_TYPES}

# crime_type -> major crime head/group (mirrors migrate_to_fir_schema.CRIME_META)
CRIME_GROUP = {
    "Theft": "Crimes Against Property", "Murder": "Crimes Against Body",
    "Snatching": "Crimes Against Property", "Robbery": "Crimes Against Property",
    "Assault": "Crimes Against Body", "Burglary": "Crimes Against Property",
    "Rioting": "Crimes Against Public Order", "Cheating": "Economic Crimes",
    "Forgery": "Economic Crimes", "Counterfeiting": "Economic Crimes",
}
HEINOUS = {"Murder", "Robbery", "Assault"}
GENDER_ID = {"Male": 1, "Female": 2, "Other": 3}

INVESTIGATION_STATUSES = [
    "Registered", "Under Investigation", "Chargesheet Filed",
    "Closed", "Convicted", "Acquitted",
]
# Officer ranks / designations an investigating officer realistically holds
# (mirrors the seeded official schema).
OFFICER_RANKS = [
    "Police Inspector", "Police Sub-Inspector", "Assistant Sub-Inspector",
    "Deputy Superintendent of Police", "Circle Inspector", "Head Constable",
]
OFFICER_DESIGNATIONS = [
    "Station House Officer", "Investigating Officer", "Circle Inspector",
    "Additional Superintendent", "Beat Officer",
]
# Terminal (case-closing) dispositions — restricted to supervisor/admin.
TERMINAL_STATUSES = {"Closed", "Convicted", "Acquitted"}
# Default case outcome to record when moving to a terminal status.
_OUTCOME_FOR_STATUS = {"Closed": "Closed", "Convicted": "Convicted", "Acquitted": "Acquitted"}
PERSON_ROLES = ["accused", "victim", "witness", "complainant"]
GENDERS = ["Male", "Female", "Other"]

# Accepted photo formats and max decoded size (~2 MB).
_PHOTO_PREFIXES = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/jpg;base64,")
_MAX_PHOTO_BYTES = 2 * 1024 * 1024


def _validate_photo(data_url) -> Optional[str]:
    """Validate an optional base64 image data URL. Returns the value if valid,
    None if not provided, or raises 422 if malformed/too large/wrong type."""
    if not data_url:
        return None
    if not isinstance(data_url, str) or not data_url.startswith(_PHOTO_PREFIXES):
        raise HTTPException(status_code=422, detail="Photo must be a JPEG or PNG data URL")
    b64 = data_url.split(",", 1)[1] if "," in data_url else ""
    # base64 expands ~4/3; approximate decoded size without full decode.
    approx_bytes = (len(b64) * 3) // 4
    if approx_bytes > _MAX_PHOTO_BYTES:
        raise HTTPException(status_code=422, detail="Photo too large (max 2 MB)")
    import base64 as _b64
    try:
        _b64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(status_code=422, detail="Photo is not valid base64")
    return data_url
EDUCATION = ["None", "Primary", "Secondary", "Graduate", "Postgraduate"]
SES = ["Low", "Lower-Middle", "Middle", "Upper-Middle", "High"]


@router.get("/reference/registration")
async def registration_reference(
    username: str = Depends(require_role(*CAN_REGISTER_ROLES)),
) -> Dict[str, Any]:
    """Dropdown/reference data for the FIR registration form."""
    return {
        "districts": DISTRICTS,
        "district_coords": {d: {"latitude": c[0], "longitude": c[1]} for d, c in DISTRICT_COORDS.items()},
        "police_stations": POLICE_STATIONS,
        "crime_types": [{"name": name, "ipc": sec} for sec, name in CRIME_TYPES],
        "investigation_statuses": INVESTIGATION_STATUSES,
        "officer_ranks": OFFICER_RANKS,
        "officer_designations": OFFICER_DESIGNATIONS,
        "person_roles": PERSON_ROLES,
        "genders": GENDERS,
        "education_levels": EDUCATION,
        "socio_economic_statuses": SES,
    }


def _next_id(db: Session, model, pk) -> int:
    """Next available integer primary key for an official-schema table."""
    return (db.query(func.max(pk)).scalar() or 0) + 1


def _ensure_official_district(db: Session, name: str) -> int:
    """Return the official DistrictID for a district name, creating it if new."""
    d = db.query(F.District).filter(F.District.DistrictName == name).first()
    if d:
        return d.DistrictID
    did = _next_id(db, F.District, F.District.DistrictID)
    db.add(F.District(DistrictID=did, DistrictName=name, StateID=1, Active=True))
    db.flush()
    return did


def _ensure_official_unit(db: Session, district_id: int, police_station: str) -> int:
    """Return the official UnitID for a police station, creating it if new."""
    if not police_station:
        return 0
    unit_name = f"{police_station} Police Station"
    u = db.query(F.Unit).filter(
        F.Unit.UnitName == unit_name, F.Unit.DistrictID == district_id
    ).first()
    if u:
        return u.UnitID
    uid = _next_id(db, F.Unit, F.Unit.UnitID)
    db.add(F.Unit(UnitID=uid, UnitName=unit_name, TypeID=1, ParentUnit=None,
                  NationalityID=1, StateID=1, DistrictID=district_id, Active=True))
    db.flush()
    return uid


def _generate_crime_no(db: Session, district_id: int, unit_id: int, year: int) -> str:
    """Build the official 18-digit CrimeNo:
    1(category=FIR) + 4(district) + 4(unit) + 4(year) + 5(serial)."""
    prefix = f"1{district_id:04d}{unit_id:04d}{year:04d}"
    # Serial = highest existing serial in this (unit, year) namespace + 1.
    existing = db.query(F.CaseMaster).filter(
        F.CaseMaster.CrimeNo.like(f"{prefix}%")
    ).count()
    serial = existing + 1
    crime_no = f"{prefix}{serial:05d}"
    while db.query(Crime).filter(Crime.fir_number == crime_no).first():
        serial += 1
        crime_no = f"{prefix}{serial:05d}"
    return crime_no


def _lookup_id(db: Session, model, id_col, name_col, name):
    row = db.query(model).filter(name_col == name).first()
    return getattr(row, id_col.key) if row else None


def _ensure_rank(db: Session, name: str) -> int:
    """Find or create a Rank by name; return its id."""
    r = db.query(F.Rank).filter(F.Rank.RankName == name).first()
    if r:
        return r.RankID
    new_id = (db.query(func.max(F.Rank.RankID)).scalar() or 0) + 1
    db.add(F.Rank(RankID=new_id, RankName=name, Hierarchy=new_id, Active=True))
    db.flush()
    return new_id


def _ensure_designation(db: Session, name: str) -> int:
    """Find or create a Designation by name; return its id."""
    d = db.query(F.Designation).filter(F.Designation.DesignationName == name).first()
    if d:
        return d.DesignationID
    new_id = (db.query(func.max(F.Designation.DesignationID)).scalar() or 0) + 1
    db.add(F.Designation(DesignationID=new_id, DesignationName=name, Active=True, SortOrder=new_id))
    db.flush()
    return new_id


def _resolve_officer(db: Session, name: Optional[str], district_id: int, unit_id: int,
                     rank_name: Optional[str] = None, desig_name: Optional[str] = None) -> Optional[int]:
    """Return the official Employee id for the investigating officer, creating a
    record (with the given rank/designation, posted to the station) if new — so
    the case dossier's officer/rank/designation panel is populated."""
    name = (name or "").strip()
    if not name:
        return None
    rank_name = (rank_name or "Police Inspector").strip() or "Police Inspector"
    desig_name = (desig_name or "Investigating Officer").strip() or "Investigating Officer"
    rank_id = _ensure_rank(db, rank_name)
    desig_id = _ensure_designation(db, desig_name)

    emp = db.query(F.Employee).filter(F.Employee.FirstName == name).first()
    if emp:
        # Keep the officer's rank/designation current with this filing.
        emp.RankID = rank_id
        emp.DesignationID = desig_id
        return emp.EmployeeID
    new_id = (db.query(func.max(F.Employee.EmployeeID)).scalar() or 0) + 1
    db.add(F.Employee(
        EmployeeID=new_id, FirstName=name, DistrictID=district_id, UnitID=unit_id or None,
        RankID=rank_id, DesignationID=desig_id, GenderID=1,
    ))
    db.flush()
    return new_id


def _create_official_case(db: Session, crime: Crime, fir: FIRDetails,
                          district_id: int, unit_id: int,
                          officer_rank: Optional[str] = None,
                          officer_designation: Optional[str] = None) -> None:
    """Create the official CaseMaster + occurrence record so the FIR is a
    first-class citizen of the system-of-record schema (and the detail view's
    police/court panel is populated)."""
    year = crime.date_occurred.year if crime.date_occurred else datetime.utcnow().year
    group = CRIME_GROUP.get(crime.crime_type)

    major_head = _lookup_id(db, F.CrimeHead, F.CrimeHead.CrimeHeadID,
                            F.CrimeHead.CrimeGroupName, group) if group else None
    minor_head = _lookup_id(db, F.CrimeSubHead, F.CrimeSubHead.CrimeSubHeadID,
                            F.CrimeSubHead.CrimeHeadName, crime.crime_type)
    status_id = _lookup_id(db, F.CaseStatusMaster, F.CaseStatusMaster.CaseStatusID,
                           F.CaseStatusMaster.CaseStatusName,
                           fir.investigation_status or "Registered")
    court = db.query(F.Court).filter(F.Court.DistrictID == district_id).first()
    if not court:
        # New district (no court seeded) — create its District & Sessions Court.
        dname = crime.district or "District"
        court_id = (db.query(func.max(F.Court.CourtID)).scalar() or 0) + 1
        court = F.Court(CourtID=court_id, CourtName=f"{dname} District & Sessions Court",
                        DistrictID=district_id, StateID=1, Active=True)
        db.add(court)
        db.flush()
    officer_id = _resolve_officer(db, fir.investigating_officer, district_id, unit_id,
                                  officer_rank, officer_designation)

    db.add(F.CaseMaster(
        CaseMasterID=crime.id,  # aligned id space (same bridge as the migration)
        CrimeNo=crime.fir_number,
        CaseNo=crime.fir_number[-9:],
        CrimeRegisteredDate=crime.date_occurred,
        PolicePersonID=officer_id,
        PoliceStationID=unit_id or None,
        CaseCategoryID=1,  # FIR
        GravityOffenceID=1 if crime.crime_type in HEINOUS else 2,
        CrimeMajorHeadID=major_head,
        CrimeMinorHeadID=minor_head,
        CaseStatusID=status_id,
        CourtID=court.CourtID if court else None,
    ))
    occ_from = None
    if crime.date_occurred:
        occ_from = datetime.combine(crime.date_occurred, datetime.min.time())
    db.add(F.Inv_OccuranceTime(
        CaseMasterID=crime.id,
        IncidentFromDate=occ_from,
        IncidentToDate=occ_from,
        InfoReceivedPSDate=occ_from,
        latitude=crime.latitude, longitude=crime.longitude,
        BriefFacts=crime.description,
    ))


def _resolve_person(db: Session, spec: Dict[str, Any]) -> Person:
    """Reuse an existing person (by id, or name+district) or create a new one.
    Keeps the criminal-network graph accurate by not duplicating known people."""
    photo = _validate_photo(spec.get("photo"))

    existing_id = spec.get("existing_id")
    if existing_id:
        person = db.get(Person, existing_id)
        if person:
            if photo:  # update photo if one was supplied for a known person
                person.photo = photo
            return person

    name = (spec.get("full_name") or "").strip()
    district = (spec.get("district") or "").strip()
    if name and district:
        match = db.query(Person).filter(
            func.lower(Person.full_name) == name.lower(),
            func.lower(Person.district) == district.lower(),
        ).first()
        if match:
            if photo:
                match.photo = photo
            return match

    # Create a new person from the supplied demographics.
    person = Person(
        full_name=name,
        age=spec.get("age"),
        gender=spec.get("gender"),
        occupation=spec.get("occupation"),
        education_level=spec.get("education_level"),
        socio_economic_status=spec.get("socio_economic_status"),
        address=spec.get("address"),
        district=district or None,
        phone_masked=spec.get("phone_masked"),
        risk_score=0.0,
        photo=photo,
    )
    db.add(person)
    db.flush()  # assign an id without committing the outer transaction
    return person


def _parse_date(value: Optional[str], field: str) -> date:
    if not value:
        raise HTTPException(status_code=422, detail=f"'{field}' is required")
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail=f"'{field}' must be YYYY-MM-DD")


@router.post("/crimes", status_code=status.HTTP_201_CREATED)
async def register_crime(
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    username: str = Depends(require_role(*CAN_REGISTER_ROLES)),
) -> Dict[str, Any]:
    """Register a new FIR with its people and investigation details."""
    # --- Validation --------------------------------------------------------
    crime_type = (request.get("crime_type") or "").strip()
    district = (request.get("district") or "").strip()
    if not crime_type:
        raise HTTPException(status_code=422, detail="'crime_type' is required")
    if not district:
        raise HTTPException(status_code=422, detail="'district' is required")

    date_occurred = _parse_date(request.get("date_occurred"), "date_occurred")
    if date_occurred > datetime.utcnow().date():
        raise HTTPException(status_code=422, detail="'date_occurred' cannot be in the future")

    persons_in: List[Dict[str, Any]] = request.get("persons") or []
    for p in persons_in:
        role = (p.get("role") or "").lower()
        if role not in PERSON_ROLES:
            raise HTTPException(status_code=422, detail=f"Invalid person role: '{p.get('role')}'")
        if not p.get("existing_id") and not (p.get("full_name") or "").strip():
            raise HTTPException(status_code=422, detail="Each person needs a name or an existing_id")

    # Location: use provided coords, else fall back to the district centroid.
    lat = request.get("latitude")
    lng = request.get("longitude")
    if lat is None or lng is None:
        coords = DISTRICT_COORDS.get(district)
        if coords:
            lat, lng = coords

    police_station = (request.get("police_station") or "").strip() or None

    # --- Atomic write ------------------------------------------------------
    try:
        # Official 18-digit CrimeNo, generated against the system-of-record
        # District/Unit tables (created on demand for a new district/station).
        district_id = _ensure_official_district(db, district)
        unit_id = _ensure_official_unit(db, district_id, police_station)
        year = date_occurred.year
        fir_number = _generate_crime_no(db, district_id, unit_id, year)

        crime = Crime(
            fir_number=fir_number,
            date_occurred=date_occurred,
            district=district,
            taluk=(request.get("taluk") or "").strip() or None,
            police_station=police_station,
            crime_type=crime_type,
            description=(request.get("description") or "").strip() or None,
            latitude=lat,
            longitude=lng,
            created_by=username,
            created_at=datetime.utcnow(),
        )
        db.add(crime)
        db.flush()  # assign crime.id

        ipc = (request.get("ipc_sections") or "").strip() or IPC_BY_TYPE.get(crime_type)
        fir = FIRDetails(
            crime_id=crime.id,
            investigation_status=(request.get("investigation_status") or "Registered"),
            investigating_officer=(request.get("investigating_officer") or "").strip() or None,
            ipc_sections=ipc,
            arrest_made=bool(request.get("arrest_made", False)),
            case_outcome="Pending",
            filed_date=date_occurred,
        )
        db.add(fir)

        # Mirror into the official FIR schema (best-effort; keeps CrimeNo real).
        _create_official_case(
            db, crime, fir, district_id, unit_id,
            officer_rank=(request.get("investigating_officer_rank") or "").strip() or None,
            officer_designation=(request.get("investigating_officer_designation") or "").strip() or None,
        )

        linked = []
        for spec in persons_in:
            person = _resolve_person(db, spec)
            link = CasePerson(
                crime_id=crime.id,
                person_id=person.id,
                role=(spec.get("role") or "").lower(),
            )
            db.add(link)
            linked.append({"id": person.id, "name": person.full_name, "role": link.role})

        # Governance: audit the write.
        db.add(AuditLog(
            username=username,
            query_text=f"REGISTER_FIR {fir_number} ({crime_type} in {district})",
            language="en",
            intent="REGISTER_FIR",
            confidence=1.0,
            sql_generated=None,
            row_count=1,
        ))

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logging.exception("FIR registration failed")
        raise HTTPException(status_code=500, detail=f"Registration failed: {e}")

    logging.info(f"FIR {fir_number} registered by '{username}'")
    detail = get_crime_detail(db, fir_number)
    return {"fir_number": fir_number, "created_by": username, "detail": detail}


def _sync_official_status(db: Session, crime: Crime, status_name: str) -> None:
    """Keep the official CaseMaster.CaseStatusID in sync with the analytics
    status, so the Case Investigation view (which reads the official schema)
    reflects the change. Creates the status master row if it doesn't exist."""
    cm = db.query(F.CaseMaster).filter(F.CaseMaster.CrimeNo == crime.fir_number).first()
    if not cm:
        return  # no official record (rare) — analytics update still applies
    sm = db.query(F.CaseStatusMaster).filter(
        F.CaseStatusMaster.CaseStatusName == status_name
    ).first()
    if not sm:
        next_id = (db.query(func.max(F.CaseStatusMaster.CaseStatusID)).scalar() or 0) + 1
        sm = F.CaseStatusMaster(CaseStatusID=next_id, CaseStatusName=status_name)
        db.add(sm)
        db.flush()
    cm.CaseStatusID = sm.CaseStatusID


@router.patch("/crimes/{fir_number}")
async def update_investigation(
    fir_number: str,
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    username: str = Depends(require_role(*CAN_UPDATE_ROLES)),
) -> Dict[str, Any]:
    """Update an FIR's investigation status / outcome.

    RBAC (two-tier):
      - Advancing status (Registered/Under Investigation/Chargesheet Filed):
        investigator, supervisor, admin.
      - CLOSING a case (Closed/Convicted/Acquitted): supervisor, admin only.
    """
    crime = db.query(Crime).filter(Crime.fir_number == fir_number).first()
    if not crime:
        raise HTTPException(status_code=404, detail=f"Case {fir_number} not found")

    fir = db.query(FIRDetails).filter(FIRDetails.crime_id == crime.id).first()
    if not fir:
        fir = FIRDetails(crime_id=crime.id)
        db.add(fir)

    new_status = request.get("investigation_status")
    if new_status is not None:
        if new_status not in INVESTIGATION_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid status: '{new_status}'")
        # Closing a case is a supervisory action.
        if new_status in TERMINAL_STATUSES and get_user_role(username) not in CAN_CLOSE_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Closing a case requires a supervisor or admin.",
            )
        fir.investigation_status = new_status
        _sync_official_status(db, crime, new_status)
        # Auto-fill closing metadata for terminal dispositions.
        if new_status in TERMINAL_STATUSES:
            fir.closed_date = date.today()
            if not request.get("case_outcome"):
                fir.case_outcome = _OUTCOME_FOR_STATUS.get(new_status, "Closed")

    if "case_outcome" in request and request.get("case_outcome"):
        fir.case_outcome = request.get("case_outcome")
    if "investigating_officer" in request:
        fir.investigating_officer = request.get("investigating_officer")
    if "arrest_made" in request:
        fir.arrest_made = bool(request.get("arrest_made"))
    if "court_status" in request:
        fir.court_status = request.get("court_status")

    db.add(AuditLog(
        username=username,
        query_text=f"UPDATE_FIR {fir_number} -> {new_status or fir.investigation_status}",
        language="en", intent="UPDATE_FIR", confidence=1.0, row_count=1,
    ))
    db.commit()

    return {"fir_number": fir_number, "detail": get_crime_detail(db, fir_number)}


@router.patch("/person/{person_id}/photo")
async def update_person_photo(
    person_id: int,
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    username: str = Depends(require_role(*CAN_REGISTER_ROLES)),
) -> Dict[str, Any]:
    """Attach or replace a person's photo (base64 data URL). Pass photo=null to clear."""
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    person.photo = _validate_photo(request.get("photo"))
    db.add(AuditLog(
        username=username,
        query_text=f"UPDATE_PERSON_PHOTO person_id={person_id}",
        language="en", intent="UPDATE_PERSON_PHOTO", confidence=1.0, row_count=1,
    ))
    db.commit()
    return {"person_id": person_id, "has_photo": bool(person.photo)}
