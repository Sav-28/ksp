# Demo script — KSP Crime AI

An ordered walkthrough for the submission recording. Each step names the scored
capability it evidences, what to say, and what to point at. Timings assume a
five-minute video; cut from the bottom if you are short.

**Live:** https://ksp-api-50044161264.development.catalystappsail.in
**Sign in as:** `supervisor / super@2024` for steps 1–3 and 6,
`investigator / invest@2024` for step 4, `admin / admin@2024` for step 7.

Before recording: open the site once and let it load. The first request after a
deploy restores the database from Stratus, and you do not want that on camera.

---

## 1 · Open on COMPLIANCE, not the dashboard (0:00–0:45)

**Why first:** every competing prototype opens on a dashboard. This opens on the
one screen a station would actually open the system for, and it leads with a
decision rather than a chart.

**Say:** "Twenty-five cases need action today, and twenty-three of those have
already passed their statutory chargesheet deadline. That is what a station opens
this for."

**Point at:** the *Action required* figure, then the custody clock table — most
urgent first, with days over the limit in red.

**Then say the thing that makes it credible:** "The 60- and 90-day rule lives in
exactly one function. This screen, the morning email and the printed report all
call it, so they cannot disagree about a deadline."

*Evidences:* C1 Advanced Visualization, and the operational capability section.

---

## 2 · Download the report (0:45–1:15)

**Click** *Download full report* in the top right.

**Say:** "Police work is document-driven. A screen helps whoever is looking at it;
a station review is carried on paper. This is the same figures, laid out for A4."

**Then be straight about the fallback**, because it is a strength here rather
than an apology: "This was built to render server-side through Catalyst
SmartBrowz. That service is not provisioned on this account — it returns a 404
about a user for every request, including an empty test document — so the endpoint
serves a print-ready page and says so in a response header. The report works; only
the server-side rendering does not."

*Evidences:* C1, and the honesty posture that runs through step 7.

---

## 3 · The custody clock has a legal basis (1:15–1:45)

**Point at** the statutory basis line and the disclaimer under the table.

**Say:** "This cites BNSS and it says what it is not. It is a prompt for an
officer to check a file, not legal advice, and the disclaimer is on the screen
rather than in a footnote nobody reads."

*Evidences:* the sensitivity of the domain, which is what separates a police tool
from a dashboard.

---

## 4 · Register an FIR with Zia reading the statement (1:45–3:00)

**This is the strongest ninety seconds in the demo.** Sign in as
`investigator / invest@2024`, go to **REGISTER FIR**.

**Paste this into the statement box:**

> On 14 August 2026 at about 9 PM, the complainant Ramesh Kumar was returning to
> Jayanagar in Bengaluru when two men on a black Pulsar motorcycle snatched his
> gold chain worth Rs 85,000 near the bus stand and fled towards Wilson Garden.
> The accused Imran Shaikh was later identified.

**Say while it is on screen:** "This is the only free-text field in the system.
Everything else an officer enters is a dropdown — so anything they write and do
not retype into a structured field is invisible to every analysis downstream."

**Click** *Analyse statement*. It takes about three quarters of a second.

**Point at, in this order:**
- the blue **Catalyst Zia** pill — "that names which engine answered"
- *Offence: Snatching (IPC 356)* and *District: Bengaluru Urban*
- both names found: Ramesh Kumar and Imran Shaikh
- vehicle *black Pulsar motorcycle*, property *gold chain*, amount *Rs 85,000*,
  the date and the time

**Say the important part:** "Nothing has been filled in. Every one of those is a
chip an officer clicks. The legal classification of an offence is an officer's
act, and the IPC section on an FIR ends up in a document that goes to a court, so
a machine's guess must never arrive there without someone choosing it."

**Click** the offence chip and the district chip. Show the form populating.
**Click** *+ complainant* on Ramesh Kumar and *+ accused* on Imran Shaikh.

**Then divide the credit honestly:** "Zia found the people and the property. The
offence type, the IPC section and the district come from this project's own
Karnataka lists — Zia does not classify offences, and the response says so."

Finish the registration (pick a date, submit) so the record is real.

*Evidences:* C6 AI/ML-Driven Intelligence, C3 in part, and the write workflow.

---

## 5 · Show the registration flowed through (3:00–3:20)

**Go to** DASHBOARD or MAP.

**Say:** "That FIR is now in the dashboard, the map, the network and the
forecast. One write, and every view moves."

*Evidences:* C1, C4 Pattern & Trend Discovery.

---

## 6 · The network and the risk model (3:20–4:00)

**Go to** NETWORK, then PROFILES.

**Say:** "Co-accused links build themselves when an FIR is registered with more
than one accused. The risk score on a profile is a trained model shipped as
coefficients — the badge names it, and the profile lists the factors behind the
number rather than just the number."

*Evidences:* C2 Network & Link Analysis, C5 Behavioural Analysis, C6.

---

## 7 · Close on the service map (4:00–5:00)

**This is the closing argument.** Sign in as `admin / admin@2024` and open
`/api/system/services` in a browser tab, or read it from the screen.

**Say:** "Fourteen Catalyst services, each with a status, a call site a reviewer
can open, and where it is not working the exact reason. Four are live. One —
SmartBrowz — was called for real and refused, and the API's own error is quoted.
Two are waiting on a console step I have named. Five we chose not to use, and the
reasoning is there for each."

**Then the line to end on:** "A service list that only shows successes is
marketing. This one is checkable — every status is derived from an operation that
either happened or didn't, never from a config file. Two of these reasons were
wrong last week, and correcting them is in the commit history."

**If asked about the count:** the competitor maps thirty-five services and runs
ten. Do not chase that. Say: "Four live with stated reasons for the other ten
beats ten shallow touches, and this endpoint lets you verify which kind you are
looking at."

*Evidences:* platform depth, and the engineering judgement behind it.

---

## Numbers, as of the last verification run

| Fact | Value |
|---|---|
| Cases needing action | 25 (23 past deadline, 45 under the clock) |
| Crimes in the database | 923 |
| Catalyst services listed / live | 14 / 4 |
| Endpoints verified green | 37 plus the React bundle, 41–739 ms |
| Backend tests | 75 passing |
| Zia analysis latency | ~770 ms end to end |

## Do not claim on camera

- That Mail sends. It does not — the sender is not registered in the console.
  The digest renders and reports honestly that it did not send.
- That the digest is running on a schedule. The code is complete and tested but
  the project has no jobpool yet.
- That SmartBrowz renders the PDF. It is refused by the account.
- That the data is real. It is synthetic, and `CAPABILITIES.md` says which
  associations were planted deliberately.

Each of those is already stated by `/api/system/services`, which is why the honest
version is the stronger version: a judge who checks will find the endpoint agreed
with you.
