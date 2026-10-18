import os
import sys
import re
import joblib
import numpy as np
from fastapi import FastAPI, Header, HTTPException, status
from app.schemas import (
    HealthResponse,
    ModelInfoResponse,
    PredictRequest,
    PredictResponse,
    ConditionProbability,
    CandidateScreeningRequest,
    CandidateScreeningResponse,
)

INTERNAL_KEY = os.getenv("ML_INTERNAL_KEY", "dev_internal_secret_key_between_api_and_ml_service")
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.getenv("MODEL_PATH", os.path.join(_BASE_DIR, "models", "triage-model.joblib"))

# Resolve research ML deliverables path
_CANDIDATE_DELIVERABLE_DIRS = [
    os.getenv("ML_MODEL_DIR", ""),
    os.path.abspath(os.path.join(_BASE_DIR, "..", "..", "SWASTHYASETU_AL_ML_Deliverables1")),
    os.path.abspath(os.path.join(_BASE_DIR, "..", "..", "SWASTHYASETU_AI_ML_Deliverables", "SWASTHYASETU_AI_ML_Deliverables")),
    os.path.abspath(os.path.join(_BASE_DIR, "..", "SWASTHYASETU_AI_ML_Deliverables", "SWASTHYASETU_AI_ML_Deliverables")),
    os.path.abspath(os.path.join(os.getcwd(), "SWASTHYASETU_AI_ML_Deliverables", "SWASTHYASETU_AI_ML_Deliverables")),
]

RESEARCH_MODEL_DIR = None
for d in _CANDIDATE_DELIVERABLE_DIRS:
    if d and os.path.isdir(d):
        RESEARCH_MODEL_DIR = d
        break

if RESEARCH_MODEL_DIR and RESEARCH_MODEL_DIR not in sys.path:
    sys.path.insert(0, RESEARCH_MODEL_DIR)

app = FastAPI(
    title="HealthSetu ML Service",
    description="Offline-calibrated disease screening & research LinearSVC inference service",
    version="1.0.0",
)

research_pipeline = None
research_model_info = {}
model_bundle = None

DISEASE_METADATA = {
    'Acne': {'specialty': 'Dermatology', 'base_risk': 'LOW'},
    'Arthritis': {'specialty': 'Orthopedics', 'base_risk': 'LOW'},
    'Bronchial Asthma': {'specialty': 'Pulmonology', 'base_risk': 'MEDIUM'},
    'Cervical spondylosis': {'specialty': 'Orthopedics', 'base_risk': 'LOW'},
    'Chicken pox': {'specialty': 'General Physician', 'base_risk': 'MEDIUM'},
    'Common Cold': {'specialty': 'General Physician', 'base_risk': 'LOW'},
    'Dengue': {'specialty': 'Infectious Disease', 'base_risk': 'HIGH'},
    'Dimorphic Hemorrhoids': {'specialty': 'General Surgery', 'base_risk': 'LOW'},
    'Fungal infection': {'specialty': 'Dermatology', 'base_risk': 'LOW'},
    'Hypertension': {'specialty': 'Cardiology', 'base_risk': 'MEDIUM'},
    'Impetigo': {'specialty': 'Dermatology', 'base_risk': 'LOW'},
    'Jaundice': {'specialty': 'Gastroenterology', 'base_risk': 'MEDIUM'},
    'Malaria': {'specialty': 'General Physician', 'base_risk': 'MEDIUM'},
    'Migraine': {'specialty': 'Neurology', 'base_risk': 'LOW'},
    'Pneumonia': {'specialty': 'Pulmonology', 'base_risk': 'HIGH'},
    'Psoriasis': {'specialty': 'Dermatology', 'base_risk': 'LOW'},
    'Typhoid': {'specialty': 'General Physician', 'base_risk': 'MEDIUM'},
    'Varicose Veins': {'specialty': 'Vascular Surgery', 'base_risk': 'LOW'},
    'allergy': {'specialty': 'General Physician', 'base_risk': 'LOW'},
    'diabetes': {'specialty': 'Endocrinology', 'base_risk': 'MEDIUM'},
    'drug reaction': {'specialty': 'Emergency Medicine', 'base_risk': 'HIGH'},
    'gastroesophageal reflux disease': {'specialty': 'Gastroenterology', 'base_risk': 'LOW'},
    'peptic ulcer disease': {'specialty': 'Gastroenterology', 'base_risk': 'MEDIUM'},
    'urinary tract infection': {'specialty': 'Urology', 'base_risk': 'LOW'},
}

