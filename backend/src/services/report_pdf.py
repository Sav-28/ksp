"""
The station compliance report as a downloadable document.

WHY A PDF AT ALL
----------------
Police work is document-driven. A screen showing 23 breached cases is useful to
the officer looking at it; a dated, signed-off sheet is what gets carried into a
station review, attached to a note, or filed. Every other output of this system
lives only inside the browser session that produced it.

Rendering is done by Catalyst SmartBrowz, which takes HTML and returns PDF bytes.
When it is unavailable the caller gets the HTML instead, with the reason attached
- a report you can still print beats an error page.

WHAT THIS MODULE DOES NOT DO
----------------------------
It does not recompute anything. Every figure comes from the same
compliance.compliance_report() payload the Compliance screen and the mail digest
use, so the document cannot disagree with the screen it was generated from. The
custody table in particular is rendered by the shared helper in report_html.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from src.services import report_html as R
from src.services.compliance import DISCLAIMER

TITLE = "Station Compliance Report"


def _headline(report: Dict[str, Any]) -> str:
    """The figures a supervisor reads first, as a row of labelled boxes."""
    h = report.get("headline", {}) or {}
    boxes = [
        ("Needing action", h.get("action_required", 0), R.BREACH),
        ("Past deadline", h.get("breached", 0), R.BREACH),
        ("Due within 7 days", h.get("critical", 0), R.WARN),
        ("Open investigations", h.get("open_investigations", 0), R.ACCENT),
        ("Oldest open (days)", h.get("oldest_open_days", 0), R.ACCENT),
    ]
    cells = "".join(
        f'<td style="border:1px solid {R.RULE};padding:10px 12px;text-align:center;">'
        f'<div style="font-size:22px;font-weight:700;color:{colour};">{R.esc(value)}</div>'
        f'<div style="font-size:10.5px;color:{R.MUTED};text-transform:uppercase;'
        f'letter-spacing:0.3px;">{R.esc(label)}</div></td>'
        for label, value, colour in boxes
    )
    return (f'<table style="border-collapse:collapse;width:100%;margin-bottom:16px;">'
            f"<tr>{cells}</tr></table>")


def _section(title: str, note: str, inner: str) -> str:
    """A titled block with its own methodological note underneath the heading."""
    return (f'<div style="margin-top:18px;">'
            f'<div style="font-size:14px;font-weight:700;color:{R.ACCENT};'
            f'margin-bottom:3px;">{R.esc(title)}</div>'
            f'<div style="font-size:11px;color:{R.MUTED};margin-bottom:7px;">'
            f'{R.esc(note)}</div>'
            f"{inner}</div>")


def _pendency(block: Dict[str, Any]) -> str:
    profile: List[Dict[str, Any]] = block.get("age_profile", []) or []
    rows = [[p.get("bucket"), p.get("count")] for p in profile]
    return _section(
        "Investigation pendency",
        block.get("note", ""),
        R.table(("Age of open case", "Cases"), rows, align_right=(1,))
        + (f'<div style="font-size:11.5px;color:{R.MUTED};margin-top:5px;">'
           f'{R.esc(block.get("total_open", 0))} open in total; oldest '
           f'{R.esc(block.get("oldest_open_days", 0))} days.</div>'),
    )


def _stations(block: Dict[str, Any]) -> str:
    rows = [[s.get("police_station"), s.get("district"), s.get("registered"),
             s.get("disposed"), s.get("still_open"),
             f'{s.get("disposal_rate_pct")}%']
            for s in (block.get("stations", []) or [])]
    return _section(
        "Station scoreboard",
        block.get("note", ""),
        R.table(("Police station", "District", "Registered", "Disposed",
                 "Still open", "Disposal rate"),
                rows, align_right=(2, 3, 4, 5)),
    )


def _officers(block: Dict[str, Any]) -> str:
    rows = [[o.get("officer"), o.get("total_cases"), o.get("open_cases"),
             o.get("open_with_accused_in_custody"),
             f'{o.get("load_vs_average_pct")}%',
             "Overloaded" if o.get("overloaded") else ""]
            for o in (block.get("officers", []) or [])]
    return _section(
        "Officer workload",
        block.get("note", ""),
        R.table(("Investigating officer", "Total", "Open", "Open with accused in custody",
                 "Load vs average", "Flag"),
                rows, align_right=(1, 2, 3, 4)),
    )


def build_html(report: Dict[str, Any], print_hint: bool = False) -> str:
    """
    The complete report as a standalone HTML document.

    Separate from the PDF call so it can be served directly when SmartBrowz is
    unavailable, and so it can be tested without touching Catalyst. `print_hint`
    adds an on-screen instruction that is hidden when printing, used only on the
    fallback path where the reader has to press Ctrl+P themselves.
    """
    clock = report.get("custody_clock", {}) or {}
    generated = report.get("generated_at") or datetime.utcnow().date().isoformat()

    inner = (
        (R.print_hint() if print_hint else "")
        + R.heading(
            f"Karnataka State Police - {TITLE}",
            f"Generated {generated} - custody clock, pendency, stations and officers",
        )
        + _headline(report)
        + _section(
            "Custody clock",
            "Cases where an accused is in custody and no chargesheet is on record. "
            "Most urgent first.",
            R.custody_table(clock.get("cases", []) or []),
        )
        + _pendency(report.get("investigation_pendency", {}) or {})
        + _stations(report.get("station_scoreboard", {}) or {})
        + _officers(report.get("officer_workload", {}) or {})
        + R.footnote(
            f"<strong>Statutory basis:</strong> {R.esc(clock.get('legal_basis', ''))}",
            f"<em>{R.esc(DISCLAIMER)}</em>",
            "<em>Generated from synthetic data for demonstration. Not an "
            "operational police record.</em>",
        )
    )
    return R.document(f"{TITLE} - {generated}", inner)


def build_pdf(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Render the report.

    Returns {"pdf": bytes|None, "html": str, "renderer": str, "reason": str|None}.
    Never raises: the HTML is always produced, so a caller can always serve
    something rather than an error.
    """
    from src.services import catalyst

    pdf = catalyst.html_to_pdf(build_html(report))
    if pdf:
        return {"pdf": pdf, "html": None,
                "renderer": "catalyst-smartbrowz", "reason": None}
    # Rebuilt with the print instruction, because on this path the reader is
    # looking at a page and has to produce the document themselves.
    return {
        "pdf": None, "html": build_html(report, print_hint=True),
        "renderer": "html-print-ready",
        "reason": (catalyst.diagnostics().get("last_smartbrowz_error")
                   or "SmartBrowz did not return a PDF"),
    }
