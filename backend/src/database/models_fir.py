"""
Official Karnataka Police FIR schema (as per the hackathon ER diagram).

This module models the *provided* normalized FIR/CCTNS-style schema exactly —
official table names, primary/foreign keys, and lookup masters. It is kept as a
SEPARATE module from `models.py` (the app's current simplified analytics schema)
so it can be adopted incrementally without breaking the running application.

Ambiguity note: the ER diagram lists IncidentFromDate/ToDate, InfoReceivedPSDate,
latitude, longitude and BriefFacts directly beneath CaseMaster, but the
Relationship Matrix defines a 1-to-1 `Inv_OccuranceTime` table for the
"occurrence time/location record". They are modelled here in Inv_OccuranceTime;
move them onto CaseMaster if your interpretation differs.
"""
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, DECIMAL, Boolean, CHAR,
    ForeignKey,
)
from sqlalchemy.orm import relationship, declarative_base

FIRBase = declarative_base()


# ---------------------------------------------------------------------------
# Lookup / master tables
# ---------------------------------------------------------------------------
class State(FIRBase):
    __tablename__ = "State"
    StateID = Column(Integer, primary_key=True)
    StateName = Column(String(120))
    NationalityID = Column(Integer)
    Active = Column(Boolean, default=True)


class District(FIRBase):
    __tablename__ = "District"
    DistrictID = Column(Integer, primary_key=True)
    DistrictName = Column(String(120))
    StateID = Column(Integer, ForeignKey("State.StateID"))
    Active = Column(Boolean, default=True)


class UnitType(FIRBase):
    __tablename__ = "UnitType"
    UnitTypeID = Column(Integer, primary_key=True)
    UnitTypeName = Column(String(120))
    CityDistState = Column(String(20))   # City / District / State
    Hierarchy = Column(Integer)
    Active = Column(Boolean, default=True)


class Unit(FIRBase):
    __tablename__ = "Unit"
    UnitID = Column(Integer, primary_key=True)
    UnitName = Column(String(150))
    TypeID = Column(Integer, ForeignKey("UnitType.UnitTypeID"))
    ParentUnit = Column(Integer, ForeignKey("Unit.UnitID"))  # self-reference
    NationalityID = Column(Integer)
    StateID = Column(Integer, ForeignKey("State.StateID"))
    DistrictID = Column(Integer, ForeignKey("District.DistrictID"))
    Active = Column(Boolean, default=True)


class Rank(FIRBase):
    __tablename__ = "Rank"
    RankID = Column(Integer, primary_key=True)
    RankName = Column(String(120))
    Hierarchy = Column(Integer)
    Active = Column(Boolean, default=True)


class Designation(FIRBase):
    __tablename__ = "Designation"
    DesignationID = Column(Integer, primary_key=True)
    DesignationName = Column(String(120))
    Active = Column(Boolean, default=True)
    SortOrder = Column(Integer)


class Employee(FIRBase):
    __tablename__ = "Employee"
    EmployeeID = Column(Integer, primary_key=True)
    DistrictID = Column(Integer, ForeignKey("District.DistrictID"))
    UnitID = Column(Integer, ForeignKey("Unit.UnitID"))
    RankID = Column(Integer, ForeignKey("Rank.RankID"))
    DesignationID = Column(Integer, ForeignKey("Designation.DesignationID"))
    KGID = Column(String(50))              # Karnataka Government ID
    FirstName = Column(String(120))
    EmployeeDOB = Column(Date)
    GenderID = Column(Integer)
    BloodGroupID = Column(Integer)
    PhysicallyChallenged = Column(Boolean, default=False)
    AppointmentDate = Column(Date)


class Court(FIRBase):
    __tablename__ = "Court"
    CourtID = Column(Integer, primary_key=True)
    CourtName = Column(String(150))
    DistrictID = Column(Integer, ForeignKey("District.DistrictID"))
    StateID = Column(Integer, ForeignKey("State.StateID"))
    Active = Column(Boolean, default=True)


class CaseCategory(FIRBase):
    __tablename__ = "CaseCategory"
    CaseCategoryID = Column(Integer, primary_key=True)
    LookupValue = Column(String(60))       # FIR, UDR, PAR, Zero FIR ...


class GravityOffence(FIRBase):
    __tablename__ = "GravityOffence"
    GravityOffenceID = Column(Integer, primary_key=True)
    LookupValue = Column(String(60))       # Heinous / Non-Heinous ...


