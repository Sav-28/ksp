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
| 10 | Secure Role-Based Access & Governance | ✅ | auth + AUDIT tab (admin) |

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
| Deployment | Zoho Catalyst (web + API) + decoupled AI service; Docker provided |

---

## Features

**Conversational interface** — natural-language queries in English & Kannada,
voice input, context-aware follow-ups ("and in Mysuru?", "who was the accused?"),
and one-click conversation export to PDF.

**Analytics dashboard** — totals and breakdowns by district, crime type, and
month, with trend and bar charts.

**Criminal network analysis** — interactive force-directed graph of associations
between offenders and gangs, with organized-crime clustering.

**Hotspot map** — geographic crime distribution with district hotspots and
90-day emerging-surge alerts.

**Sociological insights** — accused breakdown by age, gender, socio-economic
status, education, and occupation.

**Offender profiling** — repeat-offender ranking with an explainable 0-100 risk
score, primary modus operandi, and full case history.

**Decision support** — automated case summaries, timelines, investigative leads,
and similar-case matching with outcomes.

**Financial analysis** — suspicious money-trail tracing linked to cases.

**Forecasting** — next-month projection plus district early-warning alerts.

**Explainable AI** — every answer carries an evidence trail (intent, confidence,
filters, records examined, data source, interpretation).

**Governance** — token auth, PBKDF2-hashed passwords, role-based access
(officer / admin), and a persisted, admin-viewable audit log.

---

## Architecture

```
        Browser (police stations — zero install)
                  │ HTTPS
        ┌─────────▼──────────┐
        │   ZOHO CATALYST    │   React web app + API functions + database
        └─────────┬──────────┘
                  │ HTTPS (natural-language understanding only)
        ┌─────────▼──────────┐
        │   AI SERVICE       │   FastAPI + Ollama (qwen2.5:3b)
        │  text → {intent,   │   runs on a GPU server in production;
        │  entities} JSON    │   falls back to rule-based NLP if offline
        └────────────────────┘
```

The LLM never touches the database — it only translates language into the
existing **safe, parameterized query engine**, which executes deterministically.
This keeps queries injection-safe and answers auditable.

```
backend/
├── main.py                       # FastAPI app, routers, CORS, startup
├── generate_sample_data.py       # seeds 154 crime incidents
├── generate_phase4_data.py       # seeds persons, gangs, FIRs, money trails
├── src/
│   ├── api/
│   │   ├── auth.py               # tokens, password hashing, require_role()
│   │   └── routes/               # chat, stats, network, hotspots, insights,
│   │       │                     #   decision_support, details, audit, auth
│   ├── database/                 # models.py (full schema), session.py
│   ├── nlp/                      # intent_classifier, followup, kannada_support
│   ├── query_engine/             # translator.py (intent → safe SQL)
│   └── services/                 # crime_detail.py
└── tests/test_smoke.py           # 13 pytest cases
frontend/src/
├── pages/ChatPage.tsx            # main app + chat
├── components/                   # Dashboard, NetworkView/Graph, HotspotView,
│   │                             #   InsightsView, ProfilesView, FinanceView,
│   │                             #   ForecastView, AuditView, Login
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
python generate_sample_data.py     # first run — seed crime incidents
python generate_phase4_data.py     # first run — seed people/gangs/finance
python src/nlp/train_model.py       # first run — train the NLP model
python main.py                      # serves at http://localhost:8004
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

### Demo credentials
| Username | Password | Role |
|----------|----------|------|
| officer | ksp@2024 | officer |
| admin | admin@2024 | admin (sees AUDIT tab) |

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
| GET | `/api/network/*` | ✓ | Network/gang graphs + overview |
| GET | `/api/hotspots`, `/api/patterns/mo` | ✓ | Hotspots & modus operandi |
| GET | `/api/sociological` | ✓ | Demographic insights |
| GET | `/api/offenders`, `/api/offenders/{id}` | ✓ | Risk-ranked profiles |
| GET | `/api/cases/{fir}/summary`, `/similar` | ✓ | Decision support |
| GET | `/api/financial/trails` | ✓ | Money-trail analysis |
| GET | `/api/forecast` | ✓ | Forecast + early-warning alerts |
| GET | `/api/audit` | admin | Audit log |

---

## Testing
```bash
cd backend
pytest -q          # 13 smoke tests: auth, queries, Kannada, RBAC, intelligence
```

---

## Deployment (Zoho Catalyst)

- **Web app + API + database** are hosted on **Zoho Catalyst** so police stations
  access everything through a browser with nothing installed locally.
- The **AI service (Ollama)** is decoupled — it runs on a GPU server (on-premise
  in production for data sovereignty) and is called over HTTPS only for language
  understanding. If it's unreachable, the platform falls back to the built-in
  rule-based NLP, so it never goes down.
- Docker artifacts (`backend/Dockerfile`, `frontend/Dockerfile`,
  `docker-compose.yml`) are provided for container-based hosting.

---

## Security & Privacy
- Parameterized SQL throughout (injection-safe); the LLM never generates SQL.
- PBKDF2-hashed passwords; HMAC-signed session tokens; role-based access.
- Every query is written to a persisted audit log for accountability.
- AI can run fully on-premise — sensitive crime data never leaves government
  infrastructure.

---

## Roadmap
- Wire the Ollama-based conversational layer (decoupled AI service) into chat.
- Re-seed with planted, discoverable narrative patterns for richer analytics.
- Upgrade the hotspot map to a geographic basemap (Leaflet) + heatmap.
- Migrate to PostgreSQL and deploy on Zoho Catalyst for the live demo.

---

## Acknowledgments
Built for Karnataka State Police. Synthetic data only — no real PII.
