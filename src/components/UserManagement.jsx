import { useState, useEffect, useMemo } from 'react';
import { getAllUsers, saveUsers, getCreds, saveCreds, updateUserStatus, deleteUserById, getPendingRegistrations, getApprovedHospitals, getRejectedHospitals, approveRegistrationWithActivity, rejectRegistrationWithActivity, requestAdditionalInfoWithActivity, approveRegistration, rejectRegistration, requestAdditionalInfo, banUser, softDeleteUser, getAppeals, getPendingAppeals, getOverdueAppeals, submitAppeal, reviewAppeal, getUserActionLogs, BAN_CATEGORIES, BAN_DURATIONS, getNotifications } from '../utils/auth';
import { toast } from '../utils/toast';

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
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
  const [showBanModal, setShowBanModal] = useState(false);
  const [banModalData, setBanModalData] = useState({ userId: null, userName: null, category: '', detailedReason: '', banType: 'temporary', banDuration: 30 });
  const [appeals, setAppeals] = useState([]);
  const [showAppealReviewModal, setShowAppealReviewModal] = useState(false);
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [appealReviewData, setAppealReviewData] = useState({ decision: '', notes: '' });
  const [conflictOfInterestWarning, setConflictOfInterestWarning] = useState(null);
  // Category Selection Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalData, setCategoryModalData] = useState({ userId: null, userName: null, reason: '', action: 'delete' }); // action: 'delete' or 'ban'
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    loadUsers();
    loadAppeals();
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

  const loadUsers = () => {
    setUsers(getAllUsers());
    setApprovedHospitals(getApprovedHospitals());
    setRejectedHospitals(getRejectedHospitals());
  };

  const loadAppeals = () => {
    let allAppeals = getPendingAppeals();
    if (currentUser.role === 'admin' && currentUser.linkedHospitalId) {
      const hospitalUserIds = new Set(
        getAllUsers()
          .filter(u => u.preferredHospitalId === currentUser.linkedHospitalId || u.hospitalId === currentUser.linkedHospitalId)
          .map(u => u.id)
      );
      allAppeals = allAppeals.filter(a => hospitalUserIds.has(a.userId));
    }
    setAppeals(allAppeals);
  };

  const handleApproveUser = (id) => {
    updateUserStatus(id, 'approved');
    toast('User approved successfully.', 'success');
    loadUsers();
  };

  const openBanModal = (userId, userName) => {
    setBanModalData({ userId, userName, category: '', detailedReason: '', banType: 'temporary', banDuration: 30 });
    setShowBanModal(true);
  };

  const handleBanUser = () => {
    const { userId, userName, category, detailedReason, banType, banDuration } = banModalData;

    // Fraud prevention: linked admin can only ban users from their hospital
    if (currentUser.linkedHospitalId) {
      const target = getAllUsers().find(u => u.id === userId);
      const belongsToHospital = target?.preferredHospitalId === currentUser.linkedHospitalId ||
        target?.hospitalId === currentUser.linkedHospitalId;
      if (!belongsToHospital) {
        toast('Access denied. You can only manage users from your assigned hospital.', 'error');
        return;
      }
    }

    if (!category) {
      toast('Please select a violation category.', 'error');
      return;
    }

    if (!detailedReason.trim()) {
      toast('Please provide a detailed explanation for the ban.', 'error');
      return;
    }

    try {
      banUser(userId, category, detailedReason, banType, banType === 'temporary' ? banDuration : null, currentUser.id);
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

  const handleCategorySubmit = () => {
    if (!selectedCategory) {
      toast('Please select a violation category.', 'error');
      return;
    }

    if (!categoryModalData.reason.trim()) {
      toast('Please enter a detailed reason.', 'error');
      return;
    }

    // Fraud prevention: linked admin can only delete users from their hospital
    if (currentUser.linkedHospitalId) {
      const target = getAllUsers().find(u => u.id === categoryModalData.userId);
      const belongsToHospital = target?.preferredHospitalId === currentUser.linkedHospitalId ||
        target?.hospitalId === currentUser.linkedHospitalId;
      if (!belongsToHospital) {
        toast('Access denied. You can only manage users from your assigned hospital.', 'error');
        setShowCategoryModal(false);
        return;
      }
    }

    try {
      softDeleteUser(categoryModalData.userId, selectedCategory, categoryModalData.reason, currentUser.id);
      toast(`User "${categoryModalData.userName}" has been deleted.`, 'success');
      setShowCategoryModal(false);
      loadUsers();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const handleReviewAppeal = (appeal) => {
    // Check for conflict of interest
    if (appeal.originalAdminId === currentUser.id) {
      setConflictOfInterestWarning(true);
      return;
    }
    
    setConflictOfInterestWarning(false);
    setSelectedAppeal(appeal);
    setAppealReviewData({ decision: '', notes: '' });
    setShowAppealReviewModal(true);
  };

  const submitAppealReview = () => {
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
      reviewAppeal(selectedAppeal.id, decision, notes, currentUser.id);
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

  const handleAddAdmin = () => {
    const { name, email, password, linkedHospitalId, linkedHospitalName } = newAdmin;

    if (!name || !email || password.length < 8) {
      toast('Please fill all fields correctly. Password must be at least 8 characters.', 'error');
      return;
    }

    const allUsers = getAllUsers();
    if (allUsers.some(u => u.email === email)) {
      toast('Email already in use.', 'error');
      return;
    }

    allUsers.push({
      id: 'admin-' + Date.now(),
      email,
      name,
      role: 'admin',
      status: 'approved',
      linkedHospitalId: linkedHospitalId || null,
      linkedHospitalName: linkedHospitalName || null,
      registrationDate: new Date().toISOString()
    });

    saveUsers(allUsers);

    const creds = getCreds();
    creds[email] = password;
    saveCreds(creds);

    toast('Administrator added successfully.', 'success');
    setShowAddModal(false);
    setNewAdmin({ name: '', email: '', password: '', linkedHospitalId: '', linkedHospitalName: '' });
    loadUsers();
  };

  const handleRegistrationAction = (registration, action) => {
    setSelectedRegistration(registration);
    setModalAction(action);
    setModalMessage('');
    setShowRegistrationModal(true);
  };

  const submitRegistrationAction = () => {
    if (!selectedRegistration) return;

    if (modalAction === 'approve') {
      approveRegistrationWithActivity(selectedRegistration.id, modalMessage, currentUser.id);
      toast('Hospital registration approved!', 'success');
    } else if (modalAction === 'reject') {
      if (!modalMessage) {
        toast('Please provide a reason for rejection.', 'error');
        return;
      }
      rejectRegistrationWithActivity(selectedRegistration.id, modalMessage, currentUser.id);
      toast('Hospital registration rejected.', 'info');
    } else if (modalAction === 'info') {
      if (!modalMessage) {
        toast('Please provide the information request.', 'error');
        return;
      }
      requestAdditionalInfoWithActivity(selectedRegistration.id, modalMessage, currentUser.id);
      toast('Additional information requested from hospital.', 'info');
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

  const pendingRegistrations = getPendingRegistrations();
  const approvedUsers = scopedUsers.filter(u => u.status === 'approved');
  const rejectedUsers = scopedUsers.filter(u => u.status === 'rejected');
  const bannedUsers = scopedUsers.filter(u => u.banned === true);
  const deletedUsers = scopedUsers.filter(u => u.deleted === true);

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
                    pendingRegistrations.map(reg => (
                      <RegistrationRow
                        key={reg.id}
                        registration={reg}
                        onApprove={() => handleRegistrationAction(reg, 'approve')}
                        onReject={() => handleRegistrationAction(reg, 'reject')}
                        onRequestInfo={() => handleRegistrationAction(reg, 'info')}
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

            {/* Approved Hospitals Tab */}
            {hospitalTab === 'approved' && (
              <table>
                <thead>
                  <tr>
                    <th>Hospital</th>
                    <th>Registration #</th>
                    <th>Approved</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedHospitals.length > 0 ? (
                    approvedHospitals.map(hospital => (
                      <tr key={hospital.id}>
                        <td>{hospital.hospitalName}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text2)' }}>{hospital.registrationNumber}</td>
                        <td style={{ fontSize: '12px', color: 'var(--accent)' }}>✓ Approved</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => {
                              setNewAdmin(prev => ({ ...prev, linkedHospitalId: hospital.id, linkedHospitalName: hospital.hospitalName }));
                              setShowAddModal(true);
                            }}
                          >
                            Assign Admin
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                        No approved hospitals
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                  </tr>
                </thead>
                <tbody>
                  {rejectedHospitals.length > 0 ? (
                    rejectedHospitals.map(hospital => (
                      <tr key={hospital.id}>
                        <td>{hospital.hospitalName}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text2)' }}>{hospital.registrationNumber}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text2)' }}>{hospital.rejectionReason || 'No reason provided'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--danger)' }}>✗ Rejected</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>
                        No rejected hospitals
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Approved Users — Admin Only */}
      {currentUser.role === 'admin' && (
      <div className="card">
        <div className="card-header">
          <div className="card-title">✓ Approved Users</div>
          <div className="card-sub">Active donors, recipients, admins, and hospitals</div>
        </div>
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
              {approvedUsers.length > 0 ? (
                approvedUsers.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
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

      {/* Banned Users — Admin Only */}
      {currentUser.role === 'admin' && bannedUsers.length > 0 && (
        <div className="card" style={{ marginTop: '20px', borderColor: '#dc2626', background: '#fee2e2' }}>
          <div className="card-header">
            <div className="card-title">🚫 Banned Users ({bannedUsers.length})</div>
            <div className="card-sub">Users temporarily or permanently banned</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Ban Type</th>
                  <th>Reason</th>
                  <th>Ban Date</th>
                  <th>Days Remaining</th>
                </tr>
              </thead>
              <tbody>
                {bannedUsers.map(user => {
                  const banDate = new Date(user.banDetails.banDate);
                  const duration = user.banDetails.duration || 0;
                  const expiryDate = new Date(banDate.getTime() + duration * 24 * 60 * 60 * 1000);
                  const daysRemaining = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
                  
                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user.email}</div>
                      </td>
                      <td>
                        <span className={user.banDetails.banType === 'permanent' ? 'badge badge-red' : 'badge badge-amber'}>
                          {user.banDetails.banType === 'permanent' ? 'Permanent' : 'Temporary'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text2)', maxWidth: '200px' }}>
                        {user.banDetails.reason}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {banDate.toLocaleDateString()}
                      </td>
                      <td style={{ fontSize: '12px', fontWeight: '600', color: user.banDetails.banType === 'permanent' ? 'var(--danger)' : 'var(--text1)' }}>
                        {user.banDetails.banType === 'permanent' ? '∞' : daysRemaining > 0 ? daysRemaining + ' days' : 'Expired'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deleted Users — Admin Only */}
      {currentUser.role === 'admin' && deletedUsers.length > 0 && (
        <div className="card" style={{ marginTop: '20px', borderColor: '#9333ea', background: '#f3e8ff' }}>
          <div className="card-header">
            <div className="card-title">🗑️ Deleted Users ({deletedUsers.length})</div>
            <div className="card-sub">Permanently deleted user accounts</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Deletion Reason</th>
                  <th>Deleted Date</th>
                </tr>
              </thead>
              <tbody>
                {deletedUsers.map(user => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user.email}</div>
                    </td>
                    <td>
                      <span className="badge badge-gray">
                        {user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text2)', maxWidth: '250px' }}>
                      {user.deletionReason}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text3)' }}>
                      {user.deletionDate ? new Date(user.deletionDate).toLocaleDateString() : '—'}
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
                {appeals.map(appeal => {
                  const user = users.find(u => u.id === appeal.userId);
                  return (
                    <tr key={appeal.id}>
                      <td>
                        <strong>{user?.name || 'Unknown'}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user?.email || '—'}</div>
                      </td>
                      <td>
                        <span className={appeal.originalAction === 'ban' ? 'badge badge-red' : 'badge badge-purple'}>
                          {appeal.originalAction === 'ban' ? 'Ban' : 'Delete'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {new Date(appeal.submittedDate).toLocaleDateString()}
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
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
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
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Assign to Hospital (optional)</label>
                <select
                  className="form-input"
                  value={newAdmin.linkedHospitalId}
                  onChange={(e) => {
                    const h = approvedHospitals.find(h => h.id === e.target.value);
                    setNewAdmin({ ...newAdmin, linkedHospitalId: e.target.value, linkedHospitalName: h ? (h.hospitalName || h.name) : '' });
                  }}
                >
                  <option value="">— None (General Admin) —</option>
                  {approvedHospitals.map(h => (
                    <option key={h.id} value={h.id}>{h.hospitalName || h.name}</option>
                  ))}
                </select>
                {newAdmin.linkedHospitalId && (
                  <div style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '6px' }}>
                    🏥 This admin will only see data for {newAdmin.linkedHospitalName}
                  </div>
                )}
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
          <div className="modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>
                {modalAction === 'approve' && '✓ Approve Hospital'}
                {modalAction === 'reject' && '✗ Reject Application'}
                {modalAction === 'info' && 'ℹ️ Request Additional Info'}
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
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{selectedRegistration.hospitalName}</div>
                <div style={{ color: 'var(--text3)' }}>Reg #: {selectedRegistration.registrationNumber}</div>
              </div>

              {selectedRegistration.uploadedDocuments && selectedRegistration.uploadedDocuments.length > 0 && (
                <div style={{ 
                  background: 'var(--surface2)', 
                  padding: '12px', 
                  borderRadius: 'var(--radius)',
                  marginBottom: '16px',
                  fontSize: '12px'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>📄 Attached Documents</div>
                  {selectedRegistration.uploadedDocuments.map((doc, idx) => {
                    const docTypeLabels = {
                      registrationCertificate: 'Hospital Registration Certificate',
                      healthcareLicense: 'Healthcare License',
                      emailVerification: 'Official Email Verification',
                      basicDetailsForm: 'Basic Details Form',
                      other: 'Additional Document'
                    };
                    return (
                      <div key={idx} style={{ 
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        paddingBottom: '8px',
                        borderBottom: idx < selectedRegistration.uploadedDocuments.length - 1 ? '1px solid var(--border)' : 'none',
                        marginBottom: '8px'
                      }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => { setPreviewDocument(doc); setShowDocumentPreview(true); }}>
                          <div style={{ color: 'var(--text1)', textDecoration: 'underline' }}>{doc.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--primary)', marginBottom: '2px' }}>
                            {docTypeLabels[doc.documentType] || docTypeLabels.other}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            {(doc.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => { setPreviewDocument(doc); setShowDocumentPreview(true); }}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            👁 View
                          </button>
                          <a href={doc.data} download={doc.name} className="btn btn-xs btn-outline" style={{ 
                            textDecoration: 'none',
                            whiteSpace: 'nowrap'
                          }}>
                            ⬇ Download
                          </a>
                        </div>
                      </div>
                    );
                  })}
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
                Cancel
              </button>
              <button 
                className={`btn ${modalAction === 'reject' ? 'btn-danger' : 'btn-primary'}`} 
                onClick={submitRegistrationAction}
              >
                {modalAction === 'approve' && 'Approve Hospital'}
                {modalAction === 'reject' && 'Reject Application'}
                {modalAction === 'info' && 'Request Information'}
              </button>
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
                  <div style={{ color: 'var(--text2)' }}>{new Date(selectedAppeal.submittedDate).toLocaleDateString()}</div>
                </div>
                <div style={{
                  background: new Date(selectedAppeal.adminResponseDeadline) < new Date() ? '#fee2e2' : '#fef3c7',
                  padding: '10px',
                  borderRadius: 'var(--radius)',
                  borderLeft: `3px solid ${new Date(selectedAppeal.adminResponseDeadline) < new Date() ? '#dc2626' : '#f59e0b'}`
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: new Date(selectedAppeal.adminResponseDeadline) < new Date() ? '#dc2626' : '#d97706' }}>
                    {new Date(selectedAppeal.adminResponseDeadline) < new Date() ? '⚠️ OVERDUE' : '📅 Due'}
                  </div>
                  <div style={{ color: 'var(--text2)' }}>{new Date(selectedAppeal.adminResponseDeadline).toLocaleDateString()}</div>
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
                    {selectedAppeal.originalAction === 'ban' ? '🚫 User Banned' : '🗑️ User Deleted'}
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: '600' }}>Violation Category</div>
                  <div style={{ marginTop: '4px' }}>
                    <span className="badge badge-red" style={{ fontSize: '11px' }}>
                      {BAN_CATEGORIES[selectedAppeal.originalCategory]?.label || selectedAppeal.originalCategory}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: '600' }}>Admin's Explanation</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'pre-wrap', marginTop: '6px' }}>
                    {selectedAppeal.originalReason}
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

      {/* Document Preview Modal */}
      {showDocumentPreview && previewDocument && (
        <div className="modal-overlay show">
          <div className="modal" style={{ maxWidth: '800px', maxHeight: '85vh' }}>
            <div className="modal-header">
              <h3>Document Preview</h3>
              <button className="modal-close" onClick={() => { setShowDocumentPreview(false); setPreviewDocument(null); }}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                background: 'var(--surface2)', 
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '2px' }}>{previewDocument.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  {(previewDocument.size / 1024 / 1024).toFixed(2)} MB • {previewDocument.type}
                </div>
              </div>
              
              <div style={{ 
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface3)',
                minHeight: '400px'
              }}>
                {previewDocument.type.startsWith('image/') ? (
                  <img 
                    src={previewDocument.data} 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : previewDocument.type === 'application/pdf' ? (
                  <iframe
                    src={previewDocument.data}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="PDF Preview"
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                    <div>Preview not available for this file type</div>
                    <div style={{ fontSize: '12px', marginTop: '8px' }}>Please download to view</div>
                  </div>
                )}
              </div>

              <div style={{ 
                background: 'var(--surface2)', 
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
              }}>
                <button 
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setShowDocumentPreview(false); setPreviewDocument(null); }}
                >
                  Close
                </button>
                <a 
                  href={previewDocument.data} 
                  download={previewDocument.name}
                  className="btn btn-primary"
                >
                  ⬇ Download
                </a>
              </div>
            </div>
          </div>
        </div>
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
const UserRow = ({ user, onBan, onDelete }) => {
  const statusBadge = user.status === 'approved' ? 'badge-green' : user.status === 'pending' ? 'badge-amber' : 'badge-red';
  
  const roleBadgeMap = {
    super_admin: 'badge-purple',
    admin: 'badge-blue',
    hospital: 'badge-amber',
    donor: 'badge-green',
    recipient: 'badge-gray'
  };
  
  const roleBadge = roleBadgeMap[user.role] || 'badge-gray';
  const canDelete = user.role !== 'super_admin';

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
const RegistrationRow = ({ registration, onApprove, onReject, onRequestInfo }) => {
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
        <button
          className="btn btn-sm btn-outline"
          onClick={onApprove}
          style={{ marginRight: '4px' }}
        >
          Approve
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={onRequestInfo}
          style={{ marginRight: '4px' }}
        >
          Info?
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={onReject}
        >
          Reject
        </button>
      </td>
    </tr>
  );
};

export default UserManagement;