class CaseStatusMaster(FIRBase):
    __tablename__ = "CaseStatusMaster"
    CaseStatusID = Column(Integer, primary_key=True)
    CaseStatusName = Column(String(80))


class OccupationMaster(FIRBase):
    __tablename__ = "OccupationMaster"
    OccupationID = Column(Integer, primary_key=True)
    OccupationName = Column(String(120))


class ReligionMaster(FIRBase):
    __tablename__ = "ReligionMaster"
    ReligionID = Column(Integer, primary_key=True)
    ReligionName = Column(String(80))


class CasteMaster(FIRBase):
    __tablename__ = "CasteMaster"
    caste_master_id = Column(Integer, primary_key=True)
    caste_master_name = Column(String(120))


# ---------------------------------------------------------------------------
# Crime classification (head / sub-head) + legal acts & sections
# ---------------------------------------------------------------------------
class CrimeHead(FIRBase):
    __tablename__ = "CrimeHead"
    CrimeHeadID = Column(Integer, primary_key=True)
    CrimeGroupName = Column(String(150))   # e.g. Crimes Against Body
    Active = Column(Boolean, default=True)


class CrimeSubHead(FIRBase):
    __tablename__ = "CrimeSubHead"
    CrimeSubHeadID = Column(Integer, primary_key=True)
    CrimeHeadID = Column(Integer, ForeignKey("CrimeHead.CrimeHeadID"))
    CrimeHeadName = Column(String(150))    # e.g. Murder, Robbery
    SeqID = Column(Integer)


class Act(FIRBase):
    __tablename__ = "Act"
    ActCode = Column(String(30), primary_key=True)  # e.g. IPC, NDPS
    ActDescription = Column(String(255))
    ShortName = Column(String(80))
    Active = Column(Boolean, default=True)


class Section(FIRBase):
    __tablename__ = "Section"
    # Composite PK: a section is identified by its parent act + section code.
    ActCode = Column(String(30), ForeignKey("Act.ActCode"), primary_key=True)
    SectionCode = Column(String(30), primary_key=True)   # e.g. 302, 307
    SectionDescription = Column(String(255))
    Active = Column(Boolean, default=True)


class CrimeHeadActSection(FIRBase):
    __tablename__ = "CrimeHeadActSection"
    # No natural PK in the diagram — surrogate id added for the ORM.
    id = Column(Integer, primary_key=True, autoincrement=True)
    CrimeHeadID = Column(Integer, ForeignKey("CrimeHead.CrimeHeadID"))
    ActCode = Column(String(30), ForeignKey("Act.ActCode"))
    SectionCode = Column(String(30))


# ---------------------------------------------------------------------------
# Case core (CaseMaster) + 1-1 occurrence details
# ---------------------------------------------------------------------------
class CaseMaster(FIRBase):
    __tablename__ = "CaseMaster"
    CaseMasterID = Column(Integer, primary_key=True)
    # 1 digit category + 4 digit district + 4 digit station + 4 digit year + 5 digit serial
    CrimeNo = Column(String(30), index=True)
    CaseNo = Column(String(20))            # last 9 digits of CrimeNo (YYYY + 5-digit serial)
    CrimeRegisteredDate = Column(Date)
    PolicePersonID = Column(Integer, ForeignKey("Employee.EmployeeID"))
    PoliceStationID = Column(Integer, ForeignKey("Unit.UnitID"))
    CaseCategoryID = Column(Integer, ForeignKey("CaseCategory.CaseCategoryID"))
    GravityOffenceID = Column(Integer, ForeignKey("GravityOffence.GravityOffenceID"))
    CrimeMajorHeadID = Column(Integer, ForeignKey("CrimeHead.CrimeHeadID"))
    CrimeMinorHeadID = Column(Integer, ForeignKey("CrimeSubHead.CrimeSubHeadID"))
    CaseStatusID = Column(Integer, ForeignKey("CaseStatusMaster.CaseStatusID"))
    CourtID = Column(Integer, ForeignKey("Court.CourtID"))


class Inv_OccuranceTime(FIRBase):
    __tablename__ = "Inv_OccuranceTime"
    # 1-to-1 with CaseMaster (occurrence time/location record).
    CaseMasterID = Column(Integer, ForeignKey("CaseMaster.CaseMasterID"), primary_key=True)
    IncidentFromDate = Column(DateTime)
    IncidentToDate = Column(DateTime)
    InfoReceivedPSDate = Column(DateTime)
    latitude = Column(DECIMAL(10, 6))
    longitude = Column(DECIMAL(10, 6))
    BriefFacts = Column(Text)              # Nvarchar(Max) in the source


