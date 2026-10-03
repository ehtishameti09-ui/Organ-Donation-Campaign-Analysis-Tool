import { useEffect, useState } from 'react';
import { getGoogleOAuthStatus } from '../utils/api';
import { toast } from '../utils/toast';

const API_ORIGIN = 'http://localhost:8000';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
  </svg>
);

/**
 * Google sign-in / sign-up button.
 *
 * `intent` and `role` are sent to our own redirect endpoint, which seals them
 * into the OAuth `state` parameter. The role is therefore decided here, on a
 * screen the user has already filled in — never inferred from the Google
 * profile on the way back, which would let the account type be chosen by
 * whoever controls the request.
 *
 * Google proves the user controls the mailbox, so no email OTP follows. What a
 * Google account cannot prove — who someone is, or that they may operate a
 * transplant centre — is still established by the document upload and super
 * admin review that come next.
 */
const GoogleAuthButton = ({
  intent = 'login',
  role = null,
  label,
  disabled = false,
  style = {},
}) => {
  const [configured, setConfigured] = useState(null);   // null = still checking

  useEffect(() => {
    let cancelled = false;
    getGoogleOAuthStatus()
      .then(r => { if (!cancelled) setConfigured(!!r.configured); })
      .catch(() => { if (!cancelled) setConfigured(false); });
    return () => { cancelled = true; };
  }, []);

  const ready = configured === true && !disabled;
  const text = label || (intent === 'signup' ? 'Sign up with Google' : 'Continue with Google');

  const go = () => {
    if (configured === false) {
      toast('Google sign-in is not configured on this server. Use email and password instead.', 'warning');
      return;
    }
    if (intent === 'signup' && !role) {
      toast('Choose an account type first.', 'warning');
      return;
    }
    const qs = new URLSearchParams({ intent, ...(role ? { role } : {}) });
    window.location.href = `${API_ORIGIN}/api/oauth/google/redirect?${qs}`;
  };

  return (
    <button
      type="button"
      onClick={go}
      disabled={!ready}
      title={
        configured === false
          ? 'Google sign-in is not configured on this server.'
          : intent === 'signup'
            ? `Create your ${role || ''} account with Google`.replace('  ', ' ')
            : 'Sign in with your Google account'
      }
      style={{
        width: '100%',
        padding: '10px 14px',
        background: ready ? '#fff' : '#f5f5f5',
        border: '1px solid #dadce0',
        borderRadius: 'var(--radius)',
        cursor: ready ? 'pointer' : 'not-allowed',
        opacity: ready ? 1 : 0.55,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#3c4043',
        transition: 'box-shadow .15s, background .15s',
        ...style,
      }}
      onMouseEnter={e => { if (ready) { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.1)'; } }}
      onMouseLeave={e => { if (ready) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = 'none'; } }}
    >
      <GoogleMark />
      {configured === false ? 'Google sign-in (not configured)' : text}
    </button>
  );
};

export default GoogleAuthButton;
