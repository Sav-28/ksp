"""
Initialize the database: create tables and seed data.
"""

from src.database.session import SessionLocal, create_tables
from src.database import seeds
from sqlalchemy.orm import Session

def init_db():
    """Initialize the database."""
    print("Creating database tables...")
    create_tables()
    print("Tables created successfully.")

    print("Seeding initial data...")
    db: Session = SessionLocal()
    try:
        seeds.seed_database(db)
    finally:
        db.close()
    print("Database seeding completed!")

if __name__ == "__main__":
    init_db()