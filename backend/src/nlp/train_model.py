"""
Training script for the KSP Crime AI intent classifier.
Creates a basic model with sample training data if no model exists.
"""

import os
import sys
# Add the src directory to the path so we can import backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.nlp.intent_classifier import IntentClassifier

def create_training_data():
    """Create sample training data for intent classification."""

    # Training samples for SHOW_CRIMES intent
    show_crimes_samples = [
        "show crimes in bengaluru",
        "list thefts in mysuru",
        "display robbery cases from last week",
        "show me all murder cases",
        "list crimes in koramangala",
        "show theft cases near mg road",
        "display snatching incidents",
        "show crimes in yelahanka",
        "list all burglary cases",
        "show assault reports",
        "display crimes from last month",
        "show crimes in belagavi",
        "list kalaburagi crime reports",
        "show rape cases",
        "display kidnapping incidents",
        "show crimes near railway station",
        "list traffic accident cases",
        "show cyber crime reports",
        "display economic offense cases",
        "show narcotics cases"
    ]

    # Training samples for COUNT_CRIMES intent
    count_crimes_samples = [
        "how many crimes in bengaluru",
        "count theft cases in mysuru",
        "number of robbery cases from last week",
        "how many murder cases",
        "count of crimes in koramangala",
        "number of theft cases near mg road",
        "count snatching incidents",
        "how many crimes in yelahanka",
        "number of burglary cases",
        "how many assault reports",
        "count of crimes from last month",
        "how many crimes in belagavi",
        "number of kalaburagi crime reports",
        "how many rape cases",
        "count kidnapping incidents",
        "how many crimes near railway station",
        "number of traffic accident cases",
        "how many cyber crime reports",
        "count of economic offense cases",
        "number of narcotics cases"
    ]

    # Training samples for UNKNOWN intent (out of scope)
    unknown_samples = [
        "hello",
        "how are you",
        "what is the weather",
        "tell me a joke",
        "goodbye",
        "thanks",
        "please help",
        "what time is it",
        "who are you",
        "i love you",
        "good morning",
        "good night",
        "how to cook",
        "what is police",
        "explain law",
        "tell me story",
        "sing a song",
        "dance video",
        "movie recommendations",
        "restaurant near me"
    ]

    # Combine all samples and labels
    texts = show_crimes_samples + count_crimes_samples + unknown_samples
    labels = (["SHOW_CRIMES"] * len(show_crimes_samples) +
              ["COUNT_CRIMES"] * len(count_crimes_samples) +
              ["UNKNOWN"] * len(unknown_samples))

    return texts, labels

def train_and_save_model(model_path="models/intent_en.joblib"):
    """Train the intent classifier and save it."""
    print("Creating training data...")
    X, y = create_training_data()

    print(f"Training model with {len(X)} samples...")
    print(f"Label distribution: { {label: y.count(label) for label in set(y)} }")

    # Create and train the classifier
    classifier = IntentClassifier(model_path=model_path)
    classifier.train(X, y)

    # Ensure the models directory exists
    os.makedirs(os.path.dirname(model_path), exist_ok=True)

    # The train method already saves the model, but let's verify
    if os.path.exists(model_path):
        print(f"Model saved successfully to {model_path}")
        # Test the model
        test_samples = [
            "show crimes in bengaluru",
            "how many thefts in mysuru",
            "hello how are you"
        ]
        print("\nTesting model:")
        for sample in test_samples:
            intent, confidence = classifier.predict(sample)
            print(f"  '{sample}' -> {intent} (confidence: {confidence:.2f})")
    else:
        print(f"Error: Model was not saved to {model_path}")

if __name__ == "__main__":
    # Relative to the backend/src/nlp directory
    model_path = "models/intent_en.joblib"
    train_and_save_model(model_path)