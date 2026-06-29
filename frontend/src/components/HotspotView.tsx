import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api';
import { localizeDistrict } from '../locale';

interface CrimePoint { lat: number; lng: number; district: string; crime_type: string; fir: string; date: string; }
interface DistrictHotspot { district: string; count: number; lat: number; lng: number; }
interface Surge { district: string; recent: number; previous: number; change: number; pct_change: number; }
interface HotspotData {
  total_points: number;
  points: CrimePoint[];
  district_hotspots: DistrictHotspot[];
  emerging_surges: Surge[];
  bounds: { min_lat: number; max_lat: number; min_lng: number; max_lng: number };
}

const CRIME_COLOR: Record<string, string> = {
  theft: '#e65100', murder: '#b71c1c', robbery: '#bf360c', assault: '#d84315',
  burglary: '#4e342e', snatching: '#f57f17', cheating: '#6a1b9a', forgery: '#283593',
  counterfeiting: '#00695c', rioting: '#c62828',
};
const colorFor = (ct: string) => CRIME_COLOR[ct?.toLowerCase()] || '#1a237e';

const HotspotView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [data, setData] = useState<HotspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/hotspots');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load hotspot data.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const W = 560, H = 620, PAD = 30;

  // Project lat/lng to SVG coordinates (simple equirectangular within bounds)
  const project = useMemo(() => {
    if (!data) return (_lat: number, _lng: number) => ({ x: 0, y: 0 });
    const b = data.bounds;
    const latRange = (b.max_lat - b.min_lat) || 1;
    const lngRange = (b.max_lng - b.min_lng) || 1;
    return (lat: number, lng: number) => ({
      x: PAD + ((lng - b.min_lng) / lngRange) * (W - 2 * PAD),
      // invert lat (north is up)
      y: PAD + ((b.max_lat - lat) / latRange) * (H - 2 * PAD),
    });
  }, [data]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Loading hotspot map...', 'ಹಾಟ್‌ಸ್ಪಾಟ್ ನಕ್ಷೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}</div>;
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ color: '#d32f2f', marginBottom: 16 }}>⚠️ {error}</div>
      <button onClick={load} style={btn}>{t('Retry', 'ಮರುಪ್ರಯತ್ನಿಸಿ')}</button>
    </div>
  );
  if (!data) return null;

  const maxCount = Math.max(...data.district_hotspots.map(d => d.count), 1);

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🗺️ {t('Crime Hotspot Map', 'ಅಪರಾಧ ಹಾಟ್‌ಸ್ಪಾಟ್ ನಕ್ಷೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Geographic distribution of', 'ಭೌಗೋಳಿಕ ವಿತರಣೆ')} {data.total_points} {t('crime incidents across Karnataka', 'ಅಪರಾಧ ಘಟನೆಗಳು')}
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Map */}
        <div style={{ ...card, flex: '1 1 560px' }}>
          <div style={cardTitle}>📍 {t('Incident Map (by location)', 'ಘಟನೆ ನಕ್ಷೆ (ಸ್ಥಳದ ಪ್ರಕಾರ)')}</div>
          <svg width={W} height={H} style={{ background: '#eef3f8', borderRadius: 8, border: '1px solid #d0d7de', maxWidth: '100%' }}>
            {/* district centroids as soft halos */}
            {data.district_hotspots.map((d, i) => {
              const { x, y } = project(d.lat, d.lng);
              const r = 12 + (d.count / maxCount) * 38;
              return <circle key={`h${i}`} cx={x} cy={y} r={r} fill="#1a237e" opacity={0.08} />;
            })}
            {/* individual incidents */}
            {data.points.map((p, i) => {
              const { x, y } = project(p.lat, p.lng);
              return <circle key={i} cx={x} cy={y} r={3} fill={colorFor(p.crime_type)} opacity={0.7}>
                <title>{p.crime_type} — {p.district} ({p.fir})</title>
              </circle>;
            })}
            {/* district labels */}
            {data.district_hotspots.map((d, i) => {
              const { x, y } = project(d.lat, d.lng);
              return <text key={`l${i}`} x={x} y={y} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1a237e">
                {localizeDistrict(d.district, language)}
              </text>;
            })}
          </svg>
          <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
            {t('Dot colour = crime type · halo size = district volume', 'ಬಣ್ಣ = ಅಪರಾಧ ಪ್ರಕಾರ · ಗಾತ್ರ = ಜಿಲ್ಲೆ ಪ್ರಮಾಣ')}
          </div>
        </div>

        {/* Side panels */}
        <div style={{ flex: '1 1 340px', minWidth: 320 }}>
          <div style={card}>
            <div style={cardTitle}>🔥 {t('Top Hotspot Districts', 'ಪ್ರಮುಖ ಹಾಟ್‌ಸ್ಪಾಟ್ ಜಿಲ್ಲೆಗಳು')}</div>
            {data.district_hotspots.slice(0, 6).map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 110, fontSize: 13, fontWeight: 500 }}>{localizeDistrict(d.district, language)}</div>
                <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 18 }}>
                  <div style={{ width: `${(d.count / maxCount) * 100}%`, height: '100%', background: '#e53935', borderRadius: 4 }} />
                </div>
                <div style={{ width: 30, fontSize: 13, fontWeight: 700, color: '#c62828' }}>{d.count}</div>
              </div>
            ))}
          </div>

          <div style={{ ...card, marginTop: 16 }}>
            <div style={cardTitle}>📈 {t('Emerging Surges (last 90 days)', 'ಉದಯೋನ್ಮುಖ ಏರಿಕೆ (ಕಳೆದ 90 ದಿನ)')}</div>
            {data.emerging_surges.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>{t('No notable surges.', 'ಗಮನಾರ್ಹ ಏರಿಕೆ ಇಲ್ಲ.')}</div>}
            {data.emerging_surges.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                <span>⚠️ {localizeDistrict(s.district, language)}</span>
                <span style={{ color: '#e53935', fontWeight: 600 }}>+{s.change} ({s.pct_change}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };
const btn: React.CSSProperties = { backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 600 };

export default HotspotView;
