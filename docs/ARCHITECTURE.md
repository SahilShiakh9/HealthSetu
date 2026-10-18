# HealthSetu Architecture

> [!WARNING]
> **LEGAL AND COMPLIANCE NOTICE**:
> This platform implements screening assistance and telemedicine coordination. Before any real-world pilot or deployment in India, all workflows, consent records, teleconsultation procedures, and anonymized signal pipelines MUST undergo legal, ethical, and clinical review under:
> 1. **Digital Personal Data Protection (DPDP) Act, 2023** (India)
> 2. **Telemedicine Practice Guidelines (2020)** issued by the Ministry of Health and Family Welfare (MoHFW) / National Medical Commission (NMC)
> 3. Applicable clinical triage safety and medical device regulations.

---

## 1. System Overview

HealthSetu is an offline-first rural healthcare screening and teleconsultation Progressive Web Application (PWA) designed to operate reliably in low-connectivity rural settings across India.

```
+-------------------------------------------------------------------------+
|                              Vite + React PWA                           |
|  - Offline Shell & Custom Service Worker (Workbox injectManifest)       |
|  - Local Dexie (IndexedDB): Drafts, Cache, Outbox                       |
|  - Local Deterministic Emergency Rules (emergencyRules.json)            |
|  - On-Device Naive Bayes Triage Engine (triageEngine.ts)                 |
|  - Nearby Facility Ranker (Haversine + Bitmask filters)                 |
|  - Guidance Bot (Rules + localized guidance.json)                       |
+-------------------------------------------------------------------------+
        |                          |                          |
   REST (HTTPS)               WebSocket (Socket.IO)     Media WebRTC
        |                          |                  (ZEGOCLOUD UIKit)
        v                          v                          |
+-------------------------------------------------------------+
|               Node.js + Express API Service                 |
|  - JWT Auth + Rotating HttpOnly Refresh Tokens              |
|  - RBAC (PATIENT, ASHA, DOCTOR, PHC_OFFICER, ADMIN)         |
|  - Idempotent Ingestion & Outbox Sync Worker Processing     |
|  - Queue State Machine & Doctor Matching Engine             |
|  - Signal Anonymizer, Aggregator & EWMA Anomaly Detector    |
|  - Provider Abstractions (OTP, SMS, Speech, Storage, Media) |
+-------------------------------------------------------------+
        |                          |
   Internal HTTP             Mongoose / MongoDB Atlas
(X-Internal-Key, 3s)               |
        v                          v
+------------------------+   +-----------------------------------------------+
|  FastAPI ML Service    |   | Identified Collections:                       |
|  - Calibrated Classifier|   | - users, patients, doctors                    |
|  - Disease Predictor   |   | - screenings, consultations, encounters,      |
|  - Fallback Resilient  |   |   messages, uploads, reports, consents        |
+------------------------+   +-----------------------------------------------+
                             | Anonymized Collections:                       |
                             | - healthSignalEvents (no PHI, no patientId)   |
                             | - healthAggregates (K >= 3 suppression)       |
                             | - alerts (EWMA / z-score anomaly signals)     |
                             +-----------------------------------------------+
```

---

## 2. Key Architectural Guarantees

1. **Deterministic Safety First**: Local emergency rules execute before any machine learning triage. Red flag matches bypass queuing directly to emergency calling (108) and nearest emergency-capable facilities.
2. **Backend Authority**: Browser never assigns doctors, advances queues, or certifies health trends. All state transitions are transactional and atomic on the server.
3. **Privacy by Separation**: Personal Health Information (PHI) is separated from public health signals. The PHC epidemiological dashboard has zero access to individual identities, phone numbers, or individual screening records.
4. **Resilient Degradation**:
   - Voice input degrades to structured buttons and icon tiles.
   - Video calls degrade to audio, then low-bandwidth chat with hysteresis.
   - Cloud ML inference degrades to on-device Naive Bayes triage with `source: "api-fallback"`.
   - Offline maps degrade to structured facility lists with Haversine approximate distances.
