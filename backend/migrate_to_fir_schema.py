"""
Project the existing analytics data (crimes / persons / fir_details / case_persons)
into the OFFICIAL Karnataka Police FIR schema (models_fir.py).

This makes the database schema-compliant with the hackathon ER diagram WITHOUT
destroying the working analytics layer. It is:
  - idempotent  : wipes and rebuilds only the official FIR tables on each run,
  - deterministic: same input rows → same official rows.

The one field it updates on the analytics side is crimes.fir_number, which is
set to the official CrimeNo so the whole app presents a single official
identifier (the analytics rows otherwise stay intact).

Run:  python migrate_to_fir_schema.py
"""
import sys
import os
import random
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, date, timedelta

from src.database.session import SessionLocal, create_tables, engine
from src.database.models import Crime, FIRDetails, CasePerson, Person
from src.database import models_fir as F

random.seed(2025)  # deterministic generation

# --- Reference metadata ----------------------------------------------------
KARNATAKA_STATE_ID = 1
INDIAN_NATIONALITY_ID = 1

# Police ranks (RankID, name, hierarchy — lower = more senior)
RANKS = [
    "Director General of Police", "Inspector General of Police",
    "Superintendent of Police", "Deputy Superintendent of Police",
    "Police Inspector", "Police Sub-Inspector", "Head Constable", "Police Constable",
]
# Ranks an investigating/registering officer realistically holds
IO_RANKS = ["Police Inspector", "Police Sub-Inspector"]
DESIGNATIONS = [
    "Station House Officer", "Investigating Officer", "Circle Inspector",
    "Additional Superintendent", "Beat Officer",
]
BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]  # BloodGroupID = index+1
RELIGIONS = ["Hindu", "Muslim", "Christian", "Jain", "Sikh", "Buddhist", "Other"]
RELIGION_WEIGHTS = [72, 13, 5, 4, 2, 2, 2]
# Caste category (neutral reference lookup, as recorded on a standard FIR)
CASTES = ["General", "OBC", "SC", "ST", "Other"]
CASTE_WEIGHTS = [30, 40, 18, 8, 4]
UNIT_TYPES = [
    ("Police Station", "City", 3), ("Circle Office", "District", 2),
    ("District Headquarters", "District", 1), ("City Commissionerate", "City", 1),
]

# crime_type -> (IPC section, major crime head/group)
CRIME_META = {
    "Theft":          ("379",  "Crimes Against Property"),
    "Murder":         ("302",  "Crimes Against Body"),
    "Snatching":      ("356",  "Crimes Against Property"),
    "Robbery":        ("392",  "Crimes Against Property"),
    "Assault":        ("351",  "Crimes Against Body"),
    "Burglary":       ("454",  "Crimes Against Property"),
    "Rioting":        ("146",  "Crimes Against Public Order"),
    "Cheating":       ("420",  "Economic Crimes"),
    "Forgery":        ("463",  "Economic Crimes"),
    "Counterfeiting": ("489A", "Economic Crimes"),
}
HEINOUS = {"Murder", "Robbery", "Assault"}

# Investigation status -> chargesheet final-report type (cstype)
CS_TYPE = {"Chargesheet Filed": "A", "Closed": "C", "Convicted": "A", "Acquitted": "A"}

# Case category codes (1-digit prefix of CrimeNo). All seeded data are FIRs.
CASE_CATEGORY_CODE = {"FIR": 1, "UDR": 3, "PAR": 4, "Zero FIR": 8}

GENDER_ID = {"Male": 1, "Female": 2, "Other": 3, "M": 1, "F": 2, "T": 3}


