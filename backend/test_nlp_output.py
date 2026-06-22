"""
Test what the NLP extracts from "Show all crimes in Karnataka"
"""
from src.nlp.intent_classifier import nlp_service

text = "Show all crimes in Karnataka"
print(f"Testing NLP on: '{text}'")
print("=" * 60)

result = nlp_service.get_intent_and_entities(text)
print(f"\nIntent: {result.get('intent')}")
print(f"Confidence: {result.get('confidence')}")
print(f"Entities: {result.get('entities')}")
