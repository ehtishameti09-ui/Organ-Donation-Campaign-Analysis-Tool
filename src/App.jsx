import { useState, useEffect } from 'react';
import { getCurrentUser, logout, initSuperAdmin, login, getUnreadNotifications, getAllUsers } from './utils/auth';
import { toast } from './utils/toast';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';
import AccountSettings from './components/AccountSettings';
import DonorManagement from './components/DonorManagement';
import RecipientManagement from './components/RecipientManagement';
import DonorRecipientWizard from './components/DonorRecipientWizard';
import EmployeeManagement from './components/EmployeeManagement';
import DoctorDashboard from './components/DoctorDashboard';
import DataEntryDashboard from './components/DataEntryDashboard';
import AuditorDashboard from './components/AuditorDashboard';
import './styles/App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  useEffect(() => {
    initSuperAdmin();
    const user = getCurrentUser();
    if (user) {
      // Refresh user data from storage
      const users = getAllUsers();
      const fresh = users.find(u => u.id === user.id) || user;
      setCurrentUser(fresh);
      localStorage.setItem('odcat_current', JSON.stringify(fresh));
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      const unread = getUnreadNotifications(currentUser.id);
      setUnreadCount(unread.length);
    }
  }, [currentUser]);

  // Refresh user from storage (for status changes)
  const refreshCurrentUser = () => {
    const users = getAllUsers();
    if (currentUser) {
      const fresh = users.find(u => u.id === currentUser.id);
      if (fresh) {
        setCurrentUser(fresh);
        localStorage.setItem('odcat_current', JSON.stringify(fresh));
      }
    }
  };

  const handleLoginSuccess = (user) => {
    // Always get fresh user data
    const users = getAllUsers();
    const fresh = users.find(u => u.id === user.id) || user;
    setCurrentUser(fresh);
    localStorage.setItem('odcat_current', JSON.stringify(fresh));
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setCurrentPage('dashboard');
    setNotifPanelOpen(false);
    toast('Signed out successfully.', 'info');
  };

  const navigateTo = (page) => {
    setCurrentPage(page);
    setNotifPanelOpen(false);
    // Refresh user on navigation
    refreshCurrentUser();
  };

  if (!currentUser && showRegister) {
    return (
      <>
        <div id="toast-container" className="toast-container"></div>
        <Register
          onRegistrationSuccess={(regData) => {
            if (regData.type === 'hospital') {
              // Hospital gets instant login
              const loginResult = login(regData.email, regData.password);
              if (loginResult) {
                setCurrentUser(loginResult);
                setShowRegister(false);
                toast(`Welcome, ${loginResult.hospitalName || loginResult.name}! Your registration is under review.`, 'success');
              }
            } else {
              // Donor/recipient auto-login
              const loginResult = login(regData.email, regData.password);
              if (loginResult) {
                setCurrentUser(loginResult);
                setShowRegister(false);
                toast(`Welcome, ${loginResult.name}! Your account is ready.`, 'success');
              }
            }
          }}
          onBackToLogin={() => setShowRegister(false)}
        />
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        <div id="toast-container" className="toast-container"></div>
        <Login
          onLoginSuccess={handleLoginSuccess}
          onCreateAccount={() => setShowRegister(true)}
        />
      </>
    );
  }

  // Navigation items based on role
  const getNavItems = () => {
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: 'layout' }
    ];

    if (currentUser.role === 'super_admin') {
      items.push({ id: 'users', label: 'Hospital Registrations', icon: 'users' });
    }

    if (currentUser.role === 'admin') {
      items.push({ id: 'users', label: 'User Management', icon: 'users' });
      items.push({ id: 'employees', label: 'Employees', icon: 'briefcase' });
      items.push({ id: 'donors', label: 'Donor Management', icon: 'heart' });
      items.push({ id: 'recipients', label: 'Recipients', icon: 'activity' });
    }

    if (currentUser.role === 'hospital' && currentUser.status === 'approved') {
      items.push({ id: 'donors', label: 'Donor Management', icon: 'heart' });
      items.push({ id: 'recipients', label: 'Recipients', icon: 'activity' });
    }

    if (currentUser.role === 'doctor') {
      items.push({ id: 'doctor-review', label: 'Case Reviews', icon: 'clipboard' });
    }

    if (currentUser.role === 'data_entry') {
      items.push({ id: 'data-entry', label: 'Data Entry', icon: 'edit' });
    }

    if (currentUser.role === 'auditor') {
      items.push({ id: 'audit', label: 'Audit Dashboard', icon: 'shield' });
    }

    // Settings for all users
    items.push({ id: 'settings', label: 'Account Settings', icon: 'settings' });

    return items;
  };

  const navItems = getNavItems();
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const isHospitalRestricted = currentUser.role === 'hospital' &&
    (currentUser.status === 'pending' || currentUser.status === 'info_requested');

  const renderPage = () => {
    // Restricted hospital access
    if (isHospitalRestricted && currentPage !== 'settings' && currentPage !== 'dashboard') {
      return <Dashboard user={currentUser} onNavigate={navigateTo} />;
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'users':
        return (currentUser.role === 'super_admin' || currentUser.role === 'admin')
          ? <UserManagement currentUser={currentUser} onUserUpdated={refreshCurrentUser} />
          : <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'donors':
        return (currentUser.role === 'admin' || (currentUser.role === 'hospital' && currentUser.status === 'approved'))
          ? <DonorManagement currentUser={currentUser} />
          : <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'recipients':
        return (currentUser.role === 'admin' || (currentUser.role === 'hospital' && currentUser.status === 'approved'))
          ? <RecipientManagement currentUser={currentUser} />
          : <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'employees':
        return (currentUser.role === 'super_admin' || currentUser.role === 'admin')
          ? <EmployeeManagement currentUser={currentUser} />
          : <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'doctor-review':
        return currentUser.role === 'doctor'
          ? <DoctorDashboard currentUser={currentUser} />
          : <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'data-entry':
        return currentUser.role === 'data_entry'
          ? <DataEntryDashboard currentUser={currentUser} />
          : <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'audit':
        return currentUser.role === 'auditor'
          ? <AuditorDashboard currentUser={currentUser} />
          : <Dashboard user={currentUser} onNavigate={navigateTo} />;
      case 'settings':
        return (
          <AccountSettings
            user={currentUser}
            onUpdate={(updatedUser) => {
              setCurrentUser(updatedUser);
              localStorage.setItem('odcat_current', JSON.stringify(updatedUser));
            }}
          />
        );
      case 'complete-registration':
        if (currentUser.role !== 'donor' && currentUser.role !== 'recipient') {
          return <Dashboard user={currentUser} onNavigate={navigateTo} />;
        }
        return (
          <DonorRecipientWizard
            user={currentUser}
            mode={currentUser.status === 'info_requested' ? 'resubmit' : 'new'}
            onComplete={() => {
              refreshCurrentUser();
              navigateTo('dashboard');
            }}
            onCancel={() => navigateTo('dashboard')}
          />
        );
      default:
        return <Dashboard user={currentUser} onNavigate={navigateTo} />;
    }
  };

  const getPageInfo = () => {
    const pages = {
      dashboard: { title: 'Dashboard', sub: 'Monitor system performance and key metrics' },
      users: { title: 'User Management', sub: 'Manage accounts, roles, and permissions' },
      employees: { title: 'Employee Management', sub: 'Manage staff accounts and roles' },
      donors: { title: 'Donor Management', sub: 'Verify donor registrations and review documents' },
      recipients: { title: 'Recipient Cases', sub: 'Manage recipient cases and clinical data' },
      'doctor-review': { title: 'Case Reviews', sub: 'Review incoming donor and recipient requests' },
      'data-entry': { title: 'Data Entry', sub: 'Add and edit donor & recipient records' },
      audit: { title: 'Audit Dashboard', sub: 'Read-only system overview and audit logs' },
      settings: { title: 'Account Settings', sub: 'Update your profile and preferences' },
      'complete-registration': { title: 'Complete Registration', sub: 'Sign the consent form, submit clinical info, and upload documents' },
    };
    return pages[currentPage] || pages.dashboard;
  };

  const { title: pageTitle, sub: pageSub } = getPageInfo();

  const getRoleLabel = (role) => {
    const labels = { super_admin: 'Super Admin', admin: 'Admin', hospital: 'Hospital', donor: 'Donor', recipient: 'Recipient', doctor: 'Doctor', data_entry: 'Data Entry', auditor: 'Auditor' };
    return labels[role] || role;
  };

  return (
    <>
      <div id="toast-container" className="toast-container"></div>
      <div className="app-shell">
        {/* Sidebar */}
        <aside id="sidebar" className={sidebarCollapsed ? 'collapsed' : ''}>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">
                <svg viewBox="0 0 24 24" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <div className="sidebar-logo-text">
                <h1>ODCAT</h1>
                <p>Healthcare System</p>
              </div>
            </div>
            <button className="sidebar-toggle-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Expand' : 'Collapse'}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2.5">
                {sidebarCollapsed ? <path d="M9 18l6-6-6-6"/> : <path d="M15 18l-6-6 6-6"/>}
              </svg>
            </button>
          </div>

          {/* Status badge for hospital */}
          {currentUser.role === 'hospital' && !sidebarCollapsed && (
            <div style={{ margin: '0 12px 0', padding: '8px 12px', background: isHospitalRestricted ? 'var(--warning-light)' : 'var(--accent-light)', borderRadius: 'var(--radius)', fontSize: '11px', fontWeight: '600', color: isHospitalRestricted ? 'var(--warning)' : 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isHospitalRestricted ? '⏳ Pending Approval' : '✓ Approved Hospital'}
            </div>
          )}

          <nav className="sidebar-nav">
            <div className="nav-section-label">Navigation</div>
            {navItems.map(item => {
              const isDisabled = isHospitalRestricted && item.id !== 'dashboard' && item.id !== 'settings';
              return (
                <a
                  key={item.id}
                  className={`nav-item ${currentPage === item.id ? 'active' : ''} ${isDisabled ? 'nav-item-disabled' : ''}`}
                  onClick={() => !isDisabled && navigateTo(item.id)}
                  href="#"
                  title={isDisabled ? 'Available after approval' : item.label}
                  style={{ opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                >
                  <svg className="nav-icon" viewBox="0 0 24 24" strokeWidth="1.8">
                    {getNavIcon(item.icon)}
                  </svg>
                  <span className="nav-text">{item.label}</span>
                  {item.id === 'settings' && unreadCount > 0 && (
                    <span style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', borderRadius: '999px', fontSize: '10px', padding: '1px 6px', minWidth: '18px', textAlign: 'center' }}>
                      {unreadCount}
                    </span>
                  )}
                </a>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar">{initials}</div>
              <div className="user-details">
                <div className="user-name">{currentUser.name}</div>
                <div className="user-role">{getRoleLabel(currentUser.role)}</div>
                {currentUser.linkedHospitalName && (
                  <div className="user-role" style={{ color: 'var(--primary)', marginTop: '2px' }}>
                    🏥 {currentUser.linkedHospitalName}
                  </div>
                )}
              </div>
              <button className="logout-btn" onClick={handleLogout} title="Sign Out">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="main-wrap">
          <header id="topbar">
            <div className="topbar-breadcrumb">
              <h2>{pageTitle}</h2>
              <p>{pageSub}</p>
            </div>
            <div className="topbar-actions">
              {/* Notification Bell */}
              <button className="topbar-badge-btn" onClick={() => { setNotifPanelOpen(!notifPanelOpen); navigateTo('settings'); }}
                title="Notifications" style={{ position: 'relative' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && (
                  <div className="badge-dot" style={{ background: 'var(--danger)', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#fff', fontWeight: '700', top: '4px', right: '4px' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </div>
                )}
              </button>

              <div className="user-chip">
                <div className="user-chip-avatar" style={{ background: currentUser.role === 'super_admin' ? 'var(--danger)' : currentUser.role === 'admin' ? 'var(--warning)' : currentUser.role === 'hospital' ? '#7c5cbf' : currentUser.role === 'doctor' ? '#0891b2' : currentUser.role === 'auditor' ? '#a16207' : currentUser.role === 'data_entry' ? '#7c3aed' : 'var(--primary)' }}>
                  {initials}
                </div>
                <div>
                  <div className="user-chip-name">{currentUser.name.split(' ')[0]}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{getRoleLabel(currentUser.role)}</div>
                  {currentUser.linkedHospitalName && (
                    <div style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: '600' }}>
                      🏥 {currentUser.linkedHospitalName}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Hospital restricted access banner */}
          {isHospitalRestricted && (
            <div style={{ background: 'var(--warning-light)', borderBottom: '1px solid var(--warning)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--warning)' }}>
              <span>⏳</span>
              <span style={{ fontWeight: '600' }}>
                {currentUser.status === 'info_requested' ? 'Action Required:' : 'Pending Approval:'}
              </span>
              <span style={{ color: 'var(--text1)' }}>
                {currentUser.status === 'info_requested'
                  ? 'Admin has requested additional documents. Please upload them in Account Settings.'
                  : 'Your hospital registration is under review. Full access will be granted after approval.'}
              </span>
              <button className="btn btn-sm" style={{ marginLeft: 'auto', background: 'var(--warning)', color: '#fff', border: 'none', padding: '4px 12px', flexShrink: 0 }}
                onClick={() => navigateTo('settings')}>
                {currentUser.status === 'info_requested' ? 'Upload Documents' : 'View Status'}
              </button>
            </div>
          )}

          <div className="content-area">
            {renderPage()}
          </div>
        </div>
      </div>
    </>
  );
}

const getNavIcon = (iconName) => {
  const icons = {
    layout: <><polyline points="3 9 12 2 21 9"/><path d="M3 9v13h6V15h6v7h6V9"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  };
  return icons[iconName] || null;
};

export default App;
