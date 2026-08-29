import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict, localizeCrimeType } from '../locale';
import {
  GOV, mono, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  pageTitle, pageSubTitle, asOn, chip,
} from '../govStyles';

/**
 * Crime Statistics Summary — the landing view.
 *
 * Design intent: a dashboard that reports bare totals is not useful. "920 cases"
 * tells an officer nothing; "920 cases, and last month ran 12% above the month
 * before" is information. So every headline figure here carries a comparison and
 * a small trend, the in-progress month is separated from complete months rather
 * than silently compared against them, and the briefing strip routes to the view
 * that can act on each finding.
 *
 * It draws on three endpoints. /api/stats is required; the forecast and
 * compliance reports are enriching and fail soft, so the page still renders if
 * either is unavailable.
 */

interface LabelCount { label: string; count: number; }

interface CrimeRecord {
  id: number;
  fir_number: string;
  date_occurred: string;
  district: string;
  taluk: string;
  police_station: string;
  crime_type: string;
  description: string;
  latitude?: number;
  longitude?: number;
}

interface StatsData {
  total_crimes: number;
  total_districts: number;
  total_crime_types: number;
  by_district: LabelCount[];
  by_crime_type: LabelCount[];
  by_month: LabelCount[];
  recent: CrimeRecord[];
  error: string | null;
}

// Subsets of the forecast and compliance payloads that this view consumes.
interface ForecastLite {
  next_month_forecast: number | null;
  forecast_month?: string | null;
  forecast_is_current_month?: boolean;
  partial_month_count_so_far?: number | null;
  alert_count: number;
  alerts: {
    district: string; name?: string; scope?: string;
    recent: number; previous: number; severity: string; change?: string;
  }[];
}
interface ComplianceLite {
  headline: {
    action_required: number; breached: number; critical: number;
    open_investigations: number; oldest_open_days: number;
  };
}

type ViewName = 'forecast' | 'compliance' | 'hotspots' | 'investigation' | 'insights';

/** Current calendar month as YYYY-MM, to identify the in-progress month. */
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Compact inline trend line. Conveys shape, not precise values. */
const Sparkline = ({ values, colour = GOV.navy, w = 108, h = 30 }: {
  values: number[]; colour?: string; w?: number; h?: number;
}) => {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / span) * (h - 5);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={colour} strokeWidth={1.4} />
      {/* Mark the final point so the eye lands on the latest value. */}
      <circle
        cx={pts[pts.length - 1].split(',')[0]}
        cy={pts[pts.length - 1].split(',')[1]}
        r={2.2} fill={colour}
      />
    </svg>
  );
};

/**
 * Period-over-period change. Rendered as a direction plus magnitude, with the
 * direction word spelled out so it does not depend on colour alone.
 */