# ---------------------------------------------------------------------------
# People linked to a case
# ---------------------------------------------------------------------------
class ComplainantDetails(FIRBase):
    __tablename__ = "ComplainantDetails"
    ComplainantID = Column(Integer, primary_key=True)
    CaseMasterID = Column(Integer, ForeignKey("CaseMaster.CaseMasterID"))
    ComplainantName = Column(String(150))
    AgeYear = Column(Integer)
    OccupationID = Column(Integer, ForeignKey("OccupationMaster.OccupationID"))
    ReligionID = Column(Integer, ForeignKey("ReligionMaster.ReligionID"))
    CasteID = Column(Integer, ForeignKey("CasteMaster.caste_master_id"))
    GenderID = Column(Integer)


class Victim(FIRBase):
    __tablename__ = "Victim"
    VictimMasterID = Column(Integer, primary_key=True)
    CaseMasterID = Column(Integer, ForeignKey("CaseMaster.CaseMasterID"))
    VictimName = Column(String(150))
    AgeYear = Column(Integer)
    GenderID = Column(Integer)             # m / f / t
    VictimPolice = Column(String(1))       # '1' if victim is police else '0'


class Accused(FIRBase):
    __tablename__ = "Accused"
    AccusedMasterID = Column(Integer, primary_key=True)
    CaseMasterID = Column(Integer, ForeignKey("CaseMaster.CaseMasterID"))
    AccusedName = Column(String(150))
    AgeYear = Column(Integer)
    GenderID = Column(Integer)             # M / F / T
    PersonID = Column(String(10))          # accused sorting: A1, A2, A3 ...


class ActSectionAssociation(FIRBase):
    __tablename__ = "ActSectionAssociation"
    # No natural PK in the diagram — surrogate id added for the ORM.
    id = Column(Integer, primary_key=True, autoincrement=True)
    CaseMasterID = Column(Integer, ForeignKey("CaseMaster.CaseMasterID"))
    ActID = Column(String(30), ForeignKey("Act.ActCode"))
    SectionID = Column(String(30))         # Section.SectionCode
    ActOrderID = Column(Integer)
    SectionOrderID = Column(Integer)


# ---------------------------------------------------------------------------
# Arrest / surrender + chargesheet
# ---------------------------------------------------------------------------
class ArrestSurrender(FIRBase):
    __tablename__ = "ArrestSurrender"
    ArrestSurrenderID = Column(Integer, primary_key=True)
    CaseMasterID = Column(Integer, ForeignKey("CaseMaster.CaseMasterID"))
    ArrestSurrenderTypeID = Column(Integer)         # arrest / voluntary surrender
    ArrestSurrenderDate = Column(Date)
    ArrestSurrenderStateId = Column(Integer, ForeignKey("State.StateID"))
    ArrestSurrenderDistrictId = Column(Integer, ForeignKey("District.DistrictID"))
    PoliceStationID = Column(Integer, ForeignKey("Unit.UnitID"))
    IOID = Column(Integer, ForeignKey("Employee.EmployeeID"))
    CourtID = Column(Integer, ForeignKey("Court.CourtID"))
    AccusedMasterID = Column(Integer, ForeignKey("Accused.AccusedMasterID"))
    IsAccused = Column(Boolean)
    IsComplainantAccused = Column(Boolean)


class inv_arrestsurrenderaccused(FIRBase):
    """Junction linking an arrest/surrender event to multiple accused."""
    __tablename__ = "inv_arrestsurrenderaccused"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ArrestSurrenderID = Column(Integer, ForeignKey("ArrestSurrender.ArrestSurrenderID"))
    AccusedMasterID = Column(Integer, ForeignKey("Accused.AccusedMasterID"))


class ChargesheetDetails(FIRBase):
    __tablename__ = "ChargesheetDetails"
    CSID = Column(Integer, primary_key=True)
    CaseMasterID = Column(Integer, ForeignKey("CaseMaster.CaseMasterID"))
    csdate = Column(DateTime)              # chargesheeted date
    cstype = Column(CHAR(1))               # A=Chargesheet, B=False Case, C=Undetected
    PolicePersonID = Column(Integer, ForeignKey("Employee.EmployeeID"))