def _clear_official(db):
    """Delete all rows from the official FIR tables (in FK-safe order)."""
    for model in [
        F.inv_arrestsurrenderaccused, F.ChargesheetDetails, F.ArrestSurrender,
        F.ActSectionAssociation, F.ComplainantDetails, F.Victim, F.Accused,
        F.Inv_OccuranceTime, F.CaseMaster, F.CrimeHeadActSection, F.Section, F.Act,
        F.CrimeSubHead, F.CrimeHead, F.Court, F.Employee, F.Unit, F.UnitType,
        F.Rank, F.Designation, F.District, F.State,
        F.CaseCategory, F.GravityOffence, F.CaseStatusMaster,
        F.OccupationMaster, F.ReligionMaster, F.CasteMaster,
    ]:
        db.query(model).delete()
    db.commit()


def main():
    create_tables()
    db = SessionLocal()
    try:
        print("Clearing existing official FIR tables...")
        _clear_official(db)

        crimes = db.query(Crime).all()
        if not crimes:
            print("No source crimes found — run the analytics seeder first. Aborting.")
            return

        # --- 1. State ------------------------------------------------------
        db.add(F.State(StateID=KARNATAKA_STATE_ID, StateName="Karnataka",
                       NationalityID=1, Active=True))

        # --- 2. Lookup masters (categories, gravity, status) ---------------
        for cid, val in [(1, "FIR"), (3, "UDR"), (4, "PAR"), (8, "Zero FIR")]:
            db.add(F.CaseCategory(CaseCategoryID=cid, LookupValue=val))
        db.add(F.GravityOffence(GravityOffenceID=1, LookupValue="Heinous"))
        db.add(F.GravityOffence(GravityOffenceID=2, LookupValue="Non-Heinous"))

        statuses = sorted({
            (db.query(FIRDetails).filter(FIRDetails.crime_id == c.id).first()
             or FIRDetails()).investigation_status or "Registered"
            for c in crimes
        })
        status_id = {}
        for i, s in enumerate(statuses, start=1):
            status_id[s] = i
            db.add(F.CaseStatusMaster(CaseStatusID=i, CaseStatusName=s))

        # --- 3. Districts + Units (police stations) ------------------------
        district_id = {}
        for i, name in enumerate(sorted({c.district for c in crimes if c.district}), start=1):
            district_id[name] = i
            db.add(F.District(DistrictID=i, DistrictName=name,
                              StateID=KARNATAKA_STATE_ID, Active=True))

        for i, (name, level, hier) in enumerate(UNIT_TYPES, start=1):
            db.add(F.UnitType(UnitTypeID=i, UnitTypeName=name,
                              CityDistState=level, Hierarchy=hier, Active=True))

        unit_id = {}
        units_by_district = {}
        for i, (dist, ps) in enumerate(sorted({
            (c.district, c.police_station) for c in crimes if c.police_station
        }), start=1):
            unit_id[(dist, ps)] = i
            units_by_district.setdefault(district_id.get(dist), []).append(i)
            db.add(F.Unit(UnitID=i, UnitName=f"{ps} Police Station", TypeID=1,
                          ParentUnit=None, NationalityID=INDIAN_NATIONALITY_ID,
                          StateID=KARNATAKA_STATE_ID,
                          DistrictID=district_id.get(dist), Active=True))

        # --- 4. Ranks / Designations / Employees (investigating officers) --
        rank_id = {}
        for i, name in enumerate(RANKS, start=1):
            rank_id[name] = i
            db.add(F.Rank(RankID=i, RankName=name, Hierarchy=i, Active=True))
        desig_id = {}
        for i, name in enumerate(DESIGNATIONS, start=1):
            desig_id[name] = i
            db.add(F.Designation(DesignationID=i, DesignationName=name,
                                 Active=True, SortOrder=i))

        all_district_ids = list(district_id.values()) or [1]
        officers = sorted({
            (db.query(FIRDetails).filter(FIRDetails.crime_id == c.id).first()
             or FIRDetails()).investigating_officer or "Unassigned"
            for c in crimes
        })
        employee_id = {}
        for i, off in enumerate(officers, start=1):
            employee_id[off] = i
            # Officer names look like "Insp. Sunitha Reddy" — infer gender loosely.
            female = any(fn in off for fn in
                         ("Sunitha", "Kavya", "Roopa", "Deepa", "Geetha", "Divya", "Asha"))
            did_e = random.choice(all_district_ids)
            uid_e = random.choice(units_by_district.get(did_e) or [1])
            # Age 32-58 → DOB; appointed ~age 24.
            age = random.randint(32, 58)
            dob = date(date.today().year - age, random.randint(1, 12), random.randint(1, 28))
            appt = date(dob.year + 24, random.randint(1, 12), random.randint(1, 28))
            db.add(F.Employee(
                EmployeeID=i, DistrictID=did_e, UnitID=uid_e,
                RankID=rank_id[random.choice(IO_RANKS)],
                DesignationID=desig_id[random.choice(
                    ["Station House Officer", "Investigating Officer", "Circle Inspector"])],
                KGID=f"KA{random.randint(1980, 2018)}{i:04d}",
                FirstName=off.replace("Insp. ", ""),
                EmployeeDOB=dob, GenderID=2 if female else 1,
                BloodGroupID=random.randint(1, 8),
                PhysicallyChallenged=(random.random() < 0.02),
                AppointmentDate=appt))

        # --- 5. Crime heads / sub-heads + Acts / Sections ------------------
        heads = sorted({grp for (_, grp) in CRIME_META.values()})
        head_id = {}
        for i, grp in enumerate(heads, start=1):
            head_id[grp] = i
            db.add(F.CrimeHead(CrimeHeadID=i, CrimeGroupName=grp, Active=True))

        subhead_id = {}
        for i, (ctype, (ipc, grp)) in enumerate(CRIME_META.items(), start=1):
            subhead_id[ctype] = i
            db.add(F.CrimeSubHead(CrimeSubHeadID=i, CrimeHeadID=head_id[grp],
                                  CrimeHeadName=ctype, SeqID=i))

        db.add(F.Act(ActCode="IPC", ActDescription="Indian Penal Code",
                     ShortName="IPC", Active=True))
        for ctype, (ipc, grp) in CRIME_META.items():
            # Section PK is (ActCode, SectionCode) — guard against dup IPC codes.
            if not db.query(F.Section).get(("IPC", ipc)):
                db.add(F.Section(ActCode="IPC", SectionCode=ipc,
                                 SectionDescription=f"IPC Section {ipc} ({ctype})",
                                 Active=True))
                db.add(F.CrimeHeadActSection(CrimeHeadID=head_id[grp],
                                             ActCode="IPC", SectionCode=ipc))
        db.commit()

        # --- 6. Occupation / Religion / Caste masters ----------------------
        occ_id = {}
        occupations = sorted({p.occupation for p in db.query(Person).all() if p.occupation})
        for i, occ in enumerate(occupations, start=1):
            occ_id[occ] = i
            db.add(F.OccupationMaster(OccupationID=i, OccupationName=occ))
        religion_ids = []
        for i, rel in enumerate(RELIGIONS, start=1):
            religion_ids.append(i)
            db.add(F.ReligionMaster(ReligionID=i, ReligionName=rel))
        caste_ids = []
        for i, cst in enumerate(CASTES, start=1):
            caste_ids.append(i)
            db.add(F.CasteMaster(caste_master_id=i, caste_master_name=cst))

        # --- 7. Courts (District & Sessions + JMFC per district) -----------
        court_id = {}
        cc = 0
        for name, did in district_id.items():
            cc += 1
            court_id[name] = cc
            db.add(F.Court(CourtID=cc, CourtName=f"{name} District & Sessions Court",
                           DistrictID=did, StateID=KARNATAKA_STATE_ID, Active=True))
        # A JMFC (magistrate) court per district too — realistic court hierarchy.
        for name, did in district_id.items():
            cc += 1
            db.add(F.Court(CourtID=cc, CourtName=f"JMFC Court, {name}",
                           DistrictID=did, StateID=KARNATAKA_STATE_ID, Active=True))
        db.commit()

        # --- 8. CaseMaster + occurrence + people + arrests + chargesheets --
        serial_by_ps = {}
        cs_counter = 0
        arrest_counter = 0
        # CaseMasterID is aligned to the analytics crime.id so the official
        # schema and the intelligence layer share one id space (clean bridge).
        for c in crimes:
            cm_id = c.id
            fir = db.query(FIRDetails).filter(FIRDetails.crime_id == c.id).first()
            year = c.date_occurred.year if c.date_occurred else 2026
            uid = unit_id.get((c.district, c.police_station), 0)
            did = district_id.get(c.district, 0)
            key = (uid, year)
            serial_by_ps[key] = serial_by_ps.get(key, 0) + 1
            serial = serial_by_ps[key]
            # CrimeNo = 1(cat) + 4(district) + 4(unit) + 4(year) + 5(serial)
            crime_no = f"{CASE_CATEGORY_CODE['FIR']}{did:04d}{uid:04d}{year:04d}{serial:05d}"
            case_no = crime_no[-9:]
            status = (fir.investigation_status if fir else None) or "Registered"

            # Unify identifiers: the analytics crime now carries the OFFICIAL
            # CrimeNo as its fir_number, so every ORM read / lookup / detail view
            # and the compatibility view all expose the same official number.
            c.fir_number = crime_no

            db.add(F.CaseMaster(
                CaseMasterID=cm_id, CrimeNo=crime_no, CaseNo=case_no,
                CrimeRegisteredDate=c.date_occurred,
                PolicePersonID=employee_id.get(
                    (fir.investigating_officer if fir else None) or "Unassigned"),
                PoliceStationID=uid or None,
                CaseCategoryID=1,
                GravityOffenceID=1 if c.crime_type in HEINOUS else 2,
                CrimeMajorHeadID=head_id.get(CRIME_META.get(c.crime_type, (None, None))[1]),
                CrimeMinorHeadID=subhead_id.get(c.crime_type),
                CaseStatusID=status_id.get(status),
                CourtID=court_id.get(c.district),
            ))
            # Occurrence window: incident happened over a short span, and the
            # police station was informed shortly after (realistic timeline).
            occ_from = None
            occ_to = None
            info_recv = None
            if c.date_occurred:
                occ_from = datetime.combine(c.date_occurred, datetime.min.time()) + \
                    timedelta(hours=random.randint(0, 22), minutes=random.choice([0, 15, 30, 45]))
                occ_to = occ_from + timedelta(minutes=random.randint(15, 240))
                info_recv = occ_to + timedelta(hours=random.randint(1, 72))
            db.add(F.Inv_OccuranceTime(
                CaseMasterID=cm_id,
                IncidentFromDate=occ_from, IncidentToDate=occ_to,
                InfoReceivedPSDate=info_recv,
                latitude=c.latitude, longitude=c.longitude, BriefFacts=c.description,
            ))

            # People linked to this case, by role
            links = db.query(CasePerson).filter(CasePerson.crime_id == c.id).all()
            acc_seq = 0
            accused_objs = []
            for link in links:
                p = db.query(Person).get(link.person_id)
                if not p:
                    continue
                gid = GENDER_ID.get(p.gender, 1)
                if link.role == "accused":
                    acc_seq += 1
                    a = F.Accused(CaseMasterID=cm_id, AccusedName=p.full_name,
                                  AgeYear=p.age, GenderID=gid, PersonID=f"A{acc_seq}")
                    db.add(a)
                    accused_objs.append(a)
                elif link.role == "victim":
                    db.add(F.Victim(CaseMasterID=cm_id, VictimName=p.full_name,
                                    AgeYear=p.age, GenderID=gid,
                                    VictimPolice="1" if random.random() < 0.03 else "0"))
                elif link.role in ("complainant", "witness"):
                    db.add(F.ComplainantDetails(
                        CaseMasterID=cm_id, ComplainantName=p.full_name, AgeYear=p.age,
                        OccupationID=occ_id.get(p.occupation),
                        ReligionID=random.choices(religion_ids, weights=RELIGION_WEIGHTS)[0],
                        CasteID=random.choices(caste_ids, weights=CASTE_WEIGHTS)[0],
                        GenderID=gid))

            # Act-section association from FIRDetails.ipc_sections
            if fir and fir.ipc_sections:
                for order, sec in enumerate(
                        [s.strip() for s in fir.ipc_sections.split(",") if s.strip()], start=1):
                    db.add(F.ActSectionAssociation(
                        CaseMasterID=cm_id, ActID="IPC", SectionID=sec,
                        ActOrderID=1, SectionOrderID=order))

            # Arrest + chargesheet where applicable
            if fir and fir.arrest_made:
                arrest_counter += 1
                # Roughly 1 in 8 events is a voluntary surrender, else an arrest.
                as_type = 2 if random.random() < 0.12 else 1
                db.add(F.ArrestSurrender(
                    ArrestSurrenderID=arrest_counter, CaseMasterID=cm_id,
                    ArrestSurrenderTypeID=as_type,
                    ArrestSurrenderDate=fir.filed_date or c.date_occurred,
                    ArrestSurrenderStateId=KARNATAKA_STATE_ID,
                    ArrestSurrenderDistrictId=did or None, PoliceStationID=uid or None,
                    IOID=employee_id.get((fir.investigating_officer or "Unassigned")),
                    CourtID=court_id.get(c.district), IsAccused=True,
                    IsComplainantAccused=False))
                # Link every accused of this case to the arrest event via the
                # official junction (one arrest event → multiple accused).
                if accused_objs:
                    db.flush()  # assign AccusedMasterIDs
                    for a in accused_objs:
                        db.add(F.inv_arrestsurrenderaccused(
                            ArrestSurrenderID=arrest_counter,
                            AccusedMasterID=a.AccusedMasterID))
            if fir and status in CS_TYPE:
                cs_counter += 1
                db.add(F.ChargesheetDetails(
                    CSID=cs_counter, CaseMasterID=cm_id,
                    csdate=datetime.combine(fir.closed_date or c.date_occurred, datetime.min.time())
                    if (fir.closed_date or c.date_occurred) else None,
                    cstype=CS_TYPE[status],
                    PolicePersonID=employee_id.get((fir.investigating_officer or "Unassigned"))))

            if cm_id % 200 == 0:
                db.commit()
        db.commit()

        # --- Summary -------------------------------------------------------
        print("=" * 60)
        print("Official FIR schema populated:")
        for label, model in [
            ("CaseMaster", F.CaseMaster), ("Inv_OccuranceTime", F.Inv_OccuranceTime),
            ("Accused", F.Accused), ("Victim", F.Victim),
            ("ComplainantDetails", F.ComplainantDetails),
            ("ActSectionAssociation", F.ActSectionAssociation),
            ("ArrestSurrender", F.ArrestSurrender),
            ("inv_arrestsurrenderaccused", F.inv_arrestsurrenderaccused),
            ("ChargesheetDetails", F.ChargesheetDetails),
            ("District", F.District), ("Unit", F.Unit), ("UnitType", F.UnitType),
            ("Employee", F.Employee), ("Rank", F.Rank), ("Designation", F.Designation),
            ("CrimeHead", F.CrimeHead), ("CrimeSubHead", F.CrimeSubHead),
            ("Section", F.Section), ("Court", F.Court),
            ("CaseCategory", F.CaseCategory), ("GravityOffence", F.GravityOffence),
            ("ReligionMaster", F.ReligionMaster), ("CasteMaster", F.CasteMaster),
            ("OccupationMaster", F.OccupationMaster),
        ]:
            print(f"  {label:22}: {db.query(model).count()}")
        print("=" * 60)
        print("[DONE] Official schema populated; crimes.fir_number unified to CrimeNo.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
