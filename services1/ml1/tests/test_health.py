import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
TEST_KEY = "dev_internal_secret_key_between_api_and_ml_service"

def test_health_endpoint():
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "healthsetu-ml"

def test_model_info_requires_internal_key():
    # Without header
    res_no_auth = client.get("/v1/model/info")
    assert res_no_auth.status_code == 422  # Missing header validation

    # With invalid header
    res_bad_auth = client.get("/v1/model/info", headers={"X-Internal-Key": "wrong_key"})
    assert res_bad_auth.status_code == 401

    # With valid header
    res_ok = client.get("/v1/model/info", headers={"X-Internal-Key": TEST_KEY})
    assert res_ok.status_code == 200
    data = res_ok.json()
    assert isinstance(data["is_mock_fixture"], bool)

def test_predict_endpoint_response_structure():
    payload = {
        "symptoms": ["fever", "cough"],
        "age_band": "21-30",
        "gender": "M",
    }
    response = client.post(
        "/v1/predict",
        json=payload,
        headers={"X-Internal-Key": TEST_KEY},
    )
    assert response.status_code == 200
    data = response.json()
    assert "top_conditions" in data
    assert len(data["top_conditions"]) > 0
    assert data["risk_tier"] in ["LOW", "MEDIUM", "HIGH"]
    assert "recommended_specialty" in data
