"""
One-command initialisation of a PostgreSQL database for KSP Crime AI.

Creates the schema (analytics + official FIR tables + compatibility view), seeds
the demo dataset, projects it into the official FIR schema, and trains the risk
model — the same steps startup performs, but run explicitly so a production
database is prepared ONCE and then left alone (with KSP_AUTOSEED=false).

Usage (PowerShell):
    $env:DATABASE_URL="postgresql://user:pass@host:5432/ksp_crime_ai"
    python setup_postgres.py

Add --skip-seed to create only the schema (e.g. before importing real KSP data).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

SKIP_SEED = "--skip-seed" in sys.argv


def main():
    url = os.getenv("DATABASE_URL", "")
    if not url:
        print("ERROR: DATABASE_URL is not set.")
        print('  PowerShell: $env:DATABASE_URL="postgresql://user:pass@host:5432/db"')
        return 1
    if url.startswith("sqlite"):
        print("WARNING: DATABASE_URL points at SQLite, not PostgreSQL.")
        print("  Set it to your PostgreSQL connection string first.")
        return 1

    from src.database.session import engine, create_tables, DATABASE_URL

    safe = DATABASE_URL
    if "@" in safe:
        safe = safe.split("//")[0] + "//***@" + safe.split("@", 1)[1]
    print(f"Target database: {safe}")
    print(f"Dialect        : {engine.dialect.name}")

    # 1. Connectivity check — fail fast with a clear message.
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            ver = conn.execute(text("SELECT version()")).scalar()
        print(f"Connected      : {str(ver)[:60]}...")
    except Exception as e:
        print(f"ERROR: could not connect — {e}")
        print("  Check the host/credentials, and that SSL is allowed "
              "(most managed providers require ?sslmode=require).")
        return 1

    # 2. Schema (both models + the v_crimes compatibility view).
    print("Creating schema...")
    create_tables()
    print("  schema ready.")

    if SKIP_SEED:
        print("--skip-seed given: schema only. Import real data, then set "
              "KSP_AUTOSEED=false.")
        return 0

    # 3. Seed the demo dataset (only if empty — never overwrite real data).
    from src.database.session import SessionLocal
    from src.database.models import Crime
    db = SessionLocal()
    existing = db.query(Crime).count()
    db.close()
    if existing:
        print(f"Database already has {existing} crimes — skipping seed.")
    else:
        print("Seeding demo dataset...")
        import generate_narrative_data
        generate_narrative_data.main()

    # 4. Project into the official FIR schema. Rebuild if the projection is
    #    missing OR incomplete (e.g. a previous run was interrupted), otherwise
    #    the app would serve a partially-populated system of record.
    from src.database.models_fir import CaseMaster
    db = SessionLocal()
    have_official = db.query(CaseMaster).count()
    total_crimes = db.query(Crime).count()
    db.close()
    if have_official == total_crimes and have_official > 0:
        print(f"Official schema already complete ({have_official} cases).")
    else:
        if have_official:
            print(f"Official schema INCOMPLETE ({have_official}/{total_crimes} cases) "
                  f"— rebuilding...")
        else:
            print("Projecting into the official FIR schema...")
        import migrate_to_fir_schema
        migrate_to_fir_schema.main()

    # 5. Train the risk model against this database.
    print("Training the offender-risk model...")
    try:
        import train_risk_model
        train_risk_model.main()
    except Exception as e:
        print(f"  skipped ({e}) — the API falls back to heuristic scoring.")

    print("\n" + "=" * 60)
    print("PostgreSQL setup complete.")
    print("Next: set KSP_AUTOSEED=false in the deployment environment so this")
    print("      data is never re-seeded, then verify GET /api/system/info")
    print("      reports \"persistent\": true.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
