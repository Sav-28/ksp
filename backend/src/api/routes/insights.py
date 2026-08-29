"""
Sociological Crime Insights (Area 4) and Criminology-Based Offender
Profiling (Area 5).

Endpoints:
  - GET /api/sociological        — crime distribution by demographic/socio-economic attributes
  - GET /api/offenders           — ranked repeat offenders with computed risk scores
  - GET /api/offenders/{id}      — detailed offender profile + behavioural summary
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import Dict, Any, List, Optional
from collections import Counter, defaultdict
from datetime import date
import math

from src.database.session import get_db
from src.database.models import Person, CasePerson, Crime, GangMember, Gang
from src.api.auth import get_current_user
from src.ml import risk_model
from src.ml.features import make_vector, URBAN_DISTRICTS as ML_URBAN
from src.services import cache

router = APIRouter()


@router.get("/model/metrics")
async def model_metrics(username: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Expose the trained risk model's evaluation metrics (or availability=false)."""
    m = risk_model.get_metrics()
    return {"available": risk_model.is_available(), "metrics": m}


# ---------------------------------------------------------------------------
# Area 4 — Sociological insights
# ---------------------------------------------------------------------------
# District urbanization classification (for socio-spatial correlation — Area 4).
URBAN_DISTRICTS = {"Bengaluru Urban", "Mysuru", "Mangaluru", "Hubli", "Dharwad", "Belagavi"}


def _urbanization(district: str) -> str:
    if not district:
        return "Unknown"
    return "Urban" if district in URBAN_DISTRICTS else "Rural / Semi-urban"


def _age_band(age: int) -> str:
    if age is None:
        return "Unknown"
    if age < 25:
        return "18-24"
    if age < 35:
        return "25-34"
    if age < 45:
        return "35-44"
    if age < 60:
        return "45-59"
    return "60+"


