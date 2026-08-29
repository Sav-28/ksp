"""
HTML rendering shared by the mail digest and the PDF report.

WHY THE TWO SHARE A RENDERER
----------------------------
The custody clock is the one number in this system with a legal consequence
attached, and it is now presented in three places: the Compliance screen, the
morning mail digest, and a downloadable PDF. Two hand-written HTML builders for
the same table would drift, and the failure mode is not cosmetic - a supervisor
reading "12 breached" in an email and "14 breached" in the attached report has no
way to know which to act on. So the table is built once, here.

TWO RULES THAT DIFFER FROM ORDINARY WEB HTML
-------------------------------------------
1. EVERYTHING IS INLINE-STYLED. Mail clients strip <style> blocks, and HTML-to-PDF
   engines handle inline styles far more reliably than linked or embedded
   stylesheets. So there is no stylesheet anywhere in this module.

2. EVERY INTERPOLATED VALUE IS ESCAPED. The digest that this module replaces
   interpolated raw, which was survivable in a mail body built from seeded data.
   A PDF served over HTTP from values that include a police station name typed by
   an officer is a different proposition, so escape() is applied without
   exception - including to numbers, so that no future caller can pass a string
   through by accident.

A full document (document()) carries <meta charset="utf-8">, which is not
optional here: the data contains the rupee sign and Kannada text, and a PDF
renderer given no encoding declaration will mangle both.
"""
from __future__ import annotations

from html import escape
from typing import Any, Dict, Iterable, List, Optional, Sequence

# Kept together so the two outputs cannot diverge on colour either.
INK = "#1c1c1c"
ACCENT = "#1a237e"
MUTED = "#5c5c5c"
RULE = "#c9ccd4"
HEADER_BG = "#eceef3"
BREACH = "#8e0000"
WARN = "#b34700"
OK_BG = "#eaf2ea"
OK_RULE = "#1b5e20"
FONT = "Segoe UI,Arial,sans-serif"
MONO = "Consolas,monospace"


def esc(value: Any) -> str:
    """
    Escape any value for HTML.

    Accepts Any rather than str deliberately: callers pass ints and floats, and a
    signature that demanded str would invite str() at the call site, which is
    where someone eventually forgets to escape.
    """
    if value is None:
        return "-"
    return escape(str(value), quote=True)


def table(headers: Sequence[str],
          rows: Iterable[Sequence[Any]],
          align_right: Sequence[int] = (),
          row_tones: Optional[Sequence[Optional[str]]] = None) -> str:
    """
    A bordered table. `align_right` holds column indexes; `row_tones` an optional
    per-row colour applied to the right-aligned columns, for urgency.
    """
    head = "".join(
        f'<th style="padding:6px 9px;border:1px solid #9aa0ad;background:{HEADER_BG};'
        f'text-align:left;font-size:11px;text-transform:uppercase;">{esc(h)}</th>'
        for h in headers
    )
    body: List[str] = []
    tones = list(row_tones or [])
    for i, row in enumerate(rows):
        tone = tones[i] if i < len(tones) else None
        cells = []
        for j, cell in enumerate(row):
            right = j in align_right
            style = f"padding:6px 9px;border:1px solid {RULE};"
            if right:
                style += "text-align:right;"
                if tone:
                    style += f"color:{tone};font-weight:700;"
            elif j == 0:
                style += f"font-family:{MONO};"
            cells.append(f'<td style="{style}">{esc(cell)}</td>')
        body.append("<tr>" + "".join(cells) + "</tr>")

    return (f'<table style="border-collapse:collapse;font-size:13px;width:100%;">'
            f"<thead><tr>{head}</tr></thead>"
            f'<tbody>{"".join(body)}</tbody></table>')


def empty_state(message: str) -> str:
    """The good-news panel, for when a table would have no rows."""
    return (f'<p style="margin:0;padding:12px;background:{OK_BG};'
            f'border-left:3px solid {OK_RULE};">{esc(message)}</p>')


def heading(title: str, subtitle: str) -> str:
    """The masthead block used at the top of both outputs."""
    return (f'<div style="border-bottom:2px solid {ACCENT};padding-bottom:8px;'
            f'margin-bottom:14px;">'
            f'<div style="font-size:17px;font-weight:700;color:{ACCENT};">'
            f'{esc(title)}</div>'
            f'<div style="font-size:12px;color:{MUTED};">{esc(subtitle)}</div>'
            f'</div>')


