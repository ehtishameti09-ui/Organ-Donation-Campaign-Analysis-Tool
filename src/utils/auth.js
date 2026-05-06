// Authentication and User Management Utilities
import API from './api.js';

// ===== INPUT VALIDATORS =====

// Common disposable / fake email domains we reject
const INVALID_EMAIL_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'fakeinbox.com', 'trashmail.com',
  '10minutemail.com', 'yopmail.com', 'guerrillamail.com',
];

// Validate email address
// Returns { ok: bool, error?: string }
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return { ok: false, error: 'Email is required.' };
  const e = email.trim().toLowerCase();
  if (e.length < 5) return { ok: false, error: 'Email is too short.' };
  if (e.length > 100) return { ok: false, error: 'Email is too long.' };

  const basic = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
  if (!basic.test(e)) return { ok: false, error: 'Please enter a valid email address.' };

  const [local, domain] = e.split('@');
  if (!local || !domain) return { ok: false, error: 'Invalid email format.' };
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { ok: false, error: 'Email username cannot start/end with a dot or contain consecutive dots.' };
  }

  if (INVALID_EMAIL_DOMAINS.includes(domain)) {
    return { ok: false, error: 'This email domain is not accepted. Please use a real email.' };
  }

  return { ok: true };
};

// Validate person's name
// Returns { ok: bool, error?: string }
export const validateName = (name) => {
  if (!name || typeof name !== 'string') return { ok: false, error: 'Name is required.' };
  const n = name.trim();
  if (n.length < 2) return { ok: false, error: 'Name must be at least 2 characters.' };
  if (n.length > 60) return { ok: false, error: 'Name must be 60 characters or fewer.' };
  if (n.replace(/\s/g, '').length < 2) {
    return { ok: false, error: 'Please enter a valid name.' };
  }

  return { ok: true };
};

// Utility: Calculate age from date of birth
export const calculateAgeFromDOB = (dobString) => {
  if (!dobString) return '';
  try {
    // Parse as local date parts (YYYY-MM-DD) to avoid UTC midnight shift
    const [y, mo, d] = dobString.split('-').map(Number);
    const today = new Date();
    let age = today.getFullYear() - y;
    const monthDiff = (today.getMonth() + 1) - mo;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
    return age >= 0 ? age : '';
  } catch {
    return '';
  }
};

// Initialize Super Admin - now uses backend seeded data
// This function is kept for backward compatibility but doesn't need to do anything
export const initSuperAdmin = () => {
  // Backend handles admin initialization via seeders
  // Demo accounts are pre-seeded in Laravel database
};

// Login function (uses API)
export const login = async (email, password) => {
  const response = await API.loginViaAPI(email, password);
  localStorage.setItem('odcat_current', JSON.stringify(response.user));
  return response.user;
};

// Get current user
export const getCurrentUser = () => {
  const s = localStorage.getItem('odcat_current');
  return s ? JSON.parse(s) : null;
};

// Logout (calls API)
export const logout = async () => {
  try {
    await API.logoutViaAPI();
  } catch (error) {
    console.error('Logout error:', error);
  }
  localStorage.removeItem('odcat_current');
};

// Internal sync fallback (for mutation functions that update localStorage as legacy)
const getAllUsersSync = () => {
  return JSON.parse(localStorage.getItem('odcat_users') || '[]');
};

// Get all users from API (paginated response uses .data key)
export const getAllUsers = async () => {
  try {
    const response = await API.getUsersViaAPI();
    return response.data || [];
  } catch { return []; }
};

// Save users
export const saveUsers = (users) => {
  localStorage.setItem('odcat_users', JSON.stringify(users));
};

// Get credentials
export const getCreds = () => {
  return JSON.parse(localStorage.getItem('odcat_creds') || '{}');
};

// Save credentials
export const saveCreds = (c) => {
  localStorage.setItem('odcat_creds', JSON.stringify(c));
};

// Update user status (API)
export const updateUserStatus = async (id, status) => {
  await API.updateUserViaAPI(id, { status });
};

// Delete user by ID (API)
export const deleteUserById = async (id) => {
  await API.deleteUserViaAPI(id);
};

