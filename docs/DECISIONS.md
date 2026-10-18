# Architecture Decision Records (ADRs)

## ADR-001: Monorepo Structure & Package Management
- **Date**: 2026-10-11
- **Status**: Accepted
- **Context**: Need a unified, strictly typed repository containing client PWA, Express API, Python ML service, and shared contracts.
- **Decision**: Standard npm workspaces monorepo rooted at repository root (`D:/MIT-India-Hackathon/`). Workspaces: `packages/contracts`, `services/api`, `apps/web`. The Python service (`services/ml`) lives alongside with its virtual environment and pytest runner.
- **Consequences**: Single source of truth in `packages/contracts` for Zod schemas, TypeScript types, enums, and event names.

## ADR-002: In-Memory Access Tokens & Rotating HttpOnly Refresh Tokens
- **Date**: 2026-10-11
- **Status**: Accepted
- **Context**: Balancing high security for medical application with offline-first client ergonomics.
- **Decision**: Short-lived JWT access tokens (15 minutes) kept strictly in memory (Zustand auth store, never localStorage). Opaque refresh tokens stored hashed in DB and sent in HttpOnly SameSite cookie. Token family reuse triggers immediate revocation of the entire token family.
- **Consequences**: XSS vulnerabilities cannot extract long-lived credentials from localStorage.

## ADR-003: Emergency Rule Priority Over Predictive Models
- **Date**: 2026-10-11
- **Status**: Accepted
- **Context**: Rural screening safety where network connection may be absent or unstable.
- **Decision**: Emergency rules (`emergencyRules.json`) are deterministic, run locally in the browser engine after every single answer, and completely bypass queues if triggered. Predictive models (both on-device Naive Bayes and online ML) can never downgrade an emergency flag.
- **Consequences**: Absolute clinical safety priority over model accuracy or queue load.

## ADR-004: BernoulliNB Model for Online ML Service and Client Parity
25: - **Date**: 2026-10-11
26: - **Status**: Accepted
27: - **Context**: On Windows runtime environments with AppLocker DLL policies, scikit-learn modules requiring Cython distance metrics C-extensions (`_dist_metrics`, `arrayfuncs` in `LinearSVC`/`RandomForest`) can be blocked. Simultaneously, the offline client engine uses Naive Bayes in log space with Laplace smoothing over binary symptom features.
28: - **Decision**: Train scikit-learn `BernoulliNB(alpha=1.0)` in `services/ml`. This avoids AppLocker-blocked DLL extensions and provides exact mathematical and probabilistic parity between the scikit-learn online assist model and the client's Laplace-smoothed log-space Naive Bayes triage engine. Both export and use identical condition priors and symptom likelihoods.
29: - **Consequences**: Deterministic parity between offline client triage engine and online ML FastAPI assist endpoint, zero Cython DLL issues, fast sub-millisecond inference.
## ADR-005: Server-Side Session Tracking & Immediate Revocation via sid Cache
- **Date**: 2026-10-11
- **Status**: Accepted
- **Context**: Access JWTs are stateless for 15 minutes, which creates a window where a logged-out user or compromised session could continue making API calls until JWT expiry.
- **Decision**: Access JWTs carry a `sid` (Session ID) claim tied to a MongoDB `sessions` collection. Middleware `requireAuth` validates the signature and checks that `sid` is not revoked. To prevent a database lookup on every single API request, `requireAuth` checks an in-process Map cache with a 10-second TTL. On logout, the `sid` is deleted from the cache and marked revoked in MongoDB.
- **Consequences**: Fast response times (cache hit for 10s) while guaranteeing that logout revokes access within at most 10 seconds across all endpoints.

## ADR-006: Server-Derived Facility Scope & Directory Separation
- **Date**: 2026-10-12
- **Status**: Accepted
- **Context**: Dashboard and facility queries previously allowed clients to supply arbitrary `phcId` parameters or defaulted to arbitrary facilities, allowing staff from Facility A to view Facility B or patients to view internal operational loads.
- **Decision**: 
  1. Middleware `resolveScope` derives authorized `facilityIds` and `districtCode` strictly from database records (`StaffAssignment` / `User`). Browser parameters are validated against `req.scope`. Unauthorized resource lookups return `404 Not Found` (to avoid leaking existence), while unauthorized filters return `403 Forbidden`.
  2. Strict separation between public directory (`GET /facilities/nearby` & `GET /facilities/:id`), which strips all operational load/queue fields, and operational administrative endpoints (`GET /phc/*` and `GET /district/*`), which require role authorization and scope validation.
  3. Small-group suppression ($k$-anonymity $< 3$) is enforced on all aggregate counts to protect patient privacy in rural villages.
- **Consequences**: Complete multi-tenant facility isolation, zero operational metric leakage to the public directory, and compliance with data minimization.

## ADR-007: Real RTC CommunicationService & Explicit Documentation Lifecycle
- **Date**: 2026-10-12
- **Status**: Accepted
- **Context**: Video calling previously used simulated timers, fake avatars, and automatically created clinical prescriptions/diagnoses upon call hang-up.
- **Decision**:
  1. Real `CommunicationService` abstraction with `UnavailableCommunicationService` fallback when server credentials are unconfigured, presenting honest "Video calling is not configured" notices rather than fake streams.
  2. Short-lived WebRTC tokens issued server-side (`POST /consultations/:id/join`) verifying patient/doctor authorization.
  3. Call termination (`POST /consultations/:id/end`) sets status to `DOCUMENTATION_PENDING`, frees the doctor's availability, and strictly does NOT generate diagnoses, prescriptions, or reports.
  4. Finalization of encounters and reports remains an explicit, clinician-entered action (`POST /consultations/:id/complete`).
