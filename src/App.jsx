import { useState, useEffect, lazy, Suspense } from 'react';
import { getCurrentUser, logout, initSuperAdmin, login, getUnreadNotifications } from './utils/auth';
import { getMeViaAPI } from './utils/api';
import { toast } from './utils/toast';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
// Heavy pages — lazy-loaded so they don't bloat the initial bundle
const UserManagement     = lazy(() => import('./components/UserManagement'));
const AccountSettings    = lazy(() => import('./components/AccountSettings'));
const DonorManagement    = lazy(() => import('./components/DonorManagement'));
const RecipientManagement = lazy(() => import('./components/RecipientManagement'));
const DonorRecipientWizard = lazy(() => import('./components/DonorRecipientWizard'));
const EmployeeManagement = lazy(() => import('./components/EmployeeManagement'));
const DoctorDashboard    = lazy(() => import('./components/DoctorDashboard'));
const DataEntryDashboard = lazy(() => import('./components/DataEntryDashboard'));
const AuditorDashboard   = lazy(() => import('./components/AuditorDashboard'));
const AllocationEngine   = lazy(() => import('./components/AllocationEngine'));
const MatchingGovernance = lazy(() => import('./components/MatchingGovernance'));
const FairnessLab        = lazy(() => import('./components/FairnessLab'));
const AdminRequests      = lazy(() => import('./components/AdminRequests'));
const HospitalRegistrationForm = lazy(() => import('./components/HospitalRegistrationForm'));
import './styles/App.css';

