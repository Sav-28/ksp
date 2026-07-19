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
import { apiFetch, isAuthenticated, getUser, clearAuth, AuthUser } from '../api';
import {
  localizeCrimeType, localizeDistrict, localizeDescription,
  localizePlace, localizeLabel, buildAnswer
} from '../locale';

type ViewType = 'chat' | 'dashboard' | 'network' | 'hotspots' | 'insights' | 'profiles' | 'finance' | 'forecast' | 'audit';

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
  evidence?: Record<string, any>;
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

// Government-styled header component
const GovHeader = ({ 
  onLanguageChange, 
  onShowRecords,
  onNavigate,
  onLogout,
  user,
  currentView,
  currentLanguage 
}: { 
  onLanguageChange: (lang: 'en' | 'kn') => void;
  onShowRecords: () => void;
  onNavigate: (view: ViewType) => void;
  onLogout: () => void;
  user: AuthUser | null;
  currentView: ViewType;
  currentLanguage: 'en' | 'kn';
}) => {
  const handleMenuClick = (menuItem: string) => {
    console.log(`Menu clicked: ${menuItem}`);
    if (menuItem === 'RECORDS') {
      onNavigate('chat');
      onShowRecords();
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
    } else if (menuItem === 'AUDIT') {
      onNavigate('audit');
    } else if (menuItem === 'AI ASSISTANT' || menuItem === 'HOME') {
      onNavigate('chat');
    }
  };

  return (
    <>
      {/* Top bar with language and accessibility */}
      <div style={{
        backgroundColor: '#1a237e',
        color: 'white',
        padding: '8px 20px',
        fontSize: '13px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <span style={{ marginRight: '15px' }}>📧 support@ksp.gov.in</span>
          <span>📞 100 (Emergency) | 1091 (Women Helpline)</span>
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
        backgroundColor: '#ffffff',
        padding: '15px 20px',
        borderBottom: '3px solid #ff9800',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            backgroundColor: '#1a237e',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '24px',
            cursor: 'pointer'
          }}
          onClick={() => window.location.reload()}
          title="Refresh"
          >
            ಕರ್
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#1a237e', lineHeight: '1.2' }}>
              {currentLanguage === 'en' ? 'GOVERNMENT OF KARNATAKA' : 'ಕರ್ನಾಟಕ ಸರ್ಕಾರ'}
            </div>
            <div style={{ fontSize: '16px', color: '#666', marginTop: '3px' }}>
              {currentLanguage === 'en' 
                ? 'Karnataka State Police - Crime Database AI Assistant'
                : 'ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ - ಅಪರಾಧ ಡೇಟಾಬೇಸ್ AI ಸಹಾಯಕ'}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>
            {currentLanguage === 'en' ? 'Secured Portal' : 'ಸುರಕ್ಷಿತ ಪೋರ್ಟಲ್'}
          </div>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
            {currentLanguage === 'en' ? 'Last Updated: ' : 'ಕೊನೆಯ ನವೀಕರಣ: '}
            {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Navigation menu */}
      <div style={{
        backgroundColor: '#283593',
        padding: '0 20px',
        display: 'flex',
        gap: '0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        {(currentLanguage === 'en' 
          ? ['AI ASSISTANT', 'DASHBOARD', 'NETWORK', 'MAP', 'INSIGHTS', 'PROFILES', 'FINANCE', 'FORECAST', 'RECORDS', ...(user?.role === 'admin' ? ['AUDIT'] : [])]
          : ['AI ಸಹಾಯಕ', 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'ಜಾಲ', 'ನಕ್ಷೆ', 'ಒಳನೋಟ', 'ಪ್ರೊಫೈಲ್', 'ಹಣಕಾಸು', 'ಮುನ್ಸೂಚನೆ', 'ದಾಖಲೆಗಳು', ...(user?.role === 'admin' ? ['ಲೆಕ್ಕಪರಿಶೋಧನೆ'] : [])]
        ).map((item, idx) => {
          const baseItems = ['AI ASSISTANT', 'DASHBOARD', 'NETWORK', 'MAP', 'INSIGHTS', 'PROFILES', 'FINANCE', 'FORECAST', 'RECORDS', ...(user?.role === 'admin' ? ['AUDIT'] : [])];
          const englishItem = baseItems[idx];
          // Determine if this menu item is active based on current view
          const isActive = 
            (currentView === 'chat' && englishItem === 'AI ASSISTANT') ||
            (currentView === 'dashboard' && englishItem === 'DASHBOARD') ||
            (currentView === 'network' && englishItem === 'NETWORK') ||
            (currentView === 'hotspots' && englishItem === 'MAP') ||
            (currentView === 'insights' && englishItem === 'INSIGHTS') ||
            (currentView === 'profiles' && englishItem === 'PROFILES') ||
            (currentView === 'finance' && englishItem === 'FINANCE') ||
            (currentView === 'forecast' && englishItem === 'FORECAST') ||
            (currentView === 'audit' && englishItem === 'AUDIT');
          return (
            <div
              key={idx}
              onClick={() => handleMenuClick(englishItem)}
              style={{
                padding: '12px 20px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                borderRight: idx < 7 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                transition: 'background 0.2s',
                backgroundColor: isActive ? '#1a237e' : 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1a237e'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActive ? '#1a237e' : 'transparent'}
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
  const accused = crime.accused || [];
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
const CrimeDetailCard = ({ detail, language }: { detail: CrimeDetail; language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const accent = accentFor(detail.crime_type);
  const inv = detail.investigation;

  const PersonChip = ({ p }: { p: PersonBrief }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px',
      padding: '3px 10px', fontSize: '12px', margin: '2px'
    }}>
      👤 {p.name}{p.age ? `, ${p.age}` : ''}{p.district ? ` · ${localizeDistrict(p.district, language)}` : ''}
    </span>
  );

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
          {detail.accused.length ? detail.accused.map((p) => <PersonChip key={p.id} p={p} />) : <span style={{ color: '#999' }}>—</span>}
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
const MessageBubble = ({ message, language, onCrimeClick }: { message: ChatMessage; language: 'en' | 'kn'; onCrimeClick?: (fir: string) => void }) => {
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
        maxWidth: isRich ? '85%' : '70%',
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
            {message.detail && <CrimeDetailCard detail={message.detail} language={language} />}

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

  const handleVoiceClick = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      alert("Voice recognition not available. Please use Chrome or Edge browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = language === 'kn' ? 'kn-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onVoiceResult(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        alert("Voice recognition failed. Please try typing instead.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <button
      onClick={handleVoiceClick}
      disabled={disabled || isListening}
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
      title={isListening ? "Listening..." : "Click to speak"}
    >
      🎤 {isListening ? 'LISTENING...' : 'VOICE'}
    </button>
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

  // Function to show all records
  const showAllRecords = async () => {
    setMessages(prev => [...prev, { text: 'Fetching all records...', isUser: false, loading: true }]);
    
    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          text: 'Show all crimes in Karnataka',
          language: 'en'
        })
      });

      const data = await response.json();
      setMessages(prev => prev.slice(0, -1));

      const results: CrimeRecord[] = data.results || [];
      setMessages(prev => [...prev, {
        text: currentLanguage === 'kn'
          ? `📊 ಎಲ್ಲಾ ಅಪರಾಧ ದಾಖಲೆಗಳು — ಒಟ್ಟು ${results.length}`
          : `📊 All Crime Records — ${results.length} total`,
        isUser: false,
        intent: data.intent,
        entities: data.entities,
        results
      }]);
    } catch (error: any) {
      setMessages(prev => prev.slice(0, -1));
      if (error.message === 'UNAUTHORIZED') {
        handleSessionExpired();
        return;
      }
      setMessages(prev => [...prev, { 
        text: "Error fetching records. Please try: 'Show crimes in Bengaluru'", 
        isUser: false 
      }]);
    }
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
  const showFirDetail = async (fir: string) => {
    if (!fir) return;
    setMessages(prev => [...prev, { text: `Loading ${fir}...`, isUser: false, loading: true }]);
    try {
      const res = await apiFetch(`/api/crime/${fir}`);
      const detail = await res.json();
      setMessages(prev => prev.slice(0, -1));
      setMessages(prev => [...prev, {
        text: `📁 ${currentLanguage === 'en' ? 'Full details for' : 'ಪೂರ್ಣ ವಿವರಗಳು'} ${fir}:`,
        isUser: false,
        intent: 'FIR_DETAIL',
        detail,
      }]);
      conversationContext.current = { ...(conversationContext.current || {}), last_fir: fir };
    } catch (e: any) {
      setMessages(prev => prev.slice(0, -1));
      if (e.message === 'UNAUTHORIZED') { handleSessionExpired(); return; }
      setMessages(prev => [...prev, { text: `Could not load ${fir}.`, isUser: false }]);
    }
  };

  // Export the conversation as a PDF (via the browser's print-to-PDF, which
  // renders Kannada correctly (via html2canvas) and downloads directly — no
  // new tab, no print dialog.
  const exportConversationPDF = async () => {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const rows = messages
      .filter(m => !m.loading)
      .map(m => {
        const who = m.isUser ? (currentLanguage === 'en' ? 'Officer' : 'ಅಧಿಕಾರಿ') : 'KSP AI';
        const side = m.isUser ? 'right' : 'left';
        const bg = m.isUser ? '#e3f2fd' : '#f5f5f5';

        // Build extra detail text for rich messages
        let extra = '';
        if (m.results && m.results.length) {
          extra += m.results.map((c, i) =>
            `<div class="rec">${i + 1}. <b>${esc(localizeCrimeType(c.crime_type, currentLanguage))}</b> — ${esc(localizeDistrict(c.district, currentLanguage))} | FIR: ${esc(c.fir_number || '')} | ${esc(c.date_occurred || '')}<br/><span class="desc">${esc(localizeDescription(c.description, currentLanguage))}</span></div>`
          ).join('');
        }
        if (m.breakdown && m.breakdown.length) {
          extra += m.breakdown.map(b =>
            `<div class="rec">${esc(localizeLabel(b.label, currentLanguage))}: <b>${b.count}</b></div>`
          ).join('');
        }
        if (m.detail) {
          const d = m.detail;
          const inv = d.investigation;
          extra += `<div class="rec"><b>${esc(d.fir_number)}</b> — ${esc(localizeCrimeType(d.crime_type, currentLanguage))}, ${esc(localizeDistrict(d.district, currentLanguage))}, ${esc(d.date_occurred)}`;
          if (inv) extra += `<br/>Status: ${esc(inv.status || '—')} | Officer: ${esc(inv.officer || '—')} | IPC: ${esc(inv.ipc_sections || '—')}`;
          extra += `<br/>Accused: ${esc(d.accused.map(p => p.name).join(', ') || '—')}`;
          extra += `<br/>Victims: ${esc(d.victims.map(p => p.name).join(', ') || '—')}</div>`;
        }

        return `<div class="msg ${side}"><div class="bubble" style="background:${bg}"><div class="who">${who}</div><div class="txt">${esc(m.text)}</div>${extra}</div></div>`;
      })
      .join('');

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
  <div class="ftr">${currentLanguage === 'en' ? 'Confidential — for authorized law enforcement use only.' : 'ಗೌಪ್ಯ — ಅಧಿಕೃತ ಕಾನೂನು ಜಾರಿ ಬಳಕೆಗೆ ಮಾತ್ರ.'}</div>
</div>`;
    document.body.appendChild(container);

    try {
      const target = container.querySelector('.ksp-pdf') as HTMLElement;
      const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210, pageH = 297;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
        heightLeft -= pageH;
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
        onShowRecords={showAllRecords}
        onNavigate={setCurrentView}
        onLogout={handleLogout}
        user={user}
        currentView={currentView}
        currentLanguage={currentLanguage}
      />

      {/* Breadcrumb */}
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '10px 20px',
        fontSize: '13px',
        color: '#666',
        borderBottom: '1px solid #e0e0e0'
      }}>
        🏠 {currentLanguage === 'en' ? 'Home' : 'ಮುಖಪುಟ'} &gt; 
        {currentLanguage === 'en' ? ' Services' : ' ಸೇವೆಗಳು'} &gt; 
        {currentLanguage === 'en' ? ' Crime Database' : ' ಅಪರಾಧ ಡೇಟಾಬೇಸ್'} &gt; 
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

      {/* Audit log view (admin only) */}
      {currentView === 'audit' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <AuditView language={currentLanguage} />
        </div>
      )}

      {/* Main chat area - NO SIDEBAR */}
      {currentView === 'chat' && (
      <div style={{ 
        flex: 1, 
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        overflow: 'hidden'
      }}>
        {/* Chat messages */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          overflowX: 'hidden',
          padding: '30px 50px',
          backgroundColor: '#fafafa'
        }}>
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} language={currentLanguage} onCrimeClick={showFirDetail} />
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
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            alignItems: 'center',
            marginBottom: '12px'
          }}>
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
          <div style={{
            fontSize: '12px',
            color: '#999',
            textAlign: 'center'
          }}>
            {currentLanguage === 'en'
              ? '💡 Tip: Include location and/or date range for better results | 🔒 All queries are secure and logged'
              : '💡 ಸಲಹೆ: ಉತ್ತಮ ಫಲಿತಾಂಶಗಳಿಗಾಗಿ ಸ್ಥಳ ಮತ್ತು/ಅಥವಾ ದಿನಾಂಕ ಶ್ರೇಣಿಯನ್ನು ಸೇರಿಸಿ | 🔒 ಎಲ್ಲಾ ಪ್ರಶ್ನೆಗಳು ಸುರಕ್ಷಿತ ಮತ್ತು ಲಾಗ್ ಮಾಡಲಾಗಿದೆ'}
          </div>
        </div>
      </div>
      )}

      {/* Footer */}
      <div style={{
        backgroundColor: '#1a237e',
        color: 'white',
        padding: '12px 20px',
        fontSize: '12px',
        textAlign: 'center',
        borderTop: '3px solid #ff9800'
      }}>
        {currentLanguage === 'en'
          ? '© 2024 Government of Karnataka | Karnataka State Police | All Rights Reserved | Powered by AI Technology'
          : '© 2024 ಕರ್ನಾಟಕ ಸರ್ಕಾರ | ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ | ಎಲ್ಲಾ ಹಕ್ಕುಗಳನ್ನು ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ | AI ತಂತ್ರಜ್ಞಾನದಿಂದ ಚಾಲಿತ'}
      </div>
    </div>
  );
};

export default ChatPage;