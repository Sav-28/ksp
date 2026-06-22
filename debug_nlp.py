#!/usr/bin/env python3
"""
Debug script to test NLP processing for the query "how many thefts near MG Road yesterday"
"""

from src.nlp.intent_classifier import nlp_service

def debug_nlp():
    text = "how many thefts near MG Road yesterday"
    print(f"Input text: {text}")

    # Get NLP output
    nlp_output = nlp_service.get_intent_and_entities(text)
    print(f"NLP output: {nlp_output}")

    # Let's also test each extraction step individually
    print("\n--- Individual extraction tests ---")

    # Test intent prediction
    intent, confidence = nlp_service.predict(text)
    print(f"Predicted intent: {intent} (confidence: {confidence})")

    # Test location extraction
    location = nlp_service._extract_location(text.lower())
    print(f"Extracted location: {location}")

    # Test date range extraction
    date_range = nlp_service._extract_date_range(text.lower())
    print(f"Extracted date range: {date_range}")

    # Test crime type extraction
    crime_type = nlp_service._extract_crime_type(text.lower())
    print(f"Extracted crime type: {crime_type}")

    # Test entities overall
    entities = nlp_service._extract_entities(text)
    print(f"All entities: {entities}")

if __name__ == "__main__":
    debug_nlp()