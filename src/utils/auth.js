// Authentication and User Management Utilities

// Utility: Calculate age from date of birth
export const calculateAgeFromDOB = (dobString) => {
  if (!dobString) return '';
  try {
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age >= 0 ? age : '';
  } catch {
    return '';
  }
};

// Initialize Super Admin if not exists
export const initSuperAdmin = () => {
  let users = JSON.parse(localStorage.getItem('odcat_users') || '[]');
  let creds = JSON.parse(localStorage.getItem('odcat_creds') || '{}');
  const needsInit = !users.some(u => u.role === 'super_admin');

  if (needsInit) {
    users = [];
    creds = {};
  }

  // Always ensure demo credentials exist and are up to date
  if (!users.some(u => u.email === 'admin@odcat.com')) {
    users.push({ 
      id:'super-admin-1', 
      email:'admin@odcat.com', 
      name:'Super Administrator', 
      role:'super_admin', 
      status:'approved', 
      registrationDate: new Date().toISOString() 
    });
    creds['admin@odcat.com'] = 'Admin@123';
  }
  
  if (!users.some(u => u.email === 'dr.ali@odcat.com')) {
    users.push({ 
      id:'admin-1', 
      email:'dr.ali@odcat.com', 
      name:'Dr. Ali Hassan', 
      role:'admin', 
      status:'approved', 
      registrationDate: new Date().toISOString() 
    });
    creds['dr.ali@odcat.com'] = 'Admin@123';
  }
  
  if (!users.some(u => u.email === 'cmh@odcat.com')) {
    users.push({ 
      id:'hospital-1', 
      email:'cmh@odcat.com', 
      name:'CMH Coordinator', 
      role:'hospital', 
      status:'approved', 
      hospitalName:'Combined Military Hospital', 
      registrationDate: new Date().toISOString() 
    });
    creds['cmh@odcat.com'] = 'Hospital@123';
  }

  if (!users.some(u => u.email === 'ahmed.khan@odcat.com')) {
    users.push({
      id: 'donor-1',
      email: 'ahmed.khan@odcat.com',
      name: 'Ahmed Raza Khan',
      role: 'donor',
      status: 'approved',
      bloodType: 'B+',
      age: 28,
      medicalHistory: 'No previous medical conditions. Regular health checkups.',
      registrationDate: new Date(2026, 1, 15).toISOString(),
      registrationType: 'user_self',
      verificationStatus: 'active',
      documentsUploaded: 3,
      documentsTotal: 4,
      unreadNotifications: 2
    });
    creds['ahmed.khan@odcat.com'] = 'Donor@123';
  }

  if (!users.some(u => u.email === 'nadia.qureshi@odcat.com')) {
    users.push({
      id: 'recipient-1',
      email: 'nadia.qureshi@odcat.com',
      name: 'Nadia Qureshi',
      role: 'recipient',
      status: 'approved',
      age: 34,
      organNeeded: 'kidney',
      medicalHistory: 'End-stage renal disease (ESRD). Diagnosed 5 years ago.',
      registrationDate: new Date(2025, 9, 15).toISOString(),
      registrationType: 'user_self',
      caseStatus: 'eligible',
      daysOnWaitlist: 67,
      urgencyScore: 7.2,
      survivalEstimate: '77%',
      diagnosis: 'End-stage renal disease (ESRD)',
      urgency: 7.2,
      comorbidity: 3.5,
      unreadNotifications: 0
    });
    creds['nadia.qureshi@odcat.com'] = 'Recipient@123';
  }

  // Doctor demo account
  if (!users.some(u => u.email === 'dr.farah@odcat.com')) {
    users.push({
      id: 'doctor-1',
      email: 'dr.farah@odcat.com',
      name: 'Dr. Farah Malik',
      role: 'doctor',
      status: 'approved',
      department: 'Nephrology',
      hospitalId: 'hospital-1',
      hospitalName: 'Combined Military Hospital',
      specialization: 'Kidney Transplant',
      registrationDate: new Date(2025, 6, 1).toISOString(),
    });
    creds['dr.farah@odcat.com'] = 'Doctor@123';
  }

  // Data Entry Operator demo account
  if (!users.some(u => u.email === 'entry@odcat.com')) {
    users.push({
      id: 'data_entry-1',
      email: 'entry@odcat.com',
      name: 'Bilal Ahmed',
      role: 'data_entry',
      status: 'approved',
      hospitalId: 'hospital-1',
      hospitalName: 'Combined Military Hospital',
      registrationDate: new Date(2025, 8, 10).toISOString(),
    });
    creds['entry@odcat.com'] = 'Entry@123';
  }

  // Auditor demo account
  if (!users.some(u => u.email === 'auditor@odcat.com')) {
    users.push({
      id: 'auditor-1',
      email: 'auditor@odcat.com',
      name: 'Sana Raza',
      role: 'auditor',
      status: 'approved',
      registrationDate: new Date(2025, 5, 20).toISOString(),
    });
    creds['auditor@odcat.com'] = 'Auditor@123';
  }

  localStorage.setItem('odcat_users', JSON.stringify(users));
  localStorage.setItem('odcat_creds', JSON.stringify(creds));
};

// Login function
export const login = (email, password) => {
  const users = JSON.parse(localStorage.getItem('odcat_users') || '[]');
  const creds = JSON.parse(localStorage.getItem('odcat_creds') || '{}');
  
  if (creds[email] !== password) return null;
  
  const user = users.find(u => u.email === email);
  if (!user) return null;

  // Prevent banned or deleted users from logging in
  if (user.banned || user.deleted) {
    return null;
  }
  
  // Allow hospital logins even if pending approval
  localStorage.setItem('odcat_current', JSON.stringify(user));
  return user;
};

