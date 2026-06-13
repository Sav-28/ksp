from typing import Dict, Any, Tuple, Optional
import re
from datetime import datetime, timedelta

class QueryTranslator:
    def __init__(self, crime_type_mapping: Optional[Dict[str, str]] = None):
        """
        Initialize the query translator.

        Args:
            crime_type_mapping: Dictionary mapping crime names to IPC sections
                                e.g., {"theft": "379", "murder": "302"}
                                If None, a basic mapping will be used
        """
        # Default crime type mapping (can be extended)
        self.crime_type_mapping = crime_type_mapping or {
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

    def translate(self, nlp_output: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Convert classified intents/entities into parameterized SQL.

        Args:
            nlp_output: Dict from NLP pipeline with keys:
                       - intent: str ("SHOW_CRIMES", "COUNT_CRIMES", etc.)
                       - confidence: float
                       - entities: dict with optional keys:
                         * location: str
                         * date_range: dict with "start" and "end" (ISO format)
                         * crime_type: str

        Returns:
            Tuple of (sql_string, params_dict) where params_dict uses :named parameters

        Raises:
            ValueError: For invalid inputs
        """
        intent = nlp_output.get("intent")
        entities = nlp_output.get("entities", {})

        # Validate intent
        if intent not in ["SHOW_CRIMES", "COUNT_CRIMES"]:
            raise ValueError(f"Unsupported intent: {intent}")

        # Build base query
        if intent == "SHOW_CRIMES":
            base_sql = "SELECT * FROM crimes"
            limit_clause = " LIMIT :limit"
        else:  # COUNT_CRIMES
            base_sql = "SELECT COUNT(*) FROM crimes"
            limit_clause = ""

        # Build WHERE conditions
        conditions = []
        params = {}

        # Process location entity
        location = entities.get("location")
        if location:
            # Validate location is not empty
            if not location or not isinstance(location, str):
                raise ValueError("Location must be a non-empty string")

            # Case-insensitive matching across district, taluk, or police_station
            loc_pattern = f"%{location.strip()}%"
            conditions.append(
                "(district ILIKE :loc OR taluk ILIKE :loc OR police_station ILIKE :loc)"
            )
            params["loc"] = loc_pattern

        # Process date_range entity
        date_range = entities.get("date_range")
        if date_range:
            if not isinstance(date_range, dict):
                raise ValueError("Date range must be a dictionary")

            start_date = date_range.get("start")
            end_date = date_range.get("end")

            # Validate dates
            if start_date:
                try:
                    # Validate ISO format (YYYY-MM-DD)
                    datetime.strptime(start_date, "%Y-%m-%d")
                    params["start"] = start_date
                    conditions.append("date_occurred >= :start")
                except ValueError:
                    raise ValueError(f"Invalid start date format: {start_date}. Use YYYY-MM-DD")

            if end_date:
                try:
                    datetime.strptime(end_date, "%Y-%m-%d")
                    params["end"] = end_date
                    conditions.append("date_occurred <= :end")
                except ValueError:
                    raise ValueError(f"Invalid end date format: {end_date}. Use YYYY-MM-DD")

            # Validate that we have at least one date if date_range is provided
            if not start_date and not end_date:
                raise ValueError("Date range must contain at least start or end date")

        # Process crime_type entity
        crime_type = entities.get("crime_type")
        if crime_type:
            if not isinstance(crime_type, str):
                raise ValueError("Crime type must be a string")

            crime_type_clean = crime_type.strip().lower()

            # Map to IPC section if possible
            ipc_section = self.crime_type_mapping.get(crime_type_clean)
            if ipc_section:
                conditions.append("crime_type ILIKE :ctype")
                params["ctype"] = f"%{ipc_section}%"
            else:
                # If not in mapping, try direct match (for future flexibility)
                # But log warning that it might not be effective
                print(f"Warning: Crime type '{crime_type}' not found in mapping. Using direct match.")
                conditions.append("crime_type ILIKE :ctype")
                params["ctype"] = f"%{crime_type}%"

        # Validate required inputs for SHOW/COUNT
        if intent in ["SHOW_CRIMES", "COUNT_CRIMES"]:
            # For these intents, we require either location or date_range (or both)
            # This prevents overly broad queries
            if not location and not date_range:
                raise ValueError(
                    "Either location or date_range must be provided for SHOW_CRIMES or COUNT_CRIMES intents"
                )

        # Combine conditions
        if conditions:
            where_clause = " WHERE " + " AND ".join(conditions)
        else:
            where_clause = ""

        # Add limit for SHOW_CRIMES
        if intent == "SHOW_CRIMES":
            params["limit"] = 100  # Hard limit as per requirements
            sql = base_sql + where_clause + limit_clause
        else:
            sql = base_sql + where_clause

        return sql, params

    def validate_inputs(self, nlp_output: Dict[str, Any]) -> bool:
        """
        Validate NLP output before translation.

        Args:
            nlp_output: Output from NLP pipeline

        Returns:
            True if valid, False otherwise
        """
        try:
            self.translate(nlp_output)
            return True
        except ValueError:
            return False