import React, { useState, useEffect, useRef } from 'react';

// Government-styled header component
const GovHeader = ({ 
  onLanguageChange, 
  onShowRecords,
  currentLanguage 
}: { 
  onLanguageChange: (lang: 'en' | 'kn') => void;
  onShowRecords: () => void;
  currentLanguage: 'en' | 'kn';
}) => {
  const handleMenuClick = (menuItem: string) => {
    console.log(`Menu clicked: ${menuItem}`);
    if (menuItem === 'RECORDS') {
      onShowRecords();
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
          ? ['HOME', 'ABOUT US', 'SERVICES', 'AI ASSISTANT', 'RECORDS', 'REPORTS', 'CONTACT', 'HELP']
          : ['ಮುಖಪುಟ', 'ನಮ್ಮ ಬಗ್ಗೆ', 'ಸೇವೆಗಳು', 'AI ಸಹಾಯಕ', 'ದಾಖಲೆಗಳು', 'ವರದಿಗಳು', 'ಸಂಪರ್ಕ', 'ಸಹಾಯ']
        ).map((item, idx) => {
          const englishItem = ['HOME', 'ABOUT US', 'SERVICES', 'AI ASSISTANT', 'RECORDS', 'REPORTS', 'CONTACT', 'HELP'][idx];
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
                backgroundColor: idx === 3 ? '#1a237e' : 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1a237e'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx === 3 ? '#1a237e' : 'transparent'}
            >
              {item}
            </div>
          );
        })}
      </div>
    </>
  );
};

// Government-styled message bubble
const MessageBubble = ({ message }: { message: { text: string; isUser: boolean; loading?: boolean } }) => {
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
        maxWidth: '70%',
        minWidth: '100px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        fontSize: '15px',
        lineHeight: '1.6',
        wordWrap: 'break-word',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
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
            {message.text}
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
  const [messages, setMessages] = useState<Array<{ text: string; isUser: boolean; loading?: boolean }>>([
    { text: "Namaste! 🙏 Welcome to Karnataka State Police Crime Database AI Assistant.\n\nI can help you query crime records across Karnataka. You can ask questions like:\n\n• 'Show crimes in Bengaluru'\n• 'How many thefts in Mysuru last month'\n• 'Count murders in Belagavi'\n\nPlease type your query below or use the voice button to speak.", isUser: false }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'kn'>('en');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Function to show all records
  const showAllRecords = async () => {
    setMessages(prev => [...prev, { text: 'Fetching all records...', isUser: false, loading: true }]);
    
    try {
      const response = await fetch('http://localhost:8004/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Show all crimes in Karnataka',
          language: 'en'
        })
      });

      const data = await response.json();
      setMessages(prev => prev.slice(0, -1));

      let responseText = `📊 All Crime Records (Total: ${data.results?.length || 0})\n\n`;
      responseText += '═'.repeat(60) + '\n';
      
      if (data.results && data.results.length > 0) {
        // Show ALL records, not just first 5
        data.results.forEach((crime: any, idx: number) => {
          responseText += `\n${idx + 1}. ${crime.crime_type} - ${crime.district}`;
          responseText += `\n   📋 FIR: ${crime.fir_number} | 📅 Date: ${crime.date_occurred}`;
          responseText += `\n   🏢 Station: ${crime.police_station}`;
          responseText += `\n   📝 ${crime.description}`;
          responseText += '\n' + '─'.repeat(60);
        });
        responseText += `\n\n✅ Showing all ${data.results.length} records`;
      } else {
        responseText += '\n⚠️ No records found in database.';
      }
      
      setMessages(prev => [...prev, { text: responseText, isUser: false }]);
    } catch (error) {
      setMessages(prev => prev.slice(0, -1));
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
      const response = await fetch('http://localhost:8004/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      } else {
        let responseText = data.answer;
        if (data.results && data.results.length > 0) {
          responseText += `\n\n📊 Query Results (${data.results.length} record${data.results.length > 1 ? 's' : ''}):\n`;
          responseText += '\n' + '─'.repeat(60) + '\n';
          
          // Show ALL results, not just first 5
          data.results.forEach((crime: any, idx: number) => {
            responseText += `\n${idx + 1}. 🔴 ${crime.crime_type} - ${crime.district}`;
            responseText += `\n   📋 FIR: ${crime.fir_number}`;
            responseText += `\n   📅 Date: ${crime.date_occurred}`;
            responseText += `\n   🏢 Station: ${crime.police_station}`;
            responseText += `\n   📝 ${crime.description}`;
            responseText += '\n' + '─'.repeat(60) + '\n';
          });
          
          responseText += `\n✅ Total: ${data.results.length} record(s) displayed`;
        }
        
        setMessages(prev => [...prev, { text: responseText, isUser: false }]);
      }
    } catch (error) {
      setMessages(prev => prev.slice(0, -1));
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
          {currentLanguage === 'en' ? ' AI Assistant' : ' AI ಸಹಾಯಕ'}
        </span>
      </div>

      {/* Main chat area - NO SIDEBAR */}
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
            <MessageBubble key={index} message={message} />
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