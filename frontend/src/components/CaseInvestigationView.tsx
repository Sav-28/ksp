import React, { useState } from 'react';
import { apiFetch, getUser } from '../api';
import {
  localizeDistrict, localizeCrimeType, localizePersonName, localizePlace, localizeDescription,
} from '../locale';
import {
  GOV, mono, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  severityChip, chip, pageTitle, pageSubTitle, legalNote, asOn,
} from '../govStyles';

/**
 * Case dossier, retrieved by Crime No.
 *
 * Presented as a case file rather than a set of cards: numbered sections, ruled
 * particulars, and - most importantly - this case's position against the
 * statutory chargesheet period surfaced at the top. An investigator opening a
 * case needs to know whether the custody clock is running before anything else,
 * and that was previously only visible in the aggregate compliance report.
 */

const ALL_STATUSES = [
  'Registered', 'Under Investigation', 'Chargesheet Filed', 'Closed', 'Convicted', 'Acquitted',
];
const TERMINAL_STATUSES = ['Closed', 'Convicted', 'Acquitted'];

interface PersonBrief {
  id: number; name: string; age?: number; gender?: string;
  district?: string; occupation?: string; risk_score?: number;
}
interface CustodyClock {
  applies: boolean; arrest_date: string; days_in_custody: number;
  statutory_limit_days: number; days_remaining: number;
  compliance_status: string; due_by: string;
  legal_basis: string; disclaimer: string;
}
interface Police {
  crime_no?: string; case_no?: string; registered_date?: string;
  category?: string; gravity?: string; case_status?: string;
  police_station?: string; officer?: string; officer_rank?: string;
  officer_designation?: string; court?: string;
  incident_from?: string; incident_to?: string; info_received?: string;
  arrest_date?: string | null; chargesheet_filed?: boolean;
  chargesheet_date?: string | null;
  custody_clock?: CustodyClock | null;
}
interface CaseDetail {
  fir_number: string; crime_type: string; date_occurred: string;
  district: string; police_station: string; description: string;
  location?: { latitude?: number; longitude?: number } | null;
  investigation?: {
    status?: string; officer?: string; ipc_sections?: string;
    arrest_made?: boolean; outcome?: string; court_status?: string;
  } | null;
  accused: PersonBrief[]; victims: PersonBrief[]; witnesses: PersonBrief[];
  police?: Police | null;
}

/** Label/value row in a ruled particulars table. */
const Row = ({ label, value, isMono }: { label: string; value?: React.ReactNode; isMono?: boolean }) => (
  <tr>
    <th style={{
      ...th, width: 190, background: GOV.panelAlt, textTransform: 'none',
      fontSize: 11.5, letterSpacing: 0, verticalAlign: 'top',
    }}>
      {label}
    </th>
    <td style={{ ...td, ...(isMono ? mono : {}) }}>
      {value === undefined || value === null || value === '' ? (
        <span style={{ color: GOV.faint }}>&mdash;</span>
      ) : value}
    </td>
  </tr>
);

