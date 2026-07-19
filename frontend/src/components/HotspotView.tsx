import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

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

  // Initialise / update the Leaflet map when data arrives
  useEffect(() => {
    if (!data || !mapRef.current) return;

    // Create the map once, centered on Karnataka
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        center: [14.8, 76.3],
        zoom: 7,
        scrollWheelZoom: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(mapInstance.current);

      // Karnataka state + district boundary overlay (official look).
      fetch('https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/states/karnataka.geojson')
        .then((r) => r.json())
        .then((gj) => {
          if (!mapInstance.current) return;
          L.geoJSON(gj, {
            style: { color: '#000000', weight: 1.4, fillColor: '#000000', fillOpacity: 0.03 },
            onEachFeature: (feature, lyr) => {
              const name = feature?.properties?.district;
              if (name) lyr.bindTooltip(name, { sticky: true, opacity: 0.9 });
            },
          }).addTo(mapInstance.current);
        })
        .catch(() => { /* boundary is optional — ignore if unreachable */ });

      layerRef.current = L.layerGroup().addTo(mapInstance.current);
    }

    const layer = layerRef.current!;
    layer.clearLayers();

    const maxCount = Math.max(...data.district_hotspots.map(d => d.count), 1);

    // District hotspot halos (size ~ volume)
    data.district_hotspots.forEach((d) => {
      if (d.lat == null || d.lng == null) return;
      L.circle([d.lat, d.lng], {
        radius: 8000 + (d.count / maxCount) * 45000,
        color: '#e53935', weight: 1, fillColor: '#e53935',
        fillOpacity: 0.12,
      }).addTo(layer).bindTooltip(
        `${localizeDistrict(d.district, language)}: ${d.count} crimes`,
        { permanent: false }
      );
    });

    // Individual incidents as small colored dots
    data.points.forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 4, color: '#fff', weight: 0.6,
        fillColor: colorFor(p.crime_type), fillOpacity: 0.85,
      }).addTo(layer).bindPopup(
        `<b>${p.crime_type}</b><br/>${localizeDistrict(p.district, language)}<br/>FIR: ${p.fir}<br/>${p.date}`
      );
    });

    // Fit to Karnataka bounds — size the container FIRST, then fit, so the
    // zoom is correct (otherwise Leaflet fits to a 0-size viewport and zooms out).
    const b = data.bounds;
    setTimeout(() => {
      if (!mapInstance.current) return;
      mapInstance.current.invalidateSize();
      mapInstance.current.fitBounds(
        [[b.min_lat, b.min_lng], [b.max_lat, b.max_lng]],
        { padding: [20, 20], maxZoom: 9 }
      );
    }, 250);
  }, [data, language]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  const maxCount = data ? Math.max(...data.district_hotspots.map(d => d.count), 1) : 1;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🗺️ {t('Crime Hotspot Map', 'ಅಪರಾಧ ಹಾಟ್‌ಸ್ಪಾಟ್ ನಕ್ಷೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Geographic distribution of', 'ಭೌಗೋಳಿಕ ವಿತರಣೆ')} {data?.total_points ?? 0} {t('crime incidents across Karnataka', 'ಅಪರಾಧ ಘಟನೆಗಳು')}
      </p>

      {error && (
        <div style={{ padding: 20, textAlign: 'center', marginBottom: 16 }}>
          <span style={{ color: '#d32f2f', marginRight: 12 }}>⚠️ {error}</span>
          <button onClick={load} style={btn}>{t('Retry', 'ಮರುಪ್ರಯತ್ನಿಸಿ')}</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Leaflet map */}
        <div style={{ ...card, flex: '1 1 560px', minWidth: 480 }}>
          <div style={cardTitle}>📍 {t('Incident Map — Karnataka', 'ಘಟನೆ ನಕ್ಷೆ — ಕರ್ನಾಟಕ')}</div>
          <div style={{ position: 'relative' }}>
            <div ref={mapRef} style={{ height: 560, width: '100%', borderRadius: 8, border: '1px solid #d0d7de', zIndex: 1 }} />
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)', zIndex: 2 }}>
                ⏳ {t('Loading map...', 'ನಕ್ಷೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
            {t('Dot colour = crime type · red circle = district volume · click a dot for FIR details',
               'ಬಣ್ಣ = ಅಪರಾಧ ಪ್ರಕಾರ · ಕೆಂಪು ವೃತ್ತ = ಜಿಲ್ಲೆ ಪ್ರಮಾಣ · ವಿವರಗಳಿಗೆ ಕ್ಲಿಕ್ ಮಾಡಿ')}
          </div>
        </div>

        {/* Side panels */}
        <div style={{ flex: '1 1 320px', minWidth: 300 }}>
          <div style={card}>
            <div style={cardTitle}>🔥 {t('Top Hotspot Districts', 'ಪ್ರಮುಖ ಹಾಟ್‌ಸ್ಪಾಟ್ ಜಿಲ್ಲೆಗಳು')}</div>
            {(data?.district_hotspots || []).slice(0, 6).map((d, i) => (
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
            {(data?.emerging_surges || []).length === 0 && <div style={{ color: '#999', fontSize: 13 }}>{t('No notable surges.', 'ಗಮನಾರ್ಹ ಏರಿಕೆ ಇಲ್ಲ.')}</div>}
            {(data?.emerging_surges || []).map((s, i) => (
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
