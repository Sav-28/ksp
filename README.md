# KSP Crime AI — Conversational Crime Intelligence & Analytics Platform

An AI-powered platform for the **Karnataka State Police** that lets investigators,
analysts, and policymakers interact with the state crime database using natural
language (English **and** Kannada), and go far beyond simple retrieval —
discovering criminal networks, profiling offenders, surfacing socio-demographic
patterns, tracing financial trails, and forecasting emerging crime.

> Built for the conversational-crime-intelligence challenge. Covers all 10
> framework areas — see the mapping below.

---

## Challenge Coverage

| # | Challenge Area | Status | Where |
|---|----------------|--------|-------|
| 1 | Conversational Crime Intelligence (EN + Kannada, voice, context, PDF export) | ✅ | AI Assistant tab |
| 2 | Criminal Network & Relationship Analysis | ✅ | NETWORK tab |
| 3 | Crime Pattern, Trend & Hotspot Analytics | ✅ | DASHBOARD + MAP tabs |
| 4 | Sociological Crime Insights | ✅ | INSIGHTS tab |
| 5 | Criminology-Based Offender Profiling | ✅ | PROFILES tab |
| 6 | Investigator Decision Support | ✅ | chat: "summarize / similar cases" |
| 7 | Financial Crime & Transaction Link Analysis | ✅ | FINANCE tab |
| 8 | Crime Forecasting & Early Warning | ✅ | FORECAST tab |
| 9 | Explainable AI & Transparent Analytics | ✅ | "Why this answer?" on every reply |
| 10 | Secure Role-Based Access & Governance | ✅ | role-gated tabs, FIR registration & case-close RBAC, AUDIT tab |

The database implements the **official Karnataka Police FIR schema** (28 normalized
tables — `CaseMaster`, `Victim`, `Accused`, `ComplainantDetails`, `ArrestSurrender`,
`ChargesheetDetails`, `Act`/`Section`, `CrimeHead`/`CrimeSubHead`, lookup masters,
etc.) with the official 18-digit `CrimeNo`. See **[the schema module](backend/src/database/models_fir.py)**
and the projection ETL **[migrate_to_fir_schema.py](backend/migrate_to_fir_schema.py)**.

For a detailed phase-by-phase changelog, see **[PROJECT_STATUS.md](PROJECT_STATUS.md)**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy |
| Database | SQLite (dev) / PostgreSQL (prod) — DB-agnostic ORM |
| NLP | scikit-learn (TF-IDF + LogisticRegression) + rule-based entities + Kannada normalization |
| Conversational AI (planned upgrade) | Local LLM via **Ollama** (`qwen2.5:3b`) as a decoupled understanding/narration service |
| Frontend | React 18 + TypeScript |
| Auth | HMAC-signed tokens + PBKDF2 password hashing + role-based access |
| Charts/Graph/Map | Hand-built SVG (no external chart/graph dependency) |
| Deployment | Zoho Catalyst **AppSail** — single origin serves the React build **and** the FastAPI API (no CORS); Docker provided |

---

## Features

**Conversational interface** — natural-language queries in English & Kannada,
voice input, context-aware follow-ups ("and in Mysuru?", "who was the accused?"),
and one-click conversation export to PDF.

**Analytics dashboard** — totals and breakdowns by district, crime type, and
month, with trend and bar charts.

**FIR registration (write workflow)** — role-gated form to register a new FIR in
any of Karnataka's **31 districts** (with real police stations): crime details,
an **interactive Leaflet map picker** (click / landmark autocomplete / GPS) to
capture the exact location, investigating officer with **rank & designation**,
**accused mugshot photos**, and **gang tagging** per accused. It generates the
official 18-digit `CrimeNo`, mirrors into the `CaseMaster` schema, and flows
straight into the dashboard, map, network, and forecasting. A soft **jurisdiction
warning** flags a pin that falls outside the selected district (Zero-FIR aware).

**Case Investigation** — enter a Crime No (FIR) to pull the full dossier: accused,
victims, incident location with **coordinates + embedded map and "Get Directions"**,
and police/officer/court details from the official schema. Investigators can
**advance the investigation status**, and supervisors/admins can **close a case**
(two-tier RBAC), synced to the official schema.

