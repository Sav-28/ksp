"""
Generate realistic sample crime data for KSP Crime AI MVP.
Creates 150+ crime records with realistic patterns.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import date, timedelta
import random
from src.database.session import SessionLocal, create_tables
from src.database.models import Crime, District, PoliceStation, CrimeType

# Sample data
DISTRICTS = [
    "Bengaluru Urban", "Bengaluru Rural", "Mysuru", "Belagavi", "Kalaburagi",
    "Mangaluru", "Hubli", "Dharwad", "Tumakuru", "Raichur"
]

POLICE_STATIONS = {
    "Bengaluru Urban": ["Yelahanka", "Koramangala", "Indiranagar", "Jayanagar", "Whitefield", "MG Road"],
    "Mysuru": ["Mysuru City", "K.R. Nagar", "Nazarbad", "Vijayanagar"],
    "Belagavi": ["Belagavi City", "Khanapur", "Gokak"],
    "Kalaburagi": ["Kalaburagi City", "Gulbarga"],
    "Mangaluru": ["Mangaluru City", "Ullal", "Surathkal"],
}

CRIME_TYPES = [
    ("379", "Theft"),
    ("302", "Murder"),
    ("356", "Snatching"),
    ("392", "Robbery"),
    ("351", "Assault"),
    ("454", "Burglary"),
    ("146", "Rioting"),
    ("415", "Cheating"),
    ("463", "Forgery"),
    ("489", "Counterfeiting")
]

CRIME_DESCRIPTIONS = {
    "Theft": [
        "Mobile phone theft from public bus",
        "Laptop theft from parked vehicle",
        "Bike theft from parking lot",
        "Jewelry theft from residence",
        "Wallet theft from shopping mall",
        "Cash theft from auto rickshaw",
        "Two-wheeler theft at night"
    ],
    "Murder": [
        "Homicide investigation ongoing",
        "Murder case under investigation",
        "Suspect arrested in murder case",
        "Fatal assault leading to death"
    ],
    "Snatching": [
        "Chain snatching by bike-borne assailants",
        "Mobile phone snatching on road",
        "Bag snatching incident",
        "Gold chain snatched from pedestrian"
    ],
    "Robbery": [
        "Armed robbery at shop",
        "House robbery during daytime",
        "ATM robbery attempt",
        "Bank robbery investigation"
    ],
    "Assault": [
        "Physical assault after argument",
        "Assault case registered",
        "Group assault incident",
        "Assault with deadly weapon"
    ],
    "Burglary": [
        "Residential burglary reported",
        "Shop burglary at night",
        "Office burglary during weekend",
        "House breaking and theft"
    ],
    "Rioting": [
        "Public riot and disturbance",
        "Group clash incident",
        "Unlawful assembly case"
    ],
    "Cheating": [
        "Online fraud case",
        "Investment scam reported",
        "Credit card fraud",
        "Business fraud investigation"
    ],
    "Forgery": [
        "Document forgery case",
        "Signature forgery detected",
        "Certificate forgery"
    ],
    "Counterfeiting": [
        "Fake currency seized",
        "Counterfeit notes recovered",
        "Currency counterfeiting racket busted"
    ]
}

# GPS coordinates for major cities (rough approximations)
CITY_COORDS = {
    "Bengaluru Urban": (12.9716, 77.5946),
    "Mysuru": (12.2958, 76.6394),
    "Belagavi": (15.8497, 74.4977),
    "Kalaburagi": (17.3297, 76.8343),
    "Mangaluru": (12.9141, 74.8560)
}

def generate_random_date(days_back=365):
    """Generate a random date within the last X days."""
    today = date.today()
    random_days = random.randint(0, days_back)
    return today - timedelta(days=random_days)

def add_random_offset(coord, max_offset=0.1):
    """Add random offset to GPS coordinate."""
    return coord + random.uniform(-max_offset, max_offset)

def generate_crimes(db, num_crimes=150):
    """Generate realistic crime records."""
    print(f"Generating {num_crimes} crime records...")
    
    crimes_generated = 0
    fir_counter = 100  # Start from FIR100
    
    for _ in range(num_crimes):
        # Pick random district
        district = random.choice(DISTRICTS)
        
        # Pick police station
        if district in POLICE_STATIONS:
            police_station = random.choice(POLICE_STATIONS[district])
        else:
            police_station = f"{district} Station"
        
        # Pick crime type
        ipc_section, crime_type = random.choice(CRIME_TYPES)
        
        # Generate description
        descriptions = CRIME_DESCRIPTIONS.get(crime_type, ["Crime reported"])
        description = random.choice(descriptions)
        
        # Generate date (weighted towards recent crimes)
        if random.random() < 0.3:  # 30% recent (last 30 days)
            crime_date = generate_random_date(30)
        elif random.random() < 0.6:  # 30% medium (30-180 days)
            crime_date = generate_random_date(180)
        else:  # 40% older (up to 1 year)
            crime_date = generate_random_date(365)
        
        # Generate GPS coordinates
        if district in CITY_COORDS:
            base_lat, base_lng = CITY_COORDS[district]
            latitude = add_random_offset(base_lat, 0.1)
            longitude = add_random_offset(base_lng, 0.1)
        else:
            latitude = add_random_offset(12.9716, 2.0)  # Default to Karnataka region
            longitude = add_random_offset(76.5946, 2.0)
        
        # Create crime record
        crime = Crime(
            fir_number=f"FIR{fir_counter:04d}",
            date_occurred=crime_date,
            district=district,
            taluk=f"{district} Taluk",
            police_station=police_station,
            crime_type=crime_type,
            description=description,
            latitude=round(latitude, 4),
            longitude=round(longitude, 4)
        )
        
        db.add(crime)
        fir_counter += 1
        crimes_generated += 1
        
        # Commit in batches
        if crimes_generated % 50 == 0:
            db.commit()
            print(f"  Generated {crimes_generated} crimes...")
    
    # Final commit
    db.commit()
    print(f"✅ Successfully generated {crimes_generated} crime records!")

def seed_reference_data(db):
    """Seed districts, crime types, and police stations."""
    print("Seeding reference data...")
    
    # Check if already seeded
    from sqlalchemy import select
    if db.execute(select(District).limit(1)).first():
        print("  Reference data already exists, skipping...")
        return
    
    # Add districts
    for district_name in DISTRICTS:
        district = District(name=district_name)
        db.add(district)
    
    # Add crime types
    for ipc_section, description in CRIME_TYPES:
        crime_type = CrimeType(ipc_section=ipc_section, description=description)
        db.add(crime_type)
    
    # Add police stations
    district_map = {}
    db.commit()
    
    # Reload districts to get IDs
    from sqlalchemy import select
    for district in db.execute(select(District)).scalars():
        district_map[district.name] = district.id
    
    # Add police stations
    for district_name, stations in POLICE_STATIONS.items():
        if district_name in district_map:
            for station_name in stations:
                ps = PoliceStation(
                    name=station_name,
                    district_id=district_map[district_name],
                    taluk=f"{district_name} Taluk"
                )
                db.add(ps)
    
    db.commit()
    print("✅ Reference data seeded successfully!")

def main():
    """Main function to generate sample data."""
    print("=" * 60)
    print("KSP Crime AI - Sample Data Generator")
    print("=" * 60)
    
    # Create tables
    print("\nCreating database tables...")
    create_tables()
    print("✅ Tables created!")
    
    # Get database session
    db = SessionLocal()
    
    try:
        # Seed reference data
        seed_reference_data(db)
        
        # Generate crime records
        generate_crimes(db, num_crimes=150)
        
        # Summary
        from sqlalchemy import select, func
        total_crimes = db.execute(select(func.count(Crime.id))).scalar()
        print(f"\n" + "=" * 60)
        print(f"DATABASE SUMMARY")
        print("=" * 60)
        print(f"Total Crimes: {total_crimes}")
        print(f"Districts: {len(DISTRICTS)}")
        print(f"Crime Types: {len(CRIME_TYPES)}")
        print("=" * 60)
        
    finally:
        db.close()

if __name__ == "__main__":
    main()
