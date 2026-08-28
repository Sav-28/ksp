import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict, localizeCrimeType } from '../locale';
import {
  GOV, mono, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  figure, figureLabel, figureValue, figureSub,
  pageTitle, pageSubTitle, asOn,
} from '../govStyles';

interface LabelCount {
  label: string;
  count: number;
}

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

/**
 * Distribution table with a proportional rule.
 *
 * This replaced a chart that assigned each row a different colour from a
 * ten-colour palette. Colour there carried no information - the rows were
 * already ordered and labelled - and a rainbow is what makes a government
 * report look like a consumer dashboard. A single bar colour plus the count and
 * share is denser and easier to read.
 */
const Distribution = ({
  heading, rows, total, localise, language,
}: {
  heading: string;
  rows: LabelCount[];
  total: number;
  localise: (v: string, lang: 'en' | 'kn') => string;
  language: 'en' | 'kn';
}) => {
  const max = Math.max(...rows.map(r => r.count), 1);
  return (
    <div style={{ flex: '1 1 400px', minWidth: 340 }}>
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
              <th style={th}>{language === 'en' ? 'Category' : 'ವರ್ಗ'}</th>
              <th style={th}>{language === 'en' ? 'Cases' : 'ಪ್ರಕರಣ'}</th>
              <th style={th}>{language === 'en' ? 'Share' : 'ಪಾಲು'}</th>
              <th style={{ ...th, width: '38%' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                <td style={td}>{localise(r.label, language)}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{r.count}</td>
                <td style={{ ...tdNum, color: GOV.muted }}>
                  {total ? ((r.count / total) * 100).toFixed(1) : '0.0'}%
                </td>
                <td style={td}>
                  <div style={{ height: 9, background: '#e8eaee' }}>
                    <div style={{
                      width: `${Math.max(2, (r.count / max) * 100)}%`,
                      height: '100%', background: GOV.navy,
                    }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Monthly volume line, in the same register as the forecast chart. */
const TrendChart = ({ data, language }: { data: LabelCount[]; language: 'en' | 'kn' }) => {
  if (data.length === 0) return null;
  const W = 900, H = 250, P = { t: 18, r: 26, b: 46, l: 44 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b;
  const max = Math.max(...data.map(d => d.count), 1);
  const n = data.length;

  const pts = data.map((d, i) => ({
    x: P.l + (n === 1 ? cw / 2 : (i / (n - 1)) * cw),
    y: P.t + ch - (d.count / max) * ch,
    ...d,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  // Thin the labels so a long series stays legible.
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  return (
    <svg width={W} height={H} style={{ maxWidth: '100%', display: 'block' }} role="img"
         aria-label={language === 'en'
           ? `Monthly recorded case volume across ${n} months.`
           : 'ಮಾಸಿಕ ದಾಖಲಾದ ಪ್ರಕರಣ ಪ್ರಮಾಣ'}>
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
      <path d={linePath} fill="none" stroke={GOV.navy} strokeWidth={1.8} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.4} fill={GOV.navy}>
          <title>{p.label}: {p.count}</title>
        </circle>
      ))}
      {pts.map((p, i) => (
        (i % labelEvery === 0 || i === n - 1) ? (
          <text key={`x${i}`} x={p.x} y={P.t + ch + 15} fontSize={9} fill={GOV.faint}
                textAnchor="middle">{p.label}</text>
        ) : null
      ))}
    </svg>
  );
};

const Dashboard = ({ language }: { language: 'en' | 'kn' }) => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = (en: string, kn: string) => (language === 'en' ? en : kn);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/stats');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setStats(data);
      }
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED') {
        setError(t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.'));
      } else {
        setError(t('Unable to reach the server. Confirm the backend is running.',
                   'ಸರ್ವರ್ ತಲುಪಲು ಸಾಧ್ಯವಿಲ್ಲ.'));
      }
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

  const latest = stats.recent.length ? stats.recent[0].date_occurred : null;
  const monthSpan = stats.by_month.length
    ? `${stats.by_month[0].label} \u2013 ${stats.by_month[stats.by_month.length - 1].label}`
    : '';

  return (
    <div style={{ padding: '22px 30px 40px', background: GOV.panelAlt, minHeight: '100%', color: GOV.ink }}>

      {/* Report header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        flexWrap: 'wrap', gap: 12, borderBottom: `2px solid ${GOV.navy}`,
        paddingBottom: 10, marginBottom: 16,
      }}>
        <div>
          <h2 style={pageTitle}>
            {t('Crime Statistics Summary', 'ಅಪರಾಧ ಅಂಕಿಅಂಶ ಸಾರಾಂಶ')}
          </h2>
          <div style={pageSubTitle}>
            {t('Recorded cases across Karnataka by period, district and offence type',
               'ಅವಧಿ, ಜಿಲ್ಲೆ ಮತ್ತು ಅಪರಾಧ ಪ್ರಕಾರದ ಪ್ರಕಾರ ದಾಖಲಾದ ಪ್ರಕರಣಗಳು')}
          </div>
        </div>
        <div style={{ textAlign: 'right', ...noteText }}>
          {monthSpan && <div><strong>{t('Period', 'ಅವಧಿ')}:</strong> {monthSpan}</div>}
          {latest && <div>{t('Latest record', 'ಇತ್ತೀಚಿನ ದಾಖಲೆ')}: {asOn(latest)}</div>}
        </div>
      </div>

      {/* Key figures */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Cases on record', 'ದಾಖಲೆಯಲ್ಲಿರುವ ಪ್ರಕರಣ')}</div>
          <div style={figureValue}>{stats.total_crimes.toLocaleString('en-IN')}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Districts covered', 'ಒಳಗೊಂಡ ಜಿಲ್ಲೆಗಳು')}</div>
          <div style={figureValue}>{stats.total_districts}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Offence categories', 'ಅಪರಾಧ ವರ್ಗಗಳು')}</div>
          <div style={figureValue}>{stats.total_crime_types}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Months of data', 'ದತ್ತಾಂಶದ ತಿಂಗಳುಗಳು')}</div>
          <div style={figureValue}>{stats.by_month.length}</div>
          <div style={figureSub}>
            {stats.by_month.length
              ? `${t('average', 'ಸರಾಸರಿ')} ${Math.round(stats.total_crimes / stats.by_month.length)}/${t('month', 'ತಿಂಗಳು')}`
              : ''}
          </div>
        </div>
      </div>

      {/* 1. Monthly volume */}
      <div style={panel}>
        <div style={panelHead}>
          1. {t('Recorded cases by month', 'ತಿಂಗಳ ಪ್ರಕಾರ ದಾಖಲಾದ ಪ್ರಕರಣಗಳು')}
        </div>
        <div style={panelBody}>
          <TrendChart data={stats.by_month} language={language} />
          <div style={{ ...noteText, marginTop: 8 }}>
            {t('The final month may be incomplete if it is still in progress. The FORECAST report excludes it from projections for that reason.',
               'ನಡೆಯುತ್ತಿರುವ ಕೊನೆಯ ತಿಂಗಳು ಅಪೂರ್ಣವಾಗಿರಬಹುದು.')}
          </div>
        </div>
      </div>

      {/* 2. Distribution */}
      <div style={panel}>
        <div style={panelHead}>
          2. {t('Distribution by district and offence type', 'ಜಿಲ್ಲೆ ಮತ್ತು ಅಪರಾಧ ಪ್ರಕಾರದ ಹಂಚಿಕೆ')}
        </div>
        <div style={panelBody}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Distribution
              heading={t('By district', 'ಜಿಲ್ಲೆವಾರು')}
              rows={stats.by_district}
              total={stats.total_crimes}
              localise={localizeDistrict}
              language={language}
            />
            <Distribution
              heading={t('By offence type', 'ಅಪರಾಧ ಪ್ರಕಾರವಾರು')}
              rows={stats.by_crime_type}
              total={stats.total_crimes}
              localise={localizeCrimeType}
              language={language}
            />
          </div>
        </div>
      </div>

      {/* 3. Recent register */}
      <div style={panel}>
        <div style={panelHead}>
          3. {t('Recently registered cases', 'ಇತ್ತೀಚೆಗೆ ದಾಖಲಾದ ಪ್ರಕರಣಗಳು')}
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
