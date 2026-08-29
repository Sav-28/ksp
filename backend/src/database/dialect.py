"""
Cross-database SQL helpers.

The analytics queries need date-part extraction (year, year-month, month), which
is spelled differently in SQLite and PostgreSQL:

    SQLite      strftime('%Y-%m', col)
    PostgreSQL  to_char(col, 'YYYY-MM')

Rather than hard-coding SQLite syntax (which silently breaks the moment the app
is pointed at PostgreSQL), every raw query asks these helpers for the right
expression. This is what makes DATABASE_URL genuinely swappable.
"""
from .session import engine


def is_postgres() -> bool:
    """True when the active engine is PostgreSQL."""
    try:
        return engine.dialect.name.startswith("postgres")
    except Exception:
        return False


def year_month(col: str) -> str:
    """SQL expression yielding 'YYYY-MM' for a date column."""
    return f"to_char({col}, 'YYYY-MM')" if is_postgres() else f"strftime('%Y-%m', {col})"


def year(col: str) -> str:
    """SQL expression yielding 'YYYY' for a date column."""
    return f"to_char({col}, 'YYYY')" if is_postgres() else f"strftime('%Y', {col})"


def month_number(col: str) -> str:
    """SQL expression yielding the month as an integer 1-12."""
    if is_postgres():
        return f"CAST(EXTRACT(MONTH FROM {col}) AS INTEGER)"
    return f"CAST(strftime('%m', {col}) AS INTEGER)"
