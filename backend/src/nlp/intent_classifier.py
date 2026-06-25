import re
import json
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from typing import Dict, Any, Tuple
import os
import calendar
from datetime import datetime, timedelta

class IntentClassifier:
    def __init__(self, model_path: str = "models/intent_en.joblib"):
        """
        Initialize the intent classifier.

        Args:
            model_path: Path to the saved model file
        """
        self.model_path = model_path
        self.vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words=None,  # Keep words like "how", "count", "by" — they carry intent signal
            ngram_range=(1, 2),
            max_features=5000
        )
        self.classifier = LogisticRegression(
            random_state=42,
            max_iter=1000,
            C=10.0  # Less regularization for small dataset to sharpen decision boundaries
        )
        self.is_trained = False

        # Try to load existing model
        self._load_model()

        # Known cities in Karnataka for location extraction
        self.karnataka_cities = [
            "bengaluru", "bangalore", "mysuru", "mysore", "belagavi", "belgaum",
            "kalaburagi", "gulbarga", "mangaluru", "mangalore", "udaipur",
            "shivamogga", "shimoga", "tumakuru", "tumkur", "raichur",
            "bidar", "bijapur", "vijayapura", "bagalkot", "kolar",
            "chikkaballapur", "chikkamagaluru", "chitradurga", "davanagere",
            "dharawad", "gadag", "haveri", "hubli", "karwar", "kodagu",
            "koppal", "madikeri", "mandya", "ramanagara", "srirangapatna"
        ]

        # Crime type mapping (same as in translator for consistency)
        self.crime_type_mapping = {
            "theft": "379",
            "murder": "302",
            "snatching": "356",
            "robbery": "392",
            "assault": "351",
            "burglary": "454",
            "riot": "146",
            "cheating": "415",
            "forgery": "463",
            "counterfeiting": "489"
        }

    def _load_model(self) -> None:
        """Load a pre-trained model if it exists."""
        if os.path.exists(self.model_path):
            try:
                model_data = joblib.load(self.model_path)
                self.vectorizer = model_data['vectorizer']
                self.classifier = model_data['classifier']
                self.is_trained = True
            except Exception as e:
                print(f"Warning: Could not load model from {self.model_path}: {e}")
                self.is_trained = False

    def train(self, X: list, y: list) -> None:
        """
        Train the intent classifier.

        Args:
            X: List of text samples
            y: List of intent labels
        """
        # Vectorize the text
        X_vec = self.vectorizer.fit_transform(X)

        # Train the classifier
        self.classifier.fit(X_vec, y)
        self.is_trained = True

        # Save the model
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump({
            'vectorizer': self.vectorizer,
            'classifier': self.classifier
        }, self.model_path)

    def predict(self, text: str) -> Tuple[str, float]:
        """
        Predict the intent for a given text.

        Args:
            text: Input text to classify

        Returns:
            Tuple of (intent, confidence)
        """
        if not self.is_trained:
            return "UNKNOWN", 0.0

        # Preprocess text (language-aware preprocessing could be added here)
        text_clean = self._preprocess_text(text)

        # Vectorize and predict
        text_vec = self.vectorizer.transform([text_clean])
        intent = self.classifier.predict(text_vec)[0]

        # Get confidence score
        confidence = max(self.classifier.predict_proba(text_vec)[0])

        return intent, float(confidence)

    def get_intent_and_entities(self, text: str, language: str = "en") -> Dict[str, Any]:
        """
        Get intent and entities for a given text.
        Includes basic entity extraction for location, date range, and crime type.
        Supports Kannada queries by normalizing them to English first.

        Args:
            text: Input text
            language: Language code ('en' for English, 'kn' for Kannada)

        Returns:
            Dictionary with intent, confidence, and entities
        """
        from src.nlp.kannada_support import contains_kannada, analyze_kannada

        # If the query is in Kannada, normalize it to an English query string
        # and use the deterministically-detected intent (more reliable than
        # round-tripping through the English-trained ML classifier).
        original_text = text
        was_kannada = language == "kn" or contains_kannada(text)
        kn_intent = None
        normalized_query = None
        if was_kannada:
            analysis = analyze_kannada(text)
            text = analysis["normalized"]
            kn_intent = analysis["intent"]
            normalized_query = text

        intent, confidence = self.predict(text)

        # For Kannada, trust the deterministic intent
        if kn_intent is not None:
            intent = kn_intent
            confidence = max(confidence, 0.9)
        else:
            # Apply confidence threshold for English
            if confidence < 0.3:
                intent = "UNKNOWN"

        # Extract entities (from the normalized English text)
        entities = self._extract_entities(text)

        # For breakdown queries, ensure a grouping dimension exists (default: district)
        if intent == "BREAKDOWN_CRIMES" and "group_by" not in entities:
            entities["group_by"] = "district"

        return {
            "intent": intent,
            "confidence": confidence,
            "entities": entities,
            "normalized_query": normalized_query
        }

    def _extract_entities(self, text: str) -> Dict[str, Any]:
        """
        Extract entities from text using rule-based approaches.

        Args:
            text: Input text

        Returns:
            Dictionary with entities: location, date_range, crime_type
        """
        entities = {}
        text_lower = text.lower()

        # Extract location
        location = self._extract_location(text_lower)
        if location:
            entities["location"] = location

        # Extract date range
        date_range = self._extract_date_range(text_lower)
        if date_range:
            entities["date_range"] = date_range

        # Extract crime type
        crime_type = self._extract_crime_type(text_lower)
        if crime_type:
            entities["crime_type"] = crime_type

        # Extract group-by dimension (for BREAKDOWN queries)
        group_by = self._extract_group_by(text_lower)
        if group_by:
            entities["group_by"] = group_by

        return entities

    def _extract_group_by(self, text: str) -> str:
        """
        Extract the grouping dimension for breakdown/aggregation queries.

        Returns one of: 'district', 'crime_type', 'month', or None.
        """
        # "by district" / "per district" / "district wise" / "across districts"
        if re.search(r'\b(?:by|per|across|each|wise)\b.*\b(?:district|location|place|city|area)\b', text) \
                or re.search(r'\b(?:district|location|city|area)\b.*\bwise\b', text) \
                or "by district" in text or "by location" in text or "by city" in text:
            return "district"

        # "by type" / "by crime type" / "top crimes" / "crime types"
        if re.search(r'\b(?:by|per|each)\b.*\b(?:type|category|kind)\b', text) \
                or "crime types" in text or "type of crime" in text \
                or "top crime" in text or "most common crime" in text:
            return "crime_type"

        # "by month" / "monthly" / "over time" / "trend"
        if "by month" in text or "monthly" in text or "over time" in text \
                or "trend" in text or "month wise" in text:
            return "month"

        return None

    def _extract_location(self, text: str) -> str:
        """Extract location name from text."""
        # Look for patterns like "in [place]", "at [place]", or "near [place]"
        # Capture location name but stop before date/time indicators or conjunctions
        boundary_pattern = r'\s+(?:and|or|but|last|next|yesterday|today|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}|$)'
        match = re.search(r'in\s+([a-zA-Z\s]+?)(?=' + boundary_pattern + r')', text)
        if match:
            location = match.group(1).strip()
            if location and len(location) > 2:
                return location.title()
        match = re.search(r'at\s+([a-zA-Z\s]+?)(?=' + boundary_pattern + r')', text)
        if match:
            location = match.group(1).strip()
            if location and len(location) > 2:
                return location.title()
        match = re.search(r'near\s+([a-zA-Z\s]+?)(?=' + boundary_pattern + r')', text)
        if match:
            location = match.group(1).strip()
            if location and len(location) > 2:
                return location.title()
        # Fallback: check for known cities (substring)
        for city in self.karnataka_cities:
            if city in text:
                return city.title().replace('Udupi', 'Udupi').replace('Shivamogga', 'Shivamogga')
        return None

    def _strip_date_indicators(self, text: str) -> str:
        """Strip date/time indicators from the end of location text."""
        # Common date/time phrases that might appear after location
        date_patterns = [
            r'\s+last\s+(?:week|month|year)$',
            r'\s+next\s+(?:week|month|year)$',
            r'\s+yesterday$',
            r'\s+today$',
            r'\s+\d{1,2}/\d{1,2}/\d{2,4}$',
            r'\s+\d{4}$',
            r'\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)$',
            r'\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$'
        ]

        for pattern in date_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)

        return text.strip()

    def _extract_date_range(self, text: str) -> Dict[str, str]:
        """Extract date range from text."""
        # Handle relative dates
        now = datetime.now()

        if "last month" in text:
            end = now
            start = end - timedelta(days=30)
            return {
                "start": start.strftime("%Y-%m-%d"),
                "end": end.strftime("%Y-%m-%d")
            }

        if "last week" in text:
            end = now
            start = end - timedelta(days=7)
            return {
                "start": start.strftime("%Y-%m-%d"),
                "end": end.strftime("%Y-%m-%d")
            }

        if "yesterday" in text:
            date = now - timedelta(days=1)
            return {
                "start": date.strftime("%Y-%m-%d"),
                "end": date.strftime("%Y-%m-%d")
            }

        if "today" in text:
            date = now
            return {
                "start": date.strftime("%Y-%m-%d"),
                "end": date.strftime("%Y-%m-%d")
            }

        # Handle specific months/years
        # This is simplified - in production you'd parse more complex date expressions
        year_match = re.search(r'in\s+(\d{4})', text)
        if year_match:
            year = int(year_match.group(1))
            return {
                "start": f"{year}-01-01",
                "end": f"{year}-12-31"
            }

        # Handle "in [month]" patterns
        months = {
            "january": 1, "february": 2, "march": 3, "april": 4,
            "may": 5, "june": 6, "july": 7, "august": 8,
            "september": 9, "october": 10, "november": 11, "december": 12
        }

        for month_name, month_num in months.items():
            if f"in {month_name}" in text:
                # Assume current year first
                year = now.year
                # If the month hasn't occurred yet this year, it must be referring to last year
                if month_num > now.month:
                    year = now.year - 1
                # Calculate the correct last day of the month (calendar-aware)
                last_day = calendar.monthrange(year, month_num)[1]
                return {
                    "start": f"{year}-{month_num:02d}-01",
                    "end": f"{year}-{month_num:02d}-{last_day:02d}"
                }

        return None

    def _extract_crime_type(self, text: str) -> str:
        """Extract crime type from text."""
        # Check against known crime types
        for crime_type, ipc_section in self.crime_type_mapping.items():
            if crime_type in text:
                return crime_type.title()  # Return properly formatted

        # Also check for common variations
        crime_variations = {
            "theft": ["stealing", "stolen"],
            "murder": ["kill", "killing", "homicide"],
            "snatching": ["snatch", " purse snatching"],
            "robbery": ["rob", "steal"],
            "assault": ["attack", "threaten"],
            "burglary": ["break in", "breaking"],
            "riot": ["riot", "protest"],
            "cheating": ["fraud", "scam"],
            "forgery": ["forge", "fake"],
            "counterfeiting": ["counterfeit", "fake money"]
        }

        for crime_type, variations in crime_variations.items():
            for variation in variations:
                if variation in text:
                    return crime_type.title()

        return None

    def _preprocess_text(self, text: str) -> str:
        """
        Basic text preprocessing: lowercase, remove extra punctuation.

        Args:
            text: Input text

        Returns:
            Preprocessed text
        """
        # Convert to lowercase
        text = text.lower()

        # Remove extra punctuation but keep basic ones
        text = re.sub(r'[^\w\s\?\.\,]', '', text)

        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        return text

# For backward compatibility and ease of use
nlp_service = IntentClassifier()