// Register new user (calls API)
export const registerUser = async (registrationData) => {
  try {
    const extraData = {};
    if (registrationData.type === 'hospital') {
      extraData.hospital_name = registrationData.hospitalName;
      extraData.registration_number = registrationData.registrationNumber;
      extraData.license_number = registrationData.licenseNumber;
      if (registrationData.hospitalAddress) extraData.hospital_address = registrationData.hospitalAddress;
      if (registrationData.contactPerson) extraData.contact_person = registrationData.contactPerson;
    }
    const response = await API.registerViaAPI(
      registrationData.name,
      registrationData.email,
      registrationData.password,
      registrationData.type,
      registrationData.phone || '',
      extraData
    );
    localStorage.setItem('odcat_current', JSON.stringify(response.user));
    return response.user;
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
};

// Get pending registrations (hospitals)
export const getPendingRegistrations = async () => {
  try {
    const response = await API.getPendingHospitalsViaAPI();
    return response.hospitals || [];
  } catch { return []; }
};

// Approve registration with optional feedback
export const approveRegistration = async (id, feedback = '') => {
  return await API.approveHospitalViaAPI(id, feedback);
};

// Reject registration with feedback
export const rejectRegistration = async (id, reason = '') => {
  return await API.rejectHospitalViaAPI(id, reason);
};

// Request additional info from hospital
export const requestAdditionalInfo = async (id, message = '') => {
  return await API.requestHospitalInfoViaAPI(id, message);
};

// ===== BAN/DELETE SYSTEM WITH APPEALS =====

// Ban categories with descriptions
export const BAN_CATEGORIES = {
  FAKE_REGISTRATION: {
    label: 'Fake Hospital Registration',
    description: 'Fraudulent or fake hospital registration information',
    severity: 'high'
  },
  FRAUD_MISUSE: {
    label: 'Fraud / Misuse of Data',
    description: 'Fraudulent activity or unauthorized data misuse',
    severity: 'critical'
  },
  POLICY_VIOLATION: {
    label: 'Policy Violation',
    description: 'Violation of platform policies or terms of service',
    severity: 'medium'
  },
  SUSPICIOUS_ACTIVITY: {
    label: 'Suspicious Activity',
    description: 'Unusual or suspicious account behavior',
    severity: 'high'
  },
  MULTIPLE_ACCOUNTS: {
    label: 'Multiple Accounts',
    description: 'Creating multiple unauthorized accounts',
    severity: 'high'
  },
  OTHER: {
    label: 'Other',
    description: 'Other violations (specify in details)',
    severity: 'medium'
  }
};

// Ban duration templates
export const BAN_DURATIONS = {
  WARNING: { value: 0, label: 'Warning (No ban)' },
  SEVEN_DAYS: { value: 7, label: '7 Days' },
  THIRTY_DAYS: { value: 30, label: '30 Days' },
  NINETY_DAYS: { value: 90, label: '90 Days' },
  PERMANENT: { value: null, label: 'Permanent' }
};

// Notification system — API-backed
export const createNotification = () => {}; // handled by backend automatically

export const getNotifications = async (userId) => {
  try {
    const response = await API.getNotificationsViaAPI();
    return response.notifications || response.data || [];
  } catch { return []; }
};

export const getUnreadNotifications = async (userId) => {
  try {
    const notifs = await getNotifications(userId);
    return notifs.filter(n => !n.read_at);
  } catch { return []; }
};

export const markNotificationRead = async (notificationId) => {
  try {
    await API.markNotificationReadViaAPI(notificationId);
  } catch { /* silent */ }
};

// Log user actions — handled by backend automatically
export const logUserAction = () => {};

// Get all action logs
export const getActionLogs = async () => {
  try {
    const response = await API.getActionLogsViaAPI();
    return response.logs || response.data || [];
  } catch { return []; }
};

// Get action logs for a specific user (API returns only current user's logs)
export const getUserActionLogs = async (userId) => {
  return await getActionLogs();
};

// Ban a user (with structured reason and categories)
export const banUser = async (userId, category, detailedReason, banType = 'temporary', duration = 30, adminId) => {
  if (!category || !Object.keys(BAN_CATEGORIES).includes(category)) {
    throw new Error('Valid ban category is required');
  }
  if (!detailedReason || !detailedReason.trim()) {
    throw new Error('Detailed explanation is required');
  }
  const banData = {
    detailed_reason: detailedReason,
    category,
    category_label: BAN_CATEGORIES[category].label,
    ban_type: banType,
    duration: banType === 'temporary' ? duration : null,
  };
  return await API.banUserViaAPI(userId, banData);
};

// Soft delete user (mark as deleted instead of removing)
export const softDeleteUser = async (userId, category, detailedReason, adminId) => {
  if (!category || !Object.keys(BAN_CATEGORIES).includes(category)) {
    throw new Error('Valid deletion category is required');
  }
  if (!detailedReason || !detailedReason.trim()) {
    throw new Error('Detailed explanation is required');
  }
  return await API.deleteUserViaAPI(userId, detailedReason, category);
};

// Submit an appeal (API)
export const submitAppeal = async (userId, explanation, evidence = {}, originalAction = 'ban') => {
  if (!explanation || !explanation.trim()) {
    throw new Error('Appeal explanation is required');
  }
  return await API.submitAppealViaAPI(userId, explanation, originalAction);
};

// Get all appeals (API)
export const getAppeals = async () => {
  try {
    const response = await API.getAppealsViaAPI();
    return response.appeals || [];
  } catch { return []; }
};

// Get appeals for a specific user (API returns scoped list)
export const getUserAppeals = async (userId) => {
  return await getAppeals();
};

// Get pending appeals (for admin review)
export const getPendingAppeals = async () => {
  const appeals = await getAppeals();
  return appeals.filter(a => a.status === 'pending');
};

// Get overdue appeals
export const getOverdueAppeals = async () => {
  const pending = await getPendingAppeals();
  return pending.filter(a => new Date(a.admin_response_deadline || a.adminResponseDeadline) < new Date());
};

// Review and decide on an appeal (API)
export const reviewAppeal = async (appealId, decision, notes, reviewAdminId) => {
  if (!decision || !['uphold', 'reverse', 'modify'].includes(decision)) {
    throw new Error('Valid decision required: uphold, reverse, or modify');
  }
  if (!notes || !notes.trim()) {
    throw new Error('Review notes are required');
  }
  return await API.reviewAppealViaAPI(appealId, decision, notes);
};

// LEGACY STUB — kept so old code referencing it doesn't crash
const _reviewAppealOld = (appealId, decision, notes, reviewAdminId) => {
  // If appeal is approved (reversed), remove ban/deletion
  if (decision === 'reverse') {
    createNotification(
      appealId,
      'appeal_status',
      '✅ Appeal Approved',
      'Your appeal has been approved. Your account has been reinstated.',
      { appealId, decision: 'reverse' }
    );

    logUserAction(appeal.userId, 'ban_reversed', `Appeal approved and ban reversed`, {
      appealId,
      reviewAdminId
    });
  } else if (decision === 'uphold') {
    createNotification(
      appeal.userId,
      'appeal_status',
      '❌ Appeal Denied',
      `Your appeal has been denied. Original action upheld: ${notes}`,
      { appealId, decision: 'uphold' }
    );

    logUserAction(appeal.userId, 'appeal_denied', `Appeal denied - original action upheld`, {
      appealId,
      reviewAdminId
    });
  } else {
    createNotification(
      appeal.userId,
      'appeal_status',
      '⚙️ Appeal Modified',
      `Your appeal has been reviewed and a modified action applied: ${notes}`,
      { appealId, decision: 'modify' }
    );

    logUserAction(appeal.userId, 'appeal_modified', `Appeal reviewed and action modified`, {
      appealId,
      reviewAdminId
    });
  }

  localStorage.setItem('odcat_appeals', JSON.stringify(appeals));
  return true;
};

// User self-delete account (API)
export const userSelfDeleteAccount = async (userId, reason = '') => {
  return await API.deleteSelfViaAPI(reason || 'User requested account deletion');
};

// Check if deleted account can be recovered (based on user object from API)
export const canRecoverDeletedAccount = (userId) => {
  const stored = localStorage.getItem('odcat_current');
  if (!stored) return false;
  const user = JSON.parse(stored);
  return user?.isDeleted && user?.recoveryDeadline && new Date(user.recoveryDeadline) > new Date();
};

// Restore a soft-deleted account (API)
export const restoreDeletedAccount = async (userId) => {
  const result = await API.restoreSelfViaAPI();
  if (result.user) {
    localStorage.setItem('odcat_current', JSON.stringify(result.user));
  }
  return result;
};

// No-op — backend handles auto-deletion via scheduler
export const cleanupExpiredDeletedAccounts = () => {};

// ===== ACTIVITY TRACKING =====

// addActivity — backend logs activities automatically; this is a no-op stub for backwards compat
export const addActivity = () => {};

export const getRecentActivities = async (limit = 20) => {
  try {
    const response = await API.getActivitiesViaAPI();
    return (response.activities || []).slice(0, limit);
  } catch { return []; }
};

export const getRecentActivitiesForUser = async (userId, limit = 20) => {
  try {
    const response = await API.getActivitiesViaAPI();
    return (response.activities || []).slice(0, limit);
  } catch { return []; }
};

// ===== DONOR MANAGEMENT =====

export const getDonors = async () => {
  try {
    const response = await API.getDonorsViaAPI();
    return response.data || [];
  } catch { return []; }
};

export const verifyDonor = async (donorId, status, notes, adminId) => {
  return await API.verifyDonorViaAPI(donorId, status, notes || '');
};

export const updateDonorDocumentStatus = async (donorId, docType, docStatus, adminId) => {
  await API.updateUserViaAPI(donorId, { documentStatuses: { [docType]: { status: docStatus } } });
  return true;
};

export const getVerificationMetrics = async () => {
  try {
    const response = await API.getDashboardMetricsViaAPI();
    return {
      total: response.totalDonors || 0,
      approved: response.approvedDonors || 0,
      rejected: 0,
      pending: response.pendingCases || 0,
      totalUsers: response.totalUsers || 0,
      totalDonors: response.totalDonors || 0,
      totalRecipients: response.totalRecipients || 0,
      totalHospitals: response.totalHospitals || 0,
      pendingHospitals: response.pendingHospitals || 0,
      approvedRecipients: response.approvedRecipients || 0,
      totalDocuments: response.totalDocuments || 0,
      avgApprovalDays: 2,
      rejectionRate: 0,
    };
  } catch { return {}; }
};

// ===== RECIPIENT MANAGEMENT =====

export const getRecipients = async () => {
  try {
    const response = await API.getRecipientsViaAPI();
    return response.data || [];
  } catch { return []; }
};

export const getDonorsByHospital = async (hospitalId) => {
  try {
    const response = await API.getDonorsViaAPI();
    return (response.data || []).filter(d =>
      d.preferred_hospital_id == hospitalId || d.preferredHospitalId == hospitalId
    );
  } catch { return []; }
};

export const getRecipientsByHospital = async (hospitalId) => {
  try {
    const response = await API.getRecipientsViaAPI();
    return (response.data || []).filter(r =>
      r.preferred_hospital_id == hospitalId || r.preferredHospitalId == hospitalId
    );
  } catch { return []; }
};

export const calculateSurvivalEstimate = (age, urgencyScore, comorbidityScore) => {
  // Rule-based survival estimate
  let base = 80;

  // Age factor
  if (age < 18) base += 10;
  else if (age < 30) base += 8;
  else if (age < 45) base += 5;
  else if (age < 60) base += 0;
  else if (age < 70) base -= 8;
  else base -= 15;

  // Urgency factor (1-10, higher = worse)
  if (urgencyScore <= 3) base += 5;
  else if (urgencyScore <= 5) base += 0;
  else if (urgencyScore <= 7) base -= 5;
  else if (urgencyScore <= 9) base -= 12;
  else base -= 20;

  // Comorbidity factor (0-10, higher = worse)
  if (comorbidityScore <= 2) base += 5;
  else if (comorbidityScore <= 4) base += 0;
  else if (comorbidityScore <= 6) base -= 8;
  else if (comorbidityScore <= 8) base -= 15;
  else base -= 22;

  return Math.max(10, Math.min(95, Math.round(base)));
};

export const updateRecipientCase = async (recipientId, caseData, adminId) => {
  return await API.updateUserViaAPI(recipientId, caseData);
};

export const getWaitingTimeAnalytics = async () => {
  const recipients = await getRecipients();
  const byOrgan = {};

  recipients.forEach(r => {
    if (!r.organNeeded) return;
    if (!byOrgan[r.organNeeded]) byOrgan[r.organNeeded] = { count: 0, totalDays: 0 };
    const days = r.daysOnWaitlist || Math.round((new Date() - new Date(r.registrationDate)) / (1000 * 60 * 60 * 24));
    byOrgan[r.organNeeded].count++;
    byOrgan[r.organNeeded].totalDays += days;
  });

  return Object.entries(byOrgan).map(([organ, data]) => ({
    organ,
    count: data.count,
    avgDays: data.count > 0 ? Math.round(data.totalDays / data.count) : 0
  }));
};

// ===== HOSPITAL FEATURES =====

export const getApprovedHospitals = async () => {
  try {
    const response = await API.getHospitalsViaAPI();
    return response.hospitals || [];
  } catch { return []; }
};

export const getRejectedHospitals = async () => {
  try {
    const response = await API.getHospitalsViaAPI('rejected');
    return response.hospitals || [];
  } catch { return []; }
};

// Get all hospital admins (API)
export const getHospitalAdmins = async (hospitalId) => {
  try {
    const users = await getAllUsers();
    return users.filter(u => u.role === 'admin' && u.linkedHospitalId == hospitalId);
  } catch { return []; }
};

export const uploadAdditionalHospitalDocuments = async (hospitalId, newDocuments) => {
  // newDocuments is array of { file: File, documentType: string } or { data: base64, name, type, documentType }
  // Convert base64 docs to blobs and upload via FormData
  for (const doc of newDocuments) {
    try {
      let fileObj = doc.file;
      if (!fileObj && doc.data) {
        const arr = doc.data.split(',');
        const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
        const bstr = atob(arr[1]);
        const u8arr = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
        fileObj = new File([u8arr], doc.name || 'document', { type: mime });
      }
      if (fileObj) {
        await API.uploadDocumentsViaAPI([fileObj], doc.documentType, hospitalId);
      }
    } catch { /* continue with next doc */ }
  }
  return true;
};


// ===== CONSENT FORM =====

export const submitConsentForm = (userId, userType, formData) => {
  let consents = JSON.parse(localStorage.getItem('odcat_consents') || '{}');
  consents[userId] = {
    userId,
    userType,
    ...formData,
    submittedAt: new Date().toISOString(),
    signed: true
  };
  localStorage.setItem('odcat_consents', JSON.stringify(consents));

  // Update user record
  let users = getAllUsersSync();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx].consentSigned = true;
    users[idx].consentDate = new Date().toISOString();
    saveUsers(users);
  }
  return true;
};

