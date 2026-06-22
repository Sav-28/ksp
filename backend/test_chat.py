from src.nlp.intent_classifier import nlp_service
from src.query_engine.translator import QueryTranslator
from src.database.session import SessionLocal
from sqlalchemy import text as sql_text

def test_chat_endpoint():
    input_text = "show crimes in bengaluru"
    print(f"Input text: {input_text}")

    # Call NLP service
    nlp_output = nlp_service.get_intent_and_entities(input_text, language="en")
    print(f"NLP output: {nlp_output}")

    # Call query engine
    query_engine = QueryTranslator()
    sql, params = query_engine.translate(nlp_output)
    print(f"Generated SQL: {sql}")
    print(f"Params: {params}")

    # Execute SQL against DB
    db = SessionLocal()
    try:
        result_proxy = db.execute(sql_text(sql), params)
        # Handle different query types
        if "COUNT(*)" in sql.upper():
            count_result = result_proxy.fetchone()
            row_count = count_result[0] if count_result else 0
            results = []
            print(f"Count: {row_count}")
        else:
            results = [row._asdict() for row in result_proxy.fetchall()]
            row_count = len(results)
            print(f"Number of results: {row_count}")
            if row_count > 0:
                print(f"First result: {results[0]}")
    except Exception as e:
        print(f"Database error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_chat_endpoint()