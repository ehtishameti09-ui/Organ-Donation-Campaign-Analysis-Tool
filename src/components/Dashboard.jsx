import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

const Dashboard = ({ user }) => {
  const trendsChartRef = useRef(null);
  const organsChartRef = useRef(null);
  const trendsChartInstance = useRef(null);
  const organsChartInstance = useRef(null);

  useEffect(() => {
    // Initialize charts for admin/super_admin roles
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'hospital') {
      initCharts();
    }

    return () => {
      // Cleanup charts
      if (trendsChartInstance.current) trendsChartInstance.current.destroy();
      if (organsChartInstance.current) organsChartInstance.current.destroy();
    };
  }, [user.role]);

  const initCharts = () => {
    const defaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    };

    // Trends Chart
    if (trendsChartRef.current) {
      const ctx1 = trendsChartRef.current.getContext('2d');
      if (trendsChartInstance.current) trendsChartInstance.current.destroy();
      
      trendsChartInstance.current = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Transplants',
              data: [95, 102, 118, 125, 132, 140],
              borderColor: '#1a5c9e',
              backgroundColor: 'rgba(26,92,158,.08)',
              tension: .3,
              fill: true,
              pointRadius: 4
            },
            {
              label: 'Donors',
              data: [145, 152, 168, 178, 185, 195],
              borderColor: '#0eb07a',
              backgroundColor: 'rgba(14,176,122,.06)',
              tension: .3,
              fill: true,
              pointRadius: 4
            },
          ]
        },
        options: {
          ...defaults,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { boxWidth: 10, font: { size: 11 } }
            }
          },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.04)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // Organs Chart
    if (organsChartRef.current) {
      const ctx2 = organsChartRef.current.getContext('2d');
      if (organsChartInstance.current) organsChartInstance.current.destroy();
      
      organsChartInstance.current = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ['Kidney', 'Liver', 'Heart', 'Lung', 'Others'],
          datasets: [{
            data: [385, 245, 156, 98, 67],
            backgroundColor: ['#1a5c9e', '#0eb07a', '#e8900a', '#7c5cbf', '#d63e3e'],
            borderWidth: 0
          }]
        },
        options: { ...defaults, cutout: '65%' }
      });
    }
  };

  // Render Pending Approval Dashboard for hospitals
  if (user.role === 'hospital' && user.status === 'pending') {
    return (
      <div>
        <div className="card" style={{ borderColor: '#fbbf24', background: '#fef3c7' }}>
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '18px' }}>⏳ Registration Under Review</div>
            <div className="card-sub">Your hospital application is pending admin approval</div>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--text1)' }}>
                🏥 Hospital Information
              </h3>
              <div style={{ background: 'white', padding: '16px', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Hospital Name</div>
                  <div style={{ fontWeight: '600' }}>{user.hospitalName}</div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Registration Number</div>
                  <div style={{ fontWeight: '600' }}>{user.registrationNumber}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Submission Date</div>
                  <div style={{ fontWeight: '600' }}>{user.registrationDate ? new Date(user.registrationDate).toLocaleDateString() : '—'}</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                background: 'white',
                padding: '16px',
                borderRadius: 'var(--radius)',
                borderLeft: '4px solid #fbbf24',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px' }}>🔄</span>
                  Status: <span style={{ marginLeft: '4px', color: '#f59e0b' }}>Pending Review</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.6' }}>
                  Our admin team is reviewing your hospital registration and documents. You will receive an email notification once a decision is made.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--text1)' }}>
                ✅ What You Can Do
              </h3>
              <div style={{ 
                background: 'white',
                padding: '16px',
                borderRadius: 'var(--radius)',
                fontSize: '12px',
                lineHeight: '1.8'
              }}>
                <div style={{ marginBottom: '8px' }}>• Check your email regularly for updates</div>
                <div style={{ marginBottom: '8px' }}>• If additional info is requested, you'll see it here</div>
                <div>• Once approved, you'll have full access to hospital features</div>
              </div>
            </div>

            <div style={{ 
              background: 'white',
              padding: '12px',
              borderRadius: 'var(--radius)',
              fontSize: '12px',
              color: 'var(--text2)',
              textAlign: 'center'
            }}>
              Estimated review time: 2-3 business days
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Pending Info Dashboard for hospitals
  if (user.role === 'hospital' && user.status === 'info_requested') {
    return (
      <div>
        <div className="card" style={{ borderColor: '#ef4444', background: '#fee2e2' }}>
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '18px' }}>📋 Additional Information Requested</div>
            <div className="card-sub">The admin has requested more documentation or information</div>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                background: 'white',
                padding: '16px',
                borderRadius: 'var(--radius)',
                borderLeft: '4px solid #ef4444',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px' }}>⚠️</span>
                  Admin Request
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {user.adminMessage || 'No details provided'}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--text1)' }}>
                📝 Next Steps
              </h3>
              <div style={{ 
                background: 'white',
                padding: '16px',
                borderRadius: 'var(--radius)',
                fontSize: '12px',
                lineHeight: '1.8'
              }}>
                <div style={{ marginBottom: '8px' }}>1. Review the admin's request above</div>
                <div style={{ marginBottom: '8px' }}>2. Gather the required documents or information</div>
                <div style={{ marginBottom: '8px' }}>3. Go to Account Settings to update your profile</div>
                <div>4. Submit the documents for re-review</div>
              </div>
            </div>

            <button 
              className="btn btn-primary"
              onClick={() => window.location.href = '/account-settings'}
              style={{ width: '100%' }}
            >
              Update Your Profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Rejected Dashboard for hospitals
  if (user.role === 'hospital' && user.status === 'rejected') {
    return (
      <div>
        <div className="card" style={{ borderColor: '#ef4444', background: '#fee2e2' }}>
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '18px' }}>✗ Registration Rejected</div>
            <div className="card-sub">Your application was not approved at this time</div>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                background: 'white',
                padding: '16px',
                borderRadius: 'var(--radius)',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px' }}>❌</span>
                  Reason for Rejection
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {user.rejectionReason || 'No details provided'}
                </div>
              </div>
            </div>

            <div style={{ 
              background: 'white',
              padding: '12px 16px',
              borderRadius: 'var(--radius)',
              fontSize: '12px',
              color: 'var(--text2)',
              textAlign: 'center'
            }}>
              Contact support@odcat.com for more information or to reapply
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate Trust Score for hospitals
  const calculateTrustScore = (hospital) => {
    if (!hospital || hospital.role !== 'hospital') return 0;
    
    const docs = hospital.uploadedDocuments || [];
    
    // 40% from Legal Docs (required)
    const hasRegCert = docs.some(d => d.documentType === 'registrationCertificate');
    const hasLicense = docs.some(d => d.documentType === 'healthcareLicense');
    const legalDocs = (hasRegCert ? 20 : 0) + (hasLicense ? 20 : 0);
    
    // 30% from Medical Info (form fields)
    const medicalInfo = (hospital.hospitalName && hospital.registrationNumber && hospital.licenseNumber) ? 30 : 0;
    
    // 30% from Optional Docs
    const hasTaxCert = docs.some(d => d.documentType === 'taxCertificate');
    const hasEthicalPolicy = docs.some(d => d.documentType === 'ethicalPolicy');
    const hasTransplantLicense = docs.some(d => d.documentType === 'transplantLicense');
    const optionalDocs = (hasTaxCert ? 10 : 0) + (hasEthicalPolicy ? 10 : 0) + (hasTransplantLicense ? 10 : 0);
    
    return legalDocs + medicalInfo + optionalDocs;
  };

  const getTrustScoreStatus = (score) => {
    if (score >= 80) return { label: 'Excellent', color: '#10b981' };
    if (score >= 60) return { label: 'Good', color: '#3b82f6' };
    if (score >= 40) return { label: 'Fair', color: '#f59e0b' };
    return { label: 'Incomplete', color: '#ef4444' };
  };

  // Render Admin Dashboard (for approved hospitals, admins, and super admins)
  if ((user.role === 'admin' || user.role === 'super_admin') || (user.role === 'hospital' && user.status === 'approved')) {
    const trustScore = user.role === 'hospital' ? calculateTrustScore(user) : 0;
    const trustStatus = user.role === 'hospital' ? getTrustScoreStatus(trustScore) : null;
    
    return (
      <div>
        <div className={user.role === 'hospital' ? 'grid4' : 'grid4'} style={{ marginBottom: '20px' }}>
          {user.role === 'hospital' && (
            <StatCard
              value={trustScore}
              label="Compliance Score"
              color="blue"
              change={trustStatus.label}
              direction="up"
              icon={<><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></>}
              status={trustStatus.label}
              statusColor={trustStatus.color}
            />
          )}
          {user.role !== 'hospital' && (
            <StatCard
              value="1,247"
              label="Total Transplants"
              color="blue"
              change="+12% vs last month"
              direction="up"
              icon={<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>}
            />
          )}
          <StatCard
            value={user.role === 'hospital' ? '—' : '523'}
            label={user.role === 'hospital' ? 'Hospital Status' : 'Active Donors'}
            color="green"
            change={user.role === 'hospital' ? 'Fully Approved' : '+8 this week'}
            direction="up"
            icon={user.role === 'hospital' ? <><path d="M22 11.08V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6.08"/><polyline points="6 9 12 15 20 7"/></> : <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>}
          />
          <StatCard
            value={user.role === 'hospital' ? (user.uploadedDocuments?.length || 0) : '892'}
            label={user.role === 'hospital' ? 'Documents Uploaded' : 'Waiting Recipients'}
            color="amber"
            change={user.role === 'hospital' ? (user.uploadedDocuments?.length || 0) + ' files' : '-5 from last week'}
            direction={user.role === 'hospital' ? 'up' : 'down'}
            icon={user.role === 'hospital' ? <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="19" x2="12" y2="11"/><line x1="9" y1="14" x2="15" y2="14"/></> : <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>}
          />
          {user.role !== 'hospital' && (
            <StatCard
              value="48"
              label="Partner Hospitals"
              color="purple"
              change="+3 onboarded"
              direction="up"
              icon={<><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M12 7v10M7 12h10"/></>}
            />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header flex justify-between items-center">
              <div>
                <div className="card-title">Performance Trends</div>
                <div className="card-sub">Monthly transplants, donors & recipients</div>
              </div>
            </div>
            <div className="chart-wrap" style={{ height: '220px' }}>
              <canvas ref={trendsChartRef}></canvas>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Organ Distribution</div>
              <div className="card-sub">Current year allocations</div>
            </div>
            <div className="chart-wrap" style={{ height: '180px' }}>
              <canvas ref={organsChartRef}></canvas>
            </div>
            <div className="chart-legend">
              {[
                { label: 'Kidney', color: '#1a5c9e' },
                { label: 'Liver', color: '#0eb07a' },
                { label: 'Heart', color: '#e8900a' },
                { label: 'Lung', color: '#7c5cbf' },
                { label: 'Others', color: '#d63e3e' }
              ].map((item, i) => (
                <div className="legend-item" key={i}>
                  <div className="legend-dot" style={{ background: item.color }}></div>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">System Alerts</div>
              <div className="card-sub">Requires attention</div>
            </div>
            <div className="alert alert-warning">
              <span className="alert-icon">⚠️</span>
              <div className="alert-content">
                <h4>High Wait Time Alert</h4>
                <p>Average kidney wait time increased by 15%. 2h ago</p>
              </div>
            </div>
            <div className="alert alert-success">
              <span className="alert-icon">✅</span>
              <div className="alert-content">
                <h4>Successful Match</h4>
                <p>3 new organ matches found and allocated. 4h ago</p>
              </div>
            </div>
            <div className="alert alert-info">
              <span className="alert-icon">ℹ️</span>
              <div className="alert-content">
                <h4>Algorithm Update</h4>
                <p>Allocation engine updated to v2.1.5. 1d ago</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Activity</div>
            </div>
            <ActivityItem icon="👤" action="New donor registered" user="Sarah Johnson" time="10m ago" />
            <ActivityItem icon="💉" action="Transplant completed" user="City General Hospital" time="1h ago" />
            <ActivityItem icon="🔗" action="Organ matched" user="System Auto-Match" time="2h ago" />
            <ActivityItem icon="🏥" action="Hospital approved" user="Admin Team" time="3h ago" />
            <ActivityItem icon="📋" action="Recipient updated" user="Michael Chen" time="5h ago" />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Upcoming Schedule</div>
            <div className="card-sub">Next 48 hours</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Procedure</th>
                  <th>Hospital</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Kidney Transplant Surgery</strong></td>
                  <td>City General</td>
                  <td>Tomorrow, 9:00 AM</td>
                  <td><span className="badge badge-green">Confirmed</span></td>
                </tr>
                <tr>
                  <td><strong>Donor Screening</strong></td>
                  <td>Memorial MC</td>
                  <td>Tomorrow, 2:00 PM</td>
                  <td><span className="badge badge-blue">Scheduled</span></td>
                </tr>
                <tr>
                  <td><strong>Liver Transplant</strong></td>
                  <td>University Hospital</td>
                  <td>Apr 7, 8:00 AM</td>
                  <td><span className="badge badge-amber">Pending</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Donor Dashboard
  if (user.role === 'donor') {
    return (
      <div>
        <div className="alert alert-success">
          <span className="alert-icon">❤️</span>
          <div className="alert-content">
            <h4>Welcome back, {user.name}!</h4>
            <p>Your donor profile is <strong>Active Donor</strong>. Navigate to "My Donor Profile" to manage your registration.</p>
          </div>
        </div>

        <div className="grid4" style={{ marginBottom: '20px' }}>
          <StatCard
            value="Active"
            label="Verification Status"
            color="green"
            change="✓ Verified"
            direction="up"
            icon={<><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></>}
          />
          <StatCard
            value={user.documentsUploaded || 3}
            label="Documents Uploaded"
            color="blue"
            change="– Required docs complete"
            direction="up"
            icon={<><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></>}
          />
          <StatCard
            value={user.unreadNotifications || 2}
            label="Unread Notifications"
            color="amber"
            change="– Check notifications"
            direction="up"
            icon={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
          />
          <StatCard
            value={user.bloodType || 'B+'}
            label="Organ Pledged"
            color="purple"
            change="– Your donation commitment"
            direction="up"
            icon={<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Your Verification Progress</div>
              <div className="card-sub">Complete steps to activate</div>
            </div>
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: '40px', height: '40px', background: '#0eb07a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 6px' }}>✓</div>
                <div style={{ fontSize: '12px', fontWeight: '500' }}>Registered</div>
              </div>
              <div style={{ width: '40px', height: '2px', background: '#0eb07a' }}></div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: '40px', height: '40px', background: '#0eb07a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 6px' }}>✓</div>
                <div style={{ fontSize: '12px', fontWeight: '500' }}>Submitted</div>
              </div>
              <div style={{ width: '40px', height: '2px', background: '#0eb07a' }}></div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: '40px', height: '40px', background: '#0eb07a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 6px' }}>✓</div>
                <div style={{ fontSize: '12px', fontWeight: '500' }}>Under Review</div>
              </div>
              <div style={{ width: '40px', height: '2px', background: '#0eb07a' }}></div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: '40px', height: '40px', background: '#0eb07a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 6px' }}>✓</div>
                <div style={{ fontSize: '12px', fontWeight: '500' }}>Approved</div>
              </div>
              <div style={{ width: '40px', height: '2px', background: '#1a5c9e' }}></div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: '40px', height: '40px', background: '#1a5c9e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 6px' }}>5</div>
                <div style={{ fontSize: '12px', fontWeight: '500' }}>Active Donor</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Document Checklist</div>
              <div className="card-sub">Required documentation</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px' }}>ID Proof</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0eb07a' }}>✓ Uploaded</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px' }}>Medical Certificate</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0eb07a' }}>✓ Uploaded</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px' }}>Consent Form</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0eb07a' }}>✓ Uploaded</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px' }}>Blood Report</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#d63e3e' }}>✗ Missing</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Notifications</div>
            <div className="card-sub">Latest updates</div>
          </div>
          <ActivityItem icon="✅" action="Your donation profile is now active" user="System" time="4/7/2026" />
          <ActivityItem icon="📋" action="Your donor registration has been submitted for verification" user="System" time="3/28/2026" />
          <ActivityItem icon="🔗" action="Your documents are currently under admin review" user="System" time="3/31/2026" />
          <ActivityItem icon="✓" action="Congratulations! Your donor profile has been verified and approved" user="System" time="4/4/2026" />
        </div>

        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <div className="card-title">Next Steps</div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginBottom: '10px' }}>
            → Go to My Donor Profile
          </button>
          <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Manage your donor registration, update documents, and track your contribution to the organ donation network.</p>
        </div>
      </div>
    );
  }

  // Recipient Dashboard
  if (user.role === 'recipient') {
    return (
      <div>
        <div className="alert alert-warning">
          <span className="alert-icon">⚠️</span>
          <div className="alert-content">
            <h4>Welcome back, {user.name}!</h4>
            <p>Your case status is <strong>eligible</strong>. Navigate to "My Case File" to update clinical data and track your position.</p>
          </div>
        </div>

        <div className="grid4" style={{ marginBottom: '20px' }}>
          <StatCard
            value={user.caseStatus || 'Eligible'}
            label="Case Status"
            color="blue"
            change="– Medical approved"
            direction="up"
            icon={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
          />
          <StatCard
            value={user.daysOnWaitlist || 67}
            label="Days on Waitlist"
            color="amber"
            change="– Since registration"
            direction="up"
            icon={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
          />
          <StatCard
            value={(user.urgencyScore || 7.2) + '/10'}
            label="Urgency Score"
            color="green"
            change="– Last submitted"
            direction="up"
            icon={<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
          />
          <StatCard
            value={(user.survivalEstimate || '77') + '%'}
            label="Survival Estimate"
            color="purple"
            change="– Auto-calculated"
            direction="up"
            icon={<path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 2.2"/>}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Case Status Journey</div>
              <div className="card-sub">Your registration progress</div>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ width: '36px', height: '36px', background: '#0eb07a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 4px', fontSize: '14px' }}>✓</div>
                  <div style={{ fontSize: '11px' }}>Registered</div>
                </div>
                <div style={{ width: '32px', height: '2px', background: '#0eb07a', alignSelf: 'flex-start', marginTop: '18px', marginLeft: '-8px' }}></div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ width: '36px', height: '36px', background: '#0eb07a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 4px', fontSize: '14px' }}>✓</div>
                  <div style={{ fontSize: '11px' }}>Verified</div>
                </div>
                <div style={{ width: '32px', height: '2px', background: '#0eb07a', alignSelf: 'flex-start', marginTop: '18px', marginLeft: '-8px' }}></div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ width: '36px', height: '36px', background: '#1a5c9e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', margin: '0 auto 4px', fontSize: '14px' }}>3</div>
                  <div style={{ fontSize: '11px' }}>Eligible</div>
                </div>
                <div style={{ width: '32px', height: '2px', background: '#ccc', alignSelf: 'flex-start', marginTop: '18px', marginLeft: '-8px' }}></div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ width: '36px', height: '36px', background: '#ccc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontWeight: '700', margin: '0 auto 4px', fontSize: '14px' }}>4</div>
                  <div style={{ fontSize: '11px' }}>Active</div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '12px' }}>
                Accounts created
                <br/>Docs confirmed
                <br/>Medical approved
                <br/>On waitlist
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Waiting Time Comparison</div>
              <div className="card-sub">Your wait vs system average</div>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Your Wait</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a5c9e' }}>{user.daysOnWaitlist || 67} days</div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '4px' }}>Avg for {user.organNeeded}</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>147 days</div>
                <div style={{ height: '6px', background: 'var(--surface2)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#1a5c9e', width: '100%' }}></div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                <strong>System Averages</strong><br/>
                Kidney: 147d avg. | Liver: 89d avg. | Heart: 62d avg. | Lung: 134d avg. | Cornea: 45d avg.
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Clinical Summary</div>
            <div className="card-sub">Your medical profile</div>
          </div>
          <div style={{ display: 'flex', gap: '24px', padding: '16px', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Organ Needed</div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.organNeeded}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Diagnosis</div>
              <div style={{ fontSize: '13px' }}>{user.diagnosis}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Urgency</div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.urgency || 7.2}/10</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Comorbidity</div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.comorbidity || 3.5}/10</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Survival Est.</div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.survivalEstimate || '77'}%</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <div className="card-title">Next Steps</div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginBottom: '10px' }}>
            → Go to My Case File
          </button>
          <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Update your clinical data, track your position on the waitlist, and manage your medical information.</p>
        </div>
      </div>
    );
  }

  // Default dashboard for unknown roles
  return (
    <div>
      <div className="alert alert-info">
        <span className="alert-icon">ℹ️</span>
        <div className="alert-content">
          <h4>Welcome to ODCAT, {user.name}!</h4>
          <p>Your role: <strong>{user.role}</strong></p>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Dashboard</div>
        <p style={{ color: 'var(--text2)', marginTop: '8px' }}>Dashboard content for your role is being developed.</p>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ value, label, color, change, direction, icon, status, statusColor }) => {
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>
        <svg viewBox="0 0 24 24" strokeWidth="1.8">
          {icon}
        </svg>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {status && statusColor ? (
        <div style={{ fontSize: '12px', fontWeight: '600', color: statusColor }}>
          {status}
        </div>
      ) : (
        <div className={`stat-change ${direction}`}>
          {arrow} {change}
        </div>
      )}
    </div>
  );
};

// Activity Item Component
const ActivityItem = ({ icon, action, user, time }) => {
  return (
    <div className="flex items-center gap-3" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: '32px', height: '32px', background: 'var(--surface3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: '500' }}>{action}</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{user}</div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{time}</div>
    </div>
  );
};

export default Dashboard;
