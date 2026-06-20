import { useEffect, useState } from 'react';
import { confirmEmailVerification } from '../utils/api';

/**
 * Landing page hit when the user clicks the Yes/No button in the verification
 * email. URL form:  /verify-email?token=<64char>&action=yes|no
 *
 * IMPORTANT: We deliberately do NOT call the API on page load. Many mail
 * clients (Gmail, Outlook, anti-spam scanners) prefetch links to inspect
 * them; if we acted on load, a single-use token would be consumed by the
 * prefetcher before the real user even clicked. Instead the page shows a
 * confirmation step where the user explicitly clicks "Confirm" — a real
 * gesture, which prefetchers don't perform.
 */
const VerifyEmail = () => {
  const [params, setParams] = useState({ token: '', action: '' });
  const [phase, setPhase] = useState('confirm'); // confirm | working | verified | cancelled | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const token = p.get('token') || '';
    const action = (p.get('action') || '').toLowerCase();
    if (!token || !['yes', 'no'].includes(action)) {
      setPhase('error');
      setMessage('This verification link is missing or malformed.');
      return;
    }
    setParams({ token, action });
  }, []);

  const confirmNow = async () => {
    setPhase('working');
    try {
      const res = await confirmEmailVerification(params.token, params.action);
      if (params.action === 'yes') {
        setPhase('verified');
        setMessage(res.message || 'Email verified.');
      } else {
        setPhase('cancelled');
        setMessage(res.message || 'Verification cancelled.');
      }
    } catch (err) {
      // Treat "already gone" as success-equivalent for cancellation: either
      // way, no account was created and the user got what they wanted.
      if (params.action === 'no') {
        setPhase('cancelled');
        setMessage('This request has already been cancelled. No account will be created.');
      } else {
        setPhase('error');
        setMessage(err.message || 'This link has expired. Please return to the registration page and request a new one.');
      }
    }
  };

  const palette = {
    confirm:   { color: params.action === 'no' ? 'var(--warning)' : 'var(--primary)', icon: params.action === 'no' ? '🛡️' : '📬', title: params.action === 'no' ? 'Cancel this verification?' : 'Confirm your email' },
    working:   { color: 'var(--primary)', icon: '⏳', title: 'Working…' },
    verified:  { color: 'var(--accent)',  icon: '✓',  title: 'Email verified' },
    cancelled: { color: 'var(--text2)',   icon: '✓',  title: 'Verification cancelled' },
    error:     { color: 'var(--text2)',   icon: 'ℹ️', title: 'Nothing to do here' },
  }[phase];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '52px', color: palette.color, marginBottom: '8px' }}>{palette.icon}</div>
        <h2 style={{ margin: '0 0 8px', color: palette.color }}>{palette.title}</h2>

        {phase === 'confirm' && (
          <>
            <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: '20px' }}>
              {params.action === 'yes'
                ? 'Click the button below to confirm that this email belongs to you and continue your registration.'
                : 'Click the button below if you did not start a registration. The pending request will be cancelled and no account will be created.'}
            </p>
            <button
              className={params.action === 'yes' ? 'btn btn-primary btn-full' : 'btn btn-danger btn-full'}
              onClick={confirmNow}
            >
              {params.action === 'yes' ? '✓ Yes, this is my email' : '✗ Cancel the request'}
            </button>
            <p style={{ color: 'var(--text3)', fontSize: '11px', marginTop: '14px' }}>
              We ask one more click here because mail scanners can otherwise consume the link before you do.
            </p>
          </>
        )}

        {phase === 'working' && (
          <p style={{ color: 'var(--text2)' }}>Just a moment…</p>
        )}

        {phase === 'verified' && (
          <>
            <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: '20px' }}>{message}</p>
            <p style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '20px' }}>
              You can close this tab — the registration page will detect the verification automatically and continue.
            </p>
            <a href="/" className="btn btn-primary btn-full">Return to ODCAT</a>
          </>
        )}

        {phase === 'cancelled' && (
          <>
            <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: '20px' }}>{message}</p>
            <p style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '20px' }}>
              You can safely close this tab. If you're still on the registration page, it will show "Verification cancelled" under the email field so you can try a different address.
            </p>
            <a href="/" className="btn btn-ghost btn-full">Back to home</a>
          </>
        )}

        {phase === 'error' && (
          <>
            <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: '20px' }}>{message}</p>
            <p style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '20px' }}>
              You can close this tab and return to the registration page — request a fresh verification email from there.
            </p>
            <a href="/" className="btn btn-outline btn-full">Back to ODCAT</a>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