export const getConsentForm = (userId) => {
  const consents = JSON.parse(localStorage.getItem('odcat_consents') || '{}');
  return consents[userId] || null;
};

export const hasSignedConsent = (userId) => {
  const consent = getConsentForm(userId);
  return consent !== null && consent.signed === true;
};

// ===== ENHANCED REGISTRATION (with activity tracking) =====

export const registerUserWithActivity = (registrationData) => {
  registerUser(registrationData);

  if (registrationData.type === 'hospital') {
    addActivity('hospital_registered', '🏥', 'New Hospital Registration',
      `${registrationData.hospitalName} submitted a registration request`, null);
  } else if (registrationData.type === 'donor') {
    addActivity('donor_registered', '❤️', 'New Donor Registered',
      `${registrationData.name} registered as a donor`, null);
  } else if (registrationData.type === 'recipient') {
    addActivity('recipient_registered', '🏥', 'New Recipient Registered',
      `${registrationData.name} registered as a recipient`, null);
  }
};

// ===== NEW TWO-PHASE REGISTRATION FLOW =====

// Phase 1: Create basic account (just name, email, password, role)
export const registerBasicAccount = async (name, email, password, role, phone = '') => {
  return await API.registerViaAPI(name, email, password, role, phone);
};

// Phase 2: Complete donor/recipient registration (consent + clinical + docs + hospital)
export const completeDonorRecipientRegistration = async (userId, payload) => {
  const currentUser = getCurrentUser();
  const role = currentUser?.role || payload.role;

  // Map camelCase frontend fields → snake_case backend fields
  const hospitalId = payload.preferredHospitalId || payload.preferred_hospital_id;
  const common = {
    cnic:                     payload.cnic,
    dob:                      payload.dob,
    gender:                   payload.gender,
    blood_type:               payload.bloodType        || payload.blood_type,
    phone:                    payload.phone,
    address:                  payload.address,
    medical_history:          payload.medicalHistory   || payload.medical_history   || null,
    current_medications:      payload.currentMedications || payload.current_medications || null,
    emergency_contact_name:   payload.emergencyContactName   || payload.emergency_contact_name   || null,
    emergency_contact_phone:  payload.emergencyContactPhone  || payload.emergency_contact_phone  || null,
    emergency_contact_relation: payload.emergencyContactRelation || payload.emergency_contact_relation || null,
    preferred_hospital_id:    hospitalId ? parseInt(hospitalId, 10) : null,
  };

  if (role === 'donor') {
    return await API.completeDonorRegistrationViaAPI({
      ...common,
      pledged_organs:   payload.pledgedOrgans  || payload.pledged_organs  || [],
      donation_type:    payload.donationType   || payload.donation_type   || 'deceased',
      family_informed:  payload.familyInformed ?? payload.family_informed ?? false,
      next_of_kin:      payload.nextOfKin      || payload.next_of_kin     || null,
    });
  } else {
    return await API.completeRecipientRegistrationViaAPI({
      ...common,
      organ_needed:     payload.organNeeded    || payload.organ_needed,
      diagnosis:        payload.diagnosis      || null,
      urgency_score:    payload.urgencyScore   ?? payload.urgency_score   ?? null,
      comorbidity:      payload.comorbidity                               ?? null,
      treating_doctor:  payload.treatingDoctor || payload.treating_doctor || null,
      current_hospital: payload.currentHospital || payload.current_hospital || null,
    });
  }
};

