from typing import List, Optional
from pydantic import BaseModel, Field

class ConditionProbability(BaseModel):
    name: str
    probability: float = Field(ge=0.0, le=1.0)

class PredictRequest(BaseModel):
    symptoms: List[str]
    age_band: Optional[str] = None
    gender: Optional[str] = None

class PredictResponse(BaseModel):
    top_conditions: List[ConditionProbability]
    risk_tier: str = Field(description="LOW, MEDIUM, or HIGH")
    recommended_specialty: str
    confidence: float = Field(ge=0.0, le=1.0)
    model_version: str

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

class ModelInfoResponse(BaseModel):
    model_version: str
    status: str
    is_mock_fixture: bool
    description: str
    classes: Optional[List[str]] = None
    language_scope: Optional[str] = None
    accuracy: Optional[float] = None
    macro_f1: Optional[float] = None

class CandidateScreeningRequest(BaseModel):
    text: str = Field(min_length=1, description="Free text symptom description")
    language: str = Field(default="en", description="Input language code: en, hi, mr")

class CandidateScreeningResponse(BaseModel):
    status: str = Field(description="URGENT, NEEDS_ASSESSMENT, NOT_ESTABLISHED, or LANGUAGE_UNSUPPORTED")
    possible_category: Optional[str] = None
    matched_signs: List[str] = []
    message: str
    risk_tier: str = Field(default="LOW", description="LOW, MEDIUM, or HIGH")
    recommended_specialty: str = Field(default="General Physician")
    model_version: str
    is_clinical_diagnosis: bool = False
    disclaimer: str

