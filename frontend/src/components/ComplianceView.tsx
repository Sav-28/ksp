import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict, localizeCrimeType } from '../locale';
import {
  GOV, mono, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  figure, figureLabel, figureValue, figureSub, severityChip, chip,
  pageTitle, pageSubTitle, legalNote, asOn,
} from '../govStyles';

/**
 * Case Compliance & Pendency.
 *
 * This is the operational view the platform was missing. Everything else answers
 * analytical questions; a station opens the system to find out which of its cases
 * is about to breach a statutory deadline.
 *
 * The two clocks are presented separately and labelled, because conflating them
 * would be wrong: the custody clock carries a legal consequence (default bail),
 * while investigation pendency is a disposal measure.
 */

interface CustodyCase {
  crime_no: string; crime_type: string | null; police_station: string | null;
  district: string | null; case_status: string | null; gravity: string | null;
  arrest_date: string; days_in_custody: number; statutory_limit_days: number;
  days_remaining: number; compliance_status: string;
}
interface CustodyClock {
  total_under_clock: number;
  counts: { breached: number; critical: number; warning: number; on_track: number };
  action_required: number;
  cases: CustodyCase[];
  legal_basis: string;
  disclaimer: string;
}
interface Pendency {
  total_open: number; oldest_open_days: number;
  age_profile: { bucket: string; count: number }[]; note: string;
}
interface StationRow {
  police_station: string; district: string; registered: number;
  disposed: number; still_open: number; disposal_rate_pct: number;
}
interface Officer {
  officer: string; total_cases: number; open_cases: number;
  open_with_accused_in_custody: number; load_vs_average_pct: number; overloaded: boolean;
}
interface Report {
  generated_at: string;
  custody_clock: CustodyClock;
  investigation_pendency: Pendency;
  station_scoreboard: {
    stations: StationRow[]; lowest_disposal: StationRow[];
    highest_disposal: StationRow[]; stations_reviewed: number; note: string;
  };
  officer_workload: {
    officers: Officer[]; average_open_per_officer: number;
    overloaded_count: number; note: string;
  };
  headline: {
    action_required: number; breached: number; critical: number;
    open_investigations: number; oldest_open_days: number;
  };
}

type Filter = 'action' | 'all';

