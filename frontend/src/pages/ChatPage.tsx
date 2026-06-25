import React, { useState, useEffect, useRef } from 'react';
import Dashboard from '../components/Dashboard';
import Login from '../components/Login';
import { apiFetch, isAuthenticated, getUser, clearAuth, AuthUser } from '../api';
import {
  localizeCrimeType, localizeDistrict, localizeDescription,
  localizePlace, localizeLabel, buildAnswer
} from '../locale';

type ViewType = 'chat' | 'dashboard';

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
}

interface BreakdownItem {
  label: string;
  count: number;
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
          ? ['HOME', 'ABOUT US', 'SERVICES', 'AI ASSISTANT', 'DASHBOARD', 'RECORDS', 'CONTACT', 'HELP']
          : ['ಮುಖಪುಟ', 'ನಮ್ಮ ಬಗ್ಗೆ', 'ಸೇವೆಗಳು', 'AI ಸಹಾಯಕ', 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'ದಾಖಲೆಗಳು', 'ಸಂಪರ್ಕ', 'ಸಹಾಯ']
        ).map((item, idx) => {
          const englishItem = ['HOME', 'ABOUT US', 'SERVICES', 'AI ASSISTANT', 'DASHBOARD', 'RECORDS', 'CONTACT', 'HELP'][idx];
          // Determine if this menu item is active based on current view
          const isActive = 
            (currentView === 'chat' && englishItem === 'AI ASSISTANT') ||
            (currentView === 'dashboard' && englishItem === 'DASHBOARD');
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

// A single crime case card
const CrimeCaseCard = ({ crime, index, language }: { crime: CrimeRecord; index: number; language: 'en' | 'kn' }) => {
  const accent = accentFor(crime.crime_type);
  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderLeft: `4px solid ${accent}`,
      borderRadius: '8px',
      padding: '12px 14px',
      marginBottom: '10px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            backgroundColor: accent, color: 'white', fontSize: '11px', fontWeight: 700,
            padding: '3px 8px', borderRadius: '4px'
          }}>
            #{index + 1}
          </span>
          <span style={{ fontWeight: 700, color: accent, fontSize: '15px' }}>
            {localizeCrimeType(crime.crime_type, language) || (language === 'en' ? 'Unknown' : 'ಅಜ್ಞಾತ')}
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#1976d2', fontWeight: 600, fontFamily: 'monospace' }}>
          {crime.fir_number || '—'}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '13px', color: '#444', marginBottom: '8px' }}>
        <span>📍 <strong>{localizeDistrict(crime.district, language) || '—'}</strong>{crime.taluk ? `, ${localizePlace(crime.taluk, language)}` : ''}</span>
        <span>📅 {crime.date_occurred || '—'}</span>
        <span>🏢 {localizePlace(crime.police_station, language) || '—'}</span>
      </div>
      {crime.description && (
        <div style={{ fontSize: '13px', color: '#666', backgroundColor: '#fafafa', padding: '8px 10px', borderRadius: '6px', lineHeight: 1.5 }}>
          📝 {localizeDescription(crime.description, language)}
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

// Government-styled message bubble
const MessageBubble = ({ message, language }: { message: ChatMessage; language: 'en' | 'kn' }) => {
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
            {/* Answer text */}
            <div style={{ whiteSpace: 'pre-wrap', marginBottom: isRich ? '12px' : 0 }}>{message.text}</div>

            {/* Detected filters */}
            {!message.isUser && <FilterChips entities={message.entities} language={language} />}

            {/* Breakdown chart */}
            {hasBreakdown && <BreakdownBars data={message.breakdown!} groupBy={message.groupBy} language={language} />}

            {/* Crime case cards */}
            {hasResults && (
              <div style={{ marginTop: '4px' }}>
                {message.results!.map((crime, idx) => (
                  <CrimeCaseCard key={crime.id ?? idx} crime={crime} index={idx} language={language} />
                ))}
                <div style={{ fontSize: '12px', color: '#888', textAlign: 'center', marginTop: '4px' }}>
                  ✅ {message.results!.length} {language === 'en' ? 'record(s) shown' : 'ದಾಖಲೆ(ಗಳು) ತೋರಿಸಲಾಗಿದೆ'}
                </div>
              </div>
            )}
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
  disabled
}: {
  onVoiceResult: (text: string) => void;
  disabled?: boolean;
}) => {
  const [isListening, setIsListening] = useState(false);

  const handleVoiceClick = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      alert("Voice recognition not available. Please use Chrome or Edge browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'en-IN';
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
          language: detectLanguage(text)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => prev.slice(0, -1));

      if (data.error) {
        setMessages(prev => [...prev, { 
          text: `⚠️ Error: ${data.error}\n\nPlease try rephrasing your query or include a location/date range.`, 
          isUser: false 
        }]);
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
          groupBy: data.entities?.group_by
        }]);
      } else {
        // SHOW / COUNT / UNKNOWN — render answer plus crime case cards
        const results = data.results || [];
        setMessages(prev => [...prev, {
          text: currentLanguage === 'kn'
            ? buildAnswer('kn', data.intent, data.entities || {}, results.length)
            : data.answer,
          isUser: false,
          intent: data.intent,
          entities: data.entities,
          results
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
            : (currentLanguage === 'en' ? ' AI Assistant' : ' AI ಸಹಾಯಕ')}
        </span>
      </div>

      {/* Dashboard view */}
      {currentView === 'dashboard' && (
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fafafa' }}>
          <Dashboard language={currentLanguage} />
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
            <MessageBubble key={index} message={message} language={currentLanguage} />
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
            <VoiceButton onVoiceResult={handleVoiceResult} disabled={isLoading} />
            <InputField
              onSubmit={handleSubmit}
              placeholder={currentLanguage === 'en' 
                ? "Type your query here... (e.g., Show crimes in Bengaluru)" 
                : "ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ..."}
              disabled={isLoading}
            />
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