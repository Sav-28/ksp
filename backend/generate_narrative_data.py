"""
Narrative dataset generator for KSP Crime AI.

Produces a LARGER, RICHER database (~1000 crimes, ~1500 persons) with deliberately
PLANTED, DISCOVERABLE patterns so analytics and the conversational AI surface real
stories instead of random noise:

  1. Chain-snatching gang ("Shadow Hawks") escalating in specific Bengaluru
     Urban stations over the last few months  → hotspot + surge + network + forecast
  2. Money-laundering ring (connected accounts + suspicious transfers) tied to
     cheating/counterfeiting cases                                  → financial trails
  3. An escalating repeat offender (theft → burglary → robbery → assault) → profiling
  4. A festival-season theft spike in one month                     → trend analytics
  5. Realistic demographic skews                                    → sociological insights

Same schema as before — NO code/feature changes. Safe to re-run (clears & rebuilds).
Run:  python generate_narrative_data.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import random
from datetime import date, timedelta

from src.database.session import SessionLocal, create_tables
from src.database.models import (
    Crime, District, PoliceStation, CrimeType,
    Person, CasePerson, FIRDetails, Relationship,
    Gang, GangMember, FinancialAccount, Transaction
)

random.seed(2025)  # reproducible

TODAY = date.today()

# --- Reference data -------------------------------------------------------
DISTRICTS = [
    "Bengaluru Urban", "Bengaluru Rural", "Mysuru", "Belagavi", "Kalaburagi",
    "Mangaluru", "Hubli", "Dharwad", "Tumakuru", "Raichur",
]

# District centroids nudged firmly onto land (coastal ones shifted inland/east)
DISTRICT_COORDS = {
    "Bengaluru Urban": (12.9716, 77.5946), "Bengaluru Rural": (13.2846, 77.5750),
    "Mysuru": (12.2958, 76.6394), "Belagavi": (15.8497, 74.5060),
    "Kalaburagi": (17.3297, 76.8343), "Mangaluru": (12.8700, 74.9200),
    "Hubli": (15.3647, 75.1240), "Dharwad": (15.4589, 75.0078),
    "Tumakuru": (13.3409, 77.1010), "Raichur": (16.2076, 77.3463),
}

# Minimum longitude per district to keep points off the sea (coastal guard)
_MIN_LNG = {"Mangaluru": 74.87, "Belagavi": 74.45}

POLICE_STATIONS = {
    "Bengaluru Urban": ["Koramangala", "Indiranagar", "Jayanagar", "Whitefield", "MG Road", "Yelahanka"],
    "Bengaluru Rural": ["Devanahalli", "Hoskote", "Nelamangala"],
    "Mysuru": ["Mysuru City", "K.R. Nagar", "Nazarbad", "Vijayanagar"],
    "Belagavi": ["Belagavi City", "Khanapur", "Gokak"],
    "Kalaburagi": ["Kalaburagi City", "Gulbarga", "Aland"],
    "Mangaluru": ["Mangaluru City", "Ullal", "Surathkal"],
    "Hubli": ["Hubli City", "Gokul Road", "Vidyanagar"],
    "Dharwad": ["Dharwad City", "Kelageri"],
    "Tumakuru": ["Tumakuru City", "Sira", "Tiptur"],
    "Raichur": ["Raichur City", "Sindhanur", "Manvi"],
}

CRIME_TYPES = [
    ("379", "Theft"), ("302", "Murder"), ("356", "Snatching"), ("392", "Robbery"),
    ("351", "Assault"), ("454", "Burglary"), ("146", "Rioting"), ("420", "Cheating"),
    ("463", "Forgery"), ("489A", "Counterfeiting"),
]
IPC_BY_TYPE = {name: sec for sec, name in CRIME_TYPES}

# Realistic crime-type mix (calibrated to NCRB-style proportions — property
# crime dominates, murder is rare). Aligned to CRIME_TYPES order:
# Theft, Murder, Snatching, Robbery, Assault, Burglary, Rioting, Cheating,
# Forgery, Counterfeiting.
CRIME_TYPE_WEIGHTS = [30, 4, 8, 7, 12, 12, 6, 11, 6, 4]

CRIME_DESCRIPTIONS = {
    "Theft": ["Mobile phone theft from public bus", "Laptop theft from parked vehicle",
              "Bike theft from parking lot", "Jewelry theft from residence",
              "Wallet theft from shopping mall", "Cash theft from auto rickshaw",
              "Two-wheeler theft at night"],
    "Murder": ["Homicide investigation ongoing", "Murder case under investigation",
               "Suspect arrested in murder case", "Fatal assault leading to death"],
    "Snatching": ["Chain snatching by bike-borne assailants", "Mobile phone snatching on road",
                  "Bag snatching incident", "Gold chain snatched from pedestrian"],
    "Robbery": ["Armed robbery at shop", "House robbery during daytime",
                "ATM robbery attempt", "Bank robbery investigation"],
    "Assault": ["Physical assault after argument", "Assault case registered",
                "Group assault incident", "Assault with deadly weapon"],
    "Burglary": ["Residential burglary reported", "Shop burglary at night",
                 "Office burglary during weekend", "House breaking and theft"],
    "Rioting": ["Public riot and disturbance", "Group clash incident", "Unlawful assembly case"],
    "Cheating": ["Online fraud case", "Investment scam reported", "Credit card fraud",
                 "Business fraud investigation"],
    "Forgery": ["Document forgery case", "Signature forgery detected", "Certificate forgery"],
    "Counterfeiting": ["Fake currency seized", "Counterfeit notes recovered",
                       "Currency counterfeiting racket busted"],
}

FIRST_NAMES = ["Ravi", "Suresh", "Manjunath", "Prakash", "Vijay", "Anand", "Kiran", "Naveen",
               "Ramesh", "Mahesh", "Santosh", "Girish", "Lokesh", "Dinesh", "Harish", "Umesh",
               "Lakshmi", "Geetha", "Sunitha", "Pavithra", "Divya", "Ananya", "Kavya", "Shruthi",
               "Roopa", "Asha", "Deepa", "Nandini", "Imran", "Salman", "Abdul", "Fayaz",
               "Joseph", "Thomas", "Antony", "David", "Rahul", "Arjun", "Vikram", "Sandeep"]
LAST_NAMES = ["Gowda", "Reddy", "Shetty", "Nayak", "Patil", "Hegde", "Rao", "Kumar", "Naik",
              "Murthy", "Acharya", "Desai", "Kulkarni", "Pai", "Bhat", "Shastri", "Khan",
              "Sheikh", "Pinto", "D'Souza"]
OCCUPATIONS = ["Daily Wage Labourer", "Auto Driver", "Shopkeeper", "Farmer", "Unemployed",
               "Mechanic", "Software Engineer", "Businessman", "Student", "Security Guard",
               "Delivery Agent", "Construction Worker", "Vendor", "Clerk", "Driver"]
EDUCATION = ["None", "Primary", "Secondary", "Higher Secondary", "Graduate", "Postgraduate"]
SES = ["Low", "Lower-Middle", "Middle", "Upper-Middle", "High"]
BANKS = ["State Bank", "Canara Bank", "Karnataka Bank", "Union Bank", "HDFC", "ICICI"]
STATUSES = ["Registered", "Under Investigation", "Chargesheet Filed", "Closed", "Convicted", "Acquitted"]
OUTCOMES = {"Registered": "Pending", "Under Investigation": "Pending",
            "Chargesheet Filed": "Solved", "Closed": "Unsolved",
            "Convicted": "Convicted", "Acquitted": "Acquitted"}
IO_NAMES = ["Insp. " + n + " " + l for n, l in zip(
    ["Ramesh", "Sunitha", "Vijay", "Kavya", "Anand", "Roopa", "Girish", "Deepa"],
    ["Gowda", "Reddy", "Patil", "Shetty", "Rao", "Naik", "Hegde", "Murthy"])]


def rand_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def mask_phone():
    return "9" + str(random.randint(0, 9)) + "XXXXXX" + str(random.randint(10, 99))


def mask_account():
    return "XXXX" + str(random.randint(1000, 9999))


def coords_for(district):
    base = DISTRICT_COORDS.get(district, (13.0, 76.0))
    # Tighter spread (~6 km) so points stay within the district and on land.
    lat = base[0] + random.uniform(-0.06, 0.06)
    lng = base[1] + random.uniform(-0.06, 0.06)
    # Coastal guard: don't let points drift west into the Arabian Sea.
    min_lng = _MIN_LNG.get(district)
    if min_lng is not None and lng < min_lng:
        lng = min_lng + random.uniform(0.0, 0.03)
    return round(lat, 4), round(lng, 4)


# Sequential FIR numbering
_fir_counter = {"n": 0}
def next_fir():
    _fir_counter["n"] += 1
    return f"FIR{_fir_counter['n']:04d}"


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
def clear_all(db):
    print("Clearing existing data...")
    for model in [Transaction, FinancialAccount, GangMember, Gang, Relationship,
                  CasePerson, FIRDetails, Crime, Person, PoliceStation, CrimeType, District]:
        db.query(model).delete()
    db.commit()


def seed_reference(db):
    print("Seeding reference data...")
    for d in DISTRICTS:
        db.add(District(name=d))
    for sec, name in CRIME_TYPES:
        db.add(CrimeType(ipc_section=sec, description=name))
    db.commit()
    dmap = {d.name: d.id for d in db.query(District).all()}
    for dname, stations in POLICE_STATIONS.items():
        for s in stations:
            db.add(PoliceStation(name=s, district_id=dmap[dname], taluk=f"{dname} Taluk"))
    db.commit()


def make_persons(db, n=1500):
    print(f"Creating {n} persons...")
    persons = []
    for _ in range(n):
        age = random.randint(18, 68)
        # SES skew: lower bands more common (realistic for accused population later)
        ses = random.choices(SES, weights=[28, 26, 22, 16, 8])[0]
        edu = random.choices(EDUCATION, weights=[12, 18, 26, 20, 17, 7])[0]
        district = random.choice(DISTRICTS)
        lat, lng = coords_for(district)
        p = Person(
            full_name=rand_name(), age=age,
            gender=random.choices(["Male", "Female"], weights=[72, 28])[0],
            occupation=random.choice(OCCUPATIONS), education_level=edu,
            socio_economic_status=ses, address=f"{random.randint(1, 300)}, {district}",
            district=district, phone_masked=mask_phone(),
            latitude=lat, longitude=lng, risk_score=0.0,
        )
        db.add(p)
        persons.append(p)
    db.commit()
    return persons


def add_crime(db, crime_type, district, when, station=None, desc=None):
    if station is None:
        station = random.choice(POLICE_STATIONS.get(district, [f"{district} Station"]))
    if desc is None:
        desc = random.choice(CRIME_DESCRIPTIONS.get(crime_type, ["Crime reported"]))
    lat, lng = coords_for(district)
    c = Crime(fir_number=next_fir(), date_occurred=when, district=district,
              taluk=f"{district} Taluk", police_station=station, crime_type=crime_type,
              description=desc, latitude=lat, longitude=lng)
    db.add(c)
    db.flush()  # get id
    return c


def add_fir(db, crime, status=None):
    status = status or random.choices(STATUSES, weights=[15, 30, 20, 15, 12, 8])[0]
    filed = crime.date_occurred + timedelta(days=random.randint(0, 3))
    closed = filed + timedelta(days=random.randint(20, 300)) if status in ("Closed", "Convicted", "Acquitted") else None
    db.add(FIRDetails(crime_id=crime.id, investigation_status=status,
                      investigating_officer=random.choice(IO_NAMES),
                      ipc_sections=IPC_BY_TYPE.get(crime.crime_type, "000"),
                      arrest_made=status in ("Chargesheet Filed", "Convicted"),
                      case_outcome=OUTCOMES[status],
                      court_status="In Trial" if status == "Chargesheet Filed" else ("Disposed" if closed else "—"),
                      filed_date=filed, closed_date=closed))


def link(db, crime, person, role):
    db.add(CasePerson(crime_id=crime.id, person_id=person.id, role=role))


def rel(db, a, b, rtype, crime=None, strength=0.8):
    db.add(Relationship(person_a_id=a.id, person_b_id=b.id, relationship_type=rtype,
                        crime_id=crime.id if crime else None, strength=strength))


def weighted_past_date(days_back=730, recent_bias=0.35):
    """Random past date; recent_bias fraction land in the last 90 days."""
    if random.random() < recent_bias:
        return TODAY - timedelta(days=random.randint(0, 90))
    return TODAY - timedelta(days=random.randint(0, days_back))


def generate_background(db, persons, n=820):
    """Bulk realistic crimes with accused/victims and FIR details."""
    print(f"Generating {n} background crimes...")
    offender_pool = random.sample(persons, k=len(persons) // 6)  # ~16% are repeat-prone
    victim_pool = [p for p in persons if p not in offender_pool]

    # Demographic skew per crime type (so sociological insights are meaningful)
    # Map crime type -> preferred SES / age band for accused
    crime_names = [c[1] for c in CRIME_TYPES]
    for i in range(n):
        # Realistic crime-type mix (property crime common, murder rare) and
        # population-weighted districts — so analytics look credible.
        ctype = random.choices(crime_names, weights=CRIME_TYPE_WEIGHTS)[0]
        district = random.choices(DISTRICTS, weights=[22, 8, 13, 11, 10, 11, 12, 7, 9, 9])[0]
        when = weighted_past_date()
        crime = add_crime(db, ctype, district, when)
        add_fir(db, crime)

        n_accused = random.choices([1, 2, 3], weights=[62, 28, 10])[0]
        accused = []
        for _ in range(n_accused):
            person = random.choice(offender_pool) if random.random() < 0.55 else random.choice(persons)
            if person not in accused:
                accused.append(person)
                link(db, crime, person, "accused")
        for _ in range(random.choices([1, 2], weights=[78, 22])[0]):
            v = random.choice(victim_pool)
            if v not in accused:
                link(db, crime, v, "victim")
        if random.random() < 0.25:
            link(db, crime, random.choice(persons), "witness")
        for a in range(len(accused)):
            for b in range(a + 1, len(accused)):
                rel(db, accused[a], accused[b], "co_accused", crime, round(random.uniform(0.5, 1.0), 2))

        if i % 200 == 0:
            db.commit()
    db.commit()
    return offender_pool


# ---------------------------------------------------------------------------
# Planted narratives
# ---------------------------------------------------------------------------
def plant_snatching_gang(db, persons):
    """
    'Shadow Hawks' — a chain-snatching gang escalating in specific Bengaluru
    Urban stations, with activity concentrated in the last ~90 days so it shows
    up as a hotspot, an emerging surge, and a forecast alert.
    """
    print("Planting narrative 1: chain-snatching gang (Shadow Hawks)...")
    gang = Gang(name="Shadow Hawks", base_district="Bengaluru Urban",
                primary_activity="Chain Snatching", active=True)
    db.add(gang)
    db.flush()

    members = random.sample(persons, k=6)
    for idx, m in enumerate(members):
        m.district = "Bengaluru Urban"
        m.age = random.randint(19, 32)
        m.socio_economic_status = random.choice(["Low", "Lower-Middle"])
        db.add(GangMember(gang_id=gang.id, person_id=m.id,
                          role="Leader" if idx == 0 else random.choice(["Member", "Member", "Associate"])))
        if idx > 0:
            rel(db, members[0], m, "gang_member", strength=0.95)

    hot_stations = ["Koramangala", "Indiranagar", "MG Road"]
    # Escalating monthly counts over the last 6 months (more recent = more)
    for months_ago, count in zip(range(5, -1, -1), [3, 4, 6, 8, 11, 14]):
        for _ in range(count):
            day_offset = months_ago * 30 + random.randint(0, 29)
            when = TODAY - timedelta(days=day_offset)
            ctype = random.choices(["Snatching", "Robbery"], weights=[80, 20])[0]
            crime = add_crime(db, ctype, "Bengaluru Urban", when,
                              station=random.choice(hot_stations))
            add_fir(db, crime, status=random.choice(["Registered", "Under Investigation", "Under Investigation"]))
            # 1-2 gang members as accused
            crew = random.sample(members, k=random.randint(1, 2))
            for m in crew:
                link(db, crime, m, "accused")
            link(db, crime, random.choice(persons), "victim")
    db.commit()


def plant_money_laundering(db, persons):
    """A connected ring of accounts moving large sums, tied to cheating/counterfeiting."""
    print("Planting narrative 2: money-laundering ring...")
    ring = random.sample(persons, k=5)
    accounts = []
    for p in ring:
        acc = FinancialAccount(person_id=p.id, account_number_masked=mask_account(),
                               bank_name=random.choice(BANKS), account_type="Current",
                               balance=round(random.uniform(50000, 900000), 2), flagged=True)
        db.add(acc)
        accounts.append(acc)
        rel(db, ring[0], p, "financial", strength=0.9) if p != ring[0] else None
    db.flush()

    # A few linked cheating/counterfeiting crimes
    for _ in range(8):
        ctype = random.choice(["Cheating", "Counterfeiting"])
        district = random.choice(["Bengaluru Urban", "Mangaluru"])
        when = weighted_past_date(days_back=300, recent_bias=0.5)
        crime = add_crime(db, ctype, district, when)
        add_fir(db, crime, status="Under Investigation")
        for m in random.sample(ring, k=2):
            link(db, crime, m, "accused")
        # Layered transfers through the ring
        for i in range(len(accounts) - 1):
            db.add(Transaction(from_account_id=accounts[i].id, to_account_id=accounts[i + 1].id,
                               amount=round(random.uniform(80000, 600000), 2),
                               date=crime.date_occurred + timedelta(days=random.randint(0, 8)),
                               transaction_type="Transfer", is_suspicious=True, crime_id=crime.id))
    db.commit()


def plant_escalating_offender(db, persons):
    """One offender whose crimes escalate in severity over time → high risk score."""
    print("Planting narrative 3: escalating repeat offender...")
    offender = random.choice(persons)
    offender.full_name = "Vikram Reddy"
    offender.age = 29
    offender.district = "Mysuru"
    offender.socio_economic_status = "Low"
    db.add(offender)
    # Escalation: theft → burglary → robbery → assault → murder, over ~2 years
    escalation = [("Theft", 700), ("Theft", 600), ("Burglary", 470), ("Burglary", 360),
                  ("Robbery", 220), ("Robbery", 120), ("Assault", 55), ("Murder", 20)]
    for ctype, days_ago in escalation:
        when = TODAY - timedelta(days=days_ago)
        crime = add_crime(db, ctype, "Mysuru", when)
        add_fir(db, crime, status=random.choice(["Chargesheet Filed", "Convicted", "Under Investigation"]))
        link(db, crime, offender, "accused")
        link(db, crime, random.choice(persons), "victim")

    # Give him a gang role + associates so he surfaces in the network too
    gang = Gang(name="Mysuru Mavericks", base_district="Mysuru",
                primary_activity="Robbery", active=True)
    db.add(gang)
    db.flush()
    db.add(GangMember(gang_id=gang.id, person_id=offender.id, role="Leader"))
    for _ in range(3):
        assoc = random.choice(persons)
        if assoc.id != offender.id:
            db.add(GangMember(gang_id=gang.id, person_id=assoc.id, role="Member"))
            rel(db, offender, assoc, "gang_member", strength=0.9)
    db.commit()
    return offender


def plant_festival_spike(db, persons, months_ago=8):
    """A theft spike concentrated in one festival month across several districts."""
    print("Planting narrative 4: festival-season theft spike...")
    base = TODAY - timedelta(days=months_ago * 30)
    for _ in range(38):
        district = random.choice(DISTRICTS)
        when = base + timedelta(days=random.randint(0, 27))
        crime = add_crime(db, "Theft", district, when,
                          desc=random.choice(CRIME_DESCRIPTIONS["Theft"]))
        add_fir(db, crime)
        link(db, crime, random.choice(persons), "accused")
        link(db, crime, random.choice(persons), "victim")
    db.commit()


def make_general_finance(db, persons):
    """Background accounts + normal transactions so the ring stands out, not alone."""
    print("Creating general financial accounts & transactions...")
    holders = random.sample(persons, k=int(len(persons) * 0.35))
    accounts = []
    for p in holders:
        acc = FinancialAccount(person_id=p.id, account_number_masked=mask_account(),
                               bank_name=random.choice(BANKS),
                               account_type=random.choice(["Savings", "Current"]),
                               balance=round(random.uniform(1000, 400000), 2), flagged=False)
        db.add(acc)
        accounts.append(acc)
    db.commit()
    for _ in range(len(accounts) * 2):
        a, b = random.sample(accounts, 2)
        db.add(Transaction(from_account_id=a.id, to_account_id=b.id,
                           amount=round(random.uniform(500, 60000), 2),
                           date=TODAY - timedelta(days=random.randint(0, 365)),
                           transaction_type=random.choice(["Transfer", "Cash Deposit", "Withdrawal"]),
                           is_suspicious=False))
    db.commit()


def make_extra_gangs(db, offender_pool):
    """A few more gangs so the network view has multiple clusters."""
    print("Creating additional gangs...")
    names = [("Iron Cobras", "Kalaburagi", "Robbery"), ("City Sharks", "Hubli", "Counterfeiting"),
             ("Red Wolves", "Belagavi", "Extortion"), ("Royal Eagles", "Raichur", "Vehicle Theft")]
    for nm, dist, act in names:
        g = Gang(name=nm, base_district=dist, primary_activity=act, active=random.random() < 0.8)
        db.add(g)
        db.flush()
        members = random.sample(offender_pool, k=min(random.randint(3, 6), len(offender_pool)))
        for idx, m in enumerate(members):
            db.add(GangMember(gang_id=g.id, person_id=m.id,
                              role="Leader" if idx == 0 else "Member"))
            if idx > 0:
                rel(db, members[0], m, "gang_member", strength=0.85)
    db.commit()


def main():
    print("=" * 64)
    print("KSP Crime AI — Narrative Dataset Generator")
    print("=" * 64)
    create_tables()
    db = SessionLocal()
    try:
        clear_all(db)
        seed_reference(db)
        persons = make_persons(db, n=1500)
        offender_pool = generate_background(db, persons, n=820)
        plant_snatching_gang(db, persons)
        plant_money_laundering(db, persons)
        plant_escalating_offender(db, persons)
        plant_festival_spike(db, persons)
        make_extra_gangs(db, offender_pool)
        make_general_finance(db, persons)

        print("\n" + "=" * 64)
        print("NARRATIVE DATASET SUMMARY")
        print("=" * 64)
        print(f"  Crimes            : {db.query(Crime).count()}")
        print(f"  Persons           : {db.query(Person).count()}")
        print(f"  Case-person links : {db.query(CasePerson).count()}")
        print(f"  FIR details       : {db.query(FIRDetails).count()}")
        print(f"  Relationships     : {db.query(Relationship).count()}")
        print(f"  Gangs             : {db.query(Gang).count()}")
        print(f"  Gang members      : {db.query(GangMember).count()}")
        print(f"  Financial accounts: {db.query(FinancialAccount).count()}")
        print(f"  Transactions      : {db.query(Transaction).count()}")
        print(f"    - suspicious    : {db.query(Transaction).filter_by(is_suspicious=True).count()}")
        print("=" * 64)
        print("Planted stories: Shadow Hawks snatching gang (Bengaluru, recent surge),")
        print("money-laundering ring, escalating offender 'Vikram Reddy', festival theft spike.")
        print("[DONE] Narrative dataset generated successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