const Delta = ({ pct, language, invertColour = false }: {
  pct: number | null; language: 'en' | 'kn'; invertColour?: boolean;
}) => {
  if (pct === null || !isFinite(pct)) {
    return <span style={{ fontSize: 11, color: GOV.faint }}>
      {language === 'en' ? 'no comparison' : 'ಹೋಲಿಕೆ ಇಲ್ಲ'}
    </span>;
  }
  const rising = pct > 0;
  // For crime volume a rise is bad; invertColour flips that where a rise is good.
  const bad = invertColour ? !rising : rising;
  const colour = pct === 0 ? GOV.muted : bad ? GOV.breach : GOV.ok;
  const arrow = pct === 0 ? '\u2192' : rising ? '\u25B2' : '\u25BC';
  const word = pct === 0
    ? (language === 'en' ? 'unchanged' : 'ಬದಲಾಗಿಲ್ಲ')
    : rising ? (language === 'en' ? 'higher' : 'ಹೆಚ್ಚು')
             : (language === 'en' ? 'lower' : 'ಕಡಿಮೆ');
  return (
    <span style={{ fontSize: 11.5, color: colour, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {arrow} {Math.abs(pct).toFixed(1)}% <span style={{ fontWeight: 400 }}>{word}</span>
    </span>
  );
};

/** Headline figure with an optional trend, comparison and drill-through. */
const KeyFigure = ({
  label, value, sub, accent = GOV.navy, spark, sparkColour, delta, onClick, actionLabel,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string;
  spark?: number[]; sparkColour?: string; delta?: React.ReactNode;
  onClick?: () => void; actionLabel?: string;
}) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    style={{
      background: GOV.panel,
      border: `1px solid ${GOV.rule}`,
      borderTop: `3px solid ${accent}`,
      borderRadius: 2,
      padding: '12px 14px 11px',
      flex: '1 1 210px',
      minWidth: 200,
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}
  >
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: GOV.muted,
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
        <div style={{
          fontSize: 30, fontWeight: 700, lineHeight: 1.05, color: accent,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </div>
        {spark && <Sparkline values={spark} colour={sparkColour || accent} />}
      </div>
    </div>
    <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: GOV.faint }}>{sub}</span>
      {delta}
    </div>
    {actionLabel && (
      <div style={{
        marginTop: 8, paddingTop: 7, borderTop: `1px solid ${GOV.rule}`,
        fontSize: 10.5, fontWeight: 700, color: GOV.navy,
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        {actionLabel} &rarr;
      </div>
    )}
  </div>
);

const Dashboard = ({ language, onNavigate }: {
  language: 'en' | 'kn';
  onNavigate?: (v: any) => void;
}) => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [fc, setFc] = useState<ForecastLite | null>(null);
  const [comp, setComp] = useState<ComplianceLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const go = (v: ViewName) => () => onNavigate && onNavigate(v);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/stats');
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setStats(data);
      // Enrichment. Both fail soft: the page is useful without them.
      try { setFc(await (await apiFetch('/api/forecast')).json()); } catch { /* optional */ }
      try { setComp(await (await apiFetch('/api/compliance/report')).json()); } catch { /* optional */ }
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.')
        : t('Unable to reach the server. Confirm the backend is running.',
             'ಸರ್ವರ್ ತಲುಪಲು ಸಾಧ್ಯವಿಲ್ಲ.'));
    } finally {
      setLoading(false);
    }
  };

  // Fetch once on mount. `loadStats` closes over `language` only to phrase the
  // error message, so re-running it on a language switch would be pointless.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadStats(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: GOV.muted, fontSize: 13 }}>
        {t('Loading summary...', 'ಸಾರಾಂಶ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: GOV.breach, fontSize: 13, marginBottom: 16 }}>{error}</div>
        <button onClick={loadStats} style={{
          background: GOV.navy, color: '#fff', border: 'none', borderRadius: 2,
          padding: '8px 20px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {t('Retry', 'ಮರುಪ್ರಯತ್ನಿಸಿ')}
        </button>
      </div>
    );
  }

  if (!stats) return null;

  // --- Separate the in-progress month from complete ones --------------------
  // Comparing a part-month against a full one would understate the current
  // period and make every delta look like a fall. The FORECAST report excludes
  // it for the same reason.
  const cmKey = currentMonthKey();
  const months = stats.by_month;
  const partial = months.length && months[months.length - 1].label === cmKey
    ? months[months.length - 1] : null;
  const complete = partial ? months.slice(0, -1) : months;

  const lastComplete = complete.length ? complete[complete.length - 1] : null;
  const prevComplete = complete.length > 1 ? complete[complete.length - 2] : null;
  const monthDeltaPct = lastComplete && prevComplete && prevComplete.count
    ? ((lastComplete.count - prevComplete.count) / prevComplete.count) * 100
    : null;

  // Trailing twelve complete months, for the sparklines.
  const trailing12 = complete.slice(-12);
  const spark = trailing12.map(m => m.count);
  // Baseline is the TRAILING TWELVE months, not the whole series. An all-time
  // average is dragged down by the early low-volume period, which would make a
  // normal recent month look like a spike against it. Twelve months reflects the
  // regime a reader is actually comparing to.
  const avgPerMonth = trailing12.length
    ? Math.round(trailing12.reduce((s, m) => s + m.count, 0) / trailing12.length)
    : 0;
  const vsBaselinePct = lastComplete && avgPerMonth
    ? ((lastComplete.count - avgPerMonth) / avgPerMonth) * 100
    : null;

  // Rolling 3-month average, drawn over the trend to damp month-to-month noise.
  const rolling = complete.map((_, i) => {
    const w = complete.slice(Math.max(0, i - 2), i + 1);
    return w.reduce((s, m) => s + m.count, 0) / w.length;
  });

  // Direction per district, taken from the forecast report's 60-day comparison.
  const districtTrend = new Map<string, { severity: string; change?: string }>();
  (fc?.alerts || []).forEach(a => {
    if (a.scope !== 'crime type') {
      districtTrend.set(a.name || a.district, { severity: a.severity, change: a.change });
    }
  });
  const typeTrend = new Map<string, { severity: string; change?: string }>();
  (fc?.alerts || []).forEach(a => {
    if (a.scope === 'crime type') {
      typeTrend.set(a.name || a.district, { severity: a.severity, change: a.change });
    }
  });

  // --- Briefing lines: only what warrants an action ------------------------
  const briefing: { text: string; view: ViewName; cta: string; tone: string }[] = [];
  if (comp && comp.headline.breached > 0) {
    briefing.push({
      text: t(`${comp.headline.breached} cases have exceeded the statutory chargesheet period; ${comp.headline.critical} more fall due within 7 days.`,
              `${comp.headline.breached} ಪ್ರಕರಣಗಳು ಕಾಲಮಿತಿ ಮೀರಿವೆ; ${comp.headline.critical} ಇನ್ನೂ 7 ದಿನಗಳಲ್ಲಿ ಬಾಕಿ.`),
      view: 'compliance', cta: t('Open compliance report', 'ಅನುಸರಣೆ ವರದಿ'), tone: GOV.breach,
    });
  }
  if (fc && fc.alert_count > 0) {
    briefing.push({
      text: t(`${fc.alert_count} districts or offence types recorded more cases in the last 60 days than the 60 before.`,
              `${fc.alert_count} ಜಿಲ್ಲೆ ಅಥವಾ ಅಪರಾಧ ಪ್ರಕಾರಗಳಲ್ಲಿ ಕಳೆದ 60 ದಿನಗಳಲ್ಲಿ ಏರಿಕೆ.`),
      view: 'forecast', cta: t('Review early warnings', 'ಮುನ್ನೆಚ್ಚರಿಕೆ ಪರಿಶೀಲನೆ'), tone: GOV.critical,
    });
  }
  if (fc?.next_month_forecast != null && fc.forecast_is_current_month && partial) {
    const pace = fc.next_month_forecast > 0
      ? Math.round((partial.count / fc.next_month_forecast) * 100) : 0;
    briefing.push({
      text: t(`${partial.count} cases registered so far this month against a projected ${fc.next_month_forecast} (${pace}% of projection).`,
              `ಈ ತಿಂಗಳು ಇದುವರೆಗೆ ${partial.count} ಪ್ರಕರಣ, ಅಂದಾಜು ${fc.next_month_forecast} (${pace}%).`),
      view: 'forecast', cta: t('See projection', 'ಪ್ರಕ್ಷೇಪಣೆ'), tone: GOV.navy,
    });
  }

  const monthSpan = months.length
    ? `${months[0].label} \u2013 ${months[months.length - 1].label}` : '';

  return (
    <div style={{ padding: '22px 30px 40px', background: GOV.panelAlt, minHeight: '100%', color: GOV.ink }}>

      {/* Report header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        flexWrap: 'wrap', gap: 12, borderBottom: `2px solid ${GOV.navy}`,
        paddingBottom: 10, marginBottom: 16,
      }}>
        <div>
          <h2 style={pageTitle}>{t('Crime Statistics Summary', 'ಅಪರಾಧ ಅಂಕಿಅಂಶ ಸಾರಾಂಶ')}</h2>
          <div style={pageSubTitle}>
            {t('State position by period, district and offence type, with items requiring attention',
               'ಅವಧಿ, ಜಿಲ್ಲೆ ಮತ್ತು ಅಪರಾಧ ಪ್ರಕಾರದ ಪ್ರಕಾರ ರಾಜ್ಯದ ಸ್ಥಿತಿ')}
          </div>
        </div>
        <div style={{ textAlign: 'right', ...noteText }}>
          {monthSpan && <div><strong>{t('Period', 'ಅವಧಿ')}:</strong> {monthSpan}</div>}
          <div>{t('As on', 'ದಿನಾಂಕದಂತೆ')} {asOn(new Date().toISOString())}</div>
        </div>
      </div>

      {/* Briefing. Placed first because it is the only part that asks for a
          decision; everything below is reference. */}
      {briefing.length > 0 && (
        <div style={{ ...panel, borderLeft: `3px solid ${GOV.navy}`, marginBottom: 18 }}>
          <div style={panelHead}>{t('Requires attention', 'ಗಮನ ಅಗತ್ಯ')}</div>
          <div style={{ padding: '4px 0' }}>
            {briefing.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '10px 14px',
                borderBottom: i < briefing.length - 1 ? `1px solid ${GOV.rule}` : 'none',
              }}>
                <span style={{
                  width: 3, alignSelf: 'stretch', background: b.tone, flexShrink: 0,
                  minHeight: 22,
                }} />
                <span style={{ flex: 1, fontSize: 13, minWidth: 260 }}>{b.text}</span>
                <button onClick={go(b.view)} style={{
                  background: '#fff', color: GOV.navy, border: `1px solid ${GOV.ruleStrong}`,
                  borderRadius: 2, padding: '5px 12px', cursor: 'pointer', fontSize: 10.5,
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                  whiteSpace: 'nowrap',
                }}>
                  {b.cta} &rarr;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key figures, each carrying a comparison rather than a bare count. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <KeyFigure
          label={t('Last complete month', 'ಕೊನೆಯ ಪೂರ್ಣ ತಿಂಗಳು')}
          value={lastComplete ? lastComplete.count : '\u2014'}
          sub={lastComplete
            ? <>
                {lastComplete.label} &middot;{' '}
                {t('12-month average', '12-ತಿಂಗಳ ಸರಾಸರಿ')} {avgPerMonth}
                {vsBaselinePct !== null && (
                  <> ({vsBaselinePct > 0 ? '+' : ''}{vsBaselinePct.toFixed(0)}%)</>
                )}
              </>
            : ''}
          spark={spark}
          delta={<Delta pct={monthDeltaPct} language={language} />}
        />
        {partial && (
          <KeyFigure
            label={t('Month in progress', 'ನಡೆಯುತ್ತಿರುವ ತಿಂಗಳು')}
            value={partial.count}
            accent={GOV.critical}
            sub={`${partial.label} \u00B7 ${t('incomplete', 'ಅಪೂರ್ಣ')}`}
            delta={fc?.next_month_forecast != null
              ? <span style={{ fontSize: 11.5, color: GOV.muted, whiteSpace: 'nowrap' }}>
                  {t('projected', 'ಅಂದಾಜು')} <strong>{fc.next_month_forecast}</strong>
                </span>
              : undefined}
            onClick={onNavigate ? go('forecast') : undefined}
            actionLabel={onNavigate ? t('Forecast', 'ಮುನ್ಸೂಚನೆ') : undefined}
          />
        )}
        {comp && (
          <KeyFigure
            label={t('Open investigations', 'ಬಾಕಿ ತನಿಖೆಗಳು')}
            value={comp.headline.open_investigations}
            sub={`${t('oldest', 'ಹಳೆಯದು')} ${comp.headline.oldest_open_days} ${t('days', 'ದಿನ')}`}
            onClick={onNavigate ? go('compliance') : undefined}
            actionLabel={onNavigate ? t('Pendency', 'ಬಾಕಿ') : undefined}
          />
        )}
        {comp && (
          <KeyFigure
            label={t('Past statutory deadline', 'ಕಾಲಮಿತಿ ಮೀರಿದೆ')}
            value={comp.headline.breached}
            accent={comp.headline.breached > 0 ? GOV.breach : GOV.ok}
            sub={`${comp.headline.critical} ${t('due within 7 days', '7 ದಿನದೊಳಗೆ ಬಾಕಿ')}`}
            onClick={onNavigate ? go('compliance') : undefined}
            actionLabel={onNavigate ? t('Custody clock', 'ವಶ ಕಾಲಮಿತಿ') : undefined}
          />
        )}
        <KeyFigure
          label={t('Cases on record', 'ದಾಖಲೆಯಲ್ಲಿರುವ ಪ್ರಕರಣ')}
          value={stats.total_crimes.toLocaleString('en-IN')}
          sub={`${stats.total_districts} ${t('districts', 'ಜಿಲ್ಲೆ')} \u00B7 ${stats.total_crime_types} ${t('offence types', 'ಅಪರಾಧ ಪ್ರಕಾರ')}`}
        />
      </div>

      {/* 1. Monthly volume */}
      <div style={panel}>
        <div style={panelHead}>
          1. {t('Recorded cases by month', 'ತಿಂಗಳ ಪ್ರಕಾರ ದಾಖಲಾದ ಪ್ರಕರಣಗಳು')}
        </div>
        <div style={panelBody}>
          {(() => {
            const W = 900, H = 260, P = { t: 18, r: 26, b: 46, l: 44 };
            const cw = W - P.l - P.r, ch = H - P.t - P.b;
            const all = months;
            const max = Math.max(...all.map(d => d.count), 1);
            const n = all.length;
            if (!n) return <div style={noteText}>{t('No data.', 'ದತ್ತಾಂಶ ಇಲ್ಲ.')}</div>;
            const xAt = (i: number) => P.l + (n === 1 ? cw / 2 : (i / (n - 1)) * cw);
            const yAt = (v: number) => P.t + ch - (v / max) * ch;
            const barW = Math.max(3, Math.min(22, (cw / n) * 0.62));
            const labelEvery = Math.max(1, Math.ceil(n / 8));
            return (
              <>
                <svg width={W} height={H} style={{ maxWidth: '100%', display: 'block' }} role="img"
                     aria-label={t(`Recorded cases per month across ${n} months.`, 'ಮಾಸಿಕ ಪ್ರಕರಣ ಪ್ರಮಾಣ')}>
                  {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
                    const y = P.t + ch - g * ch;
                    return (
                      <g key={i}>
                        <line x1={P.l} y1={y} x2={W - P.r} y2={y}
                              stroke={i === 0 ? GOV.ruleStrong : '#e8eaee'} />
                        <text x={P.l - 7} y={y + 3.5} fontSize={9.5} fill={GOV.faint} textAnchor="end">
                          {Math.round(g * max)}
                        </text>
                      </g>
                    );
                  })}
                  {/* Columns read better than a line for discrete monthly counts,
                      and let the partial month be hatched rather than implied. */}
                  {all.map((m, i) => {
                    const isPartial = partial && m.label === partial.label;
                    return (
                      <rect key={i} x={xAt(i) - barW / 2} y={yAt(m.count)}
                            width={barW} height={Math.max(1, P.t + ch - yAt(m.count))}
                            fill={isPartial ? '#fff' : GOV.navy}
                            stroke={isPartial ? GOV.critical : 'none'}
                            strokeWidth={isPartial ? 1.2 : 0}
                            strokeDasharray={isPartial ? '3,2' : undefined}>
                        <title>
                          {m.label}: {m.count}
                          {isPartial ? ` (${t('in progress', 'ನಡೆಯುತ್ತಿದೆ')})` : ''}
                        </title>
                      </rect>
                    );
                  })}
                  {/* Rolling 3-month average over the complete months only. */}
                  <path
                    d={rolling.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ')}
                    fill="none" stroke={GOV.critical} strokeWidth={1.6} />
                  {all.map((m, i) => (
                    (i % labelEvery === 0 || i === n - 1) ? (
                      <text key={`x${i}`} x={xAt(i)} y={P.t + ch + 15} fontSize={9}
                            fill={partial && m.label === partial.label ? GOV.critical : GOV.faint}
                            textAnchor="middle">{m.label}</text>
                    ) : null
                  ))}
                </svg>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, ...noteText }}>
                  <span>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: GOV.navy, verticalAlign: 'middle', marginRight: 6 }} />
                    {t('Cases registered', 'ದಾಖಲಾದ ಪ್ರಕರಣ')}
                  </span>
                  <span>
                    <span style={{ display: 'inline-block', width: 18, height: 2, background: GOV.critical, verticalAlign: 'middle', marginRight: 6 }} />
                    {t('Three-month average', 'ಮೂರು ತಿಂಗಳ ಸರಾಸರಿ')}
                  </span>
                  {partial && (
                    <span>
                      <span style={{ display: 'inline-block', width: 10, height: 10, background: '#fff', border: `1px dashed ${GOV.critical}`, verticalAlign: 'middle', marginRight: 6 }} />
                      {t('Month in progress, not yet complete', 'ನಡೆಯುತ್ತಿರುವ ತಿಂಗಳು, ಅಪೂರ್ಣ')}
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* 2. Distribution, with 60-day direction where the forecast report has it */}
      <div style={panel}>
        <div style={{ ...panelHead, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span>2. {t('Distribution by district and offence type', 'ಜಿಲ್ಲೆ ಮತ್ತು ಅಪರಾಧ ಪ್ರಕಾರದ ಹಂಚಿಕೆ')}</span>
          {onNavigate && (
            <button onClick={go('hotspots')} style={{
              font: 'inherit', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4,
              background: 'transparent', border: 'none', color: GOV.navy, cursor: 'pointer',
              fontWeight: 700, padding: 0,
            }}>
              {t('View on map', 'ನಕ್ಷೆಯಲ್ಲಿ ನೋಡಿ')} &rarr;
            </button>
          )}
        </div>
        <div style={panelBody}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {([
              [t('By district', 'ಜಿಲ್ಲೆವಾರು'), stats.by_district, localizeDistrict, districtTrend],
              [t('By offence type', 'ಅಪರಾಧ ಪ್ರಕಾರವಾರು'), stats.by_crime_type, localizeCrimeType, typeTrend],
            ] as const).map(([heading, rows, localise, trend], idx) => {
              const max = Math.max(...rows.map(r => r.count), 1);
              return (
                <div key={idx} style={{ flex: '1 1 400px', minWidth: 340 }}>
                  <div style={{
                    fontSize: 11.5, fontWeight: 700, color: GOV.navy, textTransform: 'uppercase',
                    letterSpacing: 0.3, marginBottom: 7,
                  }}>
                    {heading}
                  </div>
                  <div style={{ border: `1px solid ${GOV.rule}` }}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>{t('Category', 'ವರ್ಗ')}</th>
                          <th style={th}>{t('Cases', 'ಪ್ರಕರಣ')}</th>
                          <th style={th}>{t('Share', 'ಪಾಲು')}</th>
                          <th style={{ ...th, width: '30%' }} />
                          <th style={th}>{t('60-day', '60 ದಿನ')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const tr = trend.get(r.label);
                          return (
                            <tr key={r.label} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                              <td style={td}>{localise(r.label, language)}</td>
                              <td style={{ ...tdNum, fontWeight: 700 }}>{r.count}</td>
                              <td style={{ ...tdNum, color: GOV.muted }}>
                                {stats.total_crimes
                                  ? ((r.count / stats.total_crimes) * 100).toFixed(1) : '0.0'}%
                              </td>
                              <td style={td}>
                                <div style={{ height: 9, background: '#e8eaee' }}>
                                  <div style={{
                                    width: `${Math.max(2, (r.count / max) * 100)}%`,
                                    height: '100%',
                                    background: tr ? GOV.breach : GOV.navy,
                                  }} />
                                </div>
                              </td>
                              {/* Only rows the forecast flagged carry a marker;
                                  absence means no material change, not no data. */}
                              <td style={td}>
                                {tr
                                  ? <span style={chip(GOV.breach, GOV.breachBg)}>
                                      {'\u25B2'} {tr.change || t('rising', 'ಏರಿಕೆ')}
                                    </span>
                                  : <span style={{ color: GOV.faint, fontSize: 11 }}>
                                      {t('steady', 'ಸ್ಥಿರ')}
                                    </span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ ...noteText, marginTop: 9 }}>
            {t('The 60-day column marks categories where the last 60 days exceeded the 60 before, as assessed in the forecast report. "Steady" means no material increase was flagged.',
               '60-ದಿನ ಕಾಲಂ ಕಳೆದ 60 ದಿನಗಳಲ್ಲಿ ಏರಿಕೆ ಕಂಡ ವರ್ಗಗಳನ್ನು ಸೂಚಿಸುತ್ತದೆ.')}
          </div>
        </div>
      </div>

      {/* 3. Recent register */}
      <div style={panel}>
        <div style={{ ...panelHead, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span>3. {t('Recently registered cases', 'ಇತ್ತೀಚೆಗೆ ದಾಖಲಾದ ಪ್ರಕರಣಗಳು')}</span>
          {onNavigate && (
            <button onClick={go('investigation')} style={{
              font: 'inherit', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4,
              background: 'transparent', border: 'none', color: GOV.navy, cursor: 'pointer',
              fontWeight: 700, padding: 0,
            }}>
              {t('Look up a case', 'ಪ್ರಕರಣ ಹುಡುಕಿ')} &rarr;
            </button>
          )}
        </div>
        <div style={panelBody}>
          <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>{t('Crime No.', 'ಅಪರಾಧ ಸಂ.')}</th>
                  <th style={th}>{t('Date', 'ದಿನಾಂಕ')}</th>
                  <th style={th}>{t('Offence', 'ಅಪರಾಧ')}</th>
                  <th style={th}>{t('District', 'ಜಿಲ್ಲೆ')}</th>
                  <th style={th}>{t('Police Station', 'ಪೊಲೀಸ್ ಠಾಣೆ')}</th>
                  <th style={th}>{t('Brief facts', 'ಸಂಕ್ಷಿಪ್ತ ವಿವರ')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                    <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{r.fir_number}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{asOn(r.date_occurred)}</td>
                    <td style={td}>{localizeCrimeType(r.crime_type, language)}</td>
                    <td style={td}>{localizeDistrict(r.district, language)}</td>
                    <td style={td}>{r.police_station}</td>
                    <td style={{ ...td, color: GOV.muted, minWidth: 240 }}>{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={noteText}>
          {t('Figures are drawn from the official FIR records held by the platform.',
             'ಅಂಕಿಅಂಶಗಳು ವೇದಿಕೆಯಲ್ಲಿರುವ ಅಧಿಕೃತ FIR ದಾಖಲೆಗಳಿಂದ.')}
        </span>
        <button onClick={loadStats} style={{
          background: '#fff', color: GOV.navy, border: `1px solid ${GOV.ruleStrong}`,
          borderRadius: 2, padding: '6px 16px', cursor: 'pointer', fontSize: 11,
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {t('Refresh', 'ರಿಫ್ರೆಶ್')}
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
