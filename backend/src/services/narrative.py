"""
Structured analysis of the free text an officer types when registering an FIR.

WHY THIS EXISTS
---------------
The complainant's statement is the one genuinely unstructured input in this system,
and until now nothing read it. Everything else the officer enters is already a
dropdown. So an officer retypes into structured fields what the statement already
says - the offence, where it happened, who was involved, what was taken - and any
detail not retyped is invisible to every analysis downstream.

This module turns that statement into a set of SUGGESTIONS. It never decides
anything: the caller presents them and an officer confirms. That boundary is
deliberate and is about accountability, not caution - the legal classification of
an offence is an officer's act, and a system that quietly assigned IPC sections
would be putting a machine's guess into a document that goes to a court.

WHAT IS NOT CLAIMED HERE
------------------------
The rules engine below is modest on purpose. It can recognise the offence and the
district because this project already has authoritative lists for both. It CANNOT
find people, vehicles or stolen property in prose - that needs a real NER model,
and pretending otherwise with a hand-rolled name regex would produce confident
nonsense on Indian names. Those fields therefore come back empty from the rules
engine, and the response says which engine answered, so the difference is visible
rather than papered over.

A NOTE ON REUSING THE CHAT EXTRACTOR
------------------------------------
`IntentClassifier._extract_location` is NOT reused here. It is tuned for short chat
queries ("thefts in Mysuru"): its `in\\s+([a-zA-Z\\s]+?)` pattern relies on a
boundary list of query words, and on prose it over-captures across half a sentence.
Its own fallback branch - scan for a known city name - is the part that survives
contact with prose, so that is what this module does directly, against the
canonical district list. `_extract_crime_type` and `_extract_ipc_section` are pure
keyword and regex matches and are reused as-is.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from src.data.karnataka import DISTRICTS
from src.nlp.intent_classifier import nlp_service

log = logging.getLogger(__name__)

# Alternate spellings and city names that map onto a canonical district. Mirrors
# the alias table in query_engine/translator.py, extended to land on a full
# district name rather than a stem, because the value here goes into a form field
# that must match the district dropdown exactly.
_DISTRICT_ALIASES: Dict[str, str] = {
    "bangalore": "Bengaluru Urban", "bengaluru": "Bengaluru Urban",
    "bengalooru": "Bengaluru Urban", "bangalore city": "Bengaluru Urban",
    "mysore": "Mysuru", "belgaum": "Belagavi", "gulbarga": "Kalaburagi",
    "mangalore": "Dakshina Kannada", "mangaluru": "Dakshina Kannada",
    "hubli": "Dharwad", "hubballi": "Dharwad", "tumkur": "Tumakuru",
    "bijapur": "Vijayapura", "shimoga": "Shivamogga", "madikeri": "Kodagu",
    "karwar": "Uttara Kannada", "bellary": "Ballari",
}

# Amounts, as written in a statement: "Rs 85,000", "Rs. 1200", "INR 40000",
# "85,000 rupees". Deliberately narrow - a bare number is far more often a house
# number or a time than a value.
_MONEY_RE = re.compile(
    r"(?:(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?))"
    r"|(?:([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|rs\.?\b))",
    re.IGNORECASE,
)


def _money_amounts(text: str) -> List[Dict[str, Any]]:
    """Every written amount, with the digits parsed out so a caller can total them."""
    found: List[Dict[str, Any]] = []
    for m in _MONEY_RE.finditer(text):
        raw = m.group(0).strip()
        digits = (m.group(1) or m.group(2) or "").replace(",", "")
        try:
            value = float(digits)
        except ValueError:
            continue
        found.append({"token": raw, "value": value})
    return found


def _district_in_text(text: str) -> Optional[str]:
    """
    Canonical district named in the text, or None.

    Whole-word matching against the official district list and the alias table.
    Longest candidate first, so "Bengaluru Rural" is not shadowed by a substring
    match on "Bengaluru".
    """
    lowered = text.lower()
    candidates: List[tuple] = [(d.lower(), d) for d in DISTRICTS]
    candidates += [(alias, canonical) for alias, canonical in _DISTRICT_ALIASES.items()]
    for needle, canonical in sorted(candidates, key=lambda c: -len(c[0])):
        if re.search(rf"\b{re.escape(needle)}\b", lowered):
            return canonical
    return None


def _ipc_for(crime_type: Optional[str]) -> Optional[str]:
    """
    Default IPC section for an offence type.

    Imported here rather than at module scope: IPC_BY_TYPE lives in the crimes
    ROUTE module, and a service importing a route at import time would invert the
    layering. A test asserts the two stay in agreement.
    """
    if not crime_type:
        return None
    from src.api.routes.crimes import IPC_BY_TYPE
    return IPC_BY_TYPE.get(crime_type)


def _empty_entities() -> Dict[str, List[Any]]:
    """
    The entity envelope, with every key present and empty.

    Always the same shape whichever engine answers, so a caller never has to
    branch on which fields exist.
    """
    return {
        "persons": [], "places": [], "organisations": [], "vehicles": [],
        "valuables": [], "money": [], "dates": [], "times": [],
    }


def analyse_with_rules(text: str) -> Dict[str, Any]:
    """
    Deterministic analysis with no external dependency. Always available.

    This is the fallback path, and it is a real one: it recognises the offence,
    the district and any written amount, which is enough to be useful on its own.
    """
    entities = _empty_entities()
    entities["money"] = _money_amounts(text)

    district = _district_in_text(text)
    if district:
        entities["places"] = [district]

    lowered = text.lower()
    crime_type = nlp_service._extract_crime_type(lowered) \
        or nlp_service._extract_ipc_section(lowered)

    return {
        "entities": entities,
        "suggested_crime_type": crime_type,
        "suggested_ipc": _ipc_for(crime_type),
        "suggested_district": district,
        "keywords": [],
        "keyphrases": [],
        "sentiment": None,
        "engine": "rules",
        "engine_note": (
            "Deterministic keyword and pattern matching against this project's "
            "district and offence lists. It does not attempt to find people, "
            "vehicles or stolen property in prose - those fields are empty here "
            "rather than guessed."
        ),
    }


# ---------------------------------------------------------------------------
# Zia
# ---------------------------------------------------------------------------
# Zia's NER tags, mapped onto the entity envelope. Tags observed on a real
# complainant statement via GET /api/system/zia-probe; the mapping is permissive
# about tags we have not seen, which land in `places`/`organisations` only when
# explicitly listed and are otherwise ignored rather than mis-filed.
_NER_TAG_TO_FIELD = {
    "Person": "persons",
    "City": "places", "State": "places", "Country": "places",
    "Location": "places", "Address": "places",
    "Organization": "organisations", "Organisation": "organisations",
    "Company": "organisations",
    "Date": "dates",
    "Time": "times",
    "Money": "money",
}

# Zia extracts keyphrases but does not say what kind of thing they are. These two
# noun lists are ours, not Zia's, and the engine_note says so: a keyphrase is
# filed as a vehicle or a valuable only when it contains one of these category
# nouns. Brand names are deliberately absent - "Pulsar" is caught by "motorcycle"
# in the same phrase, and a brand list would rot immediately.
_VEHICLE_NOUNS = {
    "motorcycle", "motorbike", "bike", "scooter", "scooty", "moped", "car",
    "auto", "autorickshaw", "rickshaw", "truck", "lorry", "tempo", "van",
    "jeep", "tractor", "bicycle", "cycle", "bus", "vehicle",
}
_VALUABLE_NOUNS = {
    "chain", "necklace", "bangle", "bangles", "ring", "earring", "earrings",
    "jewellery", "jewelry", "ornament", "ornaments", "mangalsutra", "gold",
    "silver", "mobile", "phone", "smartphone", "laptop", "tablet", "camera",
    "watch", "purse", "wallet", "handbag", "bag", "cash", "currency", "atm",
    "card", "documents", "passport",
}


def _first_doc(raw: Any) -> Optional[Dict[str, Any]]:
    """
    Unwrap the single-document response.

    Every Zia text call returns a LIST with one element per input document, and
    this module always sends exactly one. Written defensively because the shape is
    undocumented: anything unexpected becomes None, which the caller treats as a
    failed call rather than crashing a registration form.
    """
    if isinstance(raw, list) and raw:
        return raw[0] if isinstance(raw[0], dict) else None
    if isinstance(raw, dict):
        return raw
    return None


def _money_from_zia(entity: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Turn a Money entity into {token, value}.

    Prefers the nested `Value` fine-entity, which is Zia's own split of the
    digits from the currency symbol, and falls back to pulling digits out of the
    token. Returns None when neither yields a number, because a Money entity with
    no parseable amount is not worth showing an officer.
    """
    token = str(entity.get("token", "")).strip()
    digits = ""
    for fine in entity.get("fine_entities") or []:
        if str(fine.get("ner_tag", "")).lower() == "value":
            digits = str(fine.get("token", ""))
            break
    if not digits:
        digits = re.sub(r"[^\d.]", "", token)
    try:
        return {"token": token or digits, "value": float(digits.replace(",", ""))}
    except ValueError:
        return None


