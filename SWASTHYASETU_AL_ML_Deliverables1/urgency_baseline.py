import re
WARNING_SIGNS = {'chest_pain': ['chest pain', 'pain in my chest', 'chest tightness', 'सीने में दर्द', 'छाती में दर्द'], 'severe_breathing_difficulty': ['severe breathing difficulty', 'difficulty breathing', 'cannot breathe', "can't breathe", 'shortness of breath', 'सांस लेने में बहुत परेशानी', 'सांस नहीं ले पा रहा', 'साँस लेने में परेशानी', 'cant breathe', 'cant brethe', 'trouble breathing', 'having trouble breathing', 'i might be having trouble breathing'], 'stroke_signs': ['face drooping', 'arm weakness', 'sudden speech difficulty', 'cannot speak clearly', "can't speak clearly", 'slurred speech', 'suddenly cannot speak', 'चेहरा टेढ़ा', 'हाथ में अचानक कमजोरी', 'अचानक बोलने में परेशानी', 'अचानक बोल नहीं पा रहा'], 'unconsciousness': ['unconscious', 'passed out', 'lost consciousness', 'बेहोश', 'होश खो दिया'], 'sudden_severe_headache': ['sudden severe headache', 'worst headache of my life', 'अचानक बहुत तेज सिरदर्द'], 'blue_lips': ['lips turning blue', 'my lips are turning blue', 'blue lips', 'bluish lips']}

NEGATION_PATTERNS = ['\\bno\\b', '\\bnot\\b', '\\bnever\\b', '\\bwithout\\b', '\\bdo not\\b', "\\bdon't\\b", "\\bdoesn't\\b", '\\bdenies\\b', '\\bdenied\\b', 'नहीं', 'नही', 'नहीं है', 'नहीं हो रही']

def assess_warning_signs(text):
    if not isinstance(text, str) or not text.strip():
        return {
            "status": "NEEDS_ASSESSMENT",
            "matched_signs": [],
            "message": "Information is incomplete; ask follow-up questions."
        }

    normalized = text.casefold()
    matched = []
    negated = []

    for sign, phrases in WARNING_SIGNS.items():
        for phrase in phrases:
            phrase_lower = phrase.casefold()
            start = normalized.find(phrase_lower)
            if start == -1:
                continue

            # Inspect nearby text for possible negation.
            context = normalized[max(0, start - 35):start + len(phrase_lower) + 15]
            if any(re.search(pattern, context) for pattern in NEGATION_PATTERNS):
                negated.append(sign)
            else:
                matched.append(sign)
            break

    if matched:
        return {
            "status": "URGENT",
            "matched_signs": sorted(set(matched)),
            "message": "Possible emergency warning sign detected. Seek urgent medical assessment."
        }

    if negated:
        return {
            "status": "NEEDS_ASSESSMENT",
            "matched_signs": sorted(set(negated)),
            "message": "A warning sign may have been negated. Confirm symptoms with a follow-up question."
        }

    return {
        "status": "NEEDS_ASSESSMENT",
        "matched_signs": [],
        "message": "No listed phrase detected. This does not rule out an emergency."
    }
