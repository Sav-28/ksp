import React, { useState, useEffect, useRef } from 'react';

// Assuming these components exist as per the prompt
// In a real implementation, you would import them from your component library
const MessageBubble = ({ message }: { message: { text: string; isUser: boolean; loading?: boolean } }) => {
  return (
    <div style={{
      display: 'flex',
      margin: '8px 0',
      alignItems: 'flex-start'
    }}>
      {!message.isUser && (
        <div style={{
          backgroundColor: '#003366',
          color: 'white',
          borderRadius: '18px',
          padding: '10px 16px',
          maxWidth: '70%',
          marginRight: '10px'
        }}>
          {message.text}
        </div>
      )}
      {message.isUser && (
        <div style={{
          backgroundColor: '#e9f5ff',
          color: '#003366',
          borderRadius: '18px',
          padding: '10px 16px',
          maxWidth: '70%',
          marginLeft: 'auto'
        }}>
          {message.text}
        </div>
      )}
    </div>
  );
};

const InputField = ({ onSubmit, placeholder }: { onSubmit: (text: string) => void; placeholder: string }) => {
  const [input, setInput] = useState('');

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      onSubmit(input);
      setInput('');
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', padding: '16px' }}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '12px 16px',
          border: '1px solid #ddd',
          borderRadius: '24px',
          fontSize: '16px'
        }}
      />
      <button
        onClick={() => {
          if (input.trim()) {
            onSubmit(input);
            setInput('');
          }
        }}
        disabled={!input.trim()}
        style={{
          backgroundColor: '#003366',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          cursor: 'pointer'
        }}
      >
        →
      </button>
    </div>
  );
};

const VoiceButton = ({
  onVoiceResult,
  disabled
}: {
  onVoiceResult: (text: string) => void;
  disabled?: boolean;
}) => {
  const handleVoiceClick = () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      alert("Voice not available—try typing");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'kn-IN'; // Kannada language hint
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onVoiceResult(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      alert("Voice not available—try typing");
    };

    recognition.onend = () => {
      // Auto-restart if needed
    };

    recognition.start();
  };

  return (
    <button
      onClick={handleVoiceClick}
      disabled={disabled}
      style={{
        backgroundColor: '#0066cc',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        width: '48px',
        height: '48px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1
      }}
    >
      🎤
    </button>
  );
};

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Array<{ text: string; isUser: boolean; loading?: boolean }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (text: string) => {
    // Add user message
    setMessages(prev => [...prev, { text, isUser: true }]);
    setInputValue('');

    // Add loading message
    setMessages(prev => [...prev, { text: 'Thinking...', isUser: false, loading: true }]);

    try {
      // Call POST /chat endpoint
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: 'en', // Default to English for MVP
          sessionId: Math.random().toString(36).substring(7) // Simple session ID
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      // Remove loading message
      setMessages(prev => prev.slice(0, -1));

      if (data.error) {
        // Add error message
        setMessages(prev => [...prev, { text: `Error: ${data.error}`, isUser: false }]);
      } else {
        // Add bot response
        setMessages(prev => [...prev, { text: data.answer, isUser: false }]);
      }
    } catch (error) {
      // Remove loading message
      setMessages(prev => prev.slice(0, -1));

      // Add error message
      setMessages(prev => [...prev, { text: "Sorry, I couldn't process that. Try: 'Show crimes in [place] last month'", isUser: false }]);
      console.error('Chat error:', error);
    }
  };

  const handleVoiceResult = (transcript: string) => {
    setInputValue(transcript);
    // Auto-submit on voice result
    handleSubmit(transcript);
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f7fa',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            message={message}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ borderTop: '1px solid #eee', backgroundColor: 'white' }}>
        <InputField
          onSubmit={handleSubmit}
          placeholder="Ask about crimes in English or Kannada..."
        />
        <VoiceButton
          onVoiceResult={handleVoiceResult}
          disabled={isListening}
        />
      </div>
    </div>
  );
};

export default ChatPage;