# Try importing research modules
try:
    from urgency_baseline import assess_warning_signs
    from english_screening import screen_patient_english
except Exception:
    WARNING_SIGNS = {
        'chest_pain': ['chest pain', 'pain in my chest', 'chest tightness', 'सीने में दर्द', 'छाती में दर्द'],
        'severe_breathing_difficulty': ['severe breathing difficulty', 'difficulty breathing', 'cannot breathe', "can't breathe", 'shortness of breath', 'सांस लेने में बहुत परेशानी', 'सांस नहीं ले पा रहा'],
        'stroke_signs': ['face drooping', 'arm weakness', 'sudden speech difficulty', 'cannot speak clearly', "can't speak clearly", 'slurred speech', 'चेहरा टेढ़ा', 'हाथ में अचानक कमजोरी'],
        'unconsciousness': ['unconscious', 'passed out', 'lost consciousness', 'बेहोश', 'होश खो दिया'],
        'sudden_severe_headache': ['sudden severe headache', 'worst headache of my life', 'अचानक बहुत तेज सिरदर्द'],
        'blue_lips': ['lips turning blue', 'my lips are turning blue', 'blue lips', 'bluish lips']
    }
    NEGATION_PATTERNS = ['\\bno\\b', '\\bnot\\b', '\\bnever\\b', '\\bwithout\\b', '\\bdo not\\b', "\\bdon't\\b", "\\bdoesn't\\b", '\\bdenies\\b', '\\bdenied\\b', 'नहीं', 'नही', 'नहीं है', 'नहीं हो रही']

    def assess_warning_signs(text):
        if not isinstance(text, str) or not text.strip():
            return {"status": "NEEDS_ASSESSMENT", "matched_signs": [], "message": "Information is incomplete; ask follow-up questions."}
        normalized = text.casefold()
        matched = []
        negated = []
        for sign, phrases in WARNING_SIGNS.items():
            for phrase in phrases:
                phrase_lower = phrase.casefold()
                start = normalized.find(phrase_lower)
                if start == -1:
                    continue
                context = normalized[max(0, start - 35):start + len(phrase_lower) + 15]
                if any(re.search(pattern, context) for pattern in NEGATION_PATTERNS):
                    negated.append(sign)
                else:
                    matched.append(sign)
                break
        if matched:
            return {"status": "URGENT", "matched_signs": sorted(set(matched)), "message": "Possible emergency warning sign detected. Seek urgent medical assessment."}
        if negated:
            return {"status": "NEEDS_ASSESSMENT", "matched_signs": sorted(set(negated)), "message": "A warning sign may have been negated. Confirm symptoms with a follow-up question."}
        return {"status": "NEEDS_ASSESSMENT", "matched_signs": [], "message": "No listed phrase detected. This does not rule out an emergency."}

    def screen_patient_english(text, model):
        if not isinstance(text, str) or len(text.strip()) < 3:
            return {"status": "NEEDS_ASSESSMENT", "possible_category": None, "matched_signs": [], "message": "Please describe your symptoms."}
        warning = assess_warning_signs(text)
        if warning["status"] == "URGENT":
            return {"status": "URGENT", "possible_category": None, "matched_signs": warning["matched_signs"], "message": warning["message"]}
        if model is None:
            return {"status": "NEEDS_ASSESSMENT", "possible_category": None, "matched_signs": [], "message": "Model not loaded."}
        prediction = model.predict([text])[0]
        return {
            "status": "NOT_ESTABLISHED",
            "possible_category": str(prediction),
            "matched_signs": warning.get("matched_signs", []),
            "message": "Model-generated candidate only; this is not a diagnosis. Further assessment is required."
        }