- **Consequences**: Zero fake consultation streams or synthetic diagnoses; clinical integrity is strictly preserved.

## ADR-008: Screening Engine Provenance & Immutable Versioned Encounters
- **Date**: 2026-10-12
- **Status**: Accepted
- **Context**: Screening models and clinical prescriptions previously lacked provenance metadata, allowed unverified diagnoses, and permitted in-place overwrites of finalized clinical encounters.
- **Decision**:
  1. Every screening record persists an explicit `engine` metadata descriptor (`{ type: 'rules' | 'naive-bayes' | 'ml', version, source }`), visibly displayed on results.
  2. Emergency rules evaluate deterministically first and locally; no model probability or LLM response can ever lower or clear an emergency flag.
  3. Finalized clinical encounters (`status: 'FINAL'`) are strictly immutable. Corrections create versioned amendments (`version: N+1`, `supersedes: prevId`) retaining the prior document.
  4. Clinical reports and prescriptions are generated via jsPDF directly from persisted database encounters with IST timestamps, registered clinician identifiers, and explicit statutory disclaimers under Telemedicine Practice Guidelines (2020).
- **Consequences**: Audit-proof clinical immutability, full provenance transparency, and elimination of auto-generated or overwritten prescriptions.

## ADR-009: GeoJSON Coordinate Invariants & Explainable Rural Facility Ranking
- **Date**: 2026-10-12
- **Status**: Accepted
- **Context**: Facility geolocation previously used ad-hoc coordinate conventions, fake accuracy claims (`±25m`), hardcoded radar centers, and unweighted sorting that could send mild patients to overcrowded tertiary hospitals or delay acute emergencies.
- **Decision**:
  1. Strict GeoJSON order `[longitude, latitude]` enforced across MongoDB 2dsphere indexes and `$geoNear` aggregation queries.
  2. Pure spherical forward bearing calculation (`calculateBearing`) plotted relative to true North ($0^\circ$).
  3. Explainable 4-term facility ranking formula: $0.40 \text{ Proximity} + 0.25 \text{ Tier Fit} + 0.20 \text{ Load} + 0.15 \text{ Services}$, exposing detailed breakdown percentages on all cards.
  4. Emergency priority invariant: `HIGH` risk cases unconditionally place emergency-capable facilities at the top of the queue ordered by distance.
  5. Honest GPS accuracy reporting: captures real `coords.accuracy` in metres; warns if $> 1000\text{m}$; provides curated rural village anchor fallback when GPS is denied.
  6. RoutingProvider abstraction with 1.3 rural road factor and `isApprox: true` flag.
- **Consequences**: Mathematically sound spatial queries, zero coordinate transposition bugs, full explainability for community health workers and patients, and safe emergency triage.

## ADR-010: Per-User Local Storage Partitioning & Shared-Device Safety
- **Date**: 2026-10-12
- **Status**: Accepted
- **Context**: In rural health kiosks and shared family phones, multiple citizens or ASHAs access the same physical browser. Storing unpartitioned medical records in a single database risked cross-user data leakage.
- **Decision**:
  1. Per-User Dexie Database: partition user-specific sensitive data (`screenings`, `outbox`, `encountersCache`, drafts) into databases named by user ID hash (`healthsetu_user_${hash}`).
  2. Public Shared Database: shared `healthsetu_public` stores only non-sensitive directory and triage rule caches.
  3. Outbox Ownership: all outbox rows store `ownerUserId`. The client sync worker only transmits items matching the active user, and backend `POST /sync/push` rejects events where `ownerUserId !== req.user.id`.
  4. Shared-Device Logout Policy: if the user's outbox is empty, their local database is automatically deleted on logout. If unsent records exist, warns before logout and offers an explicit "Delete unsent data" action.
  5. Service Worker NetworkOnly: Workbox enforces `NetworkOnly` for all authenticated endpoints, preventing any service-worker cache leakage between users.
- **Consequences**: Complete multi-user isolation on shared devices, prevention of accidental cross-identity uploads, and adherence to DPDP Act data minimization principles.

## ADR-011: Sequential Vitest Execution & Comprehensive End-to-End Verification
- **Date**: 2026-10-12
- **Status**: Accepted
- **Context**: In multi-suite integration testing on Windows, concurrently launching 13 MongoDB Memory Server instances triggered memory thrashing and process termination errors. Additionally, end-to-end tests required honest handling of unconfigured video infrastructure and strict verification of 3-language locale completeness.
- **Decision**:
  1. Configured `services/api/vitest.config.ts` with `fileParallelism: false` and `pool: 'forks'` to run backend integration test suites sequentially, completely isolating Mongoose model compilation and MongoDB instances without resource starvation.
  2. Fixed auth refresh session race conditions in `useAuthStore.ts` by awaiting user profile resolution before releasing `isLoading: false`.
  3. Added Vite dev server proxy for `/api` targeting the backend on port 4000.
  4. Automated 100% locale parity tests across `en.json`, `hi.json`, and `mr.json`.
  5. Implemented Playwright E2E suites verifying offline resilience, shared-device token security, authentication guards on clinical routes, and honest unconfigured diagnostics for teleconsultation calls.
- **Consequences**: Deterministic, zero-flake test execution across 187 unit/integration tests and Playwright E2E suites, with robust isolation and complete quality gate compliance.