def footnote(*paragraphs: str) -> str:
    """Small print: statutory basis, disclaimer, provenance."""
    inner = "".join(
        f'<div style="margin-top:4px;">{p}</div>' for p in paragraphs if p
    )
    return (f'<div style="margin-top:14px;font-size:11px;color:{MUTED};'
            f'line-height:1.6;">{inner}</div>')


def custody_table(cases: List[Dict[str, Any]]) -> str:
    """
    The custody-clock table. THE shared piece: the digest and the PDF both call
    this, so the two can never disagree about a statutory deadline.
    """
    if not cases:
        return empty_state(
            "No case is within the digest horizon of its statutory chargesheet "
            "deadline, and none has exceeded it."
        )
    rows, tones = [], []
    for c in cases:
        breached = c["days_remaining"] < 0
        tones.append(BREACH if breached else WARN)
        remaining = (f'{abs(c["days_remaining"])} days over' if breached
                     else f'{c["days_remaining"]} days left')
        rows.append([
            c.get("crime_no"), c.get("crime_type"), c.get("police_station"),
            f'{c.get("days_in_custody")} / {c.get("statutory_limit_days")}',
            remaining, c.get("compliance_status"),
        ])
    return table(
        ("Crime No.", "Offence", "Police station", "Day", "Remaining", "Status"),
        rows, align_right=(3, 4), row_tones=tones,
    )


def counts_strip(clock: Dict[str, Any]) -> str:
    """One-line summary of the clock, above the table."""
    counts = clock.get("counts", {}) or {}
    return (f'<div style="font-size:13px;margin-bottom:12px;">'
            f'<strong>{esc(counts.get("breached", 0))}</strong> case(s) past the '
            f'statutory period &middot; '
            f'<strong>{esc(counts.get("critical", 0))}</strong> due within 7 days '
            f'&middot; <strong>{esc(clock.get("total_under_clock", 0))}</strong> '
            f'under the clock in total</div>')


def fragment(inner: str) -> str:
    """An HTML fragment, for embedding in a mail body."""
    return f'<div style="font-family:{FONT};color:{INK};">{inner}</div>'


def document(title: str, inner: str) -> str:
    """
    A COMPLETE HTML document, for a PDF renderer or for a browser to print.

    Two things here are load-bearing:

    * The charset declaration. The data contains the rupee sign and Kannada
      district names, and a renderer given no encoding will mangle both.
    * The print stylesheet. This document is served directly when server-side
      rendering is unavailable, and it has to produce a correct A4 page from the
      browser's own print dialogue - right margins, no page break through the
      middle of a table row, and backgrounds retained so the urgency colours
      survive. A <style> block is fine here precisely because this output is for a
      browser; the mail fragment above uses inline styles only, for clients that
      strip stylesheets.
    """
    return (
        '<!DOCTYPE html><html lang="en"><head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{esc(title)}</title>"
        "<style>"
        "@page { size: A4; margin: 12mm 12mm 14mm 12mm; }"
        "@media print {"
        "  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }"
        "  tr, td, th { page-break-inside: avoid; }"
        "  thead { display: table-header-group; }"
        "  .no-print { display: none; }"
        "}"
        "body { max-width: 1000px; margin: 0 auto; padding: 16px; }"
        "</style>"
        "</head>"
        f'<body style="font-family:{FONT};color:{INK};">{inner}</body>'
        "</html>"
    )


def print_hint() -> str:
    """
    A one-line instruction shown on screen and hidden when printing.

    Only rendered when server-side PDF rendering was unavailable, so the reader is
    told how to get their document rather than left with a web page.
    """
    return (f'<div class="no-print" style="background:#fff8e1;'
            f'border:1px solid #ffe082;border-radius:6px;padding:10px 12px;'
            f'margin-bottom:14px;font-size:12.5px;color:#8d6e00;">'
            f'<strong>Print or save as PDF:</strong> use your browser\'s print '
            f'dialogue (Ctrl+P / Cmd+P). The page is already laid out for A4. '
            f'Server-side PDF rendering was unavailable for this request - the '
            f'reason is in the X-Report-Fallback-Reason response header.'
            f'</div>')
