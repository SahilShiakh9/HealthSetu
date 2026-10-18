# HealthSetu — Production Deployment & Architecture Guide

## 1. System Architecture & Topology

HealthSetu is an offline-first rural healthcare platform designed for high-availability, low-bandwidth resilience, and stringent patient data privacy under the Digital Personal Data Protection (DPDP) Act (2023) and Telemedicine Practice Guidelines (2020).

```
 +----------------------------------------------------------------------------------+
 |                               Client Device (ASHA Phone / Citizen Browser)       |
 |                                                                                  |
 |  +-------------------------------------+  +-----------------------------------+  |
 |  | Progressive Web App (React 18 / TS) |  | Per-User Dexie DB (IndexedDB)     |  |
 |  | - Workbox Service Worker            |  | - Partitioned: healthsetu_user_*  |  |
 |  | - Local Rule & Provenance Engine    |  | - Public: healthsetu_public       |  |
 |  | - RealWebRTC CommunicationService   |  | - Encrypted outbox with ownerId   |  |
 |  +------------------+------------------+  +-----------------+-----------------+  |
 +---------------------|---------------------------------------|--------------------+
                       | HTTPS / WSS                           |
                       v                                       v
 +----------------------------------------------------------------------------------+
 |                        Reverse Proxy & TLS Termination (Nginx / Caddy)           |
 |  - Strict-Transport-Security, Content-Security-Policy, Cache-Control: no-store   |
 |  - WebSocket upgrades for /socket.io/                                            |
 +---------------------+---------------------------------------+--------------------+
                       |                                       |
                       | /api/v1/*                             | /ml/*
                       v                                       v
 +-------------------------------------+     +--------------------------------------+
 | Node.js Express API Gateway (4000)  |     | Python FastAPI ML Service (8000)     |
 | - Argon2id Password Hashing         |     | - Calibrated RandomForest Classifier |
 | - Jose EdDSA / HS256 JWT & Refresh  |     | - Scikit-Learn Triage Predictor      |
 | - MongoDB $geoNear 2dsphere Queries |     | - Synthetic Outbreak Signal Analysis |
 | - Pooled Queue with Late Binding    |     | - Internal Shared Key Authentication |
 | - Pino Structured Logging           |     +--------------------------------------+
 +------------------+------------------+
                    |
                    v
 +----------------------------------------------------------------------------------+
 |                       MongoDB Replica Set (Atlas / Self-Hosted 7.0+)             |
 |  - Collections: users, sessions, facilities, doctor_affiliations, screenings,   |
 |                 consultations, queue_entries, encounters, reports, signals        |
 |  - 2dsphere geospatial index on facilities.location                              |
 |  - Compound indexes on doctor_affiliations (doctorUserId + facilityId)          |
 |  - Unique indexes on sessions.sid, outbox deduplication, compound user scopes   |
 +----------------------------------------------------------------------------------+
```

---

## 1.1 Multi-Organization Workspace Matrix & Authorization Boundaries

HealthSetu enforces single-database multi-tenancy with strict persona partitioning:

| Role | Default Route | Permitted Capabilities | Prohibited Capabilities |
|---|---|---|---|
| **PATIENT** | `/home` | Voice/touch screening, facility search, waiting room, emergency 108 SOS, own reports | PHC Surveillance, hospital admin controls, access to foreign patient records |
| **HOSPITAL_ADMIN** | `/org/dashboard` | Facility profile, doctor affiliations (approve/reject/invite), operational queues | Private patient medical records, clinical consultation claiming, foreign hospital data |
| **DOCTOR** | `/doctor` | Queue claiming (for active affiliated facilities), tele-consultations, prescription authoring | Claiming queues for unaffiliated hospitals, public health administration |
| **GOVT_OFFICER** | `/surveillance` | District syndromic trends, EWMA outbreak alerts ($k \ge 3$), readiness tracking | Identifiable patient records ($k$-anonymity suppression), clinical queues |
| **NGO_OBSERVER** | `/surveillance` | Read-only anonymized community epidemiology, vector-borne heatmaps | Patient identifiers, consultation intervention, hospital staff administration |
| **ASHA** | `/screening` | Assisted rural citizen triage, offline outbox caching with ownerUserId | Surveillance configuration, modifying hospital rosters |

---

## 2. Environment Configuration & Secrets Management

### 2.1 Variables Matrix

| Variable | Service | Required in Prod | Dev Default | Description | Security Classification |
|---|---|---|---|---|---|
| `NODE_ENV` | API / Web | Yes | `development` | Runtime environment (`production` or `development`) | Config |
| `PORT` | API | No | `4000` | Port for Express API Gateway | Config |
| `API_URL` | API | Yes | `http://localhost:4000` | Fully qualified public URL of the API | Public Config |
| `WEB_URL` | API | Yes | `http://localhost:5173` | Allowed CORS origin for Web Client | Security Boundary |
| `MONGODB_URI` | API | Yes | `mongodb://localhost:27017/healthsetu` | MongoDB replica set connection string | **CRITICAL SECRET** |
| `JWT_ACCESS_SECRET` | API | Yes | *Must be generated* (min 32 chars) | Secret used to sign short-lived access JWTs (15m) | **CRITICAL SECRET** |
| `JWT_REFRESH_SECRET` | API | Yes | *Must be generated* (min 32 chars) | Secret used to sign rolling refresh tokens (7d) | **CRITICAL SECRET** |
| `COOKIE_SECRET` | API | Yes | *Must be generated* (min 32 chars) | Cookie encryption and signature key | **CRITICAL SECRET** |
| `ML_SERVICE_URL` | API | Yes | `http://localhost:8000` | Internal URL of FastAPI microservice | Internal Routing |
| `ML_INTERNAL_KEY` | API / ML | Yes | *Must be generated* (min 32 chars) | Pre-shared key for service-to-service auth | **HIGH SECRET** |
| `ZEGO_APP_ID` | API / Web | Optional | `0` | ZegoCloud WebRTC App ID (numeric) | Commercial Config |
| `ZEGO_SERVER_SECRET` | API | Optional | `""` | ZegoCloud Server Secret for live calling | **CRITICAL SECRET** |
| `ABDM_CLIENT_ID` | API | Optional | `""` | Ayushman Bharat Digital Mission Client ID | Commercial Config |
| `ABDM_CLIENT_SECRET` | API | Optional | `""` | ABDM HFR Registry API Secret | **CRITICAL SECRET** |
| `SMS_GATEWAY_API_KEY`| API | Optional | `""` | CDAC / Gupshup / Twilio SMS gateway API key | **CRITICAL SECRET** |

