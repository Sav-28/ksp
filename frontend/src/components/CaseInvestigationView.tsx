import React, { useState } from 'react';
import { apiFetch, getUser } from '../api';
import {
  localizeDistrict, localizeCrimeType, localizePersonName, localizePlace, localizeDescription,
} from '../locale';

const ALL_STATUSES = [
  'Registered', 'Under Investigation', 'Chargesheet Filed', 'Closed', 'Convicted', 'Acquitted',
];
const TERMINAL_STATUSES = ['Closed', 'Convicted', 'Acquitted'];

interface PersonBrief {
  id: number; name: string; age?: number; gender?: string;
  district?: string; occupation?: string; risk_score?: number;
}
interface Police {
  crime_no?: string; case_no?: string; registered_date?: string;
  category?: string; gravity?: string; case_status?: string;
  police_station?: string; officer?: string; officer_rank?: string;
  officer_designation?: string; court?: string;
  incident_from?: string; incident_to?: string; info_received?: string;
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
        ? t('Session expired. Please log in again.', 'ಸೆಷನ್ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.')
        : t('Unable to load the case.', 'ಪ್ರಕರಣ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.'));
    } finally { setLoading(false); }
  };

  const updateStatus = async () => {
    if (!detail) return;
    setStatusErr(null); setStatusMsg(null);
    const isTerminal = TERMINAL_STATUSES.includes(newStatus);
    if (isTerminal && !canCloseCase) {
      setStatusErr(t('Closing a case requires a supervisor or admin.',
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
        setStatusErr(data.detail || t('You are not authorized for this action.', 'ಈ ಕ್ರಿಯೆಗೆ ಅಧಿಕಾರವಿಲ್ಲ.'));
      } else {
        setStatusErr(data.detail || t('Update failed.', 'ನವೀಕರಣ ವಿಫಲವಾಗಿದೆ.'));
      }
    } catch (err: any) {
      setStatusErr(err.message === 'UNAUTHORIZED'
        ? t('Session expired. Please log in again.', 'ಸೆಷನ್ ಮುಗಿದಿದೆ.')
        : t('Update failed.', 'ನವೀಕರಣ ವಿಫಲವಾಗಿದೆ.'));
    } finally { setUpdating(false); }
  };

  const p = detail?.police || {};
  const inv = detail?.investigation || {};
  const loc = detail?.location || {};

  return (
    <div style={{ padding: '30px 40px', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🕵️ {t('Case Investigation', 'ಪ್ರಕರಣ ತನಿಖೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Enter a Crime No (FIR) to view the full case dossier — accused, victims, location and police details.',
           'ಪೂರ್ಣ ಪ್ರಕರಣ ವಿವರಗಳನ್ನು ನೋಡಲು ಕ್ರೈಮ್ ಸಂಖ್ಯೆ (ಎಫ್‌ಐಆರ್) ನಮೂದಿಸಿ.')}
      </p>

      <form onSubmit={investigate} style={{ display: 'flex', gap: 10, marginBottom: 24, maxWidth: 620 }}>
        <input
          value={fir}
          onChange={(e) => setFir(e.target.value)}
          placeholder={t('e.g. 100020006202500004', 'ಉದಾ. 100020006202500004')}
          style={{
            flex: 1, padding: '12px 14px', fontSize: 15, border: '1px solid #c0c8d0',
            borderRadius: 8, fontFamily: 'monospace',
          }}
        />
        <button type="submit" disabled={loading} style={{
          backgroundColor: '#1a237e', color: '#fff', border: 'none', borderRadius: 8,
          padding: '12px 26px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          {loading ? t('Searching…', 'ಹುಡುಕಲಾಗುತ್ತಿದೆ…') : t('Investigate', 'ತನಿಖೆ')}
        </button>
      </form>

      {error && (
        <div style={{ color: '#c62828', background: '#ffebee', padding: '12px 16px', borderRadius: 8, maxWidth: 620 }}>
          ⚠️ {error}
        </div>
      )}

      {detail && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}>
          {/* Case header */}
          <Section title={`${localizeCrimeType(detail.crime_type, language)} · ${detail.fir_number}`} accent="#1a237e" full>
            <Grid>
              <Field label={t('Crime No', 'ಕ್ರೈಮ್ ಸಂಖ್ಯೆ')} value={p.crime_no || detail.fir_number} mono />
              <Field label={t('Case No', 'ಪ್ರಕರಣ ಸಂಖ್ಯೆ')} value={p.case_no} mono />
              <Field label={t('Category', 'ವರ್ಗ')} value={p.category} />
              <Field label={t('Gravity', 'ಗಂಭೀರತೆ')} value={p.gravity} />
              <Field label={t('Registered', 'ನೋಂದಣಿ')} value={p.registered_date || detail.date_occurred} />
              <Field label={t('Status', 'ಸ್ಥಿತಿ')} value={p.case_status || inv.status} />
            </Grid>
            {detail.description && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#555', background: '#fafafa', padding: '8px 10px', borderRadius: 6 }}>
                📝 {localizeDescription(detail.description, language)}
              </div>
            )}
          </Section>

          {/* Case status management — role-gated (investigator/supervisor/admin) */}
          {canUpdateCase && (
            <Section title={t('Update Case Status', 'ಪ್ರಕರಣ ಸ್ಥಿತಿ ನವೀಕರಿಸಿ')} accent="#6a1b9a" full>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{t('Status', 'ಸ್ಥಿತಿ')}</label>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                    style={{ padding: '9px 11px', border: '1px solid #cfd8dc', borderRadius: 6, fontSize: 14, minWidth: 200 }}>
                    {ALL_STATUSES.map((s) => {
                      const terminal = TERMINAL_STATUSES.includes(s);
                      const locked = terminal && !canCloseCase;
                      return (
                        <option key={s} value={s} disabled={locked}>
                          {s}{locked ? ` — ${t('supervisor only', 'ಮೇಲ್ವಿಚಾರಕ ಮಾತ್ರ')}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {TERMINAL_STATUSES.includes(newStatus) && canCloseCase && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{t('Outcome (optional)', 'ಫಲಿತಾಂಶ (ಐಚ್ಛಿಕ)')}</label>
                    <input value={outcome} onChange={(e) => setOutcome(e.target.value)}
                      placeholder={t('e.g. Solved / Chargesheeted', 'ಉದಾ. ಪರಿಹರಿಸಲಾಗಿದೆ')}
                      style={{ padding: '9px 11px', border: '1px solid #cfd8dc', borderRadius: 6, fontSize: 14, minWidth: 200 }} />
                  </div>
                )}
                <button onClick={updateStatus} disabled={updating}
                  style={{ background: TERMINAL_STATUSES.includes(newStatus) ? '#c62828' : '#6a1b9a', color: '#fff',
                           border: 'none', borderRadius: 6, padding: '10px 22px', fontSize: 14, fontWeight: 600,
                           cursor: updating ? 'default' : 'pointer', opacity: updating ? 0.6 : 1 }}>
                  {updating ? t('Saving…', 'ಉಳಿಸಲಾಗುತ್ತಿದೆ…')
                    : TERMINAL_STATUSES.includes(newStatus) ? '🔒 ' + t('Close Case', 'ಪ್ರಕರಣ ಮುಚ್ಚಿ')
                    : '💾 ' + t('Update Status', 'ಸ್ಥಿತಿ ನವೀಕರಿಸಿ')}
                </button>
              </div>
              {!canCloseCase && (
                <div style={{ fontSize: 11, color: '#90a4ae', marginTop: 8 }}>
                  {t('Note: closing a case (Closed / Convicted / Acquitted) requires a supervisor or admin.',
                     'ಸೂಚನೆ: ಪ್ರಕರಣ ಮುಚ್ಚಲು ಮೇಲ್ವಿಚಾರಕ ಅಥವಾ ನಿರ್ವಾಹಕ ಅಗತ್ಯ.')}
                </div>
              )}
              {statusMsg && <div style={{ marginTop: 10, color: '#2e7d32', fontSize: 13 }}>✅ {statusMsg}</div>}
              {statusErr && <div style={{ marginTop: 10, color: '#c62828', fontSize: 13 }}>⚠️ {statusErr}</div>}
            </Section>
          )}

          {/* Location */}
          <Section title={t('Incident Location', 'ಘಟನೆ ಸ್ಥಳ')} accent="#00695c" full>
            <Grid>
              <Field label={t('District', 'ಜಿಲ್ಲೆ')} value={localizeDistrict(detail.district, language)} />
              <Field label={t('Place / Station area', 'ಸ್ಥಳ')} value={localizePlace(detail.police_station, language)} />
              <Field label={t('Latitude', 'ಅಕ್ಷಾಂಶ')} value={loc.latitude != null ? String(loc.latitude) : undefined} mono />
              <Field label={t('Longitude', 'ರೇಖಾಂಶ')} value={loc.longitude != null ? String(loc.longitude) : undefined} mono />
              <Field label={t('Incident from', 'ಘಟನೆ ಆರಂಭ')} value={p.incident_from} />
              <Field label={t('Incident to', 'ಘಟನೆ ಅಂತ್ಯ')} value={p.incident_to} />
              <Field label={t('Info received at PS', 'ಠಾಣೆಗೆ ಮಾಹಿತಿ')} value={p.info_received} />
            </Grid>
            {loc.latitude != null && loc.longitude != null && (
              <div style={{ marginTop: 12 }}>
                {/* Interactive map centered on the incident location */}
                <iframe
                  title="incident-location-map"
                  width="100%"
                  height="260"
                  loading="lazy"
                  style={{ border: '1px solid #d0d7de', borderRadius: 8 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${loc.longitude - 0.012}%2C${loc.latitude - 0.008}%2C${loc.longitude + 0.012}%2C${loc.latitude + 0.008}&layer=mapnik&marker=${loc.latitude}%2C${loc.longitude}`}
                />
                <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 13, color: '#fff', background: '#1a73e8', padding: '7px 14px', borderRadius: 6, fontWeight: 600, textDecoration: 'none' }}>
                    🧭 {t('Get Directions', 'ದಿಕ್ಕುಗಳನ್ನು ಪಡೆಯಿರಿ')}
                  </a>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=15/${loc.latitude}/${loc.longitude}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 13, color: '#1976d2', alignSelf: 'center' }}>
                    🗺️ {t('Open full map', 'ಪೂರ್ಣ ನಕ್ಷೆ ತೆರೆಯಿರಿ')}
                  </a>
                </div>
              </div>
            )}
          </Section>

          {/* Police / court */}
          <Section title={t('Police & Court', 'ಪೊಲೀಸ್ ಮತ್ತು ನ್ಯಾಯಾಲಯ')} accent="#1565c0">
            <Grid>
              <Field label={t('Police Station', 'ಪೊಲೀಸ್ ಠಾಣೆ')} value={p.police_station || detail.police_station} />
              <Field label={t('Investigating Officer', 'ತನಿಖಾ ಅಧಿಕಾರಿ')} value={p.officer || inv.officer} />
              <Field label={t('Rank', 'ಹುದ್ದೆ')} value={p.officer_rank} />
              <Field label={t('Designation', 'ಪದನಾಮ')} value={p.officer_designation} />
              <Field label={t('Court', 'ನ್ಯಾಯಾಲಯ')} value={p.court} />
              <Field label="IPC" value={inv.ipc_sections} />
              <Field label={t('Arrest made', 'ಬಂಧನ')} value={inv.arrest_made ? t('Yes', 'ಹೌದು') : t('No', 'ಇಲ್ಲ')} />
              <Field label={t('Outcome', 'ಫಲಿತಾಂಶ')} value={inv.outcome} />
            </Grid>
          </Section>

          {/* People */}
          <Section title={`${t('Accused', 'ಆರೋಪಿ')} (${detail.accused.length})`} accent="#c62828">
            <People people={detail.accused} language={language} empty={t('No accused recorded.', 'ಆರೋಪಿ ಇಲ್ಲ.')} />
          </Section>
          <Section title={`${t('Victims', 'ಸಂತ್ರಸ್ತರು')} (${detail.victims.length})`} accent="#1976d2">
            <People people={detail.victims} language={language} empty={t('No victims recorded.', 'ಸಂತ್ರಸ್ತರು ಇಲ್ಲ.')} />
          </Section>
          {detail.witnesses.length > 0 && (
            <Section title={`${t('Witnesses', 'ಸಾಕ್ಷಿಗಳು')} (${detail.witnesses.length})`} accent="#00897b">
              <People people={detail.witnesses} language={language} empty="" />
            </Section>
          )}
        </div>
      )}
    </div>
  );
};

// --- small presentational helpers -----------------------------------------
const Section = ({ title, accent, children, full }: { title: string; accent: string; children: React.ReactNode; full?: boolean }) => (
  <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderTop: `4px solid ${accent}`, borderRadius: 8, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', gridColumn: full ? '1 / -1' : undefined }}>
    <div style={{ fontWeight: 700, color: accent, fontSize: 15, marginBottom: 10 }}>{title}</div>
    {children}
  </div>
);
const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 18px' }}>{children}</div>
);
const Field = ({ label, value, mono }: { label: string; value?: string; mono?: boolean }) => (
  <div style={{ fontSize: 13 }}>
    <span style={{ color: '#888' }}>{label}: </span>
    <span style={{ color: '#222', fontWeight: 500, fontFamily: mono ? 'monospace' : undefined }}>{value || '—'}</span>
  </div>
);
const People = ({ people, language, empty }: { people: PersonBrief[]; language: 'en' | 'kn'; empty: string }) => {
  if (!people.length) return <span style={{ color: '#999', fontSize: 13 }}>{empty}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {people.map((p) => (
        <div key={p.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: '8px 12px', fontSize: 13, minWidth: 180 }}>
          <div style={{ fontWeight: 600 }}>👤 {localizePersonName(p.name, language)}</div>
          <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
            {[p.age ? `${p.age}` : null, p.gender, p.district ? localizeDistrict(p.district, language) : null,
              p.occupation].filter(Boolean).join(' · ')}
          </div>
          {p.risk_score != null && p.risk_score > 0 && (
            <div style={{ fontSize: 12, marginTop: 2, color: p.risk_score >= 70 ? '#c62828' : p.risk_score >= 40 ? '#ef6c00' : '#2e7d32' }}>
              Risk: {p.risk_score}/100
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CaseInvestigationView;
