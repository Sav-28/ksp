# KSP Crime AI — Demo Script

> **See [DEMO.md](DEMO.md) first.** That is the current script: it opens on the
> custody clock, centres on Catalyst Zia reading a complainant statement, closes on
> the service map, and carries verified figures plus a "do not claim on camera" list.
> This file is kept for its story framing and its Q&A prep, both of which still hold.

A tight, story-driven walkthrough for judges. One connected narrative beats a
feature tour. Roughly 2 minutes for the core (the restart in step 7 sets the pace),
~5 minutes for the full run.

> **Honest framing (say this up front):** "All data is synthetic with planted
> patterns; the platform runs on the **official Karnataka Police FIR schema**,
> persists to **Catalyst Stratus**, and the ML/analytics pipeline is
> ready to retrain on real KSP data with no code changes."

---

## The core demo — "Shadow Hawks chain-snatching ring"

**Login:** `supervisor / super@2024` (has every tab, including register + close).

1. **Register the FIR (write workflow).** → REGISTER FIR tab.
   - Crime Type: *Snatching*, District: *Bengaluru Urban*, Station: *Koramangala*.
   - On the map, click the exact spot (or search "Koramangala") — a pin drops.
   - Add two accused; type the same gang name **"Shadow Hawks"** for both.
   - Submit. **Say:** *"One form writes across the official FIR schema, generates
     an 18-digit CrimeNo, auto-links the two accused in the network, and tags the
     gang."* The success banner shows the CrimeNo + "co-accused network link created".

2. **See it on the map.** → MAP tab. **Say:** *"It's already a data point in the
   Bengaluru Urban hotspot — the same lat/long we pinned."*

3. **See the network build itself.** → NETWORK tab. Search the accused (or open
   the Shadow Hawks group). **Say:** *"The two accused are now linked — the graph
   builds from real co-accused data. Centre = focus person, inner ring = direct
   links, outer ring = second-degree."*

4. **Offender risk — real ML.** → PROFILES tab. Point at the green badge:
   **"🤖 Risk scores by trained ML model · ROC-AUC 0.992".** Open a high-risk
   offender. **Say:** *"This score is a trained model, not a formula —
   ROC-AUC 0.992 on held-out data — with explainable risk factors below."*

5. **A second measured model.** → FORECAST tab. Point at the green badge —
   **"🤖 Forecast by backtested model"** with the selected method, MAE, and a chip
   showing the percentage improvement over the naive baseline. **Say:** *"The
   forecaster isn't hand-picked. Ten candidates are scored by walk-forward
   backtesting on held-out months, and the lowest-error one wins. We report the
   error against a naive baseline, so you can see what it's worth."* Point at the
   shaded band on the chart: *"And the projection carries an 80% interval derived
   from the error we actually measured, not an assumed variance."*

   > **Read the badge live, don't quote a number from memory.** The winning method
   > and its error depend on the seeded data, so they can change after a re-seed.

6. **Close the loop — decision support + governance.** In the chat, ask
   *"summarize this case"* and *"find similar cases"*. Then → CASE INVESTIGATION,
   pull the CrimeNo, and as supervisor **close the case**. **Say:** *"Investigators
   advance a case; only supervisors can close it — role-based access, and every
   action is audited."*

7. **Prove it persists.** → Redeploy, then reopen CASE INVESTIGATION and pull the
   same CrimeNo. **Say:** *"The record survives a restart. AppSail's /tmp is wiped
   every time, so the database file is snapshotted to Catalyst Stratus after each
   write and restored on the first request after a boot. Earlier it ran on bare
   ephemeral SQLite and every restart wiped the data — that's fixed, and
   `/api/system/info` reports the storage mode so you never have to guess."*

   > **Film this beat.** Persistence was the platform's weakest point, so showing
   > register → restart → still-there is the single most convincing moment in the
   > demo. Show `/api/system/info` returning `"backend": "sqlite"`,
   > `"persistent": true` and `"restore_result": "restored"` — the last field is the
   > proof, since it means this instance booted empty and pulled the data back.

---

## Full 5-minute run (covers all 10 challenge areas)

