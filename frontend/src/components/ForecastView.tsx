import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict, localizeCrimeType } from '../locale';
import {
  GOV, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  figure, figureLabel, figureValue, figureSub, severityChip, chip,
  pageTitle, pageSubTitle, legalNote,
} from '../govStyles';

interface Monthly { month: string; count: number; }
interface Alert {
  type: string; district: string; recent: number; previous: number;
  severity: string; message: string;
  // Added when crime-type surges were introduced alongside district surges.
  scope?: 'district' | 'crime type'; name?: string; change?: string;
}
// Backtested forecast model provenance, from /api/forecast -> model.
// The model is SELECTED by walk-forward backtesting, so the error shown here is
// measured on held-out months rather than asserted.
interface ForecastModel {
  available: boolean;
  name?: string;
  validation?: string;
  metrics?: { mae: number; rmse: number; mape: number };
  baseline?: { method: string; mae: number; rmse: number; mape: number };
  improvement_over_baseline_pct?: number;
  evaluated_months?: number;
  excluded_partial_month?: string | null;
  reason?: string | null;
}
interface ForecastInterval {
  level: number; low: number; high: number; margin: number; basis: string;
}
interface ForecastData {
  monthly_history: Monthly[];
  next_month_forecast: number | null;
  forecast_interval?: ForecastInterval | null;
  forecast_month?: string | null;
  forecast_is_current_month?: boolean;
  partial_month?: string | null;
  partial_month_count_so_far?: number | null;
  alerts: Alert[];
  alert_count: number;
  model?: ForecastModel;
}
interface Seasonal {
  monthly_seasonality: Monthly[];
  avg_per_month: number;
  peak_month: { month: string; count: number } | null;
  festival_window: { months: string; avg_per_month: number; baseline_avg_per_month: number; uplift_pct: number };
}
interface Anomaly {
  scope: string; name: string; month: string; count: number;
  baseline_mean: number; std_dev: number; z_score: number;
  direction: string; severity: string; message: string; current: boolean;
}
interface AnomalyData { anomalies: Anomaly[]; total: number; current_count: number; method: string; }

