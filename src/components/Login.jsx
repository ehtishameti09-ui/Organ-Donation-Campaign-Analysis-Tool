import { useState, useEffect } from 'react';
import { login, getAllUsers, canRecoverDeletedAccount, restoreDeletedAccount, cleanupExpiredDeletedAccounts, BAN_CATEGORIES, requestPasswordReset, validateResetToken, resetPassword, submitAppeal } from '../utils/auth';
import { toast } from '../utils/toast';

const Login = ({ onLoginSuccess, onCreateAccount }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const handleAppealClick = () => {
    if (bannedUserInfo) {
      setAppealExplanation('');
      setShowAppealModal(true);
    }
  };

  const handleSubmitAppeal = () => {
    if (!appealExplanation.trim()) {
      toast('🚨 Please enter your appeal explanation.', 'error');
      return;
    }

    setAppealLoading(true);
    setTimeout(() => {
      try {
        submitAppeal(bannedUserInfo.id, appealExplanation);
        toast('✅ Appeal submitted successfully! An admin will review your appeal within 7 days.', 'success');
        setShowAppealModal(false);
        setAppealExplanation('');
        setShowBannedModal(false);
        setBannedUserInfo(null);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setAppealLoading(false);
      }
    }, 600);
  };

  const handleForgotPassword = () => {
    if (!forgotEmail.trim()) {
      toast('🚨 Please enter your email address.', 'error');
      return;
    }

    setForgotLoading(true);
    setTimeout(() => {
      try {
        const result = requestPasswordReset(forgotEmail);
        setResetToken(result.token);
        setForgotStep('verify');
        toast('📧 Reset code sent! Check the code below and follow the reset instructions.', 'success', 5000);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setForgotLoading(false);
      }
    }, 600);
  };

  const handleVerifyResetToken = () => {
    if (!resetTokenInput.trim()) {
      toast('🚨 Please enter the reset code.', 'error');
      return;
    }

    setForgotLoading(true);
    setTimeout(() => {
      try {
        validateResetToken(forgotEmail, resetTokenInput);
        setResetToken(resetTokenInput);
        setForgotStep('reset');
        toast('✅ Reset code verified! You can now set a new password.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setForgotLoading(false);
      }
    }, 600);
  };

  const handleResetPassword = () => {
    if (!newPassword.trim()) {
      toast('🚨 Please enter a new password.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast('🚨 Passwords do not match.', 'error');
      return;
    }

    if (newPassword.length < 8) {
      toast('🚨 Password must be at least 8 characters long.', 'error');
      return;
    }

    setForgotLoading(true);
    setTimeout(() => {
      try {
        resetPassword(forgotEmail, resetToken, newPassword);
        toast('✅ Password reset successfully! You can now log in with your new password.', 'success');
        // Reset forgot password modal
        setShowForgotPassword(false);
        setForgotEmail('');
        setResetToken(null);
        setNewPassword('');
        setConfirmPassword('');
        setForgotStep('request');
        setResetTokenInput('');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setForgotLoading(false);
      }
    }, 600);
  };

  const handleRecoverAccount = () => {
    try {
      const recovered = restoreDeletedAccount(deletedUserInfo.id);
      if (recovered) {
        toast('✅ Account restored successfully!', 'success');
        setShowDeletedRecoveryModal(false);
        setDeletedUserInfo(null);
        // Retry login
        const user = login(email, password);
        if (user) {
          toast(`Welcome back, ${user.name}!`, 'success');
          setTimeout(() => onLoginSuccess(user), 500);
        }
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      // Check if user exists and their status
      const allUsers = getAllUsers();
      const userRecord = allUsers.find(u => u.email === email);

      // Check for banned users
      if (userRecord && userRecord.banned) {
        setBannedUserInfo(userRecord);
        setShowBannedModal(true);
        setLoading(false);
        return;
      }

      // Check for deleted users - allow recovery within 30 days
      if (userRecord && userRecord.deleted) {
        if (canRecoverDeletedAccount(userRecord.id)) {
          // Show recovery modal
          setDeletedUserInfo(userRecord);
          setShowDeletedRecoveryModal(true);
          setLoading(false);
          return;
        } else {
          // Recovery period expired
          toast('❌ Your account has been permanently deleted. Recovery period has expired.', 'error');
          setLoading(false);
          return;
        }
      }

      const user = login(email, password);
      if (user) {
        toast(`Welcome back, ${user.name}!`, 'success');
        setTimeout(() => onLoginSuccess(user), 500);
      } else {
        toast('Invalid credentials or account pending approval.', 'error');
        setLoading(false);
      }
    }, 600);
  };

  const fillLogin = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    toast('Credentials filled — click Sign In to continue.', 'info', 2500);
  };

  return (
    <div className="auth-wrapper">
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
              <h1>ODCAT</h1>
              <p>Organ Donation Campaign Analysis Tool</p>
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
              <div className="auth-stat-val">1,247</div>
              <div className="auth-stat-lbl">Transplants</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-val">523</div>
              <div className="auth-stat-lbl">Active Donors</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-val">48</div>
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
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text1)' }}>ODCAT</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Organ Donation Campaign Analysis Tool</div>
          </div>

          <div className="auth-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your ODCAT account to continue</p>
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
                  autoComplete="current-password"
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

          <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text2)' }}>
            Don't have an account?{' '}
            <a href="#" className="form-link" onClick={(e) => { e.preventDefault(); onCreateAccount && onCreateAccount(); }}>
              Create account
            </a>
          </p>

          <div className="demo-box">
            <div className="demo-box-title">Demo Credentials — Click any role to test</div>
            <div className="demo-creds">
              <div className="demo-cred"><strong>Super Admin:</strong> admin@odcat.com / Admin@123</div>
              <div className="demo-cred"><strong>Admin:</strong> dr.ali@odcat.com / Admin@123</div>
              <div className="demo-cred"><strong>Hospital:</strong> cmh@odcat.com / Admin@123</div>
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
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => fillLogin('cmh@odcat.com', 'Admin@123')}>
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
            © 2026 ODCAT Healthcare · Saving lives through organ donation
          </p>
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
                <button className="btn btn-primary" onClick={handleAppealClick}>
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
                      {deletedUserInfo.deletionDetails?.detailedReason || 'User requested deletion'}
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
                <div style={{ padding: '12px', background: '#fee2e2', borderRadius: 'var(--radius)', borderLeft: '3px solid #dc2626' }}>
                  <div style={{ fontSize: '11px', color: '#991b1b', fontWeight: '600', marginBottom: '6px' }}>⚠️ Note</div>
                  <div style={{ fontSize: '12px', color: '#991b1b' }}>
                    This is an admin deletion. You cannot recover this account directly. Please contact support if you believe this was a mistake.
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowDeletedRecoveryModal(false); setDeletedUserInfo(null); }}>
                Close
              </button>
              {deletedUserInfo.deletionDetails?.isSelfDelete && (
                <button className="btn btn-primary" onClick={handleRecoverAccount}>
                  ✅ Restore Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Appeal Submission Modal */}
      {showAppealModal && bannedUserInfo && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '550px' }}>
            <div className="modal-header" style={{ background: '#dbeafe' }}>
              <h3>⚖️ Submit Appeal</h3>
              <button className="modal-close" onClick={() => setShowAppealModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '4px' }}>Ban Details</div>
                <div style={{ fontSize: '12px' }}>
                  <strong>Category:</strong> {BAN_CATEGORIES[bannedUserInfo.banDetails?.category]?.label}<br/>
                  <strong>Type:</strong> {bannedUserInfo.banDetails?.banType === 'permanent' ? 'Permanent' : `Temporary (${bannedUserInfo.banDetails?.duration} days)`}
                </div>
              </div>

              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '4px' }}>Reason</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>
                  {bannedUserInfo.banDetails?.detailedReason}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Your Explanation & Defense *</label>
                <textarea
                  className="form-input"
                  value={appealExplanation}
                  onChange={(e) => setAppealExplanation(e.target.value)}
                  placeholder="Explain why you believe this ban should be reversed or reconsidered. Be clear and honest..."
                  style={{ minHeight: '120px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                  An admin will review your appeal within 7 days. Your appeal must be submitted within 30 days of the ban.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAppealModal(false)} disabled={appealLoading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSubmitAppeal} disabled={appealLoading || !appealExplanation.trim()}>
                {appealLoading ? '⏳ Submitting...' : '📝 Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}

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