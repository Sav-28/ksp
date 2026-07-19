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
        if intent not in ["SHOW_CRIMES", "COUNT_CRIMES", "BREAKDOWN_CRIMES"]:
            raise ValueError(f"Unsupported intent: {intent}")

        # Map group_by dimension to a SQL column / expression
        group_by_map = {
            "district": "district",
            "crime_type": "crime_type",
            "month": "strftime('%Y-%m', date_occurred)"
        }

        # Build base query
        if intent == "SHOW_CRIMES":
            base_sql = "SELECT * FROM crimes"
            limit_clause = " LIMIT :limit"
        elif intent == "COUNT_CRIMES":
            base_sql = "SELECT COUNT(*) FROM crimes"
            limit_clause = ""
        else:  # BREAKDOWN_CRIMES
            group_dim = entities.get("group_by", "district")
            group_expr = group_by_map.get(group_dim, "district")
            base_sql = f"SELECT {group_expr} AS label, COUNT(*) AS count FROM crimes"
            limit_clause = ""

        # Build WHERE conditions
        conditions = []
        params = {}

        # Common alternate spellings -> canonical DB stem (so LIKE matches)
        location_aliases = {
            "bangalore": "Bengaluru", "bengaluru": "Bengaluru", "bengalooru": "Bengaluru",
            "mysore": "Mysuru", "mysuru": "Mysuru",
            "belgaum": "Belagavi", "belagavi": "Belagavi",
            "gulbarga": "Kalaburagi", "kalaburagi": "Kalaburagi",
            "mangalore": "Mangaluru", "mangaluru": "Mangaluru",
            "hubballi": "Hubli", "hubli": "Hubli",
            "dharwad": "Dharwad", "tumkur": "Tumakuru", "tumakuru": "Tumakuru",
            "raichur": "Raichur", "bijapur": "Vijayapura", "vijayapura": "Vijayapura",
        }

        # Process location entity
        location = entities.get("location")
        if location:
            # Validate location is not empty
            if not location or not isinstance(location, str):
                raise ValueError("Location must be a non-empty string")

            # Normalize common alternate spellings so "Bangalore" matches
            # "Bengaluru Urban/Rural", "Mysore" matches "Mysuru", etc.
            loc_param = location.strip()
            loc_param = location_aliases.get(loc_param.lower(), loc_param)
            # Add wildcards for partial match
            params["loc"] = f"%{loc_param}%"
            conditions.append(
                "(LOWER(district) LIKE LOWER(:loc) OR LOWER(taluk) LIKE LOWER(:loc) OR LOWER(police_station) LIKE LOWER(:loc))"
            )

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

            # Use the crime type directly (already formatted by NLP service)
            # Match against denormalized crime_type field which stores descriptions like "Theft", "Murder", etc.
            conditions.append("LOWER(crime_type) LIKE LOWER(:ctype)")
            params["ctype"] = crime_type.strip()

        # Validate required inputs for SHOW/COUNT/BREAKDOWN
        if intent in ["SHOW_CRIMES", "COUNT_CRIMES", "BREAKDOWN_CRIMES"]:
            # Allow queries without filters if no specific criteria provided
            # This enables "show all crimes" / "crimes by district" type queries
            pass

        # Combine conditions
        if conditions:
            where_clause = " WHERE " + " AND ".join(conditions)
        else:
            where_clause = ""

        # Assemble final SQL per intent
        if intent == "SHOW_CRIMES":
            params["limit"] = 1000  # Increased limit to show more records
            sql = base_sql + where_clause + limit_clause
        elif intent == "BREAKDOWN_CRIMES":
            # GROUP BY the chosen dimension, ordered by count descending
            group_dim = entities.get("group_by", "district")
            group_expr = group_by_map.get(group_dim, "district")
            # Month is ordered chronologically; everything else by count desc
            order_clause = " ORDER BY label ASC" if group_dim == "month" else " ORDER BY count DESC"
            sql = base_sql + where_clause + f" GROUP BY {group_expr}" + order_clause
        else:  # COUNT_CRIMES
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