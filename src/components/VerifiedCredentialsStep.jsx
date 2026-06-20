import { useEffect, useMemo, useState } from 'react';
import {
  startEmailVerification, getEmailVerificationStatus,
} from '../utils/api';
import { capitalizeName, validateName, validatePhone } from '../utils/auth';
import { useEmailField, EmailFieldError } from './EmailField';
import { toast } from '../utils/toast';

/**
 * Step that enforces email verification and a strong password before the parent
 * can call /api/register. Hands the parent a `verification_token` (the email
 * token) plus the four field values when the user confirms.
 *
 * (Phone verification has been removed across the site; the phone field is
 * still collected and format-validated but no OTP step is run.)
 *
 * Props:
 *   - initialName, initialEmail, initialPhone (for pre-fill / resume after a reload)
 *   - submitLabel (button label, default "Create Account & Continue")
 *   - onComplete({ name, email, phone, password, verification_token })
 *   - onCancel()
 *   - submitting (bool — disables the final button while parent is calling /api/register)
 */
// Feature flag — mirrors backend `config('auth.require_email_verification')`.
// When false, the Verify Email button + verify-status UI are hidden and the
// "Create Account" button isn't gated on email verification. Flip back to
// true when the email-verify flow should be re-enabled.
const EMAIL_VERIFICATION_REQUIRED = false;

const LS_TOKEN_KEY = 'odcat_reg_token';   // survives reloads so the user can resume
const LS_EMAIL_KEY = 'odcat_reg_email';

const COMMON_WEAK = ['password','password1','password123','qwerty','qwerty123','12345678','12345678910','abcd1234','letmein','iloveyou','admin','welcome','welcome1','odcat','organ','hospital'];

const passwordChecks = (pw, { name, email, phone }) => {
  const local = email.includes('@') ? email.split('@')[0] : '';
  const phoneDigits = (phone || '').replace(/\D+/g, '');
  const pwDigits = (pw || '').replace(/\D+/g, '');
  const lower = (pw || '').toLowerCase();
  return {
    length:    (pw || '').length >= 12,
    upper:     /[A-Z]/.test(pw || ''),
    lowerCase: /[a-z]/.test(pw || ''),
    number:    /[0-9]/.test(pw || ''),
    special:   /[^A-Za-z0-9]/.test(pw || ''),
    noCommon:  pw ? !COMMON_WEAK.includes(lower) : false,
    noPersonal: pw ? !(
      (name?.length >= 4 && lower.includes(name.toLowerCase())) ||
      (email?.length >= 4 && lower.includes(email.toLowerCase())) ||
      (local?.length >= 4 && lower.includes(local.toLowerCase())) ||
      (phoneDigits?.length >= 4 && pwDigits.includes(phoneDigits))
    ) : false,
  };
};

// Eye / eye-off SVG — matches the toggle used on the Sign In and Reset Password
// forms so password show/hide looks consistent across the app.
const EyeIcon = ({ shown }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
    {shown ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </>
    )}
  </svg>
);

const Pill = ({ ok, children }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
    background: ok ? 'var(--accent-light)' : 'var(--danger-light)',
    color: ok ? 'var(--accent)' : 'var(--danger)',
  }}>
    {ok ? '✓' : '✗'} {children}
  </span>
);

const fmtSeconds = (s) => {
  if (s <= 0) return '0s';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
};

