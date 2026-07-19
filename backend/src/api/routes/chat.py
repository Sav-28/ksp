from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Dict, Any
import logging
import traceback
import os
import re

# Import real services
from src.nlp.intent_classifier import nlp_service
from src.nlp.followup import (
    detect_detail_request, detect_case_action, detect_person_query,
    detect_briefing_request, extract_fir_number, merge_context,
)
from src.ai.language_provider import get_intent_and_entities as understand
from src.query_engine.translator import QueryTranslator
from src.database.session import get_db
from src.database.models import AuditLog, CasePerson, Person, FIRDetails
from src.api.auth import get_current_user
from src.services.crime_detail import get_crime_detail

router = APIRouter()

# Initialize query translator
query_engine = QueryTranslator()

# Whether to expose generated SQL in responses (debugging only)
EXPOSE_SQL = os.getenv("KSP_EXPOSE_SQL", "false").lower() == "true"


def enrich_results(db: Session, results: list) -> list:
    """
    Attach accused names and investigation status to each crime result, in bulk
    (no per-row queries). So every FIR card can show who was accused.
    """
    ids = [r["id"] for r in results if isinstance(r, dict) and r.get("id")]
    if not ids:
        return results

    from collections import defaultdict
    accused_map = defaultdict(list)
    for crime_id, name in (
        db.query(CasePerson.crime_id, Person.full_name)
        .join(Person, Person.id == CasePerson.person_id)
        .filter(CasePerson.crime_id.in_(ids), CasePerson.role == "accused")
        .all()
    ):
        accused_map[crime_id].append(name)

    status_map = {
        cid: st for cid, st in
        db.query(FIRDetails.crime_id, FIRDetails.investigation_status)
        .filter(FIRDetails.crime_id.in_(ids)).all()
    }

    for r in results:
        if isinstance(r, dict) and r.get("id"):
            r["accused"] = accused_map.get(r["id"], [])
            r["investigation_status"] = status_map.get(r["id"])
    return results


def build_detail_answer(detail: Dict[str, Any], detail_type: str) -> str:
    """Compose a natural-language answer for a follow-up detail question."""
    fir = detail["fir_number"]
    if detail_type == "accused":
        names = [p["name"] for p in detail.get("accused", [])]
        if names:
            return f"Accused in {fir} ({detail['crime_type']}): " + ", ".join(names) + "."
        return f"No accused are recorded for {fir}."
    if detail_type == "victim":
        names = [p["name"] for p in detail.get("victims", [])]
        if names:
            return f"Victim(s) in {fir}: " + ", ".join(names) + "."
        return f"No victims are recorded for {fir}."
    if detail_type == "witness":
        names = [p["name"] for p in detail.get("witnesses", [])]
        if names:
            return f"Witness(es) in {fir}: " + ", ".join(names) + "."
        return f"No witnesses are recorded for {fir}."
    if detail_type == "status":
        inv = detail.get("investigation") or {}
        return (
            f"{fir} ({detail['crime_type']}) — Status: {inv.get('status', 'N/A')}; "
            f"Officer: {inv.get('officer', 'N/A')}; IPC: {inv.get('ipc_sections', 'N/A')}; "
            f"Outcome: {inv.get('outcome', 'N/A')}."
        )
    # full
    return f"Full details for {fir} ({detail['crime_type']} in {detail['district']}):"


