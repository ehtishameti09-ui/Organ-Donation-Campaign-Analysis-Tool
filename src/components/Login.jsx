import { useState, useEffect } from 'react';
import { login, verifyLoginTwoFactor, canRecoverDeletedAccount, restoreDeletedAccount, cleanupExpiredDeletedAccounts, BAN_CATEGORIES, submitAppeal, validateEmail } from '../utils/auth';
import { sendPasswordResetLinkViaAPI, resetPasswordViaAPI, resendTwoFactorLoginCode } from '../utils/api';
import { toast } from '../utils/toast';

const Login = ({ onLoginSuccess, onCreateAccount }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googlePending, setGooglePending] = useState(null); // { token, name, email } when new Google user
  const [pickedRole, setPickedRole] = useState(null);
  const [hospitalName, setHospitalName] = useState('');
  const [completing, setCompleting] = useState(false);
  // 2FA challenge state
  const [twoFA, setTwoFA] = useState(null); // { challengeToken, maskedEmail } when challenge is active
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0); // 40-second countdown; 0 = expired

  // Live public stats shown on the splash panel
  const [publicStats, setPublicStats] = useState({ transplants: null, activeDonors: null, hospitals: null });
  useEffect(() => {
    fetch('http://localhost:8000/api/stats/public', { headers: { 'Accept': 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPublicStats(d); })
      .catch(() => {});
  }, []);

  // Tick the OTP countdown every second while a challenge is active
  useEffect(() => {
    if (!twoFA || otpSecondsLeft <= 0) return;
    const id = setInterval(() => {
      setOtpSecondsLeft(s => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [twoFA, otpSecondsLeft]);

  // Check if Google OAuth is configured on the backend
  useEffect(() => {
    fetch('http://localhost:8000/api/oauth/google/status', { headers: { 'Accept': 'application/json' } })
      .then(r => r.ok ? r.json() : { configured: false })
      .then(d => setGoogleConfigured(!!d.configured))
      .catch(() => setGoogleConfigured(false));
  }, []);

  // Pick up a pending Google registration (set by App.jsx after OAuth callback)
  useEffect(() => {
    const pull = () => {
      if (window.__googlePending) {
        setGooglePending(window.__googlePending);
        setHospitalName(window.__googlePending.name || '');
      }
    };
    pull();
    window.addEventListener('google:role-picker-open', pull);
    return () => window.removeEventListener('google:role-picker-open', pull);
  }, []);

  // Pick up a Google 2FA challenge (set by App.jsx after OAuth callback when user has 2FA enabled)
  useEffect(() => {
    const open2FA = () => {
      if (window.__google2FA) {
        setTwoFA({
          challengeToken: window.__google2FA.challengeToken,
          maskedEmail: window.__google2FA.maskedEmail || 'your email',
        });
        setOtpCode('');
        setOtpSecondsLeft(40);
        toast(`Verification code sent to ${window.__google2FA.maskedEmail || 'your email'}.`, 'info');
        window.__google2FA = null;
      }
    };
    open2FA();
    window.addEventListener('google:2fa-open', open2FA);
    return () => window.removeEventListener('google:2fa-open', open2FA);
  }, []);

  const completeGoogleSignup = async () => {
    if (!googlePending || !pickedRole) return;
    if (pickedRole === 'hospital' && !hospitalName.trim()) {
      toast('Hospital name is required.', 'error');
      return;
    }
    setCompleting(true);
    try {
      const r = await fetch('http://localhost:8000/api/oauth/google/complete-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          pending_token: googlePending.token,
          role: pickedRole,
          hospital_name: pickedRole === 'hospital' ? hospitalName.trim() : null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Registration failed');
      // Persist token + user, log in
      localStorage.setItem('odcat_token', data.token);
      localStorage.setItem('odcat_user', JSON.stringify(data.user));
      localStorage.setItem('odcat_current', JSON.stringify(data.user));
      window.__googlePending = null;
      toast(`Welcome, ${data.user.name?.split(' ')[0] || 'User'}!`, 'success');
      onLoginSuccess && onLoginSuccess(data.user);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setCompleting(false);
    }
  };
  const [showBannedModal, setShowBannedModal] = useState(false);
  const [bannedUserInfo, setBannedUserInfo] = useState(null);
  const [showDeletedRecoveryModal, setShowDeletedRecoveryModal] = useState(false);
  const [deletedUserInfo, setDeletedUserInfo] = useState(null);
  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState('request'); // 'request', 'verify', 'reset'
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetTokenInput, setResetTokenInput] = useState('');
  // Appeal State
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealExplanation, setAppealExplanation] = useState('');
  // 'ban' when appealing a ban, 'delete' when appealing an admin deletion
  const [appealType, setAppealType] = useState('ban');
  const [appealLoading, setAppealLoading] = useState(false);

  // Run cleanup on component mount
  useEffect(() => {
    cleanupExpiredDeletedAccounts();
  }, []);

  // Keyboard navigation for Forgot Password Modal
  useEffect(() => {
    if (!showForgotPassword) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowForgotPassword(false);
        setForgotStep('request');
        setForgotEmail('');
        setResetTokenInput('');
        setNewPassword('');
        setConfirmPassword('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showForgotPassword]);

  // Keyboard navigation for Appeal Modal
  useEffect(() => {
    if (!showAppealModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAppealModal(false);
      }
      if (e.key === 'Enter' && appealExplanation.trim() && !appealLoading) {
        e.preventDefault();
        handleSubmitAppeal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showAppealModal, appealExplanation, appealLoading]);

  const handleAppealClick = (type = 'ban') => {
    setAppealType(type);
    setAppealExplanation('');
    setShowAppealModal(true);
  };

  const handleSubmitAppeal = async () => {
    if (appealExplanation.trim().length < 20) {
      toast('Please write at least 20 characters explaining your appeal.', 'error');
      return;
    }

    const target = appealType === 'delete' ? deletedUserInfo : bannedUserInfo;
    if (!target?.id) {
      toast('Unable to submit appeal — missing account info.', 'error');
      return;
    }

    setAppealLoading(true);
    try {
      await submitAppeal(target.id, appealExplanation, {}, appealType);
      toast('Appeal submitted. A different administrator will review it within 7 days.', 'success');
      setShowAppealModal(false);
      setAppealExplanation('');
      if (appealType === 'delete') {
        setShowDeletedRecoveryModal(false);
        setDeletedUserInfo(null);
      } else {
        setShowBannedModal(false);
        setBannedUserInfo(null);
      }
    } catch (err) {
      toast(err.message || 'Appeal submission failed.', 'error');
    } finally {
      setAppealLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailCheck = validateEmail(forgotEmail);
    if (!emailCheck.ok) { toast(emailCheck.error, 'error'); return; }

    setForgotLoading(true);
    try {
      await sendPasswordResetLinkViaAPI(forgotEmail);
      setForgotStep('verify');
      toast('Reset link sent to your email! Enter the token from the email below.', 'success', 5000);
    } catch (err) {
      toast(err.message || 'Failed to send reset link.', 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyResetToken = () => {
    if (!resetTokenInput.trim()) {
      toast('Please enter the reset token from your email.', 'error');
      return;
    }
    setResetToken(resetTokenInput);
    setForgotStep('reset');
    toast('Token accepted. Set your new password.', 'success');
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) { toast('Please enter a new password.', 'error'); return; }
    if (newPassword !== confirmPassword) { toast('Passwords do not match.', 'error'); return; }
    if (newPassword.length < 8) { toast('Password must be at least 8 characters long.', 'error'); return; }

    setForgotLoading(true);
    try {
      await resetPasswordViaAPI(forgotEmail, resetToken, newPassword);
      toast('Password reset successfully! You can now log in.', 'success');
      setShowForgotPassword(false);
      setForgotEmail('');
      setResetToken(null);
      setNewPassword('');
      setConfirmPassword('');
      setForgotStep('request');
      setResetTokenInput('');
    } catch (err) {
      toast(err.message || 'Password reset failed.', 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleRecoverAccount = async () => {
    try {
      await restoreDeletedAccount(deletedUserInfo.id);
      toast('Account restored successfully!', 'success');
      setShowDeletedRecoveryModal(false);
      setDeletedUserInfo(null);
      const user = await login(email, password);
      toast(`Welcome back, ${user.name}!`, 'success');
      setTimeout(() => onLoginSuccess(user), 500);
    } catch (err) {
      toast(err.message || 'Account recovery failed.', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate email format before hitting backend
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      toast(emailCheck.error, 'error');
      return;
    }
    if (!password.trim()) {
      toast('Please enter your password.', 'error');
      return;
    }

    setLoading(true);

    try {
      const result = await login(email, password);
      // 2FA challenge — switch to OTP entry view
      if (result && result.requires2FA) {
        setTwoFA({ challengeToken: result.challengeToken, maskedEmail: result.maskedEmail });
        setOtpCode('');
        setOtpSecondsLeft(40);
        setLoading(false);
        toast(`Verification code sent to ${result.maskedEmail}.`, 'info');
        return;
      }
      const user = result;
      toast(`Welcome back, ${user.name}!`, 'success');
      setTimeout(() => onLoginSuccess(user), 500);
    } catch (error) {
      // The backend may have sent us a rich payload — surface the right recovery modal
      if (error.banned) {
        setBannedUserInfo({
          id: error.user_id,
          name: error.user_name || email,
          email: error.user_email || email,
          ban_details: error.ban_details || {},
          hospital_id: error.user_hospital_id || null,
        });
        setShowBannedModal(true);
        setLoading(false);
        return;
      }
      if (error.deleted) {
        setDeletedUserInfo({
          id: error.user_id,
          name: error.user_name || email,
          email: error.user_email || email,
          deletionDetails: error.deletion_details || {},
          hospital_id: error.user_hospital_id || null,
        });
        setShowDeletedRecoveryModal(true);
        setLoading(false);
        return;
      }

      const msg = error.message || 'Login failed. Please check your credentials.';
      if (msg.includes('verified') || msg.includes('verification')) {
        toast('Please verify your email before logging in.', 'error');
      } else if (msg.includes('credentials') || msg.includes('password') || msg.includes('401')) {
        toast('Incorrect email or password. Please try again.', 'error');
      } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('CORS') || msg.includes('Failed to fetch')) {
        toast('Cannot connect to server. Make sure the backend is running.', 'error');
      } else {
        toast(msg, 'error');
      }
      setLoading(false);
    }
  };

  const fillLogin = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    toast('Credentials filled — click Sign In to continue.', 'info', 2500);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpSecondsLeft === 0) {
      toast('Code expired. Click "Resend code" to get a new one.', 'error');
      return;
    }
    if (!/^\d{6}$/.test(otpCode)) {
      toast('Enter the 6-digit code from your email.', 'error');
      return;
    }
    setVerifyingOtp(true);
    try {
      const user = await verifyLoginTwoFactor(twoFA.challengeToken, otpCode);
      toast(`Welcome back, ${user.name}!`, 'success');
      setTimeout(() => onLoginSuccess(user), 400);
    } catch (err) {
      toast(err.message || 'Invalid code.', 'error');
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpSecondsLeft > 0) return; // resend gated until current code expires
    setResendingOtp(true);
    try {
      await resendTwoFactorLoginCode(twoFA.challengeToken);
      setOtpCode('');
      setOtpSecondsLeft(40);
      toast('A new code has been sent.', 'success');
    } catch (err) {
      toast(err.message || 'Failed to resend code.', 'error');
    } finally {
      setResendingOtp(false);
    }
  };

  const cancelOtp = () => {
    setTwoFA(null);
    setOtpCode('');
    setVerifyingOtp(false);
    setOtpSecondsLeft(0);
  };

  return (
    <div className="auth-wrapper">
      {/* Google role-picker modal — appears after a brand-new Google user comes back from OAuth */}
      {googlePending && (
        <div className="modal-overlay show" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: '560px', width: '95%' }}>
            <header className="modal-header">
              <h3>Welcome, {(googlePending.name || googlePending.email).split(' ')[0]}! 👋</h3>
            </header>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
                Your Google account <strong>{googlePending.email}</strong> isn't registered yet. Choose how you'd like to use ODCAT:
              </p>
              <div style={{ display: 'grid', gap: '10px' }}>
                {[
                  { id: 'donor',     icon: '❤️', title: 'Donor',     desc: 'Pledge to donate organs/tissue. Complete a short clinical wizard after signing up.' },
                  { id: 'recipient', icon: '🏥', title: 'Recipient', desc: 'Register for the transplant waitlist with your medical case details.' },
                  { id: 'hospital',  icon: '🏨', title: 'Hospital',  desc: 'Register your hospital. Goes through admin review before approval.' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPickedRole(opt.id)}
                    style={{
                      textAlign: 'left',
                      padding: '14px',
                      border: pickedRole === opt.id ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: pickedRole === opt.id ? 'var(--primary-light)' : 'var(--surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      transition: 'all .15s',
                    }}
                  >
                    <span style={{ fontSize: '22px' }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: pickedRole === opt.id ? 'var(--primary)' : 'var(--text)' }}>{opt.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '3px' }}>{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {pickedRole === 'hospital' && (
                <div style={{ marginTop: '14px' }}>
                  <label className="form-label">Hospital Name *</label>
                  <input
                    className="form-input"
                    value={hospitalName}
                    onChange={e => setHospitalName(e.target.value)}
                    placeholder="e.g. Aga Khan University Hospital"
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                    You'll need to complete a registration form with documents before your hospital is approved.
                  </div>
                </div>
              )}
            </div>
            <footer className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setGooglePending(null);
                  setPickedRole(null);
                  window.__googlePending = null;
                  toast('Sign-up cancelled. You can try again anytime.', 'info');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!pickedRole || completing || (pickedRole === 'hospital' && !hospitalName.trim())}
                onClick={completeGoogleSignup}
              >
                {completing ? 'Creating account…' : `Continue as ${pickedRole ? pickedRole.charAt(0).toUpperCase() + pickedRole.slice(1) : '...'}`}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Left Panel */}
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <svg viewBox="0 0 24 24" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div className="auth-logo-text">
              <h1>Organ Donation Campaign Analysis Tool</h1>
              <p>Healthcare System</p>
            </div>
          </div>
          <h2 className="auth-headline">
            Transforming<br/>
            Organ Donation<br/>
            Management
          </h2>
          <p className="auth-subtext">
            A comprehensive platform for hospitals, donors, and recipients to streamline organ transplant operations with transparency and efficiency.
          </p>
        </div>
        <div style={{ position: 'relative', zIndex: 2, margin: '24px 0' }}>
          <div className="auth-stats">
            <div className="auth-stat">
              <div className="auth-stat-val">{publicStats.transplants !== null ? publicStats.transplants.toLocaleString() : '—'}</div>
              <div className="auth-stat-lbl">Transplants</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-val">{publicStats.activeDonors !== null ? publicStats.activeDonors.toLocaleString() : '—'}</div>
              <div className="auth-stat-lbl">Active Donors</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-val">{publicStats.hospitals !== null ? publicStats.hospitals.toLocaleString() : '—'}</div>
              <div className="auth-stat-lbl">Hospitals</div>
            </div>
          </div>
        </div>
        <div className="auth-features">
          <div className="auth-feature">
            <div className="auth-feature-icon">
              <svg viewBox="0 0 24 24" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h3>Secure & Compliant</h3>
            <p>RBAC & audit trails</p>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon">
              <svg viewBox="0 0 24 24" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3>Real-time Tracking</h3>
            <p>Monitor every step</p>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon">
              <svg viewBox="0 0 24 24" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <h3>Save Lives</h3>
            <p>Efficient allocation</p>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div style={{ width: '52px', height: '52px', background: 'var(--primary)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <svg viewBox="0 0 24 24" width="26" height="26" stroke="#fff" fill="none" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text1)' }}>Organ Donation Campaign Analysis Tool</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Organ Donation Campaign Analysis Tool</div>
          </div>

          {twoFA ? (
            <div>
              <div className="auth-card-header" style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '50%',
                    background: 'var(--primary-light)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                </div>
                <h2 style={{ marginBottom: '8px' }}>2-Step Verification</h2>
                <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
                  To help keep your account safe, we want to make sure it's really you trying to sign in.
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '12px' }}>
                  We sent a verification code to<br/>
                  <strong style={{ color: 'var(--text1)' }}>{twoFA.maskedEmail}</strong>
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} style={{ marginTop: '20px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ textAlign: 'center', display: 'block' }}>Enter the 6-digit code</label>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="– – – – – –"
                    autoFocus
                    disabled={otpSecondsLeft === 0}
                    style={{
                      fontSize: '24px',
                      letterSpacing: '12px',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      padding: '14px',
                      fontWeight: '600',
                    }}
                  />
                </div>

                <div style={{ fontSize: '12px', marginTop: '4px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {otpSecondsLeft > 0 ? (
                    <span style={{ color: otpSecondsLeft <= 10 ? 'var(--danger)' : 'var(--text3)' }}>
                      ⏱ Code expires in <strong>{otpSecondsLeft}s</strong>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                      ⚠ Code expired
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendingOtp || otpSecondsLeft > 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: otpSecondsLeft > 0 ? 'var(--text3)' : 'var(--primary)',
                      cursor: otpSecondsLeft > 0 ? 'not-allowed' : 'pointer',
                      padding: 0,
                      fontWeight: 600,
                    }}
                  >
                    {resendingOtp ? 'Sending…' : (otpSecondsLeft > 0 ? `Resend in ${otpSecondsLeft}s` : 'Resend code')}
                  </button>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={verifyingOtp || otpCode.length !== 6 || otpSecondsLeft === 0}
                >
                  {verifyingOtp ? 'Verifying…' : 'Verify & Continue'}
                </button>

                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <a href="#" className="form-link" onClick={(e) => { e.preventDefault(); cancelOtp(); }}>
                    Use a different account
                  </a>
                </div>
              </form>
            </div>
          ) : (
          <>
          <div className="auth-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your Organ Donation Campaign Analysis Tool account to continue</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="form-input-wrap">
                <svg className="form-input-icon" viewBox="0 0 24 24" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <div className="flex justify-between items-center" style={{ marginBottom: '6px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                <a href="#" className="form-link" onClick={(e) => { e.preventDefault(); setShowForgotPassword(true); setForgotEmail(email); }}>
                  Forgot password?
                </a>
              </div>
              <div className="form-input-wrap">
                <svg className="form-input-icon" viewBox="0 0 24 24" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="form-input-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
              style={{ marginTop: '4px' }}
            >
              {loading ? (
                'Signing in...'
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="divider-text"><span>or</span></div>

          <button
            type="button"
            disabled={!googleConfigured}
            title={googleConfigured ? 'Sign in with your Google account' : 'Google sign-in is not configured on this server. Use email/password below, or contact the administrator to set up GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'}
            onClick={() => {
              if (!googleConfigured) {
                toast('Google sign-in is not yet configured on this server. Use email/password below.', 'warning');
                return;
              }
              window.location.href = 'http://localhost:8000/api/oauth/google/redirect';
            }}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: googleConfigured ? '#fff' : '#f5f5f5',
              border: '1px solid #dadce0',
              borderRadius: 'var(--radius)',
              cursor: googleConfigured ? 'pointer' : 'not-allowed',
              opacity: googleConfigured ? 1 : 0.55,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#3c4043',
              transition: 'box-shadow .15s, background .15s',
              marginBottom: '12px',
            }}
            onMouseEnter={e => { if (googleConfigured) { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.1)'; } }}
            onMouseLeave={e => { if (googleConfigured) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = 'none'; } }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            {googleConfigured ? 'Continue with Google' : 'Google sign-in (not configured)'}
          </button>

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onCreateAccount && onCreateAccount(); }}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: '2px solid var(--primary)',
              color: 'var(--primary)',
              borderRadius: 'var(--radius)',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              marginTop: '4px',
              marginBottom: '12px',
              transition: 'background .15s, color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--primary)'; }}
          >
            Don't have an account? Create one
          </button>

          <div className="demo-box">
            <div className="demo-box-title">Demo Credentials — Click any role to test</div>
            <div className="demo-creds">
              <div className="demo-cred"><strong>Super Admin:</strong> admin@odcat.com / Admin@123</div>
              <div className="demo-cred"><strong>Admin:</strong> dr.ali@odcat.com / Admin@123</div>
              <div className="demo-cred"><strong>Hospital:</strong> cmh@odcat.com / Hospital@123</div>
              <div className="demo-cred"><strong>Donor:</strong> ahmed.khan@odcat.com / Donor@123</div>
              <div className="demo-cred"><strong>Recipient:</strong> nadia.qureshi@odcat.com / Recipient@123</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => fillLogin('admin@odcat.com', 'Admin@123')}>
                Super Admin
              </button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => fillLogin('dr.ali@odcat.com', 'Admin@123')}>
                Admin
              </button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => fillLogin('cmh@odcat.com', 'Hospital@123')}>
                Hospital
              </button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => fillLogin('ahmed.khan@odcat.com', 'Donor@123')}>
                Donor
              </button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => fillLogin('nadia.qureshi@odcat.com', 'Recipient@123')}>
                Recipient
              </button>
            </div>
          </div>

          <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '20px' }}>
            © 2026 Organ Donation Campaign Analysis Tool Healthcare · Saving lives through organ donation
          </p>
          </>
          )}
        </div>
      </div>

      {/* Banned User Modal */}
      {showBannedModal && bannedUserInfo && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header" style={{ background: '#fee2e2', borderBottom: '2px solid #dc2626' }}>
              <h3 style={{ color: '#991b1b' }}>🚫 Account Banned</h3>
              <button className="modal-close" onClick={() => { setShowBannedModal(false); setBannedUserInfo(null); }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: '#fef3c7', borderRadius: 'var(--radius)', borderLeft: '3px solid #f59e0b' }}>
                <div style={{ fontSize: '12px', color: '#921a21', fontWeight: '600' }}>
                  ⚠️ Your account has been {bannedUserInfo.banDetails?.banType === 'permanent' ? 'permanently' : 'temporarily'} banned
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '6px' }}>Violation Category</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>
                  {BAN_CATEGORIES[bannedUserInfo.banDetails?.category]?.label || bannedUserInfo.banDetails?.category}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '6px' }}>Admin's Explanation</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', background: 'var(--surface2)', padding: '10px', borderRadius: 'var(--radius)', whiteSpace: 'pre-wrap' }}>
                  {bannedUserInfo.banDetails?.detailedReason}
                </div>
              </div>

              {bannedUserInfo.banDetails?.banType === 'temporary' && (
                <div style={{ marginBottom: '16px', padding: '12px', background: '#dbeafe', borderRadius: 'var(--radius)', borderLeft: '3px solid #0ea5e9' }}>
                  <div style={{ fontSize: '11px', color: '#0c4a6e', fontWeight: '600' }}>⏰ Ban Duration</div>
                  <div style={{ fontSize: '12px', color: '#0c4a6e', marginTop: '4px' }}>
                    {bannedUserInfo.banDetails?.duration} days (expires: {new Date(bannedUserInfo.banDetails?.expiryDate).toLocaleDateString()})
                  </div>
                </div>
              )}

              {bannedUserInfo.banDetails?.banType !== 'permanent' && (
                <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: 'var(--radius)', borderLeft: '3px solid #10b981' }}>
                  <div style={{ fontSize: '11px', color: '#166534', fontWeight: '600', marginBottom: '6px' }}>📋 Appeal Your Ban</div>
                  <div style={{ fontSize: '12px', color: '#166534', marginBottom: '10px' }}>
                    You can appeal this ban within 30 days. An admin will review your appeal and respond within 7 days.
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowBannedModal(false); setBannedUserInfo(null); }}>
                Close
              </button>
              {bannedUserInfo.banDetails?.banType !== 'permanent' && (
                <button className="btn btn-primary" onClick={() => handleAppealClick('ban')}>
                  📝 Create Appeal
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Recovery Modal */}
      {showDeletedRecoveryModal && deletedUserInfo && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header" style={{ background: '#dbeafe', borderBottom: '2px solid #0ea5e9' }}>
              <h3 style={{ color: '#0c4a6e' }}>🔄 Recover Your Account</h3>
              <button className="modal-close" onClick={() => { setShowDeletedRecoveryModal(false); setDeletedUserInfo(null); }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: '#ecf0f1', borderRadius: 'var(--radius)', borderLeft: '3px solid #3498db' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#2c3e50' }}>
                  Your account was marked for deletion
                </div>
              </div>

              {deletedUserInfo.deletionDetails?.isSelfDelete ? (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '6px' }}>Reason</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                      {deletedUserInfo.deletionDetails?.reason || deletedUserInfo.deletionDetails?.detailedReason || 'User requested deletion'}
                    </div>
                  </div>

                  <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: 'var(--radius)', borderLeft: '3px solid #10b981' }}>
                    <div style={{ fontSize: '11px', color: '#166534', fontWeight: '600', marginBottom: '6px' }}>✅ Account Recovery Available</div>
                    <div style={{ fontSize: '12px', color: '#166534', marginBottom: '12px' }}>
                      You have until {new Date(deletedUserInfo.deletionDetails?.recoveryDeadline).toLocaleDateString()} to restore your account. After this date, your account and all data will be permanently deleted.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '6px' }}>Deleted by</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>
                      {deletedUserInfo.deletionDetails?.deletingAdminName || 'an administrator'}
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '6px' }}>Reason given</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', background: 'var(--surface2)', padding: '10px', borderRadius: 'var(--radius)', whiteSpace: 'pre-wrap' }}>
                      {deletedUserInfo.deletionDetails?.reason || deletedUserInfo.deletionDetails?.detailedReason || 'No reason provided'}
                    </div>
                  </div>
                  {deletedUserInfo.deletionDetails?.recoveryDeadline && (
                    <div style={{ marginBottom: '16px', fontSize: '11px', color: 'var(--text3)' }}>
                      Recovery window closes on <strong>{new Date(deletedUserInfo.deletionDetails.recoveryDeadline).toLocaleDateString()}</strong>.
                    </div>
                  )}
                  <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: 'var(--radius)', borderLeft: '3px solid #10b981' }}>
                    <div style={{ fontSize: '11px', color: '#166534', fontWeight: '600', marginBottom: '6px' }}>📋 Request Reinstatement</div>
                    <div style={{ fontSize: '12px', color: '#166534' }}>
                      If you believe this deletion was a mistake, you can submit a request. A different administrator at your hospital will review it within 7 days.
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowDeletedRecoveryModal(false); setDeletedUserInfo(null); }}>
                Close
              </button>
              {deletedUserInfo.deletionDetails?.isSelfDelete ? (
                <button className="btn btn-primary" onClick={handleRecoverAccount}>
                  ✅ Restore Account
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => handleAppealClick('delete')}>
                  📝 Request Reinstatement
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Appeal Submission Modal — works for both ban and delete appeals */}
      {showAppealModal && (appealType === 'delete' ? deletedUserInfo : bannedUserInfo) && (() => {
        const isDelete = appealType === 'delete';
        const ctx = isDelete ? deletedUserInfo : bannedUserInfo;
        const details = isDelete ? ctx?.deletionDetails : ctx?.banDetails;
        return (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '550px' }}>
            <div className="modal-header" style={{ background: '#dbeafe' }}>
              <h3>⚖️ {isDelete ? 'Request Account Reinstatement' : 'Submit Appeal'}</h3>
              <button className="modal-close" onClick={() => setShowAppealModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '4px' }}>
                  {isDelete ? 'Deletion Details' : 'Ban Details'}
                </div>
                <div style={{ fontSize: '12px' }}>
                  {isDelete ? (
                    <>
                      <strong>Deleted by:</strong> {details?.deletingAdminName || 'an administrator'}<br/>
                      {details?.deletionDate && <>
                        <strong>Date:</strong> {new Date(details.deletionDate).toLocaleDateString()}
                      </>}
                    </>
                  ) : (
                    <>
                      <strong>Category:</strong> {BAN_CATEGORIES[details?.category]?.label || details?.category}<br/>
                      <strong>Type:</strong> {details?.banType === 'permanent' ? 'Permanent' : `Temporary (${details?.duration} days)`}
                    </>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '4px' }}>Reason given</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>
                  {details?.reason || details?.detailedReason || 'No reason provided'}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Your explanation *</label>
                <textarea
                  className="form-input"
                  value={appealExplanation}
                  onChange={(e) => setAppealExplanation(e.target.value)}
                  placeholder={isDelete
                    ? "Explain why your account should be reinstated. Be clear and honest..."
                    : "Explain why you believe this ban should be reversed or reconsidered..."}
                  style={{ minHeight: '120px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                  A different administrator at your hospital will review your appeal within 7 days. ({appealExplanation.length}/20 minimum)
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAppealModal(false)} disabled={appealLoading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSubmitAppeal} disabled={appealLoading || appealExplanation.trim().length < 20}>
                {appealLoading ? '⏳ Submitting...' : '📝 Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '550px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%)', borderBottom: '2px solid #f59e0b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>🔑</span>
                <div>
                  <h3 style={{ color: '#92400e', margin: 0 }}>Reset Your Password</h3>
                  <div style={{ fontSize: '11px', color: '#b45309' }}>Secure password recovery</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setShowForgotPassword(false); setForgotEmail(''); setResetToken(null); setNewPassword(''); setConfirmPassword(''); setForgotStep('request'); setResetTokenInput(''); }}>×</button>
            </div>
            <div className="modal-body">
              {forgotStep === 'request' && (
                <>
                  <div style={{ marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: 'var(--radius)', borderLeft: '4px solid #10b981' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#166534', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✅</span> How It Works
                    </div>
                    <ol style={{ fontSize: '12px', color: '#166534', margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                      <li>Enter your registered email address</li>
                      <li>We'll send you a secure reset code</li>
                      <li>Use the code to create a new password</li>
                      <li>Log in with your new credentials</li>
                    </ol>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📧</span> Email Address *
                    </label>
                    <input
                      className="form-input"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Enter your registered email"
                      disabled={forgotLoading}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </>
              )}

              {forgotStep === 'verify' && (
                <>
                  <div style={{ marginBottom: '16px', padding: '16px', background: '#f0fdf4', borderRadius: 'var(--radius)', borderLeft: '4px solid #10b981' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#166534', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✅</span> Reset Code Sent
                    </div>
                    <div style={{ fontSize: '12px', color: '#166534' }}>
                      Check your email for the reset code. Copy and paste it below:
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px', padding: '16px', background: 'linear-gradient(135deg, var(--surface2) 0%, var(--surface1) 100%)', borderRadius: 'var(--radius)', fontFamily: 'monospace', fontSize: '14px', fontWeight: '700', wordBreak: 'break-all', color: 'var(--primary)', textAlign: 'center', border: '2px dashed var(--primary)', letterSpacing: '2px' }}>
                    {resetToken}
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔐</span> Enter Reset Code *
                    </label>
                    <input
                      className="form-input"
                      type="text"
                      value={resetTokenInput}
                      onChange={(e) => setResetTokenInput(e.target.value)}
                      placeholder="Paste the reset code from your email"
                      disabled={forgotLoading}
                      style={{ fontSize: '12px', fontWeight: '500' }}
                    />
                  </div>
                </>
              )}

              {forgotStep === 'reset' && (
                <>
                  <div style={{ marginBottom: '20px', padding: '16px', background: '#dbeafe', borderRadius: 'var(--radius)', borderLeft: '4px solid #0891b2' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0c4a6e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔒</span> Create New Password
                    </div>
                    <div style={{ fontSize: '12px', color: '#0c4a6e' }}>
                      Enter a strong password (minimum 8 characters with mix of letters, numbers, and symbols).
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔐</span> New Password *
                    </label>
                    <input
                      className="form-input"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter strong new password"
                      disabled={forgotLoading}
                      autoComplete="new-password"
                      style={{ fontSize: '12px' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✔️</span> Confirm Password *
                    </label>
                    <input
                      className="form-input"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      disabled={forgotLoading}
                      autoComplete="new-password"
                      style={{
                        fontSize: '12px',
                        borderColor: confirmPassword && newPassword !== confirmPassword ? '#dc2626' : 'var(--border)',
                        borderWidth: confirmPassword ? '2px' : '1px'
                      }}
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>❌</span> Passwords do not match
                      </div>
                    )}
                    {confirmPassword && newPassword === confirmPassword && (
                      <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✅</span> Passwords match
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer" style={{ borderTop: '2px solid #fef3c7' }}>
              <button className="btn btn-ghost" onClick={() => { setShowForgotPassword(false); setForgotEmail(''); setResetToken(null); setNewPassword(''); setConfirmPassword(''); setForgotStep('request'); setResetTokenInput(''); }} disabled={forgotLoading} style={{ fontWeight: '600' }}>
                Close
              </button>
              {forgotStep === 'request' && (
                <button className="btn btn-primary" onClick={handleForgotPassword} disabled={forgotLoading || !forgotEmail.trim()} style={{ 
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: '2px solid #d97706',
                  fontWeight: '700',
                  boxShadow: !forgotLoading && forgotEmail.trim() ? '0 4px 12px rgba(245, 158, 11, 0.25)' : 'none',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  if (!forgotLoading && forgotEmail.trim()) {
                    e.target.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.35)';
                    e.target.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!forgotLoading && forgotEmail.trim()) {
                    e.target.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.25)';
                    e.target.style.transform = 'translateY(0)';
                  }
                }}
                >
                  {forgotLoading ? '⏳ Sending...' : '📧 Send Reset Code'}
                </button>
              )}
              {forgotStep === 'verify' && (
                <button className="btn btn-primary" onClick={handleVerifyResetToken} disabled={forgotLoading || !resetTokenInput.trim()} style={{ 
                  background: 'linear-gradient(135deg, #0891b2 0%, #0369a1 100%)',
                  border: '2px solid #06b6d4',
                  fontWeight: '700',
                  boxShadow: !forgotLoading && resetTokenInput.trim() ? '0 4px 12px rgba(8, 145, 178, 0.25)' : 'none',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  if (!forgotLoading && resetTokenInput.trim()) {
                    e.target.style.boxShadow = '0 6px 16px rgba(8, 145, 178, 0.35)';
                    e.target.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!forgotLoading && resetTokenInput.trim()) {
                    e.target.style.boxShadow = '0 4px 12px rgba(8, 145, 178, 0.25)';
                    e.target.style.transform = 'translateY(0)';
                  }
                }}
                >
                  {forgotLoading ? '⏳ Verifying...' : '✅ Verify Code'}
                </button>
              )}
              {forgotStep === 'reset' && (
                <button className="btn btn-primary" onClick={handleResetPassword} disabled={forgotLoading || !newPassword.trim() || !confirmPassword.trim() || newPassword !== confirmPassword} style={{ 
                  background: newPassword === confirmPassword && newPassword.trim() ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#e5e7eb',
                  border: newPassword === confirmPassword && newPassword.trim() ? '2px solid #059669' : 'none',
                  color: newPassword === confirmPassword && newPassword.trim() ? '#fff' : '#9ca3af',
                  fontWeight: '700',
                  boxShadow: !forgotLoading && newPassword === confirmPassword && newPassword.trim() ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  if (!forgotLoading && newPassword === confirmPassword && newPassword.trim()) {
                    e.target.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.35)';
                    e.target.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!forgotLoading && newPassword === confirmPassword && newPassword.trim()) {
                    e.target.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
                    e.target.style.transform = 'translateY(0)';
                  }
                }}
                >
                  {forgotLoading ? '⏳ Resetting...' : '🔑 Reset Password'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;