const ComplianceView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Default to the cases needing action: that is why an officer opens this view.
  const [filter, setFilter] = useState<Filter>('action');
  const [downloading, setDownloading] = useState(false);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  /**
   * Fetch the report as a document.
   *
   * A plain <a href> cannot be used: the endpoint needs the bearer token, and a
   * link would send an unauthenticated request. So the response is fetched as a
   * blob and handed to a temporary anchor.
   *
   * The endpoint returns a real PDF when Catalyst SmartBrowz renders it and a
   * print-laid-out HTML page otherwise, naming the reason in a header. Both are
   * handled here rather than assuming one: a PDF downloads, and the HTML opens in
   * a new tab where the officer can print it. Which one happened is stated.
   */
  const downloadReport = async () => {
    setDownloading(true); setDownloadNote(null);
    try {
      const res = await apiFetch('/api/compliance/report.pdf');
      if (!res.ok) {
        setDownloadNote(t('The report could not be generated.',
                          'ವರದಿಯನ್ನು ರಚಿಸಲಾಗಲಿಲ್ಲ.'));
        return;
      }
      const renderer = res.headers.get('X-Report-Renderer') || '';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const stamp = data?.generated_at || 'report';

      if (renderer === 'catalyst-smartbrowz') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `ksp-compliance-report-${stamp}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setDownloadNote(t('PDF downloaded, rendered by Catalyst SmartBrowz.',
                          'PDF ಡೌನ್‌ಲೋಡ್ ಆಗಿದೆ, Catalyst SmartBrowz ಮೂಲಕ.'));
      } else {
        // Opened rather than downloaded: an .html file on disk is less useful
        // than a page the officer can print straight away with Ctrl+P.
        window.open(url, '_blank', 'noopener');
        setDownloadNote(t('Opened as a print-ready A4 page — use Ctrl+P to save as PDF. Server-side PDF rendering was unavailable.',
                          'ಮುದ್ರಣ-ಸಿದ್ಧ A4 ಪುಟವಾಗಿ ತೆರೆಯಲಾಗಿದೆ — PDF ಆಗಿ ಉಳಿಸಲು Ctrl+P ಬಳಸಿ.'));
      }
      // Give the browser time to start the download or open the tab.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setDownloadNote(e.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.')
        : t('Could not reach the report service.', 'ವರದಿ ಸೇವೆಯನ್ನು ತಲುಪಲಾಗಲಿಲ್ಲ.'));
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await apiFetch('/api/compliance/report');
        setData(await res.json());
      } catch (e: any) {
        setError(e.message === 'UNAUTHORIZED'
          ? t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.')
          : t('Unable to load the compliance report.', 'ಅನುಸರಣೆ ವರದಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ.'));
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: GOV.muted, fontSize: 13 }}>
      {t('Compiling compliance report...', 'ಅನುಸರಣೆ ವರದಿ ಸಂಗ್ರಹಿಸಲಾಗುತ್ತಿದೆ...')}
    </div>
  );
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: GOV.breach, fontSize: 13 }}>{error}</div>
  );
  if (!data) return null;

  const clock = data.custody_clock;
  const shown = filter === 'action'
    ? clock.cases.filter(c => c.compliance_status === 'Breached' || c.compliance_status === 'Critical')
    : clock.cases;

  const maxBucket = Math.max(...data.investigation_pendency.age_profile.map(b => b.count), 1);

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
            {t('Case Compliance & Pendency Report', 'ಪ್ರಕರಣ ಅನುಸರಣೆ ಮತ್ತು ಬಾಕಿ ವರದಿ')}
          </h2>
          <div style={pageSubTitle}>
            {t('Statutory custody timelines and investigation disposal status',
               'ಶಾಸನಬದ್ಧ ವಶ ಕಾಲಮಿತಿ ಮತ್ತು ತನಿಖೆ ವಿಲೇವಾರಿ ಸ್ಥಿತಿ')}
          </div>
        </div>
        <div style={{ textAlign: 'right', ...noteText }}>
          <div><strong>{t('As on', 'ದಿನಾಂಕದಂತೆ')}:</strong> {asOn(data.generated_at)}</div>
          <div>{t('Source: Official FIR records', 'ಮೂಲ: ಅಧಿಕೃತ FIR ದಾಖಲೆಗಳು')}</div>
          {/* A station review is carried on paper, not on a screen. */}
          <button type="button" onClick={downloadReport} disabled={downloading}
            style={{
              marginTop: 8, background: GOV.navy, color: '#fff', border: 'none',
              borderRadius: 5, padding: '7px 13px', fontSize: 12.5,
              fontWeight: 700, cursor: downloading ? 'default' : 'pointer',
              opacity: downloading ? 0.6 : 1,
            }}>
            {downloading
              ? t('Preparing...', 'ಸಿದ್ಧಪಡಿಸುತ್ತಿದೆ...')
              : t('Download full report', 'ಪೂರ್ಣ ವರದಿ ಡೌನ್‌ಲೋಡ್')}
          </button>
        </div>
      </div>

      {downloadNote && (
        <div style={{
          ...noteText, marginTop: -8, marginBottom: 14, textAlign: 'right',
          color: GOV.muted,
        }}>
          {downloadNote}
        </div>
      )}

      {/* Summary strip. Action-required leads, because that is the decision. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={figure(GOV.breach)}>
          <div style={figureLabel}>{t('Action required', 'ಕ್ರಮ ಅಗತ್ಯ')}</div>
          <div style={{ ...figureValue, color: GOV.breach }}>{data.headline.action_required}</div>
          <div style={figureSub}>{t('breached or within 7 days', 'ಉಲ್ಲಂಘನೆ ಅಥವಾ 7 ದಿನದೊಳಗೆ')}</div>
        </div>
        <div style={figure(GOV.breach)}>
          <div style={figureLabel}>{t('Time limit exceeded', 'ಕಾಲಮಿತಿ ಮೀರಿದೆ')}</div>
          <div style={{ ...figureValue, color: GOV.breach }}>{data.headline.breached}</div>
          <div style={figureSub}>{t('default bail exposure', 'ಡಿಫಾಲ್ಟ್ ಜಾಮೀನು ಅಪಾಯ')}</div>
        </div>
        <div style={figure(GOV.critical)}>
          <div style={figureLabel}>{t('Due within 7 days', '7 ದಿನದೊಳಗೆ ಬಾಕಿ')}</div>
          <div style={{ ...figureValue, color: GOV.critical }}>{data.headline.critical}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Open investigations', 'ಬಾಕಿ ತನಿಖೆಗಳು')}</div>
          <div style={figureValue}>{data.headline.open_investigations}</div>
          <div style={figureSub}>
            {t('oldest', 'ಅತ್ಯಂತ ಹಳೆಯದು')} {data.headline.oldest_open_days} {t('days', 'ದಿನ')}
          </div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Cases under custody clock', 'ವಶ ಕಾಲಮಿತಿಯಲ್ಲಿ')}</div>
          <div style={figureValue}>{clock.total_under_clock}</div>
          <div style={figureSub}>{t('accused in custody', 'ಆರೋಪಿ ವಶದಲ್ಲಿ')}</div>
        </div>
      </div>

      {/* Statutory basis, stated openly with its limits. */}
      <div style={legalNote}>
        <div><strong>{t('Statutory basis', 'ಶಾಸನಬದ್ಧ ಆಧಾರ')}:</strong> {clock.legal_basis}</div>
        <div style={{ marginTop: 5, color: GOV.muted }}>
          <strong>{t('Note', 'ಸೂಚನೆ')}:</strong> {clock.disclaimer}
        </div>
      </div>

      {/* 1. Custody clock */}
      <div style={panel}>
        <div style={{ ...panelHead, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>1. {t('Custody clock — chargesheet due', 'ವಶ ಕಾಲಮಿತಿ — ಆರೋಪಪಟ್ಟಿ ಬಾಕಿ')}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            {(['action', 'all'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  font: 'inherit', fontSize: 10.5, textTransform: 'uppercase',
                  padding: '3px 9px', cursor: 'pointer', borderRadius: 2,
                  border: `1px solid ${filter === f ? GOV.navy : GOV.ruleStrong}`,
                  background: filter === f ? GOV.navy : '#fff',
                  color: filter === f ? '#fff' : GOV.muted,
                }}>
                {f === 'action'
                  ? `${t('Action required', 'ಕ್ರಮ ಅಗತ್ಯ')} (${clock.action_required})`
                  : `${t('All', 'ಎಲ್ಲಾ')} (${clock.total_under_clock})`}
              </button>
            ))}
          </span>
        </div>
        <div style={panelBody}>
          <div style={{ ...noteText, marginBottom: 10 }}>
            {t('Cases where an accused is in custody and no chargesheet is on record. Days remaining is counted against the statutory period applicable to the offence.',
               'ಆರೋಪಿ ವಶದಲ್ಲಿದ್ದು ಆರೋಪಪಟ್ಟಿ ಸಲ್ಲಿಸದ ಪ್ರಕರಣಗಳು.')}
          </div>
          {shown.length === 0 ? (
            <div style={{ ...noteText, padding: '10px 0' }}>
              {t('No cases in this category.', 'ಈ ವರ್ಗದಲ್ಲಿ ಪ್ರಕರಣಗಳಿಲ್ಲ.')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{t('Crime No.', 'ಅಪರಾಧ ಸಂ.')}</th>
                    <th style={th}>{t('Offence', 'ಅಪರಾಧ')}</th>
                    <th style={th}>{t('Gravity', 'ಗಂಭೀರತೆ')}</th>
                    <th style={th}>{t('Police Station', 'ಪೊಲೀಸ್ ಠಾಣೆ')}</th>
                    <th style={th}>{t('Arrest date', 'ಬಂಧನ ದಿನಾಂಕ')}</th>
                    <th style={th}>{t('Day', 'ದಿನ')}</th>
                    <th style={th}>{t('Remaining', 'ಬಾಕಿ')}</th>
                    <th style={th}>{t('Status', 'ಸ್ಥಿತಿ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c, i) => (
                    <tr key={c.crime_no} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                      <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{c.crime_no}</td>
                      <td style={td}>{localizeCrimeType(c.crime_type || '', language)}</td>
                      <td style={td}>
                        {c.gravity === 'Heinous'
                          ? <span style={chip(GOV.breach, GOV.breachBg)}>{t('Heinous', 'ಘೋರ')}</span>
                          : <span style={{ color: GOV.muted }}>{t('Ordinary', 'ಸಾಮಾನ್ಯ')}</span>}
                      </td>
                      <td style={td}>
                        {c.police_station}
                        <div style={{ fontSize: 10.5, color: GOV.faint }}>
                          {localizeDistrict(c.district || '', language)}
                        </div>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{asOn(c.arrest_date)}</td>
                      {/* "day 71 of 90" reads the way a case diary does */}
                      <td style={tdNum}>
                        {c.days_in_custody}
                        <span style={{ color: GOV.faint }}> / {c.statutory_limit_days}</span>
                      </td>
                      <td style={{
                        ...tdNum, fontWeight: 700,
                        color: c.days_remaining < 0 ? GOV.breach
                          : c.days_remaining <= 7 ? GOV.critical : GOV.ink,
                      }}>
                        {c.days_remaining < 0
                          ? `${Math.abs(c.days_remaining)} ${t('over', 'ಹೆಚ್ಚು')}`
                          : c.days_remaining}
                      </td>
                      <td style={td}>
                        <span style={severityChip(c.compliance_status)}>{c.compliance_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 2. Investigation pendency */}
      <div style={panel}>
        <div style={panelHead}>2. {t('Investigation pendency by age', 'ವಯಸ್ಸಿನ ಪ್ರಕಾರ ಬಾಕಿ ತನಿಖೆ')}</div>
        <div style={panelBody}>
          <div style={{ ...noteText, marginBottom: 12 }}>{data.investigation_pendency.note}</div>
          <table style={{ ...table, maxWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>{t('Age (days)', 'ವಯಸ್ಸು (ದಿನ)')}</th>
                <th style={th}>{t('Open cases', 'ಬಾಕಿ ಪ್ರಕರಣ')}</th>
                <th style={{ ...th, width: '55%' }}>{t('Share', 'ಪಾಲು')}</th>
              </tr>
            </thead>
            <tbody>
              {data.investigation_pendency.age_profile.map((b, i) => (
                <tr key={b.bucket} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                  <td style={td}>{b.bucket}</td>
                  <td style={tdNum}>{b.count}</td>
                  <td style={td}>
                    {/* Plain proportional rule; older buckets deepen in colour. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 10, background: '#e8eaee' }}>
                        <div style={{
                          width: `${(b.count / maxBucket) * 100}%`, height: '100%',
                          background: i >= 4 ? GOV.breach : i === 3 ? GOV.critical : GOV.navy,
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: GOV.muted, minWidth: 38, textAlign: 'right' }}>
                        {data.investigation_pendency.total_open
                          ? ((b.count / data.investigation_pendency.total_open) * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Station scoreboard */}
      <div style={panel}>
        <div style={panelHead}>
          3. {t('Police station disposal performance', 'ಪೊಲೀಸ್ ಠಾಣೆ ವಿಲೇವಾರಿ ಸಾಧನೆ')}
        </div>
        <div style={panelBody}>
          <div style={{ ...noteText, marginBottom: 10 }}>{data.station_scoreboard.note}</div>
          <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>{t('Police Station', 'ಪೊಲೀಸ್ ಠಾಣೆ')}</th>
                  <th style={th}>{t('District', 'ಜಿಲ್ಲೆ')}</th>
                  <th style={th}>{t('Registered', 'ದಾಖಲಾಗಿದೆ')}</th>
                  <th style={th}>{t('Disposed', 'ವಿಲೇವಾರಿ')}</th>
                  <th style={th}>{t('Pending', 'ಬಾಕಿ')}</th>
                  <th style={{ ...th, width: '30%' }}>{t('Disposal rate', 'ವಿಲೇವಾರಿ ದರ')}</th>
                </tr>
              </thead>
              <tbody>
                {data.station_scoreboard.stations.map((s, i) => (
                  <tr key={s.police_station + s.district} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                    <td style={td}>{s.police_station}</td>
                    <td style={td}>{localizeDistrict(s.district, language)}</td>
                    <td style={tdNum}>{s.registered}</td>
                    <td style={tdNum}>{s.disposed}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{s.still_open}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 10, background: '#e8eaee' }}>
                          <div style={{
                            width: `${s.disposal_rate_pct}%`, height: '100%',
                            background: s.disposal_rate_pct < 25 ? GOV.breach
                              : s.disposal_rate_pct < 50 ? GOV.critical : GOV.ok,
                          }} />
                        </div>
                        <span style={{ fontSize: 11, minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {s.disposal_rate_pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Officer workload */}
      <div style={panel}>
        <div style={panelHead}>
          4. {t('Investigating officer caseload', 'ತನಿಖಾ ಅಧಿಕಾರಿ ಪ್ರಕರಣ ಹೊರೆ')}
        </div>
        <div style={panelBody}>
          <div style={{ ...noteText, marginBottom: 10 }}>
            {data.officer_workload.note}{' '}
            <strong>{t('Average open caseload', 'ಸರಾಸರಿ ಬಾಕಿ ಹೊರೆ')}: {data.officer_workload.average_open_per_officer}</strong>
          </div>
          <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>{t('Investigating Officer', 'ತನಿಖಾ ಅಧಿಕಾರಿ')}</th>
                  <th style={th}>{t('Total', 'ಒಟ್ಟು')}</th>
                  <th style={th}>{t('Open', 'ಬಾಕಿ')}</th>
                  <th style={th}>{t('Accused in custody', 'ಆರೋಪಿ ವಶದಲ್ಲಿ')}</th>
                  <th style={th}>{t('vs average', 'ಸರಾಸರಿಗೆ ಹೋಲಿಸಿ')}</th>
                </tr>
              </thead>
              <tbody>
                {data.officer_workload.officers.map((o, i) => (
                  <tr key={o.officer} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                    <td style={td}>
                      {o.officer}
                      {o.overloaded && (
                        <span style={{ marginLeft: 8, ...chip(GOV.critical, GOV.criticalBg) }}>
                          {t('Overloaded', 'ಹೆಚ್ಚು ಹೊರೆ')}
                        </span>
                      )}
                    </td>
                    <td style={tdNum}>{o.total_cases}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{o.open_cases}</td>
                    <td style={tdNum}>{o.open_with_accused_in_custody}</td>
                    <td style={{
                      ...tdNum,
                      color: o.load_vs_average_pct > 0 ? GOV.critical : GOV.ok,
                    }}>
                      {o.load_vs_average_pct > 0 ? '+' : ''}{o.load_vs_average_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ ...noteText, textAlign: 'center', paddingTop: 6 }}>
        {t('Generated by KSP Crime Intelligence Platform. Figures are traceable to individual case records.',
           'KSP ಅಪರಾಧ ಗುಪ್ತಚರ ವೇದಿಕೆ. ಅಂಕಿಅಂಶಗಳು ಪ್ರತ್ಯೇಕ ಪ್ರಕರಣ ದಾಖಲೆಗಳಿಗೆ ಪತ್ತೆಹಚ್ಚಬಹುದು.')}
      </div>
    </div>
  );
};

export default ComplianceView;