def get_research_model():
    global research_pipeline, research_model_info
    if research_pipeline is not None:
        return research_pipeline

    if RESEARCH_MODEL_DIR:
        candidate_files = [
            "disease_classifier_clean_grouped.joblib",
            "disease_classifier_baseline_v2.joblib",
            "disease_classifier.joblib",
        ]
        for cfile in candidate_files:
            target = os.path.join(RESEARCH_MODEL_DIR, cfile)
            if os.path.exists(target):
                try:
                    pipeline = joblib.load(target)
                    research_pipeline = pipeline
                    research_model_info = {
                        "loaded": True,
                        "artifact_file": cfile,
                        "artifact_dir": RESEARCH_MODEL_DIR,
                        "version": "research-linearsvc-tfidf-clean-grouped-v1",
                        "classes": list(getattr(pipeline, "classes_", [])),
                        "language_scope": "English only. Non-English diagnostic classification is not clinically validated.",
                        "accuracy": 0.9870,
                        "macro_f1": 0.9867,
                        "description": "TF-IDF word n-grams + LinearSVC classifier trained on deduplicated Symptom2Disease (24 labels). Research prototype only."
                    }
                    print(f"Successfully loaded research model from {target}")
                    break
                except Exception as e:
                    print(f"Failed to load research model from {target}: {e}")

    return research_pipeline


def get_model_bundle():
    global model_bundle
    if model_bundle is None:
        if os.path.exists(MODEL_PATH):
            try:
                model_bundle = joblib.load(MODEL_PATH)
            except Exception as e:
                print(f"Failed to load model from {MODEL_PATH}: {e}")
        if model_bundle is None:
            from training.train import train
            model_bundle = train()
    return model_bundle


def verify_internal_key(x_internal_key: str = Header(...)):
    if x_internal_key != INTERNAL_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal authorization key",
        )
    return x_internal_key


@app.get("/v1/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(
        status="ok",
        service="healthsetu-ml",
        version="1.0.0",
    )


@app.get("/v1/model/info", response_model=ModelInfoResponse)
def get_model_info(x_internal_key: str = Header(...)):
    verify_internal_key(x_internal_key)
    res_model = get_research_model()
    if res_model is not None and research_model_info.get("loaded"):
        return ModelInfoResponse(
            model_version=research_model_info["version"],
            status="ACTIVE",
            is_mock_fixture=False,
            description=research_model_info["description"],
            classes=research_model_info.get("classes"),
            language_scope=research_model_info.get("language_scope"),
            accuracy=research_model_info.get("accuracy"),
            macro_f1=research_model_info.get("macro_f1"),
        )

    bundle = get_model_bundle()
    return ModelInfoResponse(
        model_version=bundle.get("version", "1.0.0"),
        status="ACTIVE",
        is_mock_fixture=True,
        description="CalibratedClassifierCV trained on symptom-disease dataset with noise augmentation.",
        classes=list(bundle.get("classes", [])),
    )


@app.post("/v1/screen/candidate", response_model=CandidateScreeningResponse)
def screen_candidate(request: CandidateScreeningRequest, x_internal_key: str = Header(...)):
    verify_internal_key(x_internal_key)
    text = (request.text or "").strip()
    language = (request.language or "en").lower()

    if not text:
        raise HTTPException(status_code=400, detail="Symptom text cannot be empty")

    # Step 1: Warning sign check runs FIRST and independently of classification
    warning = assess_warning_signs(text)
    if warning.get("status") == "URGENT":
        return CandidateScreeningResponse(
            status="URGENT",
            possible_category=None,
            matched_signs=warning.get("matched_signs", []),
            message=warning.get("message", "Possible emergency warning sign detected. Seek urgent medical assessment."),
            risk_tier="HIGH",
            recommended_specialty="Emergency Medicine",
            model_version="research-linearsvc-tfidf-clean-grouped-v1",
            is_clinical_diagnosis=False,
            disclaimer="Emergency detection rule triggered. This is an immediate triage alert, not a final clinical diagnosis.",
        )

    # Step 2: Language boundary enforcement
    # The research LinearSVC classifier was trained and evaluated strictly on English Symptom2Disease descriptions.
    # Non-English inputs must NOT receive an invalid or misleading English disease classification label.
    if language not in ["en", "english"]:
        return CandidateScreeningResponse(
            status="LANGUAGE_UNSUPPORTED",
            possible_category=None,
            matched_signs=warning.get("matched_signs", []),
            message="The research ML classifier is evaluated for English only. Hindi and Marathi candidate disease category is safely withheld to prevent diagnostic error. Please use the adaptive Bayesian triage engine.",
            risk_tier="LOW",
            recommended_specialty="General Physician",
            model_version="research-linearsvc-tfidf-clean-grouped-v1",
            is_clinical_diagnosis=False,
            disclaimer="Language-constrained research model limitation: Marathi and Hindi diagnostic classification is not validated.",
        )

    # Step 3: English screening via research wrapper and LinearSVC pipeline
    res_model = get_research_model()
    if res_model is None:
        raise HTTPException(status_code=503, detail="Research ML model artifact could not be loaded")

    result = screen_patient_english(text, res_model)
    status_code = result.get("status", "NOT_ESTABLISHED")
    candidate = result.get("possible_category")

    meta = DISEASE_METADATA.get(candidate, {
        "specialty": "General Physician",
        "base_risk": "LOW"
    })

    risk_tier = meta["base_risk"]
    specialty = meta["specialty"]

    return CandidateScreeningResponse(
        status=status_code,
        possible_category=candidate,
        matched_signs=result.get("matched_signs", []),
        message=result.get("message", "Model-generated candidate only; this is not a diagnosis."),
        risk_tier=risk_tier,
        recommended_specialty=specialty,
        model_version=research_model_info.get("version", "research-linearsvc-tfidf-clean-grouped-v1"),
        is_clinical_diagnosis=False,
        disclaimer="Research prototype only: candidate category generated by TF-IDF + LinearSVC. Not clinically validated for diagnosis.",
    )


