import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch, getUser, API_BASE } from '../api';

// Karnataka geographic center (fallback map view before a district is picked).
const KARNATAKA_CENTER: [number, number] = [15.3173, 75.7139];

// Distance (km) beyond the district HQ at which we warn the officer that the
// pin looks outside the selected district's jurisdiction.
const JURISDICTION_WARN_KM = 50;

// Great-circle distance between two lat/long points, in kilometres.
const haversineKm = (la1: number, lo1: number, la2: number, lo2: number): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1);
  const dLo = toRad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const PIN_ICON = L.divIcon({
  html: '<div style="font-size:26px;line-height:26px">📍</div>',
  className: 'ksp-pin', iconSize: [26, 26], iconAnchor: [13, 26],
});

/**
 * REGISTER FIR — the platform's write workflow (Area 10, role-gated).
 * Investigators / officers / supervisors / admins can register a new FIR with
 * its crime details, investigation metadata, and the people involved.
 */

interface RefData {
  districts: string[];
  district_coords: Record<string, { latitude: number; longitude: number }>;
  police_stations: Record<string, string[]>;
  crime_types: { name: string; ipc: string }[];
  investigation_statuses: string[];
  officer_ranks: string[];
  officer_designations: string[];
  person_roles: string[];
  gang_roles: string[];
  genders: string[];
  education_levels: string[];
  socio_economic_statuses: string[];
}

// Shape of POST /api/narrative/analyse. Every field is a SUGGESTION: the officer
// applies or ignores each one. Nothing here is written to the FIR automatically.
interface NarrativeAnalysis {
  entities: {
    persons: string[];
    places: string[];
    organisations: string[];
    vehicles: string[];
    valuables: string[];
    money: { token: string; value: number }[];
    dates: string[];
    times: string[];
  };
  suggested_crime_type: string | null;
  suggested_ipc: string | null;
  suggested_district: string | null;
  keywords: string[];
  keyphrases: string[];
  sentiment: { label: string; score: number; sentences_analysed: number } | null;
  engine: string;
  engine_note: string;
  advisory: string;
}

interface PersonRow {
  role: string;
  full_name: string;
  district: string;
  age: string;
  gender: string;
  occupation: string;
  education_level: string;
  socio_economic_status: string;
  phone_masked: string;
  photo: string; // base64 data URL, '' if none
  gang_name: string; // organized group (accused); '' if none
  gang_role: string; // Leader / Member / Associate
}

const emptyPerson = (role = 'accused'): PersonRow => ({
  role, full_name: '', district: '', age: '', gender: '',
  occupation: '', education_level: '', socio_economic_status: '', phone_masked: '', photo: '',
  gang_name: '', gang_role: 'Member',
});

