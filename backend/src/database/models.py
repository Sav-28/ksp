from sqlalchemy import Column, Integer, String, Text, Date, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class District(Base):
    __tablename__ = 'districts'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)

    # Relationship: one district has many police stations and crimes
    police_stations = relationship("PoliceStation", back_populates="district")
    # crimes = relationship("Crime", back_populates="district")  # Temporarily disabled due to denormalized fields

    def __repr__(self):
        return f"<District(id={self.id}, name='{self.name}')>"

class CrimeType(Base):
    __tablename__ = 'crime_types'

    id = Column(Integer, primary_key=True, index=True)
    ipc_section = Column(String(20), unique=True, nullable=False)
    description = Column(String(500))

    # Relationship: one crime type has many crimes
    # crimes = relationship("Crime", back_populates="crime_type")  # Temporarily disabled due to denormalized fields

    def __repr__(self):
        return f"<CrimeType(id={self.id}, ipc_section='{self.ipc_section}', description='{self.description}')>"

class PoliceStation(Base):
    __tablename__ = 'police_stations'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    district_id = Column(Integer, ForeignKey('districts.id'), nullable=False)
    taluk = Column(String(100))

    # Relationships
    district = relationship("District", back_populates="police_stations")
    # crimes = relationship("Crime", back_populates="police_station")  # Temporarily disabled due to denormalized fields

    def __repr__(self):
        return f"<PoliceStation(id={self.id}, name='{self.name}', district_id={self.district_id})>"

class Crime(Base):
    __tablename__ = 'crimes'

    id = Column(Integer, primary_key=True, index=True)
    fir_number = Column(String(50), unique=True, nullable=False)
    date_occurred = Column(Date, nullable=False)
    district = Column(String(100))  # Denormalized for simplicity - could be foreign key
    taluk = Column(String(100))
    police_station = Column(String(100))  # Denormalized for simplicity
    crime_type = Column(String(100))  # Denormalized for simplicity
    description = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)

    # Phase 4 relationships to the normalized intelligence tables
    people = relationship("CasePerson", back_populates="crime")
    fir_details = relationship("FIRDetails", back_populates="crime", uselist=False)

    def __repr__(self):
        return f"<Crime(id={self.id}, fir_number='{self.fir_number}', date_occurred='{self.date_occurred}', crime_type='{self.crime_type}')>"


class AuditLog(Base):
    """
    Persisted audit trail of every query made against the system.
    Important for a government/police system for accountability and review.
    """
    __tablename__ = 'audit_logs'

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    username = Column(String(100))          # who made the query (from auth token)
    query_text = Column(Text, nullable=False)  # the raw user query
    language = Column(String(10))           # 'en' or 'kn'
    intent = Column(String(50))             # classified intent
    confidence = Column(Float)              # classifier confidence
    sql_generated = Column(Text)            # the SQL that was executed
    row_count = Column(Integer)             # number of rows returned

    def __repr__(self):
        return f"<AuditLog(id={self.id}, user='{self.username}', intent='{self.intent}', rows={self.row_count})>"


# ===========================================================================
# PHASE 4 — Crime Intelligence Data Model
# Normalized entities enabling network analysis, offender profiling,
# sociological insights, financial trails, and investigator decision support.
# These link to the existing `crimes` table via crime_id foreign keys.
# ===========================================================================


class Person(Base):
    """
    A person known to the system — may be an accused, victim, witness, or
    complainant across one or more crimes. Carries demographic and
    socio-economic attributes for sociological analysis (Area 4) and
    behavioural/criminological profiling (Area 5).
    """
    __tablename__ = 'persons'

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False, index=True)
    age = Column(Integer)
    gender = Column(String(20))                 # Male / Female / Other
    occupation = Column(String(100))
    education_level = Column(String(50))        # None / Primary / Secondary / Graduate / Postgraduate
    socio_economic_status = Column(String(30))  # Low / Lower-Middle / Middle / Upper-Middle / High
    address = Column(String(255))
    district = Column(String(100), index=True)
    phone_masked = Column(String(20))           # e.g. "98XXXXXX21"
    latitude = Column(Float)
    longitude = Column(Float)

    # Risk score (0-100), computed during offender profiling (Phase 9).
    risk_score = Column(Float, default=0.0)

    # Relationships
    case_links = relationship("CasePerson", back_populates="person")
    accounts = relationship("FinancialAccount", back_populates="owner")
    gang_memberships = relationship("GangMember", back_populates="person")

    def __repr__(self):
        return f"<Person(id={self.id}, name='{self.full_name}', district='{self.district}')>"


