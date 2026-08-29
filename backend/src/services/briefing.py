"""
AI Case Intelligence Briefing (Challenge Areas 2, 5, 6, 7, 9).

Gathers ALL linked intelligence for a person or an FIR — profile, risk,
criminal network, financial trails, case history, similar cases — and asks the
local LLM to write a grounded, natural-language intelligence briefing.

The LLM only NARRATES facts we supply; every statement is backed by real data,
and we also return the structured evidence so nothing is unverifiable (Area 9).
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from src.database.models import (
    Crime, FIRDetails, CasePerson, Person, Relationship,
    Gang, GangMember, FinancialAccount, Transaction
)
from src.api.routes.insights import compute_risk, SEVERITY
from src.ai import ollama_client


# ---------------------------------------------------------------------------
# Fact gathering (deterministic, grounded)
# ---------------------------------------------------------------------------
def gather_person_facts(db: Session, person_id: int) -> Optional[Dict[str, Any]]:
    """Collect every linked fact about a person into a structured dict."""
    person = db.get(Person, person_id)
    if not person:
        return None

    risk = compute_risk(db, person_id)

    # Case history (as accused). Crimes and their FIR details are each fetched in
    # a single query; previously every link cost two lookups, so a 10-case
    # offender meant 20 round-trips before the associates loop even started.
    links = db.query(CasePerson).filter(
        CasePerson.person_id == person_id, CasePerson.role == "accused"
    ).all()
    link_crime_ids = [l.crime_id for l in links if l.crime_id]
    crime_rows = db.query(Crime).filter(Crime.id.in_(link_crime_ids)).all() \
        if link_crime_ids else []
    firs = {f.crime_id: f for f in db.query(FIRDetails)
            .filter(FIRDetails.crime_id.in_(link_crime_ids))} if link_crime_ids else {}

    cases = []
    crime_ids = []
    for c in crime_rows:
        crime_ids.append(c.id)
        fir = firs.get(c.id)
        cases.append({
            "fir": c.fir_number, "crime_type": c.crime_type, "district": c.district,
            "date": str(c.date_occurred), "description": c.description,
            "status": fir.investigation_status if fir else None,
            "outcome": fir.case_outcome if fir else None,
        })
    cases.sort(key=lambda c: c["date"])

    # Gang affiliations, resolved in one query.
    memberships = db.query(GangMember).filter(GangMember.person_id == person_id).all()
    gang_ids = [gm.gang_id for gm in memberships if gm.gang_id]
    gang_map = {g.id: g for g in db.query(Gang).filter(Gang.id.in_(gang_ids))} \
        if gang_ids else {}
    gangs = [
        {"name": gang_map[gm.gang_id].name, "role": gm.role,
         "activity": gang_map[gm.gang_id].primary_activity,
         "base_district": gang_map[gm.gang_id].base_district}
        for gm in memberships if gm.gang_id in gang_map
    ]

    # Known associates (network). This was the worst offender: a lookup for each
    # associate PLUS a COUNT query inside the same loop, so 10 associates cost 20
    # round-trips. Both are now single queries, with the case counts aggregated
    # by the database via GROUP BY.
    assoc_ids = set()
    for r in db.query(Relationship).filter(
        (Relationship.person_a_id == person_id) | (Relationship.person_b_id == person_id)
    ).all():
        other = r.person_b_id if r.person_a_id == person_id else r.person_a_id
        if other:
            assoc_ids.add(other)
    top_assoc = list(assoc_ids)[:10]
    associates = []
    if top_assoc:
        case_counts = dict(
            db.query(CasePerson.person_id, func.count(CasePerson.id))
              .filter(CasePerson.person_id.in_(top_assoc),
                      CasePerson.role == "accused")
              .group_by(CasePerson.person_id).all()
        )
        for ap in db.query(Person).filter(Person.id.in_(top_assoc)):
            associates.append({"name": ap.full_name, "district": ap.district,
                               "cases": case_counts.get(ap.id, 0)})

    # Financial trails
    accounts = db.query(FinancialAccount).filter(FinancialAccount.person_id == person_id).all()
    acct_ids = [a.id for a in accounts]
    suspicious_tx = 0
    suspicious_amount = 0.0
    if acct_ids:
        txs = db.query(Transaction).filter(
            ((Transaction.from_account_id.in_(acct_ids)) | (Transaction.to_account_id.in_(acct_ids))),
            Transaction.is_suspicious == True,  # noqa: E712
        ).all()
        suspicious_tx = len(txs)
        suspicious_amount = sum(t.amount or 0 for t in txs)
    financial = {
        "accounts": len(accounts),
        "flagged_accounts": sum(1 for a in accounts if a.flagged),
        "suspicious_transactions": suspicious_tx,
        "suspicious_amount": round(suspicious_amount, 2),
    }

    # Escalation pattern (crime severity over time)
    escalating = False
    if len(cases) >= 3:
        sev = [SEVERITY.get(c["crime_type"], 3) for c in cases]
        escalating = sev[-1] > sev[0]

    return {
        "type": "person",
        "person": {
            "id": person.id, "name": person.full_name, "age": person.age,
            "gender": person.gender, "occupation": person.occupation,
            "education": person.education_level, "ses": person.socio_economic_status,
            "district": person.district,
        },
        "risk_score": risk["risk_score"],
        "risk_level": "High" if risk["risk_score"] >= 70 else "Medium" if risk["risk_score"] >= 40 else "Low",
        "risk_factors": risk["factors"],
        "total_cases": len(cases),
        "cases": cases,
        "escalating": escalating,
        "gangs": gangs,
        "associates": associates,
        "financial": financial,
    }


# ---------------------------------------------------------------------------
# LLM narration
# ---------------------------------------------------------------------------
_BRIEFING_SYSTEM = """You are a senior crime intelligence analyst for the Karnataka State Police.
Write a concise, professional INTELLIGENCE BRIEFING based ONLY on the facts provided in JSON.
Do NOT invent names, numbers, or events — use only what is given.

