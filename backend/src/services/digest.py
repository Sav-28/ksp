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
    Plain, table-driven HTML.

    Deliberately inline-styled and free of external assets: mail clients strip
    stylesheets, and this has to be legible in whatever the officer opens it in.
    """
    if not rows:
        body = (
            '<p style="margin:0;padding:12px;background:#eaf2ea;'
            'border-left:3px solid #1b5e20;">No case is within '
            f'{DIGEST_HORIZON_DAYS} days of its statutory chargesheet deadline, '
            'and none has exceeded it.</p>'
        )
    else:
        cells = []
        for c in rows:
            breached = c["days_remaining"] < 0
            tone = "#8e0000" if breached else "#b34700"
            remaining = (f'{abs(c["days_remaining"])} days over'
                         if breached else f'{c["days_remaining"]} days left')
            cells.append(
                '<tr>'
                f'<td style="padding:6px 9px;border:1px solid #c9ccd4;'
                f'font-family:Consolas,monospace;">{c["crime_no"]}</td>'
                f'<td style="padding:6px 9px;border:1px solid #c9ccd4;">{c["crime_type"] or "-"}</td>'
                f'<td style="padding:6px 9px;border:1px solid #c9ccd4;">{c["police_station"] or "-"}</td>'
                f'<td style="padding:6px 9px;border:1px solid #c9ccd4;text-align:right;">'
                f'{c["days_in_custody"]} / {c["statutory_limit_days"]}</td>'
                f'<td style="padding:6px 9px;border:1px solid #c9ccd4;text-align:right;'
                f'color:{tone};font-weight:700;">{remaining}</td>'
                f'<td style="padding:6px 9px;border:1px solid #c9ccd4;color:{tone};">'
                f'{c["compliance_status"]}</td>'
                '</tr>'
            )
        header = "".join(
            f'<th style="padding:6px 9px;border:1px solid #9aa0ad;background:#eceef3;'
            f'text-align:left;font-size:11px;text-transform:uppercase;">{h}</th>'
            for h in ("Crime No.", "Offence", "Police station", "Day", "Remaining", "Status")
        )
        body = (
            '<table style="border-collapse:collapse;font-size:13px;width:100%;">'
            f'<thead><tr>{header}</tr></thead><tbody>{"".join(cells)}</tbody></table>'
        )

    counts = clock.get("counts", {})
    return f"""<div style="font-family:Segoe UI,Arial,sans-serif;color:#1c1c1c;">
  <div style="border-bottom:2px solid #1a237e;padding-bottom:8px;margin-bottom:14px;">
    <div style="font-size:17px;font-weight:700;color:#1a237e;">
      Custody Clock Digest &mdash; chargesheet deadlines
    </div>
    <div style="font-size:12px;color:#5c5c5c;">As on {as_on}</div>
  </div>
  <div style="font-size:13px;margin-bottom:12px;">
    <strong>{counts.get('breached', 0)}</strong> case(s) past the statutory period
    &middot; <strong>{counts.get('critical', 0)}</strong> due within 7 days
    &middot; <strong>{clock.get('total_under_clock', 0)}</strong> under the clock in total
  </div>
  {body}
  <div style="margin-top:14px;font-size:11px;color:#5c5c5c;line-height:1.6;">
    <div><strong>Statutory basis:</strong> {clock.get('legal_basis', '')}</div>
    <div style="margin-top:4px;"><em>{DISCLAIMER}</em></div>
  </div>
</div>"""


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
