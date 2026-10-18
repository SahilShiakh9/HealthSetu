# Open Questions & Tracking

This document tracks items requiring stakeholder clarification, clinical review, or external credentials.

| ID | Topic | Description | Status | Current Mitigation |
|---|---|---|---|---|
| OQ-001 | Clinical Review | Emergency rules, symptom dictionary translations (Hindi/Marathi), and disease-to-risk mappings are drafts. | Open (Pending Clinical Review) | Marked with `"reviewStatus": "draft"`, `"needsClinicalReview": true`. |
| OQ-002 | Third-Party Telephony / SMS | Real DLT-registered SMS provider in India for OTP delivery. | Open (Credential Dependent) | Implemented `OtpProvider` interface with `ConsoleOtpProvider` for development. |
| OQ-003 | Speech Recognition Provider | Cloud Speech-to-Text provider endpoint for Marathi/Hindi rural dialect recognition. | Open (Provider Evaluation) | Implemented typed `SpeechProvider` with `NotConfiguredError` stub; UI offers touch/button fallback as primary. |
| OQ-004 | ZEGOCLOUD App ID & Secret | Live production credentials for ZEGOCLOUD WebRTC video room creation. | Open (Credential Dependent) | Implemented typed `CommunicationService` with sandbox fallback for local tests. |
