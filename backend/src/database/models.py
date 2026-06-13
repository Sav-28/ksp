from sqlalchemy import Column, Integer, String, Text, Date, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class District(Base):
    __tablename__ = 'districts'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)

    # Relationship: one district has many police stations and crimes
    police_stations = relationship("PoliceStation", back_populates="district")
    crimes = relationship("Crime", back_populates="district")

    def __repr__(self):
        return f"<District(id={self.id}, name='{self.name}')>"

class CrimeType(Base):
    __tablename__ = 'crime_types'

    id = Column(Integer, primary_key=True, index=True)
    ipc_section = Column(String(20), unique=True, nullable=False)
    description = Column(String(500))

    # Relationship: one crime type has many crimes
    crimes = relationship("Crime", back_populates="crime_type")

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
    crimes = relationship("Crime", back_populates="police_station")

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

    # Proper relationships (using the denormalized fields for simplicity in MVP)
    # In a production system, these would be proper foreign keys
    # district_rel = relationship("District", foreign_keys=[district])
    # crime_type_rel = relationship("CrimeType", foreign_keys=[crime_type])
    # police_station_rel = relationship("PoliceStation", foreign_keys=[police_station])

    def __repr__(self):
        return f"<Crime(id={self.id}, fir_number='{self.fir_number}', date_occurred='{self.date_occurred}', crime_type='{self.crime_type}')>"