const PageLoader = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)', fontSize: '13px' }}>
    Loading…
  </div>
);

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settingsTab, setSettingsTab] = useState(null);
  // Pages the user has visited at least once — they stay mounted in the DOM for instant re-display
  const [visitedPages, setVisitedPages] = useState(() => new Set(['dashboard']));

  // Track every page visit
  useEffect(() => {
    setVisitedPages(prev => prev.has(currentPage) ? prev : new Set([...prev, currentPage]));
  }, [currentPage]);

  // Wipe the visit memory when the user changes (login/logout) so role-restricted pages from previous sessions don't bleed in
  useEffect(() => {
    setVisitedPages(new Set(['dashboard']));
  }, [currentUser?.id]);

  // Sync browser back/forward with app page state
  useEffect(() => {
    const handlePopState = (e) => {
      const page = e.state?.page || 'dashboard';
      const tab = e.state?.settingsTab || null;
      setCurrentPage(page);
      setSettingsTab(tab);
    };
    window.addEventListener('popstate', handlePopState);
    // Replace the initial history entry so state is set from the start
    window.history.replaceState({ page: 'dashboard', settingsTab: null }, '');
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Global 401 interceptor — when the backend rejects a stale token, log the user out cleanly
  // instead of leaving them on a half-loaded page.
  // Skipped if the user just deliberately logged out OR if it's a login/register/logout endpoint.
  useEffect(() => {
    const origFetch = window.fetch;
    let alreadyHandled = false;
    window.fetch = async (...args) => {
      const response = await origFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const isApi = url && url.includes('/api/');
      const isAuthEndpoint = url && (url.includes('/api/login') || url.includes('/api/register') || url.includes('/api/logout'));
      // Suppress for ~3s after a deliberate logout — any in-flight calls from kept-mounted pages will 401 and we ignore those
      const recentlyLoggedOut = window.__odcatLogoutAt && (Date.now() - window.__odcatLogoutAt < 3000);
      if (response.status === 401 && isApi && !isAuthEndpoint && !recentlyLoggedOut && !alreadyHandled) {
        alreadyHandled = true;
        localStorage.removeItem('odcat_token');
        localStorage.removeItem('odcat_user');
        localStorage.removeItem('odcat_current');
        window.dispatchEvent(new CustomEvent('auth:expired'));
        setTimeout(() => { alreadyHandled = false; }, 1500);
      }
      return response;
    };
    return () => { window.fetch = origFetch; };
  }, []);

  useEffect(() => {
    const handler = () => {
      if (currentUser) {
        toast('Your session has expired. Please log in again.', 'warning');
        setCurrentUser(null);
        setCurrentPage('dashboard');
        setSettingsTab(null);
      }
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [currentUser]);

  useEffect(() => {
    initSuperAdmin();

    // Handle Google OAuth callbacks — four URL shapes from the backend:
    //   ?error=...                                  → friendly error toast
    //   ?token=...&user_id=...                      → existing user signed in, finalize session
    //   ?google_pending=...&name=...&email=…        → new user, show role picker
    //   ?google_2fa=...&masked_email=...            → 2FA challenge, show OTP modal
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('token');
    const oauthError = params.get('error');
    const googlePending = params.get('google_pending');
    const google2FA = params.get('google_2fa');

    if (oauthError) {
      toast(decodeURIComponent(oauthError), 'error');
      window.history.replaceState({ page: 'dashboard', settingsTab: null }, '', window.location.pathname);
      return;
    }

    if (google2FA) {
      // Stash for Login.jsx to pick up and open the OTP modal
      window.__google2FA = {
        challengeToken: google2FA,
        maskedEmail: params.get('masked_email') || '',
      };
      window.history.replaceState({ page: 'dashboard', settingsTab: null }, '', window.location.pathname);
      window.dispatchEvent(new CustomEvent('google:2fa-open'));
      return;
    }

    if (googlePending) {
      // Stash on window so Login.jsx can read it and show the role picker. Clean URL too.
      window.__googlePending = {
        token: googlePending,
        name:  params.get('name') || '',
        email: params.get('email') || '',
      };
      window.history.replaceState({ page: 'dashboard', settingsTab: null }, '', window.location.pathname);
      // Force re-render of Login to pick up the pending state
      window.dispatchEvent(new CustomEvent('google:role-picker-open'));
      return;
    }

    if (oauthToken) {
      localStorage.setItem('odcat_token', oauthToken);
      window.history.replaceState({ page: 'dashboard', settingsTab: null }, '', window.location.pathname);
      getMeViaAPI()
        .then(user => {
          localStorage.setItem('odcat_user', JSON.stringify(user));
          localStorage.setItem('odcat_current', JSON.stringify(user));
          setCurrentUser(user);
          toast(`Welcome, ${user.name?.split(' ')[0] || 'User'}!`, 'success');
        })
        .catch(() => {
          localStorage.removeItem('odcat_token');
          toast('Google sign-in failed. Please try again.', 'error');
        });
      return;
    }

    const token = localStorage.getItem('odcat_token');
    const cached = getCurrentUser();
    if (!token || !cached) return; // no session to restore
    // Show cached user immediately for instant UI, then validate token in background
    setCurrentUser(cached);
    getMeViaAPI()
      .then(fresh => setCurrentUser(fresh))
      .catch(() => {
        // Token expired or revoked — clear everything and show login
        localStorage.removeItem('odcat_token');
        localStorage.removeItem('odcat_user');
        localStorage.removeItem('odcat_current');
        setCurrentUser(null);
      });
  }, []);

  useEffect(() => {
    if (!currentUser || !localStorage.getItem('odcat_token')) {
      setUnreadCount(0);
      return;
    }
    const refresh = () => {
      getUnreadNotifications(currentUser.id)
        .then(unread => setUnreadCount(unread.length))
        .catch(() => setUnreadCount(0));
    };
    refresh();
    // Poll the unread count every 30s so the topbar badge stays current
    const intervalId = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentUser?.id]);

  // Refresh current user from API
  const refreshCurrentUser = async () => {
    try {
      const user = await getMeViaAPI();
      if (user) {
        localStorage.setItem('odcat_current', JSON.stringify(user));
        setCurrentUser(user);
      }
    } catch {
      const user = getCurrentUser();
      if (user) setCurrentUser(user);
    }
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    // Brand-new accounts that haven't completed registration yet → take them straight to the role-specific form.
    // `registrationComplete` is set by the wizard / hospital form on completion.
    if (user.registrationComplete === false || user.registration_complete === false) {
      if (user.role === 'donor' || user.role === 'recipient') {
        setCurrentPage('complete-registration');   // → DonorRecipientWizard
        return;
      }
      if (user.role === 'hospital') {
        setCurrentPage('complete-hospital-registration');  // → HospitalRegistrationForm
        return;
      }
    }
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    // Mark the moment so the 401 interceptor knows any subsequent 401s are just leftover
    // calls from kept-mounted pages — NOT a session expiry.
    window.__odcatLogoutAt = Date.now();
    setCurrentUser(null);
    setCurrentPage('dashboard');
    setSettingsTab(null);
    setUnreadCount(0);
    logout();
    toast('Signed out successfully.', 'info');
  };

  const navigateTo = (page, tab = null) => {
    const newTab = page === 'settings' ? tab : null;
    window.history.pushState({ page, settingsTab: newTab }, '');
    setCurrentPage(page);
    setSettingsTab(newTab);
    refreshCurrentUser();
  };

  if (!currentUser && showRegister) {
    return (
      <>
        <div id="toast-container" className="toast-container"></div>
        <Register
          onRegistrationSuccess={async (regData) => {
            try {
              const loginResult = await login(regData.email, regData.password);
              setCurrentUser(loginResult);
              setShowRegister(false);
              if (regData.type === 'hospital') {
                toast(`Welcome, ${loginResult.name}! Your registration is under review.`, 'success');
              } else {
                toast(`Welcome, ${loginResult.name}! Your account is ready.`, 'success');
              }
            } catch {
              setShowRegister(false);
              toast('Registration complete! Please sign in.', 'success');
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
      items.push({ id: 'admin-requests', label: 'Admin Management', icon: 'inbox' });
    }

    if (currentUser.role === 'admin') {
      items.push({ id: 'users', label: 'User Management', icon: 'users' });
      items.push({ id: 'employees', label: 'Employees', icon: 'briefcase' });
      items.push({ id: 'donors', label: 'Donor Management', icon: 'heart' });
      items.push({ id: 'recipients', label: 'Recipients', icon: 'activity' });
      // Modules 4/5/6: only for hospital-linked admins, never super_admin or general admins (bias prevention)
      if (currentUser.linkedHospitalId) {
        items.push({ id: 'allocation', label: 'Allocation Engine', icon: 'cpu' });
        items.push({ id: 'matching', label: 'Matching & Governance', icon: 'shield' });
        items.push({ id: 'fairness', label: 'Fairness Lab', icon: 'scale' });
      }
    }

    if (currentUser.role === 'hospital' && currentUser.status === 'approved') {
      items.push({ id: 'admin-requests', label: 'Admin Management', icon: 'inbox' });
      items.push({ id: 'donors', label: 'Donor Management', icon: 'heart' });
      items.push({ id: 'recipients', label: 'Recipients', icon: 'activity' });
      items.push({ id: 'allocation', label: 'Allocation Engine', icon: 'cpu' });
      items.push({ id: 'matching', label: 'Matching & Governance', icon: 'shield' });
      items.push({ id: 'fairness', label: 'Fairness Lab', icon: 'scale' });
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

  // Keep-mounted page system: each visited page mounts ONCE then stays in the DOM (hidden when inactive),
  // so revisiting is instant — no re-fetch, scroll positions and form state preserved.
  // First visit incurs the lazy-load + data-fetch; every subsequent visit is ~0ms.
  const allowedFor = (page) => {
    if (isHospitalRestricted && page !== 'settings' && page !== 'dashboard') return false;
    switch (page) {
      case 'dashboard':         return true;
      case 'users':             return currentUser.role === 'super_admin' || currentUser.role === 'admin';
      case 'donors':            return currentUser.role === 'admin' || (currentUser.role === 'hospital' && currentUser.status === 'approved');
      case 'recipients':        return currentUser.role === 'admin' || (currentUser.role === 'hospital' && currentUser.status === 'approved');
      case 'employees':         return currentUser.role === 'super_admin' || currentUser.role === 'admin';
      case 'doctor-review':     return currentUser.role === 'doctor';
      case 'data-entry':        return currentUser.role === 'data_entry';
      case 'audit':             return currentUser.role === 'auditor';
      case 'admin-requests':    return currentUser.role === 'super_admin' || (currentUser.role === 'hospital' && currentUser.status === 'approved');
      case 'allocation':
      case 'matching':
      case 'fairness':          return (currentUser.role === 'hospital' && currentUser.status === 'approved') ||
                                       (currentUser.role === 'admin' && !!currentUser.linkedHospitalId);
      case 'settings':          return true;
      case 'complete-registration': return currentUser.role === 'donor' || currentUser.role === 'recipient';
      case 'complete-hospital-registration': return currentUser.role === 'hospital';
      default:                  return true;
    }
  };

  const renderPage = () => {
    // Pages built once, kept in the DOM (display: none when inactive)
    const keepMountedPages = [
      { id: 'dashboard',       el: <Dashboard user={currentUser} onNavigate={navigateTo} /> },
      { id: 'users',           el: <UserManagement currentUser={currentUser} onUserUpdated={refreshCurrentUser} /> },
      { id: 'donors',          el: <DonorManagement currentUser={currentUser} /> },
      { id: 'recipients',      el: <RecipientManagement currentUser={currentUser} /> },
      { id: 'employees',       el: <EmployeeManagement currentUser={currentUser} /> },
      { id: 'doctor-review',   el: <DoctorDashboard currentUser={currentUser} /> },
      { id: 'data-entry',      el: <DataEntryDashboard currentUser={currentUser} /> },
      { id: 'audit',           el: <AuditorDashboard currentUser={currentUser} /> },
      { id: 'admin-requests',  el: <AdminRequests currentUser={currentUser} /> },
      { id: 'allocation',      el: <AllocationEngine currentUser={currentUser} /> },
      { id: 'matching',        el: <MatchingGovernance currentUser={currentUser} /> },
      { id: 'fairness',        el: <FairnessLab currentUser={currentUser} /> },
    ];

    // Settings + Wizard remount per session (have state tied to context like settingsTab / wizard mode) — render only when active
    const transientPage = (() => {
      if (currentPage === 'settings') {
        return (
          <AccountSettings
            user={currentUser}
            initialTab={settingsTab}
            onNavigate={(page, tab) => navigateTo(page, tab)}
            onUpdate={(updatedUser) => {
              setCurrentUser(updatedUser);
              localStorage.setItem('odcat_current', JSON.stringify(updatedUser));
            }}
          />
        );
      }
      if (currentPage === 'complete-registration' && (currentUser.role === 'donor' || currentUser.role === 'recipient')) {
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
      }
      if (currentPage === 'complete-hospital-registration' && currentUser.role === 'hospital') {
        return (
          <HospitalRegistrationForm
            user={currentUser}
            onComplete={() => {
              refreshCurrentUser();
              navigateTo('dashboard');
            }}
          />
        );
      }
      return null;
    })();

    return (
      <>
        {keepMountedPages.map(p => {
          const isActive = currentPage === p.id;
          // Mount lazily on first visit; once visited, stay in DOM. Skip pages the role can't access.
          if (!visitedPages.has(p.id) && !isActive) return null;
          if (!allowedFor(p.id)) return null;
          return (
            <div key={p.id} style={{ display: isActive ? 'block' : 'none' }}>
              {p.el}
            </div>
          );
        })}
        {transientPage}
        {/* Fallback: if the active page is something not in our keep-mounted list and not transient, show Dashboard */}
        {!keepMountedPages.some(p => p.id === currentPage) && !transientPage && (
          <Dashboard user={currentUser} onNavigate={navigateTo} />
        )}
      </>
    );
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
      allocation: { title: 'Allocation Engine', sub: 'Explainable, version-controlled organ allocation with simulation' },
      matching:   { title: 'Matching & Governance', sub: 'Compatibility rules, hospital distances, override accountability' },
      fairness:   { title: 'Fairness Lab', sub: 'Auto-running fairness analysis, sensitivity reports, bias detection' },
      'admin-requests': { title: 'Admin Management', sub: 'Request, review, and manage hospital admin accounts.' },
      settings: { title: 'Account Settings', sub: 'Update your profile and preferences' },
      'complete-registration': { title: 'Complete Registration', sub: 'Sign the consent form, submit clinical info, and upload documents' },
      'complete-hospital-registration': { title: 'Complete Hospital Registration', sub: 'Provide hospital details for super admin review' },
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
                <h1>Organ Donation Campaign Analysis Tool</h1>
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
                  onClick={(e) => { e.preventDefault(); !isDisabled && navigateTo(item.id); }}
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
                {(currentUser.linkedHospitalName || (currentUser.role === 'hospital' && currentUser.hospitalName)) && (
                  <div className="user-role" style={{ color: 'var(--primary)', marginTop: '2px' }}>
                    🏥 {currentUser.linkedHospitalName || currentUser.hospitalName}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h2 style={{ marginBottom: 0 }}>{pageTitle}</h2>
                {(currentUser.linkedHospitalName || (currentUser.role === 'hospital' && currentUser.hospitalName)) && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: 'var(--primary-light)',
                    border: '1px solid rgba(26,92,158,.2)',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--primary)',
                    whiteSpace: 'nowrap',
                  }}>
                    🏥 {currentUser.linkedHospitalName || currentUser.hospitalName}
                  </span>
                )}
              </div>
              <p style={{ marginTop: '2px' }}>{pageSub}</p>
            </div>
            <div className="topbar-actions">
              {/* Notification Bell */}
              <button className="topbar-badge-btn" onClick={() => navigateTo('settings', 'activity')}
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

              <div className="user-chip" onClick={() => navigateTo('settings')} style={{ cursor: 'pointer' }} title="Account Settings">
                <div className="user-chip-avatar" style={{ background: currentUser.role === 'super_admin' ? 'var(--danger)' : currentUser.role === 'admin' ? 'var(--warning)' : currentUser.role === 'hospital' ? '#7c5cbf' : currentUser.role === 'doctor' ? '#0891b2' : currentUser.role === 'auditor' ? '#a16207' : currentUser.role === 'data_entry' ? '#7c3aed' : 'var(--primary)' }}>
                  {initials}
                </div>
                <div>
                  <div className="user-chip-name">{currentUser.name.split(' ')[0]}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{getRoleLabel(currentUser.role)}</div>
                  {(currentUser.linkedHospitalName || (currentUser.role === 'hospital' && currentUser.hospitalName)) && (
                    <div style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: '600' }}>
                      🏥 {currentUser.linkedHospitalName || currentUser.hospitalName}
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
            <Suspense fallback={<PageLoader />}>
              {renderPage()}
            </Suspense>
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
    cpu: <><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    scale: <><path d="M12 3v18"/><path d="M5 8h14"/><path d="M5 8 2 14h6L5 8z"/><path d="M19 8l-3 6h6l-3-6z"/><path d="M5 21h14"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  };
  return icons[iconName] || null;
};

export default App;