// Get current user
export const getCurrentUser = () => {
  const s = localStorage.getItem('odcat_current');
  return s ? JSON.parse(s) : null;
};

// Logout
export const logout = () => {
  localStorage.removeItem('odcat_current');
};

// Get all users
export const getAllUsers = () => {
  return JSON.parse(localStorage.getItem('odcat_users') || '[]');
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

// Update user status
export const updateUserStatus = (id, status) => {
  let users = getAllUsers();
  const i = users.findIndex(u => u.id === id);
  if (i !== -1) {
    users[i].status = status;
    saveUsers(users);
  }
};

// Delete user by ID
export const deleteUserById = (id) => {
  let users = getAllUsers();
  users = users.filter(u => u.id !== id);
  saveUsers(users);
};

// Register new user (donor, recipient, or hospital request)
export const registerUser = (registrationData) => {
  let users = getAllUsers();
  let creds = getCreds();

  if (registrationData.type === 'hospital') {
    // Hospital registration needs admin approval
    users.push({
      id: 'hospital-pending-' + Date.now(),
      email: registrationData.email,
      name: registrationData.contactPerson,
      hospitalName: registrationData.hospitalName,
      role: 'hospital',
      status: 'pending',
      registrationNumber: registrationData.registrationNumber,
      licenseNumber: registrationData.licenseNumber,
      hospitalAddress: registrationData.hospitalAddress,
      phone: registrationData.phone,
      uploadedDocuments: registrationData.uploadedDocuments || [],
      registrationDate: new Date().toISOString(),
      registrationType: 'hospital_request'
    });
  } else {
    // Donor/Recipient auto-approved
    users.push({
      id: registrationData.type + '-' + Date.now(),
      email: registrationData.email,
      name: registrationData.name,
      role: registrationData.type,
      status: 'approved',
      bloodType: registrationData.bloodType || null,
      age: registrationData.age || null,
      medicalHistory: registrationData.medicalHistory || null,
      organNeeded: registrationData.organNeeded || null,
      registrationDate: new Date().toISOString(),
      registrationType: 'user_self'
    });
  }

  // Save password
  creds[registrationData.email] = registrationData.password;

  saveUsers(users);
  saveCreds(creds);
};

// Get pending registrations (hospitals) — includes pending and info_requested
export const getPendingRegistrations = () => {
  const users = getAllUsers();
  return users.filter(u =>
    (u.status === 'pending' || u.status === 'info_requested') &&
    u.registrationType === 'hospital_request'
  );
};

// Approve registration with optional feedback
export const approveRegistration = (id, feedback = '') => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx !== -1) {
    users[idx].status = 'approved';
    if (feedback) users[idx].adminFeedback = feedback;
    saveUsers(users);
  }
};

// Reject registration with feedback
export const rejectRegistration = (id, reason = '') => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx !== -1) {
    users[idx].status = 'rejected';
    if (reason) users[idx].rejectionReason = reason;
    saveUsers(users);
  }
};

// Request additional info from hospital
export const requestAdditionalInfo = (id, message = '') => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx !== -1) {
    users[idx].status = 'info_requested';
    if (message) users[idx].adminMessage = message;
    saveUsers(users);
  }
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

// Notification system
export const createNotification = (userId, type, title, message, data = {}) => {
  let notifications = JSON.parse(localStorage.getItem('odcat_notifications') || '[]');
  notifications.push({
    id: 'notif-' + Date.now(),
    userId,
    type, // 'ban', 'delete', 'appeal_status', 'warning', 'info'
    title,
    message,
    data,
    timestamp: new Date().toISOString(),
    read: false
  });
  localStorage.setItem('odcat_notifications', JSON.stringify(notifications));
};

export const getNotifications = (userId) => {
  const notifications = JSON.parse(localStorage.getItem('odcat_notifications') || '[]');
  return notifications.filter(n => n.userId === userId);
};

export const getUnreadNotifications = (userId) => {
  const notifications = getNotifications(userId);
  return notifications.filter(n => !n.read);
};

export const markNotificationRead = (notificationId) => {
  let notifications = JSON.parse(localStorage.getItem('odcat_notifications') || '[]');
  const idx = notifications.findIndex(n => n.id === notificationId);
  if (idx !== -1) {
    notifications[idx].read = true;
    localStorage.setItem('odcat_notifications', JSON.stringify(notifications));
  }
};

// Log user actions (ban, delete, appeal, etc.)
export const logUserAction = (userId, actionType, reason, actionDetails = {}) => {
  let logs = JSON.parse(localStorage.getItem('odcat_action_logs') || '[]');
  logs.push({
    id: 'log-' + Date.now(),
    userId,
    actionType, // 'ban', 'delete', 'appeal_submitted', 'appeal_reviewed', 'ban_reversed', etc.
    reason,
    actionDetails,
    timestamp: new Date().toISOString(),
    adminId: actionDetails.adminId || null,
    reviewAdminId: actionDetails.reviewAdminId || null
  });
  localStorage.setItem('odcat_action_logs', JSON.stringify(logs));
};

// Get all action logs
export const getActionLogs = () => {
  return JSON.parse(localStorage.getItem('odcat_action_logs') || '[]');
};

// Get action logs for a specific user
export const getUserActionLogs = (userId) => {
  const logs = getActionLogs();
  return logs.filter(log => log.userId === userId);
};