const ForecastView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [data, setData] = useState<ForecastData | null>(null);
  const [seasonal, setSeasonal] = useState<Seasonal | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/forecast');
      setData(await res.json());
      try {
        const sres = await apiFetch('/api/trends/seasonal');
        setSeasonal(await sres.json());
      } catch { /* seasonal is optional */ }
      try {
        const ares = await apiFetch('/api/anomalies');
        setAnomalies(await ares.json());
      } catch { /* anomalies optional */ }
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.')
        : t('Unable to load the forecast report.', 'ಮುನ್ಸೂಚನೆ ವರದಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ.'));
    } finally { setLoading(false); }
  };
  // Fetch once on mount. `load` closes over `language` only to phrase the error
  // message, so re-running it on a language switch would be a pointless refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: GOV.muted, fontSize: 13 }}>
      {t('Computing forecast...', 'ಮುನ್ಸೂಚನೆ ಲೆಕ್ಕಾಚಾರ...')}
    </div>
  );
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: GOV.breach, fontSize: 13 }}>{error}</div>
  );
  if (!data) return null;

  // --- Chart geometry -------------------------------------------------------
  const W = 900, H = 270, P = { t: 18, r: 26, b: 54, l: 44 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b;
  const hist = data.monthly_history;
  const iv = data.forecast_interval;
  // Scale to the interval's upper bound too, so the band is never clipped.
  const allVals = hist.map(h => h.count)
    .concat(data.next_month_forecast != null ? [data.next_month_forecast] : [])
    .concat(iv ? [iv.high] : []);
  const max = Math.max(...allVals, 1);
  const n = hist.length;
  // Reserve a slot at the right for the forecast. Previously the forecast point
  // was placed at P.l + cw, which is exactly where the LAST history point sits,
  // so the marker covered the final actual value and the dashed projection
  // segment had zero length.
  const slots = n + (data.next_month_forecast != null ? 1 : 0);
  const step = slots > 1 ? cw / (slots - 1) : 0;
  const xAt = (i: number) => P.l + (slots <= 1 ? cw / 2 : i * step);
  const yAt = (v: number) => P.t + ch - (v / max) * ch;

  const pts = hist.map((h, i) => ({ x: xAt(i), y: yAt(h.count), ...h }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fx = data.next_month_forecast != null ? xAt(n) : null;
  const fy = data.next_month_forecast != null ? yAt(data.next_month_forecast) : null;

  // Label roughly eight months across so the axis stays readable at any length.
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const lastMonth = hist.length ? hist[hist.length - 1].month : null;

  return (
    <div style={{ padding: '22px 30px 40px', background: GOV.panelAlt, minHeight: '100%', color: GOV.ink }}>

      {/* Report header, with the "as on" dating an official return carries. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        flexWrap: 'wrap', gap: 12, borderBottom: `2px solid ${GOV.navy}`,
        paddingBottom: 10, marginBottom: 16,
      }}>
        <div>
          <h2 style={pageTitle}>
            {t('Crime Forecast & Early Warning Report', 'ಅಪರಾಧ ಮುನ್ಸೂಚನೆ ಮತ್ತು ಮುನ್ನೆಚ್ಚರಿಕೆ ವರದಿ')}
          </h2>
          <div style={pageSubTitle}>
            {t('Projected case volume, seasonal pattern and districts requiring attention',
               'ಅಂದಾಜು ಪ್ರಕರಣ ಪ್ರಮಾಣ, ಋತುಮಾನ ಮಾದರಿ ಮತ್ತು ಗಮನ ಅಗತ್ಯವಿರುವ ಜಿಲ್ಲೆಗಳು')}
          </div>
        </div>
        <div style={{ textAlign: 'right', ...noteText }}>
          {lastMonth && <div><strong>{t('Data through', 'ದತ್ತಾಂಶ')}:</strong> {lastMonth}</div>}
          <div>{n} {t('months of history', 'ತಿಂಗಳ ಇತಿಹಾಸ')}</div>
        </div>
      </div>

      {/* Key figures */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>
            {/* The forecast is one step past the last COMPLETE month, which is
                normally the month in progress. Naming it avoids implying we are
                predicting a month that hasn't started. */}
            {data.forecast_is_current_month
              ? t('Projected total, month in progress', 'ನಡೆಯುತ್ತಿರುವ ತಿಂಗಳ ಅಂದಾಜು')
              : t('Next month projected', 'ಮುಂದಿನ ತಿಂಗಳ ಅಂದಾಜು')}
            {data.forecast_month && ` \u00B7 ${data.forecast_month}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={figureValue}>{data.next_month_forecast ?? '\u2014'}</span>
            {iv && (
              <span style={{ fontSize: 12.5, color: GOV.muted, fontVariantNumeric: 'tabular-nums' }}
                    title={iv.basis}>
                {iv.low}&ndash;{iv.high} ({iv.level}%)
              </span>
            )}
          </div>
          <div style={figureSub}>
            {t('cases', 'ಪ್ರಕರಣಗಳು')}
            {data.partial_month_count_so_far != null && (
              <> \u00B7 {data.partial_month_count_so_far} {t('recorded so far', 'ಇದುವರೆಗೆ ದಾಖಲು')}</>
            )}
          </div>
        </div>
        <div style={figure(GOV.breach)}>
          <div style={figureLabel}>{t('Areas requiring attention', 'ಗಮನ ಅಗತ್ಯವಿರುವ ಪ್ರದೇಶ')}</div>
          <div style={{ ...figureValue, color: GOV.breach }}>{data.alert_count}</div>
          <div style={figureSub}>{t('rising over last 60 days', 'ಕಳೆದ 60 ದಿನಗಳಲ್ಲಿ ಏರಿಕೆ')}</div>
        </div>
        {anomalies && (
          <div style={figure(GOV.critical)}>
            <div style={figureLabel}>{t('Statistical anomalies', 'ಅಂಕಿಅಂಶ ವೈಪರೀತ್ಯ')}</div>
            <div style={{ ...figureValue, color: GOV.critical }}>{anomalies.current_count}</div>
            <div style={figureSub}>
              {t('current', 'ಪ್ರಸ್ತುತ')} \u00B7 {anomalies.total} {t('total', 'ಒಟ್ಟು')}
            </div>
          </div>
        )}
        {seasonal?.peak_month && (
          <div style={figure(GOV.navy)}>
            <div style={figureLabel}>{t('Peak month of year', 'ವರ್ಷದ ಗರಿಷ್ಠ ತಿಂಗಳು')}</div>
            <div style={figureValue}>{seasonal.peak_month.month}</div>
            <div style={figureSub}>{seasonal.peak_month.count} {t('cases', 'ಪ್ರಕರಣ')}</div>
          </div>
        )}
      </div>

      {/* Method statement. Kept prominent: the forecast is only as credible as
          its validation, and this is where that is disclosed. */}
      {data.model?.available && data.model.metrics && (
        <div style={legalNote}>
          <div>
            <strong>{t('Method', 'ವಿಧಾನ')}:</strong>{' '}
            {t('Ten candidate forecasters are scored by', 'ಹತ್ತು ಮಾದರಿಗಳನ್ನು')}{' '}
            <em>{data.model.validation}</em>{' '}
            {t('and the lowest-error method is selected. Selected', 'ಮೂಲಕ ಪರೀಕ್ಷಿಸಿ ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ. ಆಯ್ಕೆ')}:{' '}
            <strong>{data.model.name}</strong>.
          </div>
          <div style={{ marginTop: 5, display: 'flex', gap: 18, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
            <span>{t('Mean absolute error', 'ಸರಾಸರಿ ದೋಷ')}: <strong>{data.model.metrics.mae}</strong></span>
            <span>RMSE: <strong>{data.model.metrics.rmse}</strong></span>
            <span>MAPE: <strong>{data.model.metrics.mape}%</strong></span>
            {data.model.baseline && (
              <span>
                {t('Against baseline', 'ಆಧಾರಕ್ಕೆ ಹೋಲಿಸಿ')} ({data.model.baseline.method} = {data.model.baseline.mae}):{' '}
                <strong style={{ color: (data.model.improvement_over_baseline_pct ?? 0) > 0 ? GOV.ok : GOV.critical }}>
                  {(data.model.improvement_over_baseline_pct ?? 0) > 0 ? '' : '+'}
                  {Math.abs(data.model.improvement_over_baseline_pct ?? 0)}%{' '}
                  {(data.model.improvement_over_baseline_pct ?? 0) > 0
                    ? t('lower error', 'ಕಡಿಮೆ ದೋಷ') : t('higher error', 'ಹೆಚ್ಚು ದೋಷ')}
                </strong>
              </span>
            )}
            <span>{data.model.evaluated_months} {t('months held out', 'ತಿಂಗಳು ಪರೀಕ್ಷೆಗೆ')}</span>
          </div>
          {data.model.excluded_partial_month && (
            <div style={{ marginTop: 5, color: GOV.muted }}>
              {t('The month in progress', 'ನಡೆಯುತ್ತಿರುವ ತಿಂಗಳು')} ({data.model.excluded_partial_month}){' '}
              {t('is excluded from training and evaluation, since a partial count would understate the trend.',
                 'ಭಾಗಶಃ ಎಣಿಕೆ ಪ್ರವೃತ್ತಿಯನ್ನು ತಗ್ಗಿಸುವುದರಿಂದ ಹೊರಗಿಡಲಾಗಿದೆ.')}
            </div>
          )}
        </div>
      )}
      {data.model && !data.model.available && data.model.reason && (
        <div style={{ ...legalNote, borderLeftColor: GOV.warning }}>
          <strong>{t('Forecast not validated', 'ಮುನ್ಸೂಚನೆ ಮೌಲ್ಯೀಕರಿಸಿಲ್ಲ')}:</strong> {data.model.reason}
        </div>
      )}

      {/* 1. Trend and projection */}
      <div style={panel}>
        <div style={panelHead}>
          1. {t('Monthly case volume and projection', 'ಮಾಸಿಕ ಪ್ರಕರಣ ಪ್ರಮಾಣ ಮತ್ತು ಪ್ರಕ್ಷೇಪಣೆ')}
        </div>
        <div style={panelBody}>
          <svg width={W} height={H} style={{ maxWidth: '100%', display: 'block' }}
               role="img"
               aria-label={t(
                 `Monthly case volume across ${n} months, projecting ${data.next_month_forecast ?? 'an unknown value'} for ${data.forecast_month ?? 'the next month'}.`,
                 'ಮಾಸಿಕ ಪ್ರಕರಣ ಪ್ರಮಾಣ ಮತ್ತು ಮುನ್ಸೂಚನೆ')}>
            {/* Horizontal rules with value labels. */}
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

            {/* Prediction interval, drawn from the last actual point out to the
                forecast so the uncertainty is visible rather than implied. */}
            {iv && fx != null && pts.length > 0 && (
              <polygon
                points={`${pts[pts.length - 1].x},${pts[pts.length - 1].y} ${fx},${yAt(iv.high)} ${fx},${yAt(iv.low)}`}
                fill={GOV.critical} fillOpacity={0.13} />
            )}

            <path d={linePath} fill="none" stroke={GOV.navy} strokeWidth={1.8} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.4} fill={GOV.navy}>
                <title>{p.month}: {p.count}</title>
              </circle>
            ))}

            {/* X-axis month labels. The chart previously had none, so a reader
                could not tell which month any point referred to. */}
            {pts.map((p, i) => (
              (i % labelEvery === 0 || i === n - 1) ? (
                <text key={`x${i}`} x={p.x} y={P.t + ch + 15} fontSize={9} fill={GOV.faint}
                      textAnchor="middle">{p.month}</text>
              ) : null
            ))}

            {fy != null && fx != null && pts.length > 0 && (
              <>
                <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={fx} y2={fy}
                      stroke={GOV.critical} strokeWidth={1.8} strokeDasharray="4,3" />
                {/* Interval whisker at the forecast point. */}
                {iv && (
                  <>
                    <line x1={fx} y1={yAt(iv.low)} x2={fx} y2={yAt(iv.high)} stroke={GOV.critical} strokeWidth={1.2} />
                    <line x1={fx - 4} y1={yAt(iv.high)} x2={fx + 4} y2={yAt(iv.high)} stroke={GOV.critical} strokeWidth={1.2} />
                    <line x1={fx - 4} y1={yAt(iv.low)} x2={fx + 4} y2={yAt(iv.low)} stroke={GOV.critical} strokeWidth={1.2} />
                  </>
                )}
                <rect x={fx - 3} y={fy - 3} width={6} height={6} fill={GOV.critical}>
                  <title>
                    {data.forecast_month}: {data.next_month_forecast}
                    {iv ? ` (${iv.level}% interval ${iv.low}-${iv.high})` : ''}
                  </title>
                </rect>
                {data.forecast_month && (
                  <text x={fx} y={P.t + ch + 15} fontSize={9} fill={GOV.critical}
                        textAnchor="middle" fontWeight={700}>{data.forecast_month}</text>
                )}
              </>
            )}
          </svg>
          {/* Legend, stated rather than left to colour intuition. */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, ...noteText }}>
            <span>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: GOV.navy, verticalAlign: 'middle', marginRight: 6 }} />
              {t('Recorded cases', 'ದಾಖಲಾದ ಪ್ರಕರಣ')}
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 18, height: 2, background: GOV.critical, verticalAlign: 'middle', marginRight: 6 }} />
              {t('Projection', 'ಪ್ರಕ್ಷೇಪಣೆ')}
            </span>
            {iv && <span>{t('Shaded band', 'ಛಾಯೆ ಪಟ್ಟಿ')}: {iv.basis}</span>}
          </div>
        </div>
      </div>

      {/* 2. Seasonal pattern */}
      {seasonal && (
        <div style={panel}>
          <div style={panelHead}>
            2. {t('Seasonal pattern by month of year', 'ವರ್ಷದ ತಿಂಗಳ ಪ್ರಕಾರ ಋತುಮಾನ ಮಾದರಿ')}
          </div>
          <div style={panelBody}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110, marginBottom: 6 }}>
              {(() => {
                const mmax = Math.max(...seasonal.monthly_seasonality.map(m => m.count), 1);
                return seasonal.monthly_seasonality.map((m, i) => {
                  const isPeak = seasonal.peak_month && m.month === seasonal.peak_month.month;
                  return (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 9.5, color: GOV.faint, marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {m.count}
                      </div>
                      <div title={`${m.month}: ${m.count}`}
                           style={{
                             height: `${Math.max(2, (m.count / mmax) * 84)}px`,
                             background: isPeak ? GOV.breach : GOV.navy,
                           }} />
                      <div style={{ fontSize: 9.5, color: GOV.muted, marginTop: 3 }}>{m.month}</div>
                    </div>
                  );
                });
              })()}
            </div>
            <div style={{ borderTop: `1px solid ${GOV.rule}`, paddingTop: 9, display: 'flex', gap: 26, flexWrap: 'wrap', fontSize: 12 }}>
              <span>
                {t('Average per month', 'ತಿಂಗಳಿಗೆ ಸರಾಸರಿ')}:{' '}
                <strong>{seasonal.avg_per_month}</strong>
              </span>
              <span>
                {t('Festival window', 'ಹಬ್ಬದ ಅವಧಿ')} ({seasonal.festival_window.months}):{' '}
                <strong style={{ color: seasonal.festival_window.uplift_pct >= 0 ? GOV.breach : GOV.ok }}>
                  {seasonal.festival_window.uplift_pct >= 0 ? '+' : ''}{seasonal.festival_window.uplift_pct}%
                </strong>{' '}
                {t('against the rest of the year', 'ವರ್ಷದ ಉಳಿದ ಭಾಗಕ್ಕೆ ಹೋಲಿಸಿ')}{' '}
                <span style={{ color: GOV.faint }}>
                  ({seasonal.festival_window.avg_per_month} {t('vs', 'vs')} {seasonal.festival_window.baseline_avg_per_month} {t('per month', 'ತಿಂಗಳಿಗೆ')})
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Areas requiring attention */}
      <div style={panel}>
        <div style={panelHead}>
          3. {t('Areas requiring attention', 'ಗಮನ ಅಗತ್ಯವಿರುವ ಪ್ರದೇಶಗಳು')}
        </div>
        <div style={panelBody}>
          <div style={{ ...noteText, marginBottom: 10 }}>
            {t('Districts and offence types where the last 60 days exceed the 60 days before. A rise from nil is treated as high.',
               'ಕಳೆದ 60 ದಿನಗಳು ಹಿಂದಿನ 60 ದಿನಗಳನ್ನು ಮೀರಿದ ಜಿಲ್ಲೆಗಳು ಮತ್ತು ಅಪರಾಧ ಪ್ರಕಾರಗಳು.')}
          </div>
          {data.alerts.length === 0 ? (
            <div style={{ ...noteText, padding: '6px 0' }}>
              {t('No areas currently exceed the comparison period.', 'ಯಾವುದೇ ಪ್ರದೇಶ ಪ್ರಸ್ತುತ ಮೀರಿಲ್ಲ.')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{t('Scope', 'ವ್ಯಾಪ್ತಿ')}</th>
                    <th style={th}>{t('Name', 'ಹೆಸರು')}</th>
                    <th style={th}>{t('Previous 60 days', 'ಹಿಂದಿನ 60 ದಿನ')}</th>
                    <th style={th}>{t('Last 60 days', 'ಕಳೆದ 60 ದಿನ')}</th>
                    <th style={th}>{t('Change', 'ಬದಲಾವಣೆ')}</th>
                    <th style={th}>{t('Severity', 'ತೀವ್ರತೆ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts.map((a, i) => {
                    // Alerts cover crime types as well as districts, so only
                    // localise the name when it actually is a district.
                    const isCrimeType = a.scope === 'crime type';
                    const label = isCrimeType
                      ? localizeCrimeType(a.name || a.district, language)
                      : localizeDistrict(a.name || a.district, language);
                    return (
                      <tr key={i} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                        <td style={td}>
                          <span style={chip(GOV.navy, '#e8eaf3')}>
                            {isCrimeType ? t('Offence', 'ಅಪರಾಧ') : t('District', 'ಜಿಲ್ಲೆ')}
                          </span>
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>{label}</td>
                        <td style={tdNum}>{a.previous}</td>
                        <td style={{ ...tdNum, fontWeight: 700 }}>{a.recent}</td>
                        <td style={{ ...td, color: GOV.breach, fontWeight: 600 }}>
                          {a.change || `+${a.recent - a.previous}`}
                        </td>
                        <td style={td}><span style={severityChip(a.severity)}>{a.severity}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 4. Statistical anomalies */}
      {anomalies && anomalies.anomalies.length > 0 && (
        <div style={panel}>
          <div style={panelHead}>
            4. {t('Statistical anomalies', 'ಅಂಕಿಅಂಶ ವೈಪರೀತ್ಯಗಳು')}
          </div>
          <div style={panelBody}>
            <div style={{ ...noteText, marginBottom: 10 }}>
              {t('Months deviating sharply from that district or offence type\'s own historical average.',
                 'ತಮ್ಮದೇ ಚಾರಿತ್ರಿಕ ಸರಾಸರಿಯಿಂದ ತೀವ್ರವಾಗಿ ವಿಚಲಿಸುವ ತಿಂಗಳುಗಳು.')}{' '}
              {t('Method', 'ವಿಧಾನ')}: <em>{anomalies.method}</em>
            </div>
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{t('Scope', 'ವ್ಯಾಪ್ತಿ')}</th>
                    <th style={th}>{t('Name', 'ಹೆಸರು')}</th>
                    <th style={th}>{t('Month', 'ತಿಂಗಳು')}</th>
                    <th style={th}>{t('Recorded', 'ದಾಖಲು')}</th>
                    <th style={th}>{t('Own average', 'ಸ್ವಂತ ಸರಾಸರಿ')}</th>
                    <th style={th}>{t('Deviation', 'ವಿಚಲನೆ')}</th>
                    <th style={th}>{t('Severity', 'ತೀವ್ರತೆ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.anomalies.map((a, i) => (
                    <tr key={i} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                      <td style={td}>
                        <span style={chip(GOV.navy, '#e8eaf3')}>
                          {a.scope === 'district' ? t('District', 'ಜಿಲ್ಲೆ') : t('Offence', 'ಅಪರಾಧ')}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {a.scope === 'district'
                          ? localizeDistrict(a.name, language)
                          : localizeCrimeType(a.name, language)}
                        {a.current && (
                          <span style={{ marginLeft: 7, ...chip(GOV.critical, GOV.criticalBg) }}>
                            {t('Current', 'ಪ್ರಸ್ತುತ')}
                          </span>
                        )}
                      </td>
                      <td style={td}>{a.month}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{a.count}</td>
                      <td style={tdNum}>{a.baseline_mean}</td>
                      <td style={{ ...tdNum, color: a.direction === 'spike' ? GOV.breach : GOV.ok }}>
                        {Math.abs(a.z_score)}&sigma; {a.direction === 'spike'
                          ? t('above', 'ಮೇಲೆ') : t('below', 'ಕೆಳಗೆ')}
                      </td>
                      <td style={td}><span style={severityChip(a.severity)}>{a.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...noteText, textAlign: 'center', paddingTop: 6 }}>
        {t('Projections are statistical estimates for planning purposes and carry the error stated above.',
           'ಪ್ರಕ್ಷೇಪಣೆಗಳು ಯೋಜನೆಗಾಗಿ ಅಂಕಿಅಂಶ ಅಂದಾಜುಗಳು.')}
      </div>
    </div>
  );
};

export default ForecastView;