| Step | Tab / action | Challenge area | One-liner |
|------|--------------|----------------|-----------|
| 1 | AI Assistant — ask "show snatching in Bengaluru last month", then a Kannada query; export PDF | 1 | Bilingual conversational retrieval + evidence trail |
| 2 | NETWORK — open Shadow Hawks | 2 | Co-accused + gang network, grounded in real cases |
| 3 | DASHBOARD + MAP | 3 | Trends, hotspots, emerging surges |
| 4 | INSIGHTS | 4 | Demographic + social-risk-factor correlations |
| 5 | PROFILES | 5 | **Trained ML risk model (ROC-AUC 0.992)** + explainable factors |
| 6 | Chat: "summarize / similar cases" | 6 | Case summaries, timelines, leads |
| 7 | FINANCE | 7 | Suspicious money-trail (demo integration) |
| 8 | FORECAST | 8 | **Backtested forecast** with MAE vs naive baseline + 80% interval, plus anomaly detection (z-score) |
| 9 | "Why this answer?" on any reply | 9 | Explainable evidence trail |
| 10 | REGISTER FIR / close case / AUDIT | 10 | RBAC write workflow + audit log |

---

## Anticipated judge questions (and honest answers)

- **"Is this real machine learning?"** — Two models, both with a measured metric.
  Offender risk is trained on demographic/severity/gang features: **ROC-AUC 0.992**
  on a held-out split, with feature importances shown. Crime-volume forecasting
  **selects** among ten candidate forecasters by walk-forward one-step-ahead
  backtesting over 16 held-out months, reports its MAE against a naive baseline,
  and attaches an 80% prediction interval from the measured RMSE. Read the current
  figures off the badge — they move with the data. Anomaly detection is z-score —
  deliberately transparent for a policing context. Both models run as pure Python
  at inference time, so the cloud build needs no heavy ML stack.
- **"Why such simple models?"** — With about two years of monthly history a
  high-capacity model would overfit. A measured error against a baseline is more
  defensible than an unvalidated complex model, and in policing an explainable
  score beats a marginally better black box.
- **"Is the data real?"** — No. It's synthetic with planted patterns, and we label
  that rather than dress it up. The district and crime-type mixes are
  **illustrative, not derived from published crime statistics** — they live in
  `backend/data/reference/karnataka_crime_reference.json` where every block records
  its own basis and source, so recalibrating against NCRB or KSP figures is a data
  edit, not a code change. The database is the **official KSP FIR schema**
  (18-digit CrimeNo), so real data drops in without code changes.
- **"Does the data survive a restart?"** — Yes, verified by registering an FIR and
  redeploying. The SQLite file is snapshotted to Catalyst Stratus after each write
  and restored on the first request after a boot, so nothing external to Catalyst is
  involved. `/api/system/info` reports the mode and whether the round trip has
  actually been observed, not merely configured. Be straight about the limit if
  asked: the whole file is the unit of transfer, so it is single-instance — with more
  than one instance the last writer wins, and PostgreSQL is the answer at that scale.
  Auto-seeding is off in production and in any case only runs on an empty database,
  so real data can never be overwritten by the demo seeder.
- **"What about privacy / data sovereignty?"** — Parameterized SQL (injection-safe),
  hashed passwords, role-based access, full audit log, and the optional LLM runs
  on-premise — sensitive data never leaves government infrastructure.
- **"How does the network detect organized crime?"** — Every edge is a real
  co-accused link (shared FIR); registering multi-accused FIRs and gang tags
  build clusters automatically. Hover any edge to see the linking CrimeNo(s).

---

## Reset before demoing

Local (SQLite) reset:
```bash
cd backend
python generate_narrative_data.py    # fresh demo dataset (deterministic: seed 2025)
python migrate_to_fir_schema.py      # project into the official FIR schema
python train_risk_model.py           # retrain the risk model
python main.py                       # start API (also auto-does the above if empty)
```

> Run the projection **after** re-seeding. Re-seeding clears the official case
> tables, so skipping it leaves the analytics layer and the system of record
> disagreeing.

**Do not run this against the production database.** It clears and rewrites
everything. Production has `KSP_AUTOSEED=false` for exactly this reason. To prepare
a fresh production database instead, use `python setup_postgres.py` once.
Demo logins: `supervisor/super@2024`, `investigator/invest@2024`,
`analyst/analyst@2024`, `policymaker/policy@2024`.
