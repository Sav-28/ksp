import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

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

// Color palette for charts
const COLORS = ['#1a237e', '#283593', '#3949ab', '#5c6bc0', '#7986cb', '#9fa8da', '#ff9800', '#fb8c00', '#f57c00', '#e65100'];

// Stat card component
const StatCard = ({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) => (
  <div style={{
    flex: 1,
    minWidth: '180px',
    backgroundColor: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    borderTop: `4px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  }}>
    <div style={{
      width: '52px',
      height: '52px',
      borderRadius: '12px',
      backgroundColor: `${color}15`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '26px',
      flexShrink: 0
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '30px', fontWeight: 'bold', color: '#1a237e', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>{label}</div>
    </div>
  </div>
);

// Horizontal bar chart
const BarChart = ({ title, data, icon }: { title: string; data: LabelCount[]; icon: string }) => {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      flex: 1,
      minWidth: '320px'
    }}>
      <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a237e', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{icon}</span> {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {data.map((d, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '120px', fontSize: '13px', color: '#444', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label}
            </div>
            <div style={{ flex: 1, backgroundColor: '#f0f0f0', borderRadius: '4px', height: '24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                width: `${(d.count / max) * 100}%`,
                height: '100%',
                backgroundColor: COLORS[idx % COLORS.length],
                borderRadius: '4px',
                transition: 'width 0.6s ease',
                minWidth: '2px'
              }} />
            </div>
            <div style={{ width: '36px', fontSize: '13px', fontWeight: '600', color: '#1a237e' }}>{d.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Monthly trend line chart (SVG)
const TrendChart = ({ data, title }: { data: LabelCount[]; title: string }) => {
  if (data.length === 0) return null;
  const width = 760;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map(d => d.count), 1);

  const points = data.map((d, i) => {
    const x = padding.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = padding.top + chartH - (d.count / max) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      width: '100%',
      overflowX: 'auto'
    }}>
      <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a237e', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>📈</span> {title}
      </div>
      <svg width={width} height={height} style={{ maxWidth: '100%' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = padding.top + chartH - t * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#eee" strokeWidth={1} />
              <text x={padding.left - 8} y={y + 4} fontSize={10} fill="#999" textAnchor="end">{Math.round(t * max)}</text>
            </g>
          );
        })}
        {/* Area + line */}
        <path d={areaPath} fill="#1a237e15" />
        <path d={linePath} fill="none" stroke="#1a237e" strokeWidth={2.5} />
        {/* Points + labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#ff9800" stroke="#fff" strokeWidth={1.5} />
            <text x={p.x} y={height - padding.bottom + 18} fontSize={9} fill="#666" textAnchor="middle" transform={`rotate(0 ${p.x} ${height - padding.bottom + 18})`}>
              {p.label.slice(2)}
            </text>
          </g>
        ))}
      </svg>
    </div>
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
        setError('Session expired. Please log in again.');
      } else {
        setError('Unable to connect to the server. Please ensure the backend is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#666', fontSize: '16px' }}>
        ⏳ {t('Loading dashboard...', 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: '#d32f2f', fontSize: '16px', marginBottom: '16px' }}>⚠️ {error}</div>
        <button onClick={loadStats} style={{
          backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '6px',
          padding: '10px 24px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
        }}>
          {t('Retry', 'ಮರುಪ್ರಯತ್ನಿಸಿ')}
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: '24px', marginBottom: '6px' }}>
        📊 {t('Crime Analytics Dashboard', 'ಅಪರಾಧ ವಿಶ್ಲೇಷಣೆ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್')}
      </h2>
      <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px' }}>
        {t('Overview of crime records across Karnataka', 'ಕರ್ನಾಟಕದಾದ್ಯಂತ ಅಪರಾಧ ದಾಖಲೆಗಳ ಅವಲೋಕನ')}
      </p>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatCard icon="🗂️" label={t('Total Crimes', 'ಒಟ್ಟು ಅಪರಾಧಗಳು')} value={stats.total_crimes} color="#1a237e" />
        <StatCard icon="📍" label={t('Districts Covered', 'ಒಳಗೊಂಡ ಜಿಲ್ಲೆಗಳು')} value={stats.total_districts} color="#ff9800" />
        <StatCard icon="🏷️" label={t('Crime Categories', 'ಅಪರಾಧ ವರ್ಗಗಳು')} value={stats.total_crime_types} color="#3949ab" />
        <StatCard icon="📅" label={t('Active Months', 'ಸಕ್ರಿಯ ತಿಂಗಳುಗಳು')} value={stats.by_month.length} color="#00897b" />
      </div>

      {/* Trend chart */}
      <div style={{ marginBottom: '24px' }}>
        <TrendChart data={stats.by_month} title={t('Monthly Crime Trend', 'ಮಾಸಿಕ ಅಪರಾಧ ಪ್ರವೃತ್ತಿ')} />
      </div>

      {/* Bar charts side by side */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <BarChart icon="📍" title={t('Crimes by District', 'ಜಿಲ್ಲೆವಾರು ಅಪರಾಧಗಳು')} data={stats.by_district} />
        <BarChart icon="🏷️" title={t('Crimes by Type', 'ಪ್ರಕಾರವಾರು ಅಪರಾಧಗಳು')} data={stats.by_crime_type} />
      </div>

      {/* Recent records table */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a237e', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🕒</span> {t('Recent Crime Records', 'ಇತ್ತೀಚಿನ ಅಪರಾಧ ದಾಖಲೆಗಳು')}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', textAlign: 'left' }}>
                <th style={thStyle}>{t('FIR No.', 'ಎಫ್‌ಐಆರ್ ಸಂ.')}</th>
                <th style={thStyle}>{t('Date', 'ದಿನಾಂಕ')}</th>
                <th style={thStyle}>{t('Type', 'ಪ್ರಕಾರ')}</th>
                <th style={thStyle}>{t('District', 'ಜಿಲ್ಲೆ')}</th>
                <th style={thStyle}>{t('Station', 'ಠಾಣೆ')}</th>
                <th style={thStyle}>{t('Description', 'ವಿವರಣೆ')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r, idx) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={tdStyle}><span style={{ fontWeight: '600', color: '#1976d2' }}>{r.fir_number}</span></td>
                  <td style={tdStyle}>{r.date_occurred}</td>
                  <td style={tdStyle}>
                    <span style={{
                      backgroundColor: '#1a237e15', color: '#1a237e', padding: '3px 8px',
                      borderRadius: '4px', fontSize: '12px', fontWeight: '600'
                    }}>{r.crime_type}</span>
                  </td>
                  <td style={tdStyle}>{r.district}</td>
                  <td style={tdStyle}>{r.police_station}</td>
                  <td style={{ ...tdStyle, color: '#666' }}>{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ textAlign: 'right', marginTop: '16px' }}>
        <button onClick={loadStats} style={{
          backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '6px',
          padding: '8px 18px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
        }}>
          🔄 {t('Refresh Data', 'ಡೇಟಾ ರಿಫ್ರೆಶ್')}
        </button>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '12px',
  fontWeight: '600',
  color: '#555',
  borderBottom: '2px solid #e0e0e0',
  textTransform: 'uppercase'
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top'
};

export default Dashboard;
