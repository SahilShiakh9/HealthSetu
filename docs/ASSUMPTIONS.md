# Engineering Assumptions

This document records assumptions made when specifications are silent or allow flexibility, adhering to the principle: **Simple beats clever** and **Offline-first**.

| ID | Date | Assumption | Rationale |
|---|---|---|---|
| ASM-001 | 2026-10-11 | Monorepo is rooted directly at `D:/MIT-India-Hackathon/` using npm workspaces (`apps/*`, `services/*`, `packages/*`). | Confirmed by project lead to prevent unnecessary nested directories. |
| ASM-002 | 2026-10-11 | Tailwind CSS v3.4.19 is locked with `@tailwindcss/forms`. | Confirmed by project lead for stable PostCSS plugin ecosystem and reliable production builds. |
| ASM-003 | 2026-10-11 | Labelled synthetic ML dataset fixture is used under `services/ml/tests/fixtures/` until raw Kaggle data is placed in `services/ml/data/raw/`. | Explicitly required by Section 11.8 and approved by project lead. |
| ASM-004 | 2026-10-11 | In-memory MongoDB memory server / mock collections are supported for self-contained unit and integration testing when remote Atlas URI is unset. | Enables fully automated CI and offline test passes without external network dependencies. |
| ASM-005 | 2026-10-11 | Console provider is the default for OTP during development (`OTP_PROVIDER=console`), printing generated OTPs to structured logs. | Allows end-to-end verification of registration and login without SMS gateway credentials. |
