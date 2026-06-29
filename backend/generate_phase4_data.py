"""
Phase 4 data generator for KSP Crime AI.

Builds a realistic, INTERLINKED crime-intelligence dataset on top of the
existing `crimes` table:
  - FIR investigation details for every crime
  - Persons with demographics & socio-economic attributes
  - Accused / victim / witness links to crimes (with repeat offenders)
  - Gangs and gang members (organized crime)
  - Person-to-person relationships (criminal network)
  - Financial accounts and transactions (money trails)

Safe to re-run: it clears and rebuilds the Phase 4 tables (not the crimes table).
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import random
from datetime import date, timedelta

from src.database.session import SessionLocal, create_tables
from src.database.models import (
    Crime, Person, CasePerson, FIRDetails, Relationship,
    Gang, GangMember, FinancialAccount, Transaction
)

random.seed(42)  # reproducible dataset

# ---------------------------------------------------------------------------
# Reference data for realistic generation
# ---------------------------------------------------------------------------
FIRST_NAMES = [
    "Ravi", "Suresh", "Manjunath", "Prakash", "Vijay", "Anand", "Kiran", "Naveen",
    "Ramesh", "Mahesh", "Santosh", "Girish", "Lokesh", "Dinesh", "Harish", "Umesh",
    "Lakshmi", "Geetha", "Sunitha", "Pavithra", "Divya", "Ananya", "Kavya", "Shruthi",
    "Roopa", "Asha", "Deepa", "Nandini", "Imran", "Salman", "Abdul", "Fayaz",
    "Joseph", "Thomas", "Antony", "David"
]
LAST_NAMES = [
    "Gowda", "Reddy", "Shetty", "Nayak", "Patil", "Hegde", "Rao", "Kumar",
    "Naik", "Murthy", "Acharya", "Desai", "Kulkarni", "Pai", "Bhat", "Shastri",
    "Khan", "Sheikh", "Pinto", "D'Souza"
]
OCCUPATIONS = [
    "Daily Wage Labourer", "Auto Driver", "Shopkeeper", "Farmer", "Unemployed",
    "Mechanic", "Software Engineer", "Businessman", "Student", "Security Guard",
    "Delivery Agent", "Construction Worker", "Vendor", "Clerk", "Driver"
]
EDUCATION = ["None", "Primary", "Secondary", "Higher Secondary", "Graduate", "Postgraduate"]
SES = ["Low", "Lower-Middle", "Middle", "Upper-Middle", "High"]
GENDERS = ["Male", "Male", "Male", "Female"]  # weighted toward male for accused realism
BANKS = ["State Bank", "Canara Bank", "Karnataka Bank", "Union Bank", "HDFC", "ICICI"]
STATUSES = ["Registered", "Under Investigation", "Chargesheet Filed", "Closed", "Convicted", "Acquitted"]
OUTCOMES = {"Registered": "Pending", "Under Investigation": "Pending",
            "Chargesheet Filed": "Solved", "Closed": "Unsolved",
            "Convicted": "Convicted", "Acquitted": "Acquitted"}
IO_NAMES = ["Insp. " + n + " " + l for n, l in zip(
    ["Ramesh", "Sunitha", "Vijay", "Kavya", "Anand", "Roopa", "Girish", "Deepa"],
    ["Gowda", "Reddy", "Patil", "Shetty", "Rao", "Naik", "Hegde", "Murthy"])]

IPC_BY_TYPE = {
    "Theft": "379", "Murder": "302", "Snatching": "356", "Robbery": "392",
    "Assault": "351", "Burglary": "454", "Rioting": "146", "Cheating": "420",
    "Forgery": "463", "Counterfeiting": "489A"
}


def rand_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def mask_phone():
    return "9" + str(random.randint(0, 9)) + "XXXXXX" + str(random.randint(10, 99))


def mask_account():
    return "XXXX" + str(random.randint(1000, 9999))


def clear_phase4(db):
    """Remove existing Phase 4 rows so the script is idempotent."""
    print("Clearing existing Phase 4 data...")
    for model in [Transaction, FinancialAccount, GangMember, Gang,
                  Relationship, CasePerson, FIRDetails, Person]:
        db.query(model).delete()
    db.commit()


def make_persons(db, crimes, n_persons=260):
    """Create a pool of persons with demographics."""
    print(f"Creating {n_persons} persons...")
    districts = list({c.district for c in crimes if c.district})
    persons = []
    for _ in range(n_persons):
        gender = random.choice(GENDERS)
        age = random.randint(18, 65)
        # Socio-economic skew: younger + low education slightly more likely low SES
        ses = random.choices(SES, weights=[30, 25, 22, 15, 8])[0]
        edu = random.choices(EDUCATION, weights=[12, 18, 25, 20, 18, 7])[0]
        district = random.choice(districts) if districts else "Bengaluru Urban"
        p = Person(
            full_name=rand_name(),
            age=age,
            gender=gender,
            occupation=random.choice(OCCUPATIONS),
            education_level=edu,
            socio_economic_status=ses,
            address=f"{random.randint(1, 200)}, {district}",
            district=district,
            phone_masked=mask_phone(),
            latitude=round(12 + random.uniform(0, 5), 4),
            longitude=round(74 + random.uniform(0, 4), 4),
            risk_score=0.0,
        )
        db.add(p)
        persons.append(p)
    db.commit()
    return persons


def make_fir_details(db, crimes):
    """One FIRDetails row per crime."""
    print(f"Creating FIR details for {len(crimes)} crimes...")
    for c in crimes:
        status = random.choices(STATUSES, weights=[15, 30, 20, 15, 12, 8])[0]
        filed = c.date_occurred + timedelta(days=random.randint(0, 3))
        closed = None
        if status in ("Closed", "Convicted", "Acquitted"):
            closed = filed + timedelta(days=random.randint(20, 300))
        db.add(FIRDetails(
            crime_id=c.id,
            investigation_status=status,
            investigating_officer=random.choice(IO_NAMES),
            ipc_sections=IPC_BY_TYPE.get(c.crime_type, "000"),
            arrest_made=status in ("Chargesheet Filed", "Convicted"),
            case_outcome=OUTCOMES[status],
            court_status="In Trial" if status == "Chargesheet Filed" else ("Disposed" if closed else "—"),
            filed_date=filed,
            closed_date=closed,
        ))
    db.commit()


def link_people_to_crimes(db, crimes, persons):
    """
    Assign accused, victims and witnesses to crimes. Deliberately reuse a
    subset of persons as repeat offenders across multiple crimes.
    """
    print("Linking persons to crimes (accused/victim/witness)...")
    # Designate ~15% of persons as habitual offenders (reused frequently)
    offender_pool = random.sample(persons, k=max(1, len(persons) // 7))
    victim_pool = [p for p in persons if p not in offender_pool]

    for c in crimes:
        # 1-3 accused; favour the offender pool to create repeat offenders
        n_accused = random.choices([1, 2, 3], weights=[60, 30, 10])[0]
        accused = []
        for _ in range(n_accused):
            if random.random() < 0.55:
                person = random.choice(offender_pool)
            else:
                person = random.choice(persons)
            if person not in accused:
                accused.append(person)
                db.add(CasePerson(crime_id=c.id, person_id=person.id, role="accused"))

        # 1-2 victims (not from the accused list)
        n_victims = random.choices([1, 2], weights=[75, 25])[0]
        for _ in range(n_victims):
            person = random.choice(victim_pool)
            if person not in accused:
                db.add(CasePerson(crime_id=c.id, person_id=person.id, role="victim"))

        # Occasionally a witness
        if random.random() < 0.3:
            db.add(CasePerson(crime_id=c.id, person_id=random.choice(persons).id, role="witness"))

        # Co-accused relationships (network edges)
        for i in range(len(accused)):
            for j in range(i + 1, len(accused)):
                db.add(Relationship(
                    person_a_id=accused[i].id, person_b_id=accused[j].id,
                    relationship_type="co_accused", crime_id=c.id,
                    strength=round(random.uniform(0.5, 1.0), 2),
                ))
    db.commit()
    return offender_pool


def make_gangs(db, crimes, offender_pool):
    """Create organized crime groups from the offender pool."""
    print("Creating gangs and memberships...")
    gang_activities = ["Robbery", "Counterfeiting", "Extortion", "Vehicle Theft", "Drug Peddling"]
    districts = list({c.district for c in crimes if c.district}) or ["Bengaluru Urban"]
    gangs = []
    n_gangs = 6
    for i in range(n_gangs):
        g = Gang(
            name=f"{random.choice(['Black', 'Red', 'City', 'Shadow', 'Iron', 'Royal'])} "
                 f"{random.choice(['Tigers', 'Cobras', 'Hawks', 'Wolves', 'Eagles', 'Sharks'])}",
            base_district=random.choice(districts),
            primary_activity=random.choice(gang_activities),
            active=random.random() < 0.8,
        )
        db.add(g)
        gangs.append(g)
    db.commit()

    # Assign offenders to gangs
    for g in gangs:
        size = random.randint(3, 7)
        members = random.sample(offender_pool, k=min(size, len(offender_pool)))
        for idx, person in enumerate(members):
            db.add(GangMember(
                gang_id=g.id, person_id=person.id,
                role="Leader" if idx == 0 else random.choice(["Member", "Member", "Associate"]),
            ))
            # Gang-member relationship edges
            if idx > 0:
                db.add(Relationship(
                    person_a_id=members[0].id, person_b_id=person.id,
                    relationship_type="gang_member", strength=0.9,
                ))
    db.commit()
    return gangs


def make_financials(db, persons, crimes):
    """Create accounts and transactions, with suspicious money trails."""
    print("Creating financial accounts and transactions...")
    # ~40% of persons have an account
    account_holders = random.sample(persons, k=int(len(persons) * 0.4))
    accounts = []
    for p in account_holders:
        acc = FinancialAccount(
            person_id=p.id,
            account_number_masked=mask_account(),
            bank_name=random.choice(BANKS),
            account_type=random.choice(["Savings", "Current"]),
            balance=round(random.uniform(1000, 500000), 2),
            flagged=False,
        )
        db.add(acc)
        accounts.append(acc)
    db.commit()

    if len(accounts) < 2:
        return

    # Normal transactions
    for _ in range(len(accounts) * 3):
        a, b = random.sample(accounts, 2)
        db.add(Transaction(
            from_account_id=a.id, to_account_id=b.id,
            amount=round(random.uniform(500, 50000), 2),
            date=date.today() - timedelta(days=random.randint(0, 365)),
            transaction_type=random.choice(["Transfer", "Cash Deposit", "Withdrawal"]),
            is_suspicious=False,
        ))

    # Suspicious money trails tied to financial crimes
    financial_crimes = [c for c in crimes if c.crime_type in ("Cheating", "Counterfeiting", "Robbery")]
    for c in random.sample(financial_crimes, k=min(15, len(financial_crimes))):
        trail = random.sample(accounts, k=min(random.randint(2, 4), len(accounts)))
        for i in range(len(trail) - 1):
            acc = trail[i]
            acc.flagged = True
            db.add(Transaction(
                from_account_id=trail[i].id, to_account_id=trail[i + 1].id,
                amount=round(random.uniform(50000, 800000), 2),
                date=c.date_occurred + timedelta(days=random.randint(0, 10)),
                transaction_type="Transfer",
                is_suspicious=True,
                crime_id=c.id,
            ))
        if trail:
            trail[-1].flagged = True
    db.commit()


def main():
    print("=" * 60)
    print("KSP Crime AI — Phase 4 Intelligence Data Generator")
    print("=" * 60)

    create_tables()
    db = SessionLocal()
    try:
        crimes = db.query(Crime).all()
        if not crimes:
            print("ERROR: No crimes in DB. Run generate_sample_data.py first.")
            return
        print(f"Found {len(crimes)} existing crimes.")

        clear_phase4(db)
        persons = make_persons(db, crimes)
        make_fir_details(db, crimes)
        offender_pool = link_people_to_crimes(db, crimes, persons)
        make_gangs(db, crimes, offender_pool)
        make_financials(db, persons, crimes)

        # Summary
        print("\n" + "=" * 60)
        print("PHASE 4 DATA SUMMARY")
        print("=" * 60)
        print(f"  Persons           : {db.query(Person).count()}")
        print(f"  Case-person links : {db.query(CasePerson).count()}")
        print(f"    - accused       : {db.query(CasePerson).filter_by(role='accused').count()}")
        print(f"    - victims       : {db.query(CasePerson).filter_by(role='victim').count()}")
        print(f"  FIR details       : {db.query(FIRDetails).count()}")
        print(f"  Relationships     : {db.query(Relationship).count()}")
        print(f"  Gangs             : {db.query(Gang).count()}")
        print(f"  Gang members      : {db.query(GangMember).count()}")
        print(f"  Financial accounts: {db.query(FinancialAccount).count()}")
        print(f"  Transactions      : {db.query(Transaction).count()}")
        print(f"    - suspicious    : {db.query(Transaction).filter_by(is_suspicious=True).count()}")
        print("=" * 60)
        print("✅ Phase 4 data generated successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
