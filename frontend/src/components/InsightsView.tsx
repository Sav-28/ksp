import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

interface LabelCount { label: string; count: number; }
interface SocioData {
  by_age_band: LabelCount[];
  by_gender: LabelCount[];
  by_socio_economic: LabelCount[];
  by_education: LabelCount[];
  by_occupation: LabelCount[];
  by_urbanization: LabelCount[];
  social_risk_factors: { factor: string; finding: string }[];
  insights: { highest_risk_ses: string; most_common_age_band: string; urban_share_pct: number; total_accused_records: number };
}

const PALETTE = ['#1a237e', '#283593', '#3949ab', '#5c6bc0', '#7986cb', '#ff9800', '#fb8c00', '#e65100'];

const Bars = ({ title, icon, data }: { title: string; icon: string; data: LabelCount[] }) => {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={card}>
      <div style={cardTitle}>{icon} {title}</div>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 110, fontSize: 13, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
          <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 20 }}>
            <div style={{ width: `${(d.count / max) * 100}%`, height: '100%', background: PALETTE[i % PALETTE.length], borderRadius: 4 }} />
          </div>
          <div style={{ width: 32, fontSize: 13, fontWeight: 700, color: '#1a237e' }}>{d.count}</div>
        </div>
      ))}
    </div>
  );
};

const InsightsView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [data, setData] = useState<SocioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/sociological');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load insights.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Loading insights...', 'ಒಳನೋಟಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ...')}</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#d32f2f' }}>⚠️ {error}</div>;
  if (!data) return null;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🧭 {t('Sociological Crime Insights', 'ಸಾಮಾಜಿಕ ಅಪರಾಧ ಒಳನೋಟಗಳು')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Demographic & socio-economic profile of accused persons', 'ಆರೋಪಿಗಳ ಜನಸಂಖ್ಯಾ ಮತ್ತು ಸಾಮಾಜಿಕ-ಆರ್ಥಿಕ ವಿವರ')}
      </p>

      {/* Insight banner */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={insightCard}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Most common age band', 'ಸಾಮಾನ್ಯ ವಯಸ್ಸಿನ ಶ್ರೇಣಿ')}</div>
          <div style={insightVal}>{data.insights.most_common_age_band}</div>
        </div>
        <div style={insightCard}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Highest-share socio-economic band', 'ಹೆಚ್ಚಿನ ಪಾಲಿನ ಸಾಮಾಜಿಕ-ಆರ್ಥಿಕ ವರ್ಗ')}</div>
          <div style={insightVal}>{data.insights.highest_risk_ses}</div>
        </div>
        <div style={insightCard}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('Accused records analysed', 'ವಿಶ್ಲೇಷಿಸಿದ ಆರೋಪಿ ದಾಖಲೆಗಳು')}</div>
          <div style={insightVal}>{data.insights.total_accused_records}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <Bars title={t('By Age Band', 'ವಯಸ್ಸಿನ ಪ್ರಕಾರ')} icon="🎂" data={data.by_age_band} />
        <Bars title={t('By Gender', 'ಲಿಂಗದ ಪ್ರಕಾರ')} icon="⚧" data={data.by_gender} />
        <Bars title={t('By Socio-Economic Status', 'ಸಾಮಾಜಿಕ-ಆರ್ಥಿಕ ಸ್ಥಿತಿ')} icon="💰" data={data.by_socio_economic} />
        <Bars title={t('By Education', 'ಶಿಕ್ಷಣದ ಪ್ರಕಾರ')} icon="🎓" data={data.by_education} />
        <Bars title={t('By Occupation', 'ಉದ್ಯೋಗದ ಪ್ರಕಾರ')} icon="💼" data={data.by_occupation} />
        {data.by_urbanization && <Bars title={t('By Urbanization', 'ನಗರೀಕರಣದ ಪ್ರಕಾರ')} icon="🏙️" data={data.by_urbanization} />}
      </div>

      {/* Social risk factor correlations (Area 4) */}
      {data.social_risk_factors && data.social_risk_factors.length > 0 && (
        <div style={{ ...card, marginTop: 20 }}>
          <div style={cardTitle}>⚠️ {t('Social Risk Factors', 'ಸಾಮಾಜಿಕ ಅಪಾಯ ಅಂಶಗಳು')}</div>
          {data.social_risk_factors.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < data.social_risk_factors.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ minWidth: 130, fontWeight: 600, color: '#1a237e', fontSize: 13 }}>{f.factor}</div>
              <div style={{ fontSize: 13, color: '#444' }}>{f.finding}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
        ℹ️ {t('Insights are statistical correlations from recorded data, not determinants of criminality.', 'ಒಳನೋಟಗಳು ದಾಖಲಾದ ಡೇಟಾದಿಂದ ಸಂಖ್ಯಾಶಾಸ್ತ್ರೀಯ ಸಹಸಂಬಂಧಗಳಾಗಿವೆ.')}
      </div>
    </div>
  );
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };
const insightCard: React.CSSProperties = { ...card, flex: '1 1 200px', borderTop: '4px solid #ff9800' };
const insightVal: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: '#1a237e', marginTop: 4 };

export default InsightsView;
