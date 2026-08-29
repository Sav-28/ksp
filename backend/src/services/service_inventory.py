"""
Auditable inventory of Zoho Catalyst services.

WHY
---
Claiming "built on Catalyst" is unverifiable. This module publishes, for every
service, the status, the call site a reviewer can open, and - where the service is
not live - the precise reason and what would change it. Services deliberately NOT
used are listed too, with the reasoning, because an inventory that only lists
successes is marketing rather than an audit.

STATUS VOCABULARY
-----------------
    live             called on the default request path, and demonstrably working
    configured       prerequisites set, but no successful call observed yet
    not-configured   code path exists; a prerequisite (env var / console step) is missing
    not-used         no call site in this repository, with a stated reason
    platform         the project runs on it without an SDK call from the app

Status is DERIVED from configuration and observed behaviour, never asserted. A
service is only "live" when something actually succeeded.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List

from src.services import catalyst, cache, catalyst_store


def _sqlite_snapshot_status() -> tuple:
    """(status, detail) for Stratus, based on what has actually happened."""
    st = catalyst_store.status()
    bucket = os.getenv("KSP_STRATUS_BUCKET", "").strip()
    if not bucket:
        return ("not-configured",
                "KSP_STRATUS_BUCKET is not set. Without it the SQLite database is "
                "not snapshotted, so writes would not survive an instance restart. "
                "Create a Stratus bucket in the Catalyst console and set the name.")
    if st.get("uploads_completed", 0) > 0:
        return ("live",
                f"{st['uploads_completed']} snapshot upload(s) completed; "
                f"restore on boot reported '{st.get('restore_result')}'.")
    # A restore is also a completed Stratus operation, and a stronger one: it
    # means this instance booted with an empty /tmp and read the database back
    # out. Reporting that as merely 'configured' because no upload has happened
    # yet in this process would understate what has been observed.
    if st.get("restore_result") in ("restored", "already-current"):
        return ("live",
                f"Bucket '{bucket}' read successfully on boot: restore reported "
                f"'{st['restore_result']}'. No upload has been needed yet in this "
                f"instance, so uploads_completed is 0.")
    if st.get("last_upload_error"):
        return ("configured",
                f"Bucket '{bucket}' is configured but the last upload failed: "
                f"{st['last_upload_error']}")
    return ("configured",
            f"Bucket '{bucket}' is configured; no snapshot upload has been needed "
            f"or completed yet in this instance.")


def _cache_status() -> tuple:
    s = cache.stats()
    if s["catalyst_cache_available"]:
        hits = s["catalyst_hits"]
        detail = (f"{s['writes']} write(s), {s['catalyst_hits']} Catalyst hit(s), "
                  f"{s['local_hits']} in-process hit(s), {s['misses']} miss(es).")
        # Rejected writes are named rather than hidden: without this the endpoint
        # would look healthy while quietly serving everything from the local tier.
        if s.get("last_write_raw_bytes") and s.get("last_write_bytes"):
            detail += (f" Last payload compressed {s['last_write_raw_bytes']} -> "
                       f"{s['last_write_bytes']} bytes against the measured "
                       f"{s['max_value_bytes']}-byte per-item ceiling.")
        if s.get("oversize_skips"):
            detail += (f" {s['oversize_skips']} payload(s) still exceeded the ceiling "
                       f"after compression and were served from the in-process tier.")
        if s.get("last_write_error"):
            detail += f" Last rejected write: {s['last_write_error']}"
        if s.get("last_read_error"):
            detail += f" Last failed read: {s['last_read_error']}"
        return ("live" if hits or s["writes"] else "configured", detail)
    return ("not-configured",
            "The Catalyst SDK could not be initialised for Cache, so the "
            "read-through cache is served by the bounded in-process tier instead. "
            "Every response names which tier answered.")


def _mail_status() -> tuple:
    if not os.getenv("MAIL_FROM", "").strip():
        return ("not-configured",
                "MAIL_FROM is not set, so the custody-clock digest renders and "
                "returns a preview instead of sending. Set MAIL_FROM and "
                "KSP_DIGEST_TO to enable delivery.")
    if not os.getenv("KSP_DIGEST_TO", "").strip():
        return ("not-configured",
                "MAIL_FROM is set but KSP_DIGEST_TO has no recipient, so the "
                "digest returns a preview.")
    return ("configured",
            "Sender and recipient are set; the digest endpoint will attempt "
            "delivery and reports the outcome.")


def _filestore_status() -> tuple:
    if not os.getenv("KSP_FILESTORE_FOLDER_ID", "").strip():
        return ("not-configured",
                "KSP_FILESTORE_FOLDER_ID is not set. A File Store folder can only "
                "be created from the Catalyst console, and File Store addresses "
                "files by numeric id with no lookup by name - which is also why "
                "the database snapshot uses Stratus, whose keys are stable.")
    return ("configured", "Folder id is set.")


def build() -> Dict[str, Any]:
    """The full inventory."""
    diag = catalyst.diagnostics()

    stratus_status, stratus_detail = _sqlite_snapshot_status()
    cache_status, cache_detail = _cache_status()
    mail_status, mail_detail = _mail_status()
    fs_status, fs_detail = _filestore_status()

    services: List[Dict[str, Any]] = [
        {
            "service": "AppSail (Catalyst-managed runtime)",
            "category": "compute",
            "status": "live",
            "call_site": "app-config.json -> backend/main.py (FastAPI on uvicorn)",
            "detail": "Hosts the API and serves the React build from the same "
                      "origin, so there is no cross-origin preflight for the "
                      "Catalyst gateway to intercept.",
        },
        {
            "service": "Static web hosting (via AppSail)",
            "category": "platform",
            "status": "platform",
            "call_site": "backend/main.py StaticFiles mount over backend/static",
            "detail": "The production React build is copied into backend/static by "
                      "deploy.ps1 and served by the same process as the API.",
        },
        {
            "service": "Stratus (object store)",
            "category": "data",
            "status": stratus_status,
            "call_site": "src/services/catalyst.py stratus_put/stratus_get, "
                         "driven by src/services/catalyst_store.py",
            "detail": stratus_detail,
        },
        {
            "service": "Cache",
            "category": "data",
            "status": cache_status,
            "call_site": "src/services/cache.py, used by /api/sociological, "
                         "/api/hotspots and /api/compliance/report",
            "detail": cache_detail + " Catalyst Cache expiry is granular to hours, "
                      "so each entry carries its own absolute expiry and freshness "
                      "is enforced on read.",
        },
        {
            "service": "Mail",
            "category": "messaging",
            "status": mail_status,
            "call_site": "src/services/catalyst.py send_mail, used by "
                         "/api/compliance/digest",
            "detail": mail_detail,
        },
        {
            "service": "File Store",
            "category": "data",
            "status": fs_status,
            "call_site": "src/services/catalyst.py (accessor present; no feature "
                         "depends on it yet)",
            "detail": fs_detail,
        },
        # ---- Deliberately not used. Reasons, not silence. ------------------
        {
            "service": "Data Store (relational) + ZCQL",
            "category": "data",
            "status": "not-used",
            "call_site": None,
            "detail": "The data layer is SQLAlchemy across 28 official FIR tables "
                      "plus an analytics schema and a compatibility view. Data "
                      "Store is reached through ZCQL rather than a SQL wire "
                      "protocol, so adopting it is a rewrite of every model and "
                      "query, not a migration. Persistence is solved instead by "
                      "snapshotting SQLite to Stratus.",
        },
        {
            "service": "Catalyst Authentication",
            "category": "platform",
            "status": "not-used",
            "call_site": None,
            "detail": "The application ships its own auth: PBKDF2 password "
                      "hashing, HMAC-SHA256 signed tokens and four roles with "
                      "per-tab and per-action authorisation. Replacing it two days "
                      "from submission would risk the demo for no analytical gain.",
        },
        {
            "service": "QuickML",
            "category": "ai",
            "status": "not-used",
            "call_site": None,
            "detail": "Both models are trained offline and shipped as coefficients "
                      "for pure-Python inference, so the slim cloud build needs no "
                      "scikit-learn or numpy. A QuickML deployment would also need "
                      "console-side model training.",
        },
        {
            "service": "Zia Text Analytics / OCR / Face",
            "category": "ai",
            "status": "not-used",
            "call_site": None,
            "detail": "FIR narrative entity extraction is rule-based and already "
                      "works. Zia would be a genuine upgrade to that existing code "
                      "path and is the first thing to add next; it was deferred "
                      "rather than rushed before the deadline.",
        },
        {
            "service": "Cron / Job Scheduling",
            "category": "orchestration",
            "status": "not-used",
            "call_site": None,
            "detail": "A scheduled trigger has to invoke a Catalyst Function, which "
                      "means a second deployable alongside AppSail. The digest is "
                      "exposed as an endpoint so a scheduler can call it once that "
                      "Function exists.",
        },
        {
            "service": "NoSQL / Search / Push / SmartBrowz / Circuits",
            "category": "mixed",
            "status": "not-used",
            "call_site": None,
            "detail": "No call site. Listed so this inventory is a complete account "
                      "rather than only the services that flatter the project.",
        },
    ]

    counts: Dict[str, int] = {}
    for s in services:
        counts[s["status"]] = counts.get(s["status"], 0) + 1

    return {
        "summary": {
            "total_listed": len(services),
            "by_status": counts,
            "with_call_site": sum(1 for s in services if s["call_site"]),
        },
        "sdk": diag,
        "services": services,
        "how_to_read_this": {
            "live": "called on the default request path and observed to work",
            "configured": "prerequisites set, but no successful call observed yet",
            "not-configured": "code path exists; a prerequisite is missing, named in detail",
            "not-used": "no call site in this repository; the reason is stated",
            "platform": "the project runs on it without an SDK call from the app",
            "note": "Status is derived from configuration and observed behaviour. "
                    "A service is reported live only when a call has actually "
                    "succeeded, so this endpoint can be checked rather than trusted.",
        },
    }
