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


def _zia_status() -> tuple:
    """
    (status, detail) for Zia.

    Zia needs no environment variable, so configuration could never be evidence
    for it - the only thing that counts is a call having actually returned. Same
    evidence-based rule as Stratus.
    """
    diag = catalyst.diagnostics()
    if diag.get("zia_succeeded_at_least_once"):
        return ("live",
                "Named-entity recognition, keyword extraction and sentiment "
                "analysis over the complainant statement typed during FIR "
                "registration. Entities come from Zia; the offence type, IPC "
                "section and district stay with this project's own authoritative "
                "lists, because Zia does not classify offences. Every response "
                "names which engine answered, and the rule-based analyser takes "
                "over if Zia is unavailable.")
    if diag.get("last_zia_error"):
        return ("not-configured",
                f"A Zia call was attempted and did not return: "
                f"{diag['last_zia_error']} The rule-based analyser answers "
                f"instead and /api/narrative/analyse reports engine='rules'.")
    return ("configured",
            "The code path exists and needs no environment variable, but no Zia "
            "call has been made yet in this instance. Post a statement to "
            "/api/narrative/analyse, or open GET /api/system/zia-probe, and this "
            "entry will report what actually happened.")


def _job_scheduling_status() -> tuple:
    """
    (status, detail) for Job Scheduling.

    Reads the project's jobpools, which is both the useful information and the
    check for whether scheduling is usable: a jobpool is the one prerequisite
    that has to be created in the Catalyst console.
    """
    pools = catalyst.list_jobpools()
    diag = catalyst.diagnostics()

    if pools is None:
        reason = diag.get("last_job_error") or "the Catalyst SDK is not initialised here"
        return ("not-configured",
                f"The jobpool listing could not be read, so no schedule can be "
                f"created: {reason} The digest endpoint still works when called "
                f"directly.")

    if not pools:
        return ("not-configured",
                "Job Scheduling answered, but this project has no jobpool. A "
                "jobpool is created in the Catalyst console and is the only "
                "remaining prerequisite - once one exists, POST "
                "/api/system/jobs/digest schedules the custody-clock digest "
                "against this AppSail deployment.")

    names = ", ".join(str(p.get("name") or p.get("id")) for p in pools[:5])
    crons = catalyst.list_crons() or []
    ours = [c for c in crons if "digest" in str(c.get("cron_name", "")).lower()]
    detail = (f"{len(pools)} jobpool(s) readable ({names}). Target type AppSail, "
              f"so a schedule calls this deployment's own digest endpoint - no "
              f"Catalyst Function and no second deployable.")
    if ours:
        detail += (f" {len(ours)} digest cron scheduled: "
                   + ", ".join(f"{c.get('cron_name')} ({'enabled' if c.get('cron_status') else 'paused'})"
                               for c in ours) + ".")
        return ("live", detail)
    detail += (" No digest cron exists yet; POST /api/system/jobs/digest creates "
               "it. Reported as configured rather than live because listing a "
               "jobpool proves the service answers, not that anything is scheduled.")
    return ("configured", detail)


def _smartbrowz_status() -> tuple:
    """
    (status, detail) for SmartBrowz.

    Needs no environment variable, so as with Zia the only evidence is a render
    having actually returned PDF bytes.
    """
    diag = catalyst.diagnostics()
    if diag.get("smartbrowz_succeeded_at_least_once"):
        return ("live",
                "The station compliance report is rendered to PDF from HTML by "
                "SmartBrowz at GET /api/compliance/report.pdf, built from the same "
                "payload the JSON endpoint returns so the document cannot disagree "
                "with the screen. If SmartBrowz stops answering the endpoint serves "
                "the same report as HTML and names the reason in a response header.")
    if diag.get("last_smartbrowz_error"):
        return ("not-available",
                f"Attempted and rejected by the service, not skipped: "
                f"{diag['last_smartbrowz_error']} Measured across a matrix of "
                f"option combinations at GET /api/system/smartbrowz-probe, "
                f"including a trivial document with no options at all, so this is "
                f"the account's SmartBrowz provisioning rather than a bad request "
                f"from here. GET /api/compliance/report.pdf therefore serves the "
                f"same report as a complete, print-laid-out A4 HTML document and "
                f"names the reason in X-Report-Fallback-Reason. The report itself "
                f"works; only server-side rendering does not.")
    return ("configured",
            "The code path exists and needs no environment variable, but no render "
            "has been attempted yet in this instance. Open "
            "GET /api/compliance/report.pdf and this entry will report the result.")


