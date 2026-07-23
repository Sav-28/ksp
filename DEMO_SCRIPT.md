# KSP Crime AI — Demo Script

A tight, story-driven walkthrough for judges. One connected narrative beats a
feature tour. Total: ~90 seconds for the core, ~5 minutes for the full run.

> **Honest framing (say this up front):** "All data is synthetic with planted
> patterns; the platform runs on the **official Karnataka Police FIR schema** and
> the ML/analytics pipeline is ready to retrain on real KSP data with no code
> changes."

---

## The 90-second core demo — "Shadow Hawks chain-snatching ring"

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
   **"🤖 Risk scores by trained ML model · ROC-AUC 0.979".** Open a high-risk
   offender. **Say:** *"This score is a trained RandomForest, not a formula —
   AUC 0.98 on held-out data — with explainable risk factors below."*

5. **Close the loop — decision support + governance.** In the chat, ask
   *"summarize this case"* and *"find similar cases"*. Then → CASE INVESTIGATION,
   pull the CrimeNo, and as supervisor **close the case**. **Say:** *"Investigators
   advance a case; only supervisors can close it — role-based access, and every
   action is audited."*

---

## Full 5-minute run (covers all 10 challenge areas)

| Step | Tab / action | Challenge area | One-liner |
|------|--------------|----------------|-----------|
| 1 | AI Assistant — ask "show snatching in Bengaluru last month", then a Kannada query; export PDF | 1 | Bilingual conversational retrieval + evidence trail |
| 2 | NETWORK — open Shadow Hawks | 2 | Co-accused + gang network, grounded in real cases |
| 3 | DASHBOARD + MAP | 3 | Trends, hotspots, emerging surges |
| 4 | INSIGHTS | 4 | Demographic + social-risk-factor correlations |
| 5 | PROFILES | 5 | **Trained ML risk model (AUC 0.98)** + explainable factors |
| 6 | Chat: "summarize / similar cases" | 6 | Case summaries, timelines, leads |
| 7 | FINANCE | 7 | Suspicious money-trail (demo integration) |
| 8 | FORECAST | 8 | Next-month projection + **anomaly detection (z-score)** |
| 9 | "Why this answer?" on any reply | 9 | Explainable evidence trail |
| 10 | REGISTER FIR / close case / AUDIT | 10 | RBAC write workflow + audit log |

---

## Anticipated judge questions (and honest answers)

- **"Is this real machine learning?"** — Yes for offender risk: a RandomForest
  trained on demographic/severity/gang features, ROC-AUC 0.979 on a held-out
  split, with feature importances shown. Forecasting and anomaly detection are
  transparent statistics (moving-average, z-score) — deliberately explainable for
  a policing context, not a black box.
- **"Is the data real?"** — No, it's synthetic with planted patterns for the demo.
  The database is the **official KSP FIR schema** (28 tables, 18-digit CrimeNo),
  so real data drops in without code changes; the ML retrains on startup.
- **"What about privacy / data sovereignty?"** — Parameterized SQL (injection-safe),
  hashed passwords, role-based access, full audit log, and the optional LLM runs
  on-premise — sensitive data never leaves government infrastructure.
- **"How does the network detect organized crime?"** — Every edge is a real
  co-accused link (shared FIR); registering multi-accused FIRs and gang tags
  build clusters automatically. Hover any edge to see the linking CrimeNo(s).

---

## Reset before demoing
```bash
cd backend
python generate_narrative_data.py   # fresh calibrated dataset
python migrate_to_fir_schema.py      # project into official schema
python train_risk_model.py           # retrain the risk model
python main.py                       # start API (also auto-does the above if empty)
```
Demo logins: `supervisor/super@2024`, `investigator/invest@2024`,
`analyst/analyst@2024`, `policymaker/policy@2024`.