def _parse_ner(raw: Any) -> Optional[Dict[str, List[Any]]]:
    """Entity envelope from a NER response, or None if the shape is unusable."""
    doc = _first_doc(raw)
    if not doc:
        return None
    general = ((doc.get("ner") or {}).get("general_entities"))
    if not isinstance(general, list):
        return None

    entities = _empty_entities()
    for ent in general:
        if not isinstance(ent, dict):
            continue
        field = _NER_TAG_TO_FIELD.get(str(ent.get("ner_tag", "")))
        if not field:
            continue
        if field == "money":
            parsed = _money_from_zia(ent)
            if parsed and parsed not in entities["money"]:
                entities["money"].append(parsed)
            continue
        token = str(ent.get("token", "")).strip().strip(",.;:")
        if token and token not in entities[field]:
            entities[field].append(token)
    return entities


def _parse_keywords(raw: Any) -> tuple:
    """(keywords, keyphrases) from a keyword-extraction response."""
    doc = _first_doc(raw)
    block = (doc or {}).get("keyword_extractor") or {}
    keywords = [str(k) for k in (block.get("keywords") or []) if k]
    keyphrases = [str(k) for k in (block.get("keyphrases") or []) if k]
    return keywords, keyphrases


def _parse_sentiment(raw: Any) -> Optional[Dict[str, Any]]:
    """Document-level sentiment, flattened out of its double list nesting."""
    doc = _first_doc(raw)
    predictions = (doc or {}).get("sentiment_prediction")
    if not isinstance(predictions, list) or not predictions:
        return None
    first = predictions[0]
    if not isinstance(first, dict):
        return None
    return {
        "label": first.get("document_sentiment"),
        "score": first.get("overall_score"),
        "sentences_analysed": len(first.get("sentence_analytics") or []),
    }


