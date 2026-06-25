"""
Kannada language support for the KSP Crime AI NLP pipeline.

The intent classifier is trained on English. Rather than maintaining a separate
Kannada ML model, this module normalizes a Kannada query into an equivalent
English query string by matching known Kannada stems for:
  - intent keywords (show / count / breakdown)
  - crime types
  - district / city names
  - grouping dimensions

The resulting English string is then fed through the existing English pipeline
(classifier + rule-based entity extraction), so Kannada queries return real
results instead of being classified as UNKNOWN.
"""
import re

# Kannada stems -> English crime type (substring match; Kannada is agglutinative)
CRIME_TYPE_KN = {
    "ಕಳ್ಳತನ": "theft",
    "ಕದಿ": "theft",
    "ಕೊಲೆ": "murder",
    "ಸೆಳೆ": "snatching",
    "ಸೆಳೆತ": "snatching",
    "ದರೋಡೆ": "robbery",
    "ಹಲ್ಲೆ": "assault",
    "ಮನೆಗಳ್ಳತನ": "burglary",
    "ಕನ್ನ": "burglary",
    "ಗಲಭೆ": "rioting",
    "ದಂಗೆ": "rioting",
    "ವಂಚನೆ": "cheating",
    "ಮೋಸ": "cheating",
    "ನಕಲಿ": "forgery",
    "ಖೋಟಾ": "counterfeiting",
    "ನಕಲಿ ನೋಟು": "counterfeiting",
}

# Kannada district/city stems -> English district name (as stored in DB)
DISTRICT_KN = {
    "ಬೆಂಗಳೂರು": "bengaluru",
    "ಬೆಂಗಳೂರ": "bengaluru",
    "ಮೈಸೂರು": "mysuru",
    "ಮೈಸೂರ": "mysuru",
    "ಬೆಳಗಾವಿ": "belagavi",
    "ಕಲಬುರಗಿ": "kalaburagi",
    "ಗುಲ್ಬರ್ಗಾ": "kalaburagi",
    "ಮಂಗಳೂರು": "mangaluru",
    "ಮಂಗಳೂರ": "mangaluru",
    "ಹುಬ್ಬಳ್ಳಿ": "hubli",
    "ಧಾರವಾಡ": "dharwad",
    "ತುಮಕೂರು": "tumakuru",
    "ತುಮಕೂರ": "tumakuru",
    "ರಾಯಚೂರು": "raichur",
    "ರಾಯಚೂರ": "raichur",
}

# Grouping dimension stems
GROUP_BY_KN = {
    "ಜಿಲ್ಲೆವಾರು": "district",
    "ಜಿಲ್ಲೆಯ": "district",
    "ಪ್ರಕಾರವಾರು": "type",
    "ವಿಧವಾರು": "type",
    "ತಿಂಗಳ": "month",
    "ಮಾಸಿಕ": "month",
}

# Count-intent keywords
COUNT_KN = ["ಎಷ್ಟು", "ಎಣಿಕೆ", "ಎಣಿಸಿ", "ಸಂಖ್ಯೆ", "ಎಷ್ಟಿವೆ"]
# Show-intent keywords
SHOW_KN = ["ತೋರಿಸಿ", "ತೋರಿಸು", "ಪಟ್ಟಿ", "ಪ್ರದರ್ಶಿಸಿ", "ತೋರಿ"]
# Breakdown keywords
BREAKDOWN_KN = ["ವಿಭಜನೆ", "ವಿಂಗಡಣೆ", "ಜಿಲ್ಲೆವಾರು", "ಪ್ರಕಾರವಾರು", "ವಿಧವಾರು"]

_KANNADA_RE = re.compile(r'[\u0c80-\u0cff]')


def contains_kannada(text: str) -> bool:
    """Return True if the text contains any Kannada characters."""
    return bool(_KANNADA_RE.search(text))


def translate_to_english(text: str) -> str:
    """
    Convert a Kannada crime query into an equivalent English query string
    that the existing English NLP pipeline can understand.
    """
    return analyze_kannada(text)["normalized"]


def analyze_kannada(text: str) -> dict:
    """
    Analyze a Kannada query and return both a normalized English query string
    and a deterministically-detected intent.

    Returns:
        {
            "normalized": str,   # English-equivalent query for entity extraction
            "intent": str        # SHOW_CRIMES | COUNT_CRIMES | BREAKDOWN_CRIMES
        }
    """
    # Detect crime type
    crime = None
    for stem, eng in CRIME_TYPE_KN.items():
        if stem in text:
            crime = eng
            break

    # Detect location
    location = None
    for stem, eng in DISTRICT_KN.items():
        if stem in text:
            location = eng
            break

    # Detect grouping dimension
    group_dim = None
    for stem, eng in GROUP_BY_KN.items():
        if stem in text:
            group_dim = eng
            break

    # Detect intent deterministically from Kannada keywords
    is_breakdown = any(w in text for w in BREAKDOWN_KN) or group_dim is not None
    is_count = any(w in text for w in COUNT_KN)

    if is_breakdown:
        dim = group_dim or "district"
        return {"normalized": f"crimes by {dim}", "intent": "BREAKDOWN_CRIMES"}

    if is_count:
        parts = ["how many"]
        if crime:
            parts.append(crime)
        parts.append("crimes")
        if location:
            parts.append(f"in {location}")
        return {"normalized": " ".join(parts), "intent": "COUNT_CRIMES"}

    # Default: SHOW
    parts = ["show"]
    if crime:
        parts.append(crime)
    parts.append("crimes")
    if location:
        parts.append(f"in {location}")
    return {"normalized": " ".join(parts), "intent": "SHOW_CRIMES"}
