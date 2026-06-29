import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict, localizeCrimeType } from '../locale';

interface Offender {
  person_id: number;
  name: string;
  age: number;
  gender: string;
  district: string;
  cases: number;
  risk_score: number;
  gang_member: boolean;
  crime_types: string[];
}

interface Profile {
  person_id: number;
  name: string;
  demographics: any;
  risk_score: number;
  risk_level: string;
  risk_factors: any;
  primary_modus_operandi: string;
  crime_type_distribution: { label: string; count: number }[];
  total_cases: number;
  case_history: { fir_number: string; crime_type: string; district: string; date: string }[];
  gangs: { gang: string; role: string; activity: string }[];
}

const riskColor = (level: string) => level === 'High' ? '#c62828' : level === 'Medium' ? '#ef6c00' : '#2e7d32';

const ProfilesView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [offenders, setOffenders] = useState<Offender[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/offenders?limit=20');
      const data = await res.json();
      setOffenders(data.offenders || []);
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load offenders.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openProfile = async (id: number) => {
    try {
      const res = await apiFetch(`/api/offenders/${id}`);
      setProfile(await res.json());
    } catch { /* ignore */ }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Computing risk scores...', 'ಅಪಾಯ ಸ್ಕೋರ್ ಲೆಕ್ಕಾಚಾರ...')}</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#d32f2f' }}>⚠️ {error}</div>;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🎯 {t('Offender Profiling & Risk Scoring', 'ಅಪರಾಧಿ ವಿಶ್ಲೇಷಣೆ ಮತ್ತು ಅಪಾಯ ಸ್ಕೋರ್')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Repeat offenders ranked by criminological risk score', 'ಅಪರಾಧಶಾಸ್ತ್ರೀಯ ಅಪಾಯ ಸ್ಕೋರ್ ಪ್ರಕಾರ ಪುನರಾವರ್ತಿತ ಅಪರಾಧಿಗಳು')}
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* List */}
        <div style={{ flex: '1 1 360px', minWidth: 340 }}>
          <div style={card}>
            <div style={cardTitle}>🚩 {t('High-Risk Repeat Offenders', 'ಹೆಚ್ಚು-ಅಪಾಯದ ಪುನರಾವರ್ತಿತ ಅಪರಾಧಿಗಳು')} ({offenders.length})</div>
            {offenders.map((o, i) => (
              <div key={o.person_id} onClick={() => openProfile(o.person_id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 6, cursor: 'pointer', borderBottom: '1px solid #f0f0f0', background: profile?.person_id === o.person_id ? '#e8eaf6' : 'transparent' }}>
                <div style={{ width: 22, fontWeight: 700, color: '#888' }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>👤 {o.name} {o.gang_member && <span title="Gang member">🏴</span>}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{localizeDistrict(o.district, language)} · {o.cases} {t('cases', 'ಪ್ರಕರಣ')}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: o.risk_score >= 70 ? '#c62828' : o.risk_score >= 40 ? '#ef6c00' : '#2e7d32' }}>{o.risk_score}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{t('risk', 'ಅಪಾಯ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Profile detail */}
        <div style={{ flex: '1.4 1 420px', minWidth: 400 }}>
          {!profile ? (
            <div style={{ ...card, padding: 60, textAlign: 'center', color: '#aaa' }}>
              👈 {t('Select an offender to view their profile', 'ವಿವರ ನೋಡಲು ಅಪರಾಧಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ')}
            </div>
          ) : (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a237e' }}>👤 {profile.name}</div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {profile.demographics.age} · {profile.demographics.gender} · {localizeDistrict(profile.demographics.district, language)} · {profile.demographics.occupation}
                  </div>
                </div>
                <div style={{ textAlign: 'center', background: riskColor(profile.risk_level), color: '#fff', borderRadius: 10, padding: '8px 14px' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{profile.risk_score}</div>
                  <div style={{ fontSize: 11 }}>{profile.risk_level} {t('Risk', 'ಅಪಾಯ')}</div>
                </div>
              </div>

              {/* Risk factors (explainable) */}
              <div style={{ background: '#fff3e0', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
                <strong style={{ color: '#e65100' }}>⚖️ {t('Risk Factors', 'ಅಪಾಯ ಅಂಶಗಳು')}</strong>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <span>{t('Cases', 'ಪ್ರಕರಣ')}: <b>{profile.risk_factors.cases_as_accused}</b></span>
                  <span>{t('Severity', 'ತೀವ್ರತೆ')}: <b>{profile.risk_factors.severity_total}</b></span>
                  <span>{t('Gang', 'ಗ್ಯಾಂಗ್')}: <b>{profile.risk_factors.gang_member ? t('Yes', 'ಹೌದು') : t('No', 'ಇಲ್ಲ')}</b></span>
                  <span>{t('Recently active', 'ಇತ್ತೀಚೆಗೆ ಸಕ್ರಿಯ')}: <b>{profile.risk_factors.recent_activity ? t('Yes', 'ಹೌದು') : t('No', 'ಇಲ್ಲ')}</b></span>
                </div>
              </div>

              <div style={{ fontSize: 13, marginBottom: 10 }}>
                <strong>🎭 {t('Primary Modus Operandi', 'ಪ್ರಮುಖ ಕಾರ್ಯವಿಧಾನ')}:</strong>{' '}
                <span style={{ color: '#c62828', fontWeight: 600 }}>{localizeCrimeType(profile.primary_modus_operandi, language)}</span>
              </div>

              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>📊 {t('Crime Pattern', 'ಅಪರಾಧ ಮಾದರಿ')}:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {profile.crime_type_distribution.map((c, i) => (
                    <span key={i} style={{ background: '#e8eaf6', color: '#1a237e', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      {localizeCrimeType(c.label, language)} ×{c.count}
                    </span>
                  ))}
                </div>
              </div>

              {profile.gangs.length > 0 && (
                <div style={{ marginBottom: 10, fontSize: 13 }}>
                  <strong>🏴 {t('Gang Affiliation', 'ಗ್ಯಾಂಗ್ ಸಂಬಂಧ')}:</strong>{' '}
                  {profile.gangs.map((g, i) => <span key={i}>{g.gang} ({g.role}, {g.activity}){i < profile.gangs.length - 1 ? ', ' : ''}</span>)}
                </div>
              )}

              <div>
                <strong style={{ fontSize: 13 }}>🗂️ {t('Case History', 'ಪ್ರಕರಣ ಇತಿಹಾಸ')} ({profile.total_cases}):</strong>
                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 6 }}>
                  {profile.case_history.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                      <span><b>{c.fir_number}</b> — {localizeCrimeType(c.crime_type, language)}, {localizeDistrict(c.district, language)}</span>
                      <span style={{ color: '#999' }}>{c.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };

export default ProfilesView;
