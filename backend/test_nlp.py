from src.nlp.intent_classifier import nlp_service

text = "show crimes in bengaluru"
result = nlp_service.get_intent_and_entities(text, language="en")
print(f"Text: {text}")
print(f"Result: {result}")