import { useState, useEffect } from 'react';
import { 
  getAllUsers, 
  saveUsers, 
  userSelfDeleteAccount,
  getNotifications,
  markNotificationRead,
  getUserActionLogs,
  getUserAppeals,
  submitAppeal,
  BAN_CATEGORIES
} from '../utils/auth';
import { toast } from '../utils/toast';

const AccountSettings = ({ user, onUpdate, onLogout }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    ...( user.role === 'donor' ? {
      bloodType: user.bloodType || '',
      age: user.age || '',
      medicalHistory: user.medicalHistory || '',
    } : {}),
    ...( user.role === 'recipient' ? {
      organNeeded: user.organNeeded || '',
      age: user.age || '',
      medicalHistory: user.medicalHistory || '',
      diagnosis: user.diagnosis || '',
    } : {}),
    ...( user.role === 'hospital' ? {
      hospitalName: user.hospitalName || '',
      registrationNumber: user.registrationNumber || '',
      licenseNumber: user.licenseNumber || '',
      hospitalAddress: user.hospitalAddress || '',
    } : {})
  });

  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: user.twoFactorEnabled || false
  });

  const [donationPrefs, setDonationPrefs] = useState({
    donationConsent: user.donationConsent !== false,
    organType: user.preferredOrgans || [],
    willingness: user.donationWillingness || 'open',
    familyNotified: user.familyNotified || false,
  });

  const [notifications, setNotifications] = useState({
    emailNotifications: user.emailNotifications !== false,
    appNotifications: user.appNotifications !== false,
    statusUpdates: user.statusUpdates !== false,
    opportunityAlerts: user.opportunityAlerts !== false,
  });

  const [userNotifications, setUserNotifications] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealData, setAppealData] = useState({ explanation: '', evidence: {} });
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [showTwoFASetup, setShowTwoFASetup] = useState(false);

  useEffect(() => {
    // Load notifications, action logs, and appeals
    const notifs = getNotifications(user.id);
    const logs = getUserActionLogs(user.id);
    const userAppeals = getUserAppeals(user.id);
    
    setUserNotifications(notifs);
    setActionLogs(logs);
    setAppeals(userAppeals);
  }, [user.id]);

  // Keyboard navigation for Delete Account Modal
  useEffect(() => {
    if (!showDeleteModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowDeleteModal(false);
        setDeleteReason('');
        setDeleteConfirmation('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteModal]);

  // Keyboard navigation for Appeal Modal
  useEffect(() => {
    if (!showAppealModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAppealModal(false);
        setAppealData({ explanation: '', evidence: {} });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showAppealModal]);

  const handleProfileChange = (field, value) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
  };

  const saveProfile = () => {
    if (!profileData.name || !profileData.email) {
      toast('Name and email are required.', 'error');
      return;
    }

    setSaving(true);
    setTimeout(() => {
      try {
        const users = getAllUsers();
        const userIndex = users.findIndex(u => u.id === user.id);
        
        if (userIndex !== -1) {
          users[userIndex] = { ...users[userIndex], ...profileData };
          saveUsers(users);
          toast('✅ Profile updated successfully!', 'success');
          
          if (onUpdate) {
            onUpdate({ ...user, ...profileData });
          }
        }
      } catch (error) {
        toast('Error updating profile.', 'error');
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const saveNotificationPrefs = () => {
    setSaving(true);
    setTimeout(() => {
      try {
        const users = getAllUsers();
        const userIndex = users.findIndex(u => u.id === user.id);
        
        if (userIndex !== -1) {
          users[userIndex] = { 
            ...users[userIndex], 
            ...notifications
          };
          saveUsers(users);
          toast('✅ Notification preferences updated!', 'success');
          
          if (onUpdate) {
            onUpdate({ ...user, ...notifications });
          }
        }
      } catch (error) {
        toast('Error updating preferences.', 'error');
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const saveDonationPrefs = () => {
    setSaving(true);
    setTimeout(() => {
      try {
        const users = getAllUsers();
        const userIndex = users.findIndex(u => u.id === user.id);
        
        if (userIndex !== -1) {
          users[userIndex] = { 
            ...users[userIndex], 
            donationConsent: donationPrefs.donationConsent,
            preferredOrgans: donationPrefs.organType,
            donationWillingness: donationPrefs.willingness,
            familyNotified: donationPrefs.familyNotified
          };
          saveUsers(users);
          toast('✅ Donation preferences updated!', 'success');
          
          if (onUpdate) {
            onUpdate({ ...user, ...donationPrefs });
          }
        }
      } catch (error) {
        toast('Error updating donation preferences.', 'error');
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const markNotificationsRead = () => {
    userNotifications.forEach(notif => {
      if (!notif.read) {
        markNotificationRead(notif.id);
      }
    });
    setUserNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast('Notifications marked as read.', 'info', 2000);
  };

  const handleDeleteAccount = () => {
    if (!deleteReason.trim()) {
      toast('Please provide a reason for account deletion.', 'error');
      return;
    }

    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      toast('Please type "DELETE MY ACCOUNT" to confirm.', 'error');
      return;
    }

    setDeletingAccount(true);
    setTimeout(() => {
      try {
        userSelfDeleteAccount(user.id, deleteReason);
        toast('✅ Your account has been marked for deletion.', 'success');
        setTimeout(() => {
          setShowDeleteModal(false);
          onLogout();
        }, 1000);
      } catch (error) {
        toast(error.message || 'Error deleting account.', 'error');
      } finally {
        setDeletingAccount(false);
      }
    }, 500);
  };

  const handleSubmitAppeal = () => {
    if (!appealData.explanation.trim()) {
      toast('Please provide an explanation for your appeal.', 'error');
      return;
    }

    setSubmittingAppeal(true);
    setTimeout(() => {
      try {
        const appeal = submitAppeal(user.id, appealData.explanation, appealData.evidence);
        setAppeals(prev => [...prev, appeal]);
        toast('✅ Appeal submitted successfully!', 'success');
        setShowAppealModal(false);
        setAppealData({ explanation: '', evidence: {} });
      } catch (error) {
        toast(error.message || 'Error submitting appeal.', 'error');
      } finally {
        setSubmittingAppeal(false);
      }
    }, 500);
  };

  const enableTwoFA = () => {
    setSaving(true);
    setTimeout(() => {
      try {
        const users = getAllUsers();
        const userIndex = users.findIndex(u => u.id === user.id);
        
        if (userIndex !== -1) {
          users[userIndex].twoFactorEnabled = true;
          users[userIndex].twoFactorSetup = {
            enabled: true,
            setupDate: new Date().toISOString(),
            backupCodes: Array(10).fill(0).map(() => Math.random().toString(36).substring(2, 10).toUpperCase())
          };
          saveUsers(users);
          toast('✅ Two-Factor Authentication enabled!', 'success');
          setSecurityData(prev => ({ ...prev, twoFactorEnabled: true }));
          setShowTwoFASetup(false);
          
          if (onUpdate) {
            onUpdate(users[userIndex]);
          }
        }
      } catch (error) {
        toast('Error enabling 2FA.', 'error');
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const disableTwoFA = () => {
    const confirmed = window.confirm('Are you sure you want to disable Two-Factor Authentication? Your account will be less secure.');
    if (!confirmed) return;

    setSaving(true);
    setTimeout(() => {
      try {
        const users = getAllUsers();
        const userIndex = users.findIndex(u => u.id === user.id);
        
        if (userIndex !== -1) {
          users[userIndex].twoFactorEnabled = false;
          users[userIndex].twoFactorSetup = null;
          saveUsers(users);
          toast('✅ Two-Factor Authentication disabled.', 'info');
          setSecurityData(prev => ({ ...prev, twoFactorEnabled: false }));
          
          if (onUpdate) {
            onUpdate(users[userIndex]);
          }
        }
      } catch (error) {
        toast('Error disabling 2FA.', 'error');
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const tabItems = ['profile', 'security', 'donation', 'notifications', 'status'];
  const tabLabels = {
    profile: '👤 Profile',
    security: '🔒 Security',
    donation: '❤️ Donation Preferences',
    notifications: '🔔 Notifications',
    status: '📊 Account Status'
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '10px',
        marginBottom: '28px',
        padding: '12px',
        background: 'linear-gradient(135deg, var(--surface2) 0%, var(--surface1) 100%)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        border: '1px solid var(--border)'
      }}>
        {tabItems.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '14px 16px',
              borderRadius: 'calc(var(--radius) - 2px)',
              border: activeTab === tab ? 'none' : '1px solid transparent',
              background: activeTab === tab ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary) 100%)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--text2)',
              fontWeight: activeTab === tab ? '700' : '600',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: activeTab === tab ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
              transform: activeTab === tab ? 'scale(1.02)' : 'scale(1)',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab) {
                e.target.style.background = 'rgba(59, 130, 246, 0.1)';
                e.target.style.color = 'var(--primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab) {
                e.target.style.background = 'transparent';
                e.target.style.color = 'var(--text2)';
              }
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">👤 Personal Information</div>
            <div className="card-sub">Update your profile details and personal information</div>
          </div>
          <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                value={profileData.name}
                onChange={(e) => handleProfileChange('name', e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                className="form-input"
                type="email"
                value={profileData.email}
                onChange={(e) => handleProfileChange('email', e.target.value)}
                placeholder="your@email.com"
                disabled
              />
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Email address cannot be changed</div>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                className="form-input"
                type="tel"
                value={profileData.phone}
                onChange={(e) => handleProfileChange('phone', e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>

            {user.role === 'donor' && (
              <>
                <div className="form-group">
                  <label className="form-label">Blood Type</label>
                  <select
                    className="form-input"
                    value={profileData.bloodType}
                    onChange={(e) => handleProfileChange('bloodType', e.target.value)}
                  >
                    <option value="">— Select Blood Type —</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input
                    className="form-input"
                    type="number"
                    value={profileData.age}
                    onChange={(e) => handleProfileChange('age', e.target.value)}
                    placeholder="Your age"
                    min="0"
                    max="120"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Medical History</label>
                  <textarea
                    className="form-input"
                    value={profileData.medicalHistory}
                    onChange={(e) => handleProfileChange('medicalHistory', e.target.value)}
                    placeholder="Any medical conditions or medications..."
                    style={{ minHeight: '100px' }}
                  />
                </div>
              </>
            )}

            {user.role === 'recipient' && (
              <>
                <div className="form-group">
                  <label className="form-label">Required Organ</label>
                  <input
                    className="form-input"
                    value={profileData.organNeeded}
                    onChange={(e) => handleProfileChange('organNeeded', e.target.value)}
                    placeholder="e.g., kidney, heart, liver"
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input
                    className="form-input"
                    type="number"
                    value={profileData.age}
                    onChange={(e) => handleProfileChange('age', e.target.value)}
                    placeholder="Your age"
                    min="0"
                    max="120"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Diagnosis</label>
                  <input
                    className="form-input"
                    value={profileData.diagnosis}
                    onChange={(e) => handleProfileChange('diagnosis', e.target.value)}
                    placeholder="Your medical diagnosis"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Medical History</label>
                  <textarea
                    className="form-input"
                    value={profileData.medicalHistory}
                    onChange={(e) => handleProfileChange('medicalHistory', e.target.value)}
                    placeholder="Relevant medical conditions..."
                    style={{ minHeight: '100px' }}
                  />
                </div>
              </>
            )}

            {user.role === 'hospital' && (
              <>
                <div className="form-group">
                  <label className="form-label">Hospital Name</label>
                  <input
                    className="form-input"
                    value={profileData.hospitalName}
                    onChange={(e) => handleProfileChange('hospitalName', e.target.value)}
                    placeholder="Hospital name"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Registration Number</label>
                  <input
                    className="form-input"
                    value={profileData.registrationNumber}
                    onChange={(e) => handleProfileChange('registrationNumber', e.target.value)}
                    placeholder="Government registration"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">License Number</label>
                  <input
                    className="form-input"
                    value={profileData.licenseNumber}
                    onChange={(e) => handleProfileChange('licenseNumber', e.target.value)}
                    placeholder="Medical license number"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Hospital Address</label>
                  <textarea
                    className="form-input"
                    value={profileData.hospitalAddress}
                    onChange={(e) => handleProfileChange('hospitalAddress', e.target.value)}
                    placeholder="Complete address"
                    style={{ minHeight: '80px' }}
                  />
                </div>
              </>
            )}
          </div>
          <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
            <button className="btn btn-ghost" onClick={() => setActiveTab('profile')}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? '⏳ Saving...' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">🔒 Security & Privacy</div>
            <div className="card-sub">Manage your account security and privacy settings</div>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>🔐 Two-Factor Authentication</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                    Add an extra layer of security to your account
                  </div>
                </div>
                <div style={{
                  width: '50px',
                  height: '26px',
                  background: securityData.twoFactorEnabled ? '#10b981' : '#e5e7eb',
                  borderRadius: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: securityData.twoFactorEnabled ? '26px' : '2px',
                  transition: 'all 0.3s',
                  justifyContent: securityData.twoFactorEnabled ? 'flex-end' : 'flex-start'
                }} onClick={() => {
                  if (securityData.twoFactorEnabled) {
                    disableTwoFA();
                  } else {
                    setShowTwoFASetup(true);
                  }
                }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    background: '#fff',
                    borderRadius: '50%'
                  }} />
                </div>
              </div>
              {securityData.twoFactorEnabled && (
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  ✅ Two-Factor Authentication is active
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontWeight: '600', marginBottom: '12px' }}>📍 Active Sessions</h3>
              <div style={{ padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '500' }}>🖥️ This Device</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Last active now</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>CURRENT</div>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontWeight: '600', marginBottom: '12px' }}>🛡️ Privacy Settings</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px' }}>Public Profile</div>
                  <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                </div>
                <div style={{ padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px' }}>Allow contact from admins</div>
                  <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Donation Preferences Tab */}
      {(user.role === 'donor' || user.role === 'recipient') && activeTab === 'donation' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">❤️ Donation Preferences</div>
            <div className="card-sub">Manage your organ donation settings</div>
          </div>
          <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            {user.role === 'donor' && (
              <>
                <div style={{ marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: 'var(--radius)', borderLeft: '3px solid #10b981' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={donationPrefs.donationConsent}
                      onChange={(e) => setDonationPrefs(prev => ({ ...prev, donationConsent: e.target.checked }))}
                      style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label style={{ cursor: 'pointer', fontWeight: '600' }}>I consent to organ donation</label>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                    By checking this, you give consent to donate your organs after death
                  </div>
                </div>

                {donationPrefs.donationConsent && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Desired Organs to Donate</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                        {['Heart', 'Lungs', 'Liver', 'Kidneys', 'Pancreas', 'Corneas'].map(organ => (
                          <div key={organ} style={{ display: 'flex', alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={donationPrefs.organType.includes(organ)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setDonationPrefs(prev => ({ ...prev, organType: [...prev.organType, organ] }));
                                } else {
                                  setDonationPrefs(prev => ({ ...prev, organType: prev.organType.filter(o => o !== organ) }));
                                }
                              }}
                              style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label style={{ cursor: 'pointer', fontSize: '12px' }}>{organ}</label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Donation Willingness</label>
                      <select
                        className="form-input"
                        value={donationPrefs.willingness}
                        onChange={(e) => setDonationPrefs(prev => ({ ...prev, willingness: e.target.value }))}
                      >
                        <option value="open">Open - Any patient in need</option>
                        <option value="family">Family First - Relatives if available</option>
                        <option value="specific">Specific Recipient - Only designated person</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: '20px', padding: '12px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <input
                          type="checkbox"
                          checked={donationPrefs.familyNotified}
                          onChange={(e) => setDonationPrefs(prev => ({ ...prev, familyNotified: e.target.checked }))}
                          style={{ marginRight: '10px', width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label style={{ cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Family has been notified</label>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {user.role === 'recipient' && (
              <div style={{ padding: '16px', background: '#dbeafe', borderRadius: 'var(--radius)', borderLeft: '3px solid #0ea5e9' }}>
                <div style={{ fontSize: '12px', color: '#0c4a6e' }}>
                  <strong>Your Status:</strong> Waiting for {user.organNeeded || 'organ'} transplant
                </div>
                <div style={{ fontSize: '11px', color: '#0c4a6e', marginTop: '8px' }}>
                  Days on waitlist: <strong>{user.daysOnWaitlist || '—'}</strong> · 
                  Urgency: <strong>{user.urgencyScore || '—'}</strong> · 
                  Survival estimate: <strong>{user.survivalEstimate || '—'}</strong>
                </div>
              </div>
            )}
          </div>
          {user.role === 'donor' && (
            <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
              <button className="btn btn-ghost">Cancel</button>
              <button className="btn btn-primary" onClick={saveDonationPrefs} disabled={saving}>
                {saving ? '⏳ Saving...' : '💾 Save Preferences'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">🔔 Notifications & Communication</div>
            <div className="card-sub">Control how you receive updates and alerts</div>
          </div>
          <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontWeight: '600', marginBottom: '12px' }}>Notification Channels</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '12px' }}>📧 Email Notifications</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Receive updates via email</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.emailNotifications}
                    onChange={(e) => setNotifications(prev => ({ ...prev, emailNotifications: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '12px' }}>🔔 In-App Notifications</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Receive alerts in the application</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.appNotifications}
                    onChange={(e) => setNotifications(prev => ({ ...prev, appNotifications: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontWeight: '600', marginBottom: '12px' }}>Alert Types</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '12px' }}>📊 Status Updates</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Account and case status changes</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.statusUpdates}
                    onChange={(e) => setNotifications(prev => ({ ...prev, statusUpdates: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ padding: '12px', background: 'var(--surface1)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '12px' }}>⚡ Opportunity Alerts</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Matching opportunities and matches</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.opportunityAlerts}
                    onChange={(e) => setNotifications(prev => ({ ...prev, opportunityAlerts: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontWeight: '600' }}>Recent Notifications</h3>
                {userNotifications.some(n => !n.read) && (
                  <button className="btn btn-xs btn-ghost" onClick={markNotificationsRead}>
                    Mark all as read
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {userNotifications.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                    No notifications yet
                  </div>
                ) : (
                  userNotifications.slice().reverse().map(notif => (
                    <div key={notif.id} style={{
                      padding: '12px',
                      background: notif.read ? 'var(--surface1)' : 'var(--surface2)',
                      borderRadius: 'var(--radius)',
                      borderLeft: `3px solid ${notif.type === 'ban' ? '#dc2626' : notif.type === 'appeal_status' ? '#10b981' : '#0ea5e9'}`
                    }}>
                      <div style={{ fontWeight: '500', fontSize: '12px' }}>{notif.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                        {notif.message.substring(0, 100)}...
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>
                        {new Date(notif.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div style={{ padding: '20px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={saveNotificationPrefs} disabled={saving}>
              {saving ? '⏳ Saving...' : '💾 Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* Account Status Tab */}
      {activeTab === 'status' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">📊 Account Status</div>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '8px' }}>Status</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: user.status === 'approved' ? '#10b981' : 'var(--text1)' }}>
                    {user.status === 'approved' ? '✅ Active' : user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '8px' }}>Role</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.role === 'super_admin' ? 'Super Admin' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}</div>
                </div>
                <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', marginBottom: '8px' }}>Member Since</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{new Date(user.registrationDate).toLocaleDateString()}</div>
                </div>
              </div>

              {(user.banned || user.deleted) && (
                <div style={{ padding: '16px', background: user.banned ? '#fee2e2' : '#fef3c7', borderRadius: 'var(--radius)', borderLeft: `3px solid ${user.banned ? '#dc2626' : '#f59e0b'}`, marginBottom: '20px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '8px', color: user.banned ? '#991b1b' : '#92400e' }}>
                    {user.banned ? '🚫 Account Banned' : '⏰ Account Deleted'}
                  </div>
                  <div style={{ fontSize: '12px', color: user.banned ? '#991b1b' : '#92400e', marginBottom: '12px' }}>
                    {user.banned ? (
                      <>
                        <div>Category: {BAN_CATEGORIES[user.banDetails?.category]?.label}</div>
                        <div>Type: {user.banDetails?.banType === 'permanent' ? 'Permanent' : `Temporary (${user.banDetails?.duration} days)`}</div>
                      </>
                    ) : (
                      <>
                        <div>Deleted: {new Date(user.deletionDetails?.deletionDate).toLocaleDateString()}</div>
                        <div>Recovery deadline: {user.deletionDetails?.recoveryDeadline ? new Date(user.deletionDetails.recoveryDeadline).toLocaleDateString() : 'N/A'}</div>
                      </>
                    )}
                  </div>
                  {(user.banned || (user.deleted && !user.deletionDetails?.isSelfDelete)) && appeals.length === 0 && (
                    <button className="btn btn-sm" onClick={() => setShowAppealModal(true)} style={{ background: '#dc2626', color: '#fff' }}>
                      📝 Submit Appeal
                    </button>
                  )}
                </div>
              )}

              <div>
                <h3 style={{ fontWeight: '600', marginBottom: '12px' }}>📝 Activity Log</h3>
                <div style={{ display: 'grid', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {actionLogs.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                      No activity logged
                    </div>
                  ) : (
                    actionLogs.slice().reverse().map(log => (
                      <div key={log.id} style={{
                        padding: '12px',
                        background: 'var(--surface1)',
                        borderRadius: 'var(--radius)',
                        borderLeft: '3px solid var(--primary)'
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: '500' }}>
                          {log.actionType === 'user_banned' ? '🚫' : log.actionType === 'user_deleted' ? '🗑️' : log.actionType === 'appeal_submitted' ? '📝' : '📋'} {log.actionType.toUpperCase().replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                          {new Date(log.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {appeals.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">⚖️ Your Appeals</div>
              </div>
              <div style={{ padding: '20px' }}>
                {appeals.map(appeal => (
                  <div key={appeal.id} style={{
                    padding: '16px',
                    background: appeal.status === 'pending' ? '#dbeafe' : appeal.status === 'approved' ? '#f0fdf4' : '#fee2e2',
                    borderRadius: 'var(--radius)',
                    borderLeft: `3px solid ${appeal.status === 'pending' ? '#0ea5e9' : appeal.status === 'approved' ? '#10b981' : '#dc2626'}`,
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '600' }}>Appeal #{appeal.id.substring(7, 15)}</div>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: appeal.status === 'pending' ? '#bfdbfe' : appeal.status === 'approved' ? '#bbf7d0' : '#fecaca',
                        color: appeal.status === 'pending' ? '#0c4a6e' : appeal.status === 'approved' ? '#166534' : '#991b1b'
                      }}>
                        {appeal.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
                      Submitted: {new Date(appeal.submittedDate).toLocaleDateString()}
                    </div>
                    {appeal.reviewNotes && (
                      <div style={{ fontSize: '12px', marginTop: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '4px' }}>
                        <strong>Admin Decision:</strong> {appeal.reviewNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ borderColor: '#dc2626', borderWidth: '2px', background: '#fef2f2' }}>
            <div className="card-header" style={{ borderBottom: '2px solid #dc2626', background: 'linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                  <div className="card-title" style={{ color: '#dc2626', margin: 0 }}>Danger Zone</div>
                  <div className="card-sub" style={{ color: '#b91c1c' }}>Irreversible account actions</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ padding: '16px', background: '#fff', borderRadius: 'var(--radius)', border: '1px solid #fca5a5', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '28px', flexShrink: 0 }}>🗑️</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: '#991b1b' }}>Delete My Account</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px', lineHeight: '1.6' }}>
                      Permanently delete your account and all associated data. This action cannot be undone after the 30-day recovery period expires.
                    </p>
                    <button className="btn" onClick={() => setShowDeleteModal(true)} style={{ 
                      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                      color: '#fff',
                      border: '2px solid #991b1b',
                      fontWeight: '600',
                      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.35)';
                      e.target.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.25)';
                      e.target.style.transform = 'translateY(0)';
                    }}
                    >
                      🗑️ Delete My Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two-Factor Setup Modal */}
      {showTwoFASetup && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '550px' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #f0f9ff 100%)', borderBottom: '2px solid #0891b2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>🔐</span>
                <div>
                  <h3 style={{ color: '#0c4a6e', margin: 0 }}>Two-Factor Authentication</h3>
                  <div style={{ fontSize: '11px', color: '#0369a1' }}>Extra layer of security</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowTwoFASetup(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: 'var(--radius)', marginBottom: '16px', borderLeft: '4px solid #10b981' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#166534', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✅</span> How It Works
                </div>
                <ul style={{ fontSize: '12px', color: '#166534', margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                  <li>Install an authenticator app (Google, Microsoft, or Authy)</li>
                  <li>You'll receive a code when logging in</li>
                  <li>Enter the code along with your password</li>
                  <li>Your account is protected by two-factor verification</li>
                </ul>
              </div>
              <div style={{ padding: '16px', background: '#f5f3ff', borderRadius: 'var(--radius)', marginBottom: '16px', borderLeft: '4px solid #7c3aed' }}>
                <div style={{ fontSize: '12px', color: '#5b21b6', lineHeight: '1.6' }}>
                  <strong>💡 Tip:</strong> Save your backup codes in a secure location. You can use these codes if you lose access to your authenticator app.
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '2px solid #dbeafe' }}>
              <button className="btn btn-ghost" onClick={() => setShowTwoFASetup(false)} disabled={saving} style={{ fontWeight: '600' }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={enableTwoFA} disabled={saving} style={{ 
                background: 'linear-gradient(135deg, #0891b2 0%, #0369a1 100%)',
                border: '2px solid #06b6d4',
                fontWeight: '700',
                boxShadow: '0 4px 12px rgba(8, 145, 178, 0.25)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.target.style.boxShadow = '0 6px 16px rgba(8, 145, 178, 0.35)';
                  e.target.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.target.style.boxShadow = '0 4px 12px rgba(8, 145, 178, 0.25)';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
              >
                {saving ? '⏳ Enabling...' : '🔒 Enable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Modal */}
      {showAppealModal && (user.banned || user.deleted) && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #f0f9ff 100%)', borderBottom: '2px solid #0891b2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>⚖️</span>
                <div>
                  <h3 style={{ color: '#0c4a6e', margin: 0 }}>Submit Appeal</h3>
                  <div style={{ fontSize: '11px', color: '#0369a1' }}>Request review of account restriction</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowAppealModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ 
                background: '#f0f9ff',
                padding: '16px',
                borderRadius: 'var(--radius)',
                marginBottom: '20px',
                borderLeft: '4px solid #0891b2'
              }}>
                <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>ℹ️</span> Original Action Details
                </div>
                <div style={{ fontSize: '12px', color: '#0c4a6e', display: 'grid', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '600' }}>Category:</span>
                    <span>{BAN_CATEGORIES[user.banned ? user.banDetails?.category : user.deletionDetails?.category]?.label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '600' }}>Type:</span>
                    <span>{user.banned ? (user.banDetails?.banType === 'permanent' ? 'Permanent Ban' : `${user.banDetails?.duration}-day Temporary Ban`) : 'Account Deletion'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '600' }}>Reason:</span>
                    <span style={{ textAlign: 'right', maxWidth: '50%' }}>{user.banned ? user.banDetails?.detailedReason : user.deletionDetails?.detailedReason}</span>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <span>📝</span> Your Explanation & Defense *
                </label>
                <textarea
                  className="form-input"
                  value={appealData.explanation}
                  onChange={(e) => setAppealData(prev => ({ ...prev, explanation: e.target.value }))}
                  placeholder="Explain why you believe this action should be reconsidered. Be specific, honest, and professional..."
                  style={{ minHeight: '140px', fontSize: '12px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⏰</span> An admin will review your appeal within 7 days. Appeals must be submitted within 30 days of the action.
                </div>
              </div>

              <div style={{ 
                background: '#f0fdf4',
                padding: '16px',
                borderRadius: 'var(--radius)',
                marginBottom: '16px',
                borderLeft: '4px solid #10b981',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '700', color: '#166534', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💡</span> Tips for Better Appeal
                </div>
                <ul style={{ color: '#166534', margin: '0', paddingLeft: '20px', lineHeight: '1.6' }}>
                  <li>Be respectful and professional in your tone</li>
                  <li>Acknowledge the issue if applicable</li>
                  <li>Provide specific examples or evidence</li>
                  <li>Explain what you'll do differently</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '2px solid #dbeafe' }}>
              <button className="btn btn-ghost" onClick={() => setShowAppealModal(false)} disabled={submittingAppeal} style={{ fontWeight: '600' }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSubmitAppeal} disabled={submittingAppeal || !appealData.explanation.trim()} style={{ 
                background: 'linear-gradient(135deg, #0891b2 0%, #0369a1 100%)',
                border: '2px solid #06b6d4',
                fontWeight: '700',
                boxShadow: !submittingAppeal && appealData.explanation.trim() ? '0 4px 12px rgba(8, 145, 178, 0.25)' : 'none',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!submittingAppeal && appealData.explanation.trim()) {
                  e.target.style.boxShadow = '0 6px 16px rgba(8, 145, 178, 0.35)';
                  e.target.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!submittingAppeal && appealData.explanation.trim()) {
                  e.target.style.boxShadow = '0 4px 12px rgba(8, 145, 178, 0.25)';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
              >
                {submittingAppeal ? '⏳ Submitting...' : '📤 Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%)', borderBottom: '2px solid #dc2626' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>🗑️</span>
                <div>
                  <h3 style={{ color: '#991b1b', margin: 0 }}>Delete Account</h3>
                  <div style={{ fontSize: '11px', color: '#b91c1c' }}>Permanent account deletion</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ 
                background: '#fef3c7',
                padding: '16px',
                borderRadius: 'var(--radius)',
                marginBottom: '20px',
                borderLeft: '4px solid #f59e0b',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '700', color: '#92400e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>⏰</span>
                  Recovery Timeline
                </div>
                <div style={{ display: 'grid', gap: '8px', color: '#92400e' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px' }}>1️⃣</span>
                    <span><strong>Today:</strong> Account marked for deletion</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px' }}>2️⃣</span>
                    <span><strong>Days 1-30:</strong> Recovery period (login to restore)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px' }}>3️⃣</span>
                    <span><strong>After Day 30:</strong> Permanent deletion (irreversible)</span>
                  </div>
                </div>
              </div>

              <div style={{ 
                background: '#f0fdf4',
                padding: '16px',
                borderRadius: 'var(--radius)',
                marginBottom: '20px',
                borderLeft: '4px solid #10b981',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '700', color: '#166534', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>💾</span>
                  What Happens to Your Data
                </div>
                <ul style={{ color: '#166534', margin: '0', paddingLeft: '20px', lineHeight: '1.6' }}>
                  <li>Profile information will be hidden from other users</li>
                  <li>Your account status will show as "Deleted"</li>
                  <li>Associated records retained for 30 days</li>
                  <li>After 30 days: All data permanently erased</li>
                </ul>
              </div>

              <div style={{ 
                background: '#fee2e2',
                padding: '16px',
                borderRadius: 'var(--radius)',
                marginBottom: '20px',
                borderLeft: '4px solid #dc2626',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '700', color: '#991b1b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  Important Notes
                </div>
                <ul style={{ color: '#991b1b', margin: '0', paddingLeft: '20px', lineHeight: '1.6' }}>
                  <li>You will not be able to use this email for new registrations for 30 days</li>
                  <li>Active transactions or cases may be affected</li>
                  <li>Other users cannot contact you during recovery period</li>
                </ul>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📝</span> Reason for Deletion (Optional)
                </label>
                <textarea
                  className="form-input"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Help us improve - share your feedback (privacy respected)..."
                  style={{ minHeight: '80px', fontSize: '12px' }}
                />
              </div>

              <div style={{ 
                background: '#fef2f2',
                padding: '16px',
                borderRadius: 'var(--radius)',
                borderLeft: '4px solid #dc2626',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#991b1b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>🔐</span>
                  Confirm Deletion
                </div>
                <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '12px', lineHeight: '1.5' }}>
                  To confirm account deletion, type the exact phrase below:
                </div>
                <div style={{ 
                  background: '#fee2e2',
                  padding: '10px',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  fontWeight: '700',
                  fontSize: '12px',
                  color: '#991b1b',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  border: '2px dashed #dc2626'
                }}>
                  DELETE MY ACCOUNT
                </div>
                <input
                  className="form-input"
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder='Type "DELETE MY ACCOUNT" above'
                  style={{
                    borderColor: deleteConfirmation === 'DELETE MY ACCOUNT' ? '#10b981' : '#fca5a5',
                    borderWidth: '2px',
                    background: deleteConfirmation === 'DELETE MY ACCOUNT' ? '#f0fdf4' : '#fff5f5',
                    fontWeight: '500',
                    fontSize: '12px'
                  }}
                />
                {deleteConfirmation === 'DELETE MY ACCOUNT' && (
                  <div style={{ fontSize: '11px', color: '#10b981', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>✅</span> Confirmation code verified
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '2px solid #fca5a5' }}>
              <button className="btn btn-ghost" onClick={() => { setShowDeleteModal(false); setDeleteReason(''); setDeleteConfirmation(''); }} disabled={deletingAccount}
              style={{ fontWeight: '600' }}>
                Cancel
              </button>
              <button className="btn" onClick={handleDeleteAccount} disabled={deletingAccount || deleteConfirmation !== 'DELETE MY ACCOUNT'} style={{
                background: deleteConfirmation === 'DELETE MY ACCOUNT' ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : '#e5e7eb',
                color: deleteConfirmation === 'DELETE MY ACCOUNT' ? '#fff' : '#9ca3af',
                border: deleteConfirmation === 'DELETE MY ACCOUNT' ? '2px solid #7f1d1d' : 'none',
                fontWeight: '700',
                boxShadow: deleteConfirmation === 'DELETE MY ACCOUNT' ? '0 4px 12px rgba(220, 38, 38, 0.25)' : 'none',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (deleteConfirmation === 'DELETE MY ACCOUNT' && !deletingAccount) {
                  e.target.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.35)';
                  e.target.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (deleteConfirmation === 'DELETE MY ACCOUNT' && !deletingAccount) {
                  e.target.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.25)';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
              >
                {deletingAccount ? '⏳ Deleting...' : '🗑️ Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSettings;
