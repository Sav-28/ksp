/**
 * Shared visual language for official reporting views.
 *
 * The analytics views were each styled independently, which produced a
 * consumer-dashboard look: rounded cards, drop shadows, bright accents and emoji
 * in headings. Government reporting systems read differently - dense bordered
 * tables, a restrained palette, explicit "as on" dating, monospaced reference
 * numbers, and numbered sections. These tokens exist so every official view uses
 * the same conventions instead of re-inventing them.
 *
 * Palette is deliberately narrow. Colour carries MEANING here (severity), so it
 * is not spent on decoration.
 */
import React from 'react';

export const GOV = {
  navy: '#1a237e',
  navyDark: '#0d1257',
  ink: '#1c1c1c',
  muted: '#5c5c5c',
  faint: '#8a8a8a',
  rule: '#c9ccd4',
  ruleStrong: '#9aa0ad',
  panel: '#ffffff',
  panelAlt: '#f6f7f9',
  headerBand: '#eceef3',
  // Severity scale, used consistently across every view.
  breach: '#8e0000',
  breachBg: '#fbe9e9',
  critical: '#b34700',
  criticalBg: '#fdf0e6',
  warning: '#8a6d00',
  warningBg: '#fdf8e3',
  ok: '#1b5e20',
  okBg: '#eaf2ea',
} as const;

/** Monospaced, for FIR/CrimeNo and other official reference numbers. */
export const mono: React.CSSProperties = {
  fontFamily: "'Consolas','Courier New',monospace",
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0.2,
};

/** A bordered report panel. Square corners, hairline rule, no shadow. */
export const panel: React.CSSProperties = {
  background: GOV.panel,
  border: `1px solid ${GOV.rule}`,
  borderRadius: 2,
  marginBottom: 18,
};

/** Panel heading bar, with a numbered-section convention. */
export const panelHead: React.CSSProperties = {
  background: GOV.headerBand,
  borderBottom: `1px solid ${GOV.rule}`,
  padding: '9px 14px',
  fontSize: 13,
  fontWeight: 700,
  color: GOV.navy,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
};

export const panelBody: React.CSSProperties = { padding: 14 };

/** Explanatory text under a heading. Present, but visually subordinate. */
export const noteText: React.CSSProperties = {
  fontSize: 11.5,
  color: GOV.muted,
  lineHeight: 1.55,
};

/** Dense data table, ruled like a government return. */
export const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12.5,
};

export const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  fontSize: 11,
  fontWeight: 700,
  color: GOV.navy,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  background: GOV.panelAlt,
  borderBottom: `1.5px solid ${GOV.ruleStrong}`,
  borderRight: `1px solid ${GOV.rule}`,
  whiteSpace: 'nowrap',
};

export const td: React.CSSProperties = {
  padding: '7px 10px',
  borderBottom: `1px solid ${GOV.rule}`,
  borderRight: `1px solid ${GOV.rule}`,
  verticalAlign: 'top',
  color: GOV.ink,
};

/** Right-aligned numeric cell with tabular figures, so columns line up. */
export const tdNum: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

/** Key figure block for the summary strip. Square, ruled, no shadow. */
export const figure = (accent: string): React.CSSProperties => ({
  background: GOV.panel,
  border: `1px solid ${GOV.rule}`,
  borderTop: `3px solid ${accent}`,
  borderRadius: 2,
  padding: '10px 14px',
  minWidth: 150,
  flex: '1 1 150px',
});

export const figureLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: GOV.muted,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

export const figureValue: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: GOV.ink,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.15,
};

export const figureSub: React.CSSProperties = { fontSize: 11, color: GOV.faint };

/**
 * Severity chip. Square, bordered, uppercase - the register a compliance return
 * uses, rather than a coloured pill.
 */
export const chip = (fg: string, bg: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '1px 7px',
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: fg,
  background: bg,
  border: `1px solid ${fg}33`,
  borderRadius: 2,
  whiteSpace: 'nowrap',
});

/** Map a compliance/severity word to its chip colours. */
export function severityChip(status: string): React.CSSProperties {
  const s = (status || '').toLowerCase();
  if (s === 'breached' || s === 'high') return chip(GOV.breach, GOV.breachBg);
  if (s === 'critical') return chip(GOV.critical, GOV.criticalBg);
  if (s === 'warning' || s === 'medium') return chip(GOV.warning, GOV.warningBg);
  return chip(GOV.ok, GOV.okBg);
}

/** Page title block with the "as on" dating convention. */
export const pageTitle: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  color: GOV.navy,
  letterSpacing: 0.2,
  margin: 0,
};

export const pageSubTitle: React.CSSProperties = {
  fontSize: 12.5,
  color: GOV.muted,
  marginTop: 3,
};

/** Statutory citation / disclaimer block. */
export const legalNote: React.CSSProperties = {
  background: GOV.panelAlt,
  borderLeft: `3px solid ${GOV.navy}`,
  padding: '9px 12px',
  fontSize: 11.5,
  color: GOV.ink,
  lineHeight: 1.6,
  marginBottom: 18,
};

/** Format a date as the "as on 27 Aug 2026" convention used in official returns. */
export function asOn(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Indian-format currency, no decimals. */
export function inr(n: number): string {
  return '\u20B9' + Math.round(n).toLocaleString('en-IN');
}