> [!IMPORTANT]
> **Production Secrets Invariant:** If `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` contains substrings like `dev_` or is shorter than 32 characters in `NODE_ENV=production`, the API Gateway unconditionally halts on startup.

---

## 3. Local Development Setup

### 3.1 Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **Python**: 3.10+ or 3.11+
- **MongoDB**: 7.0+ (Local Community Edition or MongoDB Atlas free tier)
- **Git**: 2.30+

### 3.2 Installation & Setup
```bash
# 1. Clone repository
git clone https://github.com/organization/healthsetu.git
cd healthsetu

# 2. Configure Environment Files
cp .env.example .env
cp services/api/.env.example services/api/.env
cp services/ml/.env.example services/ml/.env
cp apps/web/.env.example apps/web/.env

# 3. Install Monorepo Node Dependencies
npm install

# 4. Setup Python ML Virtual Environment
cd services/ml
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/macOS
# source venv/bin/activate

pip install -r requirements.txt
cd ../..

# 5. Build Shared Contracts
npm run build --workspace=@healthsetu/contracts

# 6. Seed Initial Data (Default facilities, demo accounts, syndromes)
npm run seed --workspace=@healthsetu/api
```

### 3.3 Running Locally
```bash
# Run all three services concurrently in development mode:
npm run dev

# Or run individually:
npm run dev:api   # Port 4000 (Express)
npm run dev:ml    # Port 8000 (FastAPI)
npm run dev:web   # Port 5173 (Vite PWA)
```

---

## 4. Production Deployment Runbooks

### 4.1 Production Build
```bash
# Clean and compile all packages strictly
npm run build
```
This produces:
- `packages/contracts/dist/`
- `services/api/dist/`
- `apps/web/dist/` (contains optimized SPA assets, manifest, and `sw.js` compiled via Workbox `injectManifest`)

### 4.2 Reverse Proxy Configuration (Nginx Example)
Place Nginx in front of Node.js, FastAPI, and Vite static assets.

```nginx
# /etc/nginx/conf.d/healthsetu.conf

upstream api_backend {
    server 127.0.0.1:4000;
    keepalive 32;
}

upstream ml_backend {
    server 127.0.0.1:8000;
    keepalive 16;
}

server {
    listen 80;
    server_name healthsetu.org www.healthsetu.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name healthsetu.org;

    ssl_certificate /etc/letsencrypt/live/healthsetu.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/healthsetu.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers (DPDP Act Compliance)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Static Web App (PWA)
    root /var/www/healthsetu/apps/web/dist;
    index index.html;

    # Service Worker: Do not cache aggressively
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # SPA Client Routing Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Gateway Reverse Proxy
    location /api/v1/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable response caching on private API endpoints
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    # WebSocket Upgrade Proxy (Socket.IO Realtime Teleconsultation Queue)
    location /socket.io/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Internal ML Microservice (Admin / PHC surveillance only)
    location /ml/ {
        internal; # Accessible only from server-side reverse proxying
        proxy_pass http://ml_backend/;
        proxy_http_version 1.1;
    }
}
```

### 4.3 Process Management with PM2
Create `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    {
      name: 'healthsetu-api',
      script: 'services/api/dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
    {
      name: 'healthsetu-ml',
      script: 'services/ml/venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8000 --workers 4',
      interpreter: 'none',
      env_production: {
        PYTHONPATH: 'services/ml',
      },
    },
  ],
};
```
Start processes:
```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

---

## 5. Health Checks, Observability & Verification

### 5.1 Endpoints
- **Liveness Probe**: `GET /health/live` (returns HTTP 200 `{ status: "ok" }`)
- **Readiness Probe**: `GET /health/ready` (verifies MongoDB ping, ML connection, and returns HTTP 200 or 503)
- **Detailed Diagnostics**: `GET /health` (displays service status, database latency, ML version, and honest configuration flags)

### 5.2 Verification Gates Matrix
Before promoting any release to production, execute the 6 quality gates:
1. `npm run lint` — 0 lint warnings or errors.
2. `npm run typecheck` — 0 TypeScript errors under strict mode across all workspaces.
3. `npm run test --workspace=@healthsetu/api` — 109 API integration tests passing.
4. `npm run test --workspace=@healthsetu/web` — 72 Web unit & UI tests passing.
5. `npm run test:ml` — 6/6 FastAPI ML pytest tests passing.
6. `npx playwright test` — All E2E browser specifications passing (skipping only unconfigured external WebRTC credentials).
