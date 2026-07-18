"""
Language understanding provider.

Exposes get_intent_and_entities(text, language) — the SAME interface the rest of
the app already uses — but backed by a local LLM (Ollama) when available, with
automatic fallback to the rule-based classifier so the system never goes down.

The LLM only INTERPRETS the question into {intent, entities}; it never touches
the database. The existing parameterized query engine executes deterministically.
"""
import os
import logging
import datetime
from typing import Dict, Any

from src.nlp.intent_classifier import nlp_service
from src.ai import ollama_client

# Which provider to use: "ollama" (default, with rule fallback) or "rules".
NLP_PROVIDER = os.getenv("KSP_NLP_PROVIDER", "ollama").lower()

VALID_INTENTS = {"SHOW_CRIMES", "COUNT_CRIMES", "BREAKDOWN_CRIMES", "PERSON_QUERY", "UNKNOWN"}
VALID_GROUP_BY = {"district", "crime_type", "month"}

CRIME_TYPES = ["Theft", "Murder", "Snatching", "Robbery", "Assault",
               "Burglary", "Rioting", "Cheating", "Forgery", "Counterfeiting"]
DISTRICTS = ["Bengaluru Urban", "Bengaluru Rural", "Mysuru", "Belagavi",
             "Kalaburagi", "Mangaluru", "Hubli", "Dharwad", "Tumakuru", "Raichur"]

SYSTEM_PROMPT = f"""You are a query parser for the Karnataka State Police crime database.
Convert the user's question (English or Kannada) into a STRICT JSON object.

Output ONLY this JSON shape:
{{
  "intent": one of ["SHOW_CRIMES","COUNT_CRIMES","BREAKDOWN_CRIMES","PERSON_QUERY","UNKNOWN"],
  "entities": {{
     "crime_type": <one of {CRIME_TYPES} or omit>,
     "location": <a Karnataka district/city name in English, or omit>,
     "group_by": <one of ["district","crime_type","month"] or omit>,
     "person_name": <a person's name if the user asks about a specific individual, or omit>,
     "date_range": {{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}} or omit
  }}
}}

Rules:
- SHOW_CRIMES: user wants to see/list/view specific crime records ("show", "list", "give me", "rundown of", "details of X cases").
- COUNT_CRIMES: user asks how many / count / number of crimes.
- BREAKDOWN_CRIMES: user wants an aggregation/grouping or comparison ("which district/area has most", "by type", "by month", "top crimes", "distribution", "trend", "compare"). Always set group_by. If they ask "which area/district", set group_by="district"; if they ask "which type/most common crime", set group_by="crime_type".
- PERSON_QUERY: user asks about a specific PERSON / criminal by name ("crimes done by X", "X's record", "show me everything about X", "what did X do"). Set person_name to the name.
- When a breakdown also names a crime type (e.g. "which areas have the most snatching"), keep crime_type AND set group_by="district".
- UNKNOWN: anything not about querying crime data (greetings, chit-chat).
- Always output crime_type and location using ENGLISH canonical names from the lists. Map Kannada or alternate spellings (e.g. "Bangalore"->"Bengaluru Urban", "ಬೆಂಗಳೂರು"->"Bengaluru Urban", "ಕಳ್ಳತನ"->"Theft").
- Valid districts: {DISTRICTS}.
- Resolve relative dates using the provided current date. Omit date_range if no time is mentioned.
- Output ONLY the JSON, no explanation."""

