import React, { useState, useEffect, useRef } from 'react';
import Dashboard from '../components/Dashboard';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Login from '../components/Login';
import NetworkView from '../components/NetworkView';
import HotspotView from '../components/HotspotView';
import InsightsView from '../components/InsightsView';
import ProfilesView from '../components/ProfilesView';
import FinanceView from '../components/FinanceView';
import ForecastView from '../components/ForecastView';
import AuditView from '../components/AuditView';
import CaseInvestigationView from '../components/CaseInvestigationView';
import RegisterFIRView from '../components/RegisterFIRView';
import { apiFetch, isAuthenticated, getUser, clearAuth, AuthUser } from '../api';
import {
  localizeCrimeType, localizeDistrict, localizeDescription,
  localizePlace, localizeLabel, localizePersonName, buildAnswer
} from '../locale';

// Official Emblem of Karnataka (Seal) — served via Wikimedia's stable FilePath
// endpoint (https://en.wikipedia.org/wiki/Emblem_of_Karnataka). Falls back to a
// "KSP" text badge if the image can't load.
const KARNATAKA_EMBLEM_URL = 'https://commons.wikimedia.org/wiki/Special:FilePath/Seal%20of%20Karnataka.png?width=140';

type ViewType = 'chat' | 'dashboard' | 'network' | 'hotspots' | 'insights' | 'profiles' | 'finance' | 'forecast' | 'investigation' | 'register' | 'audit';

// Shared data types
interface CrimeRecord {
  id?: number;
  fir_number?: string;
  date_occurred?: string;
  district?: string;
  taluk?: string;
  police_station?: string;
  crime_type?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  accused?: string[];
  investigation_status?: string;
}

interface BreakdownItem {
  label: string;
  count: number;
}

interface PersonBrief {
  id: number;
  name: string;
  age?: number;
  gender?: string;
  district?: string;
  occupation?: string;
  risk_score?: number;
  photo?: string | null;
}

interface CrimeDetail {
  fir_number: string;
  crime_type: string;
  date_occurred: string;
  district: string;
  police_station: string;
  description: string;
  investigation?: {
    status?: string;
    officer?: string;
    ipc_sections?: string;
    arrest_made?: boolean;
    outcome?: string;
    court_status?: string;
  } | null;
  accused: PersonBrief[];
  victims: PersonBrief[];
  witnesses: PersonBrief[];
}

interface ChatMessage {
  text: string;
  isUser: boolean;
  loading?: boolean;
  intent?: string;
  entities?: Record<string, any>;
  results?: CrimeRecord[];
  breakdown?: BreakdownItem[];
  groupBy?: string;
  detail?: CrimeDetail;
  personProfile?: PersonProfile;
  evidence?: Record<string, any>;
}

// Full offender profile (from GET /api/person/{id}) — the criminal dossier an
// investigating officer needs: prior record, risk, network, gangs, finances.
interface PersonProfile {
  id: number;
  name: string;
  photo?: string | null;
  demographics?: {
    age?: number; gender?: string; occupation?: string; education?: string;
    socio_economic_status?: string; district?: string; phone?: string;
  };
  risk_score?: number;
  is_repeat_offender?: boolean;
  accused_in_n_cases?: number;
  cases?: { fir_number: string; crime_type: string; district: string; date: string; role: string }[];
  gangs?: { gang: string; role: string; activity: string }[];
  associates?: PersonBrief[];
  financial_accounts?: { bank: string; type: string; account: string; flagged: boolean }[];
}

// Emoji/color accent per crime type
const CRIME_ACCENT: Record<string, string> = {
  theft: '#e65100', murder: '#b71c1c', robbery: '#bf360c', assault: '#d84315',
  burglary: '#4e342e', snatching: '#f57f17', cheating: '#6a1b9a', forgery: '#283593',
  counterfeiting: '#00695c', rioting: '#c62828', riot: '#c62828'
};

const accentFor = (crimeType?: string): string => {
  if (!crimeType) return '#1a237e';
  const key = crimeType.toLowerCase();
  return CRIME_ACCENT[key] || '#1a237e';
};

// Investigation-status pill colors
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  'registered': { bg: '#e3f2fd', fg: '#1565c0' },
  'under investigation': { bg: '#fff3e0', fg: '#e65100' },
  'chargesheet filed': { bg: '#ede7f6', fg: '#5e35b1' },
  'closed': { bg: '#eceff1', fg: '#546e7a' },
  'convicted': { bg: '#e8f5e9', fg: '#2e7d32' },
  'acquitted': { bg: '#fce4ec', fg: '#c2185b' },
};
const statusStyle = (s?: string) => STATUS_COLOR[(s || '').toLowerCase()] || { bg: '#eceff1', fg: '#546e7a' };

