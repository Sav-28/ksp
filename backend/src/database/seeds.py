"""
Initial seed data for the KSP Crime AI database.
Run this script to populate the database with sample data for testing.
"""

from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import Base, District, CrimeType, PoliceStation, Crime
from datetime import date

def seed_database(db: Session):
    """Seed the database with initial data."""

    # Check if data already exists
    if db.execute(select(District).limit(1)).first():
        print("Database already seeded. Skipping...")
        return

    print("Seeding database with initial data...")

    # Create districts
    districts_data = [
        {"name": "Bengaluru Urban"},
        {"name": "Mysuru"},
        {"name": "Belagavi"},
        {"name": "Kalaburagi"}
    ]

    districts = {}
    for district_data in districts_data:
        district = District(**district_data)
        db.add(district)
        districts[district_data["name"]] = district

    db.commit()

    # Create crime types
    crime_types_data = [
        {"ipc_section": "379", "description": "Theft"},
        {"ipc_section": "302", "description": "Murder"},
        {"ipc_section": "356", "description": "Snatching"},
        {"ipc_section": "392", "description": "Robbery"},
        {"ipc_section": "351", "description": "Assault"},
        {"ipc_section": "454", "description": "Burglary"},
        {"ipc_section": "146", "description": "Rioting"},
        {"ipc_section": "415", "description": "Cheating"},
        {"ipc_section": "463", "description": "Forgery"},
        {"ipc_section": "489", "description": "Counterfeiting"}
    ]

    crime_types = {}
    for ct_data in crime_types_data:
        crime_type = CrimeType(**ct_data)
        db.add(crime_type)
        crime_types[ct_data["ipc_section"]] = crime_type

    db.commit()

    # Create police stations
    police_stations_data = [
        {"name": "Yelahanka", "district_id": districts["Bengaluru Urban"].id, "taluk": "Bengaluru North"},
        {"name": "Koramangala", "district_id": districts["Bengaluru Urban"].id, "taluk": "Bengaluru South"},
        {"name": "Mysuru City", "district_id": districts["Mysuru"].id, "taluk": "Mysuru North"},
        {"name": "Belagavi City", "district_id": districts["Belagavi"].id, "taluk": "Belagavi North"}
    ]

    police_stations = {}
    for ps_data in police_stations_data:
        police_station = PoliceStation(**ps_data)
        db.add(police_station)
        police_stations[ps_data["name"]] = police_station

    db.commit()

    # Create sample crimes
    crimes_data = [
        {
            "fir_number": "FIR001",
            "date_occurred": date(2023, 5, 15),
            "district": "Bengaluru Urban",
            "taluk": "Bengaluru North",
            "police_station": "Yelahanka",
            "crime_type": "Theft",
            "description": "Mobile phone theft near Yelahanka bus stand",
            "latitude": 13.1081,
            "longitude": 77.5874
        },
        {
            "fir_number": "FIR002",
            "date_occurred": date(2023, 5, 16),
            "district": "Bengaluru Urban",
            "taluk": "Bengaluru South",
            "police_station": "Koramangala",
            "crime_type": "Snatching",
            "description": "Purse snatching at Koramangala 5th Block",
            "latitude": 12.9352,
            "longitude": 77.6245
        },
        {
            "fir_number": "FIR003",
            "date_occurred": date(2023, 5, 14),
            "district": "Mysuru",
            "taluk": "Mysuru North",
            "police_station": "Mysuru City",
            "crime_type": "Murder",
            "description": "Homicide investigation in Mysuru city center",
            "latitude": 12.2958,
            "longitude": 76.6394
        },
        {
            "fir_number": "FIR004",
            "date_occurred": date(2023, 5, 13),
            "district": "Bengaluru Urban",
            "taluk": "Bengaluru North",
            "police_station": "Yelahanka",
            "crime_type": "Burglary",
            "description": "Residential burglary in Yelahanka New Town",
            "latitude": 13.1935,
            "longitude": 77.5831
        }
    ]

    for crime_data in crimes_data:
        crime = Crime(**crime_data)
        db.add(crime)

    db.commit()

    print("Database seeding completed!")

if __name__ == "__main__":
    # This would be run with a proper database session
    # For demonstration, we're showing the structure
    print("To run the seeding script:")
    print("1. Set up your database connection")
    print("2. Create a session")
    print("3. Call seed_database(session)")