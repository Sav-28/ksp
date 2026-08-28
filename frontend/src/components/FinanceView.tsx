import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeCrimeType, localizePersonName } from '../locale';
import {
  GOV, mono, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  figure, figureLabel, figureValue, figureSub, chip,
  pageTitle, pageSubTitle, legalNote, asOn, inr,
} from '../govStyles';

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
      setError(e.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.')
        : t('Unable to load the financial analysis.', 'ಹಣಕಾಸು ವಿಶ್ಲೇಷಣೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ.'));
    } finally { setLoading(false); }
  };
  // Fetch once on mount. `load` closes over `language` only to phrase the error
  // message, so re-running it on a language switch would be a pointless refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: GOV.muted, fontSize: 13 }}>
      {t('Tracing money trails...', 'ಹಣದ ಜಾಡು ಪತ್ತೆ...')}
    </div>
  );
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: GOV.breach, fontSize: 13 }}>{error}</div>
  );
  if (!data) return null;

  const conduits = data.pass_through_accounts || [];
  const dates = data.trails.map(x => x.date).filter(Boolean).sort();
  const periodFrom = dates[0];
  const periodTo = dates[dates.length - 1];

  /** Ranked account list with a proportional rule. Used for both directions. */
  const rankedList = (list: TopAccount[], accent: string) => {
    const top = list[0]?.amount || 1;
    return (
      <table style={table}>
        <thead>
          <tr>
            <th style={{ ...th, width: 26 }}>#</th>
            <th style={th}>{t('Account holder', 'ಖಾತೆದಾರ')}</th>
            <th style={th}>{t('Value', 'ಮೊತ್ತ')}</th>
            <th style={th}>{t('Txns', 'ವಹಿವಾಟು')}</th>
            <th style={{ ...th, width: '34%' }}>{t('Share of highest', 'ಗರಿಷ್ಠದ ಪಾಲು')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a, i) => (
            <tr key={a.account_id} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
              <td style={{ ...tdNum, color: GOV.faint }}>{i + 1}</td>
              <td style={td}>
                {localizePersonName(a.name, language)}
                <div style={{ fontSize: 10.5, color: GOV.faint }}>{a.bank}</div>
              </td>
              <td style={{ ...tdNum, fontWeight: 700, whiteSpace: 'nowrap' }}>{inr(a.amount)}</td>
              <td style={tdNum}>{a.transactions}</td>
              <td style={td}>
                <div style={{ height: 9, background: '#e8eaee' }}>
                  <div style={{ width: `${Math.max(2, (a.amount / top) * 100)}%`, height: '100%', background: accent }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

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
            {t('Financial Crime & Transaction Analysis', 'ಆರ್ಥಿಕ ಅಪರಾಧ ಮತ್ತು ವಹಿವಾಟು ವಿಶ್ಲೇಷಣೆ')}
          </h2>
          <div style={pageSubTitle}>
            {t('Flagged transfers, counterparty concentration and layering indicators',
               'ಗುರುತಿಸಿದ ವರ್ಗಾವಣೆ, ಪ್ರತಿಪಕ್ಷ ಕೇಂದ್ರೀಕರಣ ಮತ್ತು ಪದರೀಕರಣ ಸೂಚಕಗಳು')}
          </div>
        </div>
        {periodFrom && (
          <div style={{ textAlign: 'right', ...noteText }}>
            <div><strong>{t('Period', 'ಅವಧಿ')}:</strong> {asOn(periodFrom)} &ndash; {asOn(periodTo)}</div>
            <div>{data.suspicious_transaction_count} {t('flagged transactions', 'ಗುರುತಿಸಿದ ವಹಿವಾಟುಗಳು')}</div>
          </div>
        )}
      </div>

      {/* Key figures */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={figure(GOV.breach)}>
          <div style={figureLabel}>{t('Value under scrutiny', 'ಪರಿಶೀಲನೆಯ ಮೊತ್ತ')}</div>
          <div style={{ ...figureValue, color: GOV.breach, fontSize: 22 }}>{inr(data.total_suspicious_amount)}</div>
          <div style={figureSub}>
            {t('across', 'ಒಟ್ಟು')} {data.suspicious_transaction_count} {t('transfers', 'ವರ್ಗಾವಣೆ')}
          </div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Largest single transfer', 'ಅತಿ ದೊಡ್ಡ ವರ್ಗಾವಣೆ')}</div>
          <div style={{ ...figureValue, fontSize: 22 }}>{inr(data.largest_transaction || 0)}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Accounts flagged', 'ಗುರುತಿಸಿದ ಖಾತೆಗಳು')}</div>
          <div style={figureValue}>{data.flagged_accounts}</div>
        </div>
        {conduits.length > 0 && (
          <div style={figure(GOV.critical)}>
            <div style={figureLabel}>{t('Pass-through accounts', 'ಹಣ ಹರಿದ ಖಾತೆಗಳು')}</div>
            <div style={{ ...figureValue, color: GOV.critical }}>{conduits.length}</div>
            <div style={figureSub}>{t('layering indicator', 'ಪದರೀಕರಣ ಸೂಚಕ')}</div>
          </div>
        )}
      </div>

      {/* Data provenance. Stated plainly rather than buried, because this module
          does not read from the FIR system of record. */}
      <div style={legalNote}>
        <div>
          <strong>{t('Data source', 'ದತ್ತಾಂಶ ಮೂಲ')}:</strong>{' '}
          {t('Representative sample transaction data. In service this module integrates with bank and FIU-IND reporting feeds; the FIR system of record does not itself hold financial transactions.',
             'ಮಾದರಿ ವಹಿವಾಟು ದತ್ತಾಂಶ. ಸೇವೆಯಲ್ಲಿ ಇದು ಬ್ಯಾಂಕ್ ಮತ್ತು FIU-IND ವರದಿಗಳೊಂದಿಗೆ ಸಂಯೋಜಿಸುತ್ತದೆ.')}
        </div>
        {data.analysis_note && (
          <div style={{ marginTop: 5, color: GOV.muted }}>
            <strong>{t('Method', 'ವಿಧಾನ')}:</strong> {data.analysis_note}
          </div>
        )}
      </div>

      {/* 1. Layering / pass-through: the actual finding. An account that both
             receives and forwards flagged money is a conduit, which is what
             distinguishes a laundering chain from unrelated large transfers. */}
      {conduits.length > 0 && (
        <div style={panel}>
          <div style={panelHead}>
            1. {t('Layering indicators — pass-through accounts', 'ಪದರೀಕರಣ ಸೂಚಕ — ಹಣ ಹರಿದ ಖಾತೆಗಳು')}
          </div>
          <div style={panelBody}>
            <div style={{ ...noteText, marginBottom: 10 }}>
              {t('These accounts both received and forwarded flagged funds, so value moved through them rather than terminating. Throughput is value sent divided by value received; at or near 1.00 the account acted as a conduit.',
                 'ಈ ಖಾತೆಗಳು ಹಣವನ್ನು ಸ್ವೀಕರಿಸಿ ಮುಂದೆ ಕಳುಹಿಸಿವೆ. 1.00ಕ್ಕೆ ಹತ್ತಿರವಿದ್ದರೆ ಮಾಧ್ಯಮ ಖಾತೆ.')}
            </div>
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{t('Account holder', 'ಖಾತೆದಾರ')}</th>
                    <th style={th}>{t('Bank', 'ಬ್ಯಾಂಕ್')}</th>
                    <th style={th}>{t('Received', 'ಸ್ವೀಕೃತ')}</th>
                    <th style={th}>{t('Forwarded', 'ಕಳುಹಿಸಿದೆ')}</th>
                    <th style={th}>{t('Throughput', 'ಹರಿವು')}</th>
                    <th style={th}>{t('Txns', 'ವಹಿವಾಟು')}</th>
                    <th style={th}>{t('Assessment', 'ಮೌಲ್ಯಮಾಪನ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {conduits.map((p, i) => (
                    <tr key={p.account_id} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{localizePersonName(p.name, language)}</td>
                      <td style={td}>{p.bank}</td>
                      <td style={{ ...tdNum, whiteSpace: 'nowrap' }}>{inr(p.received)}</td>
                      <td style={{ ...tdNum, whiteSpace: 'nowrap' }}>{inr(p.sent)}</td>
                      <td style={{
                        ...tdNum, fontWeight: 700,
                        color: p.throughput_ratio >= 0.8 ? GOV.breach : GOV.critical,
                      }}>
                        {p.throughput_ratio.toFixed(2)}
                      </td>
                      <td style={tdNum}>{p.transactions}</td>
                      <td style={td}>
                        <span style={p.throughput_ratio >= 0.8
                          ? chip(GOV.breach, GOV.breachBg)
                          : chip(GOV.warning, GOV.warningBg)}>
                          {p.throughput_ratio >= 0.8
                            ? t('Conduit', 'ಮಾಧ್ಯಮ') : t('Partial', 'ಭಾಗಶಃ')}
                        </span>
                        <div style={{ fontSize: 10.5, color: GOV.faint, marginTop: 3 }}>{p.signal}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Counterparty concentration */}
      {(data.top_receivers?.length || data.top_senders?.length) ? (
        <div style={panel}>
          <div style={panelHead}>
            2. {t('Counterparty concentration', 'ಪ್ರತಿಪಕ್ಷ ಕೇಂದ್ರೀಕರಣ')}
          </div>
          <div style={panelBody}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {data.top_receivers && data.top_receivers.length > 0 && (
                <div style={{ flex: '1 1 380px', minWidth: 330 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: GOV.navy, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 7 }}>
                    {t('Principal recipients', 'ಪ್ರಮುಖ ಸ್ವೀಕೃತದಾರರು')}
                  </div>
                  <div style={{ border: `1px solid ${GOV.rule}` }}>
                    {rankedList(data.top_receivers, GOV.breach)}
                  </div>
                </div>
              )}
              {data.top_senders && data.top_senders.length > 0 && (
                <div style={{ flex: '1 1 380px', minWidth: 330 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: GOV.navy, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 7 }}>
                    {t('Principal remitters', 'ಪ್ರಮುಖ ಕಳುಹಿಸುವವರು')}
                  </div>
                  <div style={{ border: `1px solid ${GOV.rule}` }}>
                    {rankedList(data.top_senders, GOV.critical)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 3. The transaction register */}
      <div style={panel}>
        <div style={panelHead}>
          3. {t('Register of flagged transactions', 'ಗುರುತಿಸಿದ ವಹಿವಾಟುಗಳ ನೋಂದಣಿ')}
        </div>
        <div style={panelBody}>
          <div style={{ ...noteText, marginBottom: 10 }}>
            {t('Ordered by value. Grounds for flagging are recorded against each entry so it can be verified.',
               'ಮೊತ್ತದ ಪ್ರಕಾರ ಜೋಡಿಸಲಾಗಿದೆ. ಪ್ರತಿ ನಮೂದಿಗೆ ಕಾರಣಗಳನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ.')}
          </div>
          <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>{t('Date', 'ದಿನಾಂಕ')}</th>
                  <th style={th}>{t('Remitter', 'ಕಳುಹಿಸಿದವರು')}</th>
                  <th style={th}>{t('Beneficiary', 'ಸ್ವೀಕೃತದಾರ')}</th>
                  <th style={th}>{t('Amount', 'ಮೊತ್ತ')}</th>
                  <th style={th}>{t('Mode', 'ವಿಧಾನ')}</th>
                  <th style={th}>{t('Linked case', 'ಸಂಬಂಧಿತ ಪ್ರಕರಣ')}</th>
                  <th style={th}>{t('Grounds', 'ಕಾರಣಗಳು')}</th>
                </tr>
              </thead>
              <tbody>
                {data.trails.map((tr, i) => (
                  <tr key={tr.id} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{asOn(tr.date)}</td>
                    <td style={td}>
                      {localizePersonName(tr.from.name, language)}
                      <div style={{ fontSize: 10.5, color: GOV.faint }}>{tr.from.bank}</div>
                    </td>
                    <td style={td}>
                      {localizePersonName(tr.to.name, language)}
                      <div style={{ fontSize: 10.5, color: GOV.faint }}>{tr.to.bank}</div>
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700, color: GOV.breach, whiteSpace: 'nowrap' }}>
                      {inr(tr.amount)}
                    </td>
                    <td style={{ ...td, color: GOV.muted }}>{tr.type || '\u2014'}</td>
                    <td style={td}>
                      {tr.linked_fir ? (
                        <>
                          <div style={{ ...mono, fontSize: 11.5 }}>{tr.linked_fir}</div>
                          <div style={{ fontSize: 10.5, color: GOV.faint }}>
                            {localizeCrimeType(tr.linked_crime_type || '', language)}
                          </div>
                        </>
                      ) : <span style={{ color: GOV.faint }}>&mdash;</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(tr.reasons || []).map((r, ri) => (
                          <span key={ri} style={chip(GOV.muted, '#eceef3')}>{r}</span>
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

      <div style={{ ...noteText, textAlign: 'center', paddingTop: 6 }}>
        {t('Indicators support investigative prioritisation and do not by themselves establish an offence.',
           'ಸೂಚಕಗಳು ತನಿಖೆಯ ಆದ್ಯತೆಗೆ ಸಹಾಯ ಮಾಡುತ್ತವೆ; ಸ್ವತಃ ಅಪರಾಧವನ್ನು ಸ್ಥಾಪಿಸುವುದಿಲ್ಲ.')}
      </div>
    </div>
  );
};

export default FinanceView;