// Ban a user (with structured reason and categories)
export const banUser = (userId, category, detailedReason, banType = 'temporary', duration = 30, adminId) => {
  if (!category || !Object.keys(BAN_CATEGORIES).includes(category)) {
    throw new Error('Valid ban category is required');
  }

  if (!detailedReason || !detailedReason.trim()) {
    throw new Error('Detailed explanation is required');
  }

  let users = getAllUsers();
  const userIdx = users.findIndex(u => u.id === userId);
  
  if (userIdx === -1) return false;

  const banDate = new Date().toISOString();
  const banDetails = {
    category,
    categoryLabel: BAN_CATEGORIES[category].label,
    detailedReason,
    banType, // 'warning', 'temporary', 'permanent'
    duration: banType === 'temporary' ? duration : null,
    banDate,
    adminId,
    expiryDate: banType === 'temporary' ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString() : null
  };

  users[userIdx].banned = true;
  users[userIdx].banDetails = banDetails;
  users[userIdx].status = banType === 'warning' ? 'warned' : 'banned';

  saveUsers(users);

  // Create notification
  const banTypeLabel = banType === 'warning' ? 'Warning' : banType === 'temporary' ? `${duration}-day ban` : 'permanent ban';
  createNotification(
    userId,
    'ban',
    `Account ${banTypeLabel}`,
    `Your account has received a ${banTypeLabel}. Reason: ${BAN_CATEGORIES[category].label}. ${banType !== 'warning' ? 'You can appeal within 30 days.' : 'Please review our policies to avoid future violations.'}`,
    { category, duration, adminId, appealable: banType !== 'warning' }
  );

  logUserAction(userId, 'user_banned', detailedReason, {
    adminId,
    category,
    banType,
    duration
  });

  return true;
};

// Soft delete user (mark as deleted instead of removing)
export const softDeleteUser = (userId, category, detailedReason, adminId) => {
  if (!category || !Object.keys(BAN_CATEGORIES).includes(category)) {
    throw new Error('Valid deletion category is required');
  }

  if (!detailedReason || !detailedReason.trim()) {
    throw new Error('Detailed explanation is required');
  }

  let users = getAllUsers();
  const userIdx = users.findIndex(u => u.id === userId);
  
  if (userIdx === -1) return false;

  users[userIdx].deleted = true;
  users[userIdx].deletionDetails = {
    category,
    categoryLabel: BAN_CATEGORIES[category].label,
    detailedReason,
    deletionDate: new Date().toISOString(),
    adminId
  };
  users[userIdx].status = 'deleted';

  saveUsers(users);

  // Create notification
  createNotification(
    userId,
    'delete',
    'Account Deleted',
    `Your account has been permanently deleted. Reason: ${BAN_CATEGORIES[category].label}. You can appeal within 30 days.`,
    { category, adminId, appealable: true }
  );

  logUserAction(userId, 'user_deleted', detailedReason, { adminId, category });

  return true;
};

// Submit an appeal
export const submitAppeal = (userId, explanation, evidence = {}) => {
  if (!explanation || !explanation.trim()) {
    throw new Error('Appeal explanation is required');
  }

  // Check if user is banned or deleted
  const users = getAllUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user || (!user.banned && !user.deleted)) {
    throw new Error('User is not banned or deleted');
  }

  // Check if already appealed recently
  const appeals = getAppeals();
  const recentAppeal = appeals.find(a => 
    a.userId === userId && 
    a.status === 'pending' &&
    new Date(a.submittedDate) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );

  if (recentAppeal) {
    throw new Error('You have a pending appeal. You can only submit one appeal every 30 days');
  }

  // Check if appeal deadline has passed (30 days)
  const actionDate = user.banned ? new Date(user.banDetails.banDate) : new Date(user.deletionDetails.deletionDate);
  const deadlineDate = new Date(actionDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (new Date() > deadlineDate) {
    throw new Error('Appeal deadline has passed (30 days from action date)');
  }

  let allAppeals = appeals;
  const appeal = {
    id: 'appeal-' + Date.now(),
    userId,
    explanation,
    evidence,
    submittedDate: new Date().toISOString(),
    status: 'pending', // 'pending', 'approved', 'denied', 'modified'
    originalAction: user.banned ? 'ban' : 'delete',
    originalCategory: user.banned ? user.banDetails.category : user.deletionDetails.category,
    originalReason: user.banned ? user.banDetails.detailedReason : user.deletionDetails.detailedReason,
    originalAdminId: user.banned ? user.banDetails.adminId : user.deletionDetails.adminId,
    reviewDate: null,
    reviewAdminId: null,
    reviewNotes: null,
    decision: null,
    adminResponseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Admin has 7 days to respond
  };

  allAppeals.push(appeal);
  localStorage.setItem('odcat_appeals', JSON.stringify(allAppeals));
  
  createNotification(userId, 'appeal_status', 'Appeal Submitted', 'Your appeal has been submitted and is pending review by an admin.', { appealId: appeal.id });
  
  logUserAction(userId, 'appeal_submitted', `Appeal submitted: ${explanation}`, {
    appealId: appeal.id
  });

  return appeal;
};

// Get all appeals
export const getAppeals = () => {
  return JSON.parse(localStorage.getItem('odcat_appeals') || '[]');
};

// Get appeals for a specific user
export const getUserAppeals = (userId) => {
  const appeals = getAppeals();
  return appeals.filter(a => a.userId === userId);
};

// Get pending appeals (for admin review)
export const getPendingAppeals = () => {
  const appeals = getAppeals();
  return appeals.filter(a => a.status === 'pending');
};

// Get overdue appeals (admin response deadline passed)
export const getOverdueAppeals = () => {
  const appeals = getPendingAppeals();
  return appeals.filter(a => new Date(a.adminResponseDeadline) < new Date());
};

