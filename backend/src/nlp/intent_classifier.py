import re
import json
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from typing import Dict, Any, Tuple
import os

class IntentClassifier:
    def __init__(self, model_path: str = "models/intent_en.joblib"):
        """
        Initialize the intent classifier.

        Args:
            model_path: Path to the saved model file
        """
        self.model_path = model_path
        self.vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words='english',
            ngram_range=(1, 2),
            max_features=5000
        )
        self.classifier = LogisticRegression(
            random_state=42,
            max_iter=1000
        )
        self.is_trained = False

        # Try to load existing model
        self._load_model()

    def _load_model(self) -> None:
        """Load a pre-trained model if it exists."""
        if os.path.exists(self.model_path):
            try:
                model_data = joblib.load(self.model_path)
                self.vectorizer = model_data['vectorizer']
                self.classifier = model_data['classifier']
                self.is_trained = True
            except Exception as e:
                print(f"Warning: Could not load model from {self.model_path}: {e}")
                self.is_trained = False

    def train(self, X: list, y: list) -> None:
        """
        Train the intent classifier.

        Args:
            X: List of text samples
            y: List of intent labels
        """
        # Vectorize the text
        X_vec = self.vectorizer.fit_transform(X)

        # Train the classifier
        self.classifier.fit(X_vec, y)
        self.is_trained = True

        # Save the model
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump({
            'vectorizer': self.vectorizer,
            'classifier': self.classifier
        }, self.model_path)

    def predict(self, text: str) -> Tuple[str, float]:
        """
        Predict the intent for a given text.

        Args:
            text: Input text to classify

        Returns:
            Tuple of (intent, confidence)
        """
        if not self.is_trained:
            return "UNKNOWN", 0.0

        # Preprocess text
        text_clean = self._preprocess_text(text)

        # Vectorize and predict
        text_vec = self.vectorizer.transform([text_clean])
        intent = self.classifier.predict(text_vec)[0]

        # Get confidence score
        confidence = max(self.classifier.predict_proba(text_vec)[0])

        return intent, float(confidence)

    def get_intent_and_entities(self, text: str) -> Dict[str, Any]:
        """
        Get intent and entities for a given text.
        For Phase 2, entities are empty as entity extraction comes later.

        Args:
            text: Input text

        Returns:
            Dictionary with intent, confidence, and entities
        """
        intent, confidence = self.predict(text)

        # Apply confidence threshold
        if confidence < 0.3:
            intent = "UNKNOWN"

        return {
            "intent": intent,
            "confidence": confidence,
            "entities": {}  # Entity extraction to be implemented in later phases
        }

    def _preprocess_text(self, text: str) -> str:
        """
        Basic text preprocessing: lowercase, remove extra punctuation.

        Args:
            text: Input text

        Returns:
            Preprocessed text
        """
        # Convert to lowercase
        text = text.lower()

        # Remove extra punctuation but keep basic ones
        text = re.sub(r'[^\w\s\?\.\,]', '', text)

        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        return text

# For backward compatibility and ease of use
nlp_service = IntentClassifier()