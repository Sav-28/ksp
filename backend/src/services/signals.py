"""
KSP write-event signals — fire-and-forget HTTP calls to a Catalyst Function
after database commits (FIR registration, status updates, custody alerts).

HOW CATALYST SIGNALS ACTUALLY WORK
------------------------------------
Catalyst Signals is a console-configured event routing system:
    Publisher (external source) → Rule (filter + transform) → Target (Function)

There is NO SDK method to "emit" a signal programmatically from AppSail.
What you CAN do from AppSail is POST directly to a Catalyst Function's HTTP
endpoint. That function can then perform any fanout action (push, mail, audit
log, Cliq message, etc.) using the Catalyst SDK it has available.

This module does exactly that: after a successful db.commit() it fires a
non-blocking POST to KSP_FUNCTION_URL. The function at that URL is a Catalyst
Basic I/O function you deploy separately — it receives the JSON payload and
can do whatever secondary work is needed.

If you also want to use the Signals console routing (e.g. to react to events
from other Zoho apps), configure your AppSail app as a Custom Publisher in
the Signals console and point the webhook at this app's own endpoints — that
is a console-side configuration, not a code change here.

Configuration:
    KSP_FUNCTION_URL    Base URL of the Catalyst Function that handles events.
                        e.g. https://ksp-event-handler-NNNNN.catalystfn.in
                        Leave empty to disable entirely (default for local dev).
    KSP_SIGNAL_TIMEOUT  HTTP timeout in seconds for each signal call (default 10).

Payload sent to the function:
    {
        "event_type":  "fir_registered" | "fir_status_updated"
                       | "custody_critical" | "custody_breached",
        "fir_number":  "<18-digit CrimeNo>",
        "crime_type":  "<e.g. Murder>",
        "district":    "<e.g. Bengaluru Urban>",
        "new_status":  "<status string>",    // fir_status_updated only
        "arrest_made": <bool>,               // fir_status_updated only
        "details":     { ... }               // event-specific extra fields
    }

Every call is best-effort and non-blocking — a signal failure never fails
the originating API request.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any, Dict, Optional

import requests

log = logging.getLogger(__name__)

_FUNCTION_BASE = os.getenv("KSP_FUNCTION_URL", "").rstrip("/")
_SIGNAL_PATH = "/api/signals"
_TIMEOUT = float(os.getenv("KSP_SIGNAL_TIMEOUT", "10"))


def _enabled() -> bool:
    return bool(_FUNCTION_BASE)


def _send(payload: Dict[str, Any]) -> None:
    """POST the payload to the Catalyst Function endpoint. Runs on a daemon thread."""
    if not _enabled():
        return
    url = f"{_FUNCTION_BASE}{_SIGNAL_PATH}"
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
        if resp.status_code >= 400:
            log.warning("Signal %r → HTTP %d: %s",
                        payload.get("event_type"), resp.status_code, resp.text[:200])
        else:
            log.debug("Signal %r sent (HTTP %d).", payload.get("event_type"), resp.status_code)
    except Exception as exc:
        log.debug("Signal %r failed (non-fatal): %s", payload.get("event_type"), exc)


def _fire(payload: Dict[str, Any]) -> None:
    """Dispatch the payload on a daemon thread so the caller returns immediately."""
    if not _enabled():
        return
    threading.Thread(target=_send, args=(payload,), daemon=True).start()


# ---------------------------------------------------------------------------
# Public helpers — call these after db.commit() in route handlers
# ---------------------------------------------------------------------------

def fir_registered(
    fir_number: str,
    crime_type: str,
    district: str,
    crime_id: int,
    registered_by: str,
    persons_count: int = 0,
) -> None:
    """Fire after a new FIR is committed (POST /api/crimes)."""
    _fire({
        "event_type": "fir_registered",
        "fir_number": fir_number,
        "crime_type": crime_type,
        "district": district,
        "details": {
            "crime_id": crime_id,
            "registered_by": registered_by,
            "persons_linked": persons_count,
        },
    })


def fir_status_updated(
    fir_number: str,
    crime_type: str,
    district: str,
    new_status: str,
    arrest_made: bool = False,
    updated_by: str = "",
) -> None:
    """
    Fire after an investigation status change is committed
    (PATCH /api/crimes/{fir_number}).

    Key transitions your Function should watch for:
      arrest_made=True        → accused in custody, custody clock starts
      new_status="Chargesheet Filed" → custody clock stops
      new_status in {Closed, Convicted, Acquitted} → terminal disposition
    """
    _fire({
        "event_type": "fir_status_updated",
        "fir_number": fir_number,
        "crime_type": crime_type,
        "district": district,
        "new_status": new_status,
        "arrest_made": arrest_made,
        "details": {"updated_by": updated_by},
    })


def custody_deadline_alert(
    fir_number: str,
    crime_type: str,
    district: str,
    police_station: str,
    compliance_status: str,   # "Critical" | "Breached"
    days_remaining: int,
) -> None:
    """
    Fire when the digest finds a Critical or Breached custody case.
    compliance_status is "Critical" or "Breached".
    """
    _fire({
        "event_type": f"custody_{compliance_status.lower()}",
        "fir_number": fir_number,
        "crime_type": crime_type,
        "district": district,
        "details": {
            "police_station": police_station,
            "compliance_status": compliance_status,
            "days_remaining": days_remaining,
        },
    })