// Get cases assigned to a hospital (for hospital review dashboard)
export const getHospitalAssignedCases = async (hospitalId) => {
  try {
    const [donorsRes, recipientsRes] = await Promise.all([
      API.getDonorsViaAPI(),
      API.getRecipientsViaAPI(),
    ]);
    const donors = (donorsRes.data || []).map(d => ({ ...d, role: 'donor' }));
    const recipients = (recipientsRes.data || []).map(r => ({ ...r, role: 'recipient' }));
    return [...donors, ...recipients];
  } catch { return []; }
};

// Hospital reviews a case (approve / reject / request_info)
// role must be 'donor' or 'recipient' — passed directly so paginated API lookups are not needed
export const hospitalReviewCase = async (caseUserId, action, notes, hospitalId, role) => {
  if (role === 'donor') {
    return await API.verifyDonorViaAPI(caseUserId, action, notes || '');
  }
  return await API.verifyRecipientViaAPI(caseUserId, action, notes || '');
};

// User resubmits case with new info / docs after info_requested
export const resubmitCaseInfo = async (userId, additionalData, newDocuments) => {
  return await API.updateUserViaAPI(userId, { ...additionalData, status: 'submitted' });
};

// ===== ENHANCED HOSPITAL APPROVAL (with activity tracking) =====

