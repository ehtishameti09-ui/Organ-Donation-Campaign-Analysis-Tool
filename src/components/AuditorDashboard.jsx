import { useState, useMemo } from 'react';
import { getAllUsers, getActionLogs, getAppeals, getRecentActivities, getDonors, getRecipients, getVerificationMetrics } from '../utils/auth';

const AuditorDashboard = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [logFilter, setLogFilter] = useState('all');
  const [logSearch, setLogSearch] = useState('');

  const users = useMemo(() => getAllUsers(), []);
  const actionLogs = useMemo(() => getActionLogs(), []);
  const appeals = useMemo(() => getAppeals(), []);
  const activities = useMemo(() => getRecentActivities(50), []);
  const donors = useMemo(() => getDonors(), []);
  const recipients = useMemo(() => getRecipients(), []);
  const metrics = useMemo(() => getVerificationMetrics(), []);

  const filteredLogs = useMemo(() => {
    let logs = actionLogs;
    if (logFilter !== 'all') logs = logs.filter(l => l.actionType === logFilter);
    if (logSearch) {
      const s = logSearch.toLowerCase();
      logs = logs.filter(l => l.reason.toLowerCase().includes(s) || l.actionType.toLowerCase().includes(s) || l.userId.toLowerCase().includes(s));
    }
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [actionLogs, logFilter, logSearch]);

  const logTypes = useMemo(() => {
    const types = new Set(actionLogs.map(l => l.actionType));
    return Array.from(types);
  }, [actionLogs]);

  const stats = useMemo(() => ({
    totalUsers: users.filter(u => !u.deleted).length,
    banned: users.filter(u => u.banned).length,
    deleted: users.filter(u => u.deleted).length,
    pendingAppeals: appeals.filter(a => a.status === 'pending').length,
    totalDonors: donors.length,
    totalRecipients: recipients.length,
    approvedDonors: metrics.approved,
    rejectedDonors: metrics.rejected,
    hospitals: users.filter(u => u.role === 'hospital' && !u.deleted).length,
    pendingHospitals: users.filter(u => u.role === 'hospital' && u.status === 'pending').length,
  }), [users, appeals, donors, recipients, metrics]);

  const getUserName = (userId) => {
    const u = users.find(u => u.id === userId);
    return u ? u.name : userId;
  };

  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getActionColor = (type) => {
    if (type.includes('ban') || type.includes('delete')) return 'var(--danger)';
    if (type.includes('approve') || type.includes('restore')) return 'var(--accent)';
    if (type.includes('appeal')) return 'var(--warning)';
    if (type.includes('reset') || type.includes('update')) return 'var(--primary)';
    return 'var(--text2)';
  };

  return (
    <div>
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg, #1a5c9e 0%, #0f3f70 100%)', borderRadius: 'var(--radius-lg)', padding: '24px 28px', marginBottom: '24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>Audit Dashboard</div>
          <div style={{ fontSize: '13px', opacity: .8 }}>Read-only system overview. All data is view-only for compliance and auditing.</div>
        </div>
        <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,.15)', borderRadius: 'var(--radius)', fontSize: '12px', fontWeight: '600' }}>
          Read-Only Access
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid4" style={{ marginBottom: '24px' }}>
        {[
          { label: 'Total Users', value: stats.totalUsers, color: 'var(--primary)', bg: 'var(--primary-light)' },
          { label: 'Active Donors', value: stats.totalDonors, color: 'var(--danger)', bg: 'var(--danger-light)' },
          { label: 'Active Recipients', value: stats.totalRecipients, color: 'var(--accent)', bg: 'var(--accent-light)' },
          { label: 'Pending Appeals', value: stats.pendingAppeals, color: 'var(--warning)', bg: 'var(--warning-light)' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px', background: 'var(--surface3)', borderRadius: 'var(--radius)', padding: '3px' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'logs', label: `Audit Logs (${actionLogs.length})` },
          { id: 'users', label: `Users (${users.filter(u => !u.deleted).length})` },
          { id: 'appeals', label: `Appeals (${appeals.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all .2s',
              background: activeTab === t.id ? 'var(--surface)' : 'transparent', color: activeTab === t.id ? 'var(--primary)' : 'var(--text3)', boxShadow: activeTab === t.id ? 'var(--shadow-sm)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid2">
          {/* System Health */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text1)', marginBottom: '16px' }}>System Summary</h4>
            {[
              { label: 'Hospitals', value: stats.hospitals, sub: `${stats.pendingHospitals} pending` },
              { label: 'Donor Verification', value: `${stats.approvedDonors} approved`, sub: `${stats.rejectedDonors} rejected` },
              { label: 'Banned Users', value: stats.banned },
              { label: 'Deleted Users', value: stats.deleted },
              { label: 'Total Action Logs', value: actionLogs.length },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{item.label}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text1)' }}>{item.value}</span>
                  {item.sub && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{item.sub}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text1)', marginBottom: '16px' }}>Recent Activity</h4>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {activities.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>No recent activity.</div>}
              {activities.slice(0, 15).map((act, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: '28px', height: '28px', background: 'var(--surface2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
                    {act.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text1)' }}>{act.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{act.description}</div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>{timeAgo(act.timestamp)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'logs' && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input className="form-input" placeholder="Search logs..." value={logSearch} onChange={e => setLogSearch(e.target.value)} style={{ flex: 1, minWidth: '180px' }} />
            <select className="form-input" value={logFilter} onChange={e => setLogFilter(e.target.value)} style={{ width: '200px' }}>
              <option value="all">All Actions</option>
              {logTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                {['Time', 'Action', 'User', 'Reason', 'Admin'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>No logs found.</td></tr>
              )}
              {filteredLogs.slice(0, 50).map((log, i) => (
                <tr key={log.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '600', background: getActionColor(log.actionType) + '18', color: getActionColor(log.actionType) }}>
                      {log.actionType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text1)', fontWeight: '500' }}>{getUserName(log.userId)}</td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text2)', maxWidth: '300px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.reason}</div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text3)' }}>{log.adminId ? getUserName(log.adminId) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                {['Name', 'Email', 'Role', 'Status', 'Registered'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.filter(u => !u.deleted).map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{u.name}</td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text2)' }}>{u.email}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                      background: u.role === 'super_admin' ? 'var(--danger-light)' : u.role === 'admin' ? 'var(--warning-light)' : u.role === 'hospital' ? '#f3f0ff' : u.role === 'donor' ? 'var(--danger-light)' : u.role === 'doctor' ? 'var(--primary-light)' : u.role === 'auditor' ? 'var(--warning-light)' : 'var(--accent-light)',
                      color: u.role === 'super_admin' ? 'var(--danger)' : u.role === 'admin' ? 'var(--warning)' : u.role === 'hospital' ? '#7c5cbf' : u.role === 'donor' ? 'var(--danger)' : u.role === 'doctor' ? 'var(--primary)' : u.role === 'auditor' ? 'var(--warning)' : 'var(--accent)' }}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span className={`badge ${u.status === 'approved' ? 'badge-green' : u.status === 'pending' ? 'badge-amber' : u.status === 'banned' ? 'badge-red' : 'badge-gray'}`}>{u.status}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text3)' }}>{u.registrationDate ? new Date(u.registrationDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* APPEALS TAB */}
      {activeTab === 'appeals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {appeals.length === 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '60px 20px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text1)' }}>No Appeals</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)' }}>No appeals have been submitted yet.</div>
            </div>
          )}
          {appeals.map(appeal => (
            <div key={appeal.id} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text1)' }}>Appeal from {getUserName(appeal.userId)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Submitted: {new Date(appeal.submittedDate).toLocaleString()} | Original: {appeal.originalAction}</div>
                </div>
                <span className={`badge ${appeal.status === 'pending' ? 'badge-amber' : appeal.status === 'approved' ? 'badge-green' : 'badge-red'}`}>{appeal.status}</span>
              </div>
              <div style={{ padding: '10px', background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' }}>
                <strong>Explanation:</strong> {appeal.explanation}
              </div>
              {appeal.originalReason && (
                <div style={{ padding: '10px', background: 'var(--danger-light)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--danger)', marginBottom: '10px' }}>
                  <strong>Original Reason:</strong> {appeal.originalReason}
                </div>
              )}

              {/* Multi-admin votes */}
              {appeal.isMultiAdmin && appeal.reviews && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '8px' }}>Admin Votes ({appeal.reviews.length}/{appeal.reviewerIds ? appeal.reviewerIds.length : 3})</div>
                  <div className="grid3">
                    {(appeal.reviewerIds || []).map((rid, i) => {
                      const review = appeal.reviews.find(r => r.adminId === rid);
                      return (
                        <div key={i} style={{ padding: '10px', background: review ? (review.decision === 'approve' ? 'var(--accent-light)' : 'var(--danger-light)') : 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Admin {i + 1}</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: review ? (review.decision === 'approve' ? 'var(--accent)' : 'var(--danger)') : 'var(--text3)' }}>
                            {review ? (review.decision === 'approve' ? 'Approve' : 'Reject') : 'Pending'}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{getUserName(rid)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {appeal.finalDecision && (
                    <div style={{ marginTop: '10px', padding: '8px 12px', background: appeal.finalDecision === 'restored' ? 'var(--accent-light)' : 'var(--danger-light)', borderRadius: 'var(--radius)', fontSize: '12px', fontWeight: '600', color: appeal.finalDecision === 'restored' ? 'var(--accent)' : 'var(--danger)', textAlign: 'center' }}>
                      Final Result: {appeal.finalDecision === 'restored' ? 'Account Restored' : 'Permanently Banned'}
                    </div>
                  )}
                </div>
              )}

              {appeal.reviewNotes && (
                <div style={{ padding: '10px', background: 'var(--accent-light)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--accent)', marginTop: '10px' }}>
                  <strong>Review Notes:</strong> {appeal.reviewNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditorDashboard;
