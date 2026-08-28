# Phase 2 Plan — Datathon 2026 (Shortlisted Round)

Deliverables are the same as round 1 (prototype brief, public GitHub repo, demo
video, deployed link, deck). So the goal this round is **not more features** —
it is to close the credibility gaps judges probe, and deepen the platform.

Round-1 honest score: ~80/100. Target: 90+.

**Current branch:** `feature/phase2-persistence`, not yet merged to `main`

See `DATABASE.md` for the persistence architecture, how to run it, and the full
verified list.

---

## Status at a glance

| ID | Item | Status |
|----|------|--------|
| P1a | Make the data layer genuinely PostgreSQL-portable | ✅ Done |
| P1b | Provision persistent PostgreSQL + initialise it | ✅ Done (Neon) |
| P1c | Point the running app at PostgreSQL and prove persistence | ✅ Done |
| P4 | Second measured model — forecasting with a backtest | ✅ Done |
| P1d | Set Catalyst env vars, redeploy, verify live | ⏳ **Next** (needs console access) |
| P1e | Merge to `main` | ⏳ After P1d |
| P2.2 | Catalyst File Store for accused photos | ⬜ Planned |
| P3 | Real / realistic data ingestion | ⬜ Planned |
| P2.3/2.4 | Catalyst managed auth, scheduled Functions | ⬜ Optional |
| P5 | Re-record demo video, update deck + README | ⬜ Last |

---

## ✅ P1a — Data layer made PostgreSQL-portable (done)

The README claimed a "DB-agnostic ORM", but that was **not true**. Six modules
emitted SQLite-only `strftime()` SQL, so pointing `DATABASE_URL` at PostgreSQL
would have failed immediately.

Fixed:
- Added `src/database/dialect.py` — `year_month()` / `year()` / `month_number()`
  emit SQLite `strftime()` or PostgreSQL `to_char()` / `EXTRACT()` as appropriate.
- Ported all raw analytics SQL: stats, forecast, anomalies, seasonal trends, ML
  feature extraction, query-engine month grouping.
- Quoted mixed-case identifiers in the `v_crimes` view (PostgreSQL folds
  unquoted names to lowercase, which broke the official FIR tables).
- Made the additive column migration portable (`TIMESTAMP`, `IF NOT EXISTS`).
- Normalised legacy `postgres://` URLs to `postgresql://`.
- Tuned pooling for managed databases (`pool_pre_ping`, `pool_recycle`) so
  silently-dropped idle connections don't fail requests.
- Guarded auto-seed to run **only** on an empty database.
- Added `GET /api/system/info` — reports DB backend, persistence mode, seeding
  and ML status.

### Three latent bugs SQLite had been hiding
Surfaced only once a real FK-enforcing database was used:
1. **FK insert ordering** — parents inserted after children (`District` before
   `State`). Fixed with explicit `db.flush()` between dependency levels.
2. **Thousands of network round-trips** — the projection queried ~3× and flushed
   once *per case*. Restructured into 4 batched passes with bulk preloading.
3. **Non-deterministic row order + UNIQUE collisions** — `query(Crime).all()` had
   no `ORDER BY`, so CrimeNo serials differed between runs and the bulk rewrite
   of the UNIQUE `fir_number` collided. Fixed with `ORDER BY id` and a
   temporary-value parking step.

Testing technique worth keeping: **`PRAGMA foreign_keys=ON` in SQLite** faithfully
reproduces PostgreSQL's immediate FK enforcement, so these can be tested locally
without a remote database.

## ✅ P1b — Persistent database provisioned (done)

Neon PostgreSQL 18.4, initialised via `python setup_postgres.py`:
- 920 crimes · 1,500 persons · 2,661 case links
- Official FIR schema complete: 920 CaseMaster, 1,338 Accused, 1,118 Victim,
  280 ArrestSurrender, 478 chargesheets
- Risk model retrained on it: **ROC-AUC 0.992, accuracy 0.977**

---

## ✅ P1c — Persistence proven locally (done)

```powershell
cd backend
$env:DATABASE_URL="<neon connection string>"
$env:KSP_AUTOSEED="false"
python main.py
```

Then, in the app (or via the API):
1. `GET /api/system/info` → expect `"backend": "postgresql"`, `"persistent": true`.
2. Register a new FIR; note its 18-digit CrimeNo.
3. **Stop and restart** the backend.
4. Look that CrimeNo up in CASE INVESTIGATION — it must still be there, with the
   offender profile intact. *(This is the original bug, proven fixed.)*
5. Open a second browser and confirm the same record is visible.

**Acceptance:** the record survives a restart and is visible from two clients.
**Result:** passed — the FIR and its offender profile survived a backend restart
and were visible from a second client. The original bug is fixed.