const Particulars = ({ children }: { children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${GOV.rule}`, flex: '1 1 420px', minWidth: 340 }}>
    <table style={table}><tbody>{children}</tbody></table>
  </div>
);

const People = ({ people, language, empty }: {
  people: PersonBrief[]; language: 'en' | 'kn'; empty: string;
}) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  if (!people.length) return <div style={noteText}>{empty}</div>;
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>{t('Name', 'ಹೆಸರು')}</th>
            <th style={th}>{t('Age', 'ವಯಸ್ಸು')}</th>
            <th style={th}>{t('Sex', 'ಲಿಂಗ')}</th>
            <th style={th}>{t('District', 'ಜಿಲ್ಲೆ')}</th>
            <th style={th}>{t('Occupation', 'ವೃತ್ತಿ')}</th>
            <th style={th}>{t('Risk score', 'ಅಪಾಯ ಅಂಕ')}</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => (
            <tr key={p.id} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
              <td style={{ ...td, fontWeight: 600 }}>{localizePersonName(p.name, language)}</td>
              <td style={tdNum}>{p.age ?? '\u2014'}</td>
              <td style={td}>{p.gender || '\u2014'}</td>
              <td style={td}>{p.district ? localizeDistrict(p.district, language) : '\u2014'}</td>
              <td style={td}>{p.occupation || '\u2014'}</td>
              <td style={td}>
                {p.risk_score != null && p.risk_score > 0 ? (
                  <span style={
                    p.risk_score >= 70 ? chip(GOV.breach, GOV.breachBg)
                    : p.risk_score >= 40 ? chip(GOV.critical, GOV.criticalBg)
                    : chip(GOV.ok, GOV.okBg)
                  }>
                    {p.risk_score}/100
                  </span>
                ) : <span style={{ color: GOV.faint }}>&mdash;</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CaseInvestigationView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [fir, setFir] = useState('');
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status-management state. Gate by ROLE directly (robust — always present on
  // the stored user, unlike the login-time capability flags which require a
  // fresh login to appear). Mirrors the backend RBAC.
  const user = getUser();
  const role = user?.role || '';
  const canUpdateCase = ['investigator', 'supervisor', 'admin'].includes(role);
  const canCloseCase = ['supervisor', 'admin'].includes(role);
  const [newStatus, setNewStatus] = useState('');
  const [outcome, setOutcome] = useState('');
  const [updating, setUpdating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);

  const investigate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = fir.trim();
    if (!q) return;
    setLoading(true); setError(null); setDetail(null);
    setStatusMsg(null); setStatusErr(null);
    try {
      const res = await apiFetch(`/api/crime/${encodeURIComponent(q)}`);
      if (res.status === 404) {
        setError(t(`No case found with Crime No ${q}.`, `${q} ಸಂಖ್ಯೆಯ ಪ್ರಕರಣ ಸಿಗಲಿಲ್ಲ.`));
        return;
      }
      const data = await res.json();
      setDetail(data);
      setNewStatus(data?.police?.case_status || data?.investigation?.status || 'Registered');
      setOutcome('');
    } catch (err: any) {
      setError(err.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಸೆಷನ್ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.')
        : t('Unable to load the case.', 'ಪ್ರಕರಣ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.'));
    } finally { setLoading(false); }
  };

  const updateStatus = async () => {
    if (!detail) return;
    setStatusErr(null); setStatusMsg(null);
    const isTerminal = TERMINAL_STATUSES.includes(newStatus);
    if (isTerminal && !canCloseCase) {
      setStatusErr(t('Closing a case requires a supervisor or administrator.',
                     'ಪ್ರಕರಣ ಮುಚ್ಚಲು ಮೇಲ್ವಿಚಾರಕ ಅಥವಾ ನಿರ್ವಾಹಕ ಅಗತ್ಯ.'));
      return;
    }
    const body: Record<string, any> = { investigation_status: newStatus };
    if (isTerminal && outcome) body.case_outcome = outcome;
    setUpdating(true);
    try {
      const res = await apiFetch(`/api/crimes/${encodeURIComponent(detail.fir_number)}`,
        { method: 'PATCH', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200) {
        setDetail(data.detail);
        setNewStatus(data.detail?.police?.case_status || data.detail?.investigation?.status || newStatus);
        setStatusMsg(t(`Status updated to "${newStatus}".`, `ಸ್ಥಿತಿ "${newStatus}" ಗೆ ನವೀಕರಿಸಲಾಗಿದೆ.`));
      } else if (res.status === 403) {
        setStatusErr(data.detail || t('You are not authorised for this action.', 'ಈ ಕ್ರಿಯೆಗೆ ಅಧಿಕಾರವಿಲ್ಲ.'));
      } else {
        setStatusErr(data.detail || t('Update failed.', 'ನವೀಕರಣ ವಿಫಲವಾಗಿದೆ.'));
      }
    } catch (err: any) {
      setStatusErr(err.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಸೆಷನ್ ಮುಗಿದಿದೆ.')
        : t('Update failed.', 'ನವೀಕರಣ ವಿಫಲವಾಗಿದೆ.'));
    } finally { setUpdating(false); }
  };

  const p = detail?.police || {};
  const inv = detail?.investigation || {};
  const loc = detail?.location || {};
  const cc = p.custody_clock;

  return (
    <div style={{ padding: '22px 30px 40px', background: GOV.panelAlt, minHeight: '100%', color: GOV.ink }}>

      {/* Header */}
      <div style={{
        borderBottom: `2px solid ${GOV.navy}`, paddingBottom: 10, marginBottom: 16,
      }}>
        <h2 style={pageTitle}>{t('Case Dossier', 'ಪ್ರಕರಣ ದಾಖಲೆ')}</h2>
        <div style={pageSubTitle}>
          {t('Retrieve a case by Crime No. for full particulars, persons involved and statutory position',
             'ಪೂರ್ಣ ವಿವರಗಳಿಗಾಗಿ ಅಪರಾಧ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ')}
        </div>
      </div>

      {/* Retrieval */}
      <form onSubmit={investigate} style={{
        display: 'flex', gap: 0, marginBottom: 18, maxWidth: 640, alignItems: 'stretch',
      }}>
        <input
          value={fir}
          onChange={(e) => setFir(e.target.value)}
          placeholder={t('Crime No., e.g. 100020006202500004', 'ಅಪರಾಧ ಸಂಖ್ಯೆ')}
          aria-label={t('Crime number', 'ಅಪರಾಧ ಸಂಖ್ಯೆ')}
          style={{
            flex: 1, padding: '10px 12px', fontSize: 14,
            border: `1px solid ${GOV.ruleStrong}`, borderRight: 'none',
            borderRadius: 0, ...mono,
          }}
        />
        <button type="submit" disabled={loading} style={{
          background: GOV.navy, color: '#fff', border: `1px solid ${GOV.navy}`,
          borderRadius: 0, padding: '10px 24px', fontSize: 11.5, fontWeight: 700,
          cursor: loading ? 'default' : 'pointer', textTransform: 'uppercase',
          letterSpacing: 0.5, whiteSpace: 'nowrap',
        }}>
          {loading ? t('Retrieving...', 'ಪಡೆಯಲಾಗುತ್ತಿದೆ...') : t('Retrieve', 'ಪಡೆಯಿರಿ')}
        </button>
      </form>

      {error && (
        <div style={{
          background: GOV.breachBg, border: `1px solid ${GOV.breach}44`, borderRadius: 2,
          padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: GOV.breach, maxWidth: 640,
        }}>
          {error}
        </div>
      )}

      {detail && (
        <>
          {/* Case identity strip */}
          <div style={{
            background: GOV.navy, color: '#fff', padding: '12px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 14, flexWrap: 'wrap', marginBottom: 0,
          }}>
            <div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.75 }}>
                {t('Crime No.', 'ಅಪರಾಧ ಸಂಖ್ಯೆ')}
              </div>
              <div style={{ ...mono, fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>
                {p.crime_no || detail.fir_number}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {localizeCrimeType(detail.crime_type, language)}
              </span>
              {p.gravity && (
                <span style={{
                  ...chip(p.gravity === 'Heinous' ? '#fff' : '#fff',
                          p.gravity === 'Heinous' ? GOV.breach : 'rgba(255,255,255,0.18)'),
                  border: '1px solid rgba(255,255,255,0.45)',
                }}>
                  {p.gravity}
                </span>
              )}
              {(p.case_status || inv.status) && (
                <span style={{
                  ...chip('#fff', 'rgba(255,255,255,0.18)'),
                  border: '1px solid rgba(255,255,255,0.45)',
                }}>
                  {p.case_status || inv.status}
                </span>
              )}
            </div>
          </div>

          {/* Statutory position. First thing after the identity strip because on
              a live case it is the most time-critical fact in the file. */}
          {cc && (
            <div style={{
              border: `1px solid ${GOV.rule}`,
              borderLeft: `4px solid ${cc.days_remaining < 0 ? GOV.breach
                : cc.days_remaining <= 7 ? GOV.critical
                : cc.days_remaining <= 21 ? GOV.warning : GOV.ok}`,
              background: cc.days_remaining < 0 ? GOV.breachBg
                : cc.days_remaining <= 7 ? GOV.criticalBg
                : cc.days_remaining <= 21 ? GOV.warningBg : GOV.okBg,
              padding: '12px 16px', marginBottom: 18,
            }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                }}>
                  {t('Statutory position — chargesheet', 'ಶಾಸನಬದ್ಧ ಸ್ಥಿತಿ — ಆರೋಪಪಟ್ಟಿ')}
                </span>
                <span style={severityChip(cc.compliance_status)}>{cc.compliance_status}</span>
              </div>
              <div style={{ marginTop: 7, fontSize: 13.5, fontWeight: 600 }}>
                {cc.days_remaining < 0
                  ? t(`Period exceeded by ${Math.abs(cc.days_remaining)} days. The accused is entitled to apply for default bail.`,
                      `${Math.abs(cc.days_remaining)} ದಿನ ಮೀರಿದೆ. ಆರೋಪಿ ಡಿಫಾಲ್ಟ್ ಜಾಮೀನಿಗೆ ಅರ್ಹ.`)
                  : t(`${cc.days_remaining} days remaining to file the chargesheet.`,
                      `ಆರೋಪಪಟ್ಟಿ ಸಲ್ಲಿಸಲು ${cc.days_remaining} ದಿನ ಬಾಕಿ.`)}
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                <span>{t('Arrested', 'ಬಂಧನ')}: <strong>{asOn(cc.arrest_date)}</strong></span>
                <span>
                  {t('Day', 'ದಿನ')}: <strong>{cc.days_in_custody} / {cc.statutory_limit_days}</strong>
                </span>
                <span>{t('Due by', 'ಗಡುವು')}: <strong>{asOn(cc.due_by)}</strong></span>
              </div>
              <div style={{ ...noteText, marginTop: 7 }}>{cc.legal_basis}</div>
              <div style={{ ...noteText, marginTop: 3, fontStyle: 'italic' }}>{cc.disclaimer}</div>
            </div>
          )}
          {!cc && p.chargesheet_filed && (
            <div style={{ ...legalNote, borderLeftColor: GOV.ok, marginTop: 0 }}>
              <strong>{t('Chargesheet filed', 'ಆರೋಪಪಟ್ಟಿ ಸಲ್ಲಿಸಲಾಗಿದೆ')}</strong>
              {p.chargesheet_date ? ` \u00B7 ${asOn(p.chargesheet_date)}` : ''}.{' '}
              {t('The statutory chargesheet period no longer applies to this case.',
                 'ಈ ಪ್ರಕರಣಕ್ಕೆ ಶಾಸನಬದ್ಧ ಕಾಲಮಿತಿ ಅನ್ವಯಿಸುವುದಿಲ್ಲ.')}
            </div>
          )}
          {!cc && !p.chargesheet_filed && (
            <div style={{ ...legalNote, marginTop: 0 }}>
              {t('No arrest is recorded on this case, so the statutory chargesheet period is not running. Investigation pendency still applies.',
                 'ಈ ಪ್ರಕರಣದಲ್ಲಿ ಬಂಧನ ದಾಖಲಾಗಿಲ್ಲ, ಆದ್ದರಿಂದ ಶಾಸನಬದ್ಧ ಕಾಲಮಿತಿ ಚಾಲನೆಯಲ್ಲಿಲ್ಲ.')}
            </div>
          )}

          {/* 1. Case particulars */}
          <div style={panel}>
            <div style={panelHead}>1. {t('Case particulars', 'ಪ್ರಕರಣ ವಿವರಗಳು')}</div>
            <div style={panelBody}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <Particulars>
                  <Row label={t('Crime No.', 'ಅಪರಾಧ ಸಂಖ್ಯೆ')} value={p.crime_no || detail.fir_number} isMono />
                  <Row label={t('Case No.', 'ಪ್ರಕರಣ ಸಂಖ್ಯೆ')} value={p.case_no} isMono />
                  <Row label={t('Category', 'ವರ್ಗ')} value={p.category} />
                  <Row label={t('Gravity of offence', 'ಅಪರಾಧದ ಗಂಭೀರತೆ')} value={p.gravity} />
                  <Row label={t('Sections invoked', 'ಅನ್ವಯಿಸಿದ ಸೆಕ್ಷನ್')} value={inv.ipc_sections} isMono />
                </Particulars>
                <Particulars>
                  <Row label={t('Date registered', 'ನೋಂದಣಿ ದಿನಾಂಕ')}
                       value={asOn(p.registered_date || detail.date_occurred)} />
                  <Row label={t('Present status', 'ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ')} value={p.case_status || inv.status} />
                  <Row label={t('Arrest made', 'ಬಂಧನ')}
                       value={inv.arrest_made ? t('Yes', 'ಹೌದು') : t('No', 'ಇಲ್ಲ')} />
                  <Row label={t('Chargesheet', 'ಆರೋಪಪಟ್ಟಿ')}
                       value={p.chargesheet_filed
                         ? `${t('Filed', 'ಸಲ್ಲಿಸಲಾಗಿದೆ')}${p.chargesheet_date ? ` \u00B7 ${asOn(p.chargesheet_date)}` : ''}`
                         : t('Not filed', 'ಸಲ್ಲಿಸಿಲ್ಲ')} />
                  <Row label={t('Outcome', 'ಫಲಿತಾಂಶ')} value={inv.outcome} />
                </Particulars>
              </div>
              {detail.description && (
                <div style={{ marginTop: 14 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: GOV.navy, textTransform: 'uppercase',
                    letterSpacing: 0.4, marginBottom: 5,
                  }}>
                    {t('Brief facts', 'ಸಂಕ್ಷಿಪ್ತ ವಿವರ')}
                  </div>
                  <div style={{
                    border: `1px solid ${GOV.rule}`, background: GOV.panelAlt,
                    padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
                  }}>
                    {localizeDescription(detail.description, language)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Police and court */}
          <div style={panel}>
            <div style={panelHead}>2. {t('Police and court', 'ಪೊಲೀಸ್ ಮತ್ತು ನ್ಯಾಯಾಲಯ')}</div>
            <div style={panelBody}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <Particulars>
                  <Row label={t('Police station', 'ಪೊಲೀಸ್ ಠಾಣೆ')}
                       value={p.police_station || detail.police_station} />
                  <Row label={t('Investigating officer', 'ತನಿಖಾ ಅಧಿಕಾರಿ')} value={p.officer || inv.officer} />
                  <Row label={t('Rank', 'ಹುದ್ದೆ')} value={p.officer_rank} />
                </Particulars>
                <Particulars>
                  <Row label={t('Designation', 'ಪದನಾಮ')} value={p.officer_designation} />
                  <Row label={t('Court', 'ನ್ಯಾಯಾಲಯ')} value={p.court} />
                  <Row label={t('Court status', 'ನ್ಯಾಯಾಲಯ ಸ್ಥಿತಿ')} value={inv.court_status} />
                </Particulars>
              </div>
            </div>
          </div>

          {/* 3. Occurrence and location */}
          <div style={panel}>
            <div style={panelHead}>3. {t('Occurrence and location', 'ಘಟನೆ ಮತ್ತು ಸ್ಥಳ')}</div>
            <div style={panelBody}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <Particulars>
                  <Row label={t('District', 'ಜಿಲ್ಲೆ')} value={localizeDistrict(detail.district, language)} />
                  <Row label={t('Station area', 'ಠಾಣೆ ವ್ಯಾಪ್ತಿ')}
                       value={localizePlace(detail.police_station, language)} />
                  <Row label={t('Coordinates', 'ನಿರ್ದೇಶಾಂಕ')}
                       value={loc.latitude != null && loc.longitude != null
                         ? `${loc.latitude}, ${loc.longitude}` : undefined} isMono />
                </Particulars>
                <Particulars>
                  <Row label={t('Occurrence from', 'ಘಟನೆ ಆರಂಭ')} value={p.incident_from} />
                  <Row label={t('Occurrence to', 'ಘಟನೆ ಅಂತ್ಯ')} value={p.incident_to} />
                  <Row label={t('Information received at station', 'ಠಾಣೆಗೆ ಮಾಹಿತಿ')} value={p.info_received} />
                </Particulars>
              </div>
              {loc.latitude != null && loc.longitude != null && (
                <div style={{ marginTop: 14 }}>
                  <iframe
                    title="incident-location-map"
                    width="100%"
                    height="280"
                    loading="lazy"
                    style={{ border: `1px solid ${GOV.ruleStrong}` }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${loc.longitude - 0.012}%2C${loc.latitude - 0.008}%2C${loc.longitude + 0.012}%2C${loc.latitude + 0.008}&layer=mapnik&marker=${loc.latitude}%2C${loc.longitude}`}
                  />
                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`}
                      target="_blank" rel="noreferrer"
                      style={{
                        fontSize: 11, color: '#fff', background: GOV.navy, padding: '6px 14px',
                        fontWeight: 700, textDecoration: 'none', textTransform: 'uppercase',
                        letterSpacing: 0.4, borderRadius: 2,
                      }}>
                      {t('Directions', 'ದಿಕ್ಕುಗಳು')}
                    </a>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=15/${loc.latitude}/${loc.longitude}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 11.5, color: GOV.navy }}>
                      {t('Open full map', 'ಪೂರ್ಣ ನಕ್ಷೆ')}
                    </a>
                    <span style={noteText}>
                      {t('Base map \u00A9 OpenStreetMap contributors', 'ಮೂಲ ನಕ್ಷೆ \u00A9 OpenStreetMap')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Persons */}
          <div style={panel}>
            <div style={panelHead}>4. {t('Persons connected with the case', 'ಪ್ರಕರಣಕ್ಕೆ ಸಂಬಂಧಿಸಿದ ವ್ಯಕ್ತಿಗಳು')}</div>
            <div style={panelBody}>
              {([
                [`${t('Accused', 'ಆರೋಪಿ')} (${detail.accused.length})`, detail.accused, t('No accused recorded.', 'ಆರೋಪಿ ದಾಖಲಾಗಿಲ್ಲ.')],
                [`${t('Victims', 'ಸಂತ್ರಸ್ತರು')} (${detail.victims.length})`, detail.victims, t('No victims recorded.', 'ಸಂತ್ರಸ್ತರು ದಾಖಲಾಗಿಲ್ಲ.')],
                [`${t('Witnesses', 'ಸಾಕ್ಷಿಗಳು')} (${detail.witnesses.length})`, detail.witnesses, t('No witnesses recorded.', 'ಸಾಕ್ಷಿಗಳು ದಾಖಲಾಗಿಲ್ಲ.')],
              ] as const).map(([heading, list, empty], i) => (
                <div key={i} style={{ marginBottom: i < 2 ? 16 : 0 }}>
                  <div style={{
                    fontSize: 11.5, fontWeight: 700, color: GOV.navy, textTransform: 'uppercase',
                    letterSpacing: 0.3, marginBottom: 6,
                  }}>
                    {heading}
                  </div>
                  <People people={list as PersonBrief[]} language={language} empty={empty} />
                </div>
              ))}
            </div>
          </div>

          {/* 5. Status action — role-gated */}
          {canUpdateCase && (
            <div style={panel}>
              <div style={panelHead}>5. {t('Record a change of status', 'ಸ್ಥಿತಿ ಬದಲಾವಣೆ ದಾಖಲಿಸಿ')}</div>
              <div style={panelBody}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{
                      fontSize: 10.5, fontWeight: 700, color: GOV.muted, textTransform: 'uppercase',
                      letterSpacing: 0.4, marginBottom: 4,
                    }}>
                      {t('Status', 'ಸ್ಥಿತಿ')}
                    </label>
                    <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                      style={{
                        padding: '8px 10px', border: `1px solid ${GOV.ruleStrong}`,
                        borderRadius: 2, fontSize: 13, minWidth: 220, background: '#fff',
                      }}>
                      {ALL_STATUSES.map((s) => {
                        const terminal = TERMINAL_STATUSES.includes(s);
                        const locked = terminal && !canCloseCase;
                        return (
                          <option key={s} value={s} disabled={locked}>
                            {s}{locked ? ` \u2014 ${t('supervisor only', 'ಮೇಲ್ವಿಚಾರಕ ಮಾತ್ರ')}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {TERMINAL_STATUSES.includes(newStatus) && canCloseCase && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{
                        fontSize: 10.5, fontWeight: 700, color: GOV.muted, textTransform: 'uppercase',
                        letterSpacing: 0.4, marginBottom: 4,
                      }}>
                        {t('Outcome (optional)', 'ಫಲಿತಾಂಶ (ಐಚ್ಛಿಕ)')}
                      </label>
                      <input value={outcome} onChange={(e) => setOutcome(e.target.value)}
                        placeholder={t('e.g. Solved / Chargesheeted', 'ಉದಾ. ಪರಿಹರಿಸಲಾಗಿದೆ')}
                        style={{
                          padding: '8px 10px', border: `1px solid ${GOV.ruleStrong}`,
                          borderRadius: 2, fontSize: 13, minWidth: 220,
                        }} />
                    </div>
                  )}
                  <button onClick={updateStatus} disabled={updating}
                    style={{
                      background: TERMINAL_STATUSES.includes(newStatus) ? GOV.breach : GOV.navy,
                      color: '#fff', border: 'none', borderRadius: 2, padding: '9px 22px',
                      fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                      cursor: updating ? 'default' : 'pointer', opacity: updating ? 0.6 : 1,
                    }}>
                    {updating ? t('Saving...', 'ಉಳಿಸಲಾಗುತ್ತಿದೆ...')
                      : TERMINAL_STATUSES.includes(newStatus) ? t('Close case', 'ಪ್ರಕರಣ ಮುಚ್ಚಿ')
                      : t('Update status', 'ಸ್ಥಿತಿ ನವೀಕರಿಸಿ')}
                  </button>
                </div>
                {!canCloseCase && (
                  <div style={{ ...noteText, marginTop: 9 }}>
                    {t('Closing a case (Closed, Convicted or Acquitted) requires a supervisor or administrator. Every change is written to the audit log.',
                       'ಪ್ರಕರಣ ಮುಚ್ಚಲು ಮೇಲ್ವಿಚಾರಕ ಅಗತ್ಯ. ಪ್ರತಿ ಬದಲಾವಣೆ ಲೆಕ್ಕಪರಿಶೋಧನೆಗೆ ದಾಖಲಾಗುತ್ತದೆ.')}
                  </div>
                )}
                {statusMsg && (
                  <div style={{
                    marginTop: 12, background: GOV.okBg, border: `1px solid ${GOV.ok}44`,
                    padding: '8px 12px', fontSize: 12.5, color: GOV.ok,
                  }}>
                    {statusMsg}
                  </div>
                )}
                {statusErr && (
                  <div style={{
                    marginTop: 12, background: GOV.breachBg, border: `1px solid ${GOV.breach}44`,
                    padding: '8px 12px', fontSize: 12.5, color: GOV.breach,
                  }}>
                    {statusErr}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CaseInvestigationView;
