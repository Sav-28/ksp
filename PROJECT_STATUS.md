# KSP Crime AI — Project Status

A conversational AI interface for the **Karnataka State Police** to query a crime
database in natural language (English **and** Kannada). Officers can ask questions
like "show crimes in Bengaluru" or "ಜಿಲ್ಲೆವಾರು ಅಪರಾಧಗಳು" and get structured,
readable results — plus an analytics dashboard.

---

## 1. Tech Stack

| Layer        | Technology                                              |
|--------------|---------------------------------------------------------|
| Backend      | Python, FastAPI, Uvicorn                                |
| Database     | SQLite (dev) via SQLAlchemy ORM                         |
| NLP          | scikit-learn (TF-IDF + Logistic Regression) + rules     |
| Frontend     | React 18 + TypeScript (Create React App)                |
| Auth         | HMAC-signed stateless tokens (no external JWT lib)      |
| Charts       | Hand-built SVG/CSS (no chart dependency)                |

---

## 2. Current Status: ALL 10 CHALLENGE AREAS COVERED (Phases 1-14 done)

The platform now spans the full challenge framework — conversational interface,
network analysis, trend/hotspot analytics, sociological insights, offender
profiling, decision support, financial-crime analysis, forecasting, explainable
AI, and role-based governance — with auth, bilingual support, and an audit trail.

### ✅ Phase 1 — Dashboard & Analytics (DONE)
- `GET /api/stats` endpoint: totals + breakdown by district / crime type / month + recent records.
- Frontend **Dashboard** view: stat cards, monthly trend line chart, bar charts (by district & type), recent-records table.
- Top-nav view switching (AI Assistant ↔ Dashboard) with active highlight.

### ✅ Phase 2 — Smarter Queries & Rich Results (DONE)
- New **BREAKDOWN** intent → group-by queries ("crimes by district / type / month").
- COUNT queries now also return the **matching case records** (not just a number).
- NLP accuracy raised from ~70% → **100% on the held-out eval set** (training data grown 60 → 149 samples).
- Fixed calendar month-end bug in date parsing.
- Results render as **color-coded crime cards**; breakdowns as **inline bar charts**.
- "Detected:" filter chips + friendly suggestions for unrecognized queries.

### ✅ Phase 3 — Kannada, Auth, Audit, Hardening (DONE)
- **Real Kannada query support**: `kannada_support.py` normalizes Kannada → English (crime types, districts, intent keywords) with deterministic intent detection.
- **Full Kannada localization** of displayed crime data, answers, and chart labels (`frontend/src/locale.ts`).
- **Authentication**: `POST /api/login` issues an 8-hour HMAC token; `/api/chat`, `/api/stats`, `/api/audit` require it. Login screen + logout + session-expiry handling in the UI.
- **Persisted audit log**: `audit_logs` table records every query (user, text, language, intent, confidence, SQL, row count); `GET /api/audit` to review.
- **Config hardening**: env-based CORS origins, debug `sql` field gated behind a flag, env-configurable frontend API base.

### ✅ Phase 4 — Data Model Foundation (DONE)
The critical enabler for the advanced challenge areas. Added a normalized,
interlinked intelligence schema on top of the existing `crimes` table.
- **New tables** (`models.py`): `persons` (demographics + socio-economic), `case_persons` (accused/victim/witness links), `fir_details` (investigation status, IO, IPC, outcome), `relationships` (person↔person network edges), `gangs` + `gang_members` (organized crime), `financial_accounts` + `transactions` (money trails).
- **Seeded interlinked dataset** (`generate_phase4_data.py`): 260 persons, 457 case links (223 accused / 187 victims), 154 FIR detail records, 108 relationship edges, 6 gangs / 32 members, 104 accounts, 344 transactions (32 suspicious). Includes deliberate repeat offenders and gang networks.
- **Detail endpoints** (`details.py`): `GET /api/crime/{fir}` (full incident + investigation + people) and `GET /api/person/{id}` (profile + cases + associates + gangs + accounts + repeat-offender flag).
- **Verified:** e.g. "Antony Rao" correctly surfaces as a repeat offender (8 cases) in the "City Eagles" gang with linked associates.
- *This unlocks Areas 2, 4, 5, 6, 7, 8 for the next phases.*