def _classify_keyphrases(keyphrases: List[str]) -> Dict[str, List[str]]:
    """Split keyphrases into vehicles and valuables by category noun."""
    vehicles: List[str] = []
    valuables: List[str] = []
    for phrase in keyphrases:
        words = set(re.findall(r"[a-z]+", phrase.lower()))
        if words & _VEHICLE_NOUNS:
            vehicles.append(phrase)
        elif words & _VALUABLE_NOUNS:
            valuables.append(phrase)
    return {"vehicles": vehicles, "valuables": valuables}


def analyse_with_zia(text: str) -> Optional[Dict[str, Any]]:
    """
    Zia analysis merged with the rule-based canon, or None if Zia did not answer.

    NER is the load-bearing call: without it there is nothing Zia adds that the
    rules do not already do, so a NER failure means fall back entirely. Keyword
    extraction and sentiment are best-effort on top - losing them degrades the
    result without invalidating it.

    The merge is deliberate rather than a replacement. Zia is better than any
    rule at finding people and places in prose; it has no idea which of those
    place names is a Karnataka district, what IPC section an offence attracts, or
    that "snatched" means Snatching. So entities come from Zia and the
    classification stays with the project's own authoritative lists.
    """
    from src.services import catalyst

    entities = _parse_ner(catalyst.zia_ner([text]))
    if entities is None:
        return None

    keywords, keyphrases = _parse_keywords(catalyst.zia_keywords([text]))
    sentiment = _parse_sentiment(catalyst.zia_sentiment([text]))

    # Rules still own the classification, and its money regex runs alongside
    # Zia's Money entities so an amount written in a form Zia missed is not lost.
    rules = analyse_with_rules(text)
    for amount in rules["entities"]["money"]:
        if all(a["value"] != amount["value"] for a in entities["money"]):
            entities["money"].append(amount)

    # The authoritative district comes from the canonical scan, not from a Zia
    # City token - the value goes into a dropdown that must match exactly.
    district = rules["suggested_district"]
    if district and district not in entities["places"]:
        entities["places"].insert(0, district)

    classified = _classify_keyphrases(keyphrases)
    entities["vehicles"] = classified["vehicles"]
    entities["valuables"] = classified["valuables"]

    return {
        "entities": entities,
        "suggested_crime_type": rules["suggested_crime_type"],
        "suggested_ipc": rules["suggested_ipc"],
        "suggested_district": district,
        "keywords": keywords,
        "keyphrases": keyphrases,
        "sentiment": sentiment,
        "engine": "zia",
        "engine_note": (
            "Entities from Catalyst Zia named-entity recognition; keywords and "
            "sentiment from Zia text analytics. The offence type, IPC section and "
            "district come from this project's own authoritative lists, not from "
            "Zia, which does not classify offences. Vehicles and valuables are "
            "Zia keyphrases filed by matching a category noun - that grouping is "
            "ours, not Zia's."
        ),
    }


def analyse(text: str) -> Dict[str, Any]:
    """
    Analyse a complainant statement into suggested FIR fields.

    Zia first, rules behind. Returns the same shape whichever answered, with
    `engine` naming it, so a caller can always tell whether it is looking at model
    output or a keyword match. Never raises: a registration form has to stay
    usable when the analyser is unavailable, which off-platform it always is.
    """
    text = (text or "").strip()
    if not text:
        empty = analyse_with_rules("")
        empty["engine_note"] = "No text supplied, so nothing was analysed."
        empty["characters_analysed"] = 0
        return empty

    result: Optional[Dict[str, Any]] = None
    try:
        result = analyse_with_zia(text)
    except Exception as exc:
        # The wrappers already swallow Catalyst failures, so reaching here means a
        # defect in the parsing above. Fall back rather than fail the request, but
        # do not hide it - the note records that this happened.
        log.warning("Zia narrative analysis raised, falling back to rules: %s", exc)

    if result is None:
        result = analyse_with_rules(text)
        from src.services import catalyst
        reason = catalyst.diagnostics().get("last_zia_error")
        if reason:
            result["engine_note"] += f" Zia was not used: {reason}"

    result["characters_analysed"] = len(text)
    return result
