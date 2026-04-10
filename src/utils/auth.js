// Authentication and User Management Utilities

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

// Get pending registrations (hospitals)
export const getPendingRegistrations = () => {
  const users = getAllUsers();
  return users.filter(u => u.status === 'pending' && u.registrationType === 'hospital_request');
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
