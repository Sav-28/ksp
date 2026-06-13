from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any
import logging
import traceback

# Import real services
from src.nlp.intent_classifier import nlp_service
from src.query_engine.translator import QueryTranslator
from src.database.session import get_db

router = APIRouter()

# Initialize query translator
query_engine = QueryTranslator()

# Mock audit function (to be replaced with real implementation)
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
        input_text = request.get("text", "")
        language = request.get("language", "en")
        session_id = request.get("sessionId")

        # Validate input
        if not input_text or not isinstance(input_text, str):
            raise ValueError("Text input is required and must be a string")

        # Call NLP service to get intent/entities
        nlp_output = nlp_service.get_intent_and_entities(input_text)

        # Call query engine to get SQL/params
        sql, params = query_engine.translate(nlp_output)

        # Execute SQL against DB
        try:
            result_proxy = db.execute(text(sql), params)

            # Handle different query types
            if "COUNT(*)" in sql.upper():
                # For count queries, fetch the count value
                count_result = result_proxy.fetchone()
                row_count = count_result[0] if count_result else 0
                results = []  # No detailed results for count
            else:
                # For select queries, fetch all results
                results = [row._asdict() for row in result_proxy.fetchall()]
                row_count = len(results)

        except Exception as e:
            logging.error(f"Database execution error: {str(e)}")
            logging.error(traceback.format_exc())
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
        logging.info(f"AUDIT: query='{input_text}', intent={intent}, rows={row_count}")

        # Return response
        return {
            "answer": answer,
            "sql": sql,  # Include for debugging - remove in production
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