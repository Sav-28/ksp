import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { GOV } from '../govStyles';

/**
 * PushPermission
 *
 * Enables Catalyst Cloud Scale Push Notifications for the current user.
 *
 * HOW CATALYST PUSH WORKS ON THE FRONTEND
 * ----------------------------------------
 * Catalyst provides its own Web SDK that handles service worker registration,
 * VAPID key exchange, and subscription storage internally. You do NOT call
 * pushManager.subscribe() yourself. The entire client-side setup is:
 *
 *   catalyst.notification.enableNotification().then(resp => {
 *     catalyst.notification.messageHandler = msg => { ... }
 *   });
 *
 * The Catalyst Web SDK script must be included in index.html (the SDK init
 * script from the console: Cloud Scale → Push Notifications → Web tab).
 * When that script runs, it exposes `window.catalyst` globally.
 *
 * The messageHandler receives the message string sent by the backend's
 * push_notification().web().send_notification() call. We parse it and
 * show a browser Notification from inside the handler.
 *
 * FLOW
 * -----
 * 1. Check GET /api/push/status — if available=false, render nothing.
 * 2. On "Enable alerts" click: call catalyst.notification.enableNotification().
 * 3. Once resolved, register the messageHandler to display notifications.
 * 4. Show "Alerts enabled" strip.
 *
 * STATUS STATES
 * -------------
 *   checking      — initial load, determining availability
 *   unavailable   — server-side push not configured
 *   unsupported   — browser has no Notification API or Catalyst SDK absent
 *   prompt        — ready to enable
 *   requesting    — enable in progress
 *   enabled       — push active, handler registered
 *   denied        — user blocked notifications in browser
 *   error         — unexpected failure
 */

type PushStatus =
  | 'checking'
  | 'unavailable'
  | 'unsupported'
  | 'prompt'
  | 'requesting'
  | 'enabled'
  | 'denied'
  | 'error';

interface Props {
  language: 'en' | 'kn';
}

/** Show a browser Notification for a push message received from the server. */
function showCustodyAlert(messageText: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // Message is plain text from push_service.broadcast_custody_alerts()
  new Notification('KSP Custody Deadline Alert', {
    body: messageText,
    icon: '/logo192.png',
    tag: 'ksp-custody-alert',
    requireInteraction: true,
  });
}

const PushPermission: React.FC<Props> = ({ language }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [status, setStatus] = useState<PushStatus>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Basic browser support check.
    if (!('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      setMessage(t(
        'Notifications blocked. Allow them in browser settings to receive custody alerts.',
        'ಅಧಿಸೂಚನೆಗಳನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.',
      ));
      return;
    }

    // Check whether server-side push is available.
    apiFetch('/api/push/status')
      .then(r => r.json())
      .then((data: any) => {
        if (!data.available) {
          // Server push not configured — hide the component entirely.
          setStatus('unavailable');
          return;
        }
        // Check if Catalyst Web SDK is present on the page.
        const catalyst = (window as any).catalyst;
        if (!catalyst?.notification) {
          // SDK script not loaded yet — could be async; re-check on user action.
          setStatus('prompt');
          return;
        }
        // If permission already granted, register the handler and mark enabled.
        if (Notification.permission === 'granted') {
          _registerHandler();
          setStatus('enabled');
          setMessage(t(
            'Custody deadline alerts are enabled.',
            'ವಶ ಗಡುವು ಎಚ್ಚರಿಕೆಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ.',
          ));
        } else {
          setStatus('prompt');
        }
      })
      .catch(() => setStatus('prompt')); // network error — show prompt anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function _registerHandler(): void {
    const catalyst = (window as any).catalyst;
    if (!catalyst?.notification) return;
    catalyst.notification.messageHandler = (msg: any) => {
      // msg is the string passed to send_notification() on the backend.
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
      showCustodyAlert(text);
    };
  }

  const handleEnable = async () => {
    if (status === 'requesting') return;
    setStatus('requesting');
    setMessage('');

    const catalyst = (window as any).catalyst;
    if (!catalyst?.notification?.enableNotification) {
      setStatus('error');
      setMessage(t(
        'Catalyst Web SDK not loaded. Ensure the SDK script is included in index.html.',
        'Catalyst Web SDK ಲೋಡ್ ಆಗಿಲ್ಲ. index.html ನಲ್ಲಿ SDK ಸ್ಕ್ರಿಪ್ಟ್ ಸೇರಿಸಿ.',
      ));
      return;
    }

    try {
      await catalyst.notification.enableNotification();
      _registerHandler();
      setStatus('enabled');
      setMessage(t(
        'Custody deadline alerts are enabled. You will be notified when a case is Breached or Critical.',
        'ವಶ ಗಡುವು ಎಚ್ಚರಿಕೆಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ.',
      ));
    } catch (e: any) {
      if (Notification.permission === 'denied') {
        setStatus('denied');
        setMessage(t(
          'Notifications blocked. Allow them in browser settings.',
          'ಅಧಿಸೂಚನೆಗಳನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.',
        ));
      } else {
        setStatus('error');
        setMessage(`${t('Could not enable notifications:', 'ಅಧಿಸೂಚನೆಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲಾಗಲಿಲ್ಲ:')} ${e?.message || String(e)}`);
      }
    }
  };

  // Don't render anything for these states — no noise for the officer.
  if (status === 'checking' || status === 'unavailable' || status === 'unsupported') {
    return null;
  }

  const isEnabled = status === 'enabled';
  const isDenied = status === 'denied';
  const canEnable = status === 'prompt' || status === 'error';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '7px 12px',
        background: isEnabled ? '#e8f5e9' : isDenied ? '#fff3e0' : '#e3f2fd',
        borderLeft: `3px solid ${isEnabled ? GOV.ok : isDenied ? GOV.critical : GOV.navy}`,
        borderRadius: 4,
        marginBottom: 14,
        fontSize: 12.5,
        color: GOV.ink,
      }}
    >
      <span style={{ flex: 1 }}>
        {isEnabled && (
          <span style={{ color: GOV.ok, fontWeight: 700, marginRight: 6 }}>✓</span>
        )}
        {message || t(
          'Enable push notifications to receive custody deadline alerts.',
          'ವಶ ಗಡುವು ಎಚ್ಚರಿಕೆಗಳಿಗಾಗಿ ಪುಶ್ ಅಧಿಸೂಚನೆಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ.',
        )}
      </span>
      {canEnable && (
        <button
          type="button"
          onClick={handleEnable}
          disabled={status === 'requesting'}
          aria-label={t('Enable push notifications', 'ಪುಶ್ ಅಧಿಸೂಚನೆಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ')}
          style={{
            background: GOV.navy, color: '#fff', border: 'none',
            borderRadius: 4, padding: '5px 12px', fontSize: 12,
            fontWeight: 700,
            cursor: status === 'requesting' ? 'default' : 'pointer',
            opacity: status === 'requesting' ? 0.65 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {status === 'requesting'
            ? t('Enabling…', 'ಸಕ್ರಿಯಗೊಳಿಸಲಾಗುತ್ತಿದೆ…')
            : t('Enable alerts', 'ಎಚ್ಚರಿಕೆಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ')}
        </button>
      )}
    </div>
  );
};

export default PushPermission;
