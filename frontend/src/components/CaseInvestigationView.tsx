import React, { useState } from 'react';
import { apiFetch } from '../api';
import {
  localizeDistrict, localizeCrimeType, localizePersonName, localizePlace, localizeDescription,
} from '../locale';

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

  const investigate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = fir.trim();
    if (!q) return;
    setLoading(true); setError(null); setDetail(null);
    try {
      const res = await apiFetch(`/api/crime/${encodeURIComponent(q)}`);
      if (res.status === 404) {
        setError(t(`No case found with Crime No ${q}.`, `${q} ಸಂಖ್ಯೆಯ ಪ್ರಕರಣ ಸಿಗಲಿಲ್ಲ.`));
        return;
      }
      setDetail(await res.json());
    } catch (err: any) {
      setError(err.message === 'UNAUTHORIZED'
        ? t('Session expired. Please log in again.', 'ಸೆಷನ್ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.')
        : t('Unable to load the case.', 'ಪ್ರಕರಣ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.'));
    } finally { setLoading(false); }
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
          {/* Case header */}
          <Section title={`${localizeCrimeType(detail.crime_type, language)} · ${detail.fir_number}`} accent="#1a237e">
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

          {/* Location */}
          <Section title={t('Incident Location', 'ಘಟನೆ ಸ್ಥಳ')} accent="#00695c">
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
const Section = ({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderTop: `4px solid ${accent}`, borderRadius: 8, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
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
