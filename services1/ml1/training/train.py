import os
import json
import joblib
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import BernoulliNB
from sklearn.metrics import classification_report, accuracy_score
from training.prepare_data import load_and_augment_data

def train():
    df, symptom_cols, meta_cols = load_and_augment_data()

    X = df[symptom_cols].values
    y = df["disease"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    # Train Bernoulli Naive Bayes with Laplace smoothing
    # Provides exact alignment with client-side log-space Laplace Naive Bayes
    nb = BernoulliNB(alpha=1.0)
    nb.fit(X_train, y_train)

    # Evaluate
    y_pred = nb.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"BernoulliNB Accuracy on Noisy Held-Out Set: {acc:.4f}")

    # Build disease metadata mapping dictionary
    disease_meta = {}
    for _, row in df.drop_duplicates(subset=["disease"]).iterrows():
        disease_meta[row["disease"]] = {
            "syndrome": row["syndrome"],
            "specialty": row["specialty"],
            "base_risk": row["base_risk"],
        }

    # Ensure output directory exists
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)

    # Save artifact bundle
    model_artifact = {
        "model": nb,
        "nb_model": nb,
        "symptom_cols": symptom_cols,
        "classes": list(nb.classes_),
        "disease_meta": disease_meta,
        "version": "1.0.0",
        "trained_at": datetime.utcnow().isoformat(),
    }

    joblib_path = os.path.join(models_dir, "triage-model.joblib")
    joblib.dump(model_artifact, joblib_path)
    print(f"Model saved to {joblib_path}")

    # Save model-card.json per Section 11.8
    model_card = {
        "model_name": "HealthSetu Triage Classifier",
        "version": "1.0.0",
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "architecture": "BernoulliNB(alpha=1.0) with Laplace Smoothing",
        "intended_use": "Rural healthcare screening assistance (Decision Support, NOT diagnosis)",
        "metrics": {
            "held_out_accuracy": float(acc),
            "noise_augmented": True,
            "dropout_rates": "20% to 40%",
        },
        "limitations": [
            "Triage support only. Does not replace professional in-person medical diagnosis.",
            "Emergency flags take absolute precedence over model probability.",
        ],
        "is_mock_fixture": True,
    }

    card_path = os.path.join(models_dir, "model-card.json")
    with open(card_path, "w", encoding="utf-8") as f:
        json.dump(model_card, f, indent=2)
    print(f"Model card written to {card_path}")

    return model_artifact

if __name__ == "__main__":
    train()
