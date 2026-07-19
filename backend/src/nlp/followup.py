"""
Follow-up and detail-query detection for context-aware conversations (Area 1).

Handles two things the ML intent classifier doesn't:
  1. Detail look-ups about a specific FIR ("details of FIR0100", "who was the
     accused", "what is the investigation status").
  2. Context carry-forward — merging entities from the previous turn so users
     can ask follow-ups like "and in Mysuru?" without repeating context.
"""
import re
from typing import Dict, Any, Optional

# Matches "FIR0100", "FIR 100", "fir0100", "f.i.r 0100"
_FIR_RE = re.compile(r'\bf\.?i\.?r\.?\s*0*(\d{1,5})\b', re.IGNORECASE)

# Keywords that indicate a detail look-up about a specific case
_ACCUSED_WORDS = ["accused", "offender", "suspect", "arrested", "culprit"]
_VICTIM_WORDS = ["victim", "complainant", "affected"]
_WITNESS_WORDS = ["witness"]
_STATUS_WORDS = ["status", "investigation", "outcome", "chargesheet", "court", "solved", "officer", "io"]
_DETAIL_WORDS = ["detail", "details", "about this", "this case", "this fir", "full"]

# Words that should CLEAR an inherited location (a deliberately broad query)
_BROAD_WORDS = ["all crimes", "everywhere", "entire state", "whole state", "across karnataka", "all records"]


def extract_fir_number(text: str) -> Optional[str]:
    """Return a normalized FIR number like 'FIR0100' if present in the text."""
    m = _FIR_RE.search(text)
    if not m:
        return None
    num = int(m.group(1))
    return f"FIR{num:04d}"


def detect_detail_request(text: str) -> Optional[str]:
    """
    Classify a detail/follow-up request about a specific case.
    Returns one of: 'accused', 'victim', 'witness', 'status', 'full', or None.
    """
    t = text.lower()

    has_fir = extract_fir_number(text) is not None
    # A short question referencing a case ("who was accused?") also qualifies
    # even without an explicit FIR (it relies on conversation context).
    asks_who = "who" in t or "whom" in t

    if any(w in t for w in _ACCUSED_WORDS):
        return "accused"
    if any(w in t for w in _VICTIM_WORDS):
        return "victim"
    if any(w in t for w in _WITNESS_WORDS):
        return "witness"
    if any(w in t for w in _STATUS_WORDS):
        return "status"
    if has_fir and any(w in t for w in _DETAIL_WORDS):
        return "full"
    if has_fir and not asks_who:
        # Bare FIR reference → show its full detail
        return "full"
    return None


# Decision-support follow-ups (Area 6)
_SUMMARY_WORDS = ["summarize", "summary", "summarise", "brief me", "overview of"]
_SIMILAR_WORDS = ["similar", "like this", "comparable", "past cases", "related cases"]


def detect_case_action(text: str) -> Optional[str]:
    """Detect a decision-support request: 'summary' or 'similar', else None."""
    t = text.lower()
    if any(w in t for w in _SUMMARY_WORDS):
        return "summary"
    if any(w in t for w in _SIMILAR_WORDS):
        return "similar"
    return None


# Person-by-name queries (Area 1 retrieval): "crimes done by X", "X's record"
_PERSON_RE = re.compile(
    r'(?:crimes?|cases?|records?|offences?|offenses?|history|everything|activities|acts)\s+'
    r'(?:done\s+|committed\s+|registered\s+|reported\s+)?'
    r'(?:by|of|against|involving|for)\s+([a-zA-Z][a-zA-Z .\'-]{2,40})',
    re.IGNORECASE,
)
_PERSON_STOP = {
    "district", "districts", "type", "types", "category", "categories", "month",
    "months", "area", "areas", "location", "locations", "crime", "crimes", "station",
    "police", "each", "theft", "murder", "snatching", "robbery", "assault", "burglary",
    "rioting", "cheating", "forgery", "counterfeiting", "bengaluru", "mysuru", "belagavi",
    "kalaburagi", "mangaluru", "hubli", "dharwad", "tumakuru", "raichur",
}


def detect_person_query(text: str) -> Optional[str]:
    """
    Best-effort extraction of a person name from queries like
    "all crimes done by Abdul Rao". Guarded against matching districts,
    crime types, or grouping words. Returns the name or None.
    """
    m = _PERSON_RE.search(text)
    if not m:
        return None
    name = m.group(1).strip().strip("?.!").strip()
    if not name:
        return None
    first = name.split()[0].lower()
    if name.lower() in _PERSON_STOP or first in _PERSON_STOP:
        return None
    return name.title()


# Intelligence briefing requests: "brief me on X", "intelligence report on X"
_BRIEFING_RE = re.compile(
    r'(?:brief(?:ing)?(?:\s+me)?|intelligence\s+(?:report|briefing)|dossier|profile\s+report)\s+'
    r'(?:on|about|for|of)\s+([a-zA-Z][a-zA-Z .\'-]{2,40})',
    re.IGNORECASE,
)


def detect_briefing_request(text: str) -> Optional[str]:
    """Detect 'brief me on <name>' style requests. Returns the name or None."""
    m = _BRIEFING_RE.search(text)
    if not m:
        return None
    name = m.group(1).strip().strip("?.!").strip()
    if not name:
        return None
    if name.split()[0].lower() in _PERSON_STOP:
        return None
    return name.title()


def merge_context(entities: Dict[str, Any], context: Optional[Dict[str, Any]], text: str) -> Dict[str, Any]:
    """
    Carry forward entities from the previous turn for follow-up queries.

    - Inherits missing `location`, `crime_type`, and `date_range` from context.
    - Does NOT inherit location if the new query is deliberately broad
      (e.g. "show all crimes").
    """
    if not context:
        return entities

    prev = context.get("entities") or {}
    merged = dict(entities)
    t = text.lower()
    is_broad = any(w in t for w in _BROAD_WORDS)

    for slot in ("location", "crime_type", "date_range"):
        if slot not in merged and slot in prev:
            if slot == "location" and is_broad:
                continue  # user explicitly wants everything
            merged[slot] = prev[slot]

    return merged