### ✅ Phase 5 — Complete Conversational Interface (DONE)
Completes Area 1.
- **Context-aware follow-up queries** (`followup.py`): carry-forward of location/crime_type/date across turns ("and theft?" stays in Mysuru), plus detail follow-ups ("who was the accused?", "investigation status?") that resolve against the last-referenced FIR. Context is round-tripped between frontend and backend.
- **Rich retrieval**: `FIR_DETAIL` responses return accused, victims, witnesses, and investigation status; rendered as a **CrimeDetailCard** in the chat.
- **PDF export**: one-click export of the full conversation (incl. result cards, breakdowns, detail cards) via print-to-PDF — renders Kannada correctly, no dependencies.
- **Kannada voice input**: speech recognition switches to `kn-IN` when the UI is in Kannada.
- Shared `services/crime_detail.py` powers both the chat follow-ups and the REST detail endpoint.

### ✅ Phase 6 — Criminal Network & Relationship Analysis (DONE)
Covers Area 2.
- **Network API** (`network.py`): `/api/network/person/{id}` (ego network, depth 1-2), `/api/network/gang/{id}` (gang member network), `/api/network/overview` (most-connected offenders + gang clusters).
- **Interactive graph visualization** (`NetworkGraph.tsx`): self-contained force-directed SVG layout (no external library) with hover highlighting and click-to-drill-down.
- **NetworkView** (`NetworkView.tsx`): a new NETWORK tab — pick a top offender or organized-crime group to render its association web; click any node to expand its network.
- Organized-crime clusters surfaced via gang membership; repeat-offender connectivity ranked by edge degree.
- **Verified:** e.g. "Royal Tigers" gang network (7 nodes/8 edges), most-connected offenders with 9 links each.

### ✅ Phase 7 — Pattern, Trend & Hotspot Analytics (DONE)
Completes Area 3.
- **Hotspot API** (`hotspots.py`): `/api/hotspots` (geo crime points + district hotspots + emerging 90-day surges) and `/api/patterns/mo` (modus-operandi: top descriptions per crime type).
- **Hotspot map** (`HotspotView.tsx`): self-contained SVG geo-scatter projecting lat/long onto a Karnataka view, coloured by crime type with district-volume halos, plus top-hotspot ranking and emerging-surge alerts. New MAP tab.
- **Verified:** 154 points plotted, Hubli top hotspot (21), 8 emerging surges detected.

### ✅ Phase 8 — Sociological Crime Insights (DONE)
Covers Area 4.
- **`/api/sociological`**: accused breakdown by age band, gender, socio-economic status, education, occupation, plus headline insights.
- **InsightsView** (`InsightsView.tsx`): INSIGHTS tab with demographic bar charts and an insight banner, including a disclaimer that correlations are not determinants.

### ✅ Phase 9 — Offender Profiling & Risk Scoring (DONE)
Covers Area 5.
- **Risk model** (`insights.py`): 0-100 score from recidivism (cases as accused), crime severity weights, gang membership, and recency — with the factors exposed for explainability.
- **`/api/offenders`** (ranked repeat offenders) and **`/api/offenders/{id}`** (full behavioural profile: primary MO, crime-type distribution, gang affiliation, case history).
- **ProfilesView** (`ProfilesView.tsx`): PROFILES tab — ranked high-risk offenders with a colour-coded risk badge and a detailed, explainable profile panel.
- **Verified:** top offender "Nandini D'Souza" scored 100 (High), primary MO Murder, 7 cases.

