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
  localStorage.setItem('odcat_token', data.token);
  localStorage.setItem('odcat_user', JSON.stringify(data.user));
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
};
