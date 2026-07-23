"""
Serving layer for the trained offender-risk model.

Loads the RandomForest saved by train_risk_model.py and scores offenders. If the
model file or scikit-learn isn't available (e.g. the slim cloud build), callers
fall back to the deterministic heuristic in insights.py — the app never breaks.
"""
import os
import json
from typing import List, Optional, Dict, Any

_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models")
_MODEL_PATH = os.path.join(_MODEL_DIR, "risk_model.joblib")
_METRICS_PATH = os.path.join(_MODEL_DIR, "risk_model_metrics.json")

_model = None
_metrics: Optional[Dict[str, Any]] = None
_load_attempted = False


def _load():
    global _model, _metrics, _load_attempted
    if _load_attempted:
        return
    _load_attempted = True
    try:
        import joblib  # noqa
        if os.path.isfile(_MODEL_PATH):
            _model = joblib.load(_MODEL_PATH)
        if os.path.isfile(_METRICS_PATH):
            with open(_METRICS_PATH) as f:
                _metrics = json.load(f)
    except Exception:
        _model = None


def is_available() -> bool:
    _load()
    return _model is not None


def get_metrics() -> Optional[Dict[str, Any]]:
    _load()
    return _metrics


def score_batch(vectors: List[List[float]]) -> Optional[List[float]]:
    """Return a 0-100 risk score per feature vector, or None if no model."""
    _load()
    if _model is None or not vectors:
        return None
    try:
        import numpy as np
        proba = _model.predict_proba(np.array(vectors, dtype=float))[:, 1]
        return [round(float(p) * 100, 1) for p in proba]
    except Exception:
        return None