@router.get("/sociological")
async def sociological_insights(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Demographic profile of accused, normalised against the population baseline."""
    # Cached for 15 minutes. This walks every person and every accused link, then
    # runs a two-proportion test per cell, so it is the most expensive read in the
    # application. It only changes when cases are added.
    data, source = cache.get_or_compute(
        "insights:sociological:v1", 900, lambda: _build_sociological(db))
    data["cache"] = {"source": source, "ttl_seconds": 900}
    return data


def _build_sociological(db: Session) -> Dict[str, Any]:
    """
    Demographic profile of accused persons, NORMALISED against the recorded
    population.

    Why normalisation matters. This endpoint previously reported the raw
    distribution of accused across demographic bands, and labelled the largest
    band a "social risk factor". That is the base-rate fallacy: if a band is large
    in the population it will be large among accused, and saying so carries no
    information. Worse, it can point the wrong way. On the seeded data the 'Low'
    socio-economic band held the largest share of accused (28.7%) while being
    30.9% of the population - so accused were slightly UNDER-represented there,
    and the old output implied the opposite.

    Every dimension is therefore reported as three numbers: the share among
    accused, the share in the population, and a REPRESENTATION INDEX of one
    divided by the other. An index of 1.0 means a band appears among accused
    exactly as often as its size predicts, and only a material departure from 1.0
    is a finding.

    Counting unit: one row per accused INVOLVEMENT, not per person, so a repeat
    offender is counted once per case. The population baseline counts each person
    once. Both totals are returned so the difference is visible rather than
    implied.
    """
    # Population baseline: every person on record, counted once.
    all_persons = db.query(Person).all()
    pmap = {p.id: p for p in all_persons}

    accused_links = db.query(CasePerson).filter(CasePerson.role == "accused").all()

    DIMENSIONS = ("age_band", "gender", "socio_economic", "education",
                  "occupation", "urbanization")

    def attrs_of(p) -> Dict[str, str]:
        return {
            "age_band": _age_band(p.age),
            "gender": p.gender or "Unknown",
            "socio_economic": p.socio_economic_status or "Unknown",
            "education": p.education_level or "Unknown",
            "occupation": p.occupation or "Unknown",
            "urbanization": _urbanization(p.district),
        }

    accused_counts: Dict[str, Counter] = {d: Counter() for d in DIMENSIONS}
    population_counts: Dict[str, Counter] = {d: Counter() for d in DIMENSIONS}

    for p in all_persons:
        for dim, val in attrs_of(p).items():
            population_counts[dim][val] += 1

    distinct_accused = set()
    for link in accused_links:
        p = pmap.get(link.person_id)
        if not p:
            continue
        distinct_accused.add(p.id)
        for dim, val in attrs_of(p).items():
            accused_counts[dim][val] += 1

    accused_total = sum(accused_counts["gender"].values()) or 1
    population_total = len(all_persons) or 1

    # Bands thinner than this are too small for the index to mean anything; the
    # ratio of two small numbers is dominated by noise.
    MIN_CELL = 25
    # An index this far from parity is worth looking at - but size alone is not
    # enough, so it must also clear the significance test below.
    MATERIAL = 0.15
    # Family-wise error rate. Roughly 35 cells are tested here, so at a plain 5%
    # per test about two false findings would be expected by chance. Without this
    # correction the analysis reported 'High' socio-economic status at 1.23x and
    # 'Vendor' occupation at 1.50x, both of which are noise on unbiased data.
    ALPHA = 0.05

    def build(dim: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        rows = []
        for label, count in accused_counts[dim].items():
            pop = population_counts[dim].get(label, 0)
            accused_share = 100.0 * count / accused_total
            pop_share = 100.0 * pop / population_total
            index = (accused_share / pop_share) if pop_share else None
            reliable = count >= MIN_CELL and pop >= MIN_CELL
            p_value = _two_proportion_p(count, accused_total, pop, population_total)
            rows.append({
                "label": label,
                "count": count,
                "accused_share_pct": round(accused_share, 1),
                "population_count": pop,
                "population_share_pct": round(pop_share, 1),
                "representation_index": round(index, 2) if index is not None else None,
                "p_value": p_value,
                "reliable": reliable,
                # Direction is assigned in a second pass, once the number of
                # tests is known, because the significance bar depends on it.
                "direction": None,
            })
        rows.sort(key=lambda r: r["count"], reverse=True)
        return rows[:limit] if limit else rows

    dimensions = {d: build(d, limit=8 if d == "occupation" else None) for d in DIMENSIONS}

    # Second pass: decide which departures survive correction for the number of
    # comparisons made. Bonferroni is the plainest defensible choice, and being
    # explicit about it matters more here than squeezing out extra power.
    n_tests = sum(len(rows) for rows in dimensions.values()) or 1
    adjusted_alpha = ALPHA / n_tests
    for rows in dimensions.values():
        for r in rows:
            idx, p = r["representation_index"], r["p_value"]
            if not r["reliable"] or idx is None or p is None:
                r["direction"] = None
                continue
            material = abs(idx - 1) >= MATERIAL
            significant = p <= adjusted_alpha
            if material and significant:
                r["direction"] = "over" if idx > 1 else "under"
            else:
                r["direction"] = "parity"
            r["significant"] = bool(significant)

    # --- Findings: only bands that materially depart from parity --------------
    DIM_LABELS = {
        "age_band": "Age", "gender": "Gender", "socio_economic": "Socio-economic status",
        "education": "Education", "occupation": "Occupation", "urbanization": "Urbanisation",
    }
    findings: List[Dict[str, Any]] = []
    for dim, rows in dimensions.items():
        for r in rows:
            if r["direction"] in ("over", "under"):
                findings.append({
                    "dimension": dim,
                    "dimension_label": DIM_LABELS[dim],
                    "label": r["label"],
                    "representation_index": r["representation_index"],
                    "direction": r["direction"],
                    "accused_share_pct": r["accused_share_pct"],
                    "population_share_pct": r["population_share_pct"],
                    "statement": (
                        f"{r['label']} accounts for {r['accused_share_pct']}% of accused "
                        f"involvements against {r['population_share_pct']}% of the recorded "
                        f"population — {r['representation_index']}x "
                        f"{'over' if r['direction'] == 'over' else 'under'}-represented."
                    ),
                })
    # Strongest departures first, in either direction.
    findings.sort(key=lambda f: abs((f["representation_index"] or 1) - 1), reverse=True)

    # Dimensions where nothing departed materially. Reporting these explicitly is
    # the point: a null result is a result, and it stops a reader inferring a
    # pattern from bar lengths that only reflect population size.
    dims_with_findings = {f["dimension"] for f in findings}
    no_signal = [DIM_LABELS[d] for d in DIMENSIONS if d not in dims_with_findings]

    # --- Age by offence type -------------------------------------------------
    # Where the profile differs by offence rather than in aggregate. Uses the
    # projected official view so it reflects the system of record.
    age_by_offence: List[Dict[str, Any]] = []
    rows = db.execute(text(
        """
        SELECT c.crime_type AS offence, p.age AS age
        FROM case_persons cp
        JOIN crimes c  ON c.id = cp.crime_id
        JOIN persons p ON p.id = cp.person_id
        WHERE cp.role = 'accused' AND p.age IS NOT NULL
        """
    )).fetchall()
    per_offence: Dict[str, List[int]] = defaultdict(list)
    for r in rows:
        per_offence[r._mapping["offence"]].append(r._mapping["age"])
    overall_ages = [a for ages in per_offence.values() for a in ages]
    overall_median = _median(overall_ages)
    for offence, ages in per_offence.items():
        if len(ages) < MIN_CELL:
            continue
        med = _median(ages)
        age_by_offence.append({
            "offence": offence,
            "accused": len(ages),
            "median_age": med,
            "difference_from_overall": round(med - overall_median, 1),
            "share_under_35_pct": round(100.0 * sum(1 for a in ages if a < 35) / len(ages), 1),
        })
    age_by_offence.sort(key=lambda x: x["median_age"])

    return {
        # Normalised dimensions, each row carrying accused share, population
        # share and the index between them.
        "dimensions": dimensions,
        "findings": findings,
        "no_material_difference": no_signal,
        "age_by_offence": age_by_offence,
        "overall_median_age": overall_median,
        "method": {
            "counting_unit": "one row per accused involvement; a repeat offender "
                             "is counted once per case",
            "baseline": "all persons on record, counted once each",
            "representation_index": "share among accused divided by share in the "
                                    "population; 1.0 is parity",
            "material_threshold": f"index at or beyond {1 + MATERIAL:.2f} / "
                                  f"{1 - MATERIAL:.2f}",
            "minimum_cell": MIN_CELL,
            "significance": (
                f"two-proportion test, two-sided, Bonferroni-corrected across "
                f"{n_tests} comparisons (p must be at or below "
                f"{adjusted_alpha:.5f}); a band must clear both the effect-size "
                f"floor and this bar to be reported as a difference"
            ),
            "independence_caveat": (
                "accused involvements are not fully independent, since one repeat "
                "offender contributes several rows, so the test is somewhat "
                "anti-conservative"
            ),
            "caution": "Associations are statistical and descriptive. They do not "
                       "establish cause, and must not be used to infer criminality "
                       "from group membership.",
        },
        "totals": {
            "accused_involvements": accused_total,
            "distinct_accused_persons": len(distinct_accused),
            "population": population_total,
        },
        # --- Backward-compatible keys (older clients) -----------------------
        "by_age_band": [{"label": r["label"], "count": r["count"]} for r in dimensions["age_band"]],
        "by_gender": [{"label": r["label"], "count": r["count"]} for r in dimensions["gender"]],
        "by_socio_economic": [{"label": r["label"], "count": r["count"]} for r in dimensions["socio_economic"]],
        "by_education": [{"label": r["label"], "count": r["count"]} for r in dimensions["education"]],
        "by_occupation": [{"label": r["label"], "count": r["count"]} for r in dimensions["occupation"]],
        "by_urbanization": [{"label": r["label"], "count": r["count"]} for r in dimensions["urbanization"]],
        "insights": {
            "most_common_age_band": (dimensions["age_band"][0]["label"]
                                     if dimensions["age_band"] else None),
            "total_accused_records": accused_total,
        },
    }


def _median(values: List[float]) -> float:
    """Median without pulling in numpy, which is optional at runtime."""
    if not values:
        return 0.0
    s = sorted(values)
    mid = len(s) // 2
    return float(s[mid]) if len(s) % 2 else round((s[mid - 1] + s[mid]) / 2, 1)


def _two_proportion_p(a: int, a_total: int, b: int, b_total: int) -> Optional[float]:
    """
    Two-sided p-value for a difference between two proportions, a/a_total vs
    b/b_total, by the pooled normal approximation.

    Uses math.erf for the normal CDF so nothing outside the standard library is
    needed - the cloud build has no scipy.

    Honest limitation: accused involvements are not fully independent, because one
    repeat offender contributes several rows. That makes this test somewhat
    anti-conservative, so it is paired with a minimum cell size, an effect-size
    floor, and a correction for the number of comparisons rather than relied on
    alone.
    """
    if a_total <= 0 or b_total <= 0:
        return None
    p1 = a / a_total
    p2 = b / b_total
    pooled = (a + b) / (a_total + b_total)
    if pooled <= 0 or pooled >= 1:
        return None
    se = math.sqrt(pooled * (1 - pooled) * (1 / a_total + 1 / b_total))
    if se == 0:
        return None
    z = abs(p1 - p2) / se
    # Two-sided: 2 * (1 - Phi(z)), with Phi from the error function.
    return round(2.0 * (1.0 - 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))), 6)


# ---------------------------------------------------------------------------
# Area 5 — Offender profiling & risk scoring
# ---------------------------------------------------------------------------
# Severity weights per crime type (criminological seriousness)
SEVERITY = {
    "Murder": 10, "Robbery": 8, "Rioting": 7, "Burglary": 6, "Assault": 6,
    "Snatching": 5, "Counterfeiting": 5, "Cheating": 4, "Forgery": 4, "Theft": 3,
}


def compute_risk(db: Session, person_id: int) -> Dict[str, Any]:
    """
    Compute a 0-100 risk score for a person from:
      - number of cases as accused (recidivism)
      - severity of associated crimes
      - gang membership
      - recency of activity
    Returns the score plus the factors used (for explainability — Area 9).
    """
    links = db.query(CasePerson).filter(
        CasePerson.person_id == person_id, CasePerson.role == "accused"
    ).all()
    n_cases = len(links)

    # One query for every linked crime rather than one per link: compute_risk is
    # called per offender, so a per-link lookup multiplies round-trips fast.
    crime_ids = [l.crime_id for l in links if l.crime_id]
    crime_types = []
    latest_year = 0
    if crime_ids:
        for ctype, occurred in db.query(Crime.crime_type, Crime.date_occurred) \
                                 .filter(Crime.id.in_(crime_ids)):
            crime_types.append(ctype)
            if occurred:
                latest_year = max(latest_year, occurred.year)

    severity_total = sum(SEVERITY.get(ct, 3) for ct in crime_types)
    is_gang = db.query(GangMember).filter(GangMember.person_id == person_id).count() > 0

    # Recency: active within the last 2 years adds weight
    recency_bonus = 10 if latest_year >= (date.today().year - 1) else 0

    # Weighted score, capped at 100
    raw = (n_cases * 8) + (severity_total * 1.5) + (20 if is_gang else 0) + recency_bonus
    score = round(min(raw, 100.0), 1)

    return {
        "risk_score": score,
        "factors": {
            "cases_as_accused": n_cases,
            "severity_total": severity_total,
            "gang_member": is_gang,
            "recent_activity": recency_bonus > 0,
            "crime_types": list(Counter(crime_types).keys()),
        },
    }


@router.get("/offenders")
async def list_offenders(
    limit: int = 500,
    search: str = None,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Offenders ranked by computed risk score (bulk-optimized).

    - Default: all repeat offenders (accused in 2+ cases), ranked by risk.
    - With ?search=<name>: any accused person matching the name (even 1 case),
      so investigators can look up a specific criminal.
    """
    # Pull all accused links joined with their crimes in ONE query.
    rows = (
        db.query(
            CasePerson.person_id,
            Crime.crime_type,
            Crime.date_occurred,
        )
        .join(Crime, Crime.id == CasePerson.crime_id)
        .filter(CasePerson.role == "accused")
        .all()
    )

    # Aggregate per person in Python (no per-person DB hits).
    from collections import defaultdict
    agg: Dict[int, Dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "severity": 0, "types": [], "latest_year": 0}
    )
    for person_id, ctype, dt in rows:
        a = agg[person_id]
        a["count"] += 1
        a["severity"] += SEVERITY.get(ctype, 3)
        a["types"].append(ctype)
        if dt:
            a["latest_year"] = max(a["latest_year"], dt.year)

    if search and search.strip():
        # Search mode: any accused person whose name matches (>=1 case).
        term = f"%{search.strip()}%"
        matched_ids = {
            p.id for p in db.query(Person.id).filter(Person.full_name.ilike(term)).all()
        }
        target_ids = [pid for pid in agg.keys() if pid in matched_ids]
    else:
        # Default: repeat offenders (2+ accused cases).
        target_ids = [pid for pid, a in agg.items() if a["count"] >= 2]

    if not target_ids:
        return {"total_repeat_offenders": 0, "offenders": []}

    # Gang members in one query.
    gang_ids = {
        gm.person_id for gm in db.query(GangMember.person_id)
        .filter(GangMember.person_id.in_(target_ids)).all()
    }
    # Person records in one query.
    persons = {p.id: p for p in db.query(Person).filter(Person.id.in_(target_ids)).all()}
    repeat_ids = target_ids

    current_year = date.today().year

    # Build a feature vector per offender (same definition as training).
    valid = [(pid, persons[pid], agg[pid]) for pid in repeat_ids if pid in persons]
    vectors = []
    for pid, p, a in valid:
        sev = [SEVERITY.get(t, 3) for t in a["types"]] or [3]
        vectors.append(make_vector(
            p.age, p.gender, p.socio_economic_status, p.education_level,
            pid in gang_ids, sum(sev) / len(sev), max(sev),
            p.district in ML_URBAN, a["latest_year"] >= (current_year - 1),
        ))

    # Prefer the trained model's probability; fall back to the heuristic.
    model_scores = risk_model.score_batch(vectors)
    scored_by = "model" if model_scores is not None else "heuristic"

    offenders = []
    for i, (pid, p, a) in enumerate(valid):
        is_gang = pid in gang_ids
        if model_scores is not None:
            score = model_scores[i]
        else:
            recency_bonus = 10 if a["latest_year"] >= (current_year - 1) else 0
            raw = (a["count"] * 8) + (a["severity"] * 1.5) + (20 if is_gang else 0) + recency_bonus
            score = round(min(raw, 100.0), 1)
        p.risk_score = score
        offenders.append({
            "person_id": p.id, "name": p.full_name, "age": p.age, "gender": p.gender,
            "district": p.district, "cases": a["count"], "risk_score": score,
            "gang_member": is_gang, "crime_types": list(dict.fromkeys(a["types"])),
        })
    db.commit()

    offenders.sort(key=lambda x: x["risk_score"], reverse=True)
    return {
        "total_repeat_offenders": len(offenders),
        "offenders": offenders[:limit],
        "scored_by": scored_by,
    }