### ✅ Phase 10 — Investigator Decision Support (DONE)
Covers Area 6.
- **`/api/cases/{fir}/summary`**: auto narrative summary + investigation timeline + investigative leads (repeat-offender flags, linked financial trails).
- **`/api/cases/{fir}/similar`**: similar past cases ranked by crime type + district + modus operandi, with their outcomes.
- Wired into chat as follow-ups: "summarize this case" → CASE_SUMMARY, "find similar cases" → SIMILAR_CASES.

### ✅ Phase 11 — Financial Crime & Transaction Analysis (DONE)
Covers Area 7.
- **`/api/financial/trails`**: suspicious money-trails (sender→receiver, amount, date) linked to FIRs, with flagged-account and total-amount summaries.
- **FinanceView** (`FinanceView.tsx`): FINANCE tab with stat cards and a suspicious-transaction table linked to cases.

### ✅ Phase 12 — Crime Forecasting & Early Warning (DONE)
Covers Area 8.
- **`/api/forecast`**: 3-month moving-average + trend projection of next-month volume, plus district early-warning alerts (60-day acceleration, severity-rated).
- **ForecastView** (`ForecastView.tsx`): FORECAST tab with a trend+projection chart and an alerts panel.
- **Verified:** next-month forecast 45, 9 active alerts, 32 suspicious transactions (₹1.2cr) traced.

### ✅ Phase 13 — Explainable AI & Transparent Analytics (DONE)
Covers Area 9.
- Chat responses now carry an **evidence trail**: intent, confidence, filters applied, records examined, data source, method, the Kannada→English interpretation, and (in debug) the SQL.
- **EvidencePanel**: an expandable "🔎 Why this answer?" on every AI reply, exposing the reasoning behind the result.

### ✅ Phase 14 — Security, RBAC & Governance + Deployment (DONE)
Completes Area 10 and production-readiness.
- **Password hashing**: PBKDF2-HMAC-SHA256 (stdlib) — plaintext passwords removed from the officer store.
- **Role-based access control**: `require_role()` dependency; the audit log is admin-only (officer → 403, admin → 200, verified).
- **Audit viewer UI** (`AuditView.tsx`): admin-only AUDIT tab listing every logged query with user, language, intent, and row count.
- **Deployment**: backend `Dockerfile`, frontend `Dockerfile` (nginx), `docker-compose.yml`, and `backend/.env.example` documenting all config.
- **Test suite**: `backend/tests/test_smoke.py` — 13 pytest cases (auth, queries, Kannada, follow-up context, intelligence endpoints, RBAC) — all passing via FastAPI TestClient.

### ✅ Betterment B1 — LLM-Powered Conversational Understanding (DONE)
Upgrades Area 1 from keyword-matching to genuine conversational AI.
- **Local LLM via Ollama** (`qwen2.5:3b`) as a decoupled understanding layer (`src/ai/ollama_client.py`, `src/ai/language_provider.py`): natural language → strict `{intent, entities}` JSON. Runs fully on-machine — free, private, no per-query cost.
- The LLM **never touches the database** — it only interprets; the existing parameterized query engine executes deterministically (injection-safe, auditable).
- **Automatic fallback** to the rule-based classifier if Ollama is unavailable/slow — the system never goes down. Switchable via `KSP_NLP_PROVIDER`.
- **Cold-start handled**: startup pre-warms the model and primes the system-prompt cache, so the first live query is fast.
- **Explainability**: the evidence panel now shows which engine understood the query ("ollama:qwen2.5:3b").
- **Verified** on unrehearsed queries: "which areas are seeing the most chain snatching lately?" → breakdown by district + Snatching filter; "give me a rundown of murder cases in mysuru" → SHOW; Kannada queries mapped to canonical English entities. Pytest pinned to the rule engine for determinism.

### ✅ Betterment B3 — Person Lookup & Profile Search (DONE)
Deepens Areas 1 & 5.
- **Person-by-name chat queries**: "all crimes done by Vikram Reddy" / "show me X's record" → PERSON_QUERY returns the person's summary (age, district, cases, risk level) plus their crimes as cards. Detected via the LLM intent AND a guarded regex fallback (works even without the LLM). Namesakes are disambiguated by picking the person with the most accused cases.
- **PROFILES search + full list**: the offenders list is no longer capped at 20 — it shows all repeat offenders, with a live search box that finds ANY accused criminal by name (`/api/offenders?search=`), scrollable.

