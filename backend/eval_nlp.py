"""
Evaluation script for the NLP intent classifier.
Tests against a held-out set of realistic queries (not in training data)
and reports accuracy per intent.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from src.nlp.intent_classifier import IntentClassifier

# Held-out test queries: (query, expected_intent)
TEST_CASES = [
    # SHOW_CRIMES
    ("show me crimes in bengaluru", "SHOW_CRIMES"),
    ("list theft cases in hubli", "SHOW_CRIMES"),
    ("display all robberies", "SHOW_CRIMES"),
    ("what crimes occurred in mysuru", "SHOW_CRIMES"),
    ("show murder cases from last month", "SHOW_CRIMES"),
    ("give me all burglary records", "SHOW_CRIMES"),
    # COUNT_CRIMES
    ("how many thefts in mysuru", "COUNT_CRIMES"),
    ("count the murders in bengaluru", "COUNT_CRIMES"),
    ("number of robberies last week", "COUNT_CRIMES"),
    ("how many total crimes", "COUNT_CRIMES"),
    ("count cheating cases", "COUNT_CRIMES"),
    ("how many burglaries in belagavi", "COUNT_CRIMES"),
    # BREAKDOWN_CRIMES
    ("crimes by district", "BREAKDOWN_CRIMES"),
    ("breakdown of crimes by type", "BREAKDOWN_CRIMES"),
    ("which district has the most crimes", "BREAKDOWN_CRIMES"),
    ("show me crime distribution by category", "BREAKDOWN_CRIMES"),
    ("monthly crime trend", "BREAKDOWN_CRIMES"),
    ("top crime types", "BREAKDOWN_CRIMES"),
    # UNKNOWN
    ("hello there", "UNKNOWN"),
    ("what's the weather like", "UNKNOWN"),
    ("tell me a joke", "UNKNOWN"),
    ("book me a flight", "UNKNOWN"),
]


def main():
    clf = IntentClassifier(model_path="models/intent_en.joblib")
    if not clf.is_trained:
        print("Model not trained! Run train_model.py first.")
        return

    correct = 0
    per_intent = {}
    failures = []

    for query, expected in TEST_CASES:
        result = clf.get_intent_and_entities(query)
        predicted = result["intent"]
        conf = result["confidence"]
        ok = predicted == expected
        if ok:
            correct += 1
        else:
            failures.append((query, expected, predicted, conf))

        per_intent.setdefault(expected, {"correct": 0, "total": 0})
        per_intent[expected]["total"] += 1
        if ok:
            per_intent[expected]["correct"] += 1

    total = len(TEST_CASES)
    print("=" * 60)
    print(f"OVERALL ACCURACY: {correct}/{total} = {correct/total*100:.1f}%")
    print("=" * 60)
    print("\nPer-intent accuracy:")
    for intent, stats in sorted(per_intent.items()):
        print(f"  {intent:20s}: {stats['correct']}/{stats['total']}")

    if failures:
        print(f"\nMisclassifications ({len(failures)}):")
        for query, expected, predicted, conf in failures:
            print(f"  '{query}'\n     expected={expected}, got={predicted} (conf={conf:.2f})")
    else:
        print("\n✅ No misclassifications!")


if __name__ == "__main__":
    main()