// Nav tabs (label pairs + the view each maps to)
const NAV_TABS: { en: string; kn: string }[] = [
  { en: 'AI ASSISTANT', kn: 'AI ಸಹಾಯಕ' },
  { en: 'DASHBOARD', kn: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್' },
  { en: 'NETWORK', kn: 'ಜಾಲ' },
  { en: 'MAP', kn: 'ನಕ್ಷೆ' },
  { en: 'INSIGHTS', kn: 'ಒಳನೋಟ' },
  { en: 'PROFILES', kn: 'ಪ್ರೊಫೈಲ್' },
  { en: 'FINANCE', kn: 'ಹಣಕಾಸು' },
  { en: 'FORECAST', kn: 'ಮುನ್ಸೂಚನೆ' },
  { en: 'CASE INVESTIGATION', kn: 'ಪ್ರಕರಣ ತನಿಖೆ' },
  { en: 'REGISTER FIR', kn: 'FIR ನೋಂದಣಿ' },
  { en: 'AUDIT', kn: 'ಲೆಕ್ಕಪರಿಶೋಧನೆ' },
];

// Role-based access control (Area 10): which tabs each role may see.
const ROLE_TABS: Record<string, string[]> = {
  investigator: ['AI ASSISTANT', 'DASHBOARD', 'NETWORK', 'MAP', 'PROFILES', 'CASE INVESTIGATION', 'REGISTER FIR'],
  analyst: ['AI ASSISTANT', 'DASHBOARD', 'NETWORK', 'MAP', 'INSIGHTS', 'PROFILES', 'FINANCE', 'FORECAST'],
  supervisor: ['AI ASSISTANT', 'DASHBOARD', 'NETWORK', 'MAP', 'INSIGHTS', 'PROFILES', 'FINANCE', 'FORECAST', 'CASE INVESTIGATION', 'REGISTER FIR', 'AUDIT'],
  policymaker: ['AI ASSISTANT', 'DASHBOARD', 'MAP', 'INSIGHTS', 'FORECAST'],
  // Backward-compatible legacy roles:
  admin: ['AI ASSISTANT', 'DASHBOARD', 'NETWORK', 'MAP', 'INSIGHTS', 'PROFILES', 'FINANCE', 'FORECAST', 'CASE INVESTIGATION', 'REGISTER FIR', 'AUDIT'],
  officer: ['AI ASSISTANT', 'DASHBOARD', 'NETWORK', 'MAP', 'INSIGHTS', 'PROFILES', 'FINANCE', 'FORECAST', 'CASE INVESTIGATION', 'REGISTER FIR'],
};

const VIEW_TO_TAB: Record<string, string> = {
  chat: 'AI ASSISTANT', dashboard: 'DASHBOARD', network: 'NETWORK', hotspots: 'MAP',
  insights: 'INSIGHTS', profiles: 'PROFILES', finance: 'FINANCE', forecast: 'FORECAST',
  investigation: 'CASE INVESTIGATION', register: 'REGISTER FIR', audit: 'AUDIT',
};

// Government-styled header component
const GovHeader = ({ 
  onLanguageChange, 
  onNavigate,
  onLogout,
  user,
  currentView,
  currentLanguage 
}: { 
  onLanguageChange: (lang: 'en' | 'kn') => void;
  onNavigate: (view: ViewType) => void;
  onLogout: () => void;
  user: AuthUser | null;
  currentView: ViewType;
  currentLanguage: 'en' | 'kn';
}) => {
  const handleMenuClick = (menuItem: string) => {
    console.log(`Menu clicked: ${menuItem}`);
    if (menuItem === 'CASE INVESTIGATION') {
      onNavigate('investigation');
    } else if (menuItem === 'DASHBOARD') {
      onNavigate('dashboard');
    } else if (menuItem === 'NETWORK') {
      onNavigate('network');
    } else if (menuItem === 'MAP') {
      onNavigate('hotspots');
    } else if (menuItem === 'INSIGHTS') {
      onNavigate('insights');
    } else if (menuItem === 'PROFILES') {
      onNavigate('profiles');
    } else if (menuItem === 'FINANCE') {
      onNavigate('finance');
    } else if (menuItem === 'FORECAST') {
      onNavigate('forecast');
    } else if (menuItem === 'REGISTER FIR') {
      onNavigate('register');
    } else if (menuItem === 'AUDIT') {
      onNavigate('audit');
    } else if (menuItem === 'AI ASSISTANT' || menuItem === 'HOME') {
      onNavigate('chat');
    }
  };

  return (
    <>
      {/* Tricolor accent strip */}
      <div style={{ display: 'flex', height: '4px' }}>
        <div style={{ flex: 1, background: '#ff9933' }} />
        <div style={{ flex: 1, background: '#ffffff' }} />
        <div style={{ flex: 1, background: '#138808' }} />
      </div>

      {/* Top utility bar */}
      <div style={{
        background: '#15208a',
        color: 'white',
        padding: '7px 24px',
        fontSize: '12.5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>📧 support@ksp.gov.in</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>📞 100 · {currentLanguage === 'en' ? 'Emergency' : 'ತುರ್ತು'}</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>👩 1091 · {currentLanguage === 'en' ? 'Women Helpline' : 'ಮಹಿಳಾ ಸಹಾಯವಾಣಿ'}</span>
        </div>
        <div>
          <button 
            onClick={() => onLanguageChange('en')}
            style={{ 
              background: currentLanguage === 'en' ? 'white' : 'transparent',
              border: '1px solid white', 
              color: currentLanguage === 'en' ? '#1a237e' : 'white',
              padding: '4px 12px', 
              marginLeft: '10px', 
              cursor: 'pointer', 
              borderRadius: '3px',
              transition: 'all 0.2s',
              fontWeight: currentLanguage === 'en' ? 'bold' : 'normal'
            }}
            onMouseEnter={(e) => {
              if (currentLanguage !== 'en') {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentLanguage !== 'en') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            English
          </button>
          <button 
            onClick={() => onLanguageChange('kn')}
            style={{ 
              background: currentLanguage === 'kn' ? 'white' : 'transparent',
              border: '1px solid white', 
              color: currentLanguage === 'kn' ? '#1a237e' : 'white',
              padding: '4px 12px', 
              marginLeft: '10px', 
              cursor: 'pointer', 
              borderRadius: '3px',
              transition: 'all 0.2s',
              fontWeight: currentLanguage === 'kn' ? 'bold' : 'normal'
            }}
            onMouseEnter={(e) => {
              if (currentLanguage !== 'kn') {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentLanguage !== 'kn') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            ಕನ್ನಡ
          </button>
          {user && (
            <>
              <span style={{ marginLeft: '16px', borderLeft: '1px solid rgba(255,255,255,0.3)', paddingLeft: '16px' }}>
                👮 {user.name} ({user.role})
              </span>
              <button
                onClick={onLogout}
                style={{
                  background: '#ff9800', border: 'none', color: 'white',
                  padding: '4px 12px', marginLeft: '12px', cursor: 'pointer',
                  borderRadius: '3px', fontWeight: 'bold', fontSize: '13px'
                }}
                title="Logout"
              >
                {currentLanguage === 'en' ? 'Logout' : 'ಲಾಗ್‌ಔಟ್'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main header with emblem */}
      <div style={{
        background: 'linear-gradient(180deg,#ffffff 0%,#f7f8fc 100%)',
        padding: '16px 24px',
        borderBottom: '3px solid #ff9933',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Emblem — double-ring official badge */}
          <div style={{
            width: '62px', height: '62px', borderRadius: '50%',
            background: '#ffffff',
            border: '2px solid #ffb300',
            boxShadow: '0 0 0 3px #ffffff, 0 2px 6px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#1a237e', fontWeight: 'bold', fontSize: '15px', textAlign: 'center',
            lineHeight: 1.05, cursor: 'pointer', flexShrink: 0, overflow: 'hidden'
          }}
          onClick={() => onNavigate('chat')}
          title={currentLanguage === 'en' ? 'Emblem of Karnataka — Home' : 'ಕರ್ನಾಟಕ ಲಾಂಛನ — ಮುಖಪುಟ'}
          >
            <img src={KARNATAKA_EMBLEM_URL} alt="Emblem of Karnataka"
              style={{ width: '82%', height: '82%', objectFit: 'contain' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const s = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (s) s.style.display = 'block';
              }} />
            <span style={{ display: 'none' }}>KSP</span>
          </div>
          <div>
            <div style={{ fontSize: '21px', fontWeight: 800, color: '#1a237e', lineHeight: '1.15', letterSpacing: '0.3px' }}>
              {currentLanguage === 'en' ? 'GOVERNMENT OF KARNATAKA' : 'ಕರ್ನಾಟಕ ಸರ್ಕಾರ'}
            </div>
            <div style={{ fontSize: '14.5px', color: '#455a64', marginTop: '3px', fontWeight: 500 }}>
              {currentLanguage === 'en'
                ? 'Karnataka State Police · Crime Intelligence Platform'
                : 'ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ · ಅಪರಾಧ ಗುಪ್ತಚರ ವೇದಿಕೆ'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9',
            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700
          }}>
            🔒 {currentLanguage === 'en' ? 'Secured Portal' : 'ಸುರಕ್ಷಿತ ಪೋರ್ಟಲ್'}
          </div>
          <div style={{ textAlign: 'right', display: window.innerWidth < 640 ? 'none' : 'block' }}>
            <div style={{ fontSize: '11px', color: '#90a4ae', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {currentLanguage === 'en' ? 'Last Updated' : 'ಕೊನೆಯ ನವೀಕರಣ'}
            </div>
            <div style={{ fontSize: '13px', color: '#546e7a', fontWeight: 600 }}>
              {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation menu */}
      <div style={{
        background: 'linear-gradient(180deg,#283593 0%,#1a237e 100%)',
        padding: '0 12px',
        display: 'flex',
        gap: '0',
        flexWrap: 'wrap',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
      }}>
        {NAV_TABS.filter((tb) => (ROLE_TABS[user?.role || 'officer'] || ROLE_TABS.officer).includes(tb.en))
          .map((tb) => {
          const englishItem = tb.en;
          const item = currentLanguage === 'en' ? tb.en : tb.kn;
          const isActive = VIEW_TO_TAB[currentView] === englishItem;
          return (
            <div
              key={englishItem}
              onClick={() => handleMenuClick(englishItem)}
              style={{
                padding: '13px 16px',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.82)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.3px',
                transition: 'all 0.15s',
                backgroundColor: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                borderBottom: isActive ? '3px solid #ff9933' : '3px solid transparent',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </>
  );
};

// A single crime case card — scannable layout with accused name + status
const CrimeCaseCard = ({ crime, index, language, onClick }: { crime: CrimeRecord; index: number; language: 'en' | 'kn'; onClick?: (fir: string) => void }) => {
  const accent = accentFor(crime.crime_type);
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const accused = (crime.accused || []).map((n) => localizePersonName(n, language));
  const accusedText = accused.length
    ? (accused.length > 2 ? `${accused.slice(0, 2).join(', ')} +${accused.length - 2}` : accused.join(', '))
    : t('Unknown', 'ಅಜ್ಞಾತ');
  const st = statusStyle(crime.investigation_status);
  const clickable = !!(onClick && crime.fir_number);

  return (
    <div
      onClick={() => clickable && onClick!(crime.fir_number!)}
      title={clickable ? t('Click for full case details', 'ಪೂರ್ಣ ವಿವರಗಳಿಗೆ ಕ್ಲಿಕ್ ಮಾಡಿ') : undefined}
      style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e6e6e6',
      borderLeft: `5px solid ${accent}`,
      borderRadius: '8px',
      padding: '12px 14px',
      marginBottom: '10px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      cursor: clickable ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s',
    }}
    onMouseEnter={(e) => { if (clickable) e.currentTarget.style.boxShadow = '0 2px 10px rgba(26,35,126,0.2)'; }}
    onMouseLeave={(e) => { if (clickable) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }}
    >
      {/* Header: index + crime type + status pill + FIR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ backgroundColor: accent, color: 'white', fontSize: '11px', fontWeight: 700, padding: '3px 7px', borderRadius: '4px' }}>
            #{index + 1}
          </span>
          <span style={{ fontWeight: 700, color: accent, fontSize: '15px' }}>
            {localizeCrimeType(crime.crime_type, language)}
          </span>
          {crime.investigation_status && (
            <span style={{ backgroundColor: st.bg, color: st.fg, fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px' }}>
              {crime.investigation_status}
            </span>
          )}
        </div>
        <span style={{ fontSize: '12px', color: '#1976d2', fontWeight: 700, fontFamily: 'monospace' }}>
          {crime.fir_number || '—'}
        </span>
      </div>

      {/* Accused — the headline person info */}
      <div style={{ marginTop: '8px', fontSize: '14px', color: '#212121' }}>
        <span style={{ color: '#c62828', fontWeight: 600 }}>🚩 {t('Accused', 'ಆರೋಪಿ')}:</span>{' '}
        <strong>{accusedText}</strong>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '13px', color: '#555', marginTop: '6px' }}>
        <span>📍 {localizeDistrict(crime.district, language)}</span>
        <span>📅 {crime.date_occurred || '—'}</span>
        <span>🏢 {localizePlace(crime.police_station, language)}</span>
      </div>

      {/* Description */}
      {crime.description && (
        <div style={{ fontSize: '12.5px', color: '#777', marginTop: '6px' }}>
          📝 {localizeDescription(crime.description, language)}
        </div>
      )}

      {clickable && (
        <div style={{ fontSize: '11px', color: '#1976d2', fontWeight: 600, marginTop: '6px' }}>
          {t('View full case details ›', 'ಪೂರ್ಣ ವಿವರಗಳನ್ನು ವೀಕ್ಷಿಸಿ ›')}
        </div>
      )}
    </div>
  );
};

// Breakdown bar chart for chat (group-by results)
const BreakdownBars = ({ data, groupBy, language }: { data: BreakdownItem[]; groupBy?: string; language: 'en' | 'kn' }) => {
  const max = Math.max(...data.map(d => d.count), 1);
  const palette = ['#1a237e', '#283593', '#3949ab', '#5c6bc0', '#7986cb', '#ff9800', '#fb8c00', '#f57c00', '#e65100', '#00897b'];
  return (
    <div style={{ marginTop: '10px' }}>
      {data.map((d, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ width: '110px', fontSize: '13px', color: '#333', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {localizeLabel(d.label, language)}
          </div>
          <div style={{ flex: 1, backgroundColor: '#eceff1', borderRadius: '4px', height: '22px', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              width: `${(d.count / max) * 100}%`, height: '100%',
              backgroundColor: palette[idx % palette.length], borderRadius: '4px',
              transition: 'width 0.6s ease', minWidth: '3px'
            }} />
          </div>
          <div style={{ width: '34px', fontSize: '13px', fontWeight: 700, color: '#1a237e' }}>{d.count}</div>
        </div>
      ))}
    </div>
  );
};

// Full FIR detail card (accused, victims, investigation) — Phase 5
const CrimeDetailCard = ({ detail, language, onPersonClick }:
  { detail: CrimeDetail; language: 'en' | 'kn'; onPersonClick?: (id: number) => void }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const accent = accentFor(detail.crime_type);
  const inv = detail.investigation;

  const PersonChip = ({ p, clickable }: { p: PersonBrief; clickable?: boolean }) => {
    const canClick = !!(clickable && onPersonClick && p.id);
    return (
      <span
        onClick={() => canClick && onPersonClick!(p.id)}
        title={canClick ? t('Click for full criminal profile', 'ಪೂರ್ಣ ಪ್ರೊಫೈಲ್‌ಗಾಗಿ ಕ್ಲಿಕ್ ಮಾಡಿ') : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          backgroundColor: '#fff', border: `1px solid ${canClick ? '#c62828' : '#e0e0e0'}`,
          borderRadius: '14px', padding: '3px 10px', fontSize: '12px', margin: '2px',
          cursor: canClick ? 'pointer' : 'default',
        }}
      >
        {p.photo
          ? <img src={p.photo} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
          : '👤'} {localizePersonName(p.name, language)}{p.age ? `, ${p.age}` : ''}{p.district ? ` · ${localizeDistrict(p.district, language)}` : ''}{canClick ? ' 🔎' : ''}
      </span>
    );
  };

  return (
    <div style={{
      backgroundColor: '#ffffff', border: '1px solid #e0e0e0',
      borderTop: `4px solid ${accent}`, borderRadius: '8px',
      padding: '14px 16px', marginTop: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: 700, color: accent, fontSize: '16px' }}>
          {localizeCrimeType(detail.crime_type, language)}
        </span>
        <span style={{ fontFamily: 'monospace', color: '#1976d2', fontWeight: 600 }}>{detail.fir_number}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '13px', color: '#444', marginBottom: '10px' }}>
        <span>📍 {localizeDistrict(detail.district, language)}</span>
        <span>📅 {detail.date_occurred}</span>
        <span>🏢 {localizePlace(detail.police_station, language)}</span>
      </div>
      {detail.description && (
        <div style={{ fontSize: '13px', color: '#666', backgroundColor: '#fafafa', padding: '8px 10px', borderRadius: '6px', marginBottom: '10px' }}>
          📝 {localizeDescription(detail.description, language)}
        </div>
      )}

      {/* Investigation block */}
      {inv && (
        <div style={{ backgroundColor: '#e8eaf6', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px', fontSize: '13px' }}>
          <div style={{ fontWeight: 600, color: '#1a237e', marginBottom: '4px' }}>🔎 {t('Investigation', 'ತನಿಖೆ')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', color: '#333' }}>
            <span><strong>{t('Status', 'ಸ್ಥಿತಿ')}:</strong> {inv.status || '—'}</span>
            <span><strong>{t('Officer', 'ಅಧಿಕಾರಿ')}:</strong> {inv.officer || '—'}</span>
            <span><strong>IPC:</strong> {inv.ipc_sections || '—'}</span>
            <span><strong>{t('Arrest', 'ಬಂಧನ')}:</strong> {inv.arrest_made ? t('Yes', 'ಹೌದು') : t('No', 'ಇಲ್ಲ')}</span>
            <span><strong>{t('Outcome', 'ಫಲಿತಾಂಶ')}:</strong> {inv.outcome || '—'}</span>
          </div>
        </div>
      )}

      {/* People */}
      <div style={{ fontSize: '13px' }}>
        <div style={{ marginBottom: '6px' }}>
          <strong style={{ color: '#c62828' }}>🚩 {t('Accused', 'ಆರೋಪಿ')} ({detail.accused.length}):</strong>{' '}
          {detail.accused.length ? detail.accused.map((p) => <PersonChip key={p.id} p={p} clickable />) : <span style={{ color: '#999' }}>—</span>}
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong style={{ color: '#1976d2' }}>🛡️ {t('Victims', 'ಸಂತ್ರಸ್ತರು')} ({detail.victims.length}):</strong>{' '}
          {detail.victims.length ? detail.victims.map((p) => <PersonChip key={p.id} p={p} />) : <span style={{ color: '#999' }}>—</span>}
        </div>
        {detail.witnesses.length > 0 && (
          <div>
            <strong style={{ color: '#00897b' }}>👁️ {t('Witnesses', 'ಸಾಕ್ಷಿಗಳು')} ({detail.witnesses.length}):</strong>{' '}
            {detail.witnesses.map((p) => <PersonChip key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// Full offender dossier card — shown when an officer clicks an accused on an
// FIR. Surfaces the complete criminal intelligence for that person.
const PersonProfileCard = ({ p, language }: { p: PersonProfile; language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const d = p.demographics || {};
  const risk = p.risk_score ?? 0;
  const riskColor = risk >= 70 ? '#c62828' : risk >= 40 ? '#ef6c00' : '#2e7d32';
  const riskLabel = risk >= 70 ? t('High', 'ಅಧಿಕ') : risk >= 40 ? t('Medium', 'ಮಧ್ಯಮ') : t('Low', 'ಕಡಿಮೆ');

  return (
    <div style={{
      backgroundColor: '#fff', border: '1px solid #e0e0e0', borderTop: '4px solid #c62828',
      borderRadius: '8px', padding: '14px 16px', marginTop: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontWeight: 700, color: '#1a237e', fontSize: '16px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {p.photo
            ? <img src={p.photo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #cfd8dc' }} />
            : '👤'} {localizePersonName(p.name, language)}
          {p.is_repeat_offender && (
            <span style={{ marginLeft: 8, fontSize: 11, background: '#c62828', color: '#fff', padding: '2px 8px', borderRadius: 10 }}>
              {t('REPEAT OFFENDER', 'ಪುನರಾವರ್ತಿತ ಅಪರಾಧಿ')}
            </span>
          )}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: riskColor }}>
          {t('Risk', 'ಅಪಾಯ')}: {risk}/100 ({riskLabel})
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: '#444', marginBottom: '10px' }}>
        {d.age != null && <span>🎂 {d.age}</span>}
        {d.gender && <span>⚧ {d.gender}</span>}
        {d.occupation && <span>💼 {d.occupation}</span>}
        {d.education && <span>🎓 {d.education}</span>}
        {d.socio_economic_status && <span>🏷️ {d.socio_economic_status}</span>}
        {d.district && <span>📍 {localizeDistrict(d.district, language)}</span>}
        {d.phone && <span>📞 {d.phone}</span>}
      </div>

      {/* Prior record */}
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <strong style={{ color: '#c62828' }}>🗂️ {t('Case history', 'ಪ್ರಕರಣ ಇತಿಹಾಸ')} ({p.accused_in_n_cases ?? (p.cases?.length || 0)}):</strong>
        {p.cases && p.cases.length ? (
          <div style={{ marginTop: 4 }}>
            {p.cases.slice(0, 8).map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: '#333', padding: '2px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontFamily: 'monospace', color: '#1976d2' }}>{c.fir_number}</span>
                {' — '}{localizeCrimeType(c.crime_type, language)}, {localizeDistrict(c.district, language)} ({c.date}) · <em>{c.role}</em>
              </div>
            ))}
          </div>
        ) : <span style={{ color: '#999' }}> —</span>}
      </div>

      {/* Gangs */}
      {p.gangs && p.gangs.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          <strong style={{ color: '#6a1b9a' }}>🕸️ {t('Gang links', 'ಗ್ಯಾಂಗ್ ಸಂಪರ್ಕ')}:</strong>{' '}
          {p.gangs.map((g, i) => <span key={i}>{g.gang} ({g.role}, {g.activity}){i < p.gangs!.length - 1 ? '; ' : ''}</span>)}
        </div>
      )}

      {/* Associates */}
      {p.associates && p.associates.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          <strong style={{ color: '#00695c' }}>👥 {t('Known associates', 'ಪರಿಚಿತ ಸಹಚರರು')} ({p.associates.length}):</strong>{' '}
          {p.associates.slice(0, 8).map((a) => localizePersonName(a.name, language)).join(', ')}
        </div>
      )}

      {/* Financial */}
      {p.financial_accounts && p.financial_accounts.length > 0 && (
        <div style={{ fontSize: 13 }}>
          <strong style={{ color: '#ef6c00' }}>💰 {t('Financial accounts', 'ಹಣಕಾಸು ಖಾತೆಗಳು')} ({p.financial_accounts.length}):</strong>{' '}
          {p.financial_accounts.filter(a => a.flagged).length > 0 && (
            <span style={{ color: '#c62828', fontWeight: 600 }}>
              {p.financial_accounts.filter(a => a.flagged).length} {t('flagged', 'ಗುರುತಿಸಲಾಗಿದೆ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Filter chips showing what the AI detected
const FilterChips = ({ entities, language }: { entities?: Record<string, any>; language: 'en' | 'kn' }) => {
  if (!entities) return null;
  const chips: string[] = [];
  if (entities.crime_type) chips.push(`🏷️ ${localizeCrimeType(entities.crime_type, language)}`);
  if (entities.location) chips.push(`📍 ${localizeDistrict(entities.location, language)}`);
  if (entities.date_range) chips.push(`📅 ${entities.date_range.start} → ${entities.date_range.end}`);
  if (entities.group_by) {
    const dim = language === 'en' ? entities.group_by
      : (entities.group_by === 'district' ? 'ಜಿಲ್ಲೆ' : entities.group_by === 'crime_type' ? 'ಪ್ರಕಾರ' : 'ತಿಂಗಳು');
    chips.push(`📊 ${language === 'en' ? 'by ' : ''}${dim}${language === 'kn' ? ' ಪ್ರಕಾರ' : ''}`);
  }
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
      <span style={{ fontSize: '11px', color: '#888', alignSelf: 'center' }}>
        {language === 'en' ? 'Detected:' : 'ಪತ್ತೆ:'}
      </span>
      {chips.map((c, i) => (
        <span key={i} style={{
          fontSize: '12px', backgroundColor: '#e8eaf6', color: '#1a237e',
          padding: '2px 8px', borderRadius: '12px', fontWeight: 500
        }}>{c}</span>
      ))}
    </div>
  );
};

// Expandable "Why this answer?" evidence trail (Explainable AI — Area 9)
const EvidencePanel = ({ evidence, language }: { evidence: Record<string, any>; language: 'en' | 'kn' }) => {
  const [open, setOpen] = useState(false);
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const filters = evidence.filters_applied || {};
  const filterText = Object.keys(filters).length
    ? Object.entries(filters).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')
    : t('none', 'ಇಲ್ಲ');

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer',
          fontSize: 12, fontWeight: 600, padding: 0
        }}
      >
        {open ? '▼' : '▶'} 🔎 {t('Why this answer?', 'ಈ ಉತ್ತರ ಏಕೆ?')}
      </button>
      {open && (
        <div style={{
          marginTop: 6, background: '#f3f6fc', border: '1px solid #d6e0f0',
          borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#333', lineHeight: 1.7
        }}>
          <div><strong>{t('Intent', 'ಉದ್ದೇಶ')}:</strong> {evidence.intent} ({t('confidence', 'ವಿಶ್ವಾಸ')} {(evidence.confidence * 100).toFixed(0)}%)</div>
          {evidence.engine && (
            <div><strong>{t('Understood by', 'ಅರ್ಥೈಸಿದವರು')}:</strong> {evidence.engine}</div>
          )}
          <div><strong>{t('Filters applied', 'ಅನ್ವಯಿಸಿದ ಫಿಲ್ಟರ್‌ಗಳು')}:</strong> {filterText}</div>
          <div><strong>{t('Records examined', 'ಪರಿಶೀಲಿಸಿದ ದಾಖಲೆಗಳು')}:</strong> {evidence.records_examined}</div>
          <div><strong>{t('Data source', 'ಡೇಟಾ ಮೂಲ')}:</strong> {evidence.data_source}</div>
          <div><strong>{t('Method', 'ವಿಧಾನ')}:</strong> {evidence.method}</div>
          {evidence.normalized_query && (
            <div><strong>{t('Interpreted as', 'ಅರ್ಥೈಸಲಾಗಿದೆ')}:</strong> "{evidence.normalized_query}"</div>
          )}
          {evidence.sql && (
            <div style={{ marginTop: 4 }}><strong>SQL:</strong> <code style={{ fontSize: 11 }}>{evidence.sql}</code></div>
          )}
        </div>
      )}
    </div>
  );
};

// Government-styled message bubble
const MessageBubble = ({ message, language, onCrimeClick, onPersonClick }:
  { message: ChatMessage; language: 'en' | 'kn'; onCrimeClick?: (fir: string) => void; onPersonClick?: (id: number) => void }) => {
  const hasResults = message.results && message.results.length > 0;
  const hasBreakdown = message.breakdown && message.breakdown.length > 0;
  const isRich = !message.isUser && (hasResults || hasBreakdown);

  return (
    <div style={{
      display: 'flex',
      margin: '15px 0',
      justifyContent: message.isUser ? 'flex-end' : 'flex-start',
      alignItems: 'flex-start',
      width: '100%'
    }}>
      {!message.isUser && (
        <div style={{
          width: '40px',
          height: '40px',
          backgroundColor: '#1a237e',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '18px',
          marginRight: '12px',
          flexShrink: 0
        }}>
          AI
        </div>
      )}
      <div style={{
        backgroundColor: message.isUser ? '#e3f2fd' : '#f5f5f5',
        color: '#212121',
        border: message.isUser ? '2px solid #1976d2' : '2px solid #e0e0e0',
        borderRadius: '8px',
        padding: '14px 18px',
        flex: isRich ? 1 : undefined,       // rich messages fill the pane width
        maxWidth: isRich ? undefined : '70%',
        minWidth: '100px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        fontSize: '15px',
        lineHeight: '1.6',
        wordWrap: 'break-word',
        wordBreak: 'break-word',
        overflowWrap: 'break-word'
      }}>
        {message.loading ? (
          <span style={{ color: '#666' }}>⏳ Processing your query...</span>
        ) : (
          <>
            {!message.isUser && (
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', fontWeight: '600' }}>
                🤖 KSP AI ASSISTANT
              </div>
            )}
            {/* Briefing banner */}
            {message.intent === 'BRIEFING' && (
              <div style={{
                fontSize: '12px', fontWeight: 700, color: '#fff', background: 'linear-gradient(90deg,#1a237e,#3949ab)',
                padding: '6px 12px', borderRadius: '6px', marginBottom: '10px', display: 'inline-block'
              }}>
                🛡️ AI INTELLIGENCE BRIEFING
              </div>
            )}
            {/* Answer text */}
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: isRich ? '12px' : 0 }}>{message.text}</div>

            {/* Detected filters */}
            {!message.isUser && <FilterChips entities={message.entities} language={language} />}

            {/* Breakdown chart */}
            {hasBreakdown && <BreakdownBars data={message.breakdown!} groupBy={message.groupBy} language={language} />}

            {/* FIR detail card */}
            {message.detail && <CrimeDetailCard detail={message.detail} language={language} onPersonClick={onPersonClick} />}

            {/* Full offender profile card (drill-down from an accused) */}
            {message.personProfile && <PersonProfileCard p={message.personProfile} language={language} />}

            {/* Crime case cards */}
            {hasResults && (
              <div style={{ marginTop: '4px' }}>
                {message.results!.map((crime, idx) => (
                  <CrimeCaseCard key={crime.id ?? idx} crime={crime} index={idx} language={language} onClick={onCrimeClick} />
                ))}
                <div style={{ fontSize: '12px', color: '#888', textAlign: 'center', marginTop: '4px' }}>
                  ✅ {message.results!.length} {language === 'en' ? 'record(s) shown' : 'ದಾಖಲೆ(ಗಳು) ತೋರಿಸಲಾಗಿದೆ'}
                </div>
              </div>
            )}

            {/* Explainable-AI evidence trail */}
            {!message.isUser && message.evidence && <EvidencePanel evidence={message.evidence} language={language} />}
          </>
        )}
      </div>
      {message.isUser && (
        <div style={{
          width: '40px',
          height: '40px',
          backgroundColor: '#1976d2',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '18px',
          marginLeft: '12px',
          flexShrink: 0
        }}>
          👤
        </div>
      )}
    </div>
  );
};

// Government-styled input field
const InputField = ({ 
  onSubmit, 
  placeholder,
  disabled 
}: { 
  onSubmit: (text: string) => void; 
  placeholder: string;
  disabled?: boolean;
}) => {
  const [input, setInput] = useState('');

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim() && !disabled) {
      onSubmit(input);
      setInput('');
    }
  };

  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSubmit(input);
      setInput('');
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      gap: '12px', 
      padding: '0',
      alignItems: 'center',
      width: '100%'
    }}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '14px 20px',
          border: '2px solid #bdbdbd',
          borderRadius: '6px',
          fontSize: '15px',
          outline: 'none',
          transition: 'border-color 0.2s',
          opacity: disabled ? 0.6 : 1,
          fontFamily: 'inherit'
        }}
        onFocus={(e) => e.target.style.borderColor = '#1976d2'}
        onBlur={(e) => e.target.style.borderColor = '#bdbdbd'}
      />
      <button
        onClick={handleSubmit}
        disabled={!input.trim() || disabled}
        style={{
          backgroundColor: input.trim() && !disabled ? '#1976d2' : '#bdbdbd',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '14px 30px',
          cursor: input.trim() && !disabled ? 'pointer' : 'not-allowed',
          fontSize: '15px',
          fontWeight: '600',
          transition: 'all 0.2s',
          boxShadow: input.trim() && !disabled ? '0 2px 4px rgba(25,118,210,0.3)' : 'none'
        }}
      >
        SUBMIT QUERY
      </button>
    </div>
  );
};

// Government-styled voice button
const VoiceButton = ({
  onVoiceResult,
  disabled,
  language
}: {
  onVoiceResult: (text: string) => void;
  disabled?: boolean;
  language: 'en' | 'kn';
}) => {
  const [isListening, setIsListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  const showNote = (msg: string) => {
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 4000);
  };

  const begin = (lang: string, isRetry = false) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onVoiceResult(transcript);
    };

    recognition.onerror = (event: any) => {
      const err = event.error;
      if (err === 'language-not-supported' && !isRetry) {
        showNote(language === 'en' ? 'Kannada voice unavailable — using English.' : 'ಇಂಗ್ಲಿಷ್ ಧ್ವನಿ ಬಳಸಲಾಗುತ್ತಿದೆ.');
        setTimeout(() => begin('en-IN', true), 250);
        return;
      }
      if (err === 'no-speech') {
        showNote(language === 'en' ? "Didn't hear anything — try again." : 'ಏನೂ ಕೇಳಿಸಲಿಲ್ಲ — ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');
      } else if (err === 'not-allowed' || err === 'service-not-allowed') {
        showNote(language === 'en' ? 'Allow microphone access in the browser, then reload.' : 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿಸಿ.');
      } else if (err === 'audio-capture') {
        showNote(language === 'en' ? 'Chrome can’t use the mic — open chrome://settings/content/microphone and select your device.' : 'Chrome ಮೈಕ್ ಸೆಟ್ಟಿಂಗ್‌ನಲ್ಲಿ ಸಾಧನ ಆಯ್ಕೆಮಾಡಿ.');
      } else if (err === 'network') {
        showNote(language === 'en' ? 'Voice needs an internet connection.' : 'ಧ್ವನಿಗೆ ಇಂಟರ್ನೆಟ್ ಅಗತ್ಯ.');
      } else if (err !== 'aborted') {
        showNote(language === 'en' ? 'Voice error — please type instead.' : 'ಧ್ವನಿ ದೋಷ — ಟೈಪ್ ಮಾಡಿ.');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
    }
  };

  const handleVoiceClick = async () => {
    // If already listening, stop (toggle) and release the mic.
    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      setIsListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showNote(language === 'en' ? 'Voice needs Chrome or Edge.' : 'ಧ್ವನಿಗೆ Chrome ಅಥವಾ Edge ಬಳಸಿ.');
      return;
    }

    // Definitive capability check: is there a usable mic + permission?
    // This gives an accurate reason and grants permission before recognition.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((tr) => tr.stop());   // release immediately
        await new Promise((r) => setTimeout(r, 400));     // let the OS free it
      } catch (e: any) {
        const n = e?.name || '';
        if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
          showNote(language === 'en' ? 'No microphone is connected to this computer.' : 'ಈ ಕಂಪ್ಯೂಟರ್‌ಗೆ ಮೈಕ್ರೊಫೋನ್ ಸಂಪರ್ಕವಿಲ್ಲ.');
        } else if (n === 'NotReadableError' || n === 'TrackStartError') {
          showNote(language === 'en' ? 'Mic is locked by another app (Zoom/Teams/etc). Close it or restart the PC.' : 'ಮೈಕ್ ಬೇರೆ ಅಪ್ಲಿಕೇಶನ್ ಬಳಸುತ್ತಿದೆ.');
        } else if (n === 'NotAllowedError' || n === 'SecurityError') {
          showNote(language === 'en' ? 'Allow mic in the address-bar icon, then reload.' : 'ಮೈಕ್ ಅನುಮತಿಸಿ, ನಂತರ ಮರುಲೋಡ್ ಮಾಡಿ.');
        } else {
          showNote(language === 'en' ? 'Could not access the microphone.' : 'ಮೈಕ್ರೊಫೋನ್ ಪ್ರವೇಶಿಸಲಾಗಲಿಲ್ಲ.');
        }
        return;
      }
    }

    begin(language === 'kn' ? 'kn-IN' : 'en-IN');
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {note && (
        <div style={{
          position: 'absolute', bottom: '110%', left: 0, whiteSpace: 'nowrap',
          background: '#37474f', color: '#fff', fontSize: '12px', padding: '6px 10px',
          borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', zIndex: 10
        }}>
          {note}
        </div>
      )}
      <button
        onClick={handleVoiceClick}
        disabled={disabled}
        style={{
          backgroundColor: isListening ? '#d32f2f' : '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '14px 24px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          fontSize: '15px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.2s',
          boxShadow: isListening ? '0 0 20px rgba(211,47,47,0.5)' : '0 2px 4px rgba(25,118,210,0.3)'
        }}
        title={isListening ? 'Click to stop' : 'Click to speak'}
      >
        🎤 {isListening ? (language === 'en' ? 'LISTENING...' : 'ಆಲಿಸುತ್ತಿದೆ...') : (language === 'en' ? 'VOICE' : 'ಧ್ವನಿ')}
      </button>
    </div>
  );
};

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { text: "Namaste! 🙏 Welcome to Karnataka State Police Crime Database AI Assistant.\n\nI can help you query crime records across Karnataka. You can ask questions like:\n\n• 'Show crimes in Bengaluru'\n• 'How many thefts in Mysuru last month'\n• 'Crimes by district'\n\nPlease type your query below or use the voice button to speak.", isUser: false }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'kn'>('en');
  const [currentView, setCurrentView] = useState<ViewType>('chat');
  const [user, setUser] = useState<AuthUser | null>(getUser());
  // Right-hand detail panel in the AI Assistant (case / person drill-down).
  const [detailPanel, setDetailPanel] = useState<
    { kind: 'crime'; data: CrimeDetail } | { kind: 'person'; data: PersonProfile } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationContext = useRef<any>(null);  // carries entities + last_fir across turns

  // Called when the token is rejected (expired/invalid) — force re-login
  const handleSessionExpired = () => {
    clearAuth();
    setUser(null);
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setCurrentView('chat');
  };

  // Function to switch language
  const switchLanguage = (lang: 'en' | 'kn') => {
    setCurrentLanguage(lang);
    conversationContext.current = null;  // fresh conversation
    const welcomeMessages = {
      en: "Namaste! 🙏 Welcome to Karnataka State Police Crime Database AI Assistant.\n\nI can help you query crime records across Karnataka. Ask questions like:\n• 'Show crimes in Bengaluru'\n• 'How many thefts in Mysuru last month'\n• 'Count murders in Belagavi'",
      kn: "ನಮಸ್ಕಾರ! 🙏 ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ ಅಪರಾಧ ಡೇಟಾಬೇಸ್ AI ಸಹಾಯಕರಿಗೆ ಸ್ವಾಗತ.\n\nನಾನು ಕರ್ನಾಟಕದಾದ್ಯಂತ ಅಪರಾಧ ದಾಖಲೆಗಳನ್ನು ಪ್ರಶ್ನಿಸಲು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ.\n\nಉದಾಹರಣೆಗಳು:\n• 'ಬೆಂಗಳೂರಿನಲ್ಲಿ ಅಪರಾಧಗಳನ್ನು ತೋರಿಸಿ'\n• 'ಮೈಸೂರಿನಲ್ಲಿ ಎಷ್ಟು ಕಳ್ಳತನಗಳು'\n• 'ಬೆಳಗಾವಿಯಲ್ಲಿ ಕೊಲೆಗಳನ್ನು ಎಣಿಸಿ'"
    };
    setMessages([{ text: welcomeMessages[lang], isUser: false }]);
    console.log(`Language switched to ${lang === 'en' ? 'English' : 'Kannada'}`);
  };

  const detectLanguage = (text: string): 'en' | 'kn' => {
    const kannadaPattern = /[ಀ-೿]/;
    return kannadaPattern.test(text) ? 'kn' : 'en';
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (text: string) => {
    if (isLoading) return;

    setMessages(prev => [...prev, { text, isUser: true }]);
    setMessages(prev => [...prev, { text: 'Processing...', isUser: false, loading: true }]);
    setIsLoading(true);

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          text,
          language: detectLanguage(text),
          context: conversationContext.current
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => prev.slice(0, -1));

      // Persist conversation context for follow-up queries
      if (data.context !== undefined) {
        conversationContext.current = data.context;
      }

      if (data.error) {
        setMessages(prev => [...prev, { 
          text: `⚠️ Error: ${data.error}\n\nPlease try rephrasing your query or include a location/date range.`, 
          isUser: false 
        }]);
      } else if (data.intent === 'FIR_DETAIL') {
        // Detail / follow-up about a specific FIR
        setMessages(prev => [...prev, {
          text: data.answer,
          isUser: false,
          intent: data.intent,
          detail: data.detail
        }]);
      } else if (data.intent === 'BRIEFING') {
        setMessages(prev => [...prev, {
          text: data.answer,
          isUser: false,
          intent: 'BRIEFING',
        }]);
      } else if (data.intent === 'CASE_SUMMARY') {
        const cs = data.case_summary;
        let txt = data.answer + '\n\n';
        txt += (currentLanguage === 'en' ? '📅 Timeline:\n' : '📅 ಕಾಲರೇಖೆ:\n');
        (cs.timeline || []).forEach((e: any) => { txt += `  • ${e.date} — ${e.event}\n`; });
        txt += '\n' + (currentLanguage === 'en' ? '🔍 Investigative leads:\n' : '🔍 ತನಿಖಾ ಸುಳಿವುಗಳು:\n');
        (cs.leads || []).forEach((l: string) => { txt += `  • ${l}\n`; });
        setMessages(prev => [...prev, { text: txt, isUser: false, intent: data.intent, detail: cs.detail }]);
      } else if (data.intent === 'SIMILAR_CASES') {
        const sc = data.similar_cases;
        let txt = data.answer + '\n\n';
        (sc.similar_cases || []).forEach((c: any, i: number) => {
          txt += `${i + 1}. ${c.fir_number} — ${c.crime_type}, ${c.district} (${c.date})\n`;
          txt += `   ${currentLanguage === 'en' ? 'Outcome' : 'ಫಲಿತಾಂಶ'}: ${c.outcome || '—'} | ${currentLanguage === 'en' ? 'MO' : 'ವಿಧಾನ'}: ${c.modus_operandi || '—'}\n`;
        });
        setMessages(prev => [...prev, { text: txt, isUser: false, intent: data.intent }]);
      } else if (data.intent === 'BREAKDOWN_CRIMES') {
        // Render aggregation as a bar chart
        const breakdown = data.results || [];
        setMessages(prev => [...prev, {
          text: currentLanguage === 'kn'
            ? buildAnswer('kn', 'BREAKDOWN_CRIMES', data.entities || {}, breakdown.length)
            : data.answer,
          isUser: false,
          intent: data.intent,
          entities: data.entities,
          breakdown,
          groupBy: data.entities?.group_by,
          evidence: data.evidence
        }]);
      } else {
        // SHOW / COUNT / PERSON_QUERY / UNKNOWN — render answer plus crime case cards
        const results = data.results || [];
        const useServerAnswer = data.intent === 'PERSON_QUERY' || currentLanguage !== 'kn';
        setMessages(prev => [...prev, {
          text: useServerAnswer
            ? data.answer
            : buildAnswer('kn', data.intent, data.entities || {}, results.length),
          isUser: false,
          intent: data.intent,
          entities: data.entities,
          results,
          evidence: data.evidence
        }]);
      }
    } catch (error: any) {
      setMessages(prev => prev.slice(0, -1));
      if (error.message === 'UNAUTHORIZED') {
        setIsLoading(false);
        handleSessionExpired();
        return;
      }
      setMessages(prev => [...prev, { 
        text: "⚠️ Connection Error\n\nUnable to connect to the server. Please ensure:\n• Backend server is running\n• You have internet connectivity\n• Try refreshing the page", 
        isUser: false 
      }]);
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceResult = (transcript: string) => {
    handleSubmit(transcript);
  };

  // Click a crime card → fetch and append its full FIR detail
  // Clicking a case/person opens it in the right-hand detail panel (on wide
  // screens); on narrow screens it falls back to appending inline in the chat.
  const wideScreen = () => typeof window !== 'undefined' && window.innerWidth >= 900;

  const showFirDetail = async (fir: string) => {
    if (!fir) return;
    const wide = wideScreen();
    if (wide) { setDetailLoading(true); setDetailPanel(null); }
    else setMessages(prev => [...prev, { text: `Loading ${fir}...`, isUser: false, loading: true }]);
    try {
      const res = await apiFetch(`/api/crime/${fir}`);
      const detail = await res.json();
      conversationContext.current = { ...(conversationContext.current || {}), last_fir: fir };
      if (wide) {
        setDetailPanel({ kind: 'crime', data: detail });
        setDetailLoading(false);
      } else {
        setMessages(prev => prev.slice(0, -1));
        setMessages(prev => [...prev, {
          text: `📁 ${currentLanguage === 'en' ? 'Full details for' : 'ಪೂರ್ಣ ವಿವರಗಳು'} ${fir}:`,
          isUser: false, intent: 'FIR_DETAIL', detail,
        }]);
      }
    } catch (e: any) {
      setDetailLoading(false);
      if (!wide) setMessages(prev => prev.slice(0, -1));
      if (e.message === 'UNAUTHORIZED') { handleSessionExpired(); return; }
      if (!wide) setMessages(prev => [...prev, { text: `Could not load ${fir}.`, isUser: false }]);
    }
  };

  // Click an accused → fetch their full criminal dossier (panel on wide screens)
  const showPersonDetail = async (personId: number) => {
    if (!personId) return;
    const wide = wideScreen();
    if (wide) { setDetailLoading(true); setDetailPanel(null); }
    else setMessages(prev => [...prev, { text: 'Loading criminal profile...', isUser: false, loading: true }]);
    try {
      const res = await apiFetch(`/api/person/${personId}`);
      const profile = await res.json();
      if (wide) {
        setDetailPanel({ kind: 'person', data: profile });
        setDetailLoading(false);
      } else {
        setMessages(prev => prev.slice(0, -1));
        setMessages(prev => [...prev, {
          text: `🕵️ ${currentLanguage === 'en' ? 'Full criminal profile for' : 'ಪೂರ್ಣ ಅಪರಾಧ ಪ್ರೊಫೈಲ್'} ${profile.name}:`,
          isUser: false, intent: 'PERSON_PROFILE', personProfile: profile,
        }]);
      }
    } catch (e: any) {
      setDetailLoading(false);
      if (!wide) setMessages(prev => prev.slice(0, -1));
      if (e.message === 'UNAUTHORIZED') { handleSessionExpired(); return; }
      if (!wide) setMessages(prev => [...prev, { text: 'Could not load the criminal profile.', isUser: false }]);
    }
  };

  // Export the conversation as a PDF (via the browser's print-to-PDF, which
  // renders Kannada correctly (via html2canvas) and downloads directly — no
  // new tab, no print dialog.
  const exportConversationPDF = async () => {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Reusable block builders for a full case / offender detail.
    const crimeBlock = (d: CrimeDetail): string => {
      const inv = d.investigation;
      return `<div class="msg left"><div class="bubble" style="background:#fff8e1">
        <div class="who">📁 ${currentLanguage === 'en' ? 'CASE DETAIL' : 'ಪ್ರಕರಣ ವಿವರ'} — ${esc(d.fir_number)}</div>
        <div class="rec"><b>${esc(localizeCrimeType(d.crime_type, currentLanguage))}</b> — ${esc(localizeDistrict(d.district, currentLanguage))} · ${esc(d.police_station || '')} · ${esc(d.date_occurred)}</div>
        ${inv ? `<div class="rec">Status: ${esc(inv.status || '—')} | Officer: ${esc(inv.officer || '—')} | IPC: ${esc(inv.ipc_sections || '—')} | Arrest: ${inv.arrest_made ? 'Yes' : 'No'} | Outcome: ${esc(inv.outcome || '—')}</div>` : ''}
        ${d.description ? `<div class="rec desc">${esc(localizeDescription(d.description, currentLanguage))}</div>` : ''}
        <div class="rec">🚩 Accused (${d.accused.length}): ${esc(d.accused.map(p => `${p.name}${p.age ? ', ' + p.age : ''}`).join('; ') || '—')}</div>
        <div class="rec">🛡️ Victims (${d.victims.length}): ${esc(d.victims.map(p => p.name).join('; ') || '—')}</div>
        ${d.witnesses.length ? `<div class="rec">👁️ Witnesses (${d.witnesses.length}): ${esc(d.witnesses.map(p => p.name).join('; '))}</div>` : ''}
      </div></div>`;
    };
    const personBlock = (p: PersonProfile): string => {
      const dm = p.demographics || {};
      return `<div class="msg left"><div class="bubble" style="background:#fff8e1">
        <div class="who">🕵️ ${currentLanguage === 'en' ? 'OFFENDER PROFILE' : 'ಅಪರಾಧಿ ವಿವರ'} — ${esc(p.name)}</div>
        <div class="rec">Risk: <b>${p.risk_score ?? '—'}/100</b>${p.is_repeat_offender ? ' · REPEAT OFFENDER' : ''}</div>
        <div class="rec">${[dm.age, dm.gender, dm.occupation, dm.education, dm.socio_economic_status, dm.district].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>
        <div class="rec">🗂️ Cases (${p.accused_in_n_cases ?? (p.cases?.length || 0)}): ${esc((p.cases || []).slice(0, 12).map(c => `${c.fir_number} (${localizeCrimeType(c.crime_type, currentLanguage)})`).join('; ') || '—')}</div>
        ${p.gangs && p.gangs.length ? `<div class="rec">🕸️ Gangs: ${esc(p.gangs.map(g => `${g.gang} (${g.role})`).join('; '))}</div>` : ''}
      </div></div>`;
    };

    // Build the transcript as MANY SMALL blocks (one per message, one per chunk
    // of ~10 result cards, one per detail) so page breaks land between blocks —
    // no mid-line overlap, and no giant empty gaps.
    const CHUNK = 10;
    const blockList: string[] = [];
    messages.filter(m => !m.loading).forEach(m => {
      const who = m.isUser ? (currentLanguage === 'en' ? 'Officer' : 'ಅಧಿಕಾರಿ') : 'KSP AI';
      const side = m.isUser ? 'right' : 'left';
      const bg = m.isUser ? '#e3f2fd' : '#f5f5f5';
      blockList.push(`<div class="msg ${side}"><div class="bubble" style="background:${bg}"><div class="who">${who}</div><div class="txt">${esc(m.text)}</div></div></div>`);

      if (m.results && m.results.length) {
        for (let i = 0; i < m.results.length; i += CHUNK) {
          const recs = m.results.slice(i, i + CHUNK).map((c, j) =>
            `<div class="rec">${i + j + 1}. <b>${esc(localizeCrimeType(c.crime_type, currentLanguage))}</b> — ${esc(localizeDistrict(c.district, currentLanguage))} | FIR: ${esc(c.fir_number || '')} | ${esc(c.date_occurred || '')}<br/><span class="desc">${esc(localizeDescription(c.description, currentLanguage))}</span></div>`
          ).join('');
          blockList.push(`<div class="msg left"><div class="bubble" style="background:#fff">${recs}</div></div>`);
        }
      }
      if (m.breakdown && m.breakdown.length) {
        const bars = m.breakdown.map(b => `<div class="rec">${esc(localizeLabel(b.label, currentLanguage))}: <b>${b.count}</b></div>`).join('');
        blockList.push(`<div class="msg left"><div class="bubble" style="background:#fff">${bars}</div></div>`);
      }
      if (m.detail) blockList.push(crimeBlock(m.detail));
      if (m.personProfile) blockList.push(personBlock(m.personProfile));
    });

    // Include whatever is open in the right-hand detail panel (the drill-down).
    if (detailPanel?.kind === 'crime') blockList.push(crimeBlock(detailPanel.data));
    else if (detailPanel?.kind === 'person') blockList.push(personBlock(detailPanel.data));

    const rows = blockList.join('');
    const detailHtml = '';  // panel detail is now folded into blockList above

    const title = currentLanguage === 'en'
      ? 'KSP Crime AI — Conversation Transcript'
      : 'ಕೆಎಸ್‌ಪಿ ಅಪರಾಧ AI — ಸಂಭಾಷಣೆ ದಾಖಲೆ';

    // Build an off-screen, print-styled node, rasterize it, and save as PDF.
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-10000px;top:0;width:780px;background:#ffffff;';
    container.innerHTML = `
<style>
  .ksp-pdf{font-family:"Segoe UI",Tahoma,sans-serif;padding:28px;color:#212121;background:#fff;}
  .ksp-pdf .hdr{border-bottom:3px solid #ff9800;padding-bottom:12px;margin-bottom:20px;}
  .ksp-pdf .hdr h1{color:#1a237e;font-size:20px;margin:0;}
  .ksp-pdf .hdr .sub{color:#666;font-size:13px;margin-top:4px;}
  .ksp-pdf .msg{display:flex;margin:10px 0;}
  .ksp-pdf .msg.right{justify-content:flex-end;}
  .ksp-pdf .bubble{max-width:75%;border:1px solid #e0e0e0;border-radius:8px;padding:10px 14px;}
  .ksp-pdf .who{font-size:11px;font-weight:700;color:#1a237e;margin-bottom:4px;}
  .ksp-pdf .txt{font-size:14px;white-space:pre-wrap;line-height:1.5;}
  .ksp-pdf .rec{font-size:12px;color:#444;border-top:1px solid #eee;margin-top:6px;padding-top:6px;}
  .ksp-pdf .desc{color:#777;}
  .ksp-pdf .ftr{margin-top:24px;border-top:1px solid #ccc;padding-top:10px;font-size:11px;color:#999;text-align:center;}
</style>
<div class="ksp-pdf">
  <div class="hdr"><h1>🛡️ ${title}</h1>
  <div class="sub">${currentLanguage === 'en' ? 'Government of Karnataka · Karnataka State Police' : 'ಕರ್ನಾಟಕ ಸರ್ಕಾರ · ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್'} · ${new Date().toLocaleString()}</div>
  <div class="sub">${currentLanguage === 'en' ? 'Officer' : 'ಅಧಿಕಾರಿ'}: ${esc(user?.name || '')}</div></div>
  ${rows}
  ${detailHtml}
  <div class="ftr">${currentLanguage === 'en' ? 'Confidential — for authorized law enforcement use only.' : 'ಗೌಪ್ಯ — ಅಧಿಕೃತ ಕಾನೂನು ಜಾರಿ ಬಳಕೆಗೆ ಮಾತ್ರ.'}</div>
</div>`;
    document.body.appendChild(container);

    try {
      const target = container.querySelector('.ksp-pdf') as HTMLElement;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210, pageH = 297, margin = 8;
      const usableW = pageW - margin * 2;
      const maxBlockMm = pageH - margin * 2;
      let cursorY = margin;

      // Render each top-level block (header, each message, detail, footer) to
      // its own image and flow it onto pages. A block is never split unless it
      // is taller than a full page — which prevents the mid-line overlap that
      // slicing one giant image caused.
      const addCanvasPaged = (canvas: HTMLCanvasElement) => {
        const imgH = (canvas.height * usableW) / canvas.width;
        if (imgH <= maxBlockMm) {
          if (cursorY + imgH > pageH - margin) { pdf.addPage(); cursorY = margin; }
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, cursorY, usableW, imgH);
          cursorY += imgH + 3;
          return;
        }
        // Oversized block (e.g. many result cards): slice vertically across pages.
        const pxPerPage = (maxBlockMm * canvas.width) / usableW;
        let sy = 0;
        while (sy < canvas.height) {
          const sliceH = Math.min(pxPerPage, canvas.height - sy);
          const slice = document.createElement('canvas');
          slice.width = canvas.width; slice.height = sliceH;
          slice.getContext('2d')!.drawImage(canvas, 0, sy, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceMm = (sliceH * usableW) / canvas.width;
          if (cursorY + sliceMm > pageH - margin) { pdf.addPage(); cursorY = margin; }
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, cursorY, usableW, sliceMm);
          cursorY += sliceMm + 2;
          sy += sliceH;
        }
      };

      const blocks = Array.from(target.children) as HTMLElement[];
      for (const block of blocks) {
        const c = await html2canvas(block, { scale: 2, backgroundColor: '#ffffff' });
        addCanvasPaged(c);
      }

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      pdf.save(`KSP_Conversation_${stamp}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
      alert(currentLanguage === 'en' ? 'Could not generate PDF.' : 'PDF ರಚಿಸಲಾಗಲಿಲ್ಲ.');
    } finally {
      document.body.removeChild(container);
    }
  };

  // If not authenticated, show the login screen
  if (!user || !isAuthenticated()) {
    return <Login onLogin={setUser} language={currentLanguage} />;
  }

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#fafafa',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      overflow: 'hidden'
    }}>
      <GovHeader 
        onLanguageChange={switchLanguage}
        onNavigate={setCurrentView}
        onLogout={handleLogout}
        user={user}
        currentView={currentView}
        currentLanguage={currentLanguage}
      />

      {/* Breadcrumb */}
      <div style={{
        background: '#eef1f8',
        padding: '9px 24px',
        fontSize: '12.5px',
        color: '#5a6b8c',
        borderBottom: '1px solid #dce1ee'
      }}>
        🏠 {currentLanguage === 'en' ? 'Home' : 'ಮುಖಪುಟ'} <span style={{ color: '#b0bec5' }}>›</span>
        {currentLanguage === 'en' ? ' Services' : ' ಸೇವೆಗಳು'} <span style={{ color: '#b0bec5' }}>›</span>
        {currentLanguage === 'en' ? ' Crime Database' : ' ಅಪರಾಧ ಡೇಟಾಬೇಸ್'} <span style={{ color: '#b0bec5' }}>›</span>
        <span style={{ color: '#1976d2', fontWeight: '600' }}>
          {currentView === 'dashboard'
            ? (currentLanguage === 'en' ? ' Dashboard' : ' ಡ್ಯಾಶ್‌ಬೋರ್ಡ್')
            : currentView === 'network'
            ? (currentLanguage === 'en' ? ' Network Analysis' : ' ಜಾಲ ವಿಶ್ಲೇಷಣೆ')
            : currentView === 'hotspots'
            ? (currentLanguage === 'en' ? ' Hotspot Map' : ' ಹಾಟ್‌ಸ್ಪಾಟ್ ನಕ್ಷೆ')
            : currentView === 'insights'
            ? (currentLanguage === 'en' ? ' Sociological Insights' : ' ಸಾಮಾಜಿಕ ಒಳನೋಟಗಳು')
            : currentView === 'profiles'
            ? (currentLanguage === 'en' ? ' Offender Profiling' : ' ಅಪರಾಧಿ ವಿಶ್ಲೇಷಣೆ')
            : currentView === 'finance'
            ? (currentLanguage === 'en' ? ' Financial Analysis' : ' ಆರ್ಥಿಕ ವಿಶ್ಲೇಷಣೆ')
            : currentView === 'forecast'
            ? (currentLanguage === 'en' ? ' Forecasting' : ' ಮುನ್ಸೂಚನೆ')
            : currentView === 'investigation'
            ? (currentLanguage === 'en' ? ' Case Investigation' : ' ಪ್ರಕರಣ ತನಿಖೆ')
            : currentView === 'register'
            ? (currentLanguage === 'en' ? ' Register FIR' : ' FIR ನೋಂದಣಿ')
            : currentView === 'audit'
            ? (currentLanguage === 'en' ? ' Audit Log' : ' ಲೆಕ್ಕಪರಿಶೋಧನೆ')
            : (currentLanguage === 'en' ? ' AI Assistant' : ' AI ಸಹಾಯಕ')}
        </span>
      </div>

      {/* Dashboard view */}
      {currentView === 'dashboard' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <Dashboard language={currentLanguage} />
        </div>
      )}

      {/* Network analysis view */}
      {currentView === 'network' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <NetworkView language={currentLanguage} />
        </div>
      )}

      {/* Hotspot map view */}
      {currentView === 'hotspots' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <HotspotView language={currentLanguage} />
        </div>
      )}

      {/* Sociological insights view */}
      {currentView === 'insights' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <InsightsView language={currentLanguage} />
        </div>
      )}

      {/* Offender profiles view */}
      {currentView === 'profiles' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <ProfilesView language={currentLanguage} />
        </div>
      )}

      {/* Financial crime view */}
      {currentView === 'finance' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <FinanceView language={currentLanguage} />
        </div>
      )}

      {/* Forecast view */}
      {currentView === 'forecast' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <ForecastView language={currentLanguage} />
        </div>
      )}

      {/* Case investigation view — look up a full case by Crime No (FIR) */}
      {currentView === 'investigation' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <CaseInvestigationView language={currentLanguage} />
        </div>
      )}

      {/* Register FIR view (role-gated write workflow) */}
      {currentView === 'register' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <RegisterFIRView language={currentLanguage} />
        </div>
      )}

      {/* Audit log view (admin only) */}
      {currentView === 'audit' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <AuditView language={currentLanguage} />
        </div>
      )}

      {/* Main chat area - NO SIDEBAR */}
      {currentView === 'chat' && (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', backgroundColor: '#ffffff', overflow: 'hidden' }}>
        {/* LEFT: conversation + input */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Chat messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '30px 50px',
            backgroundColor: '#fafafa'
          }}>
            {messages.map((message, index) => (
              <MessageBubble key={index} message={message} language={currentLanguage} onCrimeClick={showFirDetail} onPersonClick={showPersonDetail} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={{
            borderTop: '2px solid #e0e0e0',
            backgroundColor: '#ffffff',
            padding: '20px 50px',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <VoiceButton onVoiceResult={handleVoiceResult} disabled={isLoading} language={currentLanguage} />
              <InputField
                onSubmit={handleSubmit}
                placeholder={currentLanguage === 'en'
                  ? "Type your query here... (e.g., Show crimes in Bengaluru)"
                  : "ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ..."}
                disabled={isLoading}
              />
              <button
                onClick={exportConversationPDF}
                title={currentLanguage === 'en' ? 'Export conversation as PDF' : 'ಸಂಭಾಷಣೆಯನ್ನು PDF ಆಗಿ ರಫ್ತು ಮಾಡಿ'}
                style={{
                  backgroundColor: '#ff9800', color: 'white', border: 'none',
                  borderRadius: '6px', padding: '14px 18px', cursor: 'pointer',
                  fontSize: '15px', fontWeight: 600, whiteSpace: 'nowrap',
                  boxShadow: '0 2px 4px rgba(255,152,0,0.3)'
                }}
              >
                📄 PDF
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: case / person detail panel (wide screens) */}
        <div style={{
          width: 440, flexShrink: 0, borderLeft: '1px solid #e0e0e0',
          backgroundColor: '#f7f8fc', overflowY: 'auto',
          display: window.innerWidth < 900 ? 'none' : 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid #e6e9f0', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, color: '#1a237e', fontSize: 14 }}>
              🗂️ {currentLanguage === 'en' ? 'Case / Person Detail' : 'ಪ್ರಕರಣ / ವ್ಯಕ್ತಿ ವಿವರ'}
            </span>
            {(detailPanel || detailLoading) && (
              <button onClick={() => { setDetailPanel(null); setDetailLoading(false); }}
                title={currentLanguage === 'en' ? 'Close' : 'ಮುಚ್ಚಿ'}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#90a4ae' }}>✕</button>
            )}
          </div>

          <div style={{ padding: '16px 18px', flex: 1 }}>
            {detailLoading ? (
              <div style={{ padding: '60px 10px', textAlign: 'center', color: '#90a4ae' }}>
                ⏳ {currentLanguage === 'en' ? 'Loading details…' : 'ವಿವರ ಲೋಡ್ ಆಗುತ್ತಿದೆ…'}
              </div>
            ) : detailPanel?.kind === 'crime' ? (
              <CrimeDetailCard detail={detailPanel.data} language={currentLanguage} onPersonClick={showPersonDetail} />
            ) : detailPanel?.kind === 'person' ? (
              <PersonProfileCard p={detailPanel.data} language={currentLanguage} />
            ) : (
              <div style={{ padding: '50px 14px', textAlign: 'center', color: '#9aa2b5' }}>
                <div style={{ fontSize: 38, marginBottom: 10 }}>🗂️</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#556' }}>
                  {currentLanguage === 'en' ? 'Click a case or an accused' : 'ಪ್ರಕರಣ ಅಥವಾ ಆರೋಪಿಯನ್ನು ಕ್ಲಿಕ್ ಮಾಡಿ'}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  {currentLanguage === 'en'
                    ? 'Full case dossier and offender profiles open here.'
                    : 'ಪೂರ್ಣ ಪ್ರಕರಣ ವಿವರ ಇಲ್ಲಿ ತೆರೆಯುತ್ತದೆ.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Footer */}
      <div style={{
        background: 'linear-gradient(180deg,#1a237e 0%,#151d6e 100%)',
        color: 'white',
        padding: '10px 24px',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        borderTop: '3px solid #ff9933'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <span style={{
            width: '22px', height: '22px', borderRadius: '50%', background: '#ffffff',
            color: '#1a237e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '9px', fontWeight: 800, overflow: 'hidden'
          }}>
            <img src={KARNATAKA_EMBLEM_URL} alt="Emblem of Karnataka"
              style={{ width: '90%', height: '90%', objectFit: 'contain' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const s = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (s) s.style.display = 'inline';
              }} />
            <span style={{ display: 'none' }}>KSP</span>
          </span>
          {currentLanguage === 'en' ? 'Karnataka State Police' : 'ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್'}
        </span>

        <span style={{ color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          🔒 {currentLanguage === 'en' ? 'Confidential · Authorized use only' : 'ಗೌಪ್ಯ · ಅಧಿಕೃತ ಬಳಕೆ ಮಾತ್ರ'}
        </span>
      </div>
    </div>
  );
};

export default ChatPage;