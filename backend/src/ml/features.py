"""
Feature engineering for the offender recidivism-risk model.

Shared by BOTH training (train_risk_model.py) and serving (risk_model.py) so the
exact same feature definition is used end to end — no train/serve skew.

Target (label): is this person a REPEAT offender (accused in 2+ cases)?
Features are legitimate criminological predictors and deliberately EXCLUDE the
raw case count itself (which defines the label) to avoid leakage.
"""
from typing import Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text

FEATURE_NAMES = [
    "age", "is_male", "ses_rank", "edu_rank",
    "gang_member", "avg_severity", "max_severity", "urban", "recent_activity",
]

# Criminological seriousness weight per crime type (mirrors insights.SEVERITY).
SEVERITY = {
    "Murder": 10, "Robbery": 8, "Rioting": 7, "Burglary": 6, "Assault": 6,
    "Snatching": 5, "Counterfeiting": 5, "Cheating": 4, "Forgery": 4, "Theft": 3,
}
SES_RANK = {"Low": 0, "Lower-Middle": 1, "Middle": 2, "Upper-Middle": 3, "High": 4}
EDU_RANK = {"None": 0, "Primary": 1, "Secondary": 2, "Higher Secondary": 3,
            "Graduate": 4, "Postgraduate": 5}
URBAN_DISTRICTS = {"Bengaluru Urban", "Mysuru", "Mangaluru", "Hubli", "Dharwad",
                   "Belagavi", "Dakshina Kannada", "Kalaburagi", "Vijayapura"}


def make_vector(age, gender, ses, edu, gang_member, avg_sev, max_sev, urban, recent) -> List[float]:
    """Build a single feature vector in the canonical FEATURE_NAMES order."""
    return [
        float(age if age is not None else 30),
        1.0 if (gender or "").lower().startswith("m") else 0.0,
        float(SES_RANK.get(ses, 2)),
        float(EDU_RANK.get(edu, 2)),
        1.0 if gang_member else 0.0,
        float(avg_sev),
        float(max_sev),
        1.0 if urban else 0.0,
        1.0 if recent else 0.0,
    ]


def build_training_data(db: Session, current_year: int) -> Tuple[List[List[float]], List[int], List[int]]:
    """
    Assemble (X, y, person_ids) over every person who has been accused at least
    once. y = 1 if the person is accused in 2+ cases (repeat offender).
    """
    # Per-person aggregates from their accused cases (one query).
    rows = db.execute(text(
        """
        SELECT cp.person_id AS pid, c.crime_type AS ct,
               strftime('%Y', c.date_occurred) AS yr
        FROM case_persons cp
        JOIN crimes c ON c.id = cp.crime_id
        WHERE cp.role = 'accused'
        """
    )).fetchall()

    agg: Dict[int, Dict[str, Any]] = {}
    for r in rows:
        pid = r._mapping["pid"]
        a = agg.setdefault(pid, {"count": 0, "sev": [], "latest": 0})
        a["count"] += 1
        a["sev"].append(SEVERITY.get(r._mapping["ct"], 3))
        yr = r._mapping["yr"]
        if yr:
            a["latest"] = max(a["latest"], int(yr))

    if not agg:
        return [], [], []

    pids = list(agg.keys())
    # Person demographics + gang membership in bulk.
    persons = {p.id: p for p in db.execute(text(
        "SELECT id, age, gender, socio_economic_status, education_level, district FROM persons WHERE id IN :ids"
        .replace(":ids", "(" + ",".join(str(i) for i in pids) + ")")
    )).fetchall()}
    gang_ids = {r._mapping["person_id"] for r in db.execute(text(
        "SELECT DISTINCT person_id FROM gang_members WHERE person_id IN (" +
        ",".join(str(i) for i in pids) + ")"
    )).fetchall()}

    X, y, out_ids = [], [], []
    for pid, a in agg.items():
        p = persons.get(pid)
        if not p:
            continue
        pm = p._mapping
        avg_sev = sum(a["sev"]) / len(a["sev"]) if a["sev"] else 3
        max_sev = max(a["sev"]) if a["sev"] else 3
        urban = pm["district"] in URBAN_DISTRICTS
        recent = a["latest"] >= (current_year - 1)
        X.append(make_vector(pm["age"], pm["gender"], pm["socio_economic_status"],
                             pm["education_level"], pid in gang_ids, avg_sev, max_sev, urban, recent))
        y.append(1 if a["count"] >= 2 else 0)
        out_ids.append(pid)
    return X, y, out_ids