// Read an image file, downscale to maxDim, and return a compressed JPEG data URL.
// Keeps the payload small (photos are stored in the DB) and normalizes format.
const fileToResizedDataUrl = (file: File, maxDim = 400, quality = 0.8): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('not an image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no canvas'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

const RegisterFIRView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const user = getUser();

  const [ref, setRef] = useState<RefData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Crime fields
  const [crimeType, setCrimeType] = useState('');
  const [district, setDistrict] = useState('');
  const [policeStation, setPoliceStation] = useState('');
  const [dateOccurred, setDateOccurred] = useState('');
  const [description, setDescription] = useState('');

  // Statement analysis (Catalyst Zia, with a rule-based fallback). Kept entirely
  // separate from the form state: applying a suggestion is an explicit click.
  const [analysis, setAnalysis] = useState<NarrativeAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [ipcSections, setIpcSections] = useState('');
  const [io, setIo] = useState('');
  const [ioRank, setIoRank] = useState('Police Inspector');
  const [ioDesignation, setIoDesignation] = useState('Investigating Officer');
  const [statusVal, setStatusVal] = useState('Registered');
  const [arrestMade, setArrestMade] = useState(false);

  const [persons, setPersons] = useState<PersonRow[]>([emptyPerson('complainant')]);
  // Known gangs (for the accused gang autocomplete datalist).
  const [gangs, setGangs] = useState<{ id: number; name: string; activity?: string }[]>([]);

  // Precise crime location (picked on the map / geocoded / GPS).
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Jurisdiction check: distance (km) from the selected district when the pin
  // looks far outside it, plus the officer's explicit confirmation to proceed.
  const [jurisdictionKm, setJurisdictionKm] = useState<number | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Drop/move the marker and record the coordinates.
  const placeMarker = (la: number, lo: number, zoom?: number) => {
    setLat(la); setLng(lo);
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) markerRef.current.setLatLng([la, lo]);
    else markerRef.current = L.marker([la, lo], { icon: PIN_ICON }).addTo(map);
    map.setView([la, lo], zoom ?? map.getZoom());
  };

  // Initialize the Leaflet map once the reference data (and the map div) exist.
  useEffect(() => {
    if (!ref || !mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current).setView(KARNATAKA_CENTER, 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => placeMarker(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    // Leaflet needs a size recalculation when mounted inside a flex/tab layout.
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recenter to the chosen district (helps the officer zoom to the right area).
  useEffect(() => {
    const map = mapRef.current;
    if (map && district && ref?.district_coords[district]) {
      const c = ref.district_coords[district];
      if (lat == null) map.setView([c.latitude, c.longitude], 12);
    }
  }, [district]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jurisdiction check: recompute whenever the pin or district changes. Warns
  // (but doesn't block) if the location is far from the selected district.
  useEffect(() => {
    setLocationConfirmed(false);
    if (lat == null || lng == null || !district || !ref?.district_coords[district]) {
      setJurisdictionKm(null);
      return;
    }
    const c = ref.district_coords[district];
    const km = haversineKm(lat, lng, c.latitude, c.longitude);
    setJurisdictionKm(km > JURISDICTION_WARN_KM ? Math.round(km) : null);
  }, [lat, lng, district, ref]);

  // Fetch up to 5 location suggestions (debounced) for the autocomplete dropdown.
  const fetchSuggestions = async (q: string) => {
    try {
      const full = district ? `${q}, ${district}, Karnataka, India` : `${q}, Karnataka, India`;
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=${encodeURIComponent(full)}`);
      const arr = await r.json();
      setSuggestions((arr || []).map((a: any) => ({
        name: a.display_name, lat: parseFloat(a.lat), lon: parseFloat(a.lon),
      })));
    } catch { setSuggestions([]); }
  };

  const onPlaceQueryChange = (v: string) => {
    setPlaceQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (v.trim().length < 3) { setSuggestions([]); return; }
    searchTimer.current = setTimeout(() => fetchSuggestions(v.trim()), 400);
  };

  const pickSuggestion = (s: { name: string; lat: number; lon: number }) => {
    setPlaceQuery(s.name);
    setSuggestions([]);
    placeMarker(s.lat, s.lon, 16);
  };

  // Geocode a landmark/address (OpenStreetMap Nominatim) → drop the pin. Used by
  // the Locate button / Enter key. Prefers the first suggestion if available.
  const geocode = async () => {
    const q = placeQuery.trim();
    if (!q) return;
    if (suggestions.length) { pickSuggestion(suggestions[0]); return; }
    setGeocoding(true); setError(null);
    try {
      const full = district ? `${q}, ${district}, Karnataka, India` : `${q}, Karnataka, India`;
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(full)}`);
      const arr = await r.json();
      if (arr && arr.length) {
        placeMarker(parseFloat(arr[0].lat), parseFloat(arr[0].lon), 16);
      } else {
        setError(t('Location not found — try a nearby landmark or click on the map.',
                   'ಸ್ಥಳ ಸಿಗಲಿಲ್ಲ — ಹತ್ತಿರದ ಸ್ಥಳ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ನಕ್ಷೆಯಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ.'));
      }
    } catch {
      setError(t('Could not search the location.', 'ಸ್ಥಳ ಹುಡುಕಲಾಗಲಿಲ್ಲ.'));
    } finally { setGeocoding(false); }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => placeMarker(pos.coords.latitude, pos.coords.longitude, 16),
      () => setError(t('Could not get your GPS location.', 'GPS ಸ್ಥಳ ಪಡೆಯಲಾಗಲಿಲ್ಲ.')));
  };

  const clearLocation = () => {
    if (markerRef.current && mapRef.current) mapRef.current.removeLayer(markerRef.current);
    markerRef.current = null;
    setLat(null); setLng(null); setPlaceQuery('');
    setJurisdictionKm(null); setLocationConfirmed(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/reference/registration');
        if (res.status === 403) { setLoadError(t('You do not have permission to register FIRs.', 'FIR ನೋಂದಣಿಗೆ ನಿಮಗೆ ಅನುಮತಿ ಇಲ್ಲ.')); return; }
        // Read as text first so a non-JSON response (e.g. the SPA index.html
        // returned when the API base is wrong) produces a clear diagnostic
        // instead of a generic parse error.
        const raw = await res.text();
        let data: any;
        try { data = JSON.parse(raw); }
        catch {
          setLoadError(
            `${t('Form data endpoint did not return JSON', 'ಫಾರ್ಮ್ ಎಂಡ್‌ಪಾಯಿಂಟ್ JSON ಹಿಂತಿರುಗಿಸಲಿಲ್ಲ')} ` +
            `(HTTP ${res.status}, ${API_BASE || 'same-origin'}). ` +
            t('Check that the API base points to the backend and the backend was restarted.',
              'API ಬೇಸ್ ಬ್ಯಾಕೆಂಡ್‌ಗೆ ಸೂಚಿಸುತ್ತದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.'));
          return;
        }
        if (!res.ok) { setLoadError(`${t('Failed to load form data', 'ಫಾರ್ಮ್ ಡೇಟಾ ಲೋಡ್ ವಿಫಲ')} (HTTP ${res.status}): ${data.detail || ''}`); return; }
        setRef(data);
      } catch (e: any) {
        setLoadError(e.message === 'UNAUTHORIZED'
          ? t('Session expired. Please log in again.', 'ಅಧಿವೇಶನ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.')
          : `${t('Failed to reach the server', 'ಸರ್ವರ್ ತಲುಪಲು ವಿಫಲ')} (${API_BASE || 'same-origin'}): ${e.message}`);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill IPC when crime type changes
  useEffect(() => {
    if (crimeType && ref) {
      const found = ref.crime_types.find((c) => c.name === crimeType);
      if (found) setIpcSections(found.ipc);
    }
  }, [crimeType, ref]);

  // Default the IO to the logged-in officer name
  useEffect(() => {
    if (user?.name && !io) setIo(user.name);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load known gangs for the accused gang autocomplete.
  useEffect(() => {
    if (!ref) return;
    (async () => {
      try {
        const res = await apiFetch('/api/gangs');
        const data = await res.json();
        setGangs(data.gangs || []);
      } catch { /* non-fatal — officer can still type a new gang name */ }
    })();
  }, [ref]);

  const stations = district && ref ? (ref.police_stations[district] || []) : [];

  const updatePerson = (idx: number, field: keyof PersonRow, value: string) => {
    setPersons((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };
  const addPerson = () => setPersons((prev) => [...prev, emptyPerson('accused')]);
  const removePerson = (idx: number) => setPersons((prev) => prev.filter((_, i) => i !== idx));

  const handlePhoto = async (idx: number, file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
      setError(t('Photo must be a JPEG or PNG image.', 'ಫೋಟೋ JPEG ಅಥವಾ PNG ಆಗಿರಬೇಕು.'));
      return;
    }
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      updatePerson(idx, 'photo', dataUrl);
      setError(null);
    } catch {
      setError(t('Could not read the image.', 'ಚಿತ್ರವನ್ನು ಓದಲಾಗಲಿಲ್ಲ.'));
    }
  };

  // --- Statement analysis --------------------------------------------------
  // Reads the free text the officer typed and offers structured suggestions.
  // Deliberately manual rather than on-change: it is a network call, and an
  // officer mid-sentence does not want the form moving underneath them.
  const analyseStatement = async () => {
    const text = description.trim();
    if (!text) {
      setAnalysisError(t('Type the statement first, then analyse it.',
                         'ಮೊದಲು ಹೇಳಿಕೆಯನ್ನು ಟೈಪ್ ಮಾಡಿ, ನಂತರ ವಿಶ್ಲೇಷಿಸಿ.'));
      return;
    }
    setAnalysing(true); setAnalysisError(null); setAnalysis(null); setApplied({});
    try {
      const res = await apiFetch('/api/narrative/analyse', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      if (res.status === 403) {
        setAnalysisError(t('You do not have permission to analyse case text.',
                           'ಪ್ರಕರಣ ಪಠ್ಯ ವಿಶ್ಲೇಷಿಸಲು ನಿಮಗೆ ಅನುಮತಿ ಇಲ್ಲ.'));
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setAnalysisError(data?.detail || t('Could not analyse the statement.',
                                           'ಹೇಳಿಕೆಯನ್ನು ವಿಶ್ಲೇಷಿಸಲಾಗಲಿಲ್ಲ.'));
        return;
      }
      setAnalysis(data as NarrativeAnalysis);
    } catch {
      setAnalysisError(t('Could not reach the analysis service.',
                         'ವಿಶ್ಲೇಷಣಾ ಸೇವೆಯನ್ನು ತಲುಪಲಾಗಲಿಲ್ಲ.'));
    } finally {
      setAnalysing(false);
    }
  };

  // Each apply is one field, one click, and is recorded so the button can show
  // it has been taken. Nothing cascades.
  const applyCrimeType = () => {
    if (!analysis?.suggested_crime_type) return;
    setCrimeType(analysis.suggested_crime_type);
    if (analysis.suggested_ipc) setIpcSections(analysis.suggested_ipc);
    setApplied((prev) => ({ ...prev, crimeType: true }));
  };

  const applyDistrict = () => {
    if (!analysis?.suggested_district) return;
    setDistrict(analysis.suggested_district);
    setPoliceStation('');
    setApplied((prev) => ({ ...prev, district: true }));
  };

  // Adds an extracted name as a new person row with the given role. The officer
  // still has to fill in age, gender and the rest - the name is a starting point,
  // not a record.
  const addExtractedPerson = (name: string, role: string) => {
    setPersons((prev) => {
      const blank = prev.findIndex((p) => !p.full_name.trim());
      const row = { ...emptyPerson(role), full_name: name };
      if (blank >= 0) {
        return prev.map((p, i) => (i === blank ? row : p));
      }
      return [...prev, row];
    });
    setApplied((prev) => ({ ...prev, [`person:${name}`]: true }));
  };

  const resetForm = () => {
    setCrimeType(''); setDistrict(''); setPoliceStation(''); setDateOccurred('');
    setDescription(''); setIpcSections(''); setStatusVal('Registered'); setArrestMade(false);
    setIoRank('Police Inspector'); setIoDesignation('Investigating Officer');
    setPersons([emptyPerson('complainant')]);
    setAnalysis(null); setAnalysisError(null); setApplied({});
    clearLocation();
  };

  const submit = async () => {
    setError(null); setResult(null);
    if (!crimeType) { setError(t('Please select a crime type.', 'ಅಪರಾಧ ಪ್ರಕಾರವನ್ನು ಆಯ್ಕೆಮಾಡಿ.')); return; }
    if (!district) { setError(t('Please select a district.', 'ಜಿಲ್ಲೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ.')); return; }
    if (!dateOccurred) { setError(t('Please select the date of occurrence.', 'ಘಟನೆ ದಿನಾಂಕ ಆಯ್ಕೆಮಾಡಿ.')); return; }
    if (jurisdictionKm != null && !locationConfirmed) {
      setError(t('The pinned location looks outside the selected district. Fix the district/station, or tick the confirmation box below the map.',
                 'ಗುರುತಿಸಿದ ಸ್ಥಳ ಆಯ್ಕೆಮಾಡಿದ ಜಿಲ್ಲೆಯ ಹೊರಗಿದೆ. ಜಿಲ್ಲೆ/ಠಾಣೆ ಸರಿಪಡಿಸಿ ಅಥವಾ ದೃಢೀಕರಣ ಬಾಕ್ಸ್ ಗುರುತಿಸಿ.'));
      return;
    }

    const validPersons = persons.filter((p) => p.full_name.trim());
    const payload = {
      crime_type: crimeType,
      district,
      police_station: policeStation || null,
      date_occurred: dateOccurred,
      description: description || null,
      ipc_sections: ipcSections || null,
      investigating_officer: io || null,
      investigating_officer_rank: ioRank || null,
      investigating_officer_designation: ioDesignation || null,
      investigation_status: statusVal,
      arrest_made: arrestMade,
      latitude: lat,
      longitude: lng,
      persons: validPersons.map((p) => ({
        role: p.role,
        full_name: p.full_name.trim(),
        district: p.district || district,
        age: p.age ? parseInt(p.age, 10) : null,
        gender: p.gender || null,
        occupation: p.occupation || null,
        education_level: p.education_level || null,
        socio_economic_status: p.socio_economic_status || null,
        phone_masked: p.phone_masked || null,
        photo: p.photo || null,
        // Gang tagging (accused only). Match an existing gang by name → gang_id,
        // otherwise send gang_name so the backend creates a new organized group.
        gang_id: p.role === 'accused' && p.gang_name.trim()
          ? (gangs.find((g) => g.name.toLowerCase() === p.gang_name.trim().toLowerCase())?.id ?? null)
          : null,
        gang_name: p.role === 'accused' && p.gang_name.trim() ? p.gang_name.trim() : null,
        gang_role: p.role === 'accused' && p.gang_name.trim() ? p.gang_role : null,
      })),
    };

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/crimes', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setResult(data);
        resetForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (res.status === 403) {
        setError(t('Access denied — your role cannot register FIRs.', 'ಪ್ರವೇಶ ನಿರಾಕರಿಸಲಾಗಿದೆ.'));
      } else {
        setError(data.detail || t('Registration failed.', 'ನೋಂದಣಿ ವಿಫಲವಾಗಿದೆ.'));
      }
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? t('Session expired. Please log in again.', 'ಅಧಿವೇಶನ ಮುಗಿದಿದೆ.') : t('Registration failed.', 'ನೋಂದಣಿ ವಿಫಲವಾಗಿದೆ.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <div style={{ padding: 40, textAlign: 'center', color: '#d32f2f' }}>⚠️ {loadError}</div>;
  if (!ref) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Loading form...', 'ಫಾರ್ಮ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}</div>;

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        📝 {t('Register New FIR', 'ಹೊಸ FIR ನೋಂದಣಿ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('File a new crime record. It flows into the dashboard, maps, network and forecasting automatically.',
           'ಹೊಸ ಅಪರಾಧ ದಾಖಲೆಯನ್ನು ನೋಂದಾಯಿಸಿ. ಇದು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್, ನಕ್ಷೆ ಮತ್ತು ಜಾಲಕ್ಕೆ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸೇರುತ್ತದೆ.')}
      </p>

      {result && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#2e7d32' }}>
            ✅ {t('FIR registered successfully', 'FIR ಯಶಸ್ವಿಯಾಗಿ ನೋಂದಾಯಿಸಲಾಗಿದೆ')}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, color: '#333' }}>
            {t('FIR Number', 'FIR ಸಂಖ್ಯೆ')}: <strong style={{ fontFamily: 'monospace', color: '#1565c0' }}>{result.fir_number}</strong>
            {' · '}{result.detail?.crime_type} · {result.detail?.district}
            {' · '}{t('accused', 'ಆರೋಪಿ')}: {result.detail?.accused?.length || 0}
            {', '}{t('victims', 'ಬಲಿಪಶು')}: {result.detail?.victims?.length || 0}
          </div>
          {result.network && (result.network.co_accused_links > 0 || (result.network.gangs_linked || []).length > 0) && (
            <div style={{ marginTop: 6, fontSize: 13, color: '#4a148c' }}>
              🕸️ {result.network.co_accused_links > 0 && t(`${result.network.co_accused_links} co-accused network link(s) created`, `${result.network.co_accused_links} ಸಹ-ಆರೋಪಿ ಸಂಪರ್ಕ ರಚಿಸಲಾಗಿದೆ`)}
              {result.network.co_accused_links > 0 && (result.network.gangs_linked || []).length > 0 && ' · '}
              {(result.network.gangs_linked || []).length > 0 && t(`Gang(s): ${result.network.gangs_linked.join(', ')}`, `ಗ್ಯಾಂಗ್: ${result.network.gangs_linked.join(', ')}`)}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 14, marginBottom: 18, color: '#c62828', fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Crime details */}
      <div style={card}>
        <h3 style={sectionTitle}>🔎 {t('Crime Details', 'ಅಪರಾಧ ವಿವರಗಳು')}</h3>
        <div style={grid}>
          <Field label={t('Crime Type', 'ಅಪರಾಧ ಪ್ರಕಾರ') + ' *'}>
            <select value={crimeType} onChange={(e) => setCrimeType(e.target.value)} style={input}>
              <option value="">— {t('Select', 'ಆಯ್ಕೆಮಾಡಿ')} —</option>
              {ref.crime_types.map((c) => <option key={c.name} value={c.name}>{c.name} (IPC {c.ipc})</option>)}
            </select>
          </Field>
          <Field label={t('District', 'ಜಿಲ್ಲೆ') + ' *'}>
            <select value={district} onChange={(e) => { setDistrict(e.target.value); setPoliceStation(''); }} style={input}>
              <option value="">— {t('Select', 'ಆಯ್ಕೆಮಾಡಿ')} —</option>
              {ref.districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label={t('Police Station', 'ಪೊಲೀಸ್ ಠಾಣೆ')}>
            <select value={policeStation} onChange={(e) => setPoliceStation(e.target.value)} style={input} disabled={!district}>
              <option value="">— {t('Select', 'ಆಯ್ಕೆಮಾಡಿ')} —</option>
              {stations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label={t('Date of Occurrence', 'ಘಟನೆ ದಿನಾಂಕ') + ' *'}>
            <input type="date" value={dateOccurred} max={today} onChange={(e) => setDateOccurred(e.target.value)} style={input} />
          </Field>
        </div>
        <Field label={t('Complainant statement / brief facts', 'ದೂರುದಾರರ ಹೇಳಿಕೆ / ಸಂಕ್ಷಿಪ್ತ ವಿವರ')}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} style={{ ...input, resize: 'vertical' }}
            placeholder={t('Write the incident in plain words, as the complainant described it. Then use Analyse statement to pull out the offence, location, people and property.',
                           'ದೂರುದಾರರು ವಿವರಿಸಿದಂತೆ ಘಟನೆಯನ್ನು ಬರೆಯಿರಿ. ನಂತರ ಅಪರಾಧ, ಸ್ಥಳ, ವ್ಯಕ್ತಿಗಳು ಮತ್ತು ಆಸ್ತಿಯನ್ನು ಹೊರತೆಗೆಯಲು ಹೇಳಿಕೆ ವಿಶ್ಲೇಷಿಸಿ ಬಳಸಿ.')} />
        </Field>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={analyseStatement} disabled={analysing || !description.trim()}
            style={{ ...analyseBtn, opacity: analysing || !description.trim() ? 0.55 : 1 }}>
            {analysing
              ? '⏳ ' + t('Analysing...', 'ವಿಶ್ಲೇಷಿಸುತ್ತಿದೆ...')
              : '🔍 ' + t('Analyse statement', 'ಹೇಳಿಕೆ ವಿಶ್ಲೇಷಿಸಿ')}
          </button>
          <span style={{ fontSize: 12, color: '#78909c' }}>
            {t('Reads the text above and suggests fields. Nothing is filled in until you choose it.',
               'ಮೇಲಿನ ಪಠ್ಯವನ್ನು ಓದಿ ಕ್ಷೇತ್ರಗಳನ್ನು ಸೂಚಿಸುತ್ತದೆ. ನೀವು ಆಯ್ಕೆ ಮಾಡುವವರೆಗೆ ಏನೂ ಭರ್ತಿಯಾಗುವುದಿಲ್ಲ.')}
          </span>
        </div>

        {analysisError && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#c62828' }}>⚠️ {analysisError}</div>
        )}

        {analysis && (
          <div style={{ marginTop: 14, background: '#f3f6fb', border: '1px solid #ccd7e6', borderRadius: 9, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a237e' }}>
                {t('Suggested from the statement', 'ಹೇಳಿಕೆಯಿಂದ ಸೂಚಿಸಲಾಗಿದೆ')}
              </div>
              {/* Which engine answered is stated on the face of the panel, not buried:
                  an officer should know whether they are looking at a model's
                  output or a keyword match before they accept it. */}
              <span style={analysis.engine === 'zia' ? enginePillLive : enginePillFallback}>
                {analysis.engine === 'zia'
                  ? t('Catalyst Zia', 'Catalyst Zia')
                  : t('Rule-based fallback', 'ನಿಯಮ ಆಧಾರಿತ')}
              </span>
            </div>

            <div style={{ fontSize: 12, color: '#546e7a', margin: '6px 0 12px' }}>
              {analysis.advisory}
            </div>

            {/* Applyable suggestions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {analysis.suggested_crime_type && (
                <button type="button" onClick={applyCrimeType}
                  disabled={applied.crimeType} style={applied.crimeType ? chipDone : chipAction}>
                  {applied.crimeType ? '✓ ' : '+ '}
                  {t('Offence', 'ಅಪರಾಧ')}: {analysis.suggested_crime_type}
                  {analysis.suggested_ipc ? ` (IPC ${analysis.suggested_ipc})` : ''}
                </button>
              )}
              {analysis.suggested_district && (
                <button type="button" onClick={applyDistrict}
                  disabled={applied.district} style={applied.district ? chipDone : chipAction}>
                  {applied.district ? '✓ ' : '+ '}
                  {t('District', 'ಜಿಲ್ಲೆ')}: {analysis.suggested_district}
                </button>
              )}
              {!analysis.suggested_crime_type && !analysis.suggested_district && (
                <span style={{ fontSize: 12.5, color: '#78909c' }}>
                  {t('No offence type or district recognised in the text.',
                     'ಪಠ್ಯದಲ್ಲಿ ಅಪರಾಧ ಪ್ರಕಾರ ಅಥವಾ ಜಿಲ್ಲೆ ಗುರುತಿಸಲಾಗಿಲ್ಲ.')}
                </span>
              )}
            </div>

            {/* Extracted names, each addable under a role the officer picks */}
            {analysis.entities.persons.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={detectedLabel}>👤 {t('Names found', 'ಕಂಡುಬಂದ ಹೆಸರುಗಳು')}</div>
                {analysis.entities.persons.map((name) => (
                  <div key={name} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#263238', minWidth: 150 }}>{name}</span>
                    {applied[`person:${name}`] ? (
                      <span style={chipDone}>✓ {t('added', 'ಸೇರಿಸಲಾಗಿದೆ')}</span>
                    ) : (
                      ['complainant', 'accused', 'victim', 'witness'].map((role) => (
                        <button key={role} type="button" onClick={() => addExtractedPerson(name, role)}
                          style={chipAction}>
                          + {role}
                        </button>
                      ))
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: '#78909c' }}>
                  {t('Adding a name only starts a person row — age, gender and the rest are still yours to fill in.',
                     'ಹೆಸರು ಸೇರಿಸುವುದು ವ್ಯಕ್ತಿ ಸಾಲನ್ನು ಪ್ರಾರಂಭಿಸುತ್ತದೆ — ವಯಸ್ಸು, ಲಿಂಗ ಇತ್ಯಾದಿ ನೀವೇ ಭರ್ತಿ ಮಾಡಬೇಕು.')}
                </div>
              </div>
            )}

            {/* Read-only detections. No field to apply them to, but an officer
                checking their own write-up wants to see what the text said. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <Detected label={'🏍️ ' + t('Vehicles', 'ವಾಹನಗಳು')} items={analysis.entities.vehicles} />
              <Detected label={'💰 ' + t('Property', 'ಆಸ್ತಿ')} items={analysis.entities.valuables} />
              <Detected label={'₹ ' + t('Amounts', 'ಮೊತ್ತ')} items={analysis.entities.money.map((m) => m.token)} />
              <Detected label={'📅 ' + t('Dates / times', 'ದಿನಾಂಕ / ಸಮಯ')}
                items={[...analysis.entities.dates, ...analysis.entities.times]} />
              <Detected label={'📍 ' + t('Places', 'ಸ್ಥಳಗಳು')} items={analysis.entities.places} />
              <Detected label={'🏢 ' + t('Organisations', 'ಸಂಸ್ಥೆಗಳು')} items={analysis.entities.organisations} />
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12, color: '#546e7a', cursor: 'pointer' }}>
                {t('How this was produced', 'ಇದನ್ನು ಹೇಗೆ ತಯಾರಿಸಲಾಯಿತು')}
              </summary>
              <div style={{ fontSize: 12, color: '#546e7a', marginTop: 6, lineHeight: 1.6 }}>
                {analysis.engine_note}
                {analysis.sentiment && (
                  <div style={{ marginTop: 6 }}>
                    {t('Statement tone', 'ಹೇಳಿಕೆಯ ಸ್ವರ')}: <strong>{analysis.sentiment.label}</strong>
                    {' '}({analysis.sentiment.sentences_analysed} {t('sentence(s)', 'ವಾಕ್ಯ')})
                  </div>
                )}
                {analysis.keyphrases.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {t('Key phrases', 'ಪ್ರಮುಖ ನುಡಿಗಟ್ಟುಗಳು')}: {analysis.keyphrases.join(' · ')}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Crime Location — pick the exact spot (not just the district centroid) */}
      <div style={card}>
        <h3 style={sectionTitle}>📍 {t('Crime Location', 'ಅಪರಾಧ ಸ್ಥಳ')}</h3>
        <p style={{ fontSize: 12.5, color: '#78909c', marginTop: -8, marginBottom: 12 }}>
          {t('Search a landmark, click on the map, or use GPS to mark the exact location. If left blank, the district centre is used.',
             'ನಿಖರ ಸ್ಥಳ ಗುರುತಿಸಲು ನಕ್ಷೆಯಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ, ಹುಡುಕಿ, ಅಥವಾ GPS ಬಳಸಿ. ಖಾಲಿ ಬಿಟ್ಟರೆ ಜಿಲ್ಲಾ ಕೇಂದ್ರ ಬಳಸಲಾಗುತ್ತದೆ.')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <input
              value={placeQuery}
              onChange={(e) => onPlaceQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); geocode(); } }}
              placeholder={t('Search landmark / address (e.g. MG Road, near metro)', 'ಸ್ಥಳ / ವಿಳಾಸ ಹುಡುಕಿ')}
              style={{ ...input, width: '100%' }} />
            {suggestions.length > 0 && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                margin: '2px 0 0', padding: 0, listStyle: 'none', background: '#fff',
                border: '1px solid #cfd8dc', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                maxHeight: 220, overflowY: 'auto',
              }}>
                {suggestions.map((s, i) => (
                  <li key={i} onClick={() => pickSuggestion(s)}
                    style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #eee' : 'none' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                    📍 {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={geocode} disabled={geocoding} style={{ ...addBtn, opacity: geocoding ? 0.6 : 1 }}>
            {geocoding ? t('Searching…', 'ಹುಡುಕಲಾಗುತ್ತಿದೆ…') : '🔍 ' + t('Locate', 'ಹುಡುಕಿ')}
          </button>
          <button type="button" onClick={useMyLocation} style={resetBtn}>📡 {t('Use GPS', 'GPS ಬಳಸಿ')}</button>
          {lat != null && (
            <button type="button" onClick={clearLocation} style={removeBtn}>✕ {t('Clear', 'ತೆರವು')}</button>
          )}
        </div>
        <div ref={mapDivRef} style={{ height: 300, width: '100%', borderRadius: 8, border: '1px solid #cfd8dc', overflow: 'hidden', zIndex: 0 }} />
        <div style={{ marginTop: 8, fontSize: 13, color: lat != null ? '#2e7d32' : '#90a4ae' }}>
          {lat != null
            ? `✅ ${t('Selected', 'ಆಯ್ಕೆ')}: ${lat.toFixed(5)}, ${lng!.toFixed(5)}`
            : `📌 ${t('No exact location selected — click the map to place a pin.', 'ನಿಖರ ಸ್ಥಳ ಆಯ್ಕೆಯಾಗಿಲ್ಲ — ನಕ್ಷೆಯಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ.')}`}
        </div>

        {/* Jurisdiction mismatch warning (soft — allows a Zero FIR override) */}
        {jurisdictionKm != null && (
          <div style={{ marginTop: 10, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, color: '#8d6e00' }}>
              ⚠️ {t(`This location is about ${jurisdictionKm} km from ${district}.`,
                    `ಈ ಸ್ಥಳ ${district} ನಿಂದ ಸುಮಾರು ${jurisdictionKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿದೆ.`)}
              {' '}
              {t('It may fall outside this station\'s jurisdiction. Please verify the District / Police Station above — or, if this is a Zero FIR filed outside jurisdiction, confirm below.',
                 'ಇದು ಈ ಠಾಣೆಯ ವ್ಯಾಪ್ತಿಯ ಹೊರಗಿರಬಹುದು. ಮೇಲಿನ ಜಿಲ್ಲೆ / ಠಾಣೆ ಪರಿಶೀಲಿಸಿ — ಅಥವಾ ಇದು ಝೀರೋ ಎಫ್‌ಐಆರ್ ಆಗಿದ್ದರೆ ಕೆಳಗೆ ದೃಢೀಕರಿಸಿ.')}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: '#5d4037', cursor: 'pointer' }}>
              <input type="checkbox" checked={locationConfirmed} onChange={(e) => setLocationConfirmed(e.target.checked)} />
              {t('I confirm the location is correct (e.g. Zero FIR / cross-jurisdiction).',
                 'ಸ್ಥಳ ಸರಿಯಾಗಿದೆ ಎಂದು ದೃಢೀಕರಿಸುತ್ತೇನೆ (ಝೀರೋ ಎಫ್‌ಐಆರ್ / ಅಂತರ-ವ್ಯಾಪ್ತಿ).')}
            </label>
          </div>
        )}
      </div>

      {/* Investigation */}
      <div style={card}>
        <h3 style={sectionTitle}>🗂️ {t('Investigation', 'ತನಿಖೆ')}</h3>
        <div style={grid}>
          <Field label={t('IPC Sections', 'ಐಪಿಸಿ ಸೆಕ್ಷನ್')}>
            <input value={ipcSections} onChange={(e) => setIpcSections(e.target.value)} style={input} placeholder="e.g. 379, 411" />
          </Field>
          <Field label={t('Investigating Officer', 'ತನಿಖಾಧಿಕಾರಿ')}>
            <input value={io} onChange={(e) => setIo(e.target.value)} style={input} />
          </Field>
          <Field label={t('Officer Rank', 'ಅಧಿಕಾರಿ ಹುದ್ದೆ')}>
            <select value={ioRank} onChange={(e) => setIoRank(e.target.value)} style={input}>
              {ref.officer_ranks.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label={t('Officer Designation', 'ಪದನಾಮ')}>
            <select value={ioDesignation} onChange={(e) => setIoDesignation(e.target.value)} style={input}>
              {ref.officer_designations.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label={t('Status', 'ಸ್ಥಿತಿ')}>
            <select value={statusVal} onChange={(e) => setStatusVal(e.target.value)} style={input}>
              {ref.investigation_statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label={t('Arrest Made', 'ಬಂಧನ')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, paddingTop: 8 }}>
              <input type="checkbox" checked={arrestMade} onChange={(e) => setArrestMade(e.target.checked)} />
              {t('Yes, an arrest has been made', 'ಹೌದು, ಬಂಧನವಾಗಿದೆ')}
            </label>
          </Field>
        </div>
      </div>

      {/* People involved */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ ...sectionTitle, marginBottom: 0 }}>👥 {t('People Involved', 'ಒಳಗೊಂಡ ವ್ಯಕ್ತಿಗಳು')}</h3>
          <button onClick={addPerson} style={addBtn}>+ {t('Add Person', 'ವ್ಯಕ್ತಿ ಸೇರಿಸಿ')}</button>
        </div>
        {persons.map((p, idx) => (
          <div key={idx} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 14, marginBottom: 12, background: '#fcfcfc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>#{idx + 1}</span>
              {persons.length > 1 && (
                <button onClick={() => removePerson(idx)} style={removeBtn}>✕ {t('Remove', 'ತೆಗೆದುಹಾಕಿ')}</button>
              )}
            </div>

            {/* Photo upload + preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                border: '1px solid #cfd8dc', background: '#eceff1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {p.photo
                  ? <img src={p.photo} alt="accused" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 26, color: '#90a4ae' }}>👤</span>}
              </div>
              <div>
                <label style={{ ...addBtn, display: 'inline-block' }}>
                  📷 {p.photo ? t('Change Photo', 'ಫೋಟೋ ಬದಲಿಸಿ') : t('Upload Photo', 'ಫೋಟೋ ಅಪ್‌ಲೋಡ್')}
                  <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
                    onChange={(e) => handlePhoto(idx, e.target.files?.[0])} />
                </label>
                {p.photo && (
                  <button onClick={() => updatePerson(idx, 'photo', '')}
                    style={{ ...removeBtn, marginLeft: 8 }}>✕ {t('Remove Photo', 'ಫೋಟೋ ತೆಗೆ')}</button>
                )}
                <div style={{ fontSize: 11, color: '#90a4ae', marginTop: 4 }}>
                  {t('JPEG/PNG, auto-resized. Official record — authorized use only.',
                     'JPEG/PNG, ಸ್ವಯಂ ಗಾತ್ರ. ಅಧಿಕೃತ ದಾಖಲೆ.')}
                </div>
              </div>
            </div>

            <div style={grid}>
              <Field label={t('Role', 'ಪಾತ್ರ')}>
                <select value={p.role} onChange={(e) => updatePerson(idx, 'role', e.target.value)} style={input}>
                  {ref.person_roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label={t('Full Name', 'ಪೂರ್ಣ ಹೆಸರು')}>
                <input value={p.full_name} onChange={(e) => updatePerson(idx, 'full_name', e.target.value)} style={input} />
              </Field>
              <Field label={t('Age', 'ವಯಸ್ಸು')}>
                <input type="number" min={0} max={120} value={p.age} onChange={(e) => updatePerson(idx, 'age', e.target.value)} style={input} />
              </Field>
              <Field label={t('Gender', 'ಲಿಂಗ')}>
                <select value={p.gender} onChange={(e) => updatePerson(idx, 'gender', e.target.value)} style={input}>
                  <option value="">—</option>
                  {ref.genders.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label={t('District', 'ಜಿಲ್ಲೆ')}>
                <select value={p.district} onChange={(e) => updatePerson(idx, 'district', e.target.value)} style={input}>
                  <option value="">—</option>
                  {ref.districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label={t('Occupation', 'ವೃತ್ತಿ')}>
                <input value={p.occupation} onChange={(e) => updatePerson(idx, 'occupation', e.target.value)} style={input} />
              </Field>
              <Field label={t('Education', 'ಶಿಕ್ಷಣ')}>
                <select value={p.education_level} onChange={(e) => updatePerson(idx, 'education_level', e.target.value)} style={input}>
                  <option value="">—</option>
                  {ref.education_levels.map((ed) => <option key={ed} value={ed}>{ed}</option>)}
                </select>
              </Field>
              <Field label={t('Socio-economic', 'ಸಾಮಾಜಿಕ-ಆರ್ಥಿಕ')}>
                <select value={p.socio_economic_status} onChange={(e) => updatePerson(idx, 'socio_economic_status', e.target.value)} style={input}>
                  <option value="">—</option>
                  {ref.socio_economic_statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            {/* Gang / organized-group tagging — accused only (feeds the network) */}
            {p.role === 'accused' && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e0e0e0' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#6a1b9a', marginBottom: 8 }}>
                  🕸️ {t('Gang / Organized group (optional)', 'ಗ್ಯಾಂಗ್ / ಸಂಘಟಿತ ಗುಂಪು (ಐಚ್ಛಿಕ)')}
                </div>
                <div style={grid}>
                  <Field label={t('Gang name', 'ಗ್ಯಾಂಗ್ ಹೆಸರು')}>
                    <input list="ksp-gangs" value={p.gang_name}
                      onChange={(e) => updatePerson(idx, 'gang_name', e.target.value)}
                      placeholder={t('Search or type a new group', 'ಹುಡುಕಿ ಅಥವಾ ಹೊಸ ಗುಂಪು ಟೈಪ್ ಮಾಡಿ')}
                      style={input} />
                  </Field>
                  {p.gang_name.trim() !== '' && (
                    <Field label={t('Role in gang', 'ಗ್ಯಾಂಗ್‌ನಲ್ಲಿ ಪಾತ್ರ')}>
                      <select value={p.gang_role} onChange={(e) => updatePerson(idx, 'gang_role', e.target.value)} style={input}>
                        {ref.gang_roles.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
                {p.gang_name.trim() !== '' && !gangs.some((g) => g.name.toLowerCase() === p.gang_name.trim().toLowerCase()) && (
                  <div style={{ fontSize: 11, color: '#8d6e00', marginTop: 4 }}>
                    ➕ {t('New group — it will be created and added to the network.',
                          'ಹೊಸ ಗುಂಪು — ಇದನ್ನು ರಚಿಸಿ ಜಾಲಕ್ಕೆ ಸೇರಿಸಲಾಗುತ್ತದೆ.')}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {/* Shared datalist of known gangs for the autocomplete inputs above */}
        <datalist id="ksp-gangs">
          {gangs.map((g) => <option key={g.id} value={g.name} />)}
        </datalist>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button onClick={submit} disabled={submitting} style={{ ...submitBtn, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? '⏳ ' + t('Registering...', 'ನೋಂದಾಯಿಸುತ್ತಿದೆ...') : '✅ ' + t('Register FIR', 'FIR ನೋಂದಾಯಿಸಿ')}
        </button>
        <button onClick={resetForm} disabled={submitting} style={resetBtn}>
          🔄 {t('Reset', 'ಮರುಹೊಂದಿಸಿ')}
        </button>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
    <label style={{ fontSize: 12.5, fontWeight: 600, color: '#555', marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

// One group of read-only detections. Renders nothing when the list is empty, so
// the panel does not fill up with headings for things the statement did not say.
const Detected = ({ label, items }: { label: string; items: string[] }) => {
  if (!items.length) return null;
  return (
    <div>
      <div style={detectedLabel}>{label}</div>
      <div style={{ fontSize: 13, color: '#263238', lineHeight: 1.6 }}>
        {items.join(' · ')}
      </div>
    </div>
  );
};

const detectedLabel: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: '#546e7a',
  textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3,
};
const chipAction: React.CSSProperties = {
  background: '#fff', border: '1px solid #90a4ae', color: '#1a237e',
  borderRadius: 14, padding: '4px 11px', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer',
};
const chipDone: React.CSSProperties = {
  background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32',
  borderRadius: 14, padding: '4px 11px', fontSize: 12.5, fontWeight: 600,
  cursor: 'default',
};
const analyseBtn: React.CSSProperties = {
  background: '#1a237e', color: '#fff', border: 'none', borderRadius: 7,
  padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
};
const enginePillLive: React.CSSProperties = {
  background: '#e8eaf6', border: '1px solid #9fa8da', color: '#283593',
  borderRadius: 12, padding: '3px 10px', fontSize: 11.5, fontWeight: 700,
};
const enginePillFallback: React.CSSProperties = {
  background: '#fff8e1', border: '1px solid #ffe082', color: '#8d6e00',
  borderRadius: 12, padding: '3px 10px', fontSize: 11.5, fontWeight: 700,
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const sectionTitle: React.CSSProperties = { color: '#1a237e', fontSize: 17, marginBottom: 14 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 };
const input: React.CSSProperties = { padding: '9px 11px', border: '1px solid #cfd8dc', borderRadius: 6, fontSize: 14, outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' };
const submitBtn: React.CSSProperties = { background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 26px', cursor: 'pointer', fontSize: 15, fontWeight: 700 };
const resetBtn: React.CSSProperties = { background: '#eceff1', color: '#455a64', border: '1px solid #cfd8dc', borderRadius: 6, padding: '11px 22px', cursor: 'pointer', fontSize: 14, fontWeight: 600 };
const addBtn: React.CSSProperties = { background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const removeBtn: React.CSSProperties = { background: 'transparent', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };

export default RegisterFIRView;