// Review and decide on an appeal
export const reviewAppeal = (appealId, decision, notes, reviewAdminId) => {
  // decision: 'uphold', 'reverse', 'modify'
  if (!decision || !['uphold', 'reverse', 'modify'].includes(decision)) {
    throw new Error('Valid decision required: uphold, reverse, or modify');
  }

  if (!notes || !notes.trim()) {
    throw new Error('Review notes are required');
  }

  let appeals = getAppeals();
  const appealIdx = appeals.findIndex(a => a.id === appealId);
  
  if (appealIdx === -1) return false;

  const appeal = appeals[appealIdx];

  // Conflict of interest check: reviewing admin must be different from original admin
  if (appeal.originalAdminId === reviewAdminId) {
    throw new Error('You cannot review an appeal you created. Another admin must review this.');
  }

  appeals[appealIdx].status = decision === 'uphold' ? 'denied' : 'approved';
  appeals[appealIdx].reviewDate = new Date().toISOString();
  appeals[appealIdx].reviewAdminId = reviewAdminId;
  appeals[appealIdx].reviewNotes = notes;
  appeals[appealIdx].decision = decision;

  // If appeal is approved (reversed), remove ban/deletion
  if (decision === 'reverse') {
    let users = getAllUsers();
    const userIdx = users.findIndex(u => u.id === appeal.userId);
    if (userIdx !== -1) {
      users[userIdx].banned = false;
      users[userIdx].deleted = false;
      users[userIdx].status = 'approved';
      users[userIdx].banDetails = null;
      users[userIdx].deletionDetails = null;
      saveUsers(users);
    }

    createNotification(
      appeal.userId,
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

// User self-delete account
export const userSelfDeleteAccount = (userId, reason = '') => {
  let users = getAllUsers();
  const userIdx = users.findIndex(u => u.id === userId);

  if (userIdx === -1) return false;

  users[userIdx].deleted = true;
  users[userIdx].deletionDetails = {
    category: 'USER_SELF_DELETE',
    categoryLabel: 'User Self-Deletion',
    detailedReason: reason || 'User requested account deletion',
    deletionDate: new Date().toISOString(),
    adminId: null,
    isSelfDelete: true,
    recoveryDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days to recover
  };
  users[userIdx].status = 'deleted';

  saveUsers(users);

  createNotification(
    userId,
    'delete',
    'Account Deleted',
    `Your account has been marked for deletion. You can restore it within 30 days by logging in. After 30 days, your account will be permanently deleted.`,
    { isSelfDelete: true, recoveryDeadline: users[userIdx].deletionDetails.recoveryDeadline }
  );

  logUserAction(userId, 'user_self_deleted', reason || 'User deleted own account', {
    isSelfDelete: true
  });

  return true;
};

// Check if deleted account can be recovered
export const canRecoverDeletedAccount = (userId) => {
  const users = getAllUsers();
  const user = users.find(u => u.id === userId);

  if (!user || !user.deleted) return false;

  const deletionDetails = user.deletionDetails;
  if (!deletionDetails) return false;

  // Only self-deleted accounts can be recovered, not admin-deleted ones
  if (!deletionDetails.isSelfDelete && deletionDetails.adminId) return false;

  const deletionDate = new Date(deletionDetails.deletionDate);
  const recoveryDeadline = new Date(deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  return new Date() <= recoveryDeadline;
};

// Restore a soft-deleted account
export const restoreDeletedAccount = (userId) => {
  if (!canRecoverDeletedAccount(userId)) {
    throw new Error('This account cannot be recovered. Recovery period has expired or account was admin-deleted.');
  }

  let users = getAllUsers();
  const userIdx = users.findIndex(u => u.id === userId);

  if (userIdx === -1) return false;

  users[userIdx].deleted = false;
  users[userIdx].deletionDetails = null;
  users[userIdx].status = 'approved';

  saveUsers(users);

  createNotification(
    userId,
    'account_restored',
    'Account Restored',
    'Your account has been successfully restored. You can now access all your data.',
    {}
  );

  logUserAction(userId, 'account_restored', 'User restored their deleted account');

  return true;
};

// Auto-delete accounts after 30 days of soft-deletion
export const cleanupExpiredDeletedAccounts = () => {
  let users = getAllUsers();
  const now = new Date();
  let deletedCount = 0;

  users.forEach((user, idx) => {
    if (user.deleted && user.deletionDetails) {
      const deletionDate = new Date(user.deletionDetails.deletionDate);
      const expiryDate = new Date(deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (now > expiryDate) {
        // Permanently delete the account (remove from users array)
        users.splice(idx, 1);
        deletedCount++;

        // Log the auto-deletion
        logUserAction(user.id, 'account_auto_deleted', 'Account permanently deleted after 30-day recovery period expired', {
          originalDeletionDate: deletionDate.toISOString()
        });
      }
    }
  });

  if (deletedCount > 0) {
    saveUsers(users);
  }

  return deletedCount;
};

// ===== ACTIVITY TRACKING =====

export const addActivity = (type, icon, title, description, userId = null) => {
  let activities = JSON.parse(localStorage.getItem('odcat_activities') || '[]');
  activities.unshift({
    id: 'act-' + Date.now(),
    type,
    icon,
    title,
    description,
    userId,
    timestamp: new Date().toISOString()
  });
  // Keep only last 100 activities
  activities = activities.slice(0, 100);
  localStorage.setItem('odcat_activities', JSON.stringify(activities));
};

export const getRecentActivities = (limit = 20) => {
  const activities = JSON.parse(localStorage.getItem('odcat_activities') || '[]');
  return activities.slice(0, limit);
};

// ===== DONOR MANAGEMENT =====

export const getDonors = () => {
  return getAllUsers().filter(u => u.role === 'donor' && !u.deleted);
};

export const verifyDonor = (donorId, status, notes, adminId) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === donorId);
  if (idx === -1) return false;

  const prevStatus = users[idx].verificationStatus;
  users[idx].verificationStatus = status; // 'approved', 'rejected', 'under_review'
  users[idx].verificationNotes = notes;
  users[idx].verificationAdminId = adminId;
  users[idx].verificationDate = new Date().toISOString();

  if (status === 'approved') {
    users[idx].status = 'approved';
    users[idx].caseStatus = 'active';
    createNotification(donorId, 'info', 'Donor Verification Approved', 'Your donor registration has been verified and approved. You are now an active donor.', {});
    addActivity('donor_approved', '✅', 'Donor Verified', `${users[idx].name} has been verified as an active donor`, adminId);
  } else if (status === 'rejected') {
    users[idx].status = 'approved'; // keep account active but verification rejected
    createNotification(donorId, 'warning', 'Donor Verification Rejected', `Your donor verification was not approved. Reason: ${notes}`, {});
    addActivity('donor_rejected', '❌', 'Donor Verification Rejected', `${users[idx].name}'s donor verification was rejected`, adminId);
  } else if (status === 'under_review') {
    addActivity('donor_review', '🔍', 'Donor Under Review', `${users[idx].name}'s documents are under review`, adminId);
  }

  saveUsers(users);
  logUserAction(donorId, 'verification_status_changed', `Status changed from ${prevStatus} to ${status}`, { adminId, notes });
  return true;
};

export const updateDonorDocumentStatus = (donorId, docType, docStatus, adminId) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === donorId);
  if (idx === -1) return false;

  if (!users[idx].documentStatuses) users[idx].documentStatuses = {};
  users[idx].documentStatuses[docType] = { status: docStatus, reviewedBy: adminId, reviewedAt: new Date().toISOString() };
  saveUsers(users);
  return true;
};

export const getVerificationMetrics = () => {
  const donors = getDonors();
  const approved = donors.filter(d => d.verificationStatus === 'approved');
  const rejected = donors.filter(d => d.verificationStatus === 'rejected');
  const pending = donors.filter(d => !d.verificationStatus || d.verificationStatus === 'pending' || d.verificationStatus === 'under_review');

  // Calculate average approval time
  let totalTime = 0;
  let countWithTime = 0;
  approved.forEach(d => {
    if (d.registrationDate && d.verificationDate) {
      const diff = new Date(d.verificationDate) - new Date(d.registrationDate);
      totalTime += diff;
      countWithTime++;
    }
  });
  const avgApprovalMs = countWithTime > 0 ? totalTime / countWithTime : 0;
  const avgApprovalDays = Math.round(avgApprovalMs / (1000 * 60 * 60 * 24));

  const total = donors.length;
  const rejectionRate = total > 0 ? Math.round((rejected.length / total) * 100) : 0;

  return {
    total,
    approved: approved.length,
    rejected: rejected.length,
    pending: pending.length,
    avgApprovalDays: avgApprovalDays || 2,
    rejectionRate
  };
};

// ===== RECIPIENT MANAGEMENT =====

export const getRecipients = () => {
  return getAllUsers().filter(u => u.role === 'recipient' && !u.deleted);
};

export const getDonorsByHospital = (hospitalId) => {
  return getAllUsers().filter(u =>
    u.role === 'donor' && !u.deleted &&
    u.preferredHospitalId === hospitalId &&
    u.registrationComplete === true
  );
};

export const getRecipientsByHospital = (hospitalId) => {
  return getAllUsers().filter(u =>
    u.role === 'recipient' && !u.deleted &&
    u.preferredHospitalId === hospitalId &&
    u.registrationComplete === true
  );
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

export const updateRecipientCase = (recipientId, caseData, adminId) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === recipientId);
  if (idx === -1) return false;

  const survivalEstimate = calculateSurvivalEstimate(
    parseInt(caseData.age || users[idx].age || 30),
    parseFloat(caseData.urgencyScore || 5),
    parseFloat(caseData.comorbidityScore || 3)
  );

  users[idx] = {
    ...users[idx],
    ...caseData,
    survivalEstimate: survivalEstimate + '%',
    lastCaseUpdate: new Date().toISOString(),
    caseUpdatedBy: adminId
  };

  saveUsers(users);
  createNotification(recipientId, 'info', 'Case Updated', 'Your recipient case information has been updated by the medical team.', {});
  addActivity('recipient_updated', '📋', 'Recipient Case Updated', `${users[idx].name}'s case has been updated`, adminId);
  return true;
};

