"""
Push notification service — backed by Catalyst Cloud Scale Push Notifications.

HOW CATALYST PUSH WORKS
------------------------
Catalyst Push is a fully managed service. You do NOT handle VAPID keys,
subscription objects, or service worker registration yourself. The platform
manages all of that. The server-side API is one call:

    app.push_notification().web().send_notification(message, user_list)

Where:
    message    — plain text, HTML, or a JSON string (the browser's
                 messageHandler receives it as-is)
    user_list  — list of up to 50 Catalyst user IDs (int) or email addresses

The front-end uses the Catalyst Web SDK snippet (copied from the console under
Cloud Scale → Push Notifications → Web) to enable subscriptions. The SDK
registers the service worker and manages the subscription internally — no
manual pushManager.subscribe() is needed.

PREREQUISITE — Console setup (one-time):
    1. Catalyst console → Cloud Scale → Push Notifications → Web tab.
    2. Copy the enableNotification() snippet and paste it into the frontend
       (see PushPermission.tsx — it wraps that snippet).
    3. Optionally send a test notification from the console to verify.

RECIPIENT IDENTIFICATION
------------------------
Catalyst Push addresses users by their Catalyst User ID or email. Your KSP
users are authenticated against Catalyst Auth (the JWT tokens are signed by
KSP_SECRET_KEY, but the user records exist in Catalyst's user store). The
email address from KSP_DIGEST_TO is used as the recipient identifier, which
matches the email the officer used to log in to Catalyst.

If KSP_PUSH_RECIPIENTS is set, those emails are used instead of (or in
addition to) KSP_DIGEST_TO. Leave both unset to disable push silently — the
digest still renders and mails, push is additive.

Configuration:
    KSP_PUSH_RECIPIENTS   Comma-separated email addresses to notify
                          (falls back to KSP_DIGEST_TO if unset)
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)


def _recipients() -> List[str]:
    """
    Resolve the push recipient list.

    KSP_PUSH_RECIPIENTS takes priority; falls back to KSP_DIGEST_TO so the
    digest and push go to the same people by default with no extra config.
    """
    raw = os.getenv("KSP_PUSH_RECIPIENTS", "").strip()
    if not raw:
        raw = os.getenv("KSP_DIGEST_TO", "").strip()
    return [e.strip() for e in raw.split(",") if e.strip()]


def _push_instance():
    """
    Return the Catalyst push_notification().web() handle, or None.

    Uses the same get_app() wrapper that all other Catalyst calls in this
    project use — captures headers from the most recent request and replays
    them into this thread so initialize() succeeds outside a request context
    (e.g. the digest background thread).
    """
    from src.services.catalyst import get_app
    app = get_app()
    if app is None:
        return None
    try:
        return app.push_notification().web()
    except Exception as exc:
        log.debug("Catalyst push_notification() unavailable: %s", exc)
        return None


def send_notification(
    message: str,
    recipients: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Send a push notification via Catalyst Cloud Scale Push.

    `message` is delivered as-is to the browser's messageHandler in the
    Catalyst Web SDK. Keep it short — it shows as a browser notification body.

    `recipients` overrides the default list from _recipients(). Pass explicit
    emails when the caller knows exactly who should be notified (e.g. the
    officer who registered a specific FIR).

    Returns {"sent": bool, "reason": str|None} — never raises.
    """
    targets = recipients if recipients is not None else _recipients()
    if not targets:
        return {"sent": False, "reason": "no push recipients configured (KSP_PUSH_RECIPIENTS or KSP_DIGEST_TO)"}

    push = _push_instance()
    if push is None:
        return {"sent": False, "reason": "Catalyst SDK not initialised or push_notification() unavailable"}

    try:
        # Catalyst Push accepts up to 50 recipients per call.
        # Chunk if the list is longer (unlikely for KSP but defensive).
        for i in range(0, len(targets), 50):
            batch = targets[i:i + 50]
            result = push.send_notification(message, batch)
            log.debug("Catalyst push sent to %d recipient(s): %s", len(batch), result)
        return {"sent": True, "reason": None}
    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"[:400]
        log.warning("Catalyst push send_notification failed: %s", err)
        return {"sent": False, "reason": err}


def broadcast_custody_alerts(
    cases: List[Dict[str, Any]],
    extra_recipients: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Send a custody deadline push notification summarising Breached/Critical cases.

    Called by the daily digest when action_required > 0. `cases` is the list
    from compliance_service.custody_clock()["cases"] pre-filtered to
    compliance_status in {"Breached", "Critical"}.

    `extra_recipients` merges with the default list — useful when a specific
    officer's email is known from the triggering request context.
    """
    breached = [c for c in cases if c.get("compliance_status") == "Breached"]
    critical = [c for c in cases if c.get("compliance_status") == "Critical"]

    if not breached and not critical:
        return {"sent": False, "reason": "no action-required cases"}

    lines = []
    if breached:
        lines.append(f"{len(breached)} case(s) have BREACHED the chargesheet deadline.")
    if critical:
        lines.append(f"{len(critical)} case(s) are due within 7 days.")
    lines.append("Open the compliance report to review. [KSP Crime Intelligence]")

    message = " ".join(lines)

    # Merge default recipients with any extras passed by the caller.
    targets = list(_recipients())
    if extra_recipients:
        for e in extra_recipients:
            if e and e not in targets:
                targets.append(e)

    return send_notification(message, recipients=targets or None)
