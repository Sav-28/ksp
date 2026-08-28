import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeCrimeType, localizePersonName } from '../locale';

interface Trail {
  id: number;
  amount: number;
  date: string;
  type?: string | null;
  from: { name: string; bank: string };
  to: { name: string; bank: string };
  linked_fir: string | null;
  linked_crime_type: string | null;
  reasons?: string[];
}
interface TopAccount {
  account_id: number; name: string; bank: string | null;
  amount: number; transactions: number;
}
interface PassThrough {
  account_id: number; name: string; bank: string | null;
  received: number; sent: number; throughput_ratio: number;
  transactions: number; signal: string;
}
interface FinanceData {
  suspicious_transaction_count: number;
  total_suspicious_amount: number;
  flagged_accounts: number;
  largest_transaction?: number;
  trails: Trail[];
  top_senders?: TopAccount[];
  top_receivers?: TopAccount[];
  pass_through_accounts?: PassThrough[];
  analysis_note?: string;
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
      <p style={{ color: '#666', fontSize: 14, marginBottom: 12 }}>
        {t('Suspicious money trails linked to criminal cases', 'ಅಪರಾಧ ಪ್ರಕರಣಗಳಿಗೆ ಸಂಬಂಧಿಸಿದ ಶಂಕಿತ ಹಣದ ಜಾಡುಗಳು')}
      </p>
      <div style={{
        background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8,
        padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: '#7a5c00',
      }}>
        ℹ️ {t(
          'Demo integration: transaction data shown here is representative sample data. In production this module integrates with bank / FIU-IND feeds — the FIR system of record does not itself store financial transactions.',
          'ಡೆಮೊ ಸಂಯೋಜನೆ: ಇಲ್ಲಿ ತೋರಿಸಿದ ವಹಿವಾಟು ಡೇಟಾ ಮಾದರಿ ಡೇಟಾ. ಉತ್ಪಾದನೆಯಲ್ಲಿ ಇದು ಬ್ಯಾಂಕ್ / FIU-IND ಫೀಡ್‌ಗಳೊಂದಿಗೆ ಸಂಯೋಜಿಸುತ್ತದೆ.')}
      </div>

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
        {data.pass_through_accounts && data.pass_through_accounts.length > 0 && (
          <div style={{ ...card, flex: '1 1 180px', borderTop: '4px solid #ad1457' }}>
            <div style={{ fontSize: 12, color: '#666' }}>{t('Pass-through accounts', 'ಹಣ ಹರಿದ ಖಾತೆಗಳು')}</div>
            <div style={statVal}>{data.pass_through_accounts.length}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{t('layering indicator', 'ಪದರೀಕರಣ ಸೂಚಕ')}</div>
          </div>
        )}
      </div>