export const approveRegistrationWithActivity = async (id, feedback, adminId) => {
  return await approveRegistration(id, feedback);
};

export const rejectRegistrationWithActivity = async (id, reason, adminId) => {
  return await rejectRegistration(id, reason);
};

export const requestAdditionalInfoWithActivity = async (id, message, adminId) => {
  return await requestAdditionalInfo(id, message);
};

// Password Reset Functions
export const requestPasswordReset = (email) => {
  const users = getAllUsersSync();
  const user = users.find(u => u.email === email);

  if (!user) {
    throw new Error('Email address not found in our system.');
  }

  // Generate reset token (simple implementation)
  const resetToken = 'reset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const resetExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hour expiry

  // Store reset token in localStorage
  let resetTokens = JSON.parse(localStorage.getItem('odcat_reset_tokens') || '{}');
  resetTokens[email] = {
    token: resetToken,
    expiry: resetExpiry,
    createdAt: new Date().toISOString()
  };
  localStorage.setItem('odcat_reset_tokens', JSON.stringify(resetTokens));

  // Log the action
  logUserAction(user.id, 'password_reset_requested', `Password reset requested for email: ${email}`);

  // Create notification
  createNotification(user.id, 'account_alert', 'Password Reset Requested', `A password reset request was made for your account. If you did not request this, you can safely ignore this email.`);

  return {
    success: true,
    message: `Password reset link has been sent to ${email}. The link will expire in 24 hours.`,
    token: resetToken // For demo purposes - in production, this would be sent via email
  };
};

export const validateResetToken = (email, token) => {
  const resetTokens = JSON.parse(localStorage.getItem('odcat_reset_tokens') || '{}');
  
  if (!resetTokens[email]) {
    throw new Error('No password reset request found for this email.');
  }

  const resetData = resetTokens[email];
  
  if (resetData.token !== token) {
    throw new Error('Invalid reset token.');
  }

  if (new Date() > new Date(resetData.expiry)) {
    // Remove expired token
    delete resetTokens[email];
    localStorage.setItem('odcat_reset_tokens', JSON.stringify(resetTokens));
    throw new Error('Reset token has expired. Please request a new password reset.');
  }

  return true;
};

