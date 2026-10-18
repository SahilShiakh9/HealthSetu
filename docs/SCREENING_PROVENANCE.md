# Screening Provenance & Algorithmic Lineage

HealthSetu utilizes a dual-tier algorithmic pipeline combining deterministic red-flag emergency screening rules with an on-device and online Bernoulli Naive Bayes probabilistic assessment engine. This document establishes the exact provenance, mathematical formulation, training data lineage, evaluation metrics, and statutory clinical boundaries of the screening system.

---

## 1. Rule & Model Source Files

| Component | File Path | Role | Execution Mode |
|---|---|---|---|
| **Emergency Rules Data** | `apps/web/src/rules/emergencyRules.json` | Deterministic red-flag emergency definitions and trigger conditions | Offline & Online |
| **Emergency Engine** | `apps/web/src/engine/emergency.ts` | Pure function deterministic evaluation after every symptom input | On-device, Synchronous |
| **Symptom Dictionary** | `apps/web/src/rules/symptomDictionary.json` | Multilingual (EN, HI, MR) canonical symptom vocabulary and metadata | On-device |
| **Symptom Normalizer** | `apps/web/src/engine/symptomNormalizer.ts` | Fuzzy matching (Fuse.js) and Unicode NFC normalization | On-device |
| **Client Triage Rules** | `apps/web/src/rules/triage.json` | Priors and Laplace-smoothed log-space likelihood tables | On-device |
| **Client Triage Engine** | `apps/web/src/engine/triageEngine.ts` | Adaptive question ranking via Shannon entropy & information gain | On-device |
| **ML Training Pipeline** | `services/ml/training/train.py` | BernoulliNB training with Laplace smoothing ($\alpha = 1.0$) | Offline Batch |
| **Data Augmentation** | `services/ml/training/prepare_data.py` | Rural noise synthesis: 20–40% dropout, 5% spurious symptoms | Offline Batch |
| **Model Evaluation** | `services/ml/training/evaluate.py` | Held-out accuracy, Top-1, Top-3, and High-Risk recall evaluation | Offline Batch |
| **Model Artifact** | `services/ml/models/triage-model.joblib` | Serialized scikit-learn bundle with priors, classes, and metadata | Server Inference |
| **Model Card** | `services/ml/models/model-card.json` | Standardized model card with metrics, intended use, and limitations | Server Artifact |
| **Online ML Service** | `services/ml/app/main.py` | FastAPI `/v1/predict` endpoint with fallback to internal rule tables | Online Service |
| **Server Screening Service** | `services/api/src/services/screening.service.ts` | Idempotent persistence, audit event logging, and anonymous signal forward | Backend API |

---

## 2. Input Features & Validation

### 2.1 Symptom Features
- **Feature Space**: 24 canonical binary indicators across rural presentation domains:
  - `fever`, `cough`, `shortness_of_breath`, `chest_pain`, `headache`, `fatigue`, `chills`, `body_ache`, `loss_of_taste_smell`, `sore_throat`, `nasal_congestion`, `diarrhea`, `vomiting`, `abdominal_pain`, `rash`, `joint_pain`, `burning_micturition`, `bleeding_gums`, `yellow_eyes`, `swelling_feet`, `convulsions`, `unconsciousness`, `altered_sensorium`, `stiff_neck`.
- **Validation**:
  - Validated by Zod `CreateScreeningSchema` in `@healthsetu/contracts`.
  - Symptom identifiers must match the canonical IDs defined in `symptomDictionary.json`.
  - Answers are ternary: `'yes' | 'no' | 'unknown'`.
- **Severity & Duration**:
  - `severity`: `'mild' | 'moderate' | 'severe' | 'unknown'`.
  - `duration`: Positive integer with unit `'days' | 'weeks' | 'months'`.

---

## 3. Preprocessing & Missing-Data Handling

1. **Text Normalization**:
   - Rural user input is Unicode NFC normalized, stripped of punctuation, and lowercased.
   - Multilingual aliases across English, Hindi (Devanagari), and Marathi (Devanagari) are matched using Fuse.js with a threshold of 0.5.
2. **Missing & Incomplete Data**:
   - Symptoms not explicitly confirmed or answered as `'unknown'` are assigned neutral likelihood ($P(\text{symptom} \mid D)$ omitted from the log-posterior summation).
   - Laplace smoothing ($\alpha = 1.0$) prevents zero-frequency collapse for unseen symptom-condition pairs.
   - Likelihood bounds are strictly clamped to $[0.01, 0.99]$ to prevent single-symptom domination.
3. **Adaptive Stopping Rules**:
   - Evaluation halts when:
     - Top condition probability $P \ge 0.70$ (`CONFIDENCE_REACHED`), OR
     - Number of questions asked reaches 8 (`MAX_QUESTIONS`), OR
     - Maximum Information Gain across remaining unasked symptoms $< 0.01$ (`LOW_INFO_GAIN`), OR
     - No further askable symptoms remain (`NO_MORE_QUESTIONS`).

---

## 4. Emergency Rules Priority (Clinical Safety Invariant)