export const getWaitingTimeAnalytics = () => {
  const recipients = getRecipients();
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

export const getApprovedHospitals = () => {
  return getAllUsers().filter(u => u.role === 'hospital' && u.status === 'approved' && !u.deleted);
};

export const getRejectedHospitals = () => {
  return getAllUsers().filter(u => u.role === 'hospital' && u.status === 'rejected' && !u.deleted);
};

export const uploadAdditionalHospitalDocuments = (hospitalId, newDocuments) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === hospitalId);
  if (idx === -1) return false;

  const existing = users[idx].uploadedDocuments || [];
  const merged = [...existing];

  newDocuments.forEach(newDoc => {
    const existingIdx = merged.findIndex(d => d.documentType === newDoc.documentType);
    if (existingIdx !== -1) {
      // Replace existing document of same type
      merged[existingIdx] = { ...newDoc, uploadedAt: new Date().toISOString(), status: 'pending' };
    } else {
      merged.push({ ...newDoc, uploadedAt: new Date().toISOString(), status: 'pending' });
    }
  });

  users[idx].uploadedDocuments = merged;
  if (users[idx].status === 'info_requested') {
    users[idx].status = 'pending';
    users[idx].documentsResubmitted = true;
    users[idx].resubmissionDate = new Date().toISOString();
    createNotification(hospitalId, 'info', 'Documents Resubmitted', 'Your documents have been resubmitted for review.', {});
    addActivity('hospital_resubmit', '📤', 'Hospital Resubmitted Documents', `${users[idx].hospitalName} resubmitted documents`, hospitalId);
  }

  saveUsers(users);
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
  let users = getAllUsers();
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
export const registerBasicAccount = (name, email, password, role, phone = '') => {
  let users = getAllUsers();
  let creds = getCreds();

  if (users.some(u => u.email === email && !u.deleted)) {
    throw new Error('This email is already registered.');
  }

  const userId = role + '-' + Date.now();
  const newUser = {
    id: userId,
    email,
    name,
    phone: phone || null,
    role,
    status: 'registered', // basic account, not yet completed full registration
    registrationDate: new Date().toISOString(),
    registrationType: 'user_self',
    registrationComplete: false,
    consentSigned: false,
  };

  users.push(newUser);
  creds[email] = password;
  saveUsers(users);
  saveCreds(creds);

  // Activity log
  addActivity(
    role === 'donor' ? 'donor_account_created' : 'recipient_account_created',
    role === 'donor' ? '❤️' : '🏥',
    `New ${role === 'donor' ? 'Donor' : 'Recipient'} Account`,
    `${name} created a basic account and is yet to complete registration`,
    userId
  );

  // Welcome notification
  createNotification(
    userId,
    'welcome',
    `Welcome to ODCAT, ${name}!`,
    `Your account has been created. Please complete your ${role} registration to access all features.`,
    {}
  );

  return newUser;
};

