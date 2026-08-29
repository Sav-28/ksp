# Feature: FIR / Crime Registration (Option 2 — Full Feature)

The platform is currently **read-only** — it queries and analyzes crime data but
cannot create it. This feature adds the first **write** workflow: registering a
new crime (FIR) in any district, with all its details, gated by role-based access.

A newly registered FIR flows automatically into every existing feature
(dashboard, hotspots, network graph, offender profiling, forecasting) because it
writes to the same tables those features read.

---

## 1. Goal

Let an authorized officer register a new FIR with:
- Crime details (type, district, station, date, location, description)
- Investigation details (IPC sections, investigating officer, status)
- People involved (accused / victims / witnesses / complainant)

...and have it appear immediately across the platform.

---

## 2. Who can do what (RBAC)

This is where role-based access finally does real work beyond the audit tab.

| Role          | Register FIR | Update investigation | Read/analytics |
|---------------|:---:|:---:|:---:|
| investigator  | ✅ | ✅ (own cases) | ✅ |
| officer       | ✅ | – | ✅ |
| supervisor    | ✅ | ✅ (any case)  | ✅ |
| admin         | ✅ | ✅ | ✅ |
| analyst       | ❌ (403) | ❌ | ✅ |
| policymaker   | ❌ (403) | ❌ | ✅ |

- Analysts and policymakers **consume** intelligence; they cannot file FIRs.
- The write endpoints reject unauthorized roles with **HTTP 403**.
- The frontend **hides the REGISTER FIR tab** for read-only roles.

---

## 3. What gets written (per registration)

One submit = one atomic transaction across these tables:

| Table          | What is created |
|----------------|-----------------|
| `crimes`       | The FIR core + an auto-generated `fir_number` |
| `fir_details`  | Investigation record, status starts at `"Registered"` |
| `persons`      | New person rows (only if not already in the system) |
| `case_persons` | Links each person to the crime with their role |
| `audit_logs`   | An audit entry recording who registered what, when |

Existing offenders are **reused** (deduplicated by name + district) so the
criminal-network graph stays accurate instead of creating duplicates.

---

## 4. FIR number format

Auto-generated, no manual entry, collision-safe:

```
FIR/<DISTRICT_CODE>/<YEAR>/<SEQUENCE>
example: FIR/BLR/2026/00042
```

Sequence = (crimes already in that district + year) + 1.

---

## 5. Backend changes

**New endpoints**
| Method | Path | Allowed roles | Purpose |
|--------|------|---------------|---------|
| POST   | `/api/crimes`        | investigator, officer, supervisor, admin | Register a new FIR |
| PATCH  | `/api/crimes/{fir}`  | investigator, supervisor, admin | Update investigation status/outcome |

**Other changes**
- `auth.py` — add the register-role gate (reuse `require_role`) + expose `can_register` on `/api/me`.
- `models.py` — add `created_by` column to `crimes` (traceability).
- Server-side validation: required fields, known district/crime type, date not in the future.
- Audit every write (extends the existing audit log).
- Small DB migration to add the `created_by` column.

**Request body (shape)**
```json
{
  "crime_type": "Theft",
  "district": "Bengaluru Urban",
  "police_station": "Whitefield PS",
  "taluk": "Bengaluru East",
  "date_occurred": "2026-07-20",
  "description": "...",
  "latitude": 12.97,
  "longitude": 77.75,
  "ipc_sections": "379, 411",
  "investigating_officer": "Insp. R. Kumar",
  "persons": [
    {"role": "accused", "full_name": "Vikram Reddy", "existing_id": 128},
    {"role": "victim", "full_name": "S. Nayak", "age": 41, "gender": "Male"},
    {"role": "complainant", "full_name": "S. Nayak"}
  ]
}
```
Response returns the new `fir_number` + the full assembled case detail.

---

## 6. Frontend changes

- **New "REGISTER FIR" tab** — visible only when the logged-in role can register.
- **Structured form:**
  - Crime section: type dropdown, district dropdown, station, taluk, date, description, optional lat/long.
  - Investigation section: IPC sections, investigating officer (defaults to current user).
  - Repeatable "Add person" rows: role selector + demographic fields, with
    autocomplete that reuses existing persons.
- **On success:** confirmation message → redirect to the new FIR's detail card.
- **Validation + error handling** (including the 403 case, though the tab is hidden for those roles).

---

## 7. Out of scope (for this round)

- Editing/deleting persons after registration (only status updates via PATCH).
- File/evidence attachments.
- Approval workflow (e.g. supervisor sign-off before an FIR goes live).
- Kannada localization of the form labels (can add after the English version works).

---

## 8. Build order

1. Backend: `created_by` column + migration.
2. Backend: `POST /api/crimes` (+ validation, FIR-number gen, person dedup, audit).
3. Backend: `PATCH /api/crimes/{fir}` + `can_register` on `/api/me`.
4. Verify via API (register as investigator → 201; as analyst → 403).
5. Frontend: REGISTER FIR tab (role-gated) + form.
6. Frontend: submit → success → detail redirect.
7. End-to-end check: register an FIR, confirm it appears in dashboard/hotspots/network.

---

## 9. Acceptance criteria

- [ ] Investigator/officer/supervisor/admin can register an FIR; analyst/policymaker get 403.
- [ ] A registered FIR gets a unique auto-generated FIR number.
- [ ] Accused/victims/witnesses are linked; existing persons are reused, not duplicated.
- [ ] The new FIR appears in dashboard totals, the hotspot map, and (if accused is known) the network graph.
- [ ] The registration is written to the audit log with the user's name.
- [ ] The REGISTER FIR tab is hidden for read-only roles.
