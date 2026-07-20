import React, { useState } from 'react';
import { login, AuthUser } from '../api';

const Login = ({ onLogin, language }: { onLogin: (user: AuthUser) => void; language: 'en' | 'kn' }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const t = (en: string, kn: string) => (language === 'en' ? en : kn);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message === 'Failed to fetch'
        ? t('Cannot reach server. Is the backend running?', 'ಸರ್ವರ್ ತಲುಪಲಾಗುತ್ತಿಲ್ಲ.')
        : t('Invalid username or password', 'ಅಮಾನ್ಯ ಬಳಕೆದಾರಹೆಸರು ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a237e 0%, #283593 60%, #3949ab 100%)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        width: '400px',
        maxWidth: '90%',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '28px 30px 18px',
          textAlign: 'center',
          borderBottom: '3px solid #ff9800'
        }}>
          <div style={{
            width: '64px', height: '64px', backgroundColor: '#1a237e', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '24px', margin: '0 auto 14px'
          }}>
            ಕರ್
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a237e' }}>
            {t('GOVERNMENT OF KARNATAKA', 'ಕರ್ನಾಟಕ ಸರ್ಕಾರ')}
          </div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            {t('Karnataka State Police — Crime Database', 'ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ — ಅಪರಾಧ ಡೇಟಾಬೇಸ್')}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '26px 30px 30px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#333', marginBottom: '18px', textAlign: 'center' }}>
            🔒 {t('Secure Officer Login', 'ಸುರಕ್ಷಿತ ಅಧಿಕಾರಿ ಲಾಗಿನ್')}
          </div>

          {error && (
            <div style={{
              backgroundColor: '#ffebee', color: '#c62828', padding: '10px 14px',
              borderRadius: '6px', fontSize: '13px', marginBottom: '16px', border: '1px solid #ffcdd2'
            }}>
              ⚠️ {error}
            </div>
          )}

          <label style={labelStyle}>{t('Username', 'ಬಳಕೆದಾರಹೆಸರು')}</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('Enter your username', 'ನಿಮ್ಮ ಬಳಕೆದಾರಹೆಸರನ್ನು ನಮೂದಿಸಿ')}
            style={inputStyle}
            autoFocus
            required
          />

          <label style={labelStyle}>{t('Password', 'ಪಾಸ್‌ವರ್ಡ್')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('Enter your password', 'ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ')}
            style={inputStyle}
            required
          />

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            style={{
              width: '100%', marginTop: '8px', padding: '13px',
              backgroundColor: loading || !username.trim() || !password ? '#bdbdbd' : '#1976d2',
              color: 'white', border: 'none', borderRadius: '6px',
              fontSize: '15px', fontWeight: 600,
              cursor: loading || !username.trim() || !password ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? t('Signing in...', 'ಸೈನ್ ಇನ್ ಆಗುತ್ತಿದೆ...') : t('SIGN IN', 'ಸೈನ್ ಇನ್')}
          </button>

          <div style={{
            marginTop: '20px', padding: '12px', backgroundColor: '#f5f5f5',
            borderRadius: '6px', fontSize: '12px', color: '#666', lineHeight: 1.6
          }}>
            <strong>{t('Demo logins (role-based access):', 'ಡೆಮೋ ಲಾಗಿನ್‌ಗಳು (ಪಾತ್ರ ಆಧಾರಿತ):')}</strong><br />
            investigator / invest@2024<br />
            analyst / analyst@2024<br />
            supervisor / super@2024<br />
            policymaker / policy@2024
          </div>
        </form>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '6px', marginTop: '14px'
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', border: '2px solid #e0e0e0', borderRadius: '6px',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
};

export default Login;