Structure the briefing with these short sections (use these exact headings):
SUBJECT ASSESSMENT — who they are and overall risk.
CRIMINAL HISTORY — pattern and escalation across their cases.
NETWORK — gang ties and key associates.
FINANCIAL — suspicious money activity, if any.
RECOMMENDED LEADS — 2-4 concrete, actionable next steps for investigators.

Keep it factual, crisp, and under 250 words. Write in plain prose under each heading."""


def _build_facts_prompt(facts: Dict[str, Any]) -> str:
    """Compact fact summary (small prompt → fast generation on modest hardware)."""
    from collections import Counter
    p = facts["person"]
    types = Counter(facts["risk_factors"].get("crime_types", []))
    type_str = ", ".join(f"{k}" for k in types) or "various"
    dates = [c["date"] for c in facts["cases"]]
    span = f"{dates[0]} to {dates[-1]}" if dates else "n/a"
    gang = facts["gangs"][0] if facts["gangs"] else None
    fin = facts["financial"]

    lines = [
        f"Subject: {p['name']}, age {p['age']}, {p['occupation']}, from {p['district']}.",
        f"Risk: {facts['risk_score']}/100 ({facts['risk_level']}).",
        f"Accused in {facts['total_cases']} cases ({type_str}); span {span}; "
        f"escalating={facts['escalating']}.",
        f"Gang: {gang['name']} as {gang['role']} ({gang['activity']})." if gang else "Gang: none.",
        f"Associates: {len(facts['associates'])} known.",
        f"Financial: {fin['suspicious_transactions']} suspicious transactions "
        f"totalling {fin['suspicious_amount']:.0f} rupees; {fin['flagged_accounts']} flagged accounts.",
    ]
    return "Write the intelligence briefing from these facts:\n" + "\n".join(lines)


def generate_briefing_text(facts: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ask the LLM to narrate the briefing. Falls back to a deterministic
    template if the LLM is unavailable. Returns {text, engine}.
    """
    try:
        # Reuse the ollama chat but expect prose, not JSON.
        import requests
        resp = requests.post(
            f"{ollama_client.OLLAMA_URL}/api/chat",
            json={
                "model": ollama_client.OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": _BRIEFING_SYSTEM},
                    {"role": "user", "content": _build_facts_prompt(facts)},
                ],
                "stream": False,
                "keep_alive": "30m",
                "options": {"temperature": 0.3, "num_predict": 380},
            },
            timeout=ollama_client.OLLAMA_TIMEOUT,
        )
        resp.raise_for_status()
        text = resp.json().get("message", {}).get("content", "").strip()
        if text:
            return {"text": text, "engine": f"ollama:{ollama_client.OLLAMA_MODEL}"}
    except Exception:
        pass
    return {"text": _template_briefing(facts), "engine": "template"}


def _template_briefing(f: Dict[str, Any]) -> str:
    """Deterministic fallback briefing if the LLM is unavailable."""
    p = f["person"]
    types = ", ".join(f["risk_factors"].get("crime_types", [])) or "various offences"
    gang_line = (f"Affiliated with {f['gangs'][0]['name']} ({f['gangs'][0]['role']})."
                 if f["gangs"] else "No known gang affiliation.")
    fin = f["financial"]
    fin_line = (f"Linked to {fin['suspicious_transactions']} suspicious transaction(s) "
                f"totalling ₹{fin['suspicious_amount']:,.0f}." if fin["suspicious_transactions"]
                else "No suspicious financial activity on record.")
    esc = "Shows an escalating offence pattern. " if f["escalating"] else ""
    return (
        f"SUBJECT ASSESSMENT\n{p['name']}, {p['age']}, {p['occupation']} from {p['district']}. "
        f"Risk score {f['risk_score']}/100 ({f['risk_level']}).\n\n"
        f"CRIMINAL HISTORY\nAccused in {f['total_cases']} case(s) involving {types}. {esc}\n\n"
        f"NETWORK\n{gang_line} {len(f['associates'])} known associate(s).\n\n"
        f"FINANCIAL\n{fin_line}\n\n"
        f"RECOMMENDED LEADS\n- Review the subject's most recent case and associates.\n"
        f"- Monitor known associates for coordinated activity.\n"
        + ("- Pursue the financial trail with the economic offences wing.\n" if fin["suspicious_transactions"] else "")
    )


def build_person_briefing(db: Session, person_id: int) -> Optional[Dict[str, Any]]:
    """Full briefing: gathered facts + LLM narrative + evidence."""
    facts = gather_person_facts(db, person_id)
    if not facts:
        return None
    narrative = generate_briefing_text(facts)
    return {
        "subject": facts["person"]["name"],
        "briefing": narrative["text"],
        "engine": narrative["engine"],
        "evidence": facts,  # structured, verifiable facts behind the narrative
    }