def build_person_response(db: Session, username: str, input_text: str,
                          language: str, name: str, context: dict) -> Dict[str, Any]:
    """
    Look up a person by name and return their crime record (Area 1 retrieval).
    Handles no-match, single-match, and ambiguous multi-match cases.
    """
    from src.database.models import Crime
    from src.api.routes.insights import compute_risk

    matches = db.query(Person).filter(Person.full_name.ilike(f"%{name}%")).all()

    if not matches:
        write_audit(db, username, input_text, language, "PERSON_QUERY", 1.0, None, 0)
        return {"answer": f"No person named '{name}' was found in the records.",
                "intent": "PERSON_QUERY", "confidence": 1.0, "entities": {"person_name": name},
                "context": context, "sql": None, "results": [], "error": None}

    # Accused-case count per matched person (to pick the actual criminal when
    # there are namesakes, and to disambiguate).
    match_ids = [p.id for p in matches]
    case_counts = dict(
        db.query(CasePerson.person_id, func.count(CasePerson.id))
        .filter(CasePerson.person_id.in_(match_ids), CasePerson.role == "accused")
        .group_by(CasePerson.person_id).all()
    )

    # Prefer exact (case-insensitive) name matches; otherwise all matches.
    exact = [p for p in matches if p.full_name.lower() == name.lower()]
    distinct_names = sorted({p.full_name for p in matches})

    if not exact and len(distinct_names) > 1:
        listed = ", ".join(distinct_names[:8])
        write_audit(db, username, input_text, language, "PERSON_QUERY", 1.0, None, len(matches))
        return {"answer": f"Found {len(distinct_names)} people matching '{name}': {listed}. "
                          f"Please specify the full name.",
                "intent": "PERSON_QUERY", "confidence": 1.0, "entities": {"person_name": name},
                "context": context, "sql": None, "results": [], "error": None}

    # Among candidates (exact if any, else all), pick the one with the most
    # accused cases — that's the criminal of interest, not a coincidental namesake.
    pool = exact if exact else matches
    person = max(pool, key=lambda p: case_counts.get(p.id, 0))

    # Fetch the person's accused crimes, newest first
    crimes = (
        db.query(Crime)
        .join(CasePerson, CasePerson.crime_id == Crime.id)
        .filter(CasePerson.person_id == person.id, CasePerson.role == "accused")
        .order_by(Crime.date_occurred.desc())
        .all()
    )
    results = [{
        "id": c.id, "fir_number": c.fir_number, "crime_type": c.crime_type,
        "district": c.district, "taluk": c.taluk, "police_station": c.police_station,
        "date_occurred": str(c.date_occurred), "description": c.description,
        "latitude": c.latitude, "longitude": c.longitude,
    } for c in crimes]
    enrich_results(db, results)

    risk = compute_risk(db, person.id)
    person.risk_score = risk["risk_score"]
    db.commit()

    if results:
        answer = (f"{person.full_name} — {person.age}, {person.district}, {person.occupation}. "
                  f"Accused in {len(results)} case(s). Risk score: {risk['risk_score']}/100 "
                  f"({'High' if risk['risk_score'] >= 70 else 'Medium' if risk['risk_score'] >= 40 else 'Low'}).")
    else:
        answer = f"{person.full_name} has no recorded cases as an accused."

    last_fir = results[0]["fir_number"] if results else context.get("last_fir")
    write_audit(db, username, input_text, language, "PERSON_QUERY", 1.0, None, len(results))
    return {
        "answer": answer, "intent": "PERSON_QUERY", "confidence": 1.0,
        "entities": {"person_name": person.full_name, "person_id": person.id,
                     "risk_score": risk["risk_score"]},
        "results": results,
        "context": {"last_fir": last_fir, "entities": context.get("entities", {})},
        "sql": None, "error": None,
    }


def _resolve_best_person(db: Session, name: str):
    """Resolve a name to the most relevant Person (most accused cases). Returns
    (person, disambiguation_names) — person is None if not found; if ambiguous
    with no case data, returns (None, [names])."""
    matches = db.query(Person).filter(Person.full_name.ilike(f"%{name}%")).all()
    if not matches:
        return None, []
    match_ids = [p.id for p in matches]
    counts = dict(
        db.query(CasePerson.person_id, func.count(CasePerson.id))
        .filter(CasePerson.person_id.in_(match_ids), CasePerson.role == "accused")
        .group_by(CasePerson.person_id).all()
    )
    exact = [p for p in matches if p.full_name.lower() == name.lower()]
    distinct_names = sorted({p.full_name for p in matches})
    if not exact and len(distinct_names) > 1:
        return None, distinct_names[:8]
    pool = exact if exact else matches
    return max(pool, key=lambda p: counts.get(p.id, 0)), []


def build_briefing_response(db: Session, username: str, input_text: str,
                            language: str, name: str, context: dict) -> Dict[str, Any]:
    """Generate an AI intelligence briefing for a named person (chat trigger)."""
    from src.services.briefing import build_person_briefing

    person, ambiguous = _resolve_best_person(db, name)
    if ambiguous:
        return {"answer": f"Found multiple people matching '{name}': {', '.join(ambiguous)}. "
                          f"Please specify the full name.",
                "intent": "BRIEFING", "confidence": 1.0, "entities": {"person_name": name},
                "context": context, "sql": None, "results": [], "error": None}
    if not person:
        return {"answer": f"No person named '{name}' was found in the records.",
                "intent": "BRIEFING", "confidence": 1.0, "entities": {"person_name": name},
                "context": context, "sql": None, "results": [], "error": None}

    result = build_person_briefing(db, person.id)
    write_audit(db, username, input_text, language, "BRIEFING", 1.0, None, 1)
    return {
        "answer": result["briefing"],
        "intent": "BRIEFING", "confidence": 1.0,
        "entities": {"person_name": person.full_name, "person_id": person.id},
        "briefing": result,
        "context": {"last_fir": context.get("last_fir"), "entities": context.get("entities", {})},
        "sql": None, "results": [], "error": None,
    }


