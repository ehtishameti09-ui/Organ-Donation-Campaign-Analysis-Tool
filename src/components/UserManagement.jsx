import { useState, useEffect, useMemo } from 'react';
import { getAllUsers, getPendingRegistrations, getApprovedHospitals, getRejectedHospitals, getHospitalAdmins, approveRegistrationWithActivity, rejectRegistrationWithActivity, requestAdditionalInfoWithActivity, banUser, softDeleteUser, unbanUser, restoreUser, getAppeals, getPendingAppeals, getOverdueAppeals, submitAppeal, reviewAppeal, getUserActionLogs, BAN_CATEGORIES, BAN_DURATIONS, getNotifications, validateEmail, validateName, addActivity, updateUserStatus, capitalizeName } from '../utils/auth';
import { createAdminViaAPI, getUsersViaAPI, getHospitalsOverviewViaAPI, reviewDocumentViaAPI } from '../utils/api';
import Pagination, { usePagination } from './Pagination';
import DocumentViewer from './DocumentViewer';
import { toast } from '../utils/toast';

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState(null);
  const [modalAction, setModalAction] = useState(''); // 'approve', 'reject', 'info'
  const [modalMessage, setModalMessage] = useState('');
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '', linkedHospitalId: '', linkedHospitalName: '' });
  const [hospitalTab, setHospitalTab] = useState('pending'); // 'pending' | 'approved' | 'rejected'
  const [approvedHospitals, setApprovedHospitals] = useState([]);
  const [rejectedHospitals, setRejectedHospitals] = useState([]);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewMode, setPreviewMode] = useState('normal'); // 'normal' | 'fullscreen' | 'minimized'
  const [docReviewBusy, setDocReviewBusy] = useState('');
  const [showBanModal, setShowBanModal] = useState(false);
  const [banModalData, setBanModalData] = useState({ userId: null, userName: null, category: '', detailedReason: '', banType: 'temporary', banDuration: 30 });
  const [appeals, setAppeals] = useState([]);
  const [showAppealReviewModal, setShowAppealReviewModal] = useState(false);
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [appealReviewData, setAppealReviewData] = useState({ decision: '', notes: '' });
  const [conflictOfInterestWarning, setConflictOfInterestWarning] = useState(null);
  // Category Selection Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalData, setCategoryModalData] = useState({ userId: null, userName: null, reason: '', action: 'delete' });
  const [selectedCategory, setSelectedCategory] = useState('');
  const [pendingRegistrations, setPendingRegistrations] = useState([]);

  useEffect(() => {
    loadUsers();
    loadAppeals();
    // Auto-refresh every 20s and on tab focus so new registrations / status changes appear live
    const intervalId = setInterval(() => { loadUsers(); loadAppeals(); }, 20000);
    const onFocus = () => { loadUsers(); loadAppeals(); };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Keyboard navigation for Category Modal
  useEffect(() => {
    if (!showCategoryModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCategoryModal(false);
      }
      if (e.key === 'Enter' && selectedCategory && categoryModalData.reason.trim()) {
        e.preventDefault();
        handleCategorySubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showCategoryModal, selectedCategory, categoryModalData]);

  // Keyboard navigation for Ban Modal
  useEffect(() => {
    if (!showBanModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowBanModal(false);
      }
      if (e.key === 'Enter' && banModalData.category && banModalData.detailedReason.trim()) {
        e.preventDefault();
        handleBanUser();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showBanModal, banModalData]);

  const loadUsers = async () => {
    // Super_admin only needs hospital lists + admin list — skip the heavy users-list fetch entirely.
    // For admin role, also load the users page (paginated 25/page server-side).
    const isSuperAdmin = currentUser.role === 'super_admin';

    const overviewPromise = getHospitalsOverviewViaAPI();
    const usersPromise = isSuperAdmin ? Promise.resolve([]) : getAllUsers();

    const [overview, u] = await Promise.all([overviewPromise, usersPromise]);
    setUsers(u || []);
    setApprovedHospitals(overview.approved || []);
    setPendingRegistrations(overview.pending || []);
    setRejectedHospitals(overview.rejected || []);
    setAdminUsers(overview.admins || []);
  };

  const loadAppeals = async () => {
    const allAppeals = await getPendingAppeals();
    setAppeals(allAppeals);
  };

  const handleApproveUser = async (id) => {
    try {
      await updateUserStatus(id, 'approved');
      toast('User approved successfully.', 'success');
      loadUsers();
    } catch (err) {
      toast(err.message || 'Failed to approve user.', 'error');
    }
  };

  const openBanModal = (userId, userName) => {
    setBanModalData({ userId, userName, category: '', detailedReason: '', banType: 'temporary', banDuration: 30 });
    setShowBanModal(true);
  };

  const handleBanUser = async () => {
    const { userId, userName, category, detailedReason, banType, banDuration } = banModalData;

    if (currentUser.linkedHospitalId) {
      const target = users.find(u => u.id === userId);
      const belongsToHospital = target?.preferredHospitalId === currentUser.linkedHospitalId ||
        target?.hospitalId === currentUser.linkedHospitalId;
      if (!belongsToHospital) {
        toast('Access denied. You can only manage users from your assigned hospital.', 'error');
        return;
      }
    }

    if (!category) { toast('Please select a violation category.', 'error'); return; }
    if (!detailedReason.trim()) { toast('Please provide a detailed explanation for the ban.', 'error'); return; }

    try {
      await banUser(userId, category, detailedReason, banType, banType === 'temporary' ? banDuration : null, currentUser.id);
      toast(`User "${userName}" has been ${banType === 'warning' ? 'warned' : 'banned'} successfully.`, 'success');
      setShowBanModal(false);
      setBanModalData({ userId: null, userName: null, category: '', detailedReason: '', banType: 'temporary', banDuration: 30 });
      loadUsers();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const handleDeleteUser = (userId, userName) => {
    // Open category selection modal
    setCategoryModalData({ userId, userName, reason: '', action: 'delete' });
    setSelectedCategory('');
    setShowCategoryModal(true);
  };

  const handleUnbanUser = async (userId, userName) => {
    if (!window.confirm(`Unban "${userName}"? They will be able to sign in again immediately.`)) return;
    try {
      await unbanUser(userId);
      toast(`"${userName}" has been unbanned.`, 'success');
      loadUsers();
    } catch (err) {
      toast(err.message || 'Unban failed.', 'error');
    }
  };

  const handleRestoreUser = async (userId, userName) => {
    if (!window.confirm(`Restore "${userName}"'s account? They will be able to sign in again immediately.`)) return;
    try {
      await restoreUser(userId);
      toast(`"${userName}" has been restored.`, 'success');
      loadUsers();
    } catch (err) {
      toast(err.message || 'Restore failed.', 'error');
    }
  };

  const handleCategorySubmit = async () => {
    if (!selectedCategory) { toast('Please select a violation category.', 'error'); return; }
    if (!categoryModalData.reason.trim()) { toast('Please enter a detailed reason.', 'error'); return; }

    if (currentUser.linkedHospitalId) {
      const target = users.find(u => u.id === categoryModalData.userId);
      const belongsToHospital = target?.preferredHospitalId === currentUser.linkedHospitalId ||
        target?.hospitalId === currentUser.linkedHospitalId;
      if (!belongsToHospital) {
        toast('Access denied. You can only manage users from your assigned hospital.', 'error');
        setShowCategoryModal(false);
        return;
      }
    }

    try {
      await softDeleteUser(categoryModalData.userId, selectedCategory, categoryModalData.reason, currentUser.id);
      toast(`User "${categoryModalData.userName}" has been deleted.`, 'success');
      setShowCategoryModal(false);
      loadUsers();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const handleReviewAppeal = (appeal) => {
    // Check for conflict of interest
    if ((appeal.original_admin_id || appeal.originalAdminId) === currentUser.id) {
      setConflictOfInterestWarning(true);
      return;
    }
    
    setConflictOfInterestWarning(false);
    setSelectedAppeal(appeal);
    setAppealReviewData({ decision: '', notes: '' });
    setShowAppealReviewModal(true);
  };

  const submitAppealReview = async () => {
    const { decision, notes } = appealReviewData;

    if (!decision) {
      toast('Please select a decision.', 'error');
      return;
    }

    if (!notes.trim()) {
      toast('Please provide review notes.', 'error');
      return;
    }

    try {
      await reviewAppeal(selectedAppeal.id, decision, notes, currentUser.id);
      const decisionLabel = decision === 'uphold' ? 'upheld' : decision === 'reverse' ? 'reversed (user reinstated)' : 'modified';
      toast(`Appeal has been ${decisionLabel}.`, 'success');
      setShowAppealReviewModal(false);
      setSelectedAppeal(null);
      loadAppeals();
      loadUsers();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  // Auth-aware document fetcher — handles both legacy base64 (doc.data) and new API URLs (doc.url)
  const fetchDocAsBlobUrl = async (doc) => {
    if (doc.data) return doc.data;  // legacy inline base64
    if (!doc.url) throw new Error('Document has no source');
    const token = localStorage.getItem('odcat_token');
    const r = await fetch(doc.url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Document fetch failed (${r.status})`);
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  };

  const downloadDoc = async (doc) => {
    try {
      const url = await fetchDocAsBlobUrl(doc);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name || 'document';
      a.click();
      if (!doc.data) setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const previewDoc = async (doc) => {
    try {
      const url = await fetchDocAsBlobUrl(doc);
      // Pass the resolved blob URL into the modal as `previewUrl` so the iframe/img can render it
      setPreviewDocument({ ...doc, _resolvedUrl: url });
      setShowDocumentPreview(true);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // Super admin approves/rejects an individual hospital document. On reject the
  // hospital is notified and can re-upload it from Account Settings.
  const reviewHospitalDoc = async (doc, status) => {
    let notes = '';
    if (status === 'rejected') {
      notes = window.prompt('Reason for rejecting this document (the hospital will see this and can re-upload):', '');
      if (notes === null) return;
      if (!notes.trim()) { toast('A reason is required to reject a document.', 'error'); return; }
    }
    setDocReviewBusy(doc.id);
    try {
      await reviewDocumentViaAPI(doc.id, status, notes);
      toast(`Document ${status === 'approved' ? 'approved' : 'rejected'}.`, 'success');
      // Refresh the hospital lists and the open modal so statuses update.
      const overview = await getHospitalsOverviewViaAPI();
      setApprovedHospitals(overview.approved || []);
      setPendingRegistrations(overview.pending || []);
      setRejectedHospitals(overview.rejected || []);
      setAdminUsers(overview.admins || []);
      const all = [...(overview.pending || []), ...(overview.approved || []), ...(overview.rejected || [])];
      setSelectedRegistration(prev => (prev ? (all.find(h => h.id === prev.id) || prev) : prev));
    } catch (e) {
      toast(e.message || 'Document review failed.', 'error');
    } finally {
      setDocReviewBusy('');
    }
  };

  const handleAddAdmin = async () => {
    const { name, email, password, linkedHospitalId, linkedHospitalName } = newAdmin;

    const nameCheck = validateName(name);
    if (!nameCheck.ok) { toast(nameCheck.error, 'error'); return; }

    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) { toast(emailCheck.error, 'error'); return; }

    if (!password || password.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }
    if (!/[A-Z]/.test(password)) { toast('Password must contain at least one uppercase letter.', 'error'); return; }
    if (!/[a-z]/.test(password)) { toast('Password must contain at least one lowercase letter.', 'error'); return; }
    if (!/[0-9]/.test(password)) { toast('Password must contain at least one number.', 'error'); return; }

    try {
      // Hospital-linked admins must come through the admin-request approval flow.
      await createAdminViaAPI({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        role: 'admin',
      });
      toast('System admin added successfully.', 'success');
      setShowAddModal(false);
      setNewAdmin({ name: '', email: '', password: '', linkedHospitalId: '', linkedHospitalName: '' });
      loadUsers();
    } catch (err) {
      toast(err.message || 'Failed to add admin.', 'error');
    }
  };

  const handleRegistrationAction = (registration, action) => {
    setSelectedRegistration(registration);
    setModalAction(action);
    setModalMessage('');
    setShowRegistrationModal(true);
  };

  const submitRegistrationAction = async () => {
    if (!selectedRegistration) return;

    try {
      if (modalAction === 'approve') {
        await approveRegistrationWithActivity(selectedRegistration.id, modalMessage, currentUser.id);
        toast('Hospital registration approved!', 'success');
      } else if (modalAction === 'reject') {
        if (!modalMessage) { toast('Please provide a reason for rejection.', 'error'); return; }
        await rejectRegistrationWithActivity(selectedRegistration.id, modalMessage, currentUser.id);
        toast('Hospital registration rejected.', 'info');
      } else if (modalAction === 'info') {
        if (!modalMessage) { toast('Please provide the information request.', 'error'); return; }
        await requestAdditionalInfoWithActivity(selectedRegistration.id, modalMessage, currentUser.id);
        toast('Additional information requested from hospital.', 'info');
      }
    } catch (e) {
      toast(e.message || 'Action failed.', 'error');
      return;
    }

    setShowRegistrationModal(false);
    setSelectedRegistration(null);
    loadUsers();
  };

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query) ||
      user.hospitalName?.toLowerCase().includes(query) ||
      user.status?.toLowerCase().includes(query) ||
      user.bloodType?.toLowerCase().includes(query) ||
      user.organNeeded?.toLowerCase().includes(query) ||
      user.registrationNumber?.toLowerCase().includes(query) ||
      user.phone?.toLowerCase().includes(query)
    );
  });

  // Hospital-scoped users for linked admins
  const scopedUsers = useMemo(() => {
    if (currentUser.role === 'admin' && currentUser.linkedHospitalId) {
      return filteredUsers.filter(u =>
        u.preferredHospitalId === currentUser.linkedHospitalId ||
        u.hospitalId === currentUser.linkedHospitalId ||
        (u.role === 'admin' && u.linkedHospitalId === currentUser.linkedHospitalId)
      );
    }
    return filteredUsers;
  }, [filteredUsers, currentUser]);

  const approvedUsers = scopedUsers.filter(u => u.status === 'approved');
  const rejectedUsers = scopedUsers.filter(u => u.status === 'rejected');
  const bannedUsers = scopedUsers.filter(u => u.banned === true);
  // The backend exposes the soft-delete flag as `isDeleted` (camelCase). The older `deleted`
  // key never existed on the API response, so the previous filter silently returned an empty list.
  const deletedUsers = scopedUsers.filter(u => u.isDeleted === true);

  // Pagination for each long list (10–15 per page so headers + pagination fit on screen)
  const pendingPg  = usePagination(pendingRegistrations, 10);
  const approvedPg = usePagination(approvedHospitals, 8);   // hospital registrations — each row expands to show admins
  const rejectedPg = usePagination(rejectedHospitals, 10);
  const appealsPg  = usePagination(appeals, 10);
  const approvedUsersPg = usePagination(approvedUsers, 10);
  const bannedPg   = usePagination(bannedUsers, 8);
  const deletedPg  = usePagination(deletedUsers, 8);

  // Tab state for the User Accounts card (Approved / Banned / Deleted)
  const [userListTab, setUserListTab] = useState('approved');

  return (
    <div>
      {currentUser.role === 'admin' && currentUser.linkedHospitalId && (
        <div style={{ background: 'var(--primary-light)', border: '1px solid rgba(26,92,158,.2)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🏥</span>
          <div>
            <div style={{ fontWeight: '600', fontSize: '14px' }}>Managing: {currentUser.linkedHospitalName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>You can only view and manage users associated with your hospital.</div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4" style={{ gap: '12px' }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: '480px' }}>
          <svg viewBox="0 0 24 24" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, role, hospital, blood type, organ, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {searchQuery && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearchQuery('')}>
              Clear
            </button>
          )}
          {currentUser.role === 'super_admin' && (
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              + Add Admin
            </button>
          )}
        </div>
      </div>

      {/* Hospital Management — Super Admin Only */}
      {currentUser.role === 'super_admin' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div className="card-title">🏥 Hospital Management</div>
            <div className="card-sub">Review and manage hospital registrations</div>
          </div>

          {/* Hospital Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', padding: '0 16px', marginTop: '12px' }}>
            {['pending', 'approved', 'rejected'].map(tab => (
              <button
                key={tab}
                onClick={() => setHospitalTab(tab)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: hospitalTab === tab ? '600' : '400',
                  color: hospitalTab === tab ? 'var(--primary)' : 'var(--text2)',
                  borderBottom: hospitalTab === tab ? '2px solid var(--primary)' : 'none',
                  marginBottom: '-1px'
                }}
              >
                {tab === 'pending' && `Pending & Action Required (${pendingRegistrations.length})`}
                {tab === 'approved' && `Approved (${approvedHospitals.length})`}
                {tab === 'rejected' && `Rejected (${rejectedHospitals.length})`}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            {/* Pending & Action Required Tab */}
            {hospitalTab === 'pending' && (
              <table>
                <thead>
                  <tr>
                    <th>Hospital</th>
                    <th>Registration #</th>
                    <th>Contact Person</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRegistrations.length > 0 ? (
                    pendingPg.slice.map(reg => (
                      <RegistrationRow
                        key={reg.id}
                        registration={reg}
                        onReview={() => handleRegistrationAction(reg, 'review')}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                        No pending registrations
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {hospitalTab === 'pending' && pendingRegistrations.length > 0 && (
              <div style={{ padding: '0 12px 12px' }}>
                <Pagination page={pendingPg.page} setPage={pendingPg.setPage} totalPages={pendingPg.totalPages} total={pendingPg.total} pageSize={pendingPg.pageSize} label="registrations" />
              </div>
            )}

            {/* Approved Hospitals Tab */}
            {hospitalTab === 'approved' && (
              <div className="scroll-list-lg" style={{ padding: '12px' }}>
                {approvedHospitals.length > 0 ? (
                  approvedPg.slice.map(hospital => {
                    const admins = adminUsers.filter(u => u.linkedHospitalId == hospital.id || u.linked_hospital_id == hospital.id);
                    return (
                      <div key={hospital.id} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '220px' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text1)', marginBottom: '4px' }}>
                              🏥 {hospital.hospitalName}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                              Reg #: <strong>{hospital.registrationNumber || '—'}</strong>
                              {' · '}
                              License: <strong>{hospital.licenseNumber || '—'}</strong>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '2px' }}>✓ Approved</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => handleRegistrationAction(hospital, 'view')}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              👁 View Details
                            </button>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'right', maxWidth: '180px' }}>
                              Admins are added via the<br/>
                              <strong>Admin Requests</strong> page<br/>
                              <span style={{ color: 'var(--text2)' }}>(hospital must request first)</span>
                            </div>
                          </div>
                        </div>

                        {/* Admin list under this hospital */}
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border)' }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text3)', marginBottom: '8px' }}>
                            👤 Assigned Admins ({admins.length})
                          </div>
                          {admins.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {admins.map(admin => (
                                <div key={admin.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '8px 12px', border: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
                                      {admin.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {admin.name}
                                      </div>
                                      <div style={{ fontSize: '11px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {admin.email}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="badge badge-green" style={{ flexShrink: 0 }}>Active</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic', padding: '8px 0' }}>
                              No admins assigned yet. Click "Assign Admin" to add one.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                    No approved hospitals
                  </div>
                )}
                {approvedHospitals.length > 0 && (
                  <Pagination page={approvedPg.page} setPage={approvedPg.setPage} totalPages={approvedPg.totalPages} total={approvedPg.total} pageSize={approvedPg.pageSize} label="hospitals" />
                )}
              </div>
            )}

            {/* Rejected Hospitals Tab */}
            {hospitalTab === 'rejected' && (
              <table>
                <thead>
                  <tr>
                    <th>Hospital</th>
                    <th>Registration #</th>
                    <th>Rejection Reason</th>
                    <th>Rejected</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedHospitals.length > 0 ? (
                    rejectedPg.slice.map(hospital => (
                      <tr key={hospital.id}>
                        <td>{hospital.hospitalName}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text2)' }}>{hospital.registrationNumber}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text2)' }}>{hospital.rejectionReason || 'No reason provided'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--danger)' }}>✗ Rejected</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-sm btn-outline" onClick={() => handleRegistrationAction(hospital, 'view')} style={{ whiteSpace: 'nowrap' }}>
                            👁 View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                        No rejected hospitals
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {hospitalTab === 'rejected' && rejectedHospitals.length > 0 && (
              <div style={{ padding: '0 12px 12px' }}>
                <Pagination page={rejectedPg.page} setPage={rejectedPg.setPage} totalPages={rejectedPg.totalPages} total={rejectedPg.total} pageSize={rejectedPg.pageSize} label="rejected" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Accounts — Admin Only — tabbed: Approved / Banned / Deleted */}
      {currentUser.role === 'admin' && (
      <div className="card">
        <div className="card-header">
          <div className="card-title">User Accounts</div>
          <div className="card-sub">Active, banned, and deleted user accounts</div>
        </div>

        {/* Tab bar */}
        <div role="tablist" style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid var(--border)',
          padding: '0 4px',
          marginBottom: '8px',
        }}>
          {[
            { id: 'approved', label: '✓ Approved', count: approvedUsers.length, accent: 'var(--accent)' },
            { id: 'banned',   label: '🚫 Banned',   count: bannedUsers.length,   accent: '#dc2626' },
            { id: 'deleted',  label: '🗑️ Deleted', count: deletedUsers.length,  accent: '#9333ea' },
          ].map(tab => {
            const active = userListTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setUserListTab(tab.id)}
                style={{
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${tab.accent}` : '2px solid transparent',
                  color: active ? tab.accent : 'var(--text2)',
                  cursor: 'pointer',
                  transition: 'color .15s, border-color .15s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: active ? tab.accent : 'var(--surface3)',
                  color: active ? '#fff' : 'var(--text3)',
                  minWidth: '20px',
                  textAlign: 'center',
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Approved tab content */}
        {userListTab === 'approved' && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedUsersPg.slice.length > 0 ? (
                    approvedUsersPg.slice.map(user => (
                      <UserRow
                        key={user.id}
                        user={user}
                        isSelf={user.id === currentUser.id}
                        currentUser={currentUser}
                        onBan={openBanModal}
                        onDelete={handleDeleteUser}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                        No approved users yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {approvedUsers.length > 0 && <Pagination {...approvedUsersPg} label="approved users" />}
          </>
        )}

        {/* Banned tab content */}
        {userListTab === 'banned' && (
          <>
            <div className="table-wrap">
              <table style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 10px' }}>User</th>
                    <th style={{ padding: '8px 10px' }}>Type</th>
                    <th style={{ padding: '8px 10px' }}>Reason</th>
                    <th style={{ padding: '8px 10px' }}>Banned</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedPg.slice.length > 0 ? bannedPg.slice.map(user => {
                    const bd = user.banDetails || {};
                    const banDateRaw = bd.banDate || bd.banned_at || null;
                    const banDate = banDateRaw ? new Date(banDateRaw) : null;
                    const validDate = banDate && !isNaN(banDate.getTime());
                    const expiryRaw = bd.expiryDate || null;
                    const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
                    const validExpiry = expiryDate && !isNaN(expiryDate.getTime());
                    const daysRemaining = validExpiry ? Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
                    const isPermanent = bd.banType === 'permanent';
                    const reason = bd.detailedReason || bd.reason || bd.categoryLabel || '—';
                    return (
                      <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: '600' }}>{user.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user.email}</div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span className={isPermanent ? 'badge badge-red' : 'badge badge-amber'} style={{ fontSize: '10px' }}>
                            {isPermanent ? 'Permanent' : 'Temporary'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text2)', maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={reason}>
                          {reason}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>
                          {validDate ? banDate.toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: '600', color: isPermanent ? 'var(--danger)' : daysRemaining > 0 ? 'var(--text1)' : 'var(--danger)' }}>
                          {isPermanent ? 'Permanent' : daysRemaining === null ? '—' : daysRemaining > 0 ? `${daysRemaining}d left` : 'Expired'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleUnbanUser(user.id, user.name)}
                            title="Reverse this ban and restore the account"
                            style={{ fontSize: '11px', padding: '4px 10px' }}
                          >
                            ✓ Unban
                          </button>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                        No banned users
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {bannedUsers.length > 0 && <Pagination {...bannedPg} label="banned users" />}
          </>
        )}

        {/* Deleted tab content */}
        {userListTab === 'deleted' && (
          <>
            <div className="table-wrap">
              <table style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 10px' }}>User</th>
                    <th style={{ padding: '8px 10px' }}>Role</th>
                    <th style={{ padding: '8px 10px' }}>Reason</th>
                    <th style={{ padding: '8px 10px' }}>Deleted</th>
                    <th style={{ padding: '8px 10px' }}>Recovery Window</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedPg.slice.length > 0 ? deletedPg.slice.map(user => {
                    const dd = user.deletionDetails || {};
                    const delDateRaw = dd.deletionDate || null;
                    const delDate = delDateRaw ? new Date(delDateRaw) : null;
                    const validDel = delDate && !isNaN(delDate.getTime());
                    const recDeadlineRaw = dd.recoveryDeadline || user.recoveryDeadline || null;
                    const recDeadline = recDeadlineRaw ? new Date(recDeadlineRaw) : null;
                    const daysLeft = recDeadline && !isNaN(recDeadline.getTime())
                      ? Math.ceil((recDeadline - new Date()) / (1000 * 60 * 60 * 24))
                      : null;
                    const reason = dd.reason || dd.detailedReason || '—';
                    return (
                      <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: '600' }}>{user.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user.email}</div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span className="badge badge-gray" style={{ fontSize: '10px' }}>{user.role.replace('_', ' ')}</span>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text2)', maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={reason}>
                          {reason}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>
                          {validDel ? delDate.toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: '600', color: daysLeft === null ? 'var(--text3)' : daysLeft > 0 ? 'var(--text1)' : 'var(--danger)' }}>
                          {daysLeft === null ? '—' : daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleRestoreUser(user.id, user.name)}
                            title="Reverse the deletion and restore the account"
                            disabled={daysLeft !== null && daysLeft <= 0}
                            style={{ fontSize: '11px', padding: '4px 10px' }}
                          >
                            ↺ Restore
                          </button>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                        No deleted users
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {deletedUsers.length > 0 && <Pagination {...deletedPg} label="deleted users" />}
          </>
        )}
      </div>
      )}

      {/* Rejected Users — Admin Only */}
      {currentUser.role === 'admin' && rejectedUsers.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <div className="card-title">✗ Rejected Registrations</div>
            <div className="card-sub">Hospitals with rejected applications</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hospital</th>
                  <th>Contact Person</th>
                  <th>Rejection Reason</th>
                  <th>Rejected Date</th>
                </tr>
              </thead>
              <tbody>
                {rejectedUsers.map(user => (
                  <tr key={user.id}>
                    <td><strong>{user.hospitalName || user.name}</strong></td>
                    <td>{user.contactPerson || user.email}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text2)' }}>
                      {user.rejectionReason || '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text3)' }}>
                      {user.registrationDate ? new Date(user.registrationDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Appeals — Admin Only */}
      {currentUser.role === 'admin' && appeals.length > 0 && (
        <div className="card" style={{ marginTop: '20px', borderColor: '#0891b2', background: '#ecf0f1' }}>
          <div className="card-header">
            <div className="card-title">⚖️ Pending Appeals ({appeals.length})</div>
            <div className="card-sub">User appeals awaiting admin review</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Original Action</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {appealsPg.slice.map(appeal => {
                  const user = users.find(u => u.id === (appeal.user_id || appeal.userId));
                  return (
                    <tr key={appeal.id}>
                      <td>
                        <strong>{user?.name || 'Unknown'}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user?.email || '—'}</div>
                      </td>
                      <td>
                        {(() => {
                          const act = appeal.original_action || appeal.originalAction;
                          const map = { ban: ['badge badge-red', 'Ban'], delete: ['badge badge-purple', 'Delete'], case_rejection: ['badge badge-amber', 'Case Rejected'] };
                          const [cls, label] = map[act] || ['badge', act];
                          return <span className={cls}>{label}</span>;
                        })()}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {new Date(appeal.submitted_date || appeal.submittedDate || appeal.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <span className="badge badge-amber">Pending Review</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleReviewAppeal(appeal)}
                        >
                          Review Appeal
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {appeals.length > 0 && (
              <div style={{ padding: '0 12px 12px' }}>
                <Pagination page={appealsPg.page} setPage={appealsPg.setPage} totalPages={appealsPg.totalPages} total={appealsPg.total} pageSize={appealsPg.pageSize} label="appeals" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Admin Modal */}
      {showAddModal && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Add Administrator</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  value={newAdmin.name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: capitalizeName(e.target.value) })}
                  placeholder="Dr. Sarah Ahmed"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  placeholder="admin@hospital.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  autoComplete="new-password"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div style={{
                marginTop: '8px', padding: '10px 12px',
                background: '#fff8e6', border: '1px solid #f0c14b',
                borderRadius: '6px', fontSize: '12px', color: '#7a5a00',
              }}>
                <strong>This will create a system-wide (unlinked) admin.</strong><br/>
                To create a hospital-linked admin, the hospital must submit a request via the
                <strong> Admin Requests </strong> page. Direct hospital assignment was removed for bias prevention.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddAdmin}>
                Create Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registration Action Modal */}
      {showRegistrationModal && selectedRegistration && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '560px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>
                {modalAction === 'view' ? '🏥 Hospital Details' : modalAction === 'approve' ? '✓ Approve Hospital' : modalAction === 'reject' ? '✗ Reject Application' : modalAction === 'info' ? 'ℹ️ Request Additional Info' : '🔍 Review Hospital Registration'}
              </h3>
              <button className="modal-close" onClick={() => setShowRegistrationModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{
                background: 'var(--surface2)',
                padding: '12px',
                borderRadius: 'var(--radius)',
                marginBottom: '16px',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '13px' }}>
                  {selectedRegistration.hospitalName}
                  {selectedRegistration.status && (() => {
                    const sMap = {
                      approved: ['badge-green', '✓ Approved'],
                      rejected: ['badge-red', '✗ Rejected'],
                      info_requested: ['badge-amber', 'Info Requested'],
                      pending: ['badge-blue', 'Pending'],
                    };
                    const [cls, lbl] = sMap[selectedRegistration.status] || ['badge-blue', selectedRegistration.status];
                    return <span className={`badge ${cls}`} style={{ marginLeft: '8px', fontSize: '10px' }}>{lbl}</span>;
                  })()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                  {[
                    ['Registration #', selectedRegistration.registrationNumber],
                    ['License #', selectedRegistration.licenseNumber],
                    ['Contact Person', selectedRegistration.contactPerson],
                    ['Official Email', selectedRegistration.email],
                    ['Phone', selectedRegistration.phone],
                    ['Submitted', selectedRegistration.registrationDate ? new Date(selectedRegistration.registrationDate).toLocaleDateString() : null],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ color: 'var(--text3)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>{label}</div>
                      <div style={{ color: 'var(--text1)', wordBreak: 'break-word' }}>{val || '—'}</div>
                    </div>
                  ))}
                </div>
                {selectedRegistration.hospitalAddress && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>Address</div>
                    <div style={{ color: 'var(--text1)' }}>{selectedRegistration.hospitalAddress}</div>
                  </div>
                )}
                {selectedRegistration.adminMessage && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--warning-light)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--warning)' }}>
                    <div style={{ color: 'var(--warning)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '2px' }}>You previously requested</div>
                    <div style={{ color: 'var(--text1)' }}>{selectedRegistration.adminMessage}</div>
                  </div>
                )}
              </div>

              {(() => {
                const docTypeLabels = {
                  registrationCertificate: 'Hospital Registration Certificate',
                  healthcareLicense: 'Healthcare License',
                  emailVerification: 'Official Email Verification',
                  basicDetailsForm: 'Basic Details Form',
                  other: 'Additional Document'
                };
                // One slot per document type — keep only the most recently
                // uploaded file for each type so older copies don't repeat.
                const latestByType = {};
                (selectedRegistration.uploadedDocuments || []).forEach(doc => {
                  const key = doc.documentType || 'other';
                  const prev = latestByType[key];
                  const t = new Date(doc.uploadedAt || 0).getTime();
                  const pt = prev ? new Date(prev.uploadedAt || 0).getTime() : -1;
                  if (!prev || t > pt || (t === pt && (doc.id || 0) > (prev.id || 0))) {
                    latestByType[key] = doc;
                  }
                });
                const docs = Object.values(latestByType);
                if (docs.length === 0) return (
                  <div style={{
                    background: 'var(--surface2)', padding: '14px', borderRadius: 'var(--radius)',
                    marginBottom: '16px', fontSize: '12px', color: 'var(--text3)',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span>📭</span> This hospital has not submitted any documents.
                  </div>
                );
                return (
                  <div style={{
                    background: 'var(--surface2)',
                    padding: '14px',
                    borderRadius: 'var(--radius)',
                    marginBottom: '16px',
                    fontSize: '12px'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📄</span> Attached Documents
                      <span style={{ color: 'var(--text3)', fontWeight: '400' }}>({docs.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {docs.map((doc, idx) => (
                        <div key={doc.id || idx} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)'
                        }}>
                          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => previewDoc(doc)}>
                            <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', marginBottom: '2px' }}>
                              {docTypeLabels[doc.documentType] || docTypeLabels.other}
                            </div>
                            <div style={{ color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.name}>
                              {doc.name}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                              {((doc.size || 0) / 1024 / 1024).toFixed(2)} MB
                              {doc.uploadedAt && ` • ${new Date(doc.uploadedAt).toLocaleDateString()}`}
                            </div>
                            {doc.status === 'rejected' && doc.reviewNotes && (
                              <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>
                                Reason: {doc.reviewNotes}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                            {(() => {
                              const st = doc.status || 'pending';
                              return (
                                <span className={`badge ${st === 'approved' ? 'badge-green' : st === 'rejected' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: '10px' }}>
                                  {st === 'approved' ? 'Approved' : st === 'rejected' ? 'Rejected' : 'Pending'}
                                </span>
                              );
                            })()}
                            <button type="button" className="btn btn-xs btn-outline" onClick={() => previewDoc(doc)} style={{ whiteSpace: 'nowrap' }}>
                              👁 View
                            </button>
                            <button type="button" className="btn btn-xs btn-outline" onClick={() => downloadDoc(doc)} style={{ whiteSpace: 'nowrap' }}>
                              ⬇ Download
                            </button>
                            {doc.status !== 'approved' && (
                              <button type="button" className="btn btn-xs btn-success" disabled={docReviewBusy === doc.id} onClick={() => reviewHospitalDoc(doc, 'approved')} style={{ whiteSpace: 'nowrap' }}>
                                {docReviewBusy === doc.id ? '…' : '✓ OK'}
                              </button>
                            )}
                            {doc.status !== 'rejected' && (
                              <button type="button" className="btn btn-xs btn-danger" disabled={docReviewBusy === doc.id} onClick={() => reviewHospitalDoc(doc, 'rejected')} style={{ whiteSpace: 'nowrap' }}>
                                {docReviewBusy === doc.id ? '…' : '✗ Reject'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Select Action — shown for the review flow (not the read-only view) */}
              {modalAction !== 'view' && (
                <div style={{ marginBottom: '4px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', fontWeight: '700', marginBottom: '10px' }}>
                    Select Action
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                    {[
                      { id: 'approve', label: '✓ Approve', color: 'var(--accent)' },
                      { id: 'info', label: '📋 Request Info', color: 'var(--warning)' },
                      { id: 'reject', label: '✗ Reject', color: 'var(--danger)' },
                    ].map(a => (
                      <button key={a.id} type="button"
                        onClick={() => { setModalAction(a.id); setModalMessage(''); }}
                        style={{
                          padding: '12px', borderRadius: 'var(--radius)', cursor: 'pointer',
                          border: `2px solid ${modalAction === a.id ? a.color : 'var(--border)'}`,
                          background: modalAction === a.id ? a.color : 'var(--surface)',
                          color: modalAction === a.id ? '#fff' : a.color,
                          fontSize: '13px', fontWeight: '600',
                        }}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {modalAction === 'approve' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Additional Notes (optional)</label>
                    <textarea
                      className="form-input"
                      value={modalMessage}
                      onChange={(e) => setModalMessage(e.target.value)}
                      placeholder="e.g., 'Approved with compliance note...'"
                      style={{ minHeight: '80px' }}
                    />
                  </div>
                  <div style={{ 
                    background: 'var(--accent-light)', 
                    padding: '12px', 
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    color: 'var(--accent)'
                  }}>
                    ✓ Hospital account will be activated immediately upon approval
                  </div>
                </>
              )}

              {modalAction === 'reject' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Rejection Reason *</label>
                    <textarea
                      className="form-input"
                      value={modalMessage}
                      onChange={(e) => setModalMessage(e.target.value)}
                      placeholder="Explain why the application is being rejected..."
                      required
                      style={{ minHeight: '100px' }}
                    />
                  </div>
                  <div style={{ 
                    background: 'var(--danger-light)', 
                    padding: '12px', 
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    color: 'var(--danger)'
                  }}>
                    ⚠️ Hospital will be notified of rejection with your feedback
                  </div>
                </>
              )}

              {modalAction === 'info' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Request Details *</label>
                    <textarea
                      className="form-input"
                      value={modalMessage}
                      onChange={(e) => setModalMessage(e.target.value)}
                      placeholder="What additional information do you need?"
                      required
                      style={{ minHeight: '100px' }}
                    />
                  </div>
                  <div style={{ 
                    background: 'var(--warning-light)', 
                    padding: '12px', 
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    color: 'var(--warning)'
                  }}>
                    ℹ️ Hospital will be asked to provide the requested information
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowRegistrationModal(false)}>
                {(modalAction === 'view' || modalAction === 'review') ? 'Close' : 'Cancel'}
              </button>
              {['approve', 'reject', 'info'].includes(modalAction) && (
                <button
                  className={`btn ${modalAction === 'reject' ? 'btn-danger' : 'btn-primary'}`}
                  onClick={submitRegistrationAction}
                >
                  {modalAction === 'approve' && 'Approve Hospital'}
                  {modalAction === 'reject' && 'Reject Application'}
                  {modalAction === 'info' && 'Request Information'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ban User Modal */}
      {showBanModal && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>🚫 Ban User</h3>
              <button className="modal-close" onClick={() => setShowBanModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ 
                background: 'var(--surface2)', 
                padding: '12px', 
                borderRadius: 'var(--radius)',
                marginBottom: '16px',
                fontSize: '12px'
              }}>
                <div style={{ color: 'var(--text3)', fontSize: '11px' }}>User to ban:</div>
                <div style={{ fontWeight: '600' }}>{banModalData.userName}</div>
              </div>

              <div className="form-group">
                <label className="form-label">Violation Category *</label>
                <select
                  className="form-input"
                  value={banModalData.category}
                  onChange={(e) => setBanModalData({ ...banModalData, category: e.target.value })}
                >
                  <option value="">— Select Category —</option>
                  {Object.entries(BAN_CATEGORIES).map(([key, cat]) => (
                    <option key={key} value={key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                {banModalData.category && (
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px', fontStyle: 'italic' }}>
                    {BAN_CATEGORIES[banModalData.category].description}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Ban Type *</label>
                <select
                  className="form-input"
                  value={banModalData.banType}
                  onChange={(e) => setBanModalData({ ...banModalData, banType: e.target.value })}
                >
                  <option value="warning">⚠️ Warning (No ban)</option>
                  <option value="temporary">⏱️ Temporary Ban</option>
                  <option value="permanent">🔒 Permanent Ban</option>
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                  Warning gives user a chance to correct behavior first. Temporary bans escalate to permanent if repeated.
                </div>
              </div>

              {banModalData.banType === 'temporary' && (
                <div className="form-group">
                  <label className="form-label">Duration *</label>
                  <select
                    className="form-input"
                    value={banModalData.banDuration}
                    onChange={(e) => setBanModalData({ ...banModalData, banDuration: parseInt(e.target.value) })}
                  >
                    {Object.entries(BAN_DURATIONS).map(([key, duration]) => (
                      duration.value !== null && (
                        <option key={key} value={duration.value}>
                          {duration.label}
                        </option>
                      )
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Detailed Explanation *</label>
                <textarea
                  className="form-input"
                  value={banModalData.detailedReason}
                  onChange={(e) => setBanModalData({ ...banModalData, detailedReason: e.target.value })}
                  placeholder="Provide clear, specific details about the violation. Include relevant evidence or observations..."
                  style={{ minHeight: '100px' }}
                />
              </div>

              <div style={{ 
                background: '#f0f9ff',
                padding: '12px',
                borderRadius: 'var(--radius)',
                fontSize: '11px',
                borderLeft: '3px solid #0891b2',
                marginBottom: '16px',
                lineHeight: '1.5'
              }}>
                <strong>📧 User Notification:</strong> User will receive notification with:
                <div style={{ marginTop: '6px' }}>
                  • Violation category<br/>
                  • Your detailed explanation<br/>
                  • Ban type and duration<br/>
                  • Appeal deadline (30 days)
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBanModal(false)}>
                Cancel
              </button>
              <button className="btn btn-warning" onClick={handleBanUser}>
                Confirm {banModalData.banType === 'warning' ? 'Warning' : 'Ban'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict of Interest Warning */}
      {conflictOfInterestWarning && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>⚠️ Conflict of Interest</h3>
              <button className="modal-close" onClick={() => setConflictOfInterestWarning(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ 
                background: '#fee2e2',
                padding: '16px',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                lineHeight: '1.6',
                color: 'var(--text2)',
                marginBottom: '16px'
              }}>
                <strong style={{ color: '#dc2626' }}>❌ Cannot Review Own Appeal</strong>
                <div style={{ marginTop: '12px' }}>
                  You initiated the ban/deletion on this account. To ensure fairness and impartiality, you cannot review appeals for actions you created.
                </div>
                <div style={{ marginTop: '12px', fontWeight: '500' }}>
                  Another admin must review this appeal.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setConflictOfInterestWarning(false)}>
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Review Modal */}
      {showAppealReviewModal && selectedAppeal && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>⚖️ Review Appeal</h3>
              <button className="modal-close" onClick={() => setShowAppealReviewModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {/* Timeline Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '16px',
                fontSize: '11px'
              }}>
                <div style={{
                  background: '#f3e8ff',
                  padding: '10px',
                  borderRadius: 'var(--radius)',
                  borderLeft: '3px solid #a855f7'
                }}>
                  <div style={{ color: '#a855f7', fontWeight: '600', marginBottom: '4px' }}>Submitted</div>
                  <div style={{ color: 'var(--text2)' }}>{new Date(selectedAppeal.submitted_date || selectedAppeal.submittedDate || selectedAppeal.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{
                  background: new Date(selectedAppeal.admin_response_deadline || selectedAppeal.adminResponseDeadline) < new Date() ? '#fee2e2' : '#fef3c7',
                  padding: '10px',
                  borderRadius: 'var(--radius)',
                  borderLeft: `3px solid ${new Date(selectedAppeal.admin_response_deadline || selectedAppeal.adminResponseDeadline) < new Date() ? '#dc2626' : '#f59e0b'}`
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: new Date(selectedAppeal.admin_response_deadline || selectedAppeal.adminResponseDeadline) < new Date() ? '#dc2626' : '#d97706' }}>
                    {new Date(selectedAppeal.admin_response_deadline || selectedAppeal.adminResponseDeadline) < new Date() ? '⚠️ OVERDUE' : '📅 Due'}
                  </div>
                  <div style={{ color: 'var(--text2)' }}>{new Date(selectedAppeal.admin_response_deadline || selectedAppeal.adminResponseDeadline).toLocaleDateString()}</div>
                </div>
              </div>

              {/* Original Action */}
              <div style={{ 
                background: 'var(--surface2)', 
                padding: '12px', 
                borderRadius: 'var(--radius)',
                marginBottom: '16px',
                fontSize: '12px'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: '600' }}>Original Action</div>
                  <div style={{ fontWeight: '600', marginTop: '4px' }}>
                    {(selectedAppeal.original_action || selectedAppeal.originalAction) === 'ban' ? '🚫 User Banned' : '🗑️ User Deleted'}
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: '600' }}>Violation Category</div>
                  <div style={{ marginTop: '4px' }}>
                    <span className="badge badge-red" style={{ fontSize: '11px' }}>
                      {BAN_CATEGORIES[selectedAppeal.original_category || selectedAppeal.originalCategory]?.label || (selectedAppeal.original_category || selectedAppeal.originalCategory)}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: '600' }}>Admin's Explanation</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'pre-wrap', marginTop: '6px' }}>
                    {selectedAppeal.original_reason || selectedAppeal.originalReason}
                  </div>
                </div>
              </div>

              {/* User's Appeal */}
              <div style={{ 
                background: '#f0fdf4',
                padding: '12px', 
                borderRadius: 'var(--radius)',
                marginBottom: '16px',
                fontSize: '12px',
                borderLeft: '3px solid #10b981'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#168e5e' }}>✏️ User's Appeal</div>
                <div style={{ color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>
                  {selectedAppeal.explanation}
                </div>
              </div>

              {/* Decision */}
              <div className="form-group">
                <label className="form-label">Your Decision *</label>
                <select
                  className="form-input"
                  value={appealReviewData.decision}
                  onChange={(e) => setAppealReviewData({ ...appealReviewData, decision: e.target.value })}
                >
                  <option value="">— Select Decision —</option>
                  <option value="uphold">✓ Uphold (Keep original action)</option>
                  <option value="reverse">↩️ Reverse (Reinstate user account)</option>
                  <option value="modify">⚙️ Modify (Apply different action)</option>
                </select>
              </div>

              {/* Review Notes */}
              <div className="form-group">
                <label className="form-label">Review Notes & Justification *</label>
                <textarea
                  className="form-input"
                  value={appealReviewData.notes}
                  onChange={(e) => setAppealReviewData({ ...appealReviewData, notes: e.target.value })}
                  placeholder="Explain your decision, reasoning, and justification. This will be communicated to the user..."
                  style={{ minHeight: '100px' }}
                />
              </div>

              {/* Info Box */}
              <div style={{ 
                background: '#ecf0f1',
                padding: '14px',
                borderRadius: 'var(--radius)',
                fontSize: '11px',
                lineHeight: '1.6',
                color: 'var(--text2)',
                marginBottom: '0'
              }}>
                <strong>📋 Important:</strong>
                <div style={{ marginTop: '8px' }}>
                  • Conflict of interest: Different admin must review each appeal<br/>
                  • Your notes will be visible to the user<br/>
                  • Decision is final unless escalated
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAppealReviewModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitAppealReview}>
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview — shared viewer (zoom, pan, draggable, minimize/restore/close) */}
      {showDocumentPreview && previewDocument && (
        <DocumentViewer
          doc={previewDocument}
          onClose={() => { setShowDocumentPreview(false); setPreviewDocument(null); setPreviewMode('normal'); }}
        />
      )}

      {/* Category Selection Modal */}
      {showCategoryModal && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%)', borderBottom: '2px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <span style={{ fontSize: '24px' }}>📋</span>
                <div>
                  <h3 style={{ color: '#92400e', margin: 0 }}>Account Action</h3>
                  <div style={{ fontSize: '11px', color: '#b45309' }}>Select violation category for {categoryModalData.userName}</div>
                  <div style={{ fontSize: '10px', color: '#b45309', marginTop: '4px', fontStyle: 'italic' }}>💡 Tip: Press <kbd style={{ background: '#fff9e6', padding: '2px 6px', borderRadius: '3px', border: '1px solid #d4af37' }}>Escape</kbd> to close, <kbd style={{ background: '#fff9e6', padding: '2px 6px', borderRadius: '3px', border: '1px solid #d4af37' }}>Enter</kbd> to submit</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowCategoryModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', color: 'var(--text1)' }}>
                  🚫 Select Violation Category *
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {Object.entries(BAN_CATEGORIES).map(([key, cat]) => (
                    <div
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      style={{
                        padding: '14px 16px',
                        background: selectedCategory === key ? 'linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%)' : 'var(--surface1)',
                        border: selectedCategory === key ? '2px solid #f59e0b' : '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: selectedCategory === key ? '0 4px 12px rgba(245, 158, 11, 0.2)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedCategory !== key) {
                          e.currentTarget.style.background = 'var(--surface2)';
                          e.currentTarget.style.borderColor = '#f59e0b';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedCategory !== key) {
                          e.currentTarget.style.background = 'var(--surface1)';
                          e.currentTarget.style.borderColor = 'var(--border)';
                        }
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '6px', color: selectedCategory === key ? '#b45309' : 'var(--text1)' }}>
                        {cat.label}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {cat.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <span>📝</span> Detailed Reason for Action *
                </label>
                <textarea
                  className="form-input"
                  value={categoryModalData.reason}
                  onChange={(e) => setCategoryModalData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Provide specific details, evidence, or observations that led to this action..."
                  style={{ minHeight: '140px', fontSize: '12px' }}
                />
              </div>

              <div style={{
                background: '#f0fdf4',
                padding: '14px 16px',
                borderRadius: 'var(--radius)',
                borderLeft: '4px solid #10b981',
                fontSize: '12px',
                lineHeight: '1.6'
              }}>
                <div style={{ fontWeight: '700', color: '#166534', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>ℹ️</span> Important
                </div>
                <div style={{ color: '#166534' }}>
                  The user will be notified of this action with the category and reason. This action will be logged in the system.
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '2px solid #fef3c7' }}>
              <button className="btn btn-ghost" onClick={() => setShowCategoryModal(false)} style={{ fontWeight: '600' }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCategorySubmit} disabled={!selectedCategory || !categoryModalData.reason.trim()} style={{
                background: selectedCategory && categoryModalData.reason.trim() ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : '#e5e7eb',
                border: selectedCategory && categoryModalData.reason.trim() ? '2px solid #7f1d1d' : 'none',
                color: selectedCategory && categoryModalData.reason.trim() ? '#fff' : '#9ca3af',
                fontWeight: '700',
                boxShadow: selectedCategory && categoryModalData.reason.trim() ? '0 4px 12px rgba(220, 38, 38, 0.25)' : 'none',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (selectedCategory && categoryModalData.reason.trim()) {
                  e.target.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.35)';
                  e.target.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCategory && categoryModalData.reason.trim()) {
                  e.target.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.25)';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
              >
                ✅ Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// User Row Component
const UserRow = ({ user, isSelf, currentUser, onBan, onDelete }) => {
  const statusBadge = user.status === 'approved' ? 'badge-green' : user.status === 'pending' ? 'badge-amber' : 'badge-red';

  const roleBadgeMap = {
    super_admin: 'badge-purple',
    admin: 'badge-blue',
    hospital: 'badge-amber',
    donor: 'badge-green',
    recipient: 'badge-gray'
  };

  const roleBadge = roleBadgeMap[user.role] || 'badge-gray';

  // Role hierarchy:
  //   - never act on super_admin
  //   - never act on yourself
  //   - admins cannot act on other admins (peer rule)
  //   - only super_admin OR the owning hospital can act on admins
  let canAct = user.role !== 'super_admin' && !isSelf;
  if (canAct && user.role === 'admin' && currentUser) {
    const isSuperAdmin = currentUser.role === 'super_admin';
    const isOwningHospital = currentUser.role === 'hospital' && Number(user.linkedHospitalId) === Number(currentUser.id);
    canAct = isSuperAdmin || isOwningHospital;
  }
  const canDelete = canAct;

  return (
    <tr>
      <td>
        <strong>{user.name}</strong>
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user.email}</div>
      </td>
      <td>
        <span className={`badge ${roleBadge}`}>
          {user.role.replace('_', ' ')}
        </span>
      </td>
      <td>
        <span className={`badge ${statusBadge}`}>
          {user.status || 'approved'}
        </span>
      </td>
      <td>
        {user.registrationDate ? new Date(user.registrationDate).toLocaleDateString() : '—'}
      </td>
      <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        {canDelete && (
          <>
            <button
              className="btn btn-sm btn-warning"
              onClick={() => onBan(user.id, user.name)}
              title="Ban user temporarily or permanently"
            >
              Ban
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onDelete(user.id, user.name)}
              title="Delete user account"
            >
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  );
};

// Registration Row Component (for pending hospitals)
const RegistrationRow = ({ registration, onReview }) => {
  return (
    <tr>
      <td>
        <strong>{registration.hospitalName}</strong>
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{registration.email}</div>
        {registration.uploadedDocuments && registration.uploadedDocuments.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
            📄 {registration.uploadedDocuments.length} document{registration.uploadedDocuments.length !== 1 ? 's' : ''} attached
          </div>
        )}
      </td>
      <td style={{ fontSize: '12px', fontWeight: '500' }}>
        {registration.registrationNumber}
      </td>
      <td>
        <div style={{ fontSize: '13px', fontWeight: '500' }}>{registration.contactPerson}</div>
        {registration.phone && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{registration.phone}</div>}
      </td>
      <td>
        {registration.status === 'info_requested'
          ? <span className="badge badge-amber">⚠ Info Requested</span>
          : <span className="badge badge-amber">Pending</span>
        }
      </td>
      <td style={{ textAlign: 'right' }}>
        <button className="btn btn-sm btn-primary" onClick={onReview}>
          🔍 Review
        </button>
      </td>
    </tr>
  );
};

export default UserManagement;
