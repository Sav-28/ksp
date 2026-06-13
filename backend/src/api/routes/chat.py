from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any
import logging

# Assuming these will be imported from their respective modules
# In a real implementation, these would be actual imports
# from backend.src.nlp.intent_classifier import nlp_service
# from backend.src.query_engine.translator import query_engine
# from backend.src.database import get_db
# from backend.src.utils.audit import log_audit

router = APIRouter()

# Mock implementations for demonstration - replace with actual imports
class MockNLPService:
    def get_intent_and_entities(self, text: str) -> Dict[str, Any]:
        # Simple mock for demonstration
        text_lower = text.lower()
        if "show" in text_lower or "list" in text_lower:
            intent = "SHOW_CRIMES"
        elif "count" in text_lower or "how many" in text_lower:
            intent = "COUNT_CRIMES"
        else:
            intent = "UNKNOWN"

        # Extract simple entities (mock)
        entities = {}
        if "bengaluru" in text_lower:
            entities["location"] = "Bengaluru"
        if "last month" in text_lower:
            from datetime import datetime, timedelta
            end = datetime.now()
            start = end - timedelta(days=30)
            entities["date_range"] = {
                "start": start.strftime("%Y-%m-%d"),
                "end": end.strftime("%Y-%m-%d")
            }
        if "theft" in text_lower:
            entities["crime_type"] = "theft"

        return {
            "intent": intent,
            "confidence": 0.9 if intent != "UNKNOWN" else 0.2,
            "entities": entities
        }

class MockQueryEngine:
    def translate(self, nlp_output: Dict[str, Any]) -> tuple:
        # Simple mock translator
        intent = nlp_output.get("intent")
        entities = nlp_output.get("entities", {})

        params = {}
        conditions = []

        if "location" in entities:
            loc = f"%{entities['location']}%"
            conditions.append("(district ILIKE :loc OR taluk ILIKE :loc OR police_station ILIKE :loc)")
            params["loc"] = loc

        if "date_range" in entities:
            dr = entities["date_range"]
            if "start" in dr:
                conditions.append("date_occurred >= :start")
                params["start"] = dr["start"]
            if "end" in dr:
                conditions.append("date_occurred <= :end")
                params["end"] = dr["end"]

        if "crime_type" in entities:
            ctype = entities["crime_type"]
            # Simple mapping for demo
            mapping = {"theft": "379", "murder": "302"}
            ipc = mapping.get(ctype.lower(), ctype)
            conditions.append("crime_type ILIKE :ctype")
            params["ctype"] = f"%{ipc}%"

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
        limit_clause = " LIMIT :limit" if intent == "SHOW_CRIMES" else ""
        params["limit"] = 100

        if intent == "SHOW_CRIMES":
            sql = f"SELECT * FROM crimes{where_clause}{limit_clause}"
        else:
            sql = f"SELECT COUNT(*) FROM crimes{where_clause}"

        return sql, params

# In real implementation, use:
# nlp_service = NLPService()
# query_engine = QueryEngine()

# Mock services for now
nlp_service = MockNLPService()
query_engine = MockQueryEngine()

# Mock database dependency
def get_db():
    # In real implementation, this would return a SQLAlchemy session
    # For demo, we'll yield a mock connection
    class MockSession:
        def execute(self, query, params):
            # Return mock results based on query
            if "COUNT(*)" in query:
                return [{"count": 5}]  # Mock count
            else:
                # Mock crime records
                return [
                    {
                        "id": 1,
                        "fir_number": "FIR001",
                        "date_occurred": "2023-05-15",
                        "district": "Bengaluru Urban",
                        "taluk": "Bengaluru North",
                        "police_station": "Yelahanka",
                        "crime_type": "theft",
                        "description": "Mobile phone theft",
                        "latitude": 13.1081,
                        "longitude": 77.5874
                    }
                ]
        def commit(self):
            pass
        def close(self):
            pass

    return MockSession()

# Mock audit function
def log_audit(user_id: str, text: str, intent: str, sql: str, row_count: int):
    logging.info(f"AUDIT: user={user_id}, query='{text}', intent={intent}, rows={row_count}")

@router.post("/chat")
async def chat_endpoint(
    request: Dict[str, Any],
    db: Session = Depends(get_db)
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
        text = request.get("text", "")
        language = request.get("language", "en")
        session_id = request.get("sessionId")

        # Validate input
        if not text or not isinstance(text, str):
            raise ValueError("Text input is required and must be a string")

        # Call NLP service to get intent/entities
        nlp_output = nlp_service.get_intent_and_entities(text)

        # Call query engine to get SQL/params
        sql, params = query_engine.translate(nlp_output)

        # Execute SQL against DB
        try:
            result_proxy = db.execute(text(sql), params)

            # Handle different query types
            if "COUNT(*)" in sql.upper():
                # For count queries, fetch the count value
                count_result = result_proxy.fetchone()
                row_count = count_result["count"] if count_result else 0
                results = []  # No detailed results for count
            else:
                # For select queries, fetch all results
                results = [dict(row) for row in result_proxy.fetchall()]
                row_count = len(results)

        except Exception as e:
            raise ValueError(f"Database execution error: {str(e)}")

        # Format results into natural language answer
        intent = nlp_output.get("intent")
        confidence = nlp_output.get("confidence", 0.0)

        if intent == "COUNT_CRIMES":
            answer = f"Found {row_count} crimes matching your criteria."
        elif intent == "SHOW_CRIMES":
            if row_count == 0:
                answer = "No crimes found matching your criteria."
            else:
                answer = f"Here are the first {min(row_count, 100)} crimes:"
                # In a real implementation, you might format this as a table summary
        else:
            answer = "Sorry, I couldn't process that. Try: 'Show crimes in [place] last month'"

        # Add sessionId to answer if provided (for history tracking)
        if session_id:
            answer = f"[Session: {session_id}] {answer}"

        # Log request via audit middleware
        # In real implementation: log_audit(user_id, text, intent, sql, row_count)
        # For demo, we'll just log to console
        logging.info(f"AUDIT: query='{text}', intent={intent}, rows={row_count}")

        # Return response
        return {
            "answer": answer,
            "sql": sql,  # Include for debugging - remove in production
            "results": results,
            "error": None
        }

    except ValueError as e:
        # Validation errors return 400
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Server errors return 500
        logging.error(f"Internal server error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")