export const resetPassword = (email, token, newPassword) => {
  // Validate token first
  validateResetToken(email, token);

  // Validate password strength
  if (!newPassword || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  // Update password in credentials
  const users = getAllUsersSync();
  const user = users.find(u => u.email === email);

  if (!user) {
    throw new Error('User not found.');
  }

  const creds = getCreds();
  creds[email] = newPassword;
  saveCreds(creds);

  // Remove the used reset token
  const resetTokens = JSON.parse(localStorage.getItem('odcat_reset_tokens') || '{}');
  delete resetTokens[email];
  localStorage.setItem('odcat_reset_tokens', JSON.stringify(resetTokens));

  // Log the action
  logUserAction(user.id, 'password_reset_completed', 'Password reset completed successfully');

  // Create notification
  createNotification(user.id, 'account_alert', 'Password Changed', 'Your account password was successfully reset. If you did not make this change, please contact support immediately.');

  return {
    success: true,
    message: 'Your password has been successfully reset. You can now log in with your new password.'
  };
};

// ===== EMPLOYEE MANAGEMENT =====

export const getEmployees = async () => {
  try {
    const response = await API.getUsersViaAPI();
    return (response.data || []).filter(u =>
      ['doctor', 'data_entry', 'auditor', 'admin'].includes(u.role)
    );
  } catch { return []; }
};

export const addEmployee = async (employeeData, adminId) => {
  return await API.createAdminViaAPI({
    name: employeeData.name,
    email: employeeData.email,
    password: employeeData.password || 'Temp@1234',
    phone: employeeData.phone || '',
    role: employeeData.role || 'doctor',
    linked_hospital_id: employeeData.hospitalId || null,
  });
};

export const updateEmployee = async (employeeId, updates, adminId) => {
  return await API.updateUserViaAPI(employeeId, {
    name: updates.name,
    phone: updates.phone,
    role: updates.role,
    department: updates.department,
    specialization: updates.specialization,
    linked_hospital_id: updates.hospitalId || updates.linked_hospital_id || null,
  });
};

export const toggleEmployeeStatus = async (employeeId, adminId) => {
  const userData = await API.getUserViaAPI(employeeId);
  const user = userData.user || userData;
  if (user.banned || user.status === 'banned') {
    return await API.unbanUserViaAPI(employeeId);
  } else {
    return await API.banUserViaAPI(employeeId, {
      category: 'OTHER',
      category_label: 'Other',
      detailed_reason: 'Suspended by administrator',
      ban_type: 'temporary',
      duration: 365,
    });
  }
};

// ===== MULTI-ADMIN APPEAL SYSTEM =====

export const submitMultiAdminAppeal = (userId, explanation, evidence = {}) => {
  if (!explanation || !explanation.trim()) throw new Error('Appeal explanation is required');

  const users = getAllUsersSync();
  const user = users.find(u => u.id === userId);
  if (!user || (!user.banned && !user.deleted)) throw new Error('User is not banned or deleted');

  let appeals = getAppeals();
  const pendingAppeal = appeals.find(a => a.userId === userId && a.status === 'pending');
  if (pendingAppeal) throw new Error('You already have a pending appeal.');

  const actionDate = user.banned ? new Date(user.banDetails.banDate) : new Date(user.deletionDetails.deletionDate);
  const deadlineDate = new Date(actionDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (new Date() > deadlineDate) throw new Error('Appeal deadline has passed (30 days).');

  // Find 3 admins to review (exclude original admin)
  const originalAdminId = user.banned ? user.banDetails.adminId : user.deletionDetails.adminId;
  const admins = users.filter(u =>
    (u.role === 'super_admin' || u.role === 'admin') && !u.deleted && u.id !== originalAdminId
  );

  const reviewerIds = admins.slice(0, 3).map(a => a.id);

  const appeal = {
    id: 'multi-appeal-' + Date.now(),
    userId,
    explanation,
    evidence,
    submittedDate: new Date().toISOString(),
    status: 'pending',
    originalAction: user.banned ? 'ban' : 'delete',
    originalCategory: user.banned ? user.banDetails.category : user.deletionDetails.category,
    originalReason: user.banned ? user.banDetails.detailedReason : user.deletionDetails.detailedReason,
    originalAdminId,
    isMultiAdmin: true,
    reviewerIds,
    reviews: [],
    adminResponseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    finalDecision: null,
  };

  appeals.push(appeal);
  localStorage.setItem('odcat_appeals', JSON.stringify(appeals));

  reviewerIds.forEach(rid => {
    createNotification(rid, 'appeal_assigned', 'New Appeal Assigned',
      `A multi-admin appeal has been submitted by ${user.name}. Your review is required.`, { appealId: appeal.id });
  });

  createNotification(userId, 'appeal_status', 'Appeal Submitted',
    'Your appeal has been sent to 3 administrators for review.', { appealId: appeal.id });

  logUserAction(userId, 'multi_appeal_submitted', explanation, { appealId: appeal.id, reviewerIds });
  return appeal;
};

export const reviewMultiAdminAppeal = (appealId, decision, notes, reviewAdminId) => {
  if (!['approve', 'reject'].includes(decision)) throw new Error('Decision must be approve or reject');
  if (!notes || !notes.trim()) throw new Error('Review notes are required');

  let appeals = getAppeals();
  const idx = appeals.findIndex(a => a.id === appealId);
  if (idx === -1) throw new Error('Appeal not found');

  const appeal = appeals[idx];
  if (!appeal.isMultiAdmin) throw new Error('This is not a multi-admin appeal');
  if (appeal.status !== 'pending') throw new Error('Appeal is no longer pending');
  if (!appeal.reviewerIds.includes(reviewAdminId)) throw new Error('You are not assigned to review this appeal');
  if (appeal.reviews.some(r => r.adminId === reviewAdminId)) throw new Error('You have already reviewed this appeal');

  appeal.reviews.push({
    adminId: reviewAdminId,
    decision,
    notes,
    reviewDate: new Date().toISOString(),
  });

  // Check if all 3 or enough reviews are in (2 approvals = restored, else denied)
  const approvals = appeal.reviews.filter(r => r.decision === 'approve').length;
  const rejections = appeal.reviews.filter(r => r.decision === 'reject').length;
  const totalReviewers = appeal.reviewerIds.length;

  if (approvals >= 2) {
    appeal.status = 'approved';
    appeal.finalDecision = 'restored';

    let users = getAllUsersSync();
    const userIdx = users.findIndex(u => u.id === appeal.userId);
    if (userIdx !== -1) {
      users[userIdx].banned = false;
      users[userIdx].deleted = false;
      users[userIdx].status = 'approved';
      users[userIdx].banDetails = null;
      users[userIdx].deletionDetails = null;
      saveUsers(users);
    }

    createNotification(appeal.userId, 'appeal_status', 'Appeal Approved',
      'Your appeal was approved by majority vote (2+ admins). Your account has been restored.', { appealId });
    addActivity('multi_appeal_approved', '✅', 'Multi-Admin Appeal Approved',
      `Appeal for user approved by ${approvals}/${totalReviewers} admins`, reviewAdminId);
  } else if (rejections >= 2 || appeal.reviews.length >= totalReviewers) {
    appeal.status = 'denied';
    appeal.finalDecision = 'permanently_banned';

    createNotification(appeal.userId, 'appeal_status', 'Appeal Denied',
      'Your appeal was denied by majority vote. The original action stands.', { appealId });
    addActivity('multi_appeal_denied', '❌', 'Multi-Admin Appeal Denied',
      `Appeal denied by ${rejections}/${totalReviewers} admins`, reviewAdminId);
  }

  appeals[idx] = appeal;
  localStorage.setItem('odcat_appeals', JSON.stringify(appeals));

  logUserAction(appeal.userId, 'multi_appeal_reviewed', `Admin voted: ${decision}`, {
    appealId, reviewAdminId, decision, currentVotes: appeal.reviews.length
  });

  return appeal;
};

export const getMultiAdminAppeals = async () => {
  const appeals = await getAppeals();
  return appeals.filter(a => a.isMultiAdmin);
};

// ===== HOSPITAL CASE APPEAL SYSTEM =====

export const submitHospitalCaseAppeal = (caseUserId, appealText) => {
  const users = getAllUsersSync();
  const caseUser = users.find(u => u.id === caseUserId);

  if (!caseUser) {
    throw new Error('User not found');
  }

  if (caseUser.status !== 'rejected') {
    throw new Error('User case is not rejected');
  }

  if (!caseUser.preferredHospitalId) {
    throw new Error('No hospital assigned to this case');
  }

  // Check for existing pending appeal
  const appeals = JSON.parse(localStorage.getItem('odcat_case_appeals') || '[]');
  const existingAppeal = appeals.find(a => a.caseUserId === caseUserId && a.status === 'pending');
  if (existingAppeal) {
    throw new Error('An appeal is already pending for this case');
  }

  // Check 7-day deadline
  if (caseUser.hospitalReviewDate) {
    const reviewDate = new Date(caseUser.hospitalReviewDate);
    const deadline = new Date(reviewDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > deadline) {
      throw new Error('Appeal deadline has passed (7 days from rejection)');
    }
  }

  const hospital = users.find(u => u.id === caseUser.preferredHospitalId);

  const newAppeal = {
    id: 'case-appeal-' + Date.now(),
    caseUserId,
    caseUserName: caseUser.name,
    caseUserRole: caseUser.role,
    hospitalId: caseUser.preferredHospitalId,
    hospitalName: hospital?.hospitalName || hospital?.name || 'Unknown Hospital',
    appealText,
    submittedDate: new Date().toISOString(),
    status: 'pending',
    hospitalReviewNotes: null,
    hospitalReviewDate: null,
    hospitalReviewedBy: null,
    deadline: new Date(new Date(caseUser.hospitalReviewDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  appeals.push(newAppeal);
  localStorage.setItem('odcat_case_appeals', JSON.stringify(appeals));

  // Update user status
  const idx = users.findIndex(u => u.id === caseUserId);
  if (idx !== -1) {
    users[idx].caseAppealSubmitted = true;
    users[idx].caseAppealDate = new Date().toISOString();
    saveUsers(users);
  }

  // Notify hospital
  createNotification(caseUser.preferredHospitalId, 'case_appeal', 'Case Appeal Submitted', `${caseUser.name} has appealed their rejected case`, { appealId: newAppeal.id });

  // Notify user
  createNotification(caseUserId, 'case_appeal', 'Appeal Submitted', 'Your case appeal has been submitted to the hospital for review', { appealId: newAppeal.id });

  addActivity('case_appeal_submitted', '📋', 'Case Appeal Submitted', `${caseUser.name} appealed their rejected case to ${hospital?.hospitalName || 'hospital'}`, caseUserId);
};

export const getHospitalCaseAppeals = (hospitalId) => {
  const appeals = JSON.parse(localStorage.getItem('odcat_case_appeals') || '[]');
  return appeals.filter(a => a.hospitalId === hospitalId);
};

export const getUserCaseAppeals = (caseUserId) => {
  const appeals = JSON.parse(localStorage.getItem('odcat_case_appeals') || '[]');
  return appeals.filter(a => a.caseUserId === caseUserId);
};

export const reviewHospitalCaseAppeal = (appealId, decision, notes, reviewingHospitalUserId) => {
  const appeals = JSON.parse(localStorage.getItem('odcat_case_appeals') || '[]');
  const appealIdx = appeals.findIndex(a => a.id === appealId);

  if (appealIdx === -1) {
    throw new Error('Appeal not found');
  }

  const appeal = appeals[appealIdx];
  const users = getAllUsersSync();
  const caseUserIdx = users.findIndex(u => u.id === appeal.caseUserId);

  if (caseUserIdx === -1) {
    throw new Error('Case user not found');
  }

  const caseUser = users[caseUserIdx];

  if (decision === 'approved') {
    // Re-open case for review
    users[caseUserIdx].status = 'submitted';
    users[caseUserIdx].caseStatus = 'submitted';
    users[caseUserIdx].verificationStatus = 'submitted';
    users[caseUserIdx].hospitalReviewNotes = null;
    users[caseUserIdx].hospitalReviewedBy = null;
    users[caseUserIdx].hospitalReviewDate = null;
  } else if (decision === 'rejected') {
    // Case stays rejected, mark that appeal was rejected
    users[caseUserIdx].caseAppealRejected = true;
  }

  // Update appeal record
  appeals[appealIdx].status = decision === 'approved' ? 'approved' : 'rejected';
  appeals[appealIdx].hospitalReviewDate = new Date().toISOString();
  appeals[appealIdx].hospitalReviewedBy = reviewingHospitalUserId;
  appeals[appealIdx].hospitalReviewNotes = notes;

  localStorage.setItem('odcat_case_appeals', JSON.stringify(appeals));
  saveUsers(users);

  // Notify user
  const hospital = users.find(u => u.id === appeal.hospitalId);
  if (decision === 'approved') {
    createNotification(appeal.caseUserId, 'case_appeal', 'Appeal Approved', 'Your case appeal has been approved. Your case is now reopened for review.', { appealId });
  } else {
    createNotification(appeal.caseUserId, 'case_appeal', 'Appeal Rejected', `Your case appeal has been reviewed and rejected. ${notes ? 'Reason: ' + notes : ''}`, { appealId });
  }

  addActivity('case_appeal_reviewed', '⚖️', 'Case Appeal Reviewed', `Appeal for ${caseUser.name} was ${decision === 'approved' ? 'approved' : 'rejected'} by ${hospital?.hospitalName || 'hospital'}`, reviewingHospitalUserId);
};

// ===== DATA ENTRY FUNCTIONS =====

export const addDonorRecord = async (donorData, operatorId) => {
  const email = donorData.email || `donor-${Date.now()}@odcat.local`;
  const response = await API.registerViaAPI(
    donorData.name, email, 'Temp@1234', 'donor', donorData.phone || ''
  );
  const newUser = response.user;
  if (newUser?.id && (donorData.bloodType || donorData.pledgedOrgans)) {
    await API.updateUserViaAPI(newUser.id, {
      bloodType: donorData.bloodType,
      pledgedOrgans: donorData.pledgedOrgans || [],
      age: donorData.age ? parseInt(donorData.age) : null,
      gender: donorData.gender,
      address: donorData.address,
      medicalHistory: donorData.medicalHistory,
    });
  }
  return newUser;
};

export const addRecipientRecord = async (recipientData, operatorId) => {
  const email = recipientData.email || `recipient-${Date.now()}@odcat.local`;
  const response = await API.registerViaAPI(
    recipientData.name, email, 'Temp@1234', 'recipient', recipientData.phone || ''
  );
  const newUser = response.user;
  if (newUser?.id) {
    await API.updateUserViaAPI(newUser.id, {
      organNeeded: recipientData.organNeeded,
      diagnosis: recipientData.diagnosis,
      urgencyScore: recipientData.urgencyScore ? parseFloat(recipientData.urgencyScore) : null,
      comorbidity: recipientData.comorbidityScore ? parseFloat(recipientData.comorbidityScore) : null,
      bloodType: recipientData.bloodType,
      age: recipientData.age ? parseInt(recipientData.age) : null,
      gender: recipientData.gender,
      address: recipientData.address,
      medicalHistory: recipientData.medicalHistory,
    });
  }
  return newUser;
};