// Phase 2: Complete donor/recipient registration (consent + clinical + docs + hospital)
export const completeDonorRecipientRegistration = (userId, payload) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('User not found');

  const user = users[idx];
  const role = user.role;

  // Save consent
  submitConsentForm(userId, role, {
    fullName: payload.fullName || user.name,
    cnic: payload.cnic,
    signature: payload.signature || user.name,
  });

  // Update user with all clinical data + docs + hospital choice
  users[idx] = {
    ...user,
    // Clinical data
    cnic: payload.cnic || null,
    dob: payload.dob || null,
    gender: payload.gender || null,
    bloodType: payload.bloodType || null,
    age: payload.age ? parseInt(payload.age) : null,
    phone: payload.phone || user.phone,
    address: payload.address || null,
    emergencyContactName: payload.emergencyContactName || null,
    emergencyContactPhone: payload.emergencyContactPhone || null,
    emergencyContactRelation: payload.emergencyContactRelation || null,
    medicalHistory: payload.medicalHistory || null,
    currentMedications: payload.currentMedications || null,
    // Donor-specific
    pledgedOrgans: payload.pledgedOrgans || null,
    donationType: payload.donationType || null,
    familyInformed: payload.familyInformed || false,
    nextOfKin: payload.nextOfKin || null,
    // Recipient-specific
    organNeeded: payload.organNeeded || null,
    diagnosis: payload.diagnosis || null,
    urgencyScore: payload.urgencyScore || null,
    treatingDoctor: payload.treatingDoctor || null,
    currentHospital: payload.currentHospital || null,
    // Documents
    uploadedDocuments: payload.documents || [],
    // Hospital assignment
    preferredHospitalId: payload.preferredHospitalId || null,
    preferredHospitalName: payload.preferredHospitalName || null,
    // Status
    status: 'submitted',
    caseStatus: 'submitted',
    verificationStatus: 'submitted',
    registrationComplete: true,
    consentSigned: true,
    consentDate: new Date().toISOString(),
    submissionDate: new Date().toISOString(),
  };

  saveUsers(users);

  // Notify the user
  createNotification(
    userId,
    'registration_submitted',
    '📤 Registration Submitted',
    `Your ${role} registration has been submitted to ${payload.preferredHospitalName || 'the selected hospital'} and is now under review.`,
    {}
  );

  // Notify the chosen hospital
  if (payload.preferredHospitalId) {
    createNotification(
      payload.preferredHospitalId,
      'new_case',
      `📋 New ${role === 'donor' ? 'Donor' : 'Recipient'} Case`,
      `${user.name} has submitted their ${role} registration for your review.`,
      { caseUserId: userId }
    );
  }

  // Activity log
  addActivity(
    role === 'donor' ? 'donor_submitted' : 'recipient_submitted',
    '📤',
    `${role === 'donor' ? 'Donor' : 'Recipient'} Registration Submitted`,
    `${user.name} completed registration and submitted to ${payload.preferredHospitalName || 'a hospital'}`,
    userId
  );

  return users[idx];
};

// Get cases assigned to a hospital (for hospital review dashboard)
export const getHospitalAssignedCases = (hospitalId) => {
  const users = getAllUsers();
  return users.filter(u =>
    (u.role === 'donor' || u.role === 'recipient') &&
    u.preferredHospitalId === hospitalId &&
    u.registrationComplete === true &&
    !u.deleted
  );
};

