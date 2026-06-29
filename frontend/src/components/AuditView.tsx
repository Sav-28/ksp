import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

interface AuditLog {
  id: number;
  timestamp: string;
  username: string;
  query_text: string;
  language: string;
  intent: string;
  confidence: number | null;
  row_count: number | null;
}

const AuditView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/audit?limit=100');
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED') setError('Session expired. Please log in again.');
      else setError(t('Access denied — admin role required.', 'ಪ್ರವೇಶ ನಿರಾಕರಿಸಲಾಗಿದೆ — ನಿರ್ವಾಹಕ ಪಾತ್ರ ಅಗತ್ಯ.'));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Loading audit log...', 'ಲೆಕ್ಕಪರಿಶೋಧನೆ ಲಾಗ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#d32f2f' }}>⚠️ {error}</div>;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        📋 {t('Audit Log & Traceability', 'ಲೆಕ್ಕಪರಿಶೋಧನೆ ಲಾಗ್ ಮತ್ತು ಪತ್ತೆಹಚ್ಚುವಿಕೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Every query is logged for accountability.', 'ಹೊಣೆಗಾರಿಕೆಗಾಗಿ ಪ್ರತಿ ಪ್ರಶ್ನೆಯನ್ನು ದಾಖಲಿಸಲಾಗುತ್ತದೆ.')} {' · '}
        {total} {t('total entries', 'ಒಟ್ಟು ನಮೂದುಗಳು')}
      </p>

      <div style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={th}>{t('Time', 'ಸಮಯ')}</th>
                <th style={th}>{t('User', 'ಬಳಕೆದಾರ')}</th>
                <th style={th}>{t('Query', 'ಪ್ರಶ್ನೆ')}</th>
                <th style={th}>{t('Lang', 'ಭಾಷೆ')}</th>
                <th style={th}>{t('Intent', 'ಉದ್ದೇಶ')}</th>
                <th style={th}>{t('Rows', 'ಸಾಲುಗಳು')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #eee', background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={td}>{new Date(l.timestamp).toLocaleString()}</td>
                  <td style={td}>👮 {l.username}</td>
                  <td style={{ ...td, maxWidth: 320 }}>{l.query_text}</td>
                  <td style={td}>{l.language?.toUpperCase()}</td>
                  <td style={td}><span style={{ background: '#e8eaf6', color: '#1a237e', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{l.intent}</span></td>
                  <td style={td}>{l.row_count ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <button onClick={load} style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 {t('Refresh', 'ರಿಫ್ರೆಶ್')}
          </button>
        </div>
      </div>
    </div>
  );
};

const th: React.CSSProperties = { padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#555', borderBottom: '2px solid #e0e0e0' };
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };

export default AuditView;
