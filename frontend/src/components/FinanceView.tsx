import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeCrimeType, localizePersonName } from '../locale';

interface Trail {
  id: number;
  amount: number;
  date: string;
  from: { name: string; bank: string };
  to: { name: string; bank: string };
  linked_fir: string | null;
  linked_crime_type: string | null;
}
interface FinanceData {
  suspicious_transaction_count: number;
  total_suspicious_amount: number;
  flagged_accounts: number;
  trails: Trail[];
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const FinanceView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/financial/trails');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load financial data.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Tracing money trails...', 'ಹಣದ ಜಾಡು ಪತ್ತೆ...')}</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#d32f2f' }}>⚠️ {error}</div>;
  if (!data) return null;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        💰 {t('Financial Crime & Transaction Analysis', 'ಆರ್ಥಿಕ ಅಪರಾಧ ಮತ್ತು ವಹಿವಾಟು ವಿಶ್ಲೇಷಣೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Suspicious money trails linked to criminal cases', 'ಅಪರಾಧ ಪ್ರಕರಣಗಳಿಗೆ ಸಂಬಂಧಿಸಿದ ಶಂಕಿತ ಹಣದ ಜಾಡುಗಳು')}
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, flex: '1 1 180px', borderTop: '4px solid #c62828' }}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Suspicious transactions', 'ಶಂಕಿತ ವಹಿವಾಟುಗಳು')}</div>
          <div style={statVal}>{data.suspicious_transaction_count}</div>
        </div>
        <div style={{ ...card, flex: '1 1 180px', borderTop: '4px solid #ff9800' }}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Total flagged amount', 'ಒಟ್ಟು ಗುರುತಿಸಿದ ಮೊತ್ತ')}</div>
          <div style={statVal}>{fmt(data.total_suspicious_amount)}</div>
        </div>
        <div style={{ ...card, flex: '1 1 180px', borderTop: '4px solid #6a1b9a' }}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Flagged accounts', 'ಗುರುತಿಸಿದ ಖಾತೆಗಳು')}</div>
          <div style={statVal}>{data.flagged_accounts}</div>
        </div>
      </div>

      <div style={card}>
        <div style={cardTitle}>🔗 {t('Suspicious Money Trails', 'ಶಂಕಿತ ಹಣದ ಜಾಡುಗಳು')}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={th}>{t('From', 'ಇಂದ')}</th>
                <th style={th}>{t('To', 'ಗೆ')}</th>
                <th style={th}>{t('Amount', 'ಮೊತ್ತ')}</th>
                <th style={th}>{t('Date', 'ದಿನಾಂಕ')}</th>
                <th style={th}>{t('Linked Case', 'ಸಂಬಂಧಿತ ಪ್ರಕರಣ')}</th>
              </tr>
            </thead>
            <tbody>
              {data.trails.map((tr, i) => (
                <tr key={tr.id} style={{ borderBottom: '1px solid #eee', background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={td}>👤 {localizePersonName(tr.from.name, language)}<div style={{ fontSize: 11, color: '#999' }}>{tr.from.bank}</div></td>
                  <td style={td}>👤 {localizePersonName(tr.to.name, language)}<div style={{ fontSize: 11, color: '#999' }}>{tr.to.bank}</div></td>
                  <td style={{ ...td, fontWeight: 700, color: '#c62828' }}>{fmt(tr.amount)}</td>
                  <td style={td}>{tr.date}</td>
                  <td style={td}>
                    {tr.linked_fir
                      ? <span style={{ background: '#ffebee', color: '#c62828', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{tr.linked_fir} · {localizeCrimeType(tr.linked_crime_type || '', language)}</span>
                      : <span style={{ color: '#999' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };
const statVal: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: '#1a237e', marginTop: 4 };
const th: React.CSSProperties = { padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#555', borderBottom: '2px solid #e0e0e0' };
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };

export default FinanceView;