// Hospital reviews a case (approve / reject / request_info)
export const hospitalReviewCase = (caseUserId, action, notes, hospitalId) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === caseUserId);
  if (idx === -1) throw new Error('Case not found');

  const validActions = {
    approve: { status: 'approved', caseStatus: 'approved', verificationStatus: 'approved' },
    reject: { status: 'rejected', caseStatus: 'rejected', verificationStatus: 'rejected' },
    request_info: { status: 'info_requested', caseStatus: 'info_requested', verificationStatus: 'info_requested' },
  };

  const updates = validActions[action];
  if (!updates) throw new Error('Invalid action');

  users[idx] = {
    ...users[idx],
    ...updates,
    hospitalReviewNotes: notes || '',
    hospitalReviewedBy: hospitalId,
    hospitalReviewDate: new Date().toISOString(),
  };

  saveUsers(users);

  // Notify the user
  const titles = {
    approve: '✅ Registration Approved',
    reject: '❌ Registration Rejected',
    request_info: '📋 Additional Information Required',
  };

  const messages = {
    approve: `Your ${users[idx].role} registration has been approved by the hospital. You now have full access.${notes ? ` Note: ${notes}` : ''}`,
    reject: `Your ${users[idx].role} registration was not approved.${notes ? ` Reason: ${notes}` : ''}`,
    request_info: `The hospital needs additional information from you.${notes ? ` Details: ${notes}` : ''} Please go to your dashboard to resubmit.`,
  };

  createNotification(caseUserId, `case_${action}`, titles[action], messages[action], {});

  // Activity log
  const hospital = users.find(u => u.id === hospitalId);
  const hospitalName = hospital ? (hospital.hospitalName || hospital.name) : 'Hospital';
  const actionLabels = { approve: 'approved', reject: 'rejected', request_info: 'requested more info on' };
  addActivity(
    `case_${action}`,
    action === 'approve' ? '✅' : action === 'reject' ? '❌' : '📋',
    `Case ${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Info Requested'}`,
    `${hospitalName} ${actionLabels[action]} ${users[idx].name}'s ${users[idx].role} case`,
    hospitalId
  );

  return users[idx];
};

// User resubmits case with new info / docs after info_requested
export const resubmitCaseInfo = (userId, additionalData, newDocuments) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('User not found');

  const existingDocs = users[idx].uploadedDocuments || [];
  const mergedDocs = [...existingDocs];

  (newDocuments || []).forEach(newDoc => {
    const existingIdx = mergedDocs.findIndex(d => d.documentType === newDoc.documentType);
    if (existingIdx !== -1) {
      mergedDocs[existingIdx] = { ...newDoc, resubmittedAt: new Date().toISOString() };
    } else {
      mergedDocs.push({ ...newDoc, uploadedAt: new Date().toISOString() });
    }
  });

  users[idx] = {
    ...users[idx],
    ...additionalData,
    uploadedDocuments: mergedDocs,
    status: 'submitted',
    caseStatus: 'submitted',
    verificationStatus: 'submitted',
    resubmissionDate: new Date().toISOString(),
  };

  saveUsers(users);

  // Notify user
  createNotification(
    userId,
    'case_resubmitted',
    '📤 Information Resubmitted',
    'Your additional information has been submitted. The hospital will review it shortly.',
    {}
  );

  // Notify hospital
  if (users[idx].preferredHospitalId) {
    createNotification(
      users[idx].preferredHospitalId,
      'case_updated',
      '🔄 Case Updated',
      `${users[idx].name} has resubmitted their information for review.`,
      { caseUserId: userId }
    );
  }

  // Activity
  addActivity(
    'case_resubmitted',
    '📤',
    'Case Info Resubmitted',
    `${users[idx].name} resubmitted information after a request from the hospital`,
    userId
  );

  return users[idx];
};

// ===== ENHANCED HOSPITAL APPROVAL (with activity tracking) =====

export const approveRegistrationWithActivity = (id, feedback, adminId) => {
  approveRegistration(id, feedback);
  const users = getAllUsers();
  const hospital = users.find(u => u.id === id);
  if (hospital) {
    createNotification(id, 'info', '✅ Hospital Approved!',
      'Your hospital registration has been approved. You now have full access to the system.', {});
    addActivity('hospital_approved', '✅', 'Hospital Approved',
      `${hospital.hospitalName} has been approved`, adminId);
  }
};

export const rejectRegistrationWithActivity = (id, reason, adminId) => {
  rejectRegistration(id, reason);
  const users = getAllUsers();
  const hospital = users.find(u => u.id === id);
  if (hospital) {
    createNotification(id, 'warning', '❌ Hospital Registration Rejected',
      `Your registration was not approved. Reason: ${reason}`, {});
    addActivity('hospital_rejected', '❌', 'Hospital Rejected',
      `${hospital.hospitalName}'s registration was rejected`, adminId);
  }
};

export const requestAdditionalInfoWithActivity = (id, message, adminId) => {
  requestAdditionalInfo(id, message);
  const users = getAllUsers();
  const hospital = users.find(u => u.id === id);
  if (hospital) {
    createNotification(id, 'warning', '📋 Additional Information Required',
      `The admin has requested more information: ${message}`, {});
    addActivity('hospital_info_requested', '📋', 'More Info Requested',
      `Admin requested more info from ${hospital.hospitalName}`, adminId);
  }
};

