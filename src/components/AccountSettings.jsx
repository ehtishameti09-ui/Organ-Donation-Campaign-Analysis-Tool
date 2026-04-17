import { useState, useEffect } from 'react';
import {
  getAllUsers, saveUsers, userSelfDeleteAccount, getCreds, saveCreds,
  getNotifications, markNotificationRead, getUserActionLogs, getUserAppeals,
  submitAppeal, uploadAdditionalHospitalDocuments, addActivity
} from '../utils/auth';
import { toast } from '../utils/toast';

const formatPKPhone = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('92')) {
    const rest = digits.slice(2, 12);
    if (rest.length <= 3) return `+92 ${rest}`;
    return `+92 ${rest.slice(0, 3)} ${rest.slice(3)}`;
  }
  const local = digits.slice(0, 11);
  if (local.length <= 4) return local;
  return `${local.slice(0, 4)}-${local.slice(4)}`;
};

const DOCUMENT_CONFIG = {
  registrationCertificate: { label: 'Hospital Registration Certificate', required: true, maxSizeMB: 10, sample: '📋 Official registration from Health Ministry' },
  healthcareLicense: { label: 'Healthcare Institution License', required: true, maxSizeMB: 10, sample: '📜 Valid operating license from PMDC/PHSA' },
  taxCertificate: { label: 'Tax Registration Certificate (NTN)', required: false, maxSizeMB: 5, sample: '💼 FBR NTN certificate' },
  ethicalPolicy: { label: 'Ethical Policy Document', required: false, maxSizeMB: 10, sample: '📄 Ethics committee approval document' },
  transplantLicense: { label: 'Transplant Authorization License', required: false, maxSizeMB: 10, sample: '🏅 HOTA authorization for transplant surgeries' },
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ORGANS_LIST = ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Cornea', 'Bone Marrow'];

const AccountSettings = ({ user, onUpdate }) => {
  // Determine tabs based on role
  const getTabs = () => {
    const base = [
      { id: 'profile', label: 'Profile', icon: '👤' },
      { id: 'security', label: 'Security', icon: '🔒' },
      { id: 'notifications', label: 'Notifications', icon: '🔔' },
      { id: 'activity', label: 'Activity', icon: '📋' },
    ];
    if (user.role === 'donor' || user.role === 'recipient') {
      base.splice(2, 0, { id: 'preferences', label: 'Preferences', icon: '⚙️' });
    }
    if (user.role === 'hospital') {
      base.splice(2, 0, { id: 'documents', label: 'Documents', icon: '📂' });
    }
    if (user.role === 'super_admin') {
      base.push({ id: 'administration', label: 'Administration', icon: '🛡️' });
    }
    return base;
  };

  const tabs = getTabs();
  const defaultTab = user.role === 'hospital' && user.status === 'info_requested' ? 'documents' : 'profile';
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [profileData, setProfileData] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    bloodType: user.bloodType || '',
    age: user.age || '',
    medicalHistory: user.medicalHistory || '',
    organNeeded: user.organNeeded || '',
    diagnosis: user.diagnosis || '',
    hospitalName: user.hospitalName || '',
    registrationNumber: user.registrationNumber || '',
    licenseNumber: user.licenseNumber || '',
    hospitalAddress: user.hospitalAddress || '',
  });

  const [pwdData, setPwdData] = useState({ current: '', newPwd: '', confirmPwd: '' });
  const [notifPrefs, setNotifPrefs] = useState({
    emailNotifications: user.emailNotifications !== false,
    appNotifications: user.appNotifications !== false,
    statusUpdates: user.statusUpdates !== false,
    opportunityAlerts: user.opportunityAlerts !== false,
  });
  // Donor-specific preferences
  const [donorPrefs, setDonorPrefs] = useState({
    donationConsent: user.donationConsent !== false,
    willingness: user.donationWillingness || 'open',
    familyNotified: user.familyNotified || false,
    pledgedOrgans: user.pledgedOrgans || [],
    donationType: user.donationType || 'deceased',
    nextOfKin: user.nextOfKin || '',
    contactPreference: user.contactPreference || 'phone',
    availableForUrgent: user.availableForUrgent !== false,
  });

  // Recipient-specific preferences
  const [recipientPrefs, setRecipientPrefs] = useState({
    organNeeded: user.organNeeded || '',
    bloodCompatibility: user.bloodCompatibility || 'compatible',
    urgencySelf: user.urgencySelf || 'moderate',
    waitingListVisibility: user.waitingListVisibility !== false,
    travelReady: user.travelReady || false,
    contactPreference: user.contactPreference || 'phone',
    notifyOnMatch: user.notifyOnMatch !== false,
    preferredHospitalNotes: user.preferredHospitalNotes || '',
  });

  const [userNotifs, setUserNotifs] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // Document re-upload state
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [reuploadSubmitting, setReuploadSubmitting] = useState(false);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Appeal
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  useEffect(() => {
    setUserNotifs(getNotifications(user.id));
    setActionLogs(getUserActionLogs(user.id));
    setAppeals(getUserAppeals(user.id));
  }, [user.id]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setShowDeleteModal(false); setShowAppealModal(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const saveProfile = () => {
    if (!profileData.name || !profileData.email) {
      toast('Name and email are required.', 'error'); return;
    }
    setSaving(true);
    setTimeout(() => {
      const users = getAllUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...profileData };
        saveUsers(users);
        onUpdate && onUpdate({ ...user, ...profileData });
        toast('Profile updated!', 'success');
      }
      setSaving(false);
    }, 500);
  };

  const savePassword = () => {
    if (!pwdData.current || !pwdData.newPwd || !pwdData.confirmPwd) {
      toast('All password fields are required.', 'error'); return;
    }
    const creds = getCreds();
    if (creds[user.email] !== pwdData.current) {
      toast('Current password is incorrect.', 'error'); return;
    }
    if (pwdData.newPwd !== pwdData.confirmPwd) {
      toast('New passwords do not match.', 'error'); return;
    }
    if (pwdData.newPwd.length < 8) {
      toast('Password must be at least 8 characters.', 'error'); return;
    }
    if (!/(?=.*[A-Z])(?=.*[0-9])/.test(pwdData.newPwd)) {
      toast('Password must contain uppercase letter and number.', 'error'); return;
    }
    creds[user.email] = pwdData.newPwd;
    saveCreds(creds);
    setPwdData({ current: '', newPwd: '', confirmPwd: '' });
    toast('Password changed successfully!', 'success');
    addActivity('password_changed', '🔒', 'Password Changed', `${user.name} changed their password`, user.id);
  };

  const saveNotifPrefs = () => {
    setSaving(true);
    setTimeout(() => {
      const users = getAllUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...notifPrefs };
        saveUsers(users);
        onUpdate && onUpdate({ ...user, ...notifPrefs });
        toast('Notification preferences saved!', 'success');
      }
      setSaving(false);
    }, 400);
  };

  const saveDonorPrefs = () => {
    setSaving(true);
    setTimeout(() => {
      const users = getAllUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        const updates = {
          donationConsent: donorPrefs.donationConsent,
          donationWillingness: donorPrefs.willingness,
          familyNotified: donorPrefs.familyNotified,
          pledgedOrgans: donorPrefs.pledgedOrgans,
          donationType: donorPrefs.donationType,
          nextOfKin: donorPrefs.nextOfKin,
          contactPreference: donorPrefs.contactPreference,
          availableForUrgent: donorPrefs.availableForUrgent,
        };
        users[idx] = { ...users[idx], ...updates };
        saveUsers(users);
        onUpdate && onUpdate({ ...user, ...updates });
        addActivity('donor_prefs_updated', '⚙️', 'Donor Preferences Updated', `${user.name} updated donor preferences`, user.id);
        toast('Donor preferences saved!', 'success');
      }
      setSaving(false);
    }, 400);
  };

  const saveRecipientPrefs = () => {
    setSaving(true);
    setTimeout(() => {
      const users = getAllUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        const updates = {
          organNeeded: recipientPrefs.organNeeded,
          bloodCompatibility: recipientPrefs.bloodCompatibility,
          urgencySelf: recipientPrefs.urgencySelf,
          waitingListVisibility: recipientPrefs.waitingListVisibility,
          travelReady: recipientPrefs.travelReady,
          contactPreference: recipientPrefs.contactPreference,
          notifyOnMatch: recipientPrefs.notifyOnMatch,
          preferredHospitalNotes: recipientPrefs.preferredHospitalNotes,
        };
        users[idx] = { ...users[idx], ...updates };
        saveUsers(users);
        onUpdate && onUpdate({ ...user, ...updates });
        addActivity('recipient_prefs_updated', '⚙️', 'Recipient Preferences Updated', `${user.name} updated recipient preferences`, user.id);
        toast('Recipient preferences saved!', 'success');
      }
      setSaving(false);
    }, 400);
  };

  const toggleOrganPledge = (organ) => {
    setDonorPrefs(p => ({
      ...p,
      pledgedOrgans: p.pledgedOrgans.includes(organ)
        ? p.pledgedOrgans.filter(o => o !== organ)
        : [...p.pledgedOrgans, organ],
    }));
  };

  const handleDocFile = (docKey, file) => {
    if (!file) return;
    const maxBytes = (DOCUMENT_CONFIG[docKey]?.maxSizeMB || 10) * 1024 * 1024;
    if (file.size > maxBytes) {
      toast(`File too large. Maximum ${DOCUMENT_CONFIG[docKey]?.maxSizeMB || 10} MB allowed.`, 'error'); return;
    }
    if (file.size < 5000) {
      toast('File appears too small or blank. Please upload a clear document.', 'warning'); return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedDocs(prev => ({ ...prev, [docKey]: { name: file.name, type: file.type, size: file.size, data: reader.result, documentType: docKey } }));
      toast(`"${file.name}" selected for upload.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleReuploadSubmit = () => {
    if (Object.keys(uploadedDocs).length === 0) {
      toast('Please select at least one document to upload.', 'error'); return;
    }
    setReuploadSubmitting(true);
    setTimeout(() => {
      uploadAdditionalHospitalDocuments(user.id, Object.values(uploadedDocs));
      const updatedUsers = getAllUsers();
      const updatedUser = updatedUsers.find(u => u.id === user.id);
      if (updatedUser) onUpdate && onUpdate(updatedUser);
      setUploadedDocs({});
      toast('Documents submitted for review!', 'success');
      setReuploadSubmitting(false);
    }, 700);
  };

  const handleDeleteAccount = () => {
    if (deleteConfirm !== 'DELETE') {
      toast('Type DELETE to confirm.', 'error'); return;
    }
    setDeletingAccount(true);
    setTimeout(() => {
      userSelfDeleteAccount(user.id, deleteReason);
      toast('Account marked for deletion. You have 30 days to recover it.', 'info', 5000);
      setShowDeleteModal(false);
      setDeletingAccount(false);
    }, 600);
  };

  const handleAppealSubmit = () => {
    if (!appealText.trim()) {
      toast('Please provide an explanation for your appeal.', 'error'); return;
    }
    setSubmittingAppeal(true);
    setTimeout(() => {
      try {
        submitAppeal(user.id, appealText);
        toast('Appeal submitted successfully!', 'success');
        setShowAppealModal(false);
        setAppealText('');
        setAppeals(getUserAppeals(user.id));
      } catch (err) {
        toast(err.message || 'Appeal submission failed.', 'error');
      }
      setSubmittingAppeal(false);
    }, 500);
  };

  const markRead = (id) => {
    markNotificationRead(id);
    setUserNotifs(getNotifications(user.id));
  };

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Action Required Banner for hospital */}
      {user.role === 'hospital' && user.status === 'info_requested' && (
        <div style={{ background: '#fff7ed', border: '2px solid var(--warning)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <span style={{ fontSize: '24px' }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--warning)', marginBottom: '4px' }}>Action Required — Additional Documents Needed</div>
            <div style={{ fontSize: '13px', color: 'var(--text1)', lineHeight: '1.6', marginBottom: '8px' }}>
              {user.adminMessage || 'The admin has requested additional information. Please upload the required documents below.'}
            </div>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff', border: 'none' }}
              onClick={() => setActiveTab('documents')}>
              Go to Documents Tab
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '6px', border: '1px solid var(--border)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeTab === t.id ? 'var(--primary)' : 'transparent',
              color: activeTab === t.id ? '#fff' : 'var(--text2)',
              transition: 'all .15s',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
            <span>{t.icon}</span> {t.label}
            {t.id === 'documents' && user.status === 'info_requested' && (
              <span style={{ width: '8px', height: '8px', background: 'var(--warning)', borderRadius: '50%', display: 'inline-block' }}></span>
            )}
            {t.id === 'activity' && userNotifs.filter(n => !n.read).length > 0 && (
              <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '999px', fontSize: '10px', padding: '1px 6px', minWidth: '18px', textAlign: 'center' }}>
                {userNotifs.filter(n => !n.read).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ---- PROFILE TAB ---- */}
      {activeTab === 'profile' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Profile Information</div>
            <div className="card-sub">Update your personal details</div>
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
            <div style={{ width: '64px', height: '64px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700', color: '#fff' }}>
              {user.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text1)' }}>{user.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)', textTransform: 'capitalize' }}>{user.role.replace('_', ' ')} • {user.email}</div>
              <span className={`badge ${user.status === 'approved' ? 'badge-green' : user.status === 'info_requested' ? 'badge-amber' : 'badge-blue'}`} style={{ marginTop: '6px' }}>
                {user.status === 'approved' ? 'Active' : user.status === 'info_requested' ? 'Action Required' : user.status || 'Pending'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={profileData.name}
                onChange={e => setProfileData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input className="form-input" type="email" value={profileData.email}
                onChange={e => setProfileData(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input className="form-input" type="tel" value={profileData.phone}
                onChange={e => setProfileData(p => ({ ...p, phone: formatPKPhone(e.target.value) }))} placeholder="03XX-XXXXXXX" />
            </div>

            {user.role === 'donor' && (
              <>
                <div className="form-group">
                  <label className="form-label">Blood Type</label>
                  <select className="form-select" value={profileData.bloodType}
                    onChange={e => setProfileData(p => ({ ...p, bloodType: e.target.value }))}>
                    <option value="">Select</option>
                    {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input type="number" className="form-input" value={profileData.age}
                    onChange={e => setProfileData(p => ({ ...p, age: e.target.value }))} min="1" max="120" />
                </div>
              </>
            )}

            {user.role === 'recipient' && (
              <>
                <div className="form-group">
                  <label className="form-label">Organ Needed</label>
                  <select className="form-select" value={profileData.organNeeded}
                    onChange={e => setProfileData(p => ({ ...p, organNeeded: e.target.value }))}>
                    <option value="">Select</option>
                    {ORGANS_LIST.map(o => <option key={o} value={o.toLowerCase()}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input type="number" className="form-input" value={profileData.age}
                    onChange={e => setProfileData(p => ({ ...p, age: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Diagnosis</label>
                  <input className="form-input" value={profileData.diagnosis}
                    onChange={e => setProfileData(p => ({ ...p, diagnosis: e.target.value }))}
                    placeholder="e.g. End-Stage Renal Disease" />
                </div>
              </>
            )}

            {user.role === 'hospital' && (
              <>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Hospital Name</label>
                  <input className="form-input" value={profileData.hospitalName}
                    onChange={e => setProfileData(p => ({ ...p, hospitalName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Registration Number</label>
                  <input className="form-input" value={profileData.registrationNumber}
                    onChange={e => setProfileData(p => ({ ...p, registrationNumber: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">License Number</label>
                  <input className="form-input" value={profileData.licenseNumber}
                    onChange={e => setProfileData(p => ({ ...p, licenseNumber: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Hospital Address</label>
                  <input className="form-input" value={profileData.hospitalAddress}
                    onChange={e => setProfileData(p => ({ ...p, hospitalAddress: e.target.value }))} />
                </div>
              </>
            )}

            {(user.role === 'donor' || user.role === 'recipient') && (
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Medical History</label>
                <textarea className="form-input" style={{ height: '80px', paddingTop: '8px', resize: 'vertical' }}
                  value={profileData.medicalHistory}
                  onChange={e => setProfileData(p => ({ ...p, medicalHistory: e.target.value }))}
                  placeholder="Relevant medical conditions, medications, allergies..." />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          {/* Danger Zone */}
          <div style={{ marginTop: '32px', padding: '16px', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', background: 'var(--danger-light)' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--danger)', marginBottom: '6px' }}>Danger Zone</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
              Deleting your account is reversible within 30 days. After that, all data is permanently removed.
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)}>Delete Account</button>
          </div>
        </div>
      )}

      {/* ---- SECURITY TAB ---- */}
      {activeTab === 'security' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Security Settings</div>
            <div className="card-sub">Manage your password and account security</div>
          </div>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '14px' }}>Change Password</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '420px' }}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <div className="form-input-wrap">
                  <input type={showCurrent ? 'text' : 'password'} className="form-input" value={pwdData.current}
                    onChange={e => setPwdData(p => ({ ...p, current: e.target.value }))}
                    placeholder="Your current password" />
                  <button type="button" className="form-input-toggle" onClick={() => setShowCurrent(p => !p)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="form-input-wrap">
                  <input type={showNew ? 'text' : 'password'} className="form-input" value={pwdData.newPwd}
                    onChange={e => setPwdData(p => ({ ...p, newPwd: e.target.value }))}
                    placeholder="At least 8 chars, 1 uppercase, 1 number" />
                  <button type="button" className="form-input-toggle" onClick={() => setShowNew(p => !p)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                </div>
                {pwdData.newPwd && (
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                    {[pwdData.newPwd.length >= 8, /[A-Z]/.test(pwdData.newPwd), /[0-9]/.test(pwdData.newPwd), /[^A-Za-z0-9]/.test(pwdData.newPwd)].map((ok, i) => (
                      <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: ok ? 'var(--accent)' : 'var(--border)' }}></div>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <div className="form-input-wrap">
                  <input type={showConfirmPwd ? 'text' : 'password'} className="form-input" value={pwdData.confirmPwd}
                    onChange={e => setPwdData(p => ({ ...p, confirmPwd: e.target.value }))}
                    placeholder="Repeat new password" />
                  <button type="button" className="form-input-toggle" onClick={() => setShowConfirmPwd(p => !p)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                </div>
                {pwdData.confirmPwd && (
                  <div style={{ fontSize: '11px', marginTop: '4px', color: pwdData.newPwd === pwdData.confirmPwd ? 'var(--accent)' : 'var(--danger)' }}>
                    {pwdData.newPwd === pwdData.confirmPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </div>
                )}
              </div>
              <button className="btn btn-primary" onClick={savePassword}>Update Password</button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Two-Factor Authentication</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' }}>
              Add an extra layer of security to your account. 2FA requires a code from your authenticator app when signing in.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
              <span style={{ fontSize: '24px' }}>🔐</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>Authenticator App (TOTP)</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Not configured</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => toast('2FA setup coming soon.', 'info')}>
                Set Up 2FA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- DOCUMENTS TAB (Hospital Only) ---- */}
      {activeTab === 'documents' && user.role === 'hospital' && (
        <div>
          {/* Action Required Alert */}
          {user.status === 'info_requested' && (
            <div style={{ background: '#fff7ed', border: '2px solid var(--warning)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '14px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--warning)', marginBottom: '4px' }}>Additional Documents Required</div>
                <div style={{ fontSize: '13px', color: 'var(--text1)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                  {user.adminMessage || 'Please upload the required documents and resubmit for review.'}
                </div>
              </div>
            </div>
          )}

          {/* Admin Feedback */}
          {user.rejectionReason && (
            <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
              <span className="alert-icon">📝</span>
              <div className="alert-content">
                <h4>Admin Feedback</h4>
                <p>{user.rejectionReason}</p>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-header">
              <div className="card-title">Uploaded Documents</div>
              <div className="card-sub">Current documents on file</div>
            </div>
            {(user.uploadedDocuments || []).length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-state-icon">📂</div>
                <h3>No documents uploaded</h3>
                <p>Upload your hospital documents below to proceed with verification.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(user.uploadedDocuments || []).map((doc, i) => {
                  const status = doc.status || 'pending';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                      <div style={{ width: '36px', height: '36px', background: 'var(--primary-light)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>📄</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>{doc.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                          {DOCUMENT_CONFIG[doc.documentType]?.label || doc.documentType} • {(doc.size / 1024).toFixed(1)} KB
                        </div>
                        {doc.uploadedAt && (
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <span className={`badge ${status === 'approved' ? 'badge-green' : status === 'rejected' ? 'badge-red' : 'badge-amber'}`}>
                        {status === 'approved' ? '✓ Approved' : status === 'rejected' ? '✗ Rejected' : 'Pending Review'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload New / Additional Documents */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">{user.status === 'info_requested' ? 'Upload Additional Documents' : 'Upload / Update Documents'}</div>
              <div className="card-sub">
                {user.status === 'info_requested'
                  ? 'Upload the documents requested by admin. Submitting will automatically change your status back to Pending Review.'
                  : 'You can update or add documents at any time.'}
              </div>
            </div>

            <div>
              {Object.entries(DOCUMENT_CONFIG).map(([key, cfg]) => {
                const existing = (user.uploadedDocuments || []).find(d => d.documentType === key);
                const newDoc = uploadedDocs[key];
                return (
                  <div key={key} style={{ marginBottom: '14px', border: `1.5px dashed ${newDoc ? 'var(--accent)' : existing ? 'var(--border)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '14px', background: newDoc ? 'var(--accent-light)' : 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', background: existing ? 'var(--accent-light)' : 'var(--surface2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                        {newDoc ? '✅' : existing ? '📄' : cfg.required ? '📋' : '📄'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600' }}>{cfg.label}</span>
                          {cfg.required && <span className="badge badge-red" style={{ fontSize: '10px' }}>Required</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>{cfg.sample}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Max: {cfg.maxSizeMB} MB • Images or PDF</div>
                        {existing && !newDoc && (
                          <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>
                            ✓ Current: {existing.name} ({(existing.size / 1024).toFixed(1)} KB)
                          </div>
                        )}
                        {newDoc && (
                          <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px', fontWeight: '600' }}>
                            New: {newDoc.name} — Ready to submit
                          </div>
                        )}
                      </div>
                      <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                        <input type="file" style={{ display: 'none' }} accept="image/*,.pdf"
                          onChange={e => handleDocFile(key, e.target.files[0])} />
                        <span className={`btn btn-sm ${existing || newDoc ? 'btn-ghost' : 'btn-outline'}`} style={{ cursor: 'pointer' }}>
                          {newDoc ? 'Change' : existing ? 'Replace' : 'Upload'}
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {Object.keys(uploadedDocs).length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ background: 'var(--accent-light)', border: '1px solid rgba(14,176,122,.2)', borderRadius: 'var(--radius)', padding: '12px', marginBottom: '12px', fontSize: '12px', color: 'var(--accent)' }}>
                  {Object.keys(uploadedDocs).length} document{Object.keys(uploadedDocs).length > 1 ? 's' : ''} ready to submit.
                  {user.status === 'info_requested' && ' Submitting will change your status back to "Pending Review".'}
                </div>
                <button className="btn btn-primary" onClick={handleReuploadSubmit} disabled={reuploadSubmitting}>
                  {reuploadSubmitting ? 'Submitting...' : 'Submit Documents for Review'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- PREFERENCES TAB (DONOR) ---- */}
      {activeTab === 'preferences' && user.role === 'donor' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">🫀 Donor Preferences</div>
            <div className="card-sub">Manage your organ donation pledge, consent, and contact preferences</div>
          </div>

          {/* Consent block */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', marginBottom: '12px' }}>
              <input type="checkbox" checked={donorPrefs.donationConsent}
                onChange={e => setDonorPrefs(p => ({ ...p, donationConsent: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)' }}>Active Donation Consent</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>I currently consent to organ and tissue donation under THOTA 2010.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', marginBottom: '12px' }}>
              <input type="checkbox" checked={donorPrefs.familyNotified}
                onChange={e => setDonorPrefs(p => ({ ...p, familyNotified: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)' }}>Family Notified</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>My family members are aware of my organ donation decision.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
              <input type="checkbox" checked={donorPrefs.availableForUrgent}
                onChange={e => setDonorPrefs(p => ({ ...p, availableForUrgent: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)' }}>Available for Urgent Calls</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Allow Organ Donation Campaign Analysis Tool to contact you for urgent matching opportunities.</div>
              </div>
            </label>
          </div>

          {/* Donation type */}
          <div className="form-group">
            <label className="form-label">Donation Type</label>
            <select className="form-select" value={donorPrefs.donationType}
              onChange={e => setDonorPrefs(p => ({ ...p, donationType: e.target.value }))}>
              <option value="deceased">Deceased donation only (after death)</option>
              <option value="living">Living donation (kidney, partial liver)</option>
              <option value="both">Both living and deceased</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Donation Willingness</label>
            <select className="form-select" value={donorPrefs.willingness}
              onChange={e => setDonorPrefs(p => ({ ...p, willingness: e.target.value }))}>
              <option value="open">Open to all organ types</option>
              <option value="specific">Only specific organs (selected below)</option>
              <option value="restricted">Restricted (contact Organ Donation Campaign Analysis Tool for case review)</option>
            </select>
          </div>

          {/* Pledged organs */}
          <div className="form-group">
            <label className="form-label">Pledged Organs / Tissues</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {ORGANS_LIST.map(organ => {
                const selected = donorPrefs.pledgedOrgans.includes(organ);
                return (
                  <button key={organ} type="button" onClick={() => toggleOrganPledge(organ)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '20px',
                      border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-light)' : 'var(--surface)',
                      color: selected ? 'var(--accent)' : 'var(--text2)',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}>
                    {selected ? '✓ ' : ''}{organ}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Next of Kin (Name & Relationship)</label>
            <input type="text" className="form-input"
              placeholder="e.g. Ahmed Khan (Brother)"
              value={donorPrefs.nextOfKin}
              onChange={e => setDonorPrefs(p => ({ ...p, nextOfKin: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Preferred Contact Method</label>
            <select className="form-select" value={donorPrefs.contactPreference}
              onChange={e => setDonorPrefs(p => ({ ...p, contactPreference: e.target.value }))}>
              <option value="phone">Phone call</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="any">Any method</option>
            </select>
          </div>

          <button className="btn btn-primary" onClick={saveDonorPrefs} disabled={saving}>
            {saving ? 'Saving...' : 'Save Donor Preferences'}
          </button>
        </div>
      )}

      {/* ---- PREFERENCES TAB (RECIPIENT) ---- */}
      {activeTab === 'preferences' && user.role === 'recipient' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">💚 Recipient Preferences</div>
            <div className="card-sub">Manage your transplant request, urgency, and matching preferences</div>
          </div>

          <div className="form-group">
            <label className="form-label">Organ Needed</label>
            <select className="form-select" value={recipientPrefs.organNeeded}
              onChange={e => setRecipientPrefs(p => ({ ...p, organNeeded: e.target.value }))}>
              <option value="">— Select organ —</option>
              {ORGANS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Blood Compatibility Acceptance</label>
            <select className="form-select" value={recipientPrefs.bloodCompatibility}
              onChange={e => setRecipientPrefs(p => ({ ...p, bloodCompatibility: e.target.value }))}>
              <option value="exact">Exact match only</option>
              <option value="compatible">Any compatible blood type (recommended)</option>
              <option value="emergency">Emergency override (life-threatening)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Self-Reported Urgency</label>
            <select className="form-select" value={recipientPrefs.urgencySelf}
              onChange={e => setRecipientPrefs(p => ({ ...p, urgencySelf: e.target.value }))}>
              <option value="stable">Stable — routine waiting list</option>
              <option value="moderate">Moderate — periodic monitoring needed</option>
              <option value="high">High — declining health</option>
              <option value="critical">Critical — life-threatening</option>
            </select>
            <p className="form-hint">Final urgency score is set by your treating doctor and Organ Donation Campaign Analysis Tool review.</p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', marginBottom: '12px' }}>
              <input type="checkbox" checked={recipientPrefs.waitingListVisibility}
                onChange={e => setRecipientPrefs(p => ({ ...p, waitingListVisibility: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)' }}>Visible on Waiting List</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Allow approved hospitals to see your case for matching.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', marginBottom: '12px' }}>
              <input type="checkbox" checked={recipientPrefs.travelReady}
                onChange={e => setRecipientPrefs(p => ({ ...p, travelReady: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)' }}>Willing to Travel</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>I can travel to another city/hospital for the transplant if needed.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
              <input type="checkbox" checked={recipientPrefs.notifyOnMatch}
                onChange={e => setRecipientPrefs(p => ({ ...p, notifyOnMatch: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)' }}>Instant Match Notifications</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Notify me immediately when a potential donor match is found.</div>
              </div>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Preferred Contact Method</label>
            <select className="form-select" value={recipientPrefs.contactPreference}
              onChange={e => setRecipientPrefs(p => ({ ...p, contactPreference: e.target.value }))}>
              <option value="phone">Phone call</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="any">Any method</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes for Hospital (optional)</label>
            <textarea className="form-textarea" rows="3"
              placeholder="Any preferences or accessibility needs you'd like the hospital to know..."
              value={recipientPrefs.preferredHospitalNotes}
              onChange={e => setRecipientPrefs(p => ({ ...p, preferredHospitalNotes: e.target.value }))} />
          </div>

          <button className="btn btn-primary" onClick={saveRecipientPrefs} disabled={saving}>
            {saving ? 'Saving...' : 'Save Recipient Preferences'}
          </button>
        </div>
      )}

      {/* ---- NOTIFICATIONS TAB ---- */}
      {activeTab === 'notifications' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Notification Preferences</div>
            <div className="card-sub">Choose how and when you receive notifications</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            {[
              { key: 'emailNotifications', label: 'Email Notifications', desc: 'Receive updates via email' },
              { key: 'appNotifications', label: 'In-App Notifications', desc: 'Show notification badges in the dashboard' },
              { key: 'statusUpdates', label: 'Status Updates', desc: 'Notify me when my case or verification status changes' },
              { key: 'opportunityAlerts', label: 'Match & Opportunity Alerts', desc: 'Alert me when a potential match is found' },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{item.desc}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                  <input type="checkbox" checked={notifPrefs[item.key]}
                    onChange={e => setNotifPrefs(p => ({ ...p, [item.key]: e.target.checked }))}
                    style={{ display: 'none' }} />
                  <div onClick={() => setNotifPrefs(p => ({ ...p, [item.key]: !p[item.key] }))}
                    style={{ width: '44px', height: '24px', borderRadius: '12px', background: notifPrefs[item.key] ? 'var(--primary)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: '3px', left: notifPrefs[item.key] ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}></div>
                  </div>
                </label>
              </div>
            ))}
          </div>

          <button className="btn btn-primary" onClick={saveNotifPrefs} disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      )}

      {/* ---- ACTIVITY TAB ---- */}
      {activeTab === 'activity' && (
        <div>
          {/* Notifications */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-header flex justify-between items-center">
              <div>
                <div className="card-title">Notifications</div>
                <div className="card-sub">{userNotifs.filter(n => !n.read).length} unread</div>
              </div>
              {userNotifs.some(n => !n.read) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { userNotifs.forEach(n => markNotificationRead(n.id)); setUserNotifs(getNotifications(user.id)); }}>
                  Mark all read
                </button>
              )}
            </div>
            {userNotifs.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-state-icon">🔔</div>
                <h3>No notifications</h3>
                <p>You're all caught up! Notifications will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {userNotifs.map(n => (
                  <div key={n.id} onClick={() => markRead(n.id)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: 'var(--radius)', background: n.read ? 'var(--surface)' : 'var(--primary-light)', border: `1px solid ${n.read ? 'var(--border)' : 'rgba(26,92,158,.2)'}`, cursor: 'pointer', transition: 'background .15s' }}>
                    <div style={{ width: '32px', height: '32px', background: n.type === 'ban' ? 'var(--danger-light)' : n.type === 'warning' ? 'var(--warning-light)' : 'var(--accent-light)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                      {n.type === 'ban' ? '🚫' : n.type === 'warning' ? '⚠️' : n.type === 'delete' ? '🗑️' : n.type === 'appeal_status' ? '⚖️' : '📋'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{n.title}</span>
                        {/* Single tick = delivered, not read */}
                        {!n.read && <span style={{ fontSize: '12px', color: 'var(--primary)' }}>✓</span>}
                        {/* Double tick = read (removed per user request - now only 1 tick) */}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5' }}>{n.message}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{timeAgo(n.timestamp)}</div>
                    </div>
                    {!n.read && (
                      <div style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%', flexShrink: 0, marginTop: '4px' }}></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Logs */}
          {actionLogs.length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-header">
                <div className="card-title">Account Activity Log</div>
                <div className="card-sub">History of actions on your account</div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Action</th><th>Details</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {actionLogs.slice(0, 10).map((log, i) => (
                      <tr key={i}>
                        <td><span className="badge badge-blue" style={{ fontSize: '10px' }}>{log.actionType?.replace(/_/g, ' ')}</span></td>
                        <td style={{ fontSize: '12px', color: 'var(--text2)', maxWidth: '300px' }}>
                          <span className="truncate" style={{ display: 'block' }}>{log.reason || '—'}</span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Appeals */}
          {(user.banned || user.deleted) && (
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <div>
                  <div className="card-title">Appeals</div>
                  <div className="card-sub">Appeal your account action</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setShowAppealModal(true)}>
                  Submit Appeal
                </button>
              </div>
              {appeals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: '13px' }}>No appeals submitted yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {appeals.map((appeal, i) => (
                    <div key={i} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span className={`badge ${appeal.status === 'approved' ? 'badge-green' : appeal.status === 'denied' ? 'badge-red' : 'badge-amber'}`}>
                          {appeal.status}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{timeAgo(appeal.submittedDate)}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{appeal.explanation}</div>
                      {appeal.reviewNotes && (
                        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px', fontStyle: 'italic' }}>
                          Admin: {appeal.reviewNotes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- ADMINISTRATION TAB (Super Admin) ---- */}
      {activeTab === 'administration' && user.role === 'super_admin' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Administration</div>
            <div className="card-sub">System-level settings and controls</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { icon: '👥', label: 'User Management', desc: 'Manage all user accounts, roles, and permissions', action: 'Go to User Management' },
              { icon: '🏥', label: 'Hospital Approvals', desc: 'Review and approve pending hospital registrations', action: 'Review Hospitals' },
              { icon: '📊', label: 'System Analytics', desc: 'View platform-wide statistics and performance metrics', action: 'View Analytics' },
              { icon: '🔐', label: 'Audit Logs', desc: 'Access complete audit trail of all system actions', action: 'View Logs' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <div style={{ width: '40px', height: '40px', background: 'var(--primary-light)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{item.desc}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => toast('Feature accessible via sidebar navigation.', 'info')}>
                  {item.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>Delete Account</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="alert" style={{ background: 'var(--danger-light)', borderLeft: '4px solid var(--danger)', display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '14px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                  <strong style={{ color: 'var(--danger)' }}>Warning</strong>
                  <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text1)' }}>Your account will be soft-deleted. You have 30 days to recover it. After 30 days, all data is permanently removed.</p>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reason for deletion (optional)</label>
                <textarea className="form-input" style={{ height: '70px', paddingTop: '8px', resize: 'vertical' }}
                  value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                  placeholder="Tell us why you're leaving..." />
              </div>
              <div className="form-group">
                <label className="form-label">Type <strong>DELETE</strong> to confirm</label>
                <input className="form-input" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteAccount} disabled={deletingAccount || deleteConfirm !== 'DELETE'}>
                {deletingAccount ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Modal */}
      {showAppealModal && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Submit Appeal</h3>
              <button className="modal-close" onClick={() => setShowAppealModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Your Appeal Explanation *</label>
                <textarea className="form-input" style={{ height: '120px', paddingTop: '8px', resize: 'vertical' }}
                  value={appealText} onChange={e => setAppealText(e.target.value)}
                  placeholder="Explain why you believe this action should be reversed. Provide any relevant context or evidence." />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                Your appeal will be reviewed by an admin within 7 business days. You will receive a notification with the decision.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAppealModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAppealSubmit} disabled={submittingAppeal}>
                {submittingAppeal ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSettings;