Two further fixes came out of running on Neon:
- Casework endpoints failed on PostgreSQL (unquoted mixed-case identifiers and a
  `GROUP BY` that SQLite tolerates but PostgreSQL rejects).
- The FIR projection is now written in 100-case committed chunks, because
  serverless PostgreSQL drops long transactions partway through ~900 cases.

## ⏳ P1d — Deploy with persistence (next)

**Blocker fixed first:** `deploy.ps1` skipped vendoring whenever
`backend/vendor/fastapi` existed, so the newly added `psycopg2` driver would
never have shipped and the live app would have hit `ModuleNotFoundError` on its
first database call. Vendoring is now keyed on a hash of `requirements.txt` and
re-runs on any change, plus a pre-deploy step aborts if any requirement is
missing from `vendor/`. `psycopg2-binary 2.9.10` is vendored.

Set in the Catalyst environment (not in the repo):
```
DATABASE_URL=<neon connection string>
KSP_AUTOSEED=false
KSP_SECRET_KEY=<long random secret>
```
Then `./deploy.ps1` and re-verify `/api/system/info` on the live URL, plus the
register → redeploy → still-there check.

## ⏳ P1e — Merge to `main`

Only after P1c and P1d pass.

---

## ⬜ P2.2 — Catalyst File Store for accused photos

**Why:** photos are currently base64 blobs inside the database — it bloats rows
and doesn't scale. Moving them to File Store also adds a second real Catalyst
service to the submission (currently only AppSail).

**Plan:** upload on FIR registration, store the returned file id/URL on
`persons`, serve via a thin API route, keep base64 as a fallback so nothing
breaks if File Store is unavailable.

## ✅ P4 — Second measured model (done)

Forecasting was a 3-month moving average with **no evaluation**, so there was no
way to say whether it worked.

`src/ml/forecast_model.py` now holds ten candidate forecasters (naive, mean3,
wma3, drift, seasonal naive, linear trend, the old ma_trend, damped trend, SES,
Holt damped) and scores them all with **walk-forward one-step-ahead backtesting**
— train on months 1..t, predict t+1, step forward, never peeking at the future.
It selects the best by MAE and reports MAE/RMSE/MAPE plus improvement over the
naive baseline, surfaced through `decision_support.py`.

Deliberately pure Python (no numpy/sklearn at runtime) so it works on the slim
cloud build, like the risk model. Simple models are the right call here: with
~2 years of monthly history a high-capacity model would overfit, and a measured
error against a baseline is more defensible than an unvalidated complex model.

Measured live via `GET /api/forecast`, which is the authoritative source.

**Do not pin these figures in documentation.** Re-seeding regenerates the monthly
series relative to the current date, so both the winning method and its error move.
Observed across three re-seeds during development:

| Re-seed | Selected | MAE | vs naive baseline |
|---|---|---|---|
| 1 | `holt_damped` | 10.18 | 9.0% better |
| 2 | `ma_trend` | 9.11 | 16.7% better |
| 3 | `holt_damped` | 8.18 | 26.9% better |

That spread is the honest picture: the *mechanism* is stable and the metric is
always measured on held-out months, but no single number is permanent. The point
worth defending is that the model is selected and scored rather than asserted.

A useful consequence: the interval width is derived from the same backtest RMSE,
so when the data gets noisier the stated uncertainty widens with it.

Also fixed while doing this: the seeder had a **recency cliff** (the current
partial month dragged the trend down). `split_complete_months()` now separates
the still-accumulating month so it corrupts neither the backtest nor the forecast.

## ⬜ P3 — Real / realistic data

**Why:** every insight currently sits on synthetic data with planted patterns.

**Plan:** ingest public NCRB / KSP district-level statistics into the official FIR
schema so district and crime-type distributions are real; keep the synthetic
narrative layer only where real data isn't available (gangs, financial trails)
and **label it clearly**.

## ⬜ P2.3 / P2.4 — Optional Catalyst depth
Managed authentication; scheduled Functions/Cron for nightly model retraining and
alert generation.

## ⬜ P5 — Polish for judging
Re-record the demo video (show persistence: register → redeploy → still there),
update the deck (Catalyst services, real-data note, second model metric), refresh
README and `DEMO_SCRIPT.md`.

---

## Working agreement
- Feature branches only; `main` stays deployable and is merged into only after
  verification.
- Every change verified (tests + a real check) before commit.
- No secrets in the repo — `DATABASE_URL`, `KSP_SECRET_KEY` via environment only.
- **Rotate the Neon password** (it was pasted in chat during setup), then update
  `DATABASE_URL` wherever it is configured.

## Untracked local helper files
`make_flow.py`, `make_arch.py`, `process_flow.png`, `architecture.png` — diagram
generators for the deck. Keep locally or commit to a `docs/` folder; they are not
part of the application.