// Password Reset Functions
export const requestPasswordReset = (email) => {
  const users = getAllUsers();
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
  const users = getAllUsers();
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

export const getEmployees = () => {
  return getAllUsers().filter(u =>
    ['doctor', 'data_entry', 'auditor', 'admin'].includes(u.role) && !u.deleted
  );
};

export const addEmployee = (employeeData, adminId) => {
  let users = getAllUsers();
  let creds = getCreds();

  if (users.some(u => u.email === employeeData.email && !u.deleted)) {
    throw new Error('This email is already registered.');
  }

  const userId = employeeData.role + '-' + Date.now();
  const newUser = {
    id: userId,
    email: employeeData.email,
    name: employeeData.name,
    role: employeeData.role,
    status: employeeData.status || 'approved',
    department: employeeData.department || null,
    hospitalId: employeeData.hospitalId || null,
    hospitalName: employeeData.hospitalName || null,
    specialization: employeeData.specialization || null,
    phone: employeeData.phone || null,
    registrationDate: new Date().toISOString(),
    addedBy: adminId,
  };

  users.push(newUser);
  creds[employeeData.email] = employeeData.password || 'Temp@1234';
  saveUsers(users);
  saveCreds(creds);

  addActivity('employee_added', '👤', 'Employee Added', `${employeeData.name} added as ${employeeData.role}`, adminId);
  return newUser;
};

export const updateEmployee = (employeeId, updates, adminId) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === employeeId);
  if (idx === -1) throw new Error('Employee not found');

  users[idx] = { ...users[idx], ...updates, lastUpdatedBy: adminId, lastUpdatedAt: new Date().toISOString() };
  saveUsers(users);
  addActivity('employee_updated', '✏️', 'Employee Updated', `${users[idx].name}'s profile updated`, adminId);
  return users[idx];
};

export const toggleEmployeeStatus = (employeeId, adminId) => {
  let users = getAllUsers();
  const idx = users.findIndex(u => u.id === employeeId);
  if (idx === -1) throw new Error('Employee not found');

  const newStatus = users[idx].status === 'suspended' ? 'approved' : 'suspended';
  users[idx].status = newStatus;
  users[idx].statusChangedBy = adminId;
  users[idx].statusChangedAt = new Date().toISOString();
  saveUsers(users);

  addActivity('employee_status', newStatus === 'suspended' ? '⏸️' : '▶️',
    `Employee ${newStatus === 'suspended' ? 'Suspended' : 'Reactivated'}`,
    `${users[idx].name} has been ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}`, adminId);

  createNotification(employeeId, 'info',
    newStatus === 'suspended' ? 'Account Suspended' : 'Account Reactivated',
    newStatus === 'suspended' ? 'Your account has been suspended by an administrator.' : 'Your account has been reactivated. You can now access the system.',
    {});

  return users[idx];
};

// ===== MULTI-ADMIN APPEAL SYSTEM =====

export const submitMultiAdminAppeal = (userId, explanation, evidence = {}) => {
  if (!explanation || !explanation.trim()) throw new Error('Appeal explanation is required');

  const users = getAllUsers();
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

    let users = getAllUsers();
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

export const getMultiAdminAppeals = () => {
  return getAppeals().filter(a => a.isMultiAdmin);
};

// ===== HOSPITAL CASE APPEAL SYSTEM =====

export const submitHospitalCaseAppeal = (caseUserId, appealText) => {
  const users = getAllUsers();
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
  const users = getAllUsers();
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

export const addDonorRecord = (donorData, operatorId) => {
  let users = getAllUsers();
  let creds = getCreds();

  const userId = 'donor-' + Date.now();
  const newDonor = {
    id: userId,
    email: donorData.email || `donor-${Date.now()}@odcat.local`,
    name: donorData.name,
    role: 'donor',
    status: 'approved',
    bloodType: donorData.bloodType || null,
    age: donorData.age ? parseInt(donorData.age) : null,
    gender: donorData.gender || null,
    phone: donorData.phone || null,
    address: donorData.address || null,
    medicalHistory: donorData.medicalHistory || null,
    organNeeded: null,
    pledgedOrgans: donorData.pledgedOrgans || [],
    registrationDate: new Date().toISOString(),
    registrationType: 'data_entry',
    addedBy: operatorId,
    verificationStatus: 'pending',
  };

  users.push(newDonor);
  creds[newDonor.email] = 'Temp@1234';
  saveUsers(users);
  saveCreds(creds);

  addActivity('donor_added_by_entry', '❤️', 'Donor Record Added', `${donorData.name} added by data entry operator`, operatorId);
  return newDonor;
};

export const addRecipientRecord = (recipientData, operatorId) => {
  let users = getAllUsers();
  let creds = getCreds();

  const userId = 'recipient-' + Date.now();
  const survivalEst = calculateSurvivalEstimate(
    parseInt(recipientData.age || 30),
    parseFloat(recipientData.urgencyScore || 5),
    parseFloat(recipientData.comorbidityScore || 3)
  );

  const newRecipient = {
    id: userId,
    email: recipientData.email || `recipient-${Date.now()}@odcat.local`,
    name: recipientData.name,
    role: 'recipient',
    status: 'approved',
    age: recipientData.age ? parseInt(recipientData.age) : null,
    gender: recipientData.gender || null,
    bloodType: recipientData.bloodType || null,
    phone: recipientData.phone || null,
    address: recipientData.address || null,
    organNeeded: recipientData.organNeeded || null,
    diagnosis: recipientData.diagnosis || null,
    medicalHistory: recipientData.medicalHistory || null,
    urgencyScore: parseFloat(recipientData.urgencyScore || 5),
    comorbidity: parseFloat(recipientData.comorbidityScore || 3),
    survivalEstimate: survivalEst + '%',
    registrationDate: new Date().toISOString(),
    registrationType: 'data_entry',
    addedBy: operatorId,
    caseStatus: 'registered',
    daysOnWaitlist: 0,
  };

  users.push(newRecipient);
  creds[newRecipient.email] = 'Temp@1234';
  saveUsers(users);
  saveCreds(creds);

  addActivity('recipient_added_by_entry', '🏥', 'Recipient Record Added', `${recipientData.name} added by data entry operator`, operatorId);
  return newRecipient;
};
