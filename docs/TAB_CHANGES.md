# What changed in Dashboard, Finance and Forecast

A record of the recent work on these three tabs: what was wrong, what replaced it,
and what was verified. Written so the reasoning survives, not just the diff.

Branch: `feature/phase2-persistence`. Every item below is committed and pushed.

---

## The common thread

All three tabs **reported** rather than **found**. Finance listed transactions
someone had already flagged, Forecast gave one number for the whole state, and
Dashboard showed totals with nothing to compare them against. None of them
answered the question an officer actually opens a system for.

A second, separate problem: each tab had been styled independently, which
produced consumer-dashboard conventions — rounded cards, drop shadows, emoji
headings, rainbow palettes. That is now replaced by a shared visual language in
`frontend/src/govStyles.ts`.

---

## Dashboard

### What was wrong

Bare counts. "920 cases on record" tells an officer nothing, because there is no
reference point. The page was also a dead end: it displayed numbers but offered
no route to the view that could act on them. And the ten-colour bar charts spent
colour on decoration when the rows were already ordered and labelled.

### What it does now

**A "Requires attention" briefing above everything else**, because it is the only
part of the page that asks for a decision. Each line routes onward:

| Finding | Routes to |
|---|---|
| Cases past the statutory chargesheet period, and those due within 7 days | Compliance |
| Districts or offence types up over the last 60 days | Forecast |
| Cases registered so far this month against the projection | Forecast |

**Every figure carries a comparison and a trend.** Last complete month shows a
12-month sparkline, month-over-month change, and position against the 12-month
baseline. Open investigations and deadline breaches drill through to Compliance.

**The in-progress month is separated, not silently compared.** Comparing a part
month against full months makes every delta read as a fall. It now has its own
figure showing the running count and the projection, and is drawn **hatched** on
the chart so its incompleteness is visible rather than implied.

**The chart is columns with a three-month rolling average overlaid**, since these
are discrete monthly counts rather than a continuous signal. Legend stated.

**Distribution tables gained a 60-day direction column**, populated from the
forecast report's own comparison, so a reader sees which categories are *moving*
and not only which are large. Rows with no flagged change read "steady", so
absence is explicit rather than blank.

### A misleading statistic caught during verification

The baseline was first computed over the whole series. Because the seeded data
ramps up, the all-time average is **36** while the trailing-twelve average is
**48**. The latest month would have displayed as **+72% above average** when the
honest figure against the current regime is **+29%** — an overstatement of more
than double. An average dragged down by an early low-volume period is not a fair
comparison. The baseline is now the trailing twelve months and is labelled as such.

### Verified

`2026-08` correctly identified as partial at 56; last complete month `2026-07` at
62 against `2026-06` at 43, giving +44.2% month-over-month;
`partial_month_count_so_far` from `/api/forecast` agrees with `by_month` from
`/api/stats`.

Also fixed: district and offence names were rendered raw here while every other
view localises them, so switching to Kannada left the most-visited page
half-translated.

---

## Forecast

### What was wrong

Three separate problems, two of them bugs.

**A chart rendering bug.** The forecast marker was placed at `P.l + cw`, which is
exactly where the last history point sits. The marker covered the final actual
value and the dashed "projection" segment had zero length.

**No x-axis labels at all.** On a trend chart, no point could be identified.

**A bare point forecast.** A single number invites false confidence, and there was
no uncertainty shown even though the backtest measures error directly.

**An inverted severity rule.** The High band required `previous > 0`, so a district
going 0 → 12 was reported Medium while one going 6 → 12 was High. That inverted
the actual urgency.

**A field carrying no information.** The alert `type` always read "District surge".

### What it does now

- The x-scale reserves a slot for the forecast, so the projection extends visibly.
- Month labels on the axis, thinned to roughly eight across, plus per-point tooltips.
- **An 80% prediction interval derived from the backtest's measured RMSE**, not an
  assumed variance, drawn as a shaded band with a whisker. The basis string states
  the assumption (roughly normal, stationary errors) rather than hiding it.
- **The forecast month is named.** It is one step past the last *complete* month,
  which is normally the month in progress — so calling it "next month" implied a
  month that had not started. It now names the month and shows the running count.
- A jump from zero is treated as High.
- **Crime-type surges are detected alongside district surges**, so `type` carries
  real information. The UI badges which scope each alert refers to.
- Alerts and anomalies moved from stacked cards into ruled tables with explicit
  columns (previous 60 days, last 60 days, change, severity), so rows compare.
