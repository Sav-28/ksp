"""
Serving layer for the trained offender-risk model.

Loads the logistic-regression weights exported by train_risk_model.py (plain
JSON) and scores offenders in PURE PYTHON — no scikit-learn / numpy / joblib
needed at runtime. This means the trained model is active everywhere, including
the slim Catalyst cloud build. If the weights file is missing, callers fall back
to the deterministic heuristic in insights.py.
"""
import os
import json
import math
from typing import List, Optional, Dict, Any

_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models")
_MODEL_JSON = os.path.join(_MODEL_DIR, "risk_model.json")

_weights: Optional[Dict[str, Any]] = None
_load_attempted = False


def _load():
    global _weights, _load_attempted
    if _load_attempted:
        return
    _load_attempted = True
    try:
        if os.path.isfile(_MODEL_JSON):
            with open(_MODEL_JSON) as f:
                data = json.load(f)
            if data.get("coef") and data.get("mean") and data.get("std"):
                _weights = data
    except Exception:
        _weights = None


def is_available() -> bool:
    _load()
    return _weights is not None


def get_metrics() -> Optional[Dict[str, Any]]:
    """Public metrics (weights omitted) for the /api/model/metrics endpoint."""
    _load()
    if not _weights:
        return None
    return {k: v for k, v in _weights.items() if k not in ("mean", "std", "coef", "intercept")}


def score_batch(vectors: List[List[float]]) -> Optional[List[float]]:
    """Return a 0-100 risk score per feature vector (pure-Python logistic), or
    None if no model is loaded."""
    _load()
    if _weights is None or not vectors:
        return None
    mean = _weights["mean"]
    std = _weights["std"]
    coef = _weights["coef"]
    intercept = _weights["intercept"]
    out = []
    for v in vectors:
        logit = intercept
        for i, x in enumerate(v):
            if i >= len(coef):
                break
            z = (x - mean[i]) / (std[i] or 1.0)
            logit += coef[i] * z
        # Numerically stable sigmoid.
        p = 1.0 / (1.0 + math.exp(-max(min(logit, 60.0), -60.0)))
        out.append(round(p * 100, 1))
    return out
