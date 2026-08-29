# Capability coverage

An auditable map from the six scored capabilities to where each one can be seen
working. Every row names a route or endpoint, so a reviewer can check a claim
rather than take it on trust.

**Gaps are stated.** Where coverage is partial or a method has a known limitation,
it says so. Implying completeness would cost more than admitting a shortfall,
because a single unsupported claim puts every other one in doubt.

Sign in with `supervisor / super@2024` to see every screen. All data is synthetic;
see [Data provenance](#data-provenance).

---

## C1 · Advanced Visualization

**Where:** `DASHBOARD`, `MAP`, `FORECAST`, `COMPLIANCE`
**API:** `GET /api/stats`, `/api/hotspots`, `/api/forecast`, `/api/compliance/report`

- Monthly volume as columns with a three-month rolling average, and the
  in-progress month drawn hatched so its incompleteness is visible rather than
  implied.
- Leaflet incident map over Karnataka district boundaries: per-incident points
  coloured by offence type, district volume as proportional circles, and a
  **rendered key** — the colour encoding is stated, not left to be guessed.
- Ruled distribution tables carrying count, share and a proportional bar.
- Diverging bars centred on parity in `INSIGHTS`, so direction rather than
  magnitude is the primary visual.
- One shared visual language (`frontend/src/govStyles.ts`): ruled tables, square
  corners, a palette in which colour carries severity rather than decoration, and
  the "as on <date>" convention of an official return.

**Gap.** Applied to six of eleven screens. `NETWORK`, `PROFILES`, `REGISTER FIR`
and `AUDIT` still use the earlier styling, so the app is not yet visually uniform.

---

## C2 · Criminological Network & Link Analysis

**Where:** `NETWORK`
**API:** `GET /api/network/overview`, `/api/network/person/{id}`

- Co-accused graph built from real shared-FIR links, not inferred similarity —
  every edge traces to a case.
- Second-degree expansion from a focus person; gang grouping with roles.
- Financial counterparty analysis in `FINANCE`: **layering detection** flags
  accounts that both receive and forward flagged funds, which is what separates a
  laundering chain from unrelated large transfers. Throughput ratio is value sent
  over value received; at or near 1.00 the account acted as a conduit. On the
  seeded data this surfaces three conduits at ratios 0.88–1.09.

**Gap.** No community detection algorithm (for example Louvain) — grouping is by
recorded gang membership and direct co-accused links. No cross-case identity
resolution: the official `Accused` table has no person key, so the same individual
appearing in two cases is not yet merged. That is the single largest gap in this
capability and is the next thing to build.

---

## C3 · Sociological & AI-Driven Predictive Dashboards

**Where:** `INSIGHTS`, `PROFILES`
**API:** `GET /api/sociological`, `/api/offenders`, `/api/offenders/{id}`

This is the capability the project treats most carefully, because the obvious
implementation is wrong.

- Every demographic band is reported as **three** numbers: share among accused,
  share in the recorded population, and a **representation index** between them
  where 1.0 is parity. A raw distribution of accused is not a finding — a band
  that is large in the population will be large among accused.
- A departure is reported only if it clears an effect-size floor **and** a
  two-proportion significance test **Bonferroni-corrected** across all ~35 cells
  tested. Without that correction the analysis reported "High" socio-economic
  status at 1.23× and "Vendor" occupation at 1.50×, both noise on unbiased data;
  correction reduced ten reported findings to four.
- **Dimensions showing nothing are named explicitly.** Five of six report no
  material difference. A null result is a result, and stating it stops a reader
  inferring a pattern from bar lengths that only reflect group size.
- Offender risk scoring with explainable per-factor contributions.

**Verified correction.** The earlier version presented "28.7% of accused are in the
'Low' socio-economic band" as a risk factor. Low is 30.9% of the population, so
accused were slightly *under*-represented there (index 0.93) — the output pointed
the wrong way. That class of error is now structurally prevented.

**Gap.** The population baseline is the recorded person set, not census data, so
an index measures over-representation among *recorded* accused — shaped by
reporting and enforcement as well as offending. Stated in the UI. Caste and
religion exist in the FIR schema and are deliberately excluded from every analysis.

---

## C4 · Pattern & Trend Discovery

**Where:** `FORECAST`, `MAP`, `DASHBOARD`
**API:** `GET /api/forecast`, `/api/trends/seasonal`, `/api/anomalies`

- Monthly series with a rolling average; seasonal pattern by month of year with a
  festival-window comparison against the rest of the year.
- Anomaly detection by z-score against each district's or offence type's **own**
  historical mean, so a large district is not permanently flagged for being large.
- Emerging-surge detection over 60- and 90-day windows, for districts and offence
  types, with a rise from nil correctly treated as high severity.
- Age-by-offence gradient: median accused age runs from 23 for snatching to 42 for
  forgery.

**Gap.** Seasonality is monthly. There is no hour-of-day or day-of-week analysis,
and no spatiotemporal clustering (for example ST-DBSCAN) — hotspots are aggregated
by district and station rather than discovered as clusters in space and time.

---

## C5 · Network & Behavioural Analysis

**Where:** `PROFILES`, `CASE INVESTIGATION`, `NETWORK`
**API:** `GET /api/offenders/{id}`, `/api/person/{id}`, `/api/crime/{crime_no}`

- Offender profile: case history, offence-type distribution, primary modus
  operandi, gang affiliation, risk factors.
- Case dossier by 18-digit CrimeNo with the full official-schema record, persons
  by role with risk chips, and the incident location.
- Co-accused associations with the linking case.

**Gap.** Behavioural depth is thinner than the other capabilities. There is no
escalation analysis, no recidivism-interval measurement and no MO-evolution over
time. Primary MO is the modal offence type rather than a signature derived from
narrative text.

---

## C6 · AI/ML-Driven Intelligence

**Where:** `PROFILES` (risk badge), `FORECAST` (model badge), `AI ASSISTANT`
**API:** `GET /api/offenders`, `/api/forecast`, `POST /api/chat`

**Two models, each with a measured metric.** Both run as pure Python at inference
time, so the slim cloud build needs neither scikit-learn nor numpy.

| Model | Validation | Result |
|---|---|---|
| Offender risk | Held-out test split | ROC-AUC **0.992**, accuracy **0.977** |
| Crime-volume forecast | Walk-forward one-step-ahead backtest, 16 held-out months | Reported live; typically 15–25% lower MAE than a naive baseline |

- The forecaster is **selected**, not chosen by hand: ten candidates are scored
  one-step-ahead and the lowest-MAE method wins. The point forecast carries an 80%
  interval derived from the measured backtest RMSE rather than an assumed variance.
- Bilingual natural-language querying (English and Kannada) with intent
  classification, and a rule-based fallback when the ML classifier is unavailable.

**Do not quote the forecast figure from memory.** It is dataset-dependent: across
three re-seeds it selected `holt_damped` at MAE 10.18, `ma_trend` at 9.11, and
`holt_damped` at 8.18, because the monthly series regenerates relative to the
current date. `GET /api/forecast` is authoritative. The risk-model figure is stable
because that model is trained once and its metrics are stored beside it in
`backend/models/risk_model.json`.

**Gap.** No LLM in the deployed build. The conversational layer is intent
classification plus a query translator; an optional local Ollama service exists and
is decoupled, and the app falls back to rule-based NLP when it is unreachable.

---

## Operational capability beyond the six

Not a scored capability, but the feature an actual police station would open the
system for, and the platform's clearest differentiator.

**`COMPLIANCE` · `GET /api/compliance/report`, `/api/compliance/digest`**

Statutory custody-clock monitoring under **BNSS 2023 s.187(3)** (formerly CrPC
s.167(2)): the chargesheet is due within 90 days for offences punishable with
death, life or ten years or more, and 60 days otherwise, counted from **first
remand** rather than FIR registration. Lapse entitles the accused to default bail.

- Gravity drives which limit applies, taken from the recorded offence category.
- The rule lives in exactly one function (`compliance.assess_custody`), called by
  the report, the case dossier and the mail digest, so they cannot disagree.
- Investigation pendency is reported **separately**, because it carries no
  automatic legal consequence and conflating the two would raise false alarms on
  the ~600 open cases with no arrested accused.
- Station disposal performance and investigating-officer caseload.
- A digest of cases breaching within seven days, deliverable by Catalyst Mail.

Presented as a monitoring aid with the statutory basis and a disclaimer stated on
screen, not as legal advice.

---

## Platform

Everything runs on Zoho Catalyst. **`GET /api/system/services`** publishes the
inventory: each service with a status, the call site, and where not live the exact
reason. Services deliberately not used are listed with the reasoning.

- **AppSail** hosts the FastAPI app and serves the React build same-origin, so
  there is no cross-origin preflight for the gateway to intercept.
- **Stratus** persists the SQLite database. AppSail's `/tmp` is wiped on restart,
  so the database file is snapshotted to Stratus after a write and restored on the
  first request after a restart. Single-instance by nature: the whole file is the
  unit of transfer, so with more than one instance the last writer wins. The
  PostgreSQL path remains supported and is the production scale-out route.
- **Cache** backs the three most expensive reads, with each response naming which
  tier answered.
- **Zia Text Analytics** reads the complainant statement typed during FIR
  registration — the one genuinely free-text input in the system, and until now the
  only thing an officer wrote that nothing read. Named-entity recognition returns
  the people, places, amounts, dates and times; keyphrases yield the vehicle and
  the stolen property. The offence type, IPC section and district stay with this
  project's own authoritative lists, because Zia does not classify offences.
  Everything is a **suggestion an officer confirms** — never auto-applied, because
  the legal classification of an offence is an officer's act.
- **Job Scheduling** runs the custody digest daily against this AppSail deployment
  itself. No Catalyst Function, no second deployable.
- **Mail** delivers the custody digest.
- **SmartBrowz** was built to render the compliance report to PDF server-side. It
  is refused by this account (see below), so the endpoint serves a print-laid-out
  A4 document instead and says which happened.

`GET /api/system/info` reports the active backend and whether writes actually
survive a restart — and reports `false` unless the snapshot round trip has genuinely
been observed, rather than claiming persistence because the mechanism is configured.

### What the platform work actually cost

Two things had to be measured rather than read, because the Python SDK's docs pages
404:

- **The SDK reads its credentials from the calling thread.** AppSail attaches the
  full `X-ZC-*` header set to every request, but `zcatalyst_sdk.initialize()` finds
  them only on the exact thread handling that request — so it failed in the
  background snapshot uploader and in the threadpool worker doing the restore.
  The middleware now captures those headers and replays them into whichever thread
  needs the SDK. `GET /api/system/catalyst-probe` publishes the evidence: which
  headers arrive, and that `initialize()` fails while `initialize(req=request)`
  succeeds. Credential values are never returned, only presence and length.
- **Cache rejects items over roughly 16,000 characters.** Found by having a
  19,812-byte write refused with `LIMIT_REACHED`; Zoho's own sources disagree on the
  figure. The envelope is therefore gzipped and base64'd before it is stored, which
  takes `/api/compliance/report` from 19,812 to 3,771 bytes. `/api/hotspots` is
  ~115 KB and still does not fit, so it is reported as `computed-oversize` and served
  from the in-process tier — named in the response rather than quietly substituted.

Verified against the deployed instance, not asserted: register an FIR, redeploy so
`/tmp` is wiped, and the FIR is still there with `restore_result: restored`.
`verify_deploy.ps1`, `deploy.ps1`, `verify_restart.ps1` run that sequence.

### Two claims this document previously got wrong

An inventory that lists its own gaps is only worth anything if the stated reasons
are true. Two were not, and both are corrected here and in
`GET /api/system/services`:

- **Scheduling does not require a Catalyst Function.** The old reason for skipping
  Cron was that a schedule must invoke a Function, meaning a second deployable
  alongside AppSail. Reading `zcatalyst_sdk/job_scheduling/_types.py` shows
  `TargetType.APPSAIL` and `TargetType.WEBHOOK` alongside `FUNCTION`, both carrying
  a `url` and `headers` — a job can call this app's own endpoint. The real
  prerequisite is a jobpool, created in the console.
- **There was no FIR narrative extractor to upgrade.** The old Zia entry said
  "FIR narrative entity extraction is rule-based and already works." The
  rule-based extractor parses the *user's chat question*
  (`intent_classifier._extract_entities`), not case text, and `Crime.description`
  is a fixed modus-operandi label from the seed generator rather than prose. So the
  gap was bigger than stated: no free-text case analysis existed at all. It exists
  now, at `POST /api/narrative/analyse`.

### What the SDK cost the second time round

The docs still 404, so four more facts had to be measured rather than read. They are
recorded in the `catalyst.py` docstring and used as test fixtures, so nobody has to
find them twice:

- **Zia's response shapes.** Every text call returns a *list* with one element per
  document, and every numeric field in the NER response is a *string* — including
  the indices and the confidence score. `Money` entities carry `fine_entities`
  splitting the currency symbol from the value. Established with
  `GET /api/system/zia-probe`, which returns the raw response verbatim, before any
  feature was built on it.
- **Cache and SmartBrowz want opposite things from an options dict.** Stratus and
  Cache copy option values into outgoing HTTP *headers*, where a boolean raises
  `InvalidHeader` and everything must be a string. SmartBrowz puts them in a JSON
  *body*, where a boolean is correct. Generalising the first lesson to the second is
  what broke the first PDF attempt.
- **The accessor is `app.smart_browz()`, with an underscore.** `app.smartbrowz()`
  raises `AttributeError`, and a hand-written test fake happily answered to the
  wrong name — so the tests passed while the deployed app failed. There is now a
  test that checks accessor names against the real `CatalystApp` class rather than
  against a fake.
- **The SDK contradicts itself about daily crons.** `CronType.CALENDER` is the
  string `"Calender"` while `ICatalystDailyCron` declares `Literal["Calendar"]`.
  Rather than pick one, `create_daily_cron` tries both and reports which the API
  accepted.

### What is not working, and why

Two services were built, called for real, and refused. Both are reported by
`GET /api/system/services` with the API's own error quoted, under a status —
`not-available` — that is deliberately distinct from "we did not configure it" and
"we chose not to":

- **Mail** returns `INVALID_ID: No such from_email with the given id exists`. The
  sender address has to be registered in the Catalyst console; setting the
  environment variable is not enough. The digest renders, addresses itself and
  reports honestly that it did not send.
- **SmartBrowz** returns `INVALID_ID: No such User with the given id exists` for
  every request, including a trivial document with no options at all — established
  with an option matrix at `GET /api/system/smartbrowz-probe`. That is the account's
  provisioning, not a malformed request. `GET /api/compliance/report.pdf` therefore
  serves the same report as a complete A4 print-laid-out HTML document and names the
  reason in a response header. The report works; only server-side rendering does not.

**Job Scheduling** answers, and the code to schedule the digest is complete and
tested, but the project has no jobpool — the one thing that can only be created in
the console. The inventory names it as the single remaining blocker rather than
claiming the service is configured.

---

## Data provenance

All data is synthetic. Nothing here represents a real person or case.

- District and offence-type mixes live in
  `backend/data/reference/karnataka_crime_reference.json`, where each block records
  its own `basis` and `source`. They are currently labelled **illustrative** —
  chosen to be plausible, **not** derived from published crime statistics.
- One association is planted deliberately: the **age-crime curve**, the most robust
  regularity in criminology. Socio-economic status, education and occupation are
  left unbiased, which is why the analysis correctly reports no material difference
  on them. A tool that distinguishes signal from noise is worth more than one that
  manufactures findings everywhere.
- Caste and religion exist in the schema for fidelity to the official ER diagram
  and are excluded from every analysis and model input.
- Financial transaction data is representative sample data; in service this module
  would integrate with bank and FIU-IND feeds, because the FIR system of record
  does not itself hold financial transactions.
