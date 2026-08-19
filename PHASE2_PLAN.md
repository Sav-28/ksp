# Phase 2 Plan — Datathon 2026 (Shortlisted Round)

Deliverables are the same as round 1 (prototype brief, public GitHub repo, demo
video, deployed link, deck). So the goal this round is **not more features** —
it is to close the credibility gaps judges probe, and deepen the platform.

Current honest score: ~80/100. Target: 90+.

---

## What we are fixing (in priority order)

### P1 — Data persistence (the one real functional bug)
**Problem.** On Catalyst AppSail the app writes SQLite to `/tmp`, because the app
directory is read-only. `/tmp` is wiped on every restart / redeploy / scale event,
and each instance has its own copy. Consequences:
- An FIR registered on one device disappears later (DB reset, or a different
  instance served the request).
- On an empty DB, startup re-seeds the synthetic dataset — silently replacing
  anything that was added.

**Fix.** Move to a single persistent, shared database.
- Point `DATABASE_URL` at managed PostgreSQL (or Catalyst Data Store).
- Set `KSP_AUTOSEED=false` there so real data is never wiped.
- Seed once, then leave it.
- Verify: register an FIR → redeploy → the FIR and its offender profile are
  still there.

The app is already database-agnostic (SQLAlchemy), so this is mostly
provisioning + configuration, not a rewrite.

**Acceptance:** data survives a redeploy; the same record is visible from two
different browsers/devices.

---

### P2 — Deeper Catalyst integration
**Problem.** Our "Catalyst services used" answer is only **AppSail**. In a
Zoho-partnered datathon, broader platform use is likely to be scored.

**Fix — adopt in this order:**
1. **Catalyst Data Store / QuadDB** — persistent DB (also solves P1 → two birds).
2. **Catalyst File Store** — accused photos & FIR attachments (better than
   base64 blobs in the DB).
3. **Catalyst Authentication** — managed identity instead of our custom
   HMAC tokens (keep RBAC on top).
4. **Catalyst Functions / Cron** — scheduled jobs: nightly model retraining,
   anomaly/alert generation, digest reports.

**Acceptance:** the deck lists 3-4 Catalyst services actually in use, each
demonstrable in the video.

---

### P3 — Real / realistic data
**Problem.** Every insight sits on a synthetic dataset with planted patterns, so
judges discount the analytics.

**Fix.**
- Ingest public NCRB / KSP district-level statistics into the official FIR
  schema so district and crime-type distributions are real.
- Keep the synthetic narrative layer only where real data isn't available
  (gangs, financial trails) and **label it clearly**.

**Acceptance:** dashboard/hotspot numbers can be traced to a public source.

---

### P4 — Strengthen the AI/ML story
**Problem.** One trained model (offender risk, ROC-AUC 0.99). Forecasting is a
moving average; the LLM conversational layer is off in the cloud.

**Fix.**
- Add a **second measured model**: crime-volume / hotspot forecasting with a
  proper **backtest** (report MAE/RMSE against held-out months).
- Wire the **Ollama LLM** understanding layer into the deployed environment (or
  document precisely why it's on-prem only) so the conversational claim holds
  live, not just locally.
- Keep the graceful fallbacks — the system must never go down.

**Acceptance:** two models, each with a reported metric, both visible in the UI.

---

### P5 — Polish for judging
- Re-record the **demo video** showing persistence (register → redeploy → still
  there) and the new Catalyst services.
- Update the **deck**: new Catalyst services slide, real-data note, second model
  metric, refreshed benchmarking numbers.
- Update **README / DEMO_SCRIPT.md** to match the new architecture.

---

## Suggested execution order

1. **P1 + P2.1 together** — persistent DB via Catalyst Data Store (fixes the bug
   *and* adds a Catalyst service).
2. **P2.2** — File Store for accused photos.
3. **P4** — forecasting model with a backtest metric.
4. **P3** — real data ingestion.
5. **P2.3 / P2.4** — managed auth, scheduled functions (if time allows).
6. **P5** — video, deck, docs.

---

## Working agreement
- All work on a feature branch (`feature/phase2-*`), merged to `main` only after
  verification; `main` stays deployable at all times.
- Every change verified (tests + a live check) before merge.
- No secrets in the repo; production `KSP_SECRET_KEY` and DB credentials via
  environment variables only.

---

## Open decision (needed before starting P1)
**Persistent database choice:**
- **Catalyst Data Store / QuadDB** — scores better for the datathon (a real
  Catalyst service), tighter platform integration.
- **Managed PostgreSQL** — simpler, keeps the code fully portable/on-premise,
  works with the existing SQLAlchemy layer as-is.

Recommendation: **Catalyst Data Store** for the datathon, keeping the
PostgreSQL path documented so on-premise deployment stays possible.
