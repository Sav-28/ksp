import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict } from '../locale';

interface Monthly { month: string; count: number; }
interface Alert { type: string; district: string; recent: number; previous: number; severity: string; message: string; }
interface ForecastData { monthly_history: Monthly[]; next_month_forecast: number | null; alerts: Alert[]; alert_count: number; }

const ForecastView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/forecast');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load forecast.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Computing forecast...', 'ಮುನ್ಸೂಚನೆ ಲೆಕ್ಕಾಚಾರ...')}</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#d32f2f' }}>⚠️ {error}</div>;
  if (!data) return null;

  // Chart geometry
  const W = 760, H = 240, P = { t: 20, r: 20, b: 40, l: 40 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b;
  const hist = data.monthly_history;
  const allVals = hist.map(h => h.count).concat(data.next_month_forecast ? [data.next_month_forecast] : []);
  const max = Math.max(...allVals, 1);
  const n = hist.length;
  const pts = hist.map((h, i) => ({
    x: P.l + (n <= 1 ? cw / 2 : (i / (n - 1)) * cw),
    y: P.t + ch - (h.count / max) * ch,
    ...h,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  // forecast point just after the last
  const fx = P.l + cw + 0; // at the right edge
  const fy = data.next_month_forecast != null ? P.t + ch - (data.next_month_forecast / max) * ch : null;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🔮 {t('Crime Forecasting & Early Warning', 'ಅಪರಾಧ ಮುನ್ಸೂಚನೆ ಮತ್ತು ಮುನ್ನೆಚ್ಚರಿಕೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Trend projection and proactive alerts', 'ಪ್ರವೃತ್ತಿ ಪ್ರಕ್ಷೇಪಣೆ ಮತ್ತು ಸಕ್ರಿಯ ಎಚ್ಚರಿಕೆಗಳು')}
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, flex: '1 1 200px', borderTop: '4px solid #1a237e' }}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Next-month forecast', 'ಮುಂದಿನ ತಿಂಗಳ ಮುನ್ಸೂಚನೆ')}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#1a237e' }}>{data.next_month_forecast ?? '—'}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{t('projected incidents', 'ಅಂದಾಜು ಘಟನೆಗಳು')}</div>
        </div>
        <div style={{ ...card, flex: '1 1 200px', borderTop: '4px solid #e53935' }}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Active early-warning alerts', 'ಸಕ್ರಿಯ ಮುನ್ನೆಚ್ಚರಿಕೆಗಳು')}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#e53935' }}>{data.alert_count}</div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={cardTitle}>📈 {t('Monthly Trend & Projection', 'ಮಾಸಿಕ ಪ್ರವೃತ್ತಿ ಮತ್ತು ಪ್ರಕ್ಷೇಪಣೆ')}</div>
        <svg width={W} height={H} style={{ maxWidth: '100%' }}>
          {[0, 0.5, 1].map((g, i) => {
            const y = P.t + ch - g * ch;
            return <g key={i}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#eee" /><text x={P.l - 8} y={y + 4} fontSize={10} fill="#999" textAnchor="end">{Math.round(g * max)}</text></g>;
          })}
          <path d={linePath} fill="none" stroke="#1a237e" strokeWidth={2.5} />
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#1a237e" />)}
          {/* forecast point */}
          {fy != null && pts.length > 0 && (
            <>
              <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={fx} y2={fy} stroke="#ff9800" strokeWidth={2.5} strokeDasharray="5,4" />
              <circle cx={fx} cy={fy} r={5} fill="#ff9800" stroke="#fff" strokeWidth={2} />
              <text x={fx} y={fy - 10} fontSize={11} fill="#ef6c00" textAnchor="end" fontWeight={700}>{t('forecast', 'ಮುನ್ಸೂಚನೆ')}</text>
            </>
          )}
        </svg>
      </div>

      <div style={card}>
        <div style={cardTitle}>🚨 {t('Early-Warning Alerts', 'ಮುನ್ನೆಚ್ಚರಿಕೆ ಎಚ್ಚರಿಕೆಗಳು')}</div>
        {data.alerts.length === 0 && <div style={{ color: '#999' }}>{t('No active alerts.', 'ಯಾವುದೇ ಸಕ್ರಿಯ ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ.')}</div>}
        {data.alerts.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px', borderRadius: 6, marginBottom: 6, background: a.severity === 'High' ? '#ffebee' : '#fff8e1' }}>
            <span style={{ fontSize: 18 }}>{a.severity === 'High' ? '🔴' : '🟠'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{localizeDistrict(a.district, language)} — {a.severity} {t('severity', 'ತೀವ್ರತೆ')}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{t('Up from', 'ಇಂದ ಏರಿಕೆ')} {a.previous} → {a.recent} ({t('last 60 days', 'ಕಳೆದ 60 ದಿನ')})</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };

export default ForecastView;
