"""
Test Kannada query support.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from src.nlp.intent_classifier import IntentClassifier

clf = IntentClassifier(model_path="models/intent_en.joblib")

CASES = [
    ("ಬೆಂಗಳೂರಿನಲ್ಲಿ ಅಪರಾಧಗಳನ್ನು ತೋರಿಸಿ", "show crimes in bengaluru"),
    ("ಮೈಸೂರಿನಲ್ಲಿ ಎಷ್ಟು ಕಳ್ಳತನಗಳು", "how many thefts in mysuru"),
    ("ಬೆಳಗಾವಿಯಲ್ಲಿ ಕೊಲೆಗಳನ್ನು ತೋರಿಸಿ", "show murders in belagavi"),
    ("ಜಿಲ್ಲೆವಾರು ಅಪರಾಧಗಳು", "crimes by district"),
    ("ಹುಬ್ಬಳ್ಳಿಯಲ್ಲಿ ದರೋಡೆ ಪ್ರಕರಣಗಳು", "robbery in hubli"),
]

print("=" * 60)
for kn, desc in CASES:
    result = clf.get_intent_and_entities(kn, language="kn")
    print(f"KN  : {kn}")
    print(f"  -> normalized: {result.get('normalized_query')}")
    print(f"  -> intent    : {result['intent']} (conf={result['confidence']:.2f})")
    print(f"  -> entities  : {result['entities']}")
    print("-" * 60)
