"""
Train the offender recidivism-risk model.

A RandomForest classifier predicts whether an offender is a REPEAT offender
(accused in 2+ cases) from demographic, socio-economic, gang and offence-severity
features. Reports ROC-AUC + accuracy on a held-out test split and saves the model
plus a metrics JSON so the API/UI can display the score's provenance.

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
MODEL_PATH = os.path.join(MODEL_DIR, "risk_model.joblib")
METRICS_PATH = os.path.join(MODEL_DIR, "risk_model_metrics.json")


def main():
    try:
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import roc_auc_score, accuracy_score
        import joblib
    except ImportError:
        print("scikit-learn / joblib not installed. Run: pip install -r requirements-ml.txt")
        return

    os.makedirs(MODEL_DIR, exist_ok=True)
    db = SessionLocal()
    try:
        X, y, _ = build_training_data(db, current_year=date.today().year)
    finally:
        db.close()

    if len(X) < 40 or len(set(y)) < 2:
        print(f"Not enough labelled data to train (n={len(X)}, classes={set(y)}). Seed the DB first.")
        return

    X = np.array(X, dtype=float)
    y = np.array(y, dtype=int)
    print(f"Training on {len(X)} offenders · repeat rate = {y.mean():.1%}")

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    clf = RandomForestClassifier(n_estimators=200, max_depth=6, min_samples_leaf=5,
                                 class_weight="balanced", random_state=42)
    clf.fit(X_tr, y_tr)

    proba = clf.predict_proba(X_te)[:, 1]
    preds = (proba >= 0.5).astype(int)
    auc = float(roc_auc_score(y_te, proba))
    acc = float(accuracy_score(y_te, preds))

    importances = sorted(
        [{"feature": f, "importance": round(float(i), 4)}
         for f, i in zip(FEATURE_NAMES, clf.feature_importances_)],
        key=lambda d: d["importance"], reverse=True,
    )

    joblib.dump(clf, MODEL_PATH)
    metrics = {
        "model": "RandomForestClassifier",
        "target": "repeat offender (accused in 2+ cases)",
        "features": FEATURE_NAMES,
        "n_samples": int(len(X)),
        "test_size": int(len(X_te)),
        "repeat_rate": round(float(y.mean()), 3),
        "roc_auc": round(auc, 3),
        "accuracy": round(acc, 3),
        "feature_importances": importances,
        "trained_on": "synthetic seeded dataset",
        "trained_at": date.today().isoformat(),
    }
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print("=" * 56)
    print(f"  ROC-AUC : {auc:.3f}")
    print(f"  Accuracy: {acc:.3f}")
    print("  Top features:")
    for fi in importances[:5]:
        print(f"    {fi['feature']:16} {fi['importance']:.3f}")
    print("=" * 56)
    print(f"[DONE] Saved model -> {MODEL_PATH}")
    print(f"[DONE] Saved metrics -> {METRICS_PATH}")


if __name__ == "__main__":
    main()
