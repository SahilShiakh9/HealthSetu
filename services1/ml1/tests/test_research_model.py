from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
INTERNAL_KEY = "dev_internal_secret_key_between_api_and_ml_service"

def test_research_model_info():
    response = client.get(
        "/v1/model/info",
        headers={"x-internal-key": INTERNAL_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ACTIVE"
    assert "classes" in data
    assert len(data["classes"]) == 24
    assert "English only" in (data.get("language_scope") or "")

def test_screen_candidate_urgent_warning_sign():
    response = client.post(
        "/v1/screen/candidate",
        json={"text": "I have sudden severe chest pain and cannot breathe", "language": "en"},
        headers={"x-internal-key": INTERNAL_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "URGENT"
    assert "chest_pain" in data["matched_signs"]
    assert data["risk_tier"] == "HIGH"
    assert data["is_clinical_diagnosis"] is False

def test_screen_candidate_english_symptom():
    response = client.post(
        "/v1/screen/candidate",
        json={"text": "I have joint swelling and morning stiffness in fingers", "language": "en"},
        headers={"x-internal-key": INTERNAL_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "NOT_ESTABLISHED"
    assert data["possible_category"] is not None
    assert data["is_clinical_diagnosis"] is False
    assert "Model-generated candidate only" in data["message"]

def test_screen_candidate_language_boundary():
    # Hindi text must not produce a misleading English diagnosis label
    response = client.post(
        "/v1/screen/candidate",
        json={"text": "मुझे दो दिन से बुखार और सिरदर्द है", "language": "hi"},
        headers={"x-internal-key": INTERNAL_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "LANGUAGE_UNSUPPORTED"
    assert data["possible_category"] is None
    assert "evaluated for English only" in data["message"]

def test_screen_candidate_negation():
    response = client.post(
        "/v1/screen/candidate",
        json={"text": "I do not have fever but feeling sick", "language": "en"},
        headers={"x-internal-key": INTERNAL_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "NEEDS_ASSESSMENT"
    assert data["possible_category"] is None