### ✅ Betterment B2 — Larger Narrative Dataset (DONE)
Scaled the database and planted discoverable stories so analytics and the AI have real signal.
- **`generate_narrative_data.py`**: ~920 crimes (was 154), 1,500 persons, 2,650+ case links, 6 gangs, 530 accounts, 1,080+ transactions — same schema, no code/feature changes.
- **Planted narratives:** (1) "Shadow Hawks" chain-snatching gang escalating in specific Bengaluru Urban stations (shows as the top hotspot + a +77 emerging surge + a forecast alert + a network cluster); (2) a money-laundering ring (₹1.08cr across 5 flagged, connected accounts); (3) escalating repeat offender "Vikram Reddy" (theft→…→murder, leads the "Mysuru Mavericks"); (4) a festival-season theft spike.
- **Performance:** optimized `/api/offenders` from per-offender N+1 queries to bulk aggregation, so risk ranking stays fast at the larger scale.

---

## 3. Project Structure

```
ksp-crime-ai/
├── backend/
│   ├── main.py                      # FastAPI app, CORS, router registration, startup table creation
│   ├── ksp_crime_ai.db              # SQLite DB (gitignored)
│   ├── models/intent_en.joblib      # Trained NLP model
│   ├── generate_sample_data.py      # Seeds 154 sample crime records
│   ├── eval_nlp.py                  # NLP accuracy evaluation (held-out set)
│   ├── test_phase2.py / test_phase3.py / test_kannada.py   # End-to-end tests
│   └── src/
│       ├── api/
│       │   ├── auth.py              # HMAC token create/verify, officer store, auth dependency
│       │   └── routes/
│       │       ├── chat.py          # POST /api/chat — main query endpoint + audit write
│       │       ├── stats.py         # GET  /api/stats — dashboard analytics
│       │       ├── audit.py         # GET  /api/audit — audit log viewer
│       │       └── auth_routes.py   # POST /api/login, GET /api/me
│       ├── database/
│       │   ├── models.py            # Crime, District, CrimeType, PoliceStation, AuditLog
│       │   └── session.py           # Engine, session, create_tables
│       ├── nlp/
│       │   ├── intent_classifier.py # Intent prediction + rule-based entity extraction
│       │   ├── train_model.py       # Training data + training routine
│       │   └── kannada_support.py   # Kannada → English normalization
│       └── query_engine/
│           └── translator.py        # NLP output → parameterized SQL (SHOW/COUNT/BREAKDOWN)
└── frontend/
    └── src/
        ├── api.ts                   # API base, token storage, authenticated fetch
        ├── locale.ts                # Kannada localization maps + helpers
        ├── pages/ChatPage.tsx       # Main app: header, chat, cards, charts, view switching
        └── components/
            ├── Dashboard.tsx        # Analytics dashboard
            └── Login.tsx            # Officer login screen
```

---

## 4. How to Run

### Backend
```bash
cd backend
pip install -r requirements.txt
python generate_sample_data.py     # first time only — seeds the DB
python src/nlp/train_model.py       # first time only — trains the NLP model
python main.py                      # serves on http://localhost:8004
```

### Frontend
```bash
cd frontend
npm install
npm start                           # serves on http://localhost:3000
```

### Demo login credentials
| Username | Password    | Role     |
|----------|-------------|----------|
| officer  | ksp@2024    | officer  |
| admin    | admin@2024  | admin    |

