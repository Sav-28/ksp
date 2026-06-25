"""
Training script for the KSP Crime AI intent classifier.
Creates a basic model with sample training data if no model exists.
"""

import os
import sys
# Add the backend directory to the path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

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
        "show narcotics cases",
        "show all crimes",
        "list all records",
        "show me theft in hubli",
        "display all murders in mysuru",
        "give me the crimes in tumakuru",
        "show recent crimes",
        "what crimes happened in raichur",
        "show crime records for dharwad",
        "pull up theft cases in bengaluru",
        "find robbery cases in belagavi",
        "show me crimes from january",
        "list crimes in 2025",
        "display forgery cases",
        "show cheating cases in mangaluru",
        "show rioting incidents in kalaburagi",
        "i want to see all theft cases",
        "show crimes that happened yesterday",
        "list all the snatching cases in bengaluru",
        "display crime details for mysuru",
        "show me everything in raichur"
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
        "number of narcotics cases",
        "how many thefts in hubli",
        "count total crimes",
        "how many crimes are there",
        "what is the total number of crimes",
        "count murders in mysuru",
        "how many forgery cases in dharwad",
        "tell me the number of crimes in tumakuru",
        "count all theft cases",
        "how many crimes happened in 2025",
        "number of crimes last week",
        "how many burglaries in belagavi",
        "count cheating cases in mangaluru",
        "how many rioting cases in kalaburagi",
        "give me the count of robberies",
        "total thefts in bengaluru",
        "how many thefts in mysuru",
        "how many thefts in bengaluru",
        "how many murders in hubli",
        "how many robberies in belagavi",
        "how many cheating cases in mangaluru",
        "how many theft in dharwad",
        "how many assault in raichur"
    ]

    # Training samples for BREAKDOWN_CRIMES intent (aggregation / group by)
    breakdown_crimes_samples = [
        "crimes by district",
        "show crimes by district",
        "breakdown of crimes by district",
        "crimes per district",
        "district wise crime count",
        "how many crimes in each district",
        "crimes by type",
        "breakdown by crime type",
        "show crimes by category",
        "what are the top crime types",
        "most common crimes",
        "crime types distribution",
        "crimes grouped by type",
        "crimes per crime type",
        "show me crime breakdown",
        "which district has the most crimes",
        "crimes by month",
        "monthly crime breakdown",
        "crime trend over time",
        "crimes month wise",
        "distribution of crimes across districts",
        "compare crimes by district",
        "show crime statistics by type",
        "summarize crimes by district",
        "group crimes by type",
        "crime count per district",
        "breakdown of theft by district",
        "show top crimes by category",
        "give me crime distribution by location",
        "analyze crimes by district"
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
        "restaurant near me",
        "what is your name",
        "can you help me",
        "play music",
        "weather forecast",
        "book a cab",
        "order food",
        "what is the capital of india",
        "tell me about cricket",
        "how old are you",
        "thank you very much"
    ]

    # Combine all samples and labels
    texts = (show_crimes_samples + count_crimes_samples +
             breakdown_crimes_samples + unknown_samples)
    labels = (["SHOW_CRIMES"] * len(show_crimes_samples) +
              ["COUNT_CRIMES"] * len(count_crimes_samples) +
              ["BREAKDOWN_CRIMES"] * len(breakdown_crimes_samples) +
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
            "crimes by district",
            "breakdown of crimes by type",
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