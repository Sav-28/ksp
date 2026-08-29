"""
Custody-clock digest: the cases a supervising officer needs to see today.

This is the one place where a Catalyst service is joined to the platform's most
operational output. Every other view answers an analytical question; this answers
"which of my cases breaches a statutory deadline, and when".

It reuses compliance.custody_clock() rather than recomputing, so the digest, the
COMPLIANCE screen and the case dossier can never disagree about whether a case has
breached - the BNSS 60/90-day rule stays in exactly one function.

When Mail is not configured the digest still renders fully and is returned as a
preview. A feature that fails because a delivery channel is unset would be worse
than one that shows the officer the content and says it was not sent.
"""
from __future__ import annotations

import os
from datetime import date
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from src.services import catalyst
from src.services import report_html as R
from src.services.compliance import custody_clock, DISCLAIMER

# Cases at or inside this many days of the statutory limit are the ones a digest
# is for. Breaches are always included regardless.
DIGEST_HORIZON_DAYS = 7


def _rows_for_digest(clock: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Cases at or inside the horizon, breaches included.

    `cases` arrives sorted most-urgent-first from custody_clock, so breaches lead
    without re-sorting. The condition is a single comparison: a breach has a
    negative days_remaining, which already satisfies <= the horizon.
    """
    return [
        c for c in clock.get("cases", [])
        if c["days_remaining"] <= DIGEST_HORIZON_DAYS
    ]


def _render_html(rows: List[Dict[str, Any]], clock: Dict[str, Any],
                 as_on: str) -> str:
    """
    Mail-body fragment, built from the shared renderer in report_html.

    The table used to be assembled here by hand. It moved so that the digest and
    the downloadable PDF cannot disagree about a statutory deadline - a supervisor
    reading different breach counts in an email and its attached report has no way
    to know which one to act on. The move also brought escaping with it: this
    function previously interpolated crime numbers and station names raw.
    """
    body = R.custody_table(rows)
    return R.fragment(
        R.heading("Custody Clock Digest - chargesheet deadlines", f"As on {as_on}")
        + R.counts_strip(clock)
        + body
        + R.footnote(
            f"<strong>Statutory basis:</strong> {R.esc(clock.get('legal_basis', ''))}",
            f"<em>{R.esc(DISCLAIMER)}</em>",
        )
    )


def build_and_maybe_send(db: Session, send: bool = False) -> Dict[str, Any]:
    """
    Assemble the digest and, when Mail is configured and `send` is set, deliver it.

    Always returns the rendered content, the rows behind it, and an explicit
    delivery outcome - so the caller can show the digest whether or not it sent.

    `send` defaults to False so that sending is always an explicit act. It used to
    default to True while its only route defaulted to False, which meant the safe
    behaviour lived in the caller: any new call site that forgot the argument
    would have dispatched real mail.
    """
    as_on = date.today().isoformat()
    clock = custody_clock(db)
    rows = _rows_for_digest(clock)
    html = _render_html(rows, clock, as_on)

    breached = clock.get("counts", {}).get("breached", 0)
    subject = (
        f"KSP custody clock, {as_on}: {breached} past deadline, "
        f"{len(rows)} needing action"
    )

    recipients = [a.strip() for a in os.getenv("KSP_DIGEST_TO", "").split(",") if a.strip()]

    if not send:
        delivery = {"sent": False, "reason": "send=false requested by the caller"}
    else:
        delivery = catalyst.send_mail(subject=subject, content=html, to=recipients)

    return {
        "as_on": as_on,
        "subject": subject,
        "horizon_days": DIGEST_HORIZON_DAYS,
        "recipients": recipients,
        "summary": {
            "breached": breached,
            "critical": clock.get("counts", {}).get("critical", 0),
            "in_digest": len(rows),
            "total_under_clock": clock.get("total_under_clock", 0),
        },
        "cases": rows,
        "html": html,
        "delivery": delivery,
        # Stated plainly so a preview is never mistaken for a sent message.
        "note": (
            "Delivered via Catalyst Mail."
            if delivery.get("sent") else
            f"NOT sent - {delivery.get('reason')}. The rendered digest is returned "
            f"above as a preview."
        ),
    }