- The method statement is promoted to a prominent block naming the selected
  forecaster, its MAE/RMSE/MAPE, the baseline comparison and the excluded partial
  month.

### Do not quote the forecast metrics from memory

They are **dataset-dependent**. Across three re-seeds during development:

| Re-seed | Selected | MAE | vs naive baseline |
|---|---|---|---|
| 1 | `holt_damped` | 10.18 | 9.0% better |
| 2 | `ma_trend` | 9.11 | 16.7% better |
| 3 | `holt_damped` | 8.18 | 26.9% better |

Re-seeding regenerates the monthly series relative to the current date, so both
the winner and its error move. The *mechanism* is what is defensible: ten
candidates scored by walk-forward one-step-ahead backtesting, lowest MAE selected,
error reported against a naive baseline. Read the live figures off the badge or
`GET /api/forecast`.

The offender-risk figure (ROC-AUC 0.992) is safe to quote because that model is
trained once and its metrics are stored in `backend/models/risk_model.json`.

A useful consequence of deriving the interval from backtest RMSE: when the data
gets noisier, the stated uncertainty widens with it.

---

## Finance

### What was wrong

**A performance bug that would only have shown up in production.** The endpoint
issued three queries per transaction — account, owner, crime — to build the table.
That is roughly 98 round-trips for the demo dataset. Invisible against local
SQLite at 17 ms; against managed PostgreSQL, where every statement crosses the
network, it is seconds.

**No analysis.** The tab listed transactions and totalled them. A flat table
cannot show the structure of a laundering chain, which is the entire point.

**No stated reasons.** Rows were flagged with no explanation, in an application
that shows its reasoning everywhere else.

### What it does now

**N+1 eliminated: 98 queries reduced to 5**, measured. Everything is bulk-loaded
into dictionaries before the loop runs.

**Layering detection**, which is the substantive change. An account that both
receives *and* forwards flagged funds is a conduit, and that is what separates a
laundering chain from unrelated large transfers. Throughput ratio is value sent
divided by value received; at or near 1.00 the account acted as a pass-through.

On the seeded data this surfaces the planted ring: **three conduit accounts with
throughput ratios 0.88 to 1.09**, each passing roughly ₹25 lakh onward. The flat
table had hidden that completely.

**Counterparty concentration** — principal recipients and remitters by flagged
value, so the aggregate is visible and not only the individual rows.

**Grounds recorded per transaction** (high value, linked to an active case,
counterparty account flagged), so a flagged row is auditable rather than asserted.

**Data provenance moved out of a tucked-away banner** into the method block. The
transaction data is representative sample data; in service this module would
integrate with bank and FIU-IND feeds, because the FIR system of record does not
itself hold financial transactions. That belongs stated, not buried.

### Still open on this tab

Two ideas identified but **not built**:

1. **Detection over the unflagged transactions.** The tab only examines the 32
   rows where `is_suspicious = 1`, a column the seeder set. There are 1,082
   transactions, so 1,050 are unexamined. Building structuring, velocity and cycle
   detection over all of them would support the strongest available claim: *the
   rules caught 32; analysis surfaced N more they missed.* Two-hop chains already
   exist in the data, so cycle detection would fire.
2. **A money-flow graph.** `NetworkGraph.tsx` already does SVG graph layout for
   people; the same approach with accounts as nodes and transfers as weighted
   edges would make the ring legible at a glance. One caveat: only four distinct
   senders appear among suspicious transactions, so the graph will be clean but
   small. Making it look substantial would need a second, larger ring in the seeder.

---

## Presentation

`frontend/src/govStyles.ts` holds the shared language: ruled dense tables, square
corners, no drop shadows, numbered sections, monospaced reference numbers, the
"as on <date>" dating convention, and a narrow palette in which **colour carries
severity rather than decoration**. Emoji headings are absent by design.

Applied to Dashboard, Map, Finance, Forecast, Compliance and Case Investigation.
Still on the old styling: Network, Profiles, Register FIR, Audit.

---

## Verification standard used throughout

- `npx tsc --noEmit` clean.
- `npm run build` with `CI=true`, so warnings are treated as errors. This caught a
  genuinely ineffective lint suppression: adding `t()` to error messages made
  `load` close over `language`, producing a real `exhaustive-deps` warning, and the
  disable comment had been written inline where it has no effect. The normal build
  only prints warnings and continues, so it would have been missed.
- `pytest tests/` — 13 passed.
- Every endpoint called against live data, checking the specific fields each view
  reads rather than only the HTTP status.