### Useful environment variables (backend)
| Variable             | Default                                  | Purpose                          |
|----------------------|------------------------------------------|----------------------------------|
| `KSP_AUTH_REQUIRED`  | `true`                                   | Set `false` to disable auth (demos) |
| `KSP_SECRET_KEY`     | `dev-secret-change-me-in-production`     | Token signing secret             |
| `KSP_TOKEN_TTL`      | `28800` (8h)                             | Token validity in seconds        |
| `KSP_CORS_ORIGINS`   | `http://localhost:3000,...`              | Allowed CORS origins             |
| `KSP_EXPOSE_SQL`     | `false`                                  | Return generated SQL in responses (debug) |

Frontend: `REACT_APP_API_BASE` (default `http://localhost:8004`).

---

## 5. API Reference

| Method | Path          | Auth | Description                                |
|--------|---------------|------|--------------------------------------------|
| POST   | `/api/login`  | No   | Authenticate, returns `{token, name, role}`|
| GET    | `/api/me`     | Yes  | Current user info                          |
| POST   | `/api/chat`   | Yes  | Main query — `{text, language}` → answer + results |
| GET    | `/api/stats`  | Yes  | Dashboard aggregations                     |
| GET    | `/api/audit`  | Yes  | Recent audit log entries (`?limit=N`)      |
| GET    | `/health`     | No   | DB connectivity check                      |

**Supported intents:** `SHOW_CRIMES`, `COUNT_CRIMES`, `BREAKDOWN_CRIMES`, `UNKNOWN`.
**Extracted entities:** `location`, `crime_type`, `date_range`, `group_by`.

**Data coverage:** 154 sample records · 10 districts · 10 crime types
(Theft, Murder, Snatching, Robbery, Assault, Burglary, Rioting, Cheating, Forgery, Counterfeiting).

---

## 6. What's NOT done yet (roadmap to continue)

### High priority (production-readiness)
- [ ] **Migrate SQLite → PostgreSQL**; normalize schema and re-enable the FK relationships (currently denormalized, ORM relations commented out in `models.py`).
- [ ] **Real user store** with hashed passwords (bcrypt) instead of the hardcoded `OFFICERS` dict in `auth.py`. Add HTTPS.
- [ ] **Admin Audit Log viewer page** in the frontend (endpoint already exists at `/api/audit`).
- [ ] Rate limiting on the API; rotate `KSP_SECRET_KEY` out of code.

### Medium priority (features)
- [ ] **Map view** — lat/long already stored on every crime record; add a Karnataka map with markers.
- [ ] **More intents** — e.g. TREND comparisons, multi-filter aggregations, top-N queries.
- [ ] **Data export** — CSV/PDF download of query results.
- [ ] **Pagination + ORDER BY** for large SHOW result sets (currently capped at 1000).
- [ ] Wire up remaining nav items (HOME, ABOUT US, SERVICES, CONTACT, HELP are currently placeholders).

### NLP improvements
- [ ] Expand training data further; add more Kannada phrasings.
- [ ] Improve location extraction for taluks/police stations (currently district-focused).
- [ ] Consider a proper Kannada model rather than keyword normalization for free-form queries.

### Quality / ops
- [ ] Consolidate the many ad-hoc `test_*.py` scripts into a proper **pytest** suite + CI.
- [ ] Frontend tests (currently none).
- [ ] Dockerize backend + frontend; add Nginx for deployment.
- [ ] Remove leftover scaffolding (`index.tsx.backup`, `test.js`, duplicate `TestComponent.tsx`).

---

## 7. Known Limitations / Notes
- The database is **denormalized** for MVP simplicity — district/type/station are plain strings on the `crimes` table, not foreign keys.
- `schema.sql` in `docs/` uses PostgreSQL syntax, while the running DB is SQLite.
- Kannada support handles the **known vocabulary** (crime types, districts, the seeded descriptions). Free-form Kannada outside this vocabulary falls back to English / UNKNOWN.
- Auth tokens are stateless; there is no server-side logout/revocation (token simply expires).
- Demo credentials and the default secret key are for development only — **change before any real deployment.**

---

_Last updated: end of Phase 3. Repo: https://github.com/Sav-28/ksp_
