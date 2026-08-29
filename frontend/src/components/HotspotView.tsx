import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch } from '../api';
import { localizeDistrict, localizeCrimeType } from '../locale';
import {
  GOV, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  figure, figureLabel, figureValue, figureSub,
  pageTitle, pageSubTitle,
} from '../govStyles';

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

// Offence-type colours. Unlike a decorative palette, these carry meaning on the
// map, so they are kept - but a KEY is now rendered from this same map. The
// caption previously said "dot colour = crime type" without ever showing which
// colour meant what, which made the encoding unreadable.
const CRIME_COLOR: Record<string, string> = {
  theft: '#e65100', murder: '#b71c1c', robbery: '#bf360c', assault: '#d84315',
  burglary: '#4e342e', snatching: '#f57f17', cheating: '#6a1b9a', forgery: '#283593',
  counterfeiting: '#00695c', rioting: '#c62828',
};
const colorFor = (ct: string) => CRIME_COLOR[ct?.toLowerCase()] || GOV.navy;

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
      setError(e.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.')
        : t('Unable to load geographic data.', 'ಭೌಗೋಳಿಕ ದತ್ತಾಂಶ ಲೋಡ್ ಆಗಲಿಲ್ಲ.'));
    } finally { setLoading(false); }
  };
  // Fetch once on mount; `load` closes over `language` only for the error text.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        color: GOV.breach, weight: 1, fillColor: GOV.breach,
        fillOpacity: 0.1,
      }).addTo(layer).bindTooltip(
        `${localizeDistrict(d.district, language)}: ${d.count} ${language === 'en' ? 'cases' : 'ಪ್ರಕರಣ'}`,
        { permanent: false }
      );
    });

    // Individual incidents as small colored dots
    data.points.forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 4, color: '#fff', weight: 0.6,
        fillColor: colorFor(p.crime_type), fillOpacity: 0.85,
      }).addTo(layer).bindPopup(
        `<b>${localizeCrimeType(p.crime_type, language)}</b><br/>${localizeDistrict(p.district, language)}<br/>${language === 'en' ? 'Crime No' : 'ಅಪರಾಧ ಸಂ'}: ${p.fir}<br/>${p.date}`
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

  const hotspots = data?.district_hotspots || [];
  const surges = data?.emerging_surges || [];
  const maxCount = Math.max(...hotspots.map(d => d.count), 1);
  // Only show a key for offence types actually present on the map.
  const typesPresent = Array.from(
    new Set((data?.points || []).map(p => (p.crime_type || '').toLowerCase()))
  ).filter(Boolean).sort();

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
            {t('Geographic Crime Distribution', 'ಭೌಗೋಳಿಕ ಅಪರಾಧ ಹಂಚಿಕೆ')}
          </h2>
          <div style={pageSubTitle}>
            {t('Incident locations, district concentration and emerging surges',
               'ಘಟನೆ ಸ್ಥಳಗಳು, ಜಿಲ್ಲಾ ಕೇಂದ್ರೀಕರಣ ಮತ್ತು ಉದಯೋನ್ಮುಖ ಏರಿಕೆ')}
          </div>
        </div>
        <div style={{ textAlign: 'right', ...noteText }}>
          <div><strong>{t('Plotted incidents', 'ನಕ್ಷೆಯಲ್ಲಿ')}:</strong> {data?.total_points ?? 0}</div>
          <div>{t('Karnataka state', 'ಕರ್ನಾಟಕ ರಾಜ್ಯ')}</div>
        </div>
      </div>

      {error && (
        <div style={{
          background: GOV.breachBg, border: `1px solid ${GOV.breach}44`, borderRadius: 2,
          padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: GOV.breach,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>{error}</span>
          <button onClick={load} style={{
            background: '#fff', color: GOV.navy, border: `1px solid ${GOV.ruleStrong}`,
            borderRadius: 2, padding: '5px 14px', cursor: 'pointer', fontSize: 11,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            {t('Retry', 'ಮರುಪ್ರಯತ್ನಿಸಿ')}
          </button>
        </div>
      )}

      {/* Key figures */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Incidents plotted', 'ನಕ್ಷೆಯಲ್ಲಿ ಘಟನೆಗಳು')}</div>
          <div style={figureValue}>{(data?.total_points ?? 0).toLocaleString('en-IN')}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Districts with cases', 'ಪ್ರಕರಣವಿರುವ ಜಿಲ್ಲೆಗಳು')}</div>
          <div style={figureValue}>{hotspots.length}</div>
        </div>
        {hotspots[0] && (
          <div style={figure(GOV.breach)}>
            <div style={figureLabel}>{t('Highest concentration', 'ಗರಿಷ್ಠ ಕೇಂದ್ರೀಕರಣ')}</div>
            <div style={{ ...figureValue, fontSize: 20 }}>
              {localizeDistrict(hotspots[0].district, language)}
            </div>
            <div style={figureSub}>{hotspots[0].count} {t('cases', 'ಪ್ರಕರಣ')}</div>
          </div>
        )}
        <div style={figure(surges.length ? GOV.critical : GOV.navy)}>
          <div style={figureLabel}>{t('Emerging surges', 'ಉದಯೋನ್ಮುಖ ಏರಿಕೆ')}</div>
          <div style={{ ...figureValue, color: surges.length ? GOV.critical : GOV.ink }}>
            {surges.length}
          </div>
          <div style={figureSub}>{t('last 90 days', 'ಕಳೆದ 90 ದಿನ')}</div>
        </div>
      </div>

      {/* 1. Map */}
      <div style={panel}>
        <div style={panelHead}>
          1. {t('Incident map — Karnataka', 'ಘಟನೆ ನಕ್ಷೆ — ಕರ್ನಾಟಕ')}
        </div>
        <div style={panelBody}>
          <div style={{ position: 'relative' }}>
            <div ref={mapRef} style={{
              height: 560, width: '100%', border: `1px solid ${GOV.ruleStrong}`, zIndex: 1,
            }} />
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(255,255,255,0.7)', zIndex: 2,
                fontSize: 13, color: GOV.muted,
              }}>
                {t('Loading map...', 'ನಕ್ಷೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}
              </div>
            )}
          </div>

          {/* Key. The map encodes offence type as colour, so the encoding has to
              be stated somewhere - previously it was not. */}
          {typesPresent.length > 0 && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${GOV.rule}`, paddingTop: 9 }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, color: GOV.muted, textTransform: 'uppercase',
                letterSpacing: 0.4, marginBottom: 6,
              }}>
                {t('Key — offence type', 'ಸೂಚಿ — ಅಪರಾಧ ಪ್ರಕಾರ')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 16px' }}>
                {typesPresent.map(ct => (
                  <span key={ct} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: colorFor(ct), border: '1px solid #fff',
                      boxShadow: `0 0 0 1px ${GOV.rule}`, flexShrink: 0,
                    }} />
                    {localizeCrimeType(ct.charAt(0).toUpperCase() + ct.slice(1), language)}
                  </span>
                ))}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: GOV.muted }}>
                  <span style={{
                    width: 11, height: 11, borderRadius: '50%',
                    background: `${GOV.breach}22`, border: `1px solid ${GOV.breach}`, flexShrink: 0,
                  }} />
                  {t('Circle size = district case volume', 'ವೃತ್ತದ ಗಾತ್ರ = ಜಿಲ್ಲೆಯ ಪ್ರಮಾಣ')}
                </span>
              </div>
              <div style={{ ...noteText, marginTop: 7 }}>
                {t('Select any point for the Crime No., offence and date.',
                   'ಅಪರಾಧ ಸಂಖ್ಯೆ ಮತ್ತು ದಿನಾಂಕಕ್ಕಾಗಿ ಯಾವುದೇ ಬಿಂದುವನ್ನು ಕ್ಲಿಕ್ ಮಾಡಿ.')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. District concentration */}
      <div style={panel}>
        <div style={panelHead}>
          2. {t('District case concentration', 'ಜಿಲ್ಲಾವಾರು ಪ್ರಕರಣ ಕೇಂದ್ರೀಕರಣ')}
        </div>
        <div style={panelBody}>
          {hotspots.length === 0 ? (
            <div style={noteText}>{t('No data available.', 'ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.')}</div>
          ) : (
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 30 }}>#</th>
                    <th style={th}>{t('District', 'ಜಿಲ್ಲೆ')}</th>
                    <th style={th}>{t('Cases', 'ಪ್ರಕರಣ')}</th>
                    <th style={th}>{t('Share', 'ಪಾಲು')}</th>
                    <th style={{ ...th, width: '38%' }} />
                  </tr>
                </thead>
                <tbody>
                  {hotspots.map((d, i) => (
                    <tr key={d.district} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                      <td style={{ ...tdNum, color: GOV.faint }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{localizeDistrict(d.district, language)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{d.count}</td>
                      <td style={{ ...tdNum, color: GOV.muted }}>
                        {data?.total_points
                          ? ((d.count / data.total_points) * 100).toFixed(1)
                          : '0.0'}%
                      </td>
                      <td style={td}>
                        <div style={{ height: 9, background: '#e8eaee' }}>
                          <div style={{
                            width: `${Math.max(2, (d.count / maxCount) * 100)}%`,
                            height: '100%',
                            background: i === 0 ? GOV.breach : GOV.navy,
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 3. Emerging surges */}
      <div style={panel}>
        <div style={panelHead}>
          3. {t('Emerging surges — last 90 days', 'ಉದಯೋನ್ಮುಖ ಏರಿಕೆ — ಕಳೆದ 90 ದಿನ')}
        </div>
        <div style={panelBody}>
          <div style={{ ...noteText, marginBottom: 10 }}>
            {t('Districts where the last 90 days exceed the preceding comparable period.',
               'ಕಳೆದ 90 ದಿನಗಳು ಹಿಂದಿನ ಅವಧಿಯನ್ನು ಮೀರಿದ ಜಿಲ್ಲೆಗಳು.')}
          </div>
          {surges.length === 0 ? (
            <div style={noteText}>{t('No notable surges in the period.', 'ಈ ಅವಧಿಯಲ್ಲಿ ಗಮನಾರ್ಹ ಏರಿಕೆ ಇಲ್ಲ.')}</div>
          ) : (
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{t('District', 'ಜಿಲ್ಲೆ')}</th>
                    <th style={th}>{t('Preceding period', 'ಹಿಂದಿನ ಅವಧಿ')}</th>
                    <th style={th}>{t('Last 90 days', 'ಕಳೆದ 90 ದಿನ')}</th>
                    <th style={th}>{t('Increase', 'ಏರಿಕೆ')}</th>
                    <th style={th}>{t('Change', 'ಬದಲಾವಣೆ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {surges.map((s, i) => (
                    <tr key={s.district} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{localizeDistrict(s.district, language)}</td>
                      <td style={tdNum}>{s.previous}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{s.recent}</td>
                      <td style={{ ...tdNum, color: GOV.breach, fontWeight: 700 }}>+{s.change}</td>
                      <td style={{ ...tdNum, color: GOV.breach }}>+{s.pct_change}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...noteText, textAlign: 'center', paddingTop: 6 }}>
        {t('Base map \u00A9 OpenStreetMap contributors. Incident coordinates are as recorded on the FIR.',
           'ಮೂಲ ನಕ್ಷೆ \u00A9 OpenStreetMap. ಘಟನೆ ನಿರ್ದೇಶಾಂಕಗಳು FIR ನಲ್ಲಿ ದಾಖಲಾದಂತೆ.')}
      </div>
    </div>
  );
};

export default HotspotView;
