from src.query_engine.translator import QueryTranslator
from src.nlp.intent_classifier import nlp_service

text = "show crimes in bengaluru"
nlp_output = nlp_service.get_intent_and_entities(text)
print(f"NLP Output: {nlp_output}")

translator = QueryTranslator()
try:
    sql, params = translator.translate(nlp_output)
    print(f"SQL: {sql}")
    print(f"Params: {params}")
except Exception as e:
    print(f"Error: {e}")