FEW_SHOT = """Examples:
Q: "show thefts in mysuru" -> {"intent":"SHOW_CRIMES","entities":{"crime_type":"Theft","location":"Mysuru"}}
Q: "give me a rundown of murder cases in mysuru" -> {"intent":"SHOW_CRIMES","entities":{"crime_type":"Murder","location":"Mysuru"}}
Q: "how many murders in bengaluru last month" -> {"intent":"COUNT_CRIMES","entities":{"crime_type":"Murder","location":"Bengaluru Urban","date_range":{"start":"...","end":"..."}}}
Q: "which district has the most crimes" -> {"intent":"BREAKDOWN_CRIMES","entities":{"group_by":"district"}}
Q: "which areas are seeing the most chain snatching" -> {"intent":"BREAKDOWN_CRIMES","entities":{"crime_type":"Snatching","group_by":"district"}}
Q: "what is the most common crime" -> {"intent":"BREAKDOWN_CRIMES","entities":{"group_by":"crime_type"}}
Q: "all crimes done by Abdul Rao" -> {"intent":"PERSON_QUERY","entities":{"person_name":"Abdul Rao"}}
Q: "show me Vikram Reddy's record" -> {"intent":"PERSON_QUERY","entities":{"person_name":"Vikram Reddy"}}
Q: "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಅಪರಾಧಗಳನ್ನು ತೋರಿಸಿ" -> {"intent":"SHOW_CRIMES","entities":{"location":"Bengaluru Urban"}}
Q: "hello" -> {"intent":"UNKNOWN","entities":{}}
"""


def _validate_date_range(dr: Any) -> Any:
    if not isinstance(dr, dict):
        return None
    out = {}
    for key in ("start", "end"):
        val = dr.get(key)
        if val:
            try:
                datetime.datetime.strptime(val, "%Y-%m-%d")
                out[key] = val
            except (ValueError, TypeError):
                pass
    return out or None


def _sanitize(result: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce the model output into our trusted shape; drop anything invalid."""
    intent = str(result.get("intent", "UNKNOWN")).upper()
    if intent not in VALID_INTENTS:
        intent = "UNKNOWN"

    raw = result.get("entities") or {}
    entities: Dict[str, Any] = {}

    ctype = raw.get("crime_type")
    if isinstance(ctype, str) and ctype.strip():
        match = next((c for c in CRIME_TYPES if c.lower() == ctype.strip().lower()), None)
        if match:
            entities["crime_type"] = match

    loc = raw.get("location")
    if isinstance(loc, str) and loc.strip():
        entities["location"] = loc.strip()

    gb = raw.get("group_by")
    if isinstance(gb, str) and gb.strip().lower() in VALID_GROUP_BY:
        entities["group_by"] = gb.strip().lower()

    dr = _validate_date_range(raw.get("date_range"))
    if dr:
        entities["date_range"] = dr

    pname = raw.get("person_name")
    if isinstance(pname, str) and pname.strip():
        entities["person_name"] = pname.strip()

    if intent == "BREAKDOWN_CRIMES" and "group_by" not in entities:
        entities["group_by"] = "district"

    return {"intent": intent, "entities": entities}


def _understand_with_ollama(text: str) -> Dict[str, Any]:
    today = datetime.date.today().isoformat()
    user_prompt = f"{FEW_SHOT}\nToday's date is {today}.\nQ: \"{text}\"\nReturn the JSON."
    raw = ollama_client.chat_json(SYSTEM_PROMPT, user_prompt)
    clean = _sanitize(raw)
    return {
        "intent": clean["intent"],
        "confidence": 0.9,
        "entities": clean["entities"],
        "normalized_query": None,
        "engine": f"ollama:{ollama_client.OLLAMA_MODEL}",
    }


def get_intent_and_entities(text: str, language: str = "en") -> Dict[str, Any]:
    """
    Primary entry point. Uses the LLM when configured/available, otherwise the
    rule-based classifier. Always returns the standard NLP-output dict.
    """
    if NLP_PROVIDER == "ollama":
        try:
            return _understand_with_ollama(text)
        except Exception as e:
            logging.warning(f"Ollama understanding failed; falling back to rules: {e}")

    result = nlp_service.get_intent_and_entities(text, language)
    result["engine"] = "rules"
    return result


def warmup() -> None:
    """
    Prime the model AND the system-prompt prefix cache with a real parse, so the
    first genuine user query is fast (not paying the prompt-eval cost live).
    Best-effort; ignores failures.
    """
    try:
        _understand_with_ollama("show crimes in mysuru")
        logging.info("Language provider (Ollama) warmed up with full prompt.")
    except Exception as e:
        logging.warning(f"Provider warmup failed: {e}")
