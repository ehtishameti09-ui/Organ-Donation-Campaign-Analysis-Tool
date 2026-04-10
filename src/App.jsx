import { useState, useEffect } from 'react';
import { getCurrentUser, logout, initSuperAdmin, login } from './utils/auth';
import { toast } from './utils/toast';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';
import AccountSettings from './components/AccountSettings';
import './styles/App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    // Initialize super admin if not exists
    initSuperAdmin();
    
    // Check for existing session
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setCurrentPage('dashboard');
    toast('Signed out successfully.', 'info');
  };

  const navigateTo = (page) => {
    setCurrentPage(page);
  };

  if (!currentUser && showRegister) {
    return (
      <>
        <div id="toast-container" className="toast-container"></div>
        <Register 
          onRegistrationSuccess={(user) => {
            // For donor/recipient, auto-login with password
            const fullUser = login(user.email, user.password);
            if (fullUser) {
              setCurrentUser(fullUser);
              setShowRegister(false);
              toast(`Welcome, ${fullUser.name}! You're now logged in.`, 'success');
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
      { id: 'dashboard', label: 'Dashboard', icon: 'layout', roles: ['super_admin', 'admin', 'hospital', 'donor', 'recipient'] }
    ];

    if (currentUser.role === 'super_admin' || currentUser.role === 'admin') {
      items.push({ id: 'users', label: 'User Management', icon: 'users', roles: ['super_admin', 'admin'] });
    }

    if (currentUser.role === 'hospital') {
      items.push({ id: 'settings', label: 'Account Settings', icon: 'settings', roles: ['hospital'] });
    }

    return items.filter(item => item.roles.includes(currentUser.role));
  };

  const navItems = getNavItems();
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard user={currentUser} />;
      case 'users':
        return <UserManagement currentUser={currentUser} />;
      case 'settings':
        return (
          <AccountSettings 
            user={currentUser} 
            onUpdate={(updatedUser) => {
              setCurrentUser(updatedUser);
            }} 
          />
        );
      default:
        return <Dashboard user={currentUser} />;
    }
  };

  const getPageTitle = () => {
    const titles = {
      dashboard: 'Dashboard Overview',
      users: 'User Management',
      settings: 'Account Settings'
    };
    return titles[currentPage] || 'Dashboard';
  };

  const getPageSubtitle = () => {
    const subtitles = {
      dashboard: 'Monitor system performance and key metrics',
      users: 'Manage user accounts and permissions',
      settings: 'Update your profile and manage documents'
    };
    return subtitles[currentPage] || '';
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
            <button className="sidebar-toggle-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2.5">
                {sidebarCollapsed ? (
                  <path d="M9 18l6-6-6-6"/>
                ) : (
                  <path d="M15 18l-6-6 6-6"/>
                )}
              </svg>
            </button>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section-label">Main Navigation</div>
            {navItems.map(item => (
              <a
                key={item.id}
                className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => navigateTo(item.id)}
                href="#"
              >
                <svg className="nav-icon" viewBox="0 0 24 24" strokeWidth="1.8">
                  {getNavIcon(item.icon)}
                </svg>
                <span className="nav-text">{item.label}</span>
              </a>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar">{initials}</div>
              <div className="user-details">
                <div className="user-name">{currentUser.name}</div>
                <div className="user-role">{currentUser.role.replace('_', ' ')}</div>
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
              <h2>{getPageTitle()}</h2>
              <p>{getPageSubtitle()}</p>
            </div>
            <div className="topbar-actions">
              <div className="user-chip">
                <div className="user-chip-avatar">{initials}</div>
                <span className="user-chip-name">{currentUser.name.split(' ')[0]}</span>
              </div>
            </div>
          </header>

          <div className="content-area">
            {renderPage()}
          </div>
        </div>
      </div>
    </>
  );
}

// Helper function for navigation icons
const getNavIcon = (iconName) => {
  const icons = {
    layout: (
      <>
        <polyline points="3 9 12 2 21 9"/>
        <rect x="9" y="22" width="6" height="6"/>
        <path d="M3 9v13h6V15h6v7h6V9"/>
      </>
    ),
    users: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v6m0 2v6M4.22 4.22l4.24 4.24m2.12 2.12l4.24 4.24M1 12h6m2 0h6m-9.78 7.78l4.24-4.24m2.12-2.12l4.24-4.24M1 12a11 11 0 1 0 22 0 11 11 0 0 0-22 0z"/>
      </>
    )
  };
  
  return icons[iconName] || null;
};

export default App;
