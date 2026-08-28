import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict, localizeCrimeType } from '../locale';

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
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load forecast.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Computing forecast...', 'ಮುನ್ಸೂಚನೆ ಲೆಕ್ಕಾಚಾರ...')}</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#d32f2f' }}>⚠️ {error}</div>;
  if (!data) return null;

  // Chart geometry
  const W = 760, H = 260, P = { t: 20, r: 24, b: 52, l: 40 };
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
  // so the orange marker covered the final actual value and the dashed
  // "projection" segment had zero length.
  const slots = n + (data.next_month_forecast != null ? 1 : 0);
  const step = slots > 1 ? cw / (slots - 1) : 0;
  const xAt = (i: number) => P.l + (slots <= 1 ? cw / 2 : i * step);
  const yAt = (v: number) => P.t + ch - (v / max) * ch;

  const pts = hist.map((h, i) => ({ x: xAt(i), y: yAt(h.count), ...h }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fx = data.next_month_forecast != null ? xAt(n) : null;
  const fy = data.next_month_forecast != null ? yAt(data.next_month_forecast) : null;

  // Label roughly six months across so the axis stays readable at any history length.
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🔮 {t('Crime Forecasting & Early Warning', 'ಅಪರಾಧ ಮುನ್ಸೂಚನೆ ಮತ್ತು ಮುನ್ನೆಚ್ಚರಿಕೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 12 }}>
        {t('Trend projection and proactive alerts', 'ಪ್ರವೃತ್ತಿ ಪ್ರಕ್ಷೇಪಣೆ ಮತ್ತು ಸಕ್ರಿಯ ಎಚ್ಚರಿಕೆಗಳು')}
      </p>

      {/* Backtested-model provenance badge — mirrors the risk-model badge in
          ProfilesView. Shows WHICH forecaster won, its held-out error, and how
          much it beats a naive baseline, so the projection is auditable rather
          than a black box. */}
      {data.model?.available && data.model.metrics && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8,
          padding: '8px 14px', marginBottom: 20, fontSize: 13, color: '#1b5e20',
        }}>
          <span style={{ fontWeight: 700 }}>
            🤖 {t('Forecast by backtested model', 'ಬ್ಯಾಕ್‌ಟೆಸ್ಟ್ ಮಾಡಿದ ಮಾದರಿ')}: <code>{data.model.name}</code>
          </span>
          <span>MAE <strong>{data.model.metrics.mae}</strong></span>
          <span>RMSE <strong>{data.model.metrics.rmse}</strong></span>
          <span>MAPE <strong>{data.model.metrics.mape}%</strong></span>
          {data.model.baseline && (
            <span style={{
              background: (data.model.improvement_over_baseline_pct ?? 0) > 0 ? '#c8e6c9' : '#ffe0b2',
              borderRadius: 10, padding: '2px 8px', fontWeight: 700,
            }}>
              {(data.model.improvement_over_baseline_pct ?? 0) > 0 ? '↓' : '↑'}{' '}
              {Math.abs(data.model.improvement_over_baseline_pct ?? 0)}%{' '}
              {t('error vs', 'ದೋಷ vs')} {data.model.baseline.method} ({data.model.baseline.mae})
            </span>
          )}
          <span style={{ color: '#558b2f' }}>
            · {data.model.evaluated_months} {t('months held out', 'ತಿಂಗಳು ಪರೀಕ್ಷಿಸಲಾಗಿದೆ')}
          </span>
        </div>
      )}
      {data.model && !data.model.available && data.model.reason && (
        <div style={{
          display: 'inline-block', background: '#fff8e1', border: '1px solid #ffe082',
          borderRadius: 8, padding: '8px 14px', marginBottom: 20, fontSize: 13, color: '#8d6e00',
        }}>
          ⚠️ {t('Forecast not yet validated', 'ಮುನ್ಸೂಚನೆ ಇನ್ನೂ ಮೌಲ್ಯೀಕರಿಸಿಲ್ಲ')}: {data.model.reason}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, flex: '1 1 250px', borderTop: '4px solid #1a237e' }}>
          <div style={{ fontSize: 12, color: '#666' }}>
            {/* The forecast is one step past the last COMPLETE month, which is
                normally the month in progress. Naming it avoids implying we are
                predicting a month that hasn't started. */}
            {data.forecast_is_current_month
              ? t('Projected total, month in progress', 'ನಡೆಯುತ್ತಿರುವ ತಿಂಗಳ ಅಂದಾಜು ಒಟ್ಟು')
              : t('Next-month forecast', 'ಮುಂದಿನ ತಿಂಗಳ ಮುನ್ಸೂಚನೆ')}
            {data.forecast_month && <strong> · {data.forecast_month}</strong>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#1a237e' }}>{data.next_month_forecast ?? '—'}</div>
            {iv && (
              <div style={{ fontSize: 13, color: '#555' }} title={iv.basis}>
                {iv.low}–{iv.high}{' '}
                <span style={{ color: '#999' }}>({iv.level}%)</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#999' }}>
            {t('projected incidents', 'ಅಂದಾಜು ಘಟನೆಗಳು')}
            {data.partial_month_count_so_far != null && (
              <> · {data.partial_month_count_so_far} {t('recorded so far', 'ಇದುವರೆಗೆ ದಾಖಲಾಗಿದೆ')}</>
            )}
          </div>
        </div>
        <div style={{ ...card, flex: '1 1 200px', borderTop: '4px solid #e53935' }}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Active early-warning alerts', 'ಸಕ್ರಿಯ ಮುನ್ನೆಚ್ಚರಿಕೆಗಳು')}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#e53935' }}>{data.alert_count}</div>
        </div>
        {anomalies && (
          <div style={{ ...card, flex: '1 1 200px', borderTop: '4px solid #6a1b9a' }}>
            <div style={{ fontSize: 12, color: '#666' }}>{t('Statistical anomalies (current)', 'ಅಂಕಿಅಂಶ ವೈಪರೀತ್ಯ (ಪ್ರಸ್ತುತ)')}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#6a1b9a' }}>{anomalies.current_count}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{anomalies.total} {t('total detected', 'ಒಟ್ಟು ಪತ್ತೆಯಾಗಿದೆ')}</div>
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={cardTitle}>📈 {t('Monthly Trend & Projection', 'ಮಾಸಿಕ ಪ್ರವೃತ್ತಿ ಮತ್ತು ಪ್ರಕ್ಷೇಪಣೆ')}</div>
        {data.model?.available && (
          <div style={{ fontSize: 12, color: '#888', marginTop: -8, marginBottom: 12 }}>
            {t('Validation', 'ಮೌಲ್ಯೀಕರಣ')}: <span style={{ fontStyle: 'italic' }}>{data.model.validation}</span>
            {data.model.excluded_partial_month && (
              <> · {t('the in-progress month', 'ನಡೆಯುತ್ತಿರುವ ತಿಂಗಳು')} ({data.model.excluded_partial_month}){' '}
                {t('is excluded so it cannot drag the trend down', 'ಪ್ರವೃತ್ತಿಯನ್ನು ತಗ್ಗಿಸದಂತೆ ಹೊರಗಿಡಲಾಗಿದೆ')}</>
            )}
          </div>
        )}
        <svg width={W} height={H} style={{ maxWidth: '100%' }}
             role="img"
             aria-label={t(
               `Monthly crime volume for the last ${n} months, with a projection of ${data.next_month_forecast ?? 'unknown'} for ${data.forecast_month ?? 'the next month'}.`,
               'ಮಾಸಿಕ ಅಪರಾಧ ಪ್ರಮಾಣ ಮತ್ತು ಮುನ್ಸೂಚನೆ')}>
          {[0, 0.5, 1].map((g, i) => {
            const y = P.t + ch - g * ch;
            return <g key={i}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#eee" /><text x={P.l - 8} y={y + 4} fontSize={10} fill="#999" textAnchor="end">{Math.round(g * max)}</text></g>;
          })}

          {/* Prediction interval, drawn from the last actual point out to the
              forecast so the uncertainty is visible rather than implied. */}
          {iv && fx != null && pts.length > 0 && (
            <polygon
              points={`${pts[pts.length - 1].x},${pts[pts.length - 1].y} ${fx},${yAt(iv.high)} ${fx},${yAt(iv.low)}`}
              fill="#ff9800" fillOpacity={0.16} />
          )}

          <path d={linePath} fill="none" stroke="#1a237e" strokeWidth={2.5} />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#1a237e">
              <title>{p.month}: {p.count}</title>
            </circle>
          ))}

          {/* X-axis month labels. The chart previously had none, so a reader
              could not tell which month any point referred to. */}
          {pts.map((p, i) => (
            (i % labelEvery === 0 || i === n - 1) ? (
              <text key={`x${i}`} x={p.x} y={P.t + ch + 16} fontSize={9.5}
                    fill="#888" textAnchor="middle">{p.month}</text>
            ) : null
          ))}

          {fy != null && fx != null && pts.length > 0 && (
            <>
              <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={fx} y2={fy}
                    stroke="#ff9800" strokeWidth={2.5} strokeDasharray="5,4" />
              {/* Interval whisker at the forecast point. */}
              {iv && (
                <>
                  <line x1={fx} y1={yAt(iv.low)} x2={fx} y2={yAt(iv.high)} stroke="#ef6c00" strokeWidth={1.5} />
                  <line x1={fx - 4} y1={yAt(iv.high)} x2={fx + 4} y2={yAt(iv.high)} stroke="#ef6c00" strokeWidth={1.5} />
                  <line x1={fx - 4} y1={yAt(iv.low)} x2={fx + 4} y2={yAt(iv.low)} stroke="#ef6c00" strokeWidth={1.5} />
                </>
              )}
              <circle cx={fx} cy={fy} r={5} fill="#ff9800" stroke="#fff" strokeWidth={2}>
                <title>
                  {data.forecast_month}: {data.next_month_forecast}
                  {iv ? ` (${iv.level}% interval ${iv.low}-${iv.high})` : ''}
                </title>
              </circle>
              <text x={fx} y={(iv ? yAt(iv.high) : fy) - 8} fontSize={11} fill="#ef6c00"
                    textAnchor="end" fontWeight={700}>{t('forecast', 'ಮುನ್ಸೂಚನೆ')}</text>
              {data.forecast_month && (
                <text x={fx} y={P.t + ch + 16} fontSize={9.5} fill="#ef6c00"
                      textAnchor="middle" fontWeight={700}>{data.forecast_month}</text>
              )}
            </>
          )}
        </svg>
        {iv && (
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 6 }}>
            {t('Shaded band', 'ಛಾಯೆ ಪಟ್ಟಿ')}: {iv.basis}
          </div>
        )}
      </div>

      {/* Seasonal & festival-window pattern (Area 3) */}
      {seasonal && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={cardTitle}>🗓️ {t('Seasonal Pattern (month of year)', 'ಋತುಮಾನ ಮಾದರಿ (ವರ್ಷದ ತಿಂಗಳು)')}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginBottom: 8 }}>
            {(() => {
              const mmax = Math.max(...seasonal.monthly_seasonality.map(m => m.count), 1);
              return seasonal.monthly_seasonality.map((m, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div title={`${m.month}: ${m.count}`}
                    style={{
                      height: `${(m.count / mmax) * 100}px`,
                      background: seasonal.peak_month && m.month === seasonal.peak_month.month ? '#e53935' : '#3949ab',
                      borderRadius: '3px 3px 0 0',
                    }} />
                  <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>{m.month}</div>
                </div>
              ));
            })()}
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#444' }}>
            {seasonal.peak_month && (
              <span>📈 {t('Peak month', 'ಗರಿಷ್ಠ ತಿಂಗಳು')}: <strong>{seasonal.peak_month.month}</strong> ({seasonal.peak_month.count})</span>
            )}
            <span>🎪 {t('Festival window', 'ಹಬ್ಬದ ಅವಧಿ')} ({seasonal.festival_window.months}): {' '}
              <strong style={{ color: seasonal.festival_window.uplift_pct >= 0 ? '#e53935' : '#2e7d32' }}>
                {seasonal.festival_window.uplift_pct >= 0 ? '+' : ''}{seasonal.festival_window.uplift_pct}%
              </strong> {t('vs baseline', 'ಸಾಮಾನ್ಯಕ್ಕೆ ಹೋಲಿಸಿ')}
            </span>
          </div>
        </div>
      )}

      {/* Statistical anomaly detection (Statement 2) */}
      {anomalies && anomalies.anomalies.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={cardTitle}>📊 {t('Anomaly Detection', 'ವೈಪರೀತ್ಯ ಪತ್ತೆ')}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: -8, marginBottom: 12 }}>
            {t('Months that deviate sharply from a district/crime-type\'s own historical norm.', 'ತಮ್ಮದೇ ಚಾರಿತ್ರಿಕ ಸರಾಸರಿಯಿಂದ ತೀವ್ರವಾಗಿ ವಿಚಲಿಸುವ ತಿಂಗಳುಗಳು.')}
            {' '}<span style={{ fontStyle: 'italic' }}>({anomalies.method})</span>
          </div>
          {anomalies.anomalies.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px', borderRadius: 6, marginBottom: 6,
              background: a.severity === 'High' ? '#f3e5f5' : '#faf4fb',
              border: a.current ? '1px solid #ce93d8' : '1px solid #f0f0f0',
            }}>
              <span style={{ fontSize: 18 }}>{a.direction === 'spike' ? '📈' : '📉'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {a.scope === 'district' ? '📍' : '🏷️'} {a.name}
                  {a.current && <span style={{ marginLeft: 8, fontSize: 10, background: '#6a1b9a', color: '#fff', padding: '2px 7px', borderRadius: 10 }}>{t('CURRENT', 'ಪ್ರಸ್ತುತ')}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {a.month}: {a.count} {t('vs', 'vs')} {a.baseline_mean}/{t('mo', 'ತಿಂ')} · {Math.abs(a.z_score)}σ {a.direction === 'spike' ? t('above', 'ಮೇಲೆ') : t('below', 'ಕೆಳಗೆ')}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: a.severity === 'High' ? '#6a1b9a' : '#9c27b0' }}>{a.severity}</span>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={cardTitle}>🚨 {t('Early-Warning Alerts', 'ಮುನ್ನೆಚ್ಚರಿಕೆ ಎಚ್ಚರಿಕೆಗಳು')}</div>
        {data.alerts.length === 0 && <div style={{ color: '#999' }}>{t('No active alerts.', 'ಯಾವುದೇ ಸಕ್ರಿಯ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ.')}</div>}
        {data.alerts.map((a, i) => {
          // Alerts now cover crime types as well as districts, so only localise
          // the name when it actually is a district.
          const isCrimeType = a.scope === 'crime type';
          const label = isCrimeType
            ? localizeCrimeType(a.name || a.district, language)
            : localizeDistrict(a.name || a.district, language);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px', borderRadius: 6, marginBottom: 6, background: a.severity === 'High' ? '#ffebee' : '#fff8e1' }}>
              <span style={{ fontSize: 18 }}>{a.severity === 'High' ? '🔴' : '🟠'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    background: isCrimeType ? '#ede7f6' : '#e3f2fd',
                    color: isCrimeType ? '#4527a0' : '#0d47a1',
                    padding: '2px 6px', borderRadius: 4, marginRight: 8,
                  }}>
                    {isCrimeType ? t('crime type', 'ಅಪರಾಧ ಪ್ರಕಾರ') : t('district', 'ಜಿಲ್ಲೆ')}
                  </span>
                  {label} — {a.severity} {t('severity', 'ತೀವ್ರತೆ')}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {t('Up from', 'ಇಂದ ಏರಿಕೆ')} {a.previous} → {a.recent} ({t('last 60 days', 'ಕಳೆದ 60 ದಿನ')})
                  {a.change && <> · <strong>{a.change}</strong></>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };

export default ForecastView;