**Legal-section queries** — ask by IPC/section ("cases under IPC 302", "section 379
in Mysuru", "u/s 420") and the engine maps it to the crime type.

**Criminal network analysis** — clean **radial hub-and-spoke graph** grounded in
real co-accused cases: the focus person sits at the centre, direct links form an
inner ring and second-degree links an outer ring, with a **direct-link count** on
the node and a stats strip. Every edge traces to the actual linking Crime No(s)
(hover to see them). Registering an FIR with multiple accused **auto-creates the
network links**, and gang tagging feeds organized-crime clustering. Includes an
offender search box and click-to-re-centre.

**Hotspot map** — geographic crime distribution with district hotspots and
90-day emerging-surge alerts.

**Sociological insights** — accused breakdown by age, gender, socio-economic
status, education, occupation, and **urban/rural**, plus **social-risk-factor
correlations** (economic stress, education, occupation, urbanization).

**Offender profiling** — repeat-offender ranking with an explainable 0-100 risk
score, primary modus operandi, and full case history; drill in from any accused.

**Decision support** — automated case summaries, timelines, investigative leads,
and similar-case matching with outcomes.

**Financial analysis** — suspicious money-trail tracing (a labeled demo
integration; production would connect to bank / FIU-IND feeds).

**Forecasting & trends** — next-month projection, district early-warning alerts,
and **seasonal (month-of-year) + festival-window** trend analysis.

**Case analytics** — arrest and clearance (chargesheet) rates per district, and
officer caseload — computed from the official `ArrestSurrender`/`ChargesheetDetails`.

**Explainable AI** — every answer carries an evidence trail (intent, confidence,
filters, records examined, data source, interpretation).

**Governance** — token auth, PBKDF2-hashed passwords, **4-role access control**
(investigator / analyst / supervisor / policymaker) with per-role tabs, and a
persisted, supervisor-viewable audit log.

---

## Architecture

```
        Browser (police stations — zero install)
                  │ HTTPS
        ┌─────────▼─────────────────────────────┐
        │        ZOHO CATALYST AppSail          │
        │  FastAPI app (single origin)          │
        │   • serves the React build (static)   │
        │   • serves /api/... on the same host  │  ← no CORS / no gateway preflight
        │   • SQLite (/tmp), auto-seeded         │
        └─────────┬─────────────────────────────┘
                  │ HTTPS (optional — language understanding only)
        ┌─────────▼──────────┐
        │   AI SERVICE       │   FastAPI + Ollama (qwen2.5:3b)
        │  text → {intent,   │   optional GPU server; if unreachable the app
        │  entities} JSON    │   falls back to the built-in rule-based NLP
        └────────────────────┘
```

The React production build is copied into `backend/static` and served by the same
FastAPI app that exposes `/api/...`, so the browser makes same-origin calls — this
avoids the Catalyst gateway intercepting CORS preflight (`OPTIONS`) requests.

The LLM never touches the database — it only translates language into the
existing **safe, parameterized query engine**, which executes deterministically.
This keeps queries injection-safe and answers auditable.

```
backend/
├── main.py                       # FastAPI app, routers, CORS, startup
├── generate_narrative_data.py    # seeds crimes, persons, gangs, FIRs, money trails
├── migrate_to_fir_schema.py      # projects data into the official FIR schema
├── src/
│   ├── api/
│   │   ├── auth.py               # tokens, password hashing, 4-role require_role()
│   │   └── routes/               # chat, stats, network, hotspots, insights,
│   │       │                     #   decision_support, details, casework, audit, auth
│   ├── database/                 # models.py (analytics) + models_fir.py (official schema)
│   ├── nlp/                      # intent_classifier, followup, kannada_support
│   ├── query_engine/             # translator.py (intent → safe SQL)
│   └── services/                 # crime_detail.py
└── tests/test_smoke.py           # 13 pytest cases
frontend/src/
├── pages/ChatPage.tsx            # main app + chat
├── components/                   # Dashboard, NetworkView/Graph, HotspotView,
│   │                             #   InsightsView, ProfilesView, FinanceView,
│   │                             #   ForecastView, CaseInvestigationView, AuditView, Login
├── api.ts                        # API base, token, authenticated fetch
└── locale.ts                     # Kannada localization of data + answers
```

---

## Getting Started

### Prerequisites
- Python 3.8+ and Node.js 16+
- (Optional, for the AI upgrade) [Ollama](https://ollama.com) with `qwen2.5:3b`

### Backend
```bash
cd backend
pip install -r requirements.txt
python generate_narrative_data.py   # first run — seed crimes, persons, gangs, FIRs, finance
python migrate_to_fir_schema.py     # first run — project into the official FIR schema
python src/nlp/train_model.py       # first run — train the NLP model
python main.py                      # serves at http://localhost:8004
# (main.py also auto-seeds + projects on first boot if the DB is empty)
```

### Frontend
```bash
cd frontend
npm install
npm start                           # serves at http://localhost:3000
```

### (Optional) AI service with Ollama
```bash
ollama pull qwen2.5:3b
# the decoupled AI service (FastAPI + Ollama) is wired via env config
```

### Demo credentials (role-based access — Area 10)
| Username | Password | Role | Sees |
|----------|----------|------|------|
| investigator | invest@2024 | investigator | AI Assistant, Dashboard, Network, Map, Profiles, Case Investigation |
| analyst | analyst@2024 | analyst | + Insights, Finance, Forecast |
| supervisor | super@2024 | supervisor | everything + AUDIT |
| policymaker | policy@2024 | policymaker | Dashboard, Map, Insights, Forecast (high-level) |

Write permissions: **investigator, officer, supervisor, admin** can register FIRs
and advance status; **only supervisor/admin** can close a case; **analyst and
policymaker are read-only**. (Legacy `officer / ksp@2024` and `admin / admin@2024`
still work.)

---

## Configuration (backend env)

See `backend/.env.example`. Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | SQLite | Switch to PostgreSQL in production |
| `KSP_SECRET_KEY` | dev value | Token signing secret (change in prod) |
| `KSP_AUTH_REQUIRED` | `true` | Set `false` for local demos |
| `KSP_CORS_ORIGINS` | localhost:3000 | Allowed frontend origins |
| `KSP_EXPOSE_SQL` | `false` | Expose generated SQL (debug only) |

Frontend: `REACT_APP_API_BASE` (default `http://localhost:8004`).

---

## API Overview

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/login` | — | Authenticate, returns token |
| POST | `/api/chat` | ✓ | Conversational query (+ follow-ups, detail, summary) |
| GET | `/api/stats` | ✓ | Dashboard analytics |
| GET | `/api/reference/registration`, `/api/gangs` | register roles | Form dropdown data + gang search |
| POST | `/api/crimes` | register roles | Register a new FIR (write) |
| PATCH | `/api/crimes/{crimeNo}` | investigator/supervisor/admin | Update status / close case |
| PATCH | `/api/person/{id}/photo` | register roles | Add/replace an accused photo |
| GET | `/api/crime/{crimeNo}` | ✓ | Full case dossier (Case Investigation) |
| GET | `/api/network/overview`, `/api/network/search`, `/api/network/person/{id}` | ✓ | Grounded co-accused network + offender search |
| GET | `/api/hotspots`, `/api/patterns/mo`, `/api/trends/seasonal` | ✓ | Hotspots, modus operandi, seasonal/festival trends |
| GET | `/api/sociological` | ✓ | Demographic + social-risk-factor insights |
| GET | `/api/offenders`, `/api/offenders/{id}` | ✓ | Risk-ranked profiles |
| GET | `/api/cases/{fir}/summary`, `/similar` | ✓ | Decision support |
| GET | `/api/clearance`, `/api/officer-caseload` | ✓ | Arrest/clearance rates + officer caseload |
| GET | `/api/financial/trails` | ✓ | Money-trail analysis (demo integration) |
| GET | `/api/forecast` | ✓ | Forecast + early-warning alerts |
| GET | `/api/audit` | supervisor | Audit log |

---

## Testing
```bash
cd backend
pytest -q          # 13 smoke tests: auth, queries, Kannada, RBAC, intelligence
```

---

## Deployment (Zoho Catalyst AppSail)

The whole platform runs as a **single Catalyst AppSail service** — the FastAPI app
serves both the React build and the `/api/...` endpoints from one origin, so police
stations access everything through a browser with nothing installed locally, and
there are no CORS/preflight issues.

### One-command deploy
From the project root:
```powershell
./deploy.ps1
```
This (1) builds the React frontend, (2) copies the build into `backend/static`,
(3) vendors Linux (`manylinux`) Python wheels into `backend/vendor` if missing,
and (4) runs `catalyst deploy`. Live URL:
`https://ksp-api-50044161264.development.catalystappsail.in`

### Notes on AppSail
- AppSail does **not** run `pip install` on the server, so Linux wheels are
  **vendored** with the app (handled by `vendor-deps.ps1` / `deploy.ps1`).
- `main.py` binds to Catalyst's `X_ZOHO_CATALYST_LISTEN_PORT` and **auto-seeds**
  the DB on first boot; SQLite writes to `/tmp` (app dir is read-only).
- In the cloud `KSP_NLP_PROVIDER=rules` is used (Ollama can't run on Catalyst);
  the heavy ML stack (scikit-learn/numpy) is optional and a keyword classifier is
  used instead.
- The **AI service (Ollama)** is optional and decoupled — run it on a GPU server
  (on-premise for data sovereignty); if unreachable the app falls back to
  rule-based NLP, so it never goes down.

Full step-by-step guide (CLI setup, wheel vendoring, env vars, troubleshooting):
see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### Docker (alternative)
Docker artifacts (`backend/Dockerfile`, `frontend/Dockerfile`,
`docker-compose.yml`) are provided for container/VM hosting.

---

## Security & Privacy
- Parameterized SQL throughout (injection-safe); the LLM never generates SQL.
- PBKDF2-hashed passwords; HMAC-signed session tokens; role-based access.
- Every query is written to a persisted audit log for accountability.
- AI can run fully on-premise — sensitive crime data never leaves government
  infrastructure.

---

## Roadmap
- Load real/realistic KSP data (financial, gangs, and demographics are currently
  synthetic; the official schema is ready to receive real data).
- Migrate to PostgreSQL for the production database (currently SQLite on `/tmp`).
- Upgrade forecasting from a moving-average to a seasonality-aware ML model.
- Unify victims / locations / financial accounts into the network graph.
- Grow the automated test suite to cover the newer endpoints.

---

## Acknowledgments
Built for Karnataka State Police. Synthetic data only — no real PII.