      {/* Layering / pass-through: the actual finding. An account that both
          receives and sends flagged money is a conduit, which is what
          distinguishes a laundering chain from unrelated large transfers. A flat
          transaction table hides this structure entirely. */}
      {data.pass_through_accounts && data.pass_through_accounts.length > 0 && (
        <div style={{ ...card, marginBottom: 20, borderLeft: '4px solid #c62828' }}>
          <div style={cardTitle}>🕸️ {t('Layering Detected — Pass-Through Accounts', 'ಪದರೀಕರಣ ಪತ್ತೆ — ಹಣ ಹರಿದ ಖಾತೆಗಳು')}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: -8, marginBottom: 12 }}>
            {t('These accounts both received and forwarded flagged funds, so value moved through them rather than stopping there. Throughput is value sent divided by value received; near 1.0 indicates a conduit.',
               'ಈ ಖಾತೆಗಳು ಹಣವನ್ನು ಸ್ವೀಕರಿಸಿ ಮುಂದೆ ಕಳುಹಿಸಿವೆ. 1.0ಕ್ಕೆ ಹತ್ತಿರವಿದ್ದರೆ ಅದು ಮಾಧ್ಯಮ ಖಾತೆ.')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.pass_through_accounts.map(p => (
              <div key={p.account_id} style={{
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                background: p.throughput_ratio >= 0.8 ? '#ffebee' : '#fff8e1',
                border: '1px solid ' + (p.throughput_ratio >= 0.8 ? '#ffcdd2' : '#ffe082'),
                borderRadius: 6, padding: '10px 12px',
              }}>
                <div style={{ minWidth: 170, fontWeight: 700 }}>
                  👤 {localizePersonName(p.name, language)}
                  <div style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>{p.bank}</div>
                </div>
                {/* in -> out, so the direction of flow is legible at a glance */}
                <div style={{ fontSize: 13, color: '#444' }}>
                  <span style={{ color: '#2e7d32', fontWeight: 700 }}>▼ {fmt(p.received)}</span>
                  <span style={{ color: '#999', margin: '0 8px' }}>{t('in', 'ಒಳಗೆ')}</span>
                  <span style={{ color: '#c62828', fontWeight: 700 }}>▲ {fmt(p.sent)}</span>
                  <span style={{ color: '#999', marginLeft: 8 }}>{t('out', 'ಹೊರಗೆ')}</span>
                </div>
                <div style={{
                  background: '#fff', border: '1px solid #ddd', borderRadius: 12,
                  padding: '2px 10px', fontSize: 12, fontWeight: 700,
                }} title={p.signal}>
                  {t('throughput', 'ಹರಿವು')} {p.throughput_ratio.toFixed(2)}
                </div>
                <div style={{ fontSize: 11.5, color: '#777', flex: 1 }}>
                  {p.transactions} {t('flagged transactions', 'ಗುರುತಿಸಿದ ವಹಿವಾಟುಗಳು')} · {p.signal}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Who moves the most money — the aggregate the table can't show. */}
      {(data.top_receivers?.length || data.top_senders?.length) ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          {([['📥', t('Top recipients of flagged funds', 'ಗುರುತಿಸಿದ ಹಣದ ಪ್ರಮುಖ ಸ್ವೀಕೃತದಾರರು'), data.top_receivers],
             ['📤', t('Top senders of flagged funds', 'ಗುರುತಿಸಿದ ಹಣದ ಪ್ರಮುಖ ಕಳುಹಿಸುವವರು'), data.top_senders]] as const)
            .map(([icon, title, list], idx) => (
              list && list.length > 0 ? (
                <div key={idx} style={{ ...card, flex: '1 1 320px' }}>
                  <div style={cardTitle}>{icon} {title}</div>
                  {list.map((a, i) => {
                    const top = list[0].amount || 1;
                    return (
                      <div key={a.account_id} style={{ marginBottom: 9 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                          <span>{i + 1}. {localizePersonName(a.name, language)}
                            <span style={{ color: '#999' }}> · {a.transactions} txn</span>
                          </span>
                          <strong>{fmt(a.amount)}</strong>
                        </div>
                        {/* Simple proportional bar: no chart dependency needed. */}
                        <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                          <div style={{
                            width: `${Math.max(3, (a.amount / top) * 100)}%`, height: '100%',
                            background: idx === 0 ? '#c62828' : '#ff9800', borderRadius: 3,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null
            ))}
        </div>
      ) : null}

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
                <th style={th}>{t('Why flagged', 'ಏಕೆ ಗುರುತಿಸಲಾಗಿದೆ')}</th>
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
                  {/* Stated reasons, so a flagged row is auditable rather than
                      asserted. Mirrors the explainability shown elsewhere. */}
                  <td style={td}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(tr.reasons || []).map((r, ri) => (
                        <span key={ri} style={{
                          background: '#eceff1', color: '#37474f', padding: '2px 7px',
                          borderRadius: 10, fontSize: 11,
                        }}>{r}</span>
                      ))}
                    </div>
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