const VerifiedCredentialsStep = ({
  initialName = '', initialEmail = '', initialPhone = '',
  submitLabel = 'Create Account & Continue',
  submitting = false,
  onComplete, onCancel,
}) => {
  // ---- form fields ----
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ---- email verification ----
  const [emailToken, setEmailToken] = useState(() => localStorage.getItem(LS_TOKEN_KEY) || '');
  const [emailStatus, setEmailStatus] = useState('idle'); // idle|sending|pending|verified|cancelled|expired
  const [emailSendBusy, setEmailSendBusy] = useState(false);
  // Email-verify attempt policy: 3 free, 30s cooldown after the 3rd, max 5 / 10min.
  const [emailAttemptsLeft, setEmailAttemptsLeft] = useState(5);
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(0); // unix sec
  const [emailLockedUntil, setEmailLockedUntil]   = useState(0);   // unix sec
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Tick once per second to drive cooldown countdowns.
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // If we already have an email token (from a prior reload), restore status.
  useEffect(() => {
    if (!emailToken) return;
    (async () => {
      const r = await getEmailVerificationStatus(emailToken);
      if (r.status === 'verified') {
        setEmailStatus('verified');
        if (r.email && !email) setEmail(r.email);
      } else if (r.status === 'pending') {
        setEmailStatus('pending');
        if (r.email && !email) setEmail(r.email);
      } else {
        localStorage.removeItem(LS_TOKEN_KEY);
        localStorage.removeItem(LS_EMAIL_KEY);
        setEmailToken('');
        setEmailStatus('expired');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for email confirmation while pending.
  useEffect(() => {
    if (emailStatus !== 'pending' || !emailToken) return;
    const id = setInterval(async () => {
      const r = await getEmailVerificationStatus(emailToken);
      if (r.status === 'verified') {
        setEmailStatus('verified');
        toast('Email verified — you can now create your password.', 'success');
      } else if (r.status === 'cancelled' || r.status === 'expired') {
        setEmailStatus(r.status);
        localStorage.removeItem(LS_TOKEN_KEY);
        setEmailToken('');
      }
    }, 3000);
    return () => clearInterval(id);
  }, [emailStatus, emailToken]);

  // ---- validation ----
  const nameCheck  = useMemo(() => validateName(name), [name]);
  const nameValid  = nameCheck.ok;
  const emailCheck = useEmailField(email);
  const emailValid = emailCheck.ok;
  const phoneCheck = useMemo(() => validatePhone(phone), [phone]);
  const phoneValid = phoneCheck.ok;
  const pwChecks   = useMemo(() => passwordChecks(password, { name, email, phone }), [password, name, email, phone]);
  const pwAllOk    = Object.values(pwChecks).every(Boolean);
  const pwScore    = Object.values(pwChecks).filter(Boolean).length;     // 0..7
  const pwMatch    = !!password && password === confirm;

  const strength = useMemo(() => {
    if (!password) return { label: '', color: 'transparent', pct: 0 };
    if (pwScore <= 3) return { label: 'Weak',   color: '#d63e3e', pct: 25 };
    if (pwScore <= 5) return { label: 'Fair',   color: '#e8900a', pct: 55 };
    if (pwScore === 6) return { label: 'Good',  color: '#d6c70a', pct: 80 };
    return { label: 'Strong', color: '#0eb07a', pct: 100 };
  }, [pwScore, password]);

  // Submit is gated by name + email + phone format + strong matching password.
  // When EMAIL_VERIFICATION_REQUIRED is on, also require emailStatus === 'verified'.
  const canSubmit =
    nameValid && emailValid && phoneValid && pwAllOk && pwMatch &&
    (!EMAIL_VERIFICATION_REQUIRED || emailStatus === 'verified') && !submitting;

  // ---- handlers ----
  const handleSendEmail = async () => {
    if (!emailValid) { toast('Please enter a valid email address first.', 'error'); return; }
    const nowSec = Math.floor(Date.now() / 1000);
    if (emailLockedUntil > nowSec)   { toast(`Locked. Try again in ${fmtSeconds(emailLockedUntil - nowSec)}.`, 'error'); return; }
    if (emailCooldownUntil > nowSec) { toast(`Please wait ${fmtSeconds(emailCooldownUntil - nowSec)}.`, 'error'); return; }
    setEmailSendBusy(true);
    try {
      const r = await startEmailVerification(email.trim().toLowerCase());
      setEmailToken(r.token);
      setEmailStatus('pending');
      localStorage.setItem(LS_TOKEN_KEY, r.token);
      localStorage.setItem(LS_EMAIL_KEY, email.trim().toLowerCase());
      if (typeof r.attempts_left === 'number') setEmailAttemptsLeft(r.attempts_left);
      if (r.next_cooldown && r.next_cooldown > 0) {
        setEmailCooldownUntil(Math.floor(Date.now() / 1000) + r.next_cooldown);
      }
      toast('Verification email sent. Check your inbox and click "Yes, this is my email".', 'success', 6000);
    } catch (err) {
      if (err.status === 429) {
        if (err.locked_for) {
          setEmailLockedUntil(Math.floor(Date.now() / 1000) + err.locked_for);
        } else if (err.cooldown_for) {
          setEmailCooldownUntil(Math.floor(Date.now() / 1000) + err.cooldown_for);
          if (typeof err.attempts_left === 'number') setEmailAttemptsLeft(err.attempts_left);
        }
        toast(err.message || 'Please wait before trying again.', 'error');
      } else {
        toast(err.message || 'Could not send verification email.', 'error');
      }
    } finally {
      setEmailSendBusy(false);
    }
  };

  // If user edits the email after starting verification, reset state.
  useEffect(() => {
    const saved = localStorage.getItem(LS_EMAIL_KEY);
    if (saved && saved !== email.trim().toLowerCase() && (emailStatus === 'pending' || emailStatus === 'verified')) {
      setEmailStatus('idle');
      setEmailToken('');
      localStorage.removeItem(LS_TOKEN_KEY);
      localStorage.removeItem(LS_EMAIL_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    onComplete({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password,
      verification_token: emailToken,
    });
  };

  // ---- render helpers ----
  const fieldBorder = (ok, dirty) => ({
    borderColor: !dirty ? 'var(--border)' : ok ? 'var(--accent)' : 'var(--danger)',
    borderWidth: '1.5px',
  });

  // -------------- UI --------------
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* NAME */}
      <div className="form-group">
        <label className="form-label">Full Name *</label>
        <input className="form-input" type="text" value={name}
          onChange={e => setName(capitalizeName(e.target.value.slice(0, 60)))}
          placeholder="e.g. Ali Hassan"
          autoComplete="name"
          maxLength={60}
          style={fieldBorder(nameValid, name.length > 0)}
          required />
        {name.length > 0 && !nameValid && (
          <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>
            {nameCheck.error} <span style={{ color: 'var(--text3)' }}>Example: <strong>Ali Hassan</strong></span>
          </div>
        )}
      </div>

      {/* EMAIL */}
      <div className="form-group">
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span>Email Address *</span>
          {EMAIL_VERIFICATION_REQUIRED && emailStatus === 'verified' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Pill ok>Verified</Pill>
              <button type="button"
                onClick={() => { setEmailStatus('idle'); setEmailToken(''); localStorage.removeItem(LS_TOKEN_KEY); localStorage.removeItem(LS_EMAIL_KEY); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}>
                ✏️ Change email
              </button>
            </span>
          )}
          {EMAIL_VERIFICATION_REQUIRED && emailStatus === 'pending' && (
            <span style={{ fontSize: '11px', color: 'var(--warning)' }}>📬 Waiting for you to click the link in your inbox…</span>
          )}
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input className="form-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. ali.hassan@example.com"
            disabled={EMAIL_VERIFICATION_REQUIRED && emailStatus === 'verified'}
            style={{ flex: 1, ...emailCheck.borderStyle }}
            autoComplete="email" required />
          {EMAIL_VERIFICATION_REQUIRED && emailStatus !== 'verified' && (() => {
            const emailCooldownIn = Math.max(0, emailCooldownUntil - now);
            const emailLockedIn   = Math.max(0, emailLockedUntil   - now);
            const blocked = emailLockedIn > 0 || emailCooldownIn > 0;
            const label = emailLockedIn > 0
              ? `Locked (${fmtSeconds(emailLockedIn)})`
              : emailCooldownIn > 0
                ? `Wait ${fmtSeconds(emailCooldownIn)}`
                : emailSendBusy
                  ? 'Sending…'
                  : emailStatus === 'pending'
                    ? 'Resend Email'
                    : 'Verify Email';
            return (
              <button type="button" className="btn btn-primary"
                onClick={handleSendEmail}
                disabled={!emailValid || emailSendBusy || blocked}>
                {label}
              </button>
            );
          })()}
        </div>
        <EmailFieldError check={emailCheck} onAccept={setEmail} />
        {EMAIL_VERIFICATION_REQUIRED && emailStatus === 'pending' && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
            Typed the wrong email? Just retype it above — we'll cancel the pending verification and start over.
          </div>
        )}
        {EMAIL_VERIFICATION_REQUIRED && emailStatus === 'cancelled' && (
          <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '6px', padding: '8px 10px', background: 'var(--danger-light)', borderRadius: '6px', borderLeft: '3px solid var(--danger)' }}>
            <strong>✗ Email verification cancelled.</strong> You (or someone) clicked "No, this wasn't me" in the inbox. If this is the wrong email, type a different one above and click <strong>Verify Email</strong> again.
          </div>
        )}
        {EMAIL_VERIFICATION_REQUIRED && emailStatus === 'expired' && (
          <div style={{ fontSize: '12px', color: 'var(--warning)', marginTop: '6px', padding: '8px 10px', background: 'var(--warning-light)', borderRadius: '6px', borderLeft: '3px solid var(--warning)' }}>
            ⏱ The verification link expired before it was confirmed. Click <strong>Verify Email</strong> to send a fresh one.
          </div>
        )}
        {EMAIL_VERIFICATION_REQUIRED && emailStatus !== 'verified' && (emailLockedUntil > now || emailCooldownUntil > now || emailAttemptsLeft < 5) && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
            {emailLockedUntil > now ? (
              <span style={{ color: 'var(--danger)' }}>
                ⛔ Too many attempts. Locked for <strong>{fmtSeconds(emailLockedUntil - now)}</strong>.
              </span>
            ) : emailCooldownUntil > now ? (
              <span style={{ color: 'var(--warning)' }}>
                ⏳ Please wait <strong>{fmtSeconds(emailCooldownUntil - now)}</strong> before re-sending. Attempts left: <strong>{emailAttemptsLeft}</strong>
              </span>
            ) : (
              <span>Attempts left: <strong>{emailAttemptsLeft}</strong> in this 10-minute window (30s cooldown applies after the 3rd).</span>
            )}
          </div>
        )}
      </div>

      {/* PHONE (format-only validation; no OTP) */}
      <div className="form-group">
        <label className="form-label">Phone Number *</label>
        <input className="form-input" type="tel" value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="e.g. +92 300 1234567"
          style={fieldBorder(phoneValid, phone.length > 0)}
          autoComplete="tel" required />
        {phone.length > 0 && !phoneValid && (
          <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>
            {phoneCheck.error} <span style={{ color: 'var(--text3)' }}>Example: <strong>+92 300 1234567</strong></span>
          </div>
        )}
        {phoneValid && phoneCheck.national && (
          <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>
            ✓ {phoneCheck.country} · {phoneCheck.national}
          </div>
        )}
      </div>

      {/* PASSWORD */}
      <div
        className="form-group"
        style={EMAIL_VERIFICATION_REQUIRED
          ? { opacity: emailStatus === 'verified' ? 1 : 0.5, pointerEvents: emailStatus === 'verified' ? 'auto' : 'none' }
          : undefined}
      >
        <label className="form-label">Password *</label>
        <div style={{ position: 'relative' }}>
          <input className="form-input" type={showPwd ? 'text' : 'password'} value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="e.g. MyStr0ng!Pass2026"
            style={{ paddingRight: '40px', ...fieldBorder(pwAllOk, password.length > 0) }}
            autoComplete="new-password" required />
          <button type="button" onClick={() => setShowPwd(s => !s)}
            title={showPwd ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
            <EyeIcon shown={showPwd} />
          </button>
        </div>

        {password.length > 0 && (
          <>
            <div style={{ marginTop: '8px' }}>
              <div style={{ height: '6px', background: 'var(--surface3)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${strength.pct}%`, height: '100%', background: strength.color, transition: 'all .2s' }} />
              </div>
              <div style={{ fontSize: '11px', color: strength.color, fontWeight: 700, marginTop: '4px' }}>
                Strength: {strength.label}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              <Pill ok={pwChecks.length}>12+ chars</Pill>
              <Pill ok={pwChecks.upper}>uppercase</Pill>
              <Pill ok={pwChecks.lowerCase}>lowercase</Pill>
              <Pill ok={pwChecks.number}>number</Pill>
              <Pill ok={pwChecks.special}>special</Pill>
              <Pill ok={pwChecks.noCommon}>not common</Pill>
              <Pill ok={pwChecks.noPersonal}>no name / email / phone</Pill>
            </div>
          </>
        )}
      </div>

      {/* CONFIRM PASSWORD */}
      <div
        className="form-group"
        style={EMAIL_VERIFICATION_REQUIRED
          ? { opacity: emailStatus === 'verified' ? 1 : 0.5, pointerEvents: emailStatus === 'verified' ? 'auto' : 'none' }
          : undefined}
      >
        <label className="form-label">Confirm Password *</label>
        <div style={{ position: 'relative' }}>
          <input className="form-input" type={showConfirm ? 'text' : 'password'} value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            style={{ paddingRight: '40px', ...fieldBorder(pwMatch, confirm.length > 0) }}
            autoComplete="new-password" required />
          <button type="button" onClick={() => setShowConfirm(s => !s)}
            title={showConfirm ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
            <EyeIcon shown={showConfirm} />
          </button>
        </div>
        {confirm.length > 0 && (
          <div style={{ fontSize: '11px', color: pwMatch ? 'var(--accent)' : 'var(--danger)', marginTop: '4px' }}>
            {pwMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button type="submit" className="btn btn-primary btn-full" disabled={!canSubmit}>
          {submitting ? 'Creating account…' : submitLabel}
        </button>
      </div>
      {onCancel && (
        <button type="button" className="btn btn-ghost btn-full" onClick={onCancel} disabled={submitting}>
          Cancel — Back to Login
        </button>
      )}
    </form>
  );
};

export default VerifiedCredentialsStep;
