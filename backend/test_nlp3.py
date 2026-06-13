import numpy as np
from src.nlp.intent_classifier import nlp_service

text = "show crimes in bengaluru"
result = nlp_service.get_intent_and_entities(text)
intent = result['intent']
print(f"Intent: {intent}")
print(f"Type: {type(intent)}")

# Test if it's in the list
test_list = ["SHOW_CRIMES", "COUNT_CRIMES"]
print(f"Is intent in test_list? {intent in test_list}")

# Also test the reverse
print(f"Is 'SHOW_CRIMES' in [intent]? {'SHOW_CRIMES' in [intent]}")