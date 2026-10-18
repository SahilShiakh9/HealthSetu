from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
INTERNAL_KEY = "dev_internal_secret_key_between_api_and_ml_service"

def test_model_info():
    response = client.get(
        "/v1/model/info",
        headers={"x-internal-key": INTERNAL_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ACTIVE"
    assert isinstance(data["is_mock_fixture"], bool)

def test_predict_unauthorized():
    response = client.post(
        "/v1/predict",
        json={"symptoms": ["fever", "cough"]},
        headers={"x-internal-key": "invalid-key"}
    )
    assert response.status_code == 401

def test_predict_success():
    response = client.post(
        "/v1/predict",
        json={"symptoms": ["fever", "cough", "fatigue"], "duration_days": 3},
        headers={"x-internal-key": INTERNAL_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["top_conditions"]) > 0
    assert "risk_tier" in data
    assert "recommended_specialty" in data
    assert "confidence" in data