class CasePerson(Base):
    """
    Association between a person and a crime, with the role they played.
    Enables 'who was accused/victim in FIR X' and repeat-offender detection.
    """
    __tablename__ = 'case_persons'

    id = Column(Integer, primary_key=True, index=True)
    crime_id = Column(Integer, ForeignKey('crimes.id'), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey('persons.id'), nullable=False, index=True)
    role = Column(String(20), nullable=False, index=True)  # accused / victim / witness / complainant

    person = relationship("Person", back_populates="case_links")
    crime = relationship("Crime", back_populates="people")

    def __repr__(self):
        return f"<CasePerson(crime_id={self.crime_id}, person_id={self.person_id}, role='{self.role}')>"


class FIRDetails(Base):
    """
    Investigation metadata for a crime/FIR (Area 1 retrieval, Area 6 support).
    One-to-one with a crime.
    """
    __tablename__ = 'fir_details'

    id = Column(Integer, primary_key=True, index=True)
    crime_id = Column(Integer, ForeignKey('crimes.id'), nullable=False, unique=True, index=True)
    investigation_status = Column(String(40))   # Registered / Under Investigation / Chargesheet Filed / Closed / Convicted / Acquitted
    investigating_officer = Column(String(120))
    ipc_sections = Column(String(120))          # e.g. "379, 411"
    arrest_made = Column(Boolean, default=False)
    case_outcome = Column(String(60))           # Pending / Solved / Unsolved / Convicted / Acquitted
    court_status = Column(String(60))
    filed_date = Column(Date)
    closed_date = Column(Date)

    crime = relationship("Crime", back_populates="fir_details")

    def __repr__(self):
        return f"<FIRDetails(crime_id={self.crime_id}, status='{self.investigation_status}')>"


class Relationship(Base):
    """
    A directed/undirected link between two persons — the backbone of criminal
    network analysis (Area 2). Optionally tied to a crime for context.
    """
    __tablename__ = 'relationships'

    id = Column(Integer, primary_key=True, index=True)
    person_a_id = Column(Integer, ForeignKey('persons.id'), nullable=False, index=True)
    person_b_id = Column(Integer, ForeignKey('persons.id'), nullable=False, index=True)
    relationship_type = Column(String(40))      # associate / family / gang_member / financial / co_accused
    crime_id = Column(Integer, ForeignKey('crimes.id'), nullable=True)
    strength = Column(Float, default=1.0)       # edge weight for network analysis

    def __repr__(self):
        return f"<Relationship(a={self.person_a_id}, b={self.person_b_id}, type='{self.relationship_type}')>"


class Gang(Base):
    """
    An organized crime group (Area 2 organized-crime detection, Area 5).
    """
    __tablename__ = 'gangs'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    base_district = Column(String(100))
    primary_activity = Column(String(60))       # e.g. Robbery / Counterfeiting / Extortion
    active = Column(Boolean, default=True)

    members = relationship("GangMember", back_populates="gang")

    def __repr__(self):
        return f"<Gang(id={self.id}, name='{self.name}')>"


class GangMember(Base):
    """Membership of a person in a gang, with their role."""
    __tablename__ = 'gang_members'

    id = Column(Integer, primary_key=True, index=True)
    gang_id = Column(Integer, ForeignKey('gangs.id'), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey('persons.id'), nullable=False, index=True)
    role = Column(String(40))                   # Leader / Member / Associate

    gang = relationship("Gang", back_populates="members")
    person = relationship("Person", back_populates="gang_memberships")

    def __repr__(self):
        return f"<GangMember(gang_id={self.gang_id}, person_id={self.person_id}, role='{self.role}')>"


class FinancialAccount(Base):
    """
    A bank/financial account owned by a person (Area 7 financial trails).
    """
    __tablename__ = 'financial_accounts'

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey('persons.id'), nullable=False, index=True)
    account_number_masked = Column(String(30))  # masked PII
    bank_name = Column(String(80))
    account_type = Column(String(30))           # Savings / Current
    balance = Column(Float, default=0.0)
    flagged = Column(Boolean, default=False)    # flagged as suspicious

    owner = relationship("Person", back_populates="accounts")

    def __repr__(self):
        return f"<FinancialAccount(id={self.id}, person_id={self.person_id}, bank='{self.bank_name}')>"


class Transaction(Base):
    """
    A money transfer between accounts (Area 7 money-trail analysis).
    May be linked to a crime when part of an investigation.
    """
    __tablename__ = 'transactions'

    id = Column(Integer, primary_key=True, index=True)
    from_account_id = Column(Integer, ForeignKey('financial_accounts.id'), index=True)
    to_account_id = Column(Integer, ForeignKey('financial_accounts.id'), index=True)
    amount = Column(Float, nullable=False)
    date = Column(Date, index=True)
    transaction_type = Column(String(30))       # Transfer / Cash Deposit / Withdrawal
    is_suspicious = Column(Boolean, default=False, index=True)
    crime_id = Column(Integer, ForeignKey('crimes.id'), nullable=True, index=True)

    def __repr__(self):
        return f"<Transaction(id={self.id}, amount={self.amount}, suspicious={self.is_suspicious})>"
