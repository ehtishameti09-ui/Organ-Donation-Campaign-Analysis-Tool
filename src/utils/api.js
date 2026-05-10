// API Service - Communicates with Laravel backend at localhost:8000
const API_BASE = 'http://localhost:8000/api';

// Helper to add auth token to requests
const getHeaders = (includeAuth = true) => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (includeAuth) {
    const token = localStorage.getItem('odcat_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
};

// Helper to handle API errors
const handleError = (error) => {
  if (error.response?.data?.message) {
    throw new Error(error.response.data.message);
  }
  if (error.response?.data?.errors) {
    const errors = error.response.data.errors;
    const messages = Object.values(errors).flat().join(', ');
    throw new Error(messages || 'Validation error');
  }
  throw error;
};

// ===== AUTH API CALLS =====

export const registerViaAPI = async (name, email, password, role, phone = '', extraData = {}) => {
  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({
      name,
      email,
      password,
      password_confirmation: password,
      role,
      phone,
      ...extraData,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    if (error.errors) {
      const first = Object.values(error.errors).flat()[0];
      throw new Error(first || error.message || 'Registration failed');
    }
    throw new Error(error.message || 'Registration failed');
  }

  const data = await response.json();
  localStorage.setItem('odcat_token', data.token);
  localStorage.setItem('odcat_user', JSON.stringify(data.user));
  return data;
};

export const loginViaAPI = async (email, password) => {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  const data = await response.json();
  // 2FA challenge — caller must complete it via verifyTwoFactorLoginCode
  if (data.requires_2fa) return data;

  localStorage.setItem('odcat_token', data.token);
  localStorage.setItem('odcat_user', JSON.stringify(data.user));
  return data;
};

// ===== TWO-FACTOR (EMAIL OTP) =====

export const verifyTwoFactorLoginCode = async (challengeToken, code) => {
  const response = await fetch(`${API_BASE}/2fa/email/verify`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Verification failed');
  localStorage.setItem('odcat_token', data.token);
  localStorage.setItem('odcat_user', JSON.stringify(data.user));
  return data;
};

export const resendTwoFactorLoginCode = async (challengeToken) => {
  const response = await fetch(`${API_BASE}/2fa/email/resend`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({ challenge_token: challengeToken }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to resend code');
  return data;
};

export const requestTwoFactorSetupCode = async () => {
  const response = await fetch(`${API_BASE}/2fa/email/request-setup`, {
    method: 'POST',
    headers: getHeaders(true),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to send setup code');
  return data;
};

export const confirmTwoFactorSetup = async (code) => {
  const response = await fetch(`${API_BASE}/2fa/email/confirm-setup`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Invalid code');
  return data;
};

export const disableTwoFactor = async (password) => {
  const response = await fetch(`${API_BASE}/2fa/email/disable`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to disable 2FA');
  return data;
};

export const logoutViaAPI = async () => {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: getHeaders(true),
    });
  } catch (error) {
    console.error('Logout API call failed:', error);
  }
  localStorage.removeItem('odcat_token');
  localStorage.removeItem('odcat_user');
};

export const getMeViaAPI = async () => {
  const response = await fetch(`${API_BASE}/me`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('odcat_token');
      localStorage.removeItem('odcat_user');
      throw new Error('Unauthenticated');
    }
    throw new Error('Failed to fetch user');
  }

  const data = await response.json();
  localStorage.setItem('odcat_user', JSON.stringify(data.user));
  return data.user;
};

export const verifyEmailViaAPI = async (id, hash) => {
  const response = await fetch(`${API_BASE}/email/verify/${id}/${hash}`, {
    method: 'POST',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Email verification failed');
  }

  return await response.json();
};

export const resendVerificationViaAPI = async () => {
  const response = await fetch(`${API_BASE}/email/resend-verification`, {
    method: 'POST',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Resend verification failed');
  }

  return await response.json();
};

// ===== PASSWORD RESET API CALLS =====

export const sendPasswordResetLinkViaAPI = async (email) => {
  const response = await fetch(`${API_BASE}/password-reset/send-link`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Password reset request failed');
  }

  return await response.json();
};

export const resetPasswordViaAPI = async (email, token, password) => {
  const response = await fetch(`${API_BASE}/password-reset/reset`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({
      email,
      token,
      password,
      password_confirmation: password,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Password reset failed');
  }

  return await response.json();
};

// ===== USER API CALLS =====

export const getUsersViaAPI = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/users${query ? '?' + query : ''}`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }

  return await response.json();
};

export const getUserViaAPI = async (userId) => {
  const response = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  return await response.json();
};

export const updateUserViaAPI = async (userId, data) => {
  const response = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'PATCH',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'User update failed');
  }

  return await response.json();
};

export const changePasswordViaAPI = async (userId, currentPassword, newPassword) => {
  const response = await fetch(`${API_BASE}/users/${userId}/change-password`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: newPassword,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Password change failed');
  }

  return await response.json();
};

// ===== DASHBOARD API CALLS =====

export const getDashboardMetricsViaAPI = async () => {
  const response = await fetch(`${API_BASE}/dashboard/metrics`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch dashboard metrics');
  }

  return await response.json();
};

export const createEmployeeViaAPI = async (payload) => {
  const r = await fetch(`${API_BASE}/users/create-employee`, {
    method: 'POST', headers: getHeaders(true), body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to create employee');
  }
  return await r.json();
};

export const getHospitalsOverviewViaAPI = async () => {
  const r = await fetch(`${API_BASE}/hospitals/overview`, { method: 'GET', headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch hospitals overview');
  return await r.json();
};

export const getDashboardSummaryViaAPI = async () => {
  const r = await fetch(`${API_BASE}/dashboard/summary`, {
    method: 'GET', headers: getHeaders(true),
  });
  if (!r.ok) throw new Error('Failed to fetch dashboard summary');
  return await r.json();
};

export const getDashboardChartDataViaAPI = async () => {
  const response = await fetch(`${API_BASE}/dashboard/chart-data`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch dashboard chart data');
  }

  return await response.json();
};

// ===== NOTIFICATIONS API CALLS =====

export const getNotificationsViaAPI = async (unreadOnly = false) => {
  const query = unreadOnly ? '?unread_only=1' : '';
  const response = await fetch(`${API_BASE}/notifications${query}`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch notifications');
  }

  return await response.json();
};

export const markNotificationReadViaAPI = async (notificationId) => {
  const response = await fetch(`${API_BASE}/notifications/${notificationId}/mark-read`, {
    method: 'PATCH',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to mark notification as read');
  }

  return await response.json();
};

export const markAllNotificationsReadViaAPI = async () => {
  const response = await fetch(`${API_BASE}/notifications/mark-all-read`, {
    method: 'POST',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to mark all notifications as read');
  }

  return await response.json();
};

// ===== HOSPITALS API CALLS =====

export const getHospitalsViaAPI = async (status = null) => {
  const url = status ? `${API_BASE}/hospitals?status=${status}` : `${API_BASE}/hospitals`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch hospitals');
  }

  return await response.json();
};

export const getPendingHospitalsViaAPI = async () => {
  const response = await fetch(`${API_BASE}/hospitals/pending`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch pending hospitals');
  }

  return await response.json();
};

// ===== HOSPITAL ACTION API CALLS =====

export const approveHospitalViaAPI = async (hospitalId, feedback = '') => {
  const response = await fetch(`${API_BASE}/hospitals/${hospitalId}/approve`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ feedback }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Approval failed');
  }
  return await response.json();
};

export const rejectHospitalViaAPI = async (hospitalId, reason) => {
  const response = await fetch(`${API_BASE}/hospitals/${hospitalId}/reject`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Rejection failed');
  }
  return await response.json();
};

export const requestHospitalInfoViaAPI = async (hospitalId, message) => {
  const response = await fetch(`${API_BASE}/hospitals/${hospitalId}/request-info`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Request failed');
  }
  return await response.json();
};

// ===== USER ACTION API CALLS =====

export const banUserViaAPI = async (userId, banData) => {
  const response = await fetch(`${API_BASE}/users/${userId}/ban`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(banData),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Ban failed');
  }
  return await response.json();
};

export const unbanUserViaAPI = async (userId) => {
  const response = await fetch(`${API_BASE}/users/${userId}/unban`, {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Unban failed');
  }
  return await response.json();
};

export const deleteUserViaAPI = async (userId, reason = 'Deleted by admin', category = 'OTHER') => {
  const response = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'DELETE',
    headers: getHeaders(true),
    body: JSON.stringify({ reason, category }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Delete failed');
  }
  return await response.json();
};

export const createAdminViaAPI = async (data) => {
  const response = await fetch(`${API_BASE}/users/create-admin`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Create admin failed');
  }
  return await response.json();
};

export const verifyDonorViaAPI = async (donorId, action, notes = '') => {
  const response = await fetch(`${API_BASE}/donors/${donorId}/verify`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ action, notes }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Verification failed');
  }
  return await response.json();
};

export const verifyRecipientViaAPI = async (recipientId, action, notes = '') => {
  const response = await fetch(`${API_BASE}/recipients/${recipientId}/verify`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ action, notes }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Verification failed');
  }
  return await response.json();
};

export const deleteSelfViaAPI = async (reason) => {
  const response = await fetch(`${API_BASE}/users/delete-self`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ reason, confirmation: 'DELETE' }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Account deletion failed');
  }
  return await response.json();
};

export const restoreSelfViaAPI = async () => {
  const response = await fetch(`${API_BASE}/users/restore-self`, {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Account restoration failed');
  }
  return await response.json();
};

export const getAppealsViaAPI = async () => {
  const response = await fetch(`${API_BASE}/appeals`, {
    method: 'GET',
    headers: getHeaders(true),
  });
  if (!response.ok) throw new Error('Failed to fetch appeals');
  return await response.json();
};

export const submitAppealViaAPI = async (userId, explanation, originalAction = 'ban') => {
  const response = await fetch(`${API_BASE}/appeals`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ user_id: userId, explanation, original_action: originalAction }),
  });
  if (!response.ok) {
    const err = await response.json();
    const first = err.errors ? Object.values(err.errors).flat()[0] : null;
    throw new Error(first || err.message || 'Appeal submission failed');
  }
  return await response.json();
};

export const reviewAppealViaAPI = async (appealId, decision, notes) => {
  const response = await fetch(`${API_BASE}/appeals/${appealId}/review`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ decision, notes }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Appeal review failed');
  }
  return await response.json();
};

export const getActionLogsViaAPI = async () => {
  const response = await fetch(`${API_BASE}/me/action-logs`, {
    method: 'GET',
    headers: getHeaders(true),
  });
  if (!response.ok) throw new Error('Failed to fetch action logs');
  return await response.json();
};

// ===== DOCUMENTS API CALLS =====

export const uploadDocumentsViaAPI = async (files, documentType, userId = null) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files[]', file);
  });
  formData.append('document_type', documentType);
  if (userId) {
    formData.append('user_id', userId);
  }

  const token = localStorage.getItem('odcat_token');
  const headers = {
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Document upload failed');
  }

  return await response.json();
};

export const getDocumentsViaAPI = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/documents${query ? '?' + query : ''}`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }

  return await response.json();
};

// ===== ACTIVITIES API CALLS =====

export const getActivitiesViaAPI = async () => {
  const response = await fetch(`${API_BASE}/activities`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch activities');
  }

  return await response.json();
};

// ===== DONORS API CALLS =====

export const getDonorsViaAPI = async () => {
  const response = await fetch(`${API_BASE}/donors`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch donors');
  }

  return await response.json();
};

export const completeDonorRegistrationViaAPI = async (data) => {
  const response = await fetch(`${API_BASE}/donors/complete-registration`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Donor registration completion failed');
  }

  return await response.json();
};

// ===== RECIPIENTS API CALLS =====

export const getRecipientsViaAPI = async () => {
  const response = await fetch(`${API_BASE}/recipients`, {
    method: 'GET',
    headers: getHeaders(true),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch recipients');
  }

  return await response.json();
};

export const completeRecipientRegistrationViaAPI = async (data) => {
  const response = await fetch(`${API_BASE}/recipients/complete-registration`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Recipient registration completion failed');
  }

  return await response.json();
};

// ===== ALLOCATION ENGINE (Module 4) =====

export const getAllocationPoliciesViaAPI = async () => {
  const r = await fetch(`${API_BASE}/allocation/policies`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch policies');
  return await r.json();
};

export const createAllocationPolicyViaAPI = async (payload) => {
  const r = await fetch(`${API_BASE}/allocation/policies`, {
    method: 'POST', headers: getHeaders(true), body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to create policy');
  }
  return await r.json();
};

export const activateAllocationPolicyViaAPI = async (id) => {
  const r = await fetch(`${API_BASE}/allocation/policies/${id}/activate`, {
    method: 'PATCH', headers: getHeaders(true),
  });
  if (!r.ok) throw new Error('Failed to activate policy');
  return await r.json();
};

export const getEligibleDonorsViaAPI = async () => {
  const r = await fetch(`${API_BASE}/allocation/eligible-donors`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch donors');
  return await r.json();
};

export const getPendingAllocationsViaAPI = async (page = 1, limit = 10) => {
  const r = await fetch(`${API_BASE}/allocation/pending-allocations?page=${page}&limit=${limit}`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch pending allocations');
  return await r.json();
};

export const runAllocationViaAPI = async (payload) => {
  const r = await fetch(`${API_BASE}/allocation/run`, {
    method: 'POST', headers: getHeaders(true), body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to run allocation');
  }
  return await r.json();
};

export const simulateAllocationViaAPI = async (payload) => {
  const r = await fetch(`${API_BASE}/allocation/simulate`, {
    method: 'POST', headers: getHeaders(true), body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to run simulation');
  }
  return await r.json();
};

export const getAllocationRunsViaAPI = async () => {
  const r = await fetch(`${API_BASE}/allocation/runs`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch runs');
  return await r.json();
};

export const getAllocationRunViaAPI = async (id) => {
  const r = await fetch(`${API_BASE}/allocation/runs/${id}`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch run');
  return await r.json();
};

// ===== Admin Requests (hospital → super_admin) =====

export const submitAdminRequestViaAPI = async (payload) => {
  const r = await fetch(`${API_BASE}/admin-requests`, {
    method: 'POST', headers: getHeaders(true), body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to submit admin request');
  }
  return await r.json();
};

export const getAdminRequestsViaAPI = async (status = null) => {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const r = await fetch(`${API_BASE}/admin-requests${q}`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch admin requests');
  return await r.json();
};

export const approveAdminRequestViaAPI = async (id, password, reviewNotes = null) => {
  const r = await fetch(`${API_BASE}/admin-requests/${id}/approve`, {
    method: 'POST', headers: getHeaders(true),
    body: JSON.stringify({ password, review_notes: reviewNotes }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to approve request');
  }
  return await r.json();
};

export const rejectAdminRequestViaAPI = async (id, reviewNotes) => {
  const r = await fetch(`${API_BASE}/admin-requests/${id}/reject`, {
    method: 'POST', headers: getHeaders(true),
    body: JSON.stringify({ review_notes: reviewNotes }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to reject request');
  }
  return await r.json();
};

export const cancelAdminRequestViaAPI = async (id) => {
  const r = await fetch(`${API_BASE}/admin-requests/${id}`, {
    method: 'DELETE', headers: getHeaders(true),
  });
  if (!r.ok) throw new Error('Failed to cancel request');
  return await r.json();
};

// ===== Module 5 — Matching & Override Governance =====

export const getCompatibilityMatrixViaAPI = async () => {
  const r = await fetch(`${API_BASE}/allocation/compatibility-matrix`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch compatibility matrix');
  return await r.json();
};

export const getHospitalDistancesViaAPI = async () => {
  const r = await fetch(`${API_BASE}/allocation/hospital-distances`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch hospital distances');
  return await r.json();
};

export const createAllocationDecisionViaAPI = async (payload) => {
  const r = await fetch(`${API_BASE}/allocation/decisions`, {
    method: 'POST', headers: getHeaders(true), body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const msg = e.errors?.override_reason?.[0] || e.message || 'Failed to record decision';
    throw new Error(msg);
  }
  return await r.json();
};

export const getAllocationDecisionsViaAPI = async () => {
  const r = await fetch(`${API_BASE}/allocation/decisions`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch decisions');
  return await r.json();
};

export const getOverrideStatsViaAPI = async () => {
  const r = await fetch(`${API_BASE}/allocation/override-stats`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch override stats');
  return await r.json();
};

// ===== Module 6 — Fairness Lab =====

export const getFairnessOverviewViaAPI = async (k = 5, threshold = 15) => {
  const r = await fetch(`${API_BASE}/allocation/fairness-overview?k=${k}&threshold=${threshold}`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to fetch fairness overview');
  return await r.json();
};

export const getFairnessReportViaAPI = async (runId, k = 5, threshold = 15) => {
  const r = await fetch(`${API_BASE}/allocation/runs/${runId}/fairness?k=${k}&threshold=${threshold}`, { headers: getHeaders(true) });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || 'Failed to compute fairness');
  }
  return await r.json();
};

export const getSensitivityReportViaAPI = async (runId, k = 5) => {
  const r = await fetch(`${API_BASE}/allocation/runs/${runId}/sensitivity?k=${k}`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to compute sensitivity');
  return await r.json();
};

export const downloadAllocationCsv = async (runId) => {
  const r = await fetch(`${API_BASE}/allocation/runs/${runId}/export.csv`, { headers: getHeaders(true) });
  if (!r.ok) throw new Error('Failed to download CSV');
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `allocation_run_${runId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export default {
  registerViaAPI,
  loginViaAPI,
  logoutViaAPI,
  getMeViaAPI,
  verifyEmailViaAPI,
  resendVerificationViaAPI,
  sendPasswordResetLinkViaAPI,
  resetPasswordViaAPI,
  getUsersViaAPI,
  getUserViaAPI,
  updateUserViaAPI,
  changePasswordViaAPI,
  getDashboardMetricsViaAPI,
  getDashboardChartDataViaAPI,
  getNotificationsViaAPI,
  markNotificationReadViaAPI,
  markAllNotificationsReadViaAPI,
  getHospitalsViaAPI,
  getPendingHospitalsViaAPI,
  approveHospitalViaAPI,
  rejectHospitalViaAPI,
  requestHospitalInfoViaAPI,
  banUserViaAPI,
  unbanUserViaAPI,
  deleteUserViaAPI,
  createAdminViaAPI,
  verifyDonorViaAPI,
  verifyRecipientViaAPI,
  deleteSelfViaAPI,
  restoreSelfViaAPI,
  getAppealsViaAPI,
  submitAppealViaAPI,
  reviewAppealViaAPI,
  getActionLogsViaAPI,
  uploadDocumentsViaAPI,
  getDocumentsViaAPI,
  getActivitiesViaAPI,
  getDonorsViaAPI,
  completeDonorRegistrationViaAPI,
  getRecipientsViaAPI,
  completeRecipientRegistrationViaAPI,
  verifyTwoFactorLoginCode,
  resendTwoFactorLoginCode,
  requestTwoFactorSetupCode,
  confirmTwoFactorSetup,
  disableTwoFactor,
};
