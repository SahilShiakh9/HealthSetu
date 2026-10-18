import os
import json
import joblib
import numpy as np

def export_triage_json(target_path: str = None):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    repo_dir = os.path.dirname(os.path.dirname(base_dir))
    if target_path is None:
        target_path = os.path.join(repo_dir, "apps", "web", "src", "rules", "triage.json")

    model_path = os.path.join(base_dir, "models", "triage-model.joblib")
    if not os.path.exists(model_path):
        from training.train import train
        train()

    bundle = joblib.load(model_path)
    nb = bundle["nb_model"]
    symptom_cols = bundle["symptom_cols"]
    classes = bundle["classes"]
    disease_meta = bundle["disease_meta"]

    # Existing question text templates
    existing_questions = {}
    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
                existing_questions = existing.get("questions", {})
        except Exception:
            pass

    # Extract log priors and feature log prob from Naive Bayes
    priors = {}
    total_samples = np.sum(nb.class_count_)
    for i, cls in enumerate(nb.classes_):
        priors[cls] = round(float(nb.class_count_[i] / total_samples), 4)

    # Feature probabilities: P(feature | class) = exp(feature_log_prob_)
    likelihoods = {}
    for i, cls in enumerate(nb.classes_):
        probs = np.exp(nb.feature_log_prob_[i])
        likelihoods[cls] = {}
        for j, sym in enumerate(symptom_cols):
            likelihoods[cls][sym] = round(float(probs[j]), 4)

    triage_data = {
        "version": "1.0.0",
        "reviewStatus": "draft",
        "needsClinicalReview": True,
        "diseases": list(classes),
        "priors": priors,
        "likelihoods": likelihoods,
        "diseaseMeta": disease_meta,
        "questions": existing_questions,
        "config": {
            "maxQuestions": 8,
            "stopConfidence": 0.7,
            "minInfoGain": 0.01,
        },
    }

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(triage_data, f, indent=2)

    print(f"Exported triage configuration to {target_path}")

if __name__ == "__main__":
    export_triage_json()