@router.get("/offenders/{person_id}")
async def offender_profile(
    person_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Detailed behavioural profile of an offender (Area 5)."""
    p = db.get(Person, person_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    risk = compute_risk(db, person_id)

    # Case history, bulk-loaded in one query instead of one per link.
    links = db.query(CasePerson).filter(
        CasePerson.person_id == person_id, CasePerson.role == "accused"
    ).all()
    crime_ids = [l.crime_id for l in links if l.crime_id]
    cases = []
    crime_types = []
    if crime_ids:
        for crime in db.query(Crime).filter(Crime.id.in_(crime_ids)):
            crime_types.append(crime.crime_type)
            cases.append({
                "fir_number": crime.fir_number, "crime_type": crime.crime_type,
                "district": crime.district, "date": str(crime.date_occurred),
            })
    cases.sort(key=lambda c: c["date"], reverse=True)

    # Gang affiliations, likewise resolved in a single query.
    memberships = db.query(GangMember).filter(GangMember.person_id == person_id).all()
    gang_ids = [gm.gang_id for gm in memberships if gm.gang_id]
    gang_map = {g.id: g for g in db.query(Gang).filter(Gang.id.in_(gang_ids))} \
        if gang_ids else {}
    gangs = [
        {"gang": gang_map[gm.gang_id].name, "role": gm.role,
         "activity": gang_map[gm.gang_id].primary_activity}
        for gm in memberships if gm.gang_id in gang_map
    ]

    # Behavioural summary
    mo = Counter(crime_types)
    primary_mo = mo.most_common(1)[0][0] if mo else None

    # Trained-model score (preferred); heuristic factors kept for explainability.
    sevs = [SEVERITY.get(ct, 3) for ct in crime_types] or [3]
    vec = make_vector(
        p.age, p.gender, p.socio_economic_status, p.education_level,
        risk["factors"]["gang_member"], sum(sevs) / len(sevs), max(sevs),
        p.district in ML_URBAN, risk["factors"]["recent_activity"],
    )
    ms = risk_model.score_batch([vec])
    final_score = ms[0] if ms is not None else risk["risk_score"]
    scored_by = "model" if ms is not None else "heuristic"
    p.risk_score = final_score
    db.commit()

    risk_level = "High" if final_score >= 70 else "Medium" if final_score >= 40 else "Low"

    return {
        "person_id": p.id,
        "name": p.full_name,
        "photo": p.photo,
        "demographics": {
            "age": p.age, "gender": p.gender, "occupation": p.occupation,
            "education": p.education_level, "socio_economic_status": p.socio_economic_status,
            "district": p.district,
        },
        "risk_score": final_score,
        "risk_level": risk_level,
        "scored_by": scored_by,
        "risk_factors": risk["factors"],
        "primary_modus_operandi": primary_mo,
        "crime_type_distribution": [{"label": k, "count": v} for k, v in mo.most_common()],
        "total_cases": len(cases),
        "case_history": cases,
        "gangs": gangs,
    }
