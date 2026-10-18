import re
from urgency_baseline import assess_warning_signs

NEGATION_PATTERN = re.compile(
    r"\b(no|not|never|without|don't|dont|doesn't|"
    r"doesnt|didn't|didnt|denies|denied)\b",
    re.IGNORECASE
)

VAGUE_PHRASES = [
    "i feel unwell",
    "i feel strange",
    "i cannot describe my symptoms",
    "i can't describe my symptoms",
    "i feel sick",
    "not sure"
]

def screen_patient_english(text, model):
    if not isinstance(text, str) or len(text.strip()) < 3:
        return {
            "status": "NEEDS_ASSESSMENT",
            "possible_category": None,
            "matched_signs": [],
            "message": "Please describe your symptoms."
        }

    text = text.strip()

    # Warning-sign check always comes before classification.
    warning = assess_warning_signs(text)
    if warning["status"] == "URGENT":
        return {
            "status": "URGENT",
            "possible_category": None,
            "matched_signs": warning["matched_signs"],
            "message": warning["message"]
        }

    normalized = text.lower()

    if NEGATION_PATTERN.search(normalized):
        return {
            "status": "NEEDS_ASSESSMENT",
            "possible_category": None,
            "matched_signs": warning.get("matched_signs", []),
            "message": (
                "Please clarify which symptoms are currently present. "
                "No disease category was assigned."
            )
        }

    if any(phrase in normalized for phrase in VAGUE_PHRASES):
        return {
            "status": "NEEDS_ASSESSMENT",
            "possible_category": None,
            "matched_signs": warning.get("matched_signs", []),
            "message": (
                "Please provide more specific symptom information. "
                "No disease category was assigned."
            )
        }

    prediction = model.predict([text])[0]

    return {
        "status": "NOT_ESTABLISHED",
        "possible_category": str(prediction),
        "matched_signs": warning.get("matched_signs", []),
        "message": (
            "Model-generated candidate only; this is not a diagnosis. "
            "Further assessment is required."
        )
    }