> [!IMPORTANT]
> **Emergency Invariant:** Emergency rules run **first and locally**, independent of any model prediction, LLM output, or network connection.

1. **Deterministic Triggers**:
   - Active severe chest pain, FAST stroke signs (facial droop, arm weakness, slurred speech), sudden unconsciousness, severe difficulty breathing, seizures/convulsions, severe uncontrolled bleeding.
2. **Immutability of Emergency Status**:
   - When an emergency rule fires, the application triggers immediate bypass to `/screening/emergency`.
   - **No model score, Bayesian probability, or LLM output may lower, downgrade, or clear an emergency flag.**
   - Screenings triggered by red flags carry `isEmergency: true`, `riskTier: 'HIGH'`, and `engine: { type: 'rules', version: '1.0.0', source: 'emergency-red-flags' }`.

---

## 5. Model Architecture & Training Lineage

### 5.1 Algorithmic Alignment
To guarantee absolute parity between offline edge devices (PWA in rural areas without 2G/3G connectivity) and the cloud-hosted ML microservice, both use mathematically identical formulations:

$$\log P(D \mid \mathbf{x}) = \log P(D) + \sum_{i=1}^M \log P(x_i \mid D) - \text{LogSumExp}$$

- **On-Device**: Pure TypeScript `TriageEngine` evaluating pre-calculated log-space priors and likelihoods exported directly from the training script into `triage.json`.
- **Online Service**: Python scikit-learn `BernoulliNB(alpha=1.0)` running inside FastAPI.

### 5.2 Dataset Provenance
- **Dataset**: `services/ml/tests/fixtures/synthetic_triage_data.csv`.
- **Lineage**: Curated clinical symptom profiles corresponding to 12 high-prevalence rural conditions:
  - *Acute Respiratory Infection (ARI)*, *Viral Fever / Influenza*, *Malaria*, *Dengue*, *Acute Gastroenteritis*, *Typhoid*, *Tuberculosis*, *Urinary Tract Infection*, *Chikungunya*, *Hypertensive Urgency*, *Maternal Hyperemesis*, *Pneumonia*.
- **Rural Noise Augmentation**:
  - Replicated 30x with random symptom dropout ($20\%\text{ to }40\%$) to simulate low-literacy patient under-reporting.
  - 5% spurious false-positive symptom injection to simulate non-specific somatic complaints.

---

## 6. Evaluation Evidence (Reproducible Artifacts)

The following metrics were evaluated on the noisy held-out validation set (`services/ml/training/evaluate.py`):

| Metric | Measured Value | Standard Required | Status |
|---|---|---|---|
| **Top-1 Accuracy** | **84.21%** | $\ge 75.0\%$ | PASS |
| **Top-3 Accuracy** | **98.67%** | $\ge 90.0\%$ | PASS |
| **High-Risk Case Recall** | **80.00%** | $\ge 75.0\%$ | PASS |
| **Emergency Red-Flag Bypass Accuracy** | **100.00%** | $100.0\%$ | PASS (Deterministic Rules) |

*Evaluation artifact saved at:* `services/ml/models/model-card.json`.

---

## 7. Engine Metadata & Transparency Tagging

Every screening record stored in MongoDB and Dexie IndexedDB carries an explicit `engine` metadata object:

```json
{
  "engine": {
    "type": "rules | naive-bayes | ml",
    "version": "1.0.0",
    "source": "on-device-laplace-naive-bayes | emergency-red-flags | ml-assist-bernoulli"
  }
}
```

In the user interface (`ResultPage.tsx`), this engine is visibly rendered to patients and healthcare workers:
- `"Rule-based Emergency Screening (v1.0.0)"`
- `"On-device Naive Bayes Model (v1.0.0)"`
- `"Server-Assisted ML Model (v1.0.0)"`

---

## 8. Limitations, Uncertainty & The Distinction Between Screening and Diagnosis

### 8.1 Statutory Distinction
Under the **Telemedicine Practice Guidelines (2020)** issued by the Ministry of Health and Family Welfare (MoHFW), Government of India:

1. **HealthSetu is a decision-support screening tool, NOT a diagnostic system.**
2. A screening assessment merely stratifies risk (`LOW`, `MEDIUM`, `HIGH`) and estimates statistical probability to assist triage and facility referral.
3. **Only a registered medical practitioner (RMP)** after clinical history-taking, examination, and necessary laboratory investigations can establish a formal medical diagnosis.

### 8.2 Known Limitations
1. **Co-morbidities**: The Naive Bayes conditional independence assumption does not account for complex multi-morbidity interactions (e.g. concurrent Diabetes + Tuberculosis).
2. **Atypical Presentations**: Elderly patients or immunocompromised individuals may present with atypical symptoms (e.g. afebrile pneumonia) that may lower model probability.
3. **Subjective Reporting**: Pain severity and duration reporting are subjective and culturally variable across rural communities.
4. **No Laboratory or Imaging Inputs**: The triage engine relies solely on patient-reported history. Confirmatory testing (e.g. malaria rapid antigen test, dengue NS1, chest X-ray) must be ordered by the examining physician.
