# Database & Persistence — what's built

Reference for the Phase 2 persistence work: the storage architecture, how to run
it, what has been verified, and what is still open.

**Branch:** `feature/phase2-persistence`, not yet merged to `main`
(`git rev-list --count main..HEAD` for the current commit count)

---

## The problem this solved

The deployed app stored data in **SQLite on an ephemeral Catalyst path**. Every
restart wiped it, so a registered FIR disappeared. The README also claimed a
"DB-agnostic ORM", which was not true: six modules emitted SQLite-only
`strftime()` SQL, so simply pointing `DATABASE_URL` at PostgreSQL would have
failed on the first analytics query.

Now: PostgreSQL is a real, supported backend, and the same code still runs on
SQLite for local development.

---

## Architecture

### Two schemas, one id space

| Layer | Tables | Role |
|-------|--------|------|
| Analytics | `crimes`, `persons`, `case_persons`, `fir_details`, `gangs` | Flat, fast to query; what the API and ML read |
| Official FIR | `CaseMaster`, `Accused`, `Victim`, `ArrestSurrender`, `ChargesheetDetails`, `ActSectionAssociation`, ... | Normalized Karnataka Police system-of-record shape |

`migrate_to_fir_schema.py` projects analytics rows into the official schema.
`CaseMasterID` is deliberately aligned to `crimes.id` so both layers share one id
space, and the projection rewrites `crimes.fir_number` to the **official 18-digit
CrimeNo** so every read path exposes the same number.

`v_crimes` is a compatibility view that flattens the official tables back into
the `crimes` shape, so readers can move onto the system of record without
rewriting every query.

CrimeNo layout: `1` category + `4` district + `4` unit + `4` year + `5` serial.

### Files that matter

| File | Purpose |
|------|---------|
| `src/database/session.py` | Engine, pooling, `DATABASE_URL` handling, idempotent column migration, `v_crimes` view |
| `src/database/dialect.py` | Cross-dialect SQL helpers (`year_month`, `year`, `month_number`) |
| `src/database/models.py` | Analytics ORM models |
| `src/database/models_fir.py` | Official FIR ORM models |
| `migrate_to_fir_schema.py` | Analytics -> official projection |
| `setup_postgres.py` | One-command production DB initialisation |
| `src/api/routes/system.py` | `GET /api/system/info` diagnostics |

### Portability layer

Date-part extraction is spelled differently per engine, so raw SQL asks
`dialect.py` for the right expression instead of hard-coding SQLite:

```
SQLite      strftime('%Y-%m', col)
PostgreSQL  to_char(col, 'YYYY-MM')
```

Also handled: mixed-case identifiers are quoted (PostgreSQL folds unquoted names
to lowercase), `postgres://` URLs are normalized to `postgresql://` for
SQLAlchemy 2.x, and additive migrations use portable types (`TIMESTAMP`,
`IF NOT EXISTS`).

### Connection pooling

Managed PostgreSQL silently closes idle connections, which surfaces as
"server closed the connection unexpectedly" on the next request. The engine uses
`pool_pre_ping=True` plus `pool_recycle` (default 280s), tunable via
`KSP_DB_POOL_RECYCLE`, `KSP_DB_POOL_SIZE`, `KSP_DB_MAX_OVERFLOW`.

---

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `sqlite:///./ksp_crime_ai.db` | PostgreSQL usually needs `?sslmode=require` |
| `KSP_AUTOSEED` | `true` | **Set `false` on a persistent DB** so real data is never re-seeded |
| `KSP_SECRET_KEY` | dev fallback | Long random string in production |
| `KSP_DB_POOL_RECYCLE` / `_SIZE` / `_MAX_OVERFLOW` | 280 / 5 / 10 | Pool tuning |

Auto-seed is additionally guarded to run only on an **empty** database, so it
cannot clobber real data even if the flag is left on.

Secrets live in the environment only, never in the repo.

---

## Running it

Local development (SQLite, zero setup):

```powershell
cd backend
python main.py
```

Against PostgreSQL:

```powershell
cd backend
$env:DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
$env:KSP_AUTOSEED="false"
python main.py
```

Initialising a fresh production database (schema + seed + projection + model
training, run once):

```powershell
$env:DATABASE_URL="postgresql://..."
python setup_postgres.py
# add --skip-seed for schema only, before importing real KSP data
```

Checking what a running instance is using:

```
GET /api/system/info
-> database.backend, database.persistent, seeding.autoseed_enabled,
   data counts, ml_model.active
```

---

## Deployment

AppSail does **not** pip-install on the server, so Linux wheels are vendored into
`backend/vendor` before deploy. `deploy.ps1` now:

1. builds the frontend and copies it into `backend/static` (single origin, no CORS)
2. re-vendors whenever `requirements.txt` changes, tracked by a SHA-256 stamp
3. cross-checks every requirement against `vendor/` and **aborts** if one is missing
4. runs `catalyst deploy`

Step 2 and 3 exist because the previous script skipped vendoring whenever
`vendor/fastapi` existed. Adding `psycopg2-binary` therefore would not have been
vendored, and the deployed app would have failed at its first database call.
`psycopg2-binary 2.9.10` is now vendored as a manylinux wheel.

Keep `deploy.ps1` ASCII-only. Windows PowerShell 5.1 reads it as ANSI, so a UTF-8
em dash decodes to a byte PowerShell treats as a smart quote, which unbalances
string literals and breaks parsing.

---

## Three latent bugs SQLite had been hiding

Only surfaced once a real FK-enforcing database was used:

1. **FK insert ordering** — parents inserted after children (`District` before
   `State`). Fixed with explicit `db.flush()` between dependency levels.
2. **Thousands of round-trips** — the projection queried ~3x and flushed once
   *per case*. Restructured into batched passes with bulk preloading.
3. **Non-deterministic order + UNIQUE collisions** — `query(Crime).all()` had no
   `ORDER BY`, so CrimeNo serials differed between runs and the bulk rewrite of
   the UNIQUE `fir_number` collided. Fixed with `ORDER BY id` and a
   temporary-value parking step.

Then, on Neon specifically: one transaction covering ~900 cases was fragile
because serverless PostgreSQL drops long transactions. The projection now writes
in 100-case chunks, committing each, so FK ordering holds within a chunk and
progress survives a dropped connection.

**Testing technique worth keeping:** `PRAGMA foreign_keys=ON` in SQLite
reproduces PostgreSQL's immediate FK enforcement, so this class of bug can be
caught locally without a remote database.

---

## Verified

- Neon PostgreSQL 18.4 initialised: 920 crimes, 1,500 persons, 2,661 case links
- Official FIR schema complete: 920 CaseMaster, 1,338 Accused, 1,118 Victim,
  280 ArrestSurrender, 478 chargesheets
- Risk model retrained on it: **ROC-AUC 0.992, accuracy 0.977**
- Persistence proven locally: register an FIR, restart the backend, the record and
  its offender profile are still there and visible from a second client
- Casework endpoints fixed on PostgreSQL (quoted identifiers + `GROUP BY`)
- Local SQLite projection re-verified complete: 920 crimes -> 920 CaseMaster
- `deploy.ps1` parses cleanly and its vendor check was tested both ways: passes
  with the real requirements, blocks when a dependency is absent
- App boots clean on SQLite after all of the above; `GET /api/system/info` and
  `GET /api/forecast` both return live, correct payloads

Not yet verified: the **live** deployment on PostgreSQL. That needs the Catalyst
environment variables set, which requires console access.

---

## Next

| ID | Item | Status |
|----|------|--------|
| P1d | Set Catalyst env vars, redeploy, verify live | **Next — needs your console access** |
| P1e | Merge to `main` | After P1d |
| P2.2 | Catalyst File Store for accused photos | Planned |
| P3 | Real / realistic data ingestion (NCRB / KSP) | Planned |
| P5 | Re-record demo, update deck + README | Last |

P4 (second measured model) is **done**: `src/ml/forecast_model.py` scores ten
candidate forecasters by walk-forward one-step-ahead backtesting, selects the
best by MAE, and reports error against a naive baseline. Pure Python, so it runs
on the slim cloud build like the risk model. Currently selects `holt_damped` at
MAE 10.18 vs the naive baseline's 11.19 (9.0% better, 16 evaluated months).

### P1d, concretely

Set in the Catalyst console (not in the repo):

```
DATABASE_URL=<neon connection string>?sslmode=require
KSP_AUTOSEED=false
KSP_SECRET_KEY=<long random secret>
```

Then `./deploy.ps1` and confirm on the live URL:

1. `GET /api/system/info` reports `"backend": "postgresql"`,
   `"persistent": true`, `"autoseed_enabled": false`
2. register an FIR, note the CrimeNo, redeploy, and look it up again

**Outstanding security task:** rotate the Neon password (it was pasted in chat
during setup), then update `DATABASE_URL` everywhere it is configured.