def write_audit(db: Session, username: str, query_text: str, language: str,
                intent: str, confidence: float, sql: str, row_count: int) -> None:
    """Persist an audit log entry. Never raises — auditing must not break queries."""
    try:
        entry = AuditLog(
            username=username,
            query_text=query_text,
            language=language,
            intent=intent,
            confidence=confidence,
            sql_generated=sql,
            row_count=row_count,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        logging.warning(f"Failed to write audit log: {e}")
        db.rollback()

@router.post("/chat")
async def chat_endpoint(
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    POST /chat endpoint for crime database conversational API.

    INPUT JSON:
    {
        "text": "user's query in English or Kannada",
        "language": "en" | "kn",  // optional, defaults to "en"
        "sessionId": "optional string for chat history"
    }

    OUTPUT JSON:
    {
        "answer": "natural language response",
        "sql": "the generated SQL (for debugging, remove in prod)",
        "results": [{"column1": val, ...}],  // empty if error
        "error": null  // or string message if failed
    }
    """
    try:
        # Extract request data
        input_text = request.get("text", "")
        language = request.get("language", "en")
        context = request.get("context") or {}

        # Validate input
        if not input_text or not isinstance(input_text, str):
            raise ValueError("Text input is required and must be a string")

        # ---- AI Intelligence Briefing (Areas 2,5,6,7,9): "brief me on X" ----
        briefing_name = detect_briefing_request(input_text)
        if briefing_name:
            return build_briefing_response(db, username, input_text, language, briefing_name, context)

        # ---- Context-aware detail / follow-up handling (Area 1) ----
        detail_type = detect_detail_request(input_text)
        case_action = detect_case_action(input_text)
        fir = extract_fir_number(input_text) or context.get("last_fir")

        # Decision-support follow-ups (Area 6): summarize / similar cases
        if case_action and fir:
            from src.api.routes.decision_support import case_summary, similar_cases
            if case_action == "summary":
                data = await case_summary(fir, db, username)
                write_audit(db, username, input_text, language, "CASE_SUMMARY", 1.0, None, 1)
                return {
                    "answer": data["summary"],
                    "intent": "CASE_SUMMARY",
                    "confidence": 1.0,
                    "entities": {},
                    "case_summary": data,
                    "context": {"last_fir": fir, "entities": context.get("entities", {})},
                    "sql": None, "results": [], "error": None,
                }
            else:  # similar
                data = await similar_cases(fir, 5, db, username)
                n = len(data["similar_cases"])
                write_audit(db, username, input_text, language, "SIMILAR_CASES", 1.0, None, n)
                return {
                    "answer": f"Found {n} case(s) similar to {fir} (same crime type / location / modus operandi):",
                    "intent": "SIMILAR_CASES",
                    "confidence": 1.0,
                    "entities": {},
                    "similar_cases": data,
                    "context": {"last_fir": fir, "entities": context.get("entities", {})},
                    "sql": None, "results": [], "error": None,
                }

        if detail_type:
            if not fir:
                return {
                    "answer": "Which FIR are you asking about? Please mention an FIR number (e.g. 'details of FIR0100').",
                    "intent": "FIR_DETAIL",
                    "confidence": 1.0,
                    "entities": {},
                    "context": context,
                    "sql": None,
                    "results": [],
                    "error": None,
                }
            detail = get_crime_detail(db, fir)
            if not detail:
                return {
                    "answer": f"No FIR found with number {fir}.",
                    "intent": "FIR_DETAIL",
                    "confidence": 1.0,
                    "entities": {},
                    "context": {"last_fir": None, "entities": context.get("entities", {})},
                    "sql": None,
                    "results": [],
                    "error": None,
                }
            answer = build_detail_answer(detail, detail_type)
            write_audit(db, username, input_text, language, "FIR_DETAIL", 1.0, None, 1)
            return {
                "answer": answer,
                "intent": "FIR_DETAIL",
                "confidence": 1.0,
                "entities": {},
                "detail": detail,
                "context": {"last_fir": fir, "entities": context.get("entities", {})},
                "sql": None,
                "results": [],
                "error": None,
            }

        # ---- Person-by-name query via regex (Area 1) ----
        # Catch "crimes done by X" / "record of X" before the LLM, so it's fast
        # and provider-independent. Guarded against districts/crime-types.
        early_person = detect_person_query(input_text)
        if early_person:
            return build_person_response(db, username, input_text, language, early_person, context)

        # Call NLP service to get intent/entities (LLM-backed, with rule fallback)
        nlp_output = understand(input_text, language=language)
        intent = nlp_output.get("intent")
        entities_out = nlp_output.get("entities") or {}

        # ---- Person-by-name query via the LLM intent (Area 1) ----
        person_name = entities_out.get("person_name")
        if intent == "PERSON_QUERY" or person_name:
            if person_name:
                return build_person_response(db, username, input_text, language, person_name, context)
            return {
                "answer": "Which person are you asking about? Please mention their name.",
                "intent": "PERSON_QUERY", "confidence": 1.0, "entities": {},
                "context": context, "sql": None, "results": [], "error": None,
            }

        # Carry forward entities from the previous turn for follow-up queries
        if intent in ["SHOW_CRIMES", "COUNT_CRIMES", "BREAKDOWN_CRIMES"]:
            nlp_output["entities"] = merge_context(
                nlp_output.get("entities", {}), context, input_text
            )

            # Location backfill guard: if the user mentioned a place ("in/at X")
            # but no location was captured (e.g. a place outside Karnataka like
            # "Hyderabad"), use the mentioned place as the filter so the query
            # returns "no records" instead of dumping the entire database.
            ents = nlp_output["entities"]
            broad = any(w in input_text.lower() for w in
                        ["all crimes", "everywhere", "entire state", "whole state",
                         "across karnataka", "all records", "total"])
            if not ents.get("location") and not broad:
                m = re.search(r'\b(?:in|at|near|from)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)', input_text)
                if m:
                    cand = m.group(1).strip()
                    stop = {"the", "last", "this", "each", "all", "recent", "every"}
                    if cand.split()[0].lower() not in stop:
                        ents["location"] = cand.title()

        # Handle out-of-scope queries gracefully (don't send to translator)
        if intent not in ["SHOW_CRIMES", "COUNT_CRIMES", "BREAKDOWN_CRIMES"]:
            write_audit(db, username, input_text, language, "UNKNOWN",
                        nlp_output.get("confidence", 0.0), None, 0)
            return {
                "answer": (
                    "Sorry, I couldn't understand that. I can help you query crime records. Try:\n"
                    "• 'Show crimes in Bengaluru'\n"
                    "• 'How many thefts in Mysuru'\n"
                    "• 'Crimes by district'\n"
                    "• 'Breakdown of crimes by type'"
                ),
                "intent": "UNKNOWN",
                "confidence": round(nlp_output.get("confidence", 0.0), 3),
                "entities": {},
                "context": context,
                "sql": None,
                "results": [],
                "error": None
            }

        # Call query engine to get SQL/params
        sql, params = query_engine.translate(nlp_output)

        # Execute SQL against DB
        try:
            result_proxy = db.execute(text(sql), params)

            if intent == "COUNT_CRIMES":
                # For count queries, fetch the single count value
                count_result = result_proxy.fetchone()
                row_count = count_result[0] if count_result else 0
                # Also fetch the matching case records so the user can see details,
                # not just a number. Reuse the translator with a SHOW-style intent.
                results = []
                try:
                    detail_output = {
                        "intent": "SHOW_CRIMES",
                        "entities": nlp_output.get("entities", {})
                    }
                    detail_sql, detail_params = query_engine.translate(detail_output)
                    detail_proxy = db.execute(text(detail_sql), detail_params)
                    for row in detail_proxy.fetchall():
                        mapping = row._mapping if hasattr(row, "_mapping") else row
                        results.append(dict(mapping))
                except Exception as detail_err:
                    logging.warning(f"Could not fetch detail rows for count query: {detail_err}")
                    results = []
            elif intent == "BREAKDOWN_CRIMES":
                # For breakdown queries, fetch label/count aggregation rows
                results = []
                for row in result_proxy.fetchall():
                    mapping = row._mapping if hasattr(row, "_mapping") else row
                    results.append({
                        "label": mapping["label"],
                        "count": mapping["count"]
                    })
                row_count = sum(r["count"] for r in results)
            else:
                # SHOW_CRIMES: fetch all detail rows
                results = []
                for row in result_proxy.fetchall():
                    try:
                        # Try to use _asdict() method (SQLAlchemy 2.0+)
                        if hasattr(row, '_asdict'):
                            results.append(row._asdict())
                        else:
                            # Fallback for other row types
                            results.append(dict(row))
                    except Exception as row_conversion_err:
                        logging.warning(f"Could not convert row to dict: {row_conversion_err}")
                        # Manual fallback: try to get column names and values
                        if hasattr(row, 'keys') and hasattr(row, 'values'):
                            results.append(dict(zip(row.keys(), row.values())))
                        else:
                            logging.error(f"Unable to convert row to dict: {type(row)}")
                            continue
                row_count = len(results)

        except Exception as e:
            logging.error(f"Database execution error: {str(e)}")
            logging.error(traceback.format_exc())
            raise ValueError(f"Database execution error: {str(e)}")

        # Format results into natural language answer
        confidence = nlp_output.get("confidence", 0.0)
        entities = nlp_output.get("entities", {})

        # Enrich SHOW/COUNT records with accused names + investigation status
        if intent in ("SHOW_CRIMES", "COUNT_CRIMES") and results:
            results = enrich_results(db, results)

        # Build a human-readable summary of the filters that were applied
        filter_parts = []
        if entities.get("crime_type"):
            filter_parts.append(entities["crime_type"])
        if entities.get("location"):
            filter_parts.append(f"in {entities['location']}")
        if entities.get("date_range"):
            dr = entities["date_range"]
            filter_parts.append(f"between {dr.get('start')} and {dr.get('end')}")
        filter_summary = " ".join(filter_parts).strip()

        if intent == "COUNT_CRIMES":
            if filter_summary:
                answer = f"Found {row_count} crime(s) matching: {filter_summary}."
            else:
                answer = f"Found {row_count} crime(s) in total."
        elif intent == "BREAKDOWN_CRIMES":
            group_dim = entities.get("group_by", "district")
            dim_label = {"district": "district", "crime_type": "crime type", "month": "month"}.get(group_dim, group_dim)
            answer = f"Here is the crime breakdown by {dim_label} ({len(results)} group(s)):"
        elif intent == "SHOW_CRIMES":
            if row_count == 0:
                answer = "No crimes found matching your criteria. Try a different location, crime type, or date range."
            elif filter_summary:
                answer = f"Found {row_count} crime(s) matching: {filter_summary}."
            else:
                answer = f"Found {row_count} crime(s)."
        else:
            answer = (
                "Sorry, I couldn't understand that. Try one of these:\n"
                "• 'Show crimes in Bengaluru'\n"
                "• 'How many thefts in Mysuru'\n"
                "• 'Crimes by district'"
            )

        # Log request to persisted audit trail
        write_audit(db, username, input_text, language, intent,
                    confidence, sql, row_count)

        # Build the context to carry into the next turn:
        # remember the applied entities and the FIR of the first result so
        # follow-ups like "who was the accused?" work.
        last_fir = context.get("last_fir")
        if intent in ("SHOW_CRIMES", "COUNT_CRIMES") and results:
            first = results[0]
            if isinstance(first, dict) and first.get("fir_number"):
                last_fir = first["fir_number"]
        new_context = {"entities": entities, "last_fir": last_fir}

        # Explainability evidence trail (Area 9): show how the answer was derived
        evidence = {
            "intent": intent,
            "confidence": round(confidence, 3),
            "filters_applied": entities,
            "data_source": "Karnataka crime records database",
            "records_examined": row_count,
            "method": {
                "SHOW_CRIMES": "Filtered crime records matching the detected entities.",
                "COUNT_CRIMES": "Counted crime records matching the detected entities.",
                "BREAKDOWN_CRIMES": "Aggregated crime records grouped by the requested dimension.",
            }.get(intent, "Database query."),
            "normalized_query": nlp_output.get("normalized_query"),
            "engine": nlp_output.get("engine", "rules"),
            "sql": sql if EXPOSE_SQL else None,
        }

        # Return response
        return {
            "answer": answer,
            "intent": intent,
            "confidence": round(confidence, 3),
            "entities": entities,
            "context": new_context,
            "evidence": evidence,
            "sql": sql if EXPOSE_SQL else None,  # Only expose SQL when debugging
            "results": results,
            "error": None
        }

    except ValueError as e:
        # Validation errors return 400
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        # Server errors return 500
        logging.error(f"Internal server error: {str(e)}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

# Health check endpoint for the chat router
@router.get("/health")
async def chat_health():
    """Health check for chat service."""
    return {"status": "healthy", "service": "chat"}