@app.post("/v1/predict", response_model=PredictResponse)
def predict(request: PredictRequest, x_internal_key: str = Header(...)):
    verify_internal_key(x_internal_key)

    input_set = set(request.symptoms)

    # If research model is available, use it for calibrated disease scoring
    res_model = get_research_model()
    if res_model is not None and hasattr(res_model, "decision_function") and hasattr(res_model, "classes_"):
        # Formulate query text from symptoms
        query_text = "Patient experiences " + ", ".join([s.replace("_", " ") for s in request.symptoms])
        df = res_model.decision_function([query_text])[0]
        # Softmax over decision function to provide relative confidence distribution
        exp_df = np.exp(df - np.max(df))
        probs = exp_df / np.sum(exp_df)
        sorted_indices = np.argsort(probs)[::-1]

        classes = res_model.classes_
        top_conditions = []
        for idx in sorted_indices[:3]:
            cls_name = str(classes[idx])
            p = float(probs[idx])
            top_conditions.append(ConditionProbability(name=cls_name, probability=round(p, 4)))

        top_disease = top_conditions[0].name
        confidence = top_conditions[0].probability

        meta = DISEASE_METADATA.get(top_disease, {
            "specialty": "General Physician",
            "base_risk": "LOW",
        })

        risk_tier = meta.get("base_risk", "LOW")
        specialty = meta.get("specialty", "General Physician")

        if "chest_pain" in input_set or "breathing_difficulty" in input_set:
            risk_tier = "HIGH"
            specialty = "Cardiology" if "chest_pain" in input_set else "Pulmonology"

        return PredictResponse(
            top_conditions=top_conditions,
            risk_tier=risk_tier,
            recommended_specialty=specialty,
            confidence=confidence,
            model_version=research_model_info.get("version", "research-linearsvc-tfidf-clean-grouped-v1"),
        )

    # Fallback to calibrated model bundle
    bundle = get_model_bundle()
    model = bundle["model"]
    symptom_cols = bundle["symptom_cols"]
    classes = bundle["classes"]
    disease_meta = bundle["disease_meta"]

    vec = np.zeros(len(symptom_cols), dtype=int)
    for i, col in enumerate(symptom_cols):
        if col in input_set:
            vec[i] = 1

    probs = model.predict_proba([vec])[0]
    sorted_indices = np.argsort(probs)[::-1]

    top_conditions = []
    for idx in sorted_indices[:3]:
        cls_name = classes[idx]
        p = float(probs[idx])
        top_conditions.append(ConditionProbability(name=cls_name, probability=round(p, 4)))

    top_disease = top_conditions[0].name
    confidence = top_conditions[0].probability

    meta = disease_meta.get(top_disease, {
        "specialty": "General Physician",
        "base_risk": "LOW",
    })

    risk_tier = meta.get("base_risk", "LOW")
    specialty = meta.get("specialty", "General Physician")

    if "chest_pain" in input_set or "breathing_difficulty" in input_set:
        risk_tier = "HIGH"
        specialty = "Cardiology" if "chest_pain" in input_set else "Pulmonology"

    return PredictResponse(
        top_conditions=top_conditions,
        risk_tier=risk_tier,
        recommended_specialty=specialty,
        confidence=confidence,
        model_version=bundle.get("version", "1.0.0"),
    )