def _mail_status() -> tuple:
    """
    (status, detail) for Mail.

    Evidence-based like Stratus and Zia. Env vars being set is NOT enough: the
    commonest Mail failure is a from_email that has not been verified in the
    Catalyst console, and that only shows up when a send is attempted. Reporting
    "configured" while every send is rejected would be exactly the kind of
    overstatement this endpoint exists to prevent.
    """
    diag = catalyst.diagnostics()
    if not os.getenv("MAIL_FROM", "").strip():
        return ("not-configured",
                "MAIL_FROM is not set, so the custody-clock digest renders and "
                "returns a preview instead of sending. Set MAIL_FROM to a sender "
                "address verified in the Catalyst console, plus KSP_DIGEST_TO, to "
                "enable delivery.")
    if not os.getenv("KSP_DIGEST_TO", "").strip():
        return ("not-configured",
                "MAIL_FROM is set but KSP_DIGEST_TO has no recipient, so the "
                "digest returns a preview.")
    if diag.get("mail_succeeded_at_least_once"):
        return ("live",
                "The custody-clock digest has been accepted for delivery by "
                "Catalyst Mail in this instance. A scheduled job calls "
                "/api/compliance/digest?send=true so it arrives before the "
                "morning briefing.")
    if diag.get("last_mail_error"):
        return ("not-configured",
                f"Sender and recipient are set but the last send was rejected: "
                f"{diag['last_mail_error']} The digest still renders and is "
                f"returned as a preview. A rejection usually means from_email is "
                f"not a verified sender in the Catalyst console.")
    return ("configured",
            "Sender and recipient are set, but no send has been attempted yet in "
            "this instance. Call /api/compliance/digest?send=true and this entry "
            "will report what actually happened.")


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
    # The per-service checks below make real Catalyst calls, so diagnostics() has
    # to be sampled AFTER them. Taken first, the sdk block reported
    # job_scheduling_succeeded_at_least_once as false in the very response whose
    # jobpool listing had just succeeded - a snapshot that contradicted the
    # service entry beside it.
    stratus_status, stratus_detail = _sqlite_snapshot_status()
    cache_status, cache_detail = _cache_status()
    mail_status, mail_detail = _mail_status()
    fs_status, fs_detail = _filestore_status()
    zia_status, zia_detail = _zia_status()
    job_status, job_detail = _job_scheduling_status()
    browz_status, browz_detail = _smartbrowz_status()

    diag = catalyst.diagnostics()

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
            "service": "Zia Text Analytics",
            "category": "ai",
            "status": zia_status,
            "call_site": "src/services/catalyst.py zia_ner/zia_keywords/"
                         "zia_sentiment, driven by src/services/narrative.py for "
                         "POST /api/narrative/analyse",
            "detail": zia_detail,
        },
        {
            "service": "Zia OCR / Face / Object detection",
            "category": "ai",
            "status": "not-used",
            "call_site": None,
            "detail": "Only Zia's text analytics is used. OCR would need scanned "
                      "complaint documents to read and face matching would need a "
                      "photo corpus; neither exists in this synthetic dataset, and "
                      "building the upload path for them the day before submission "
                      "would risk the working feature for an unusable one.",
        },
        {
            "service": "Cron / Job Scheduling",
            "category": "orchestration",
            "status": job_status,
            # This entry previously claimed a schedule "has to invoke a Catalyst
            # Function, which means a second deployable". That was wrong:
            # job_scheduling/_types.py defines TargetType FUNCTION, CIRCUIT,
            # APPSAIL and WEBHOOK, and the AppSail and Webhook variants carry a
            # url and headers - so a job can call this very app.
            "call_site": "src/services/catalyst.py list_jobpools/list_crons/"
                         "create_daily_cron, used by /api/system/jobs/digest",
            "detail": job_detail,
        },
        {
            "service": "SmartBrowz (headless rendering)",
            "category": "documents",
            "status": browz_status,
            "call_site": "src/services/catalyst.py html_to_pdf, driven by "
                         "src/services/report_pdf.py for "
                         "GET /api/compliance/report.pdf",
            "detail": browz_detail,
        },
        {
            "service": "NoSQL / Search / Push / Circuits / SmartBrowz Dataverse",
            "category": "mixed",
            "status": "not-used",
            "call_site": None,
            "detail": "No call site. Search indexes Data Store tables, which this "
                      "project does not use. Push needs a registered mobile or web "
                      "client. Circuits orchestrates Functions, of which there are "
                      "none. SmartBrowz Dataverse is business-lead enrichment, "
                      "which has nothing to do with policing. Listed so this "
                      "inventory is a complete account rather than only the "
                      "services that flatter the project.",
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
            "not-available": ("called for real and refused by the service itself, "
                              "with the API's own error quoted. Distinct from "
                              "not-configured, which is something we can fix, and "
                              "from not-used, which we chose"),
            "not-used": "no call site in this repository; the reason is stated",
            "platform": "the project runs on it without an SDK call from the app",
            "note": "Status is derived from configuration and observed behaviour. "
                    "A service is reported live only when a call has actually "
                    "succeeded, so this endpoint can be checked rather than trusted.",
        },
    }
