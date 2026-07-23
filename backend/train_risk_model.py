"""
Train the offender recidivism-risk model.

A logistic-regression classifier predicts whether an offender is a REPEAT
offender (accused in 2+ cases) from demographic, socio-economic, gang and
offence-severity features. Reports ROC-AUC + accuracy on a held-out split.

The learned weights are exported as PLAIN JSON (means/stds + coefficients), so
SERVING needs no scikit-learn/numpy — it scores in pure Python. This means the
trained model works on the slim Catalyst cloud build too, not just locally.

NOTE: trained on the synthetic seeded dataset — the pipeline is ready to retrain
on real KSP data with no code changes.

Run:  python train_risk_model.py
"""
import os
import sys
import json
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))

from src.database.session import SessionLocal
from src.ml.features import build_training_data, FEATURE_NAMES

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_JSON = os.path.join(MODEL_DIR, "risk_model.json")


def main():
    try:
        import numpy as np
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import roc_auc_score, accuracy_score
    except ImportError:
        print("scikit-learn not installed. Run: pip install -r requirements-ml.txt")
        return

    os.makedirs(MODEL_DIR, exist_ok=True)
    db = SessionLocal()
    try:
        X, y, _ = build_training_data(db, current_year=date.today().year)
    finally:
        db.close()

    if len(X) < 40 or len(set(y)) < 2:
        print(f"Not enough labelled data to train (n={len(X)}, classes={set(y)}).")
        return

    X = np.array(X, dtype=float)
    y = np.array(y, dtype=int)
    print(f"Training on {len(X)} offenders · repeat rate = {y.mean():.1%}")

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler().fit(X_tr)
    clf = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf.fit(scaler.transform(X_tr), y_tr)

    proba = clf.predict_proba(scaler.transform(X_te))[:, 1]
    preds = (proba >= 0.5).astype(int)
    auc = float(roc_auc_score(y_te, proba))
    acc = float(accuracy_score(y_te, preds))

    coef = clf.coef_[0]
    importances = sorted(
        [{"feature": f, "importance": round(abs(float(c)), 4)}
         for f, c in zip(FEATURE_NAMES, coef)],
        key=lambda d: d["importance"], reverse=True,
    )

    model = {
        "model": "LogisticRegression",
        "target": "repeat offender (accused in 2+ cases)",
        "features": FEATURE_NAMES,
        "mean": [round(float(m), 6) for m in scaler.mean_],
        "std": [round(float(s) if s else 1.0, 6) for s in scaler.scale_],
        "coef": [round(float(c), 6) for c in coef],
        "intercept": round(float(clf.intercept_[0]), 6),
        "n_samples": int(len(X)),
        "test_size": int(len(X_te)),
        "repeat_rate": round(float(y.mean()), 3),
        "roc_auc": round(auc, 3),
        "accuracy": round(acc, 3),
        "feature_importances": importances,
        "trained_on": "synthetic seeded dataset",
        "trained_at": date.today().isoformat(),
    }
    with open(MODEL_JSON, "w") as f:
        json.dump(model, f, indent=2)

    print("=" * 56)
    print(f"  ROC-AUC : {auc:.3f}")
    print(f"  Accuracy: {acc:.3f}")
    print("  Top features:")
    for fi in importances[:5]:
        print(f"    {fi['feature']:16} {fi['importance']:.3f}")
    print("=" * 56)
    print(f"[DONE] Saved model -> {MODEL_JSON}")


if __name__ == "__main__":
    main()
