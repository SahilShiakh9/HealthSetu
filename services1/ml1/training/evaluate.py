import os
import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from training.prepare_data import load_and_augment_data

def evaluate():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_path = os.path.join(base_dir, "models", "triage-model.joblib")
    if not os.path.exists(model_path):
        from training.train import train
        train()

    bundle = joblib.load(model_path)
    model = bundle["model"]
    symptom_cols = bundle["symptom_cols"]
    classes = bundle["classes"]
    disease_meta = bundle["disease_meta"]

    df, _, _ = load_and_augment_data()
    X = df[symptom_cols].values
    y = df["disease"].values

    # Probabilities
    probs = model.predict_proba(X)
    top1_preds = model.predict(X)

    # Top-1 accuracy
    top1_acc = np.mean(top1_preds == y)

    # Top-3 accuracy
    top3_correct = 0
    for i, true_label in enumerate(y):
        top3_indices = np.argsort(probs[i])[-3:]
        top3_labels = [classes[idx] for idx in top3_indices]
        if true_label in top3_labels:
            top3_correct += 1
    top3_acc = top3_correct / len(y)

    # High-risk recall: check if true high-risk cases get predicted as high-risk or top-ranked
    high_risk_diseases = {d for d, m in disease_meta.items() if m.get("base_risk") == "HIGH"}
    high_risk_indices = [i for i, label in enumerate(y) if label in high_risk_diseases]

    if high_risk_indices:
        hr_correct = 0
        for idx in high_risk_indices:
            pred_disease = top1_preds[idx]
            # Considered recalled if predicted as high-risk category
            if pred_disease in high_risk_diseases or disease_meta.get(pred_disease, {}).get("base_risk") == "HIGH":
                hr_correct += 1
        high_risk_recall = hr_correct / len(high_risk_indices)
    else:
        high_risk_recall = 1.0

    print("================== EVALUATION REPORT ==================")
    print(f"Top-1 Accuracy:     {top1_acc:.4f}")
    print(f"Top-3 Accuracy:     {top3_acc:.4f}")
    print(f"High-Risk Recall:   {high_risk_recall:.4f}")
    print("=======================================================")

    return {
        "top1_acc": float(top1_acc),
        "top3_acc": float(top3_acc),
        "high_risk_recall": float(high_risk_recall),
    }

if __name__ == "__main__":
    evaluate()
