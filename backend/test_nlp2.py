from src.nlp.intent_classifier import nlp_service

text = "show crimes in bengaluru"
result = nlp_service.get_intent_and_entities(text)
print(f"Text: {text}")
print(f"Result: {result}")
print(f"Type of intent: {type(result['intent'])}")
print(f"Intent value: {result['intent']}")
print(f"Is it equal to 'SHOW_CRIMES'? {result['intent'] == 'SHOW_CRIMES'}")