# PostgreSQL Persistence — Setup Guide

Fixes the "registered FIR disappears later" problem by moving from ephemeral
SQLite to a persistent, shared PostgreSQL database.

## Why this is needed

On Catalyst AppSail the app directory is read-only, so SQLite falls back to
`/tmp`. That path is **wiped on every restart/redeploy**, and each instance keeps
its **own copy**. So a newly registered FIR either vanishes on the next restart,
or isn't visible to a request served by a different instance.

PostgreSQL is persistent and shared by all instances, which resolves both.

## Code status

The application is **already PostgreSQL-ready** — no code changes needed:

- All analytics SQL is dialect-portable (`src/database/dialect.py` emits
  `to_char()`/`EXTRACT()` on PostgreSQL, `strftime()` on SQLite).
- Mixed-case official FIR table names are quoted in the `v_crimes` view
  (PostgreSQL folds unquoted identifiers to lowercase).
- The additive column migration uses portable types and `IF NOT EXISTS`.
- `postgres://` URLs are auto-normalised to `postgresql://`.
- Connection pooling is tuned for managed providers (`pool_pre_ping`,
  `pool_recycle`) so dropped idle connections don't cause request failures.
- Auto-seed only runs on an **empty** database, so it can never overwrite real data.

## Step 1 — Provision a managed PostgreSQL

Any provider works. Free tiers that suit a prototype:

| Provider | Notes |
|----------|-------|
| **Neon** (neon.tech) | Generous free tier, instant setup, serverless Postgres |
| **Supabase** (supabase.com) | Free tier, includes a table browser UI |
| **Render** (render.com) | Free Postgres instance |
| Self-hosted / on-premise | Best for real KSP deployment (data sovereignty) |

Copy the connection string it gives you. It will look like:

```
postgresql://user:password@host:5432/dbname?sslmode=require
```

> Most managed providers **require SSL** — keep `?sslmode=require` if present.

## Step 2 — Initialise the database (once)

```powershell
cd backend
$env:DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
python setup_postgres.py
```

This checks connectivity, creates the full schema (analytics + official FIR
tables + the `v_crimes` view), seeds the demo dataset, projects it into the
official FIR schema, and trains the risk model.

Use `python setup_postgres.py --skip-seed` to create the schema only — do this
if you're importing real KSP data instead of the demo dataset.

## Step 3 — Configure the deployment

Set these environment variables for the app (locally and on Catalyst):

```
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
KSP_AUTOSEED=false
KSP_SECRET_KEY=<a long random secret>
```

`KSP_AUTOSEED=false` is important: it guarantees the demo seeder never runs
against your persistent data.

## Step 4 — Verify persistence

1. Call `GET /api/system/info` (any logged-in user). Confirm:
   ```json
   { "database": { "backend": "postgresql", "persistent": true } }
   ```
2. Register a new FIR in the UI and note its 18-digit CrimeNo.
3. **Redeploy or restart** the backend.
4. Look the same CrimeNo up in CASE INVESTIGATION — it should still be there,
   with the offender profile intact.
5. Open the app in a second browser/device and confirm the same record is visible.

## Rollback

Nothing is destructive — to return to local SQLite just unset the variable:

```powershell
Remove-Item Env:DATABASE_URL
```

The app falls back to `sqlite:///./ksp_crime_ai.db` automatically.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `could not connect` | Wrong host/credentials, or SSL required — append `?sslmode=require` |
| `ModuleNotFoundError: psycopg2` | Run `pip install -r requirements.txt` (driver is included) |
| `server closed the connection unexpectedly` | Already mitigated by `pool_pre_ping`; lower `KSP_DB_POOL_RECYCLE` if a provider is very aggressive |
| Data still resets | `KSP_AUTOSEED` is not `false`, or `DATABASE_URL` isn't reaching the app — check `/api/system/info` |
| Relation does not exist | Run `python setup_postgres.py` against that database first |
