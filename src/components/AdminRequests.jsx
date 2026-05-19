import { useEffect, useState } from 'react';
import {
  submitAdminRequestViaAPI,
  getAdminRequestsViaAPI,
  approveAdminRequestViaAPI,
  rejectAdminRequestViaAPI,
  cancelAdminRequestViaAPI,
} from '../utils/api';
import { validateEmail, validateName, getAllUsers, banUser, softDeleteUser, unbanUser, restoreUser, BAN_CATEGORIES, capitalizeName } from '../utils/auth';
import { toast } from '../utils/toast';
import Pagination, { usePagination } from './Pagination';

const STATUS_BADGE = {
  pending:   { label: 'Pending Review', cls: 'badge-amber' },
  approved:  { label: 'Approved',       cls: 'badge-green' },
  rejected:  { label: 'Rejected',       cls: 'badge-red'   },
  cancelled: { label: 'Cancelled',      cls: 'badge-gray'  },
};

const AdminRequests = ({ currentUser }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const isHospital = currentUser.role === 'hospital';
  const isSuperAdmin = currentUser.role === 'super_admin';

  const load = async () => {
    setLoading(true);
    try {
      const r = await getAdminRequestsViaAPI();
      setRequests(r.data || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)' }}>Loading admin requests…</div>;

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #1a5c9e 0%, #2871be 100%)',
        color: 'white', padding: '16px 20px', borderRadius: 'var(--radius)', marginBottom: '20px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: '700' }}>👥 Admin Management</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
          {isHospital && 'Request new admin accounts and manage your existing admins (suspend, ban, delete, restore).'}
          {isSuperAdmin && 'Review hospital-submitted admin requests. Hospital-linked admins can only be created from these requests.'}
        </div>
      </div>

      {isHospital && <HospitalRequestForm onSubmitted={load} />}
      {isSuperAdmin && <SuperAdminRequestList requests={requests} onChange={load} />}

      {/* Hospital view: two top-level tabs — Requests vs. Accounts */}
      {isHospital && <HospitalAdminTabs currentUser={currentUser} requests={requests} onChange={load} />}
    </div>
  );
};

// ============================================================
// HOSPITAL: Tabbed switcher between request list and managed admin accounts
// ============================================================
const HospitalAdminTabs = ({ currentUser, requests, onChange }) => {
  const [tab, setTab] = useState('requests');

  // Count active (non-cancelled, non-rejected) requests + total admins separately so
  // the badges reflect what the user actually cares about
  const requestsCount = requests.length;

  return (
    <div className="card">
      {/* Top-level tab bar */}
      <div role="tablist" style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--border)',
        padding: '0 4px',
      }}>
        {[
          { id: 'requests', label: '📨 Your Admin Requests', count: requestsCount, accent: 'var(--primary)' },
          { id: 'accounts', label: '👥 Your Admin Accounts', count: null,           accent: 'var(--accent)' },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                padding: '12px 18px',
                fontSize: '14px',
                fontWeight: '600',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${t.accent}` : '2px solid transparent',
                color: active ? t.accent : 'var(--text2)',
                cursor: 'pointer',
                transition: 'color .15s, border-color .15s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {t.label}
              {t.count !== null && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: active ? t.accent : 'var(--surface3)',
                  color: active ? '#fff' : 'var(--text3)',
                  minWidth: '22px',
                  textAlign: 'center',
                }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ paddingTop: '16px' }}>
        {tab === 'requests' && <HospitalRequestList requests={requests} onChange={onChange} embedded />}
        {tab === 'accounts' && <HospitalManagedAdmins currentUser={currentUser} embedded />}
      </div>
    </div>
  );
};

// ============================================================
// HOSPITAL: Manage own admins (ban / suspend / delete / unban / restore)
// Mirrors the tabbed Approved / Banned / Deleted layout from User Management.
// ============================================================
const HospitalManagedAdmins = ({ currentUser, embedded = false }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('approved');

  const load = async () => {
    setLoading(true);
    try {
      const all = await getAllUsers();
      const mine = (all || []).filter(u => u.role === 'admin' && Number(u.linkedHospitalId) === Number(currentUser.id));
      setAdmins(mine);
    } catch (e) {
      toast(e.message || 'Failed to load admins', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentUser.id]);

  const approvedAdmins = admins.filter(a => !a.banned && !a.isDeleted);
  const bannedAdmins   = admins.filter(a => a.banned === true);
  const deletedAdmins  = admins.filter(a => a.isDeleted === true);

  const approvedPg = usePagination(approvedAdmins, 8);
  const bannedPg   = usePagination(bannedAdmins, 8);
  const deletedPg  = usePagination(deletedAdmins, 8);

  const handleSuspend = async (admin) => {
    const reason = window.prompt(`Suspend ${admin.name} for 7 days?\n\nEnter a reason (at least 10 characters):`, '');
    if (!reason || reason.trim().length < 10) return;
    try {
      await banUser(admin.id, 'OTHER', reason.trim(), 'temporary', 7, currentUser.id);
      toast(`${admin.name} suspended for 7 days.`, 'success');
      load();
    } catch (e) {
      toast(e.message || 'Suspend failed.', 'error');
    }
  };

  const handlePermanentBan = async (admin) => {
    const reason = window.prompt(`Permanently ban ${admin.name}?\n\nThis revokes their access indefinitely. Enter a reason (at least 10 characters):`, '');
    if (!reason || reason.trim().length < 10) return;
    if (!window.confirm(`Confirm: permanently ban ${admin.name}? This is severe — they will not be able to sign in.`)) return;
    try {
      await banUser(admin.id, 'OTHER', reason.trim(), 'permanent', null, currentUser.id);
      toast(`${admin.name} has been permanently banned.`, 'success');
      load();
    } catch (e) {
      toast(e.message || 'Ban failed.', 'error');
    }
  };

  const handleDelete = async (admin) => {
    const reason = window.prompt(`Delete ${admin.name}'s account?\n\nThey'll have a 30-day recovery window before permanent removal. Enter a reason (at least 10 characters):`, '');
    if (!reason || reason.trim().length < 10) return;
    if (!window.confirm(`Confirm: delete ${admin.name}'s account?`)) return;
    try {
      await softDeleteUser(admin.id, 'OTHER', reason.trim(), currentUser.id);
      toast(`${admin.name}'s account has been deleted.`, 'success');
      load();
    } catch (e) {
      toast(e.message || 'Delete failed.', 'error');
    }
  };

  const handleUnban = async (admin) => {
    if (!window.confirm(`Unban ${admin.name}? They will be able to sign in immediately.`)) return;
    try {
      await unbanUser(admin.id);
      toast(`${admin.name} has been unbanned.`, 'success');
      load();
    } catch (e) {
      toast(e.message || 'Unban failed.', 'error');
    }
  };

  const handleRestore = async (admin) => {
    if (!window.confirm(`Restore ${admin.name}'s account? They will be able to sign in immediately.`)) return;
    try {
      await restoreUser(admin.id);
      toast(`${admin.name}'s account has been restored.`, 'success');
      load();
    } catch (e) {
      toast(e.message || 'Restore failed.', 'error');
    }
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text2)' }}>Loading your admins…</div>;

  const Wrapper = embedded ? 'div' : ({ children }) => <div className="card">{children}</div>;
  return (
    <Wrapper>
      {!embedded && (
        <div className="card-header">
          <div className="card-title">Your Admin Accounts</div>
          <div className="card-sub" style={{ fontSize: '12px' }}>Active, suspended/banned, and deleted admins linked to your hospital</div>
        </div>
      )}

      {/* Tab bar — matches the User Management pattern */}
      <div role="tablist" style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--border)',
        padding: '0 4px',
        marginBottom: '8px',
      }}>
        {[
          { id: 'approved', label: '✓ Approved', count: approvedAdmins.length, accent: 'var(--accent)' },
          { id: 'banned',   label: '🚫 Banned',   count: bannedAdmins.length,   accent: '#dc2626' },
          { id: 'deleted',  label: '🗑️ Deleted', count: deletedAdmins.length,  accent: '#9333ea' },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: '600',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${t.accent}` : '2px solid transparent',
                color: active ? t.accent : 'var(--text2)',
                cursor: 'pointer',
                transition: 'color .15s, border-color .15s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {t.label}
              <span style={{
                fontSize: '11px',
                fontWeight: '700',
                padding: '2px 7px',
                borderRadius: '999px',
                background: active ? t.accent : 'var(--surface3)',
                color: active ? '#fff' : 'var(--text3)',
                minWidth: '20px',
                textAlign: 'center',
              }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Approved tab */}
      {tab === 'approved' && (
        <>
          <div className="table-wrap">
            <table style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 10px' }}>Admin</th>
                  <th style={{ padding: '8px 10px' }}>Email</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px' }}>Joined</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvedPg.slice.length > 0 ? approvedPg.slice.map(admin => (
                  <tr key={admin.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: '600' }}>{admin.name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>{admin.email}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="badge badge-green" style={{ fontSize: '10px' }}>✓ Active</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>
                      {admin.registrationDate ? new Date(admin.registrationDate).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => handleSuspend(admin)} style={{ fontSize: '11px', padding: '4px 10px' }} title="7-day temporary ban">⏸ Suspend</button>
                        <button className="btn btn-sm" onClick={() => handlePermanentBan(admin)} style={{ fontSize: '11px', padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }} title="Permanent ban">🚫 Ban</button>
                        <button className="btn btn-sm" onClick={() => handleDelete(admin)} style={{ fontSize: '11px', padding: '4px 10px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }} title="Soft delete (30-day recovery)">🗑️ Delete</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>No active admins yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {approvedAdmins.length > 0 && <Pagination {...approvedPg} label="active admins" />}
        </>
      )}

      {/* Banned tab */}
      {tab === 'banned' && (
        <>
          <div className="table-wrap">
            <table style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 10px' }}>Admin</th>
                  <th style={{ padding: '8px 10px' }}>Type</th>
                  <th style={{ padding: '8px 10px' }}>Reason</th>
                  <th style={{ padding: '8px 10px' }}>Banned</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {bannedPg.slice.length > 0 ? bannedPg.slice.map(admin => {
                  const bd = admin.banDetails || {};
                  const banDate = bd.banDate ? new Date(bd.banDate) : null;
                  const expiry = bd.expiryDate ? new Date(bd.expiryDate) : null;
                  const daysLeft = expiry && !isNaN(expiry.getTime()) ? Math.ceil((expiry - new Date()) / (1000*60*60*24)) : null;
                  const isPermanent = bd.banType === 'permanent';
                  const reason = bd.detailedReason || bd.reason || '—';
                  return (
                    <tr key={admin.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: '600' }}>{admin.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{admin.email}</div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span className={isPermanent ? 'badge badge-red' : 'badge badge-amber'} style={{ fontSize: '10px' }}>
                          {isPermanent ? 'Permanent' : 'Temporary'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text2)', maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={reason}>{reason}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>
                        {banDate && !isNaN(banDate.getTime()) ? banDate.toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: '600', color: isPermanent ? 'var(--danger)' : daysLeft > 0 ? 'var(--text1)' : 'var(--danger)' }}>
                        {isPermanent ? 'Permanent' : daysLeft === null ? '—' : daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => handleUnban(admin)} style={{ fontSize: '11px', padding: '4px 10px' }}>✓ Unban</button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>No banned admins</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {bannedAdmins.length > 0 && <Pagination {...bannedPg} label="banned admins" />}
        </>
      )}

      {/* Deleted tab */}
      {tab === 'deleted' && (
        <>
          <div className="table-wrap">
            <table style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 10px' }}>Admin</th>
                  <th style={{ padding: '8px 10px' }}>Reason</th>
                  <th style={{ padding: '8px 10px' }}>Deleted</th>
                  <th style={{ padding: '8px 10px' }}>Recovery Window</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {deletedPg.slice.length > 0 ? deletedPg.slice.map(admin => {
                  const dd = admin.deletionDetails || {};
                  const delDate = dd.deletionDate ? new Date(dd.deletionDate) : null;
                  const deadline = (dd.recoveryDeadline || admin.recoveryDeadline) ? new Date(dd.recoveryDeadline || admin.recoveryDeadline) : null;
                  const daysLeft = deadline && !isNaN(deadline.getTime()) ? Math.ceil((deadline - new Date()) / (1000*60*60*24)) : null;
                  const reason = dd.reason || dd.detailedReason || '—';
                  return (
                    <tr key={admin.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: '600' }}>{admin.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{admin.email}</div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text2)', maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={reason}>{reason}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>
                        {delDate && !isNaN(delDate.getTime()) ? delDate.toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: '600', color: daysLeft === null ? 'var(--text3)' : daysLeft > 0 ? 'var(--text1)' : 'var(--danger)' }}>
                        {daysLeft === null ? '—' : daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => handleRestore(admin)}
                          disabled={daysLeft !== null && daysLeft <= 0}
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                        >↺ Restore</button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)' }}>No deleted admins</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {deletedAdmins.length > 0 && <Pagination {...deletedPg} label="deleted admins" />}
        </>
      )}
    </Wrapper>
  );
};

// ============================================================
// HOSPITAL: Submit form
// ============================================================
const HospitalRequestForm = ({ onSubmitted }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ requested_admin_name: '', requested_admin_email: '', justification: '' });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const nameCheck = validateName(data.requested_admin_name);
    if (!nameCheck.ok) { toast(nameCheck.error, 'error'); return; }
    const emailCheck = validateEmail(data.requested_admin_email);
    if (!emailCheck.ok) { toast(emailCheck.error, 'error'); return; }
    if (data.justification && data.justification.trim().length < 20) {
      toast('Justification should be at least 20 characters or left blank.', 'warning');
      return;
    }

    setBusy(true);
    try {
      await submitAdminRequestViaAPI(data);
      toast('Admin request submitted. Super admin will review.', 'success');
      setData({ requested_admin_name: '', requested_admin_email: '', justification: '' });
      setOpen(false);
      onSubmitted();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="card-title">Request a New Admin Account</div>
          <div className="card-sub">Provide the proposed admin's name and email — super admin will create the account on approval.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(!open)}>
          {open ? '✕ Cancel' : '+ New Request'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: '12px' }}>
          <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Admin Full Name *</label>
              <input className="form-input" placeholder="Dr Sara Malik"
                value={data.requested_admin_name}
                onChange={e => setData({ ...data, requested_admin_name: capitalizeName(e.target.value) })} />
            </div>
            <div>
              <label className="form-label">Admin Email *</label>
              <input className="form-input" type="email" placeholder="sara.malik@hospital.com"
                value={data.requested_admin_email}
                onChange={e => setData({ ...data, requested_admin_email: e.target.value.toLowerCase() })} />
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <label className="form-label">Justification (optional)</label>
            <textarea className="form-input" rows="3"
              placeholder="Why does the hospital need this admin? Helps super admin make a decision."
              value={data.justification}
              onChange={e => setData({ ...data, justification: e.target.value })} />
          </div>
          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
              {busy ? 'Submitting…' : '📨 Submit Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// HOSPITAL: List own requests
// ============================================================
const HospitalRequestList = ({ requests, onChange, embedded = false }) => {
  const pg = usePagination(requests, 10);

  const handleCancel = async (id) => {
    if (!confirm('Cancel this admin request?')) return;
    try {
      await cancelAdminRequestViaAPI(id);
      toast('Request cancelled', 'success');
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const Wrapper = embedded ? 'div' : ({ children }) => <div className="card">{children}</div>;
  return (
    <Wrapper>
      {!embedded && (
        <div className="card-header">
          <div className="card-title">Your Admin Requests ({requests.length})</div>
        </div>
      )}
      {requests.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>
          You haven't submitted any admin requests yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {pg.slice.map(r => {
            const badge = STATUS_BADGE[r.status] || { label: r.status, cls: 'badge-gray' };
            return (
              <div key={r.id} style={{
                padding: '14px',
                background: 'var(--surface2)',
                borderRadius: 'var(--radius)',
                borderLeft: `3px solid ${
                  r.status === 'approved' ? '#0eb07a' :
                  r.status === 'rejected' ? '#c5371f' :
                  r.status === 'pending' ? '#e8900a' : 'var(--text3)'
                }`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong>{r.requested_admin_name}</strong>
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                      📧 {r.requested_admin_email}
                    </div>
                    {r.justification && (
                      <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px', fontStyle: 'italic' }}>
                        "{r.justification}"
                      </div>
                    )}
                    {r.review_notes && (
                      <div style={{
                        marginTop: '8px', padding: '8px 10px',
                        background: r.status === 'rejected' ? '#fff5f5' : '#e6f7ed',
                        borderRadius: '4px', fontSize: '12px',
                      }}>
                        <strong>Super admin notes:</strong> {r.review_notes}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                      Submitted {new Date(r.created_at).toLocaleString()}
                      {r.reviewed_at && ` · Reviewed ${new Date(r.reviewed_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  {r.status === 'pending' && (
                    <button className="btn btn-xs btn-outline" onClick={() => handleCancel(r.id)}>Cancel</button>
                  )}
                </div>
              </div>
            );
          })}
          <Pagination page={pg.page} setPage={pg.setPage} totalPages={pg.totalPages} total={pg.total} pageSize={pg.pageSize} label="requests" />
        </div>
      )}
    </Wrapper>
  );
};

// ============================================================
// SUPER ADMIN: Review list with approve/reject
// ============================================================
const SuperAdminRequestList = ({ requests, onChange }) => {
  const [filter, setFilter] = useState('pending');
  const [reviewing, setReviewing] = useState(null);
  const [mode, setMode] = useState('approve');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pg = usePagination(filtered, 10);
  const counts = {
    all:       requests.length,
    pending:   requests.filter(r => r.status === 'pending').length,
    approved:  requests.filter(r => r.status === 'approved').length,
    rejected:  requests.filter(r => r.status === 'rejected').length,
    cancelled: requests.filter(r => r.status === 'cancelled').length,
  };

  const openReview = (req, m) => { setReviewing(req); setMode(m); setPassword(''); setNotes(''); };

  const handleSubmit = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      if (mode === 'approve') {
        if (!password || password.length < 8) {
          toast('Set a strong initial password (≥ 8 chars, mixed case, digit, special).', 'error');
          setBusy(false);
          return;
        }
        await approveAdminRequestViaAPI(reviewing.id, password, notes || null);
        toast(`Admin account created for ${reviewing.requested_admin_email}`, 'success');
      } else {
        if (!notes || notes.trim().length < 10) {
          toast('Rejection requires explanation of at least 10 characters.', 'error');
          setBusy(false);
          return;
        }
        await rejectAdminRequestViaAPI(reviewing.id, notes);
        toast('Request rejected', 'success');
      }
      setReviewing(null);
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {['pending', 'approved', 'rejected', 'cancelled', 'all'].map(s => (
          <button key={s}
            onClick={() => setFilter(s)}
            className={filter === s ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline'}
            style={{ textTransform: 'capitalize' }}
          >
            {s} ({counts[s]})
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)' }}>
            No {filter !== 'all' ? filter : ''} admin requests.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {pg.slice.map(r => {
              const badge = STATUS_BADGE[r.status] || { label: r.status, cls: 'badge-gray' };
              return (
                <div key={r.id} style={{
                  padding: '14px',
                  background: 'var(--surface2)',
                  borderRadius: 'var(--radius)',
                  borderLeft: `3px solid ${
                    r.status === 'approved' ? '#0eb07a' :
                    r.status === 'rejected' ? '#c5371f' :
                    r.status === 'pending' ? '#e8900a' : 'var(--text3)'
                  }`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '260px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <strong>{r.requested_admin_name}</strong>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)' }}>📧 {r.requested_admin_email}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>
                        🏥 {r.hospital?.name} <span style={{ color: 'var(--text3)' }}>({r.hospital?.email})</span>
                      </div>
                      {r.justification && (
                        <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px', fontStyle: 'italic' }}>
                          "{r.justification}"
                        </div>
                      )}
                      {r.created_admin && (
                        <div style={{ marginTop: '8px', padding: '6px 10px', background: '#e6f7ed', borderRadius: '4px', fontSize: '12px' }}>
                          ✓ Admin account created — id #{r.created_admin.id}
                        </div>
                      )}
                      {r.review_notes && (
                        <div style={{
                          marginTop: '8px', padding: '8px 10px',
                          background: r.status === 'rejected' ? '#fff5f5' : '#f5f5f5',
                          borderRadius: '4px', fontSize: '12px',
                        }}>
                          <strong>{r.reviewer?.name}:</strong> {r.review_notes}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                        Submitted {new Date(r.created_at).toLocaleString()}
                        {r.reviewed_at && ` · Reviewed ${new Date(r.reviewed_at).toLocaleString()}`}
                      </div>
                    </div>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm btn-primary" onClick={() => openReview(r, 'approve')}>✓ Approve</button>
                        <button className="btn btn-sm btn-outline" onClick={() => openReview(r, 'reject')}>✕ Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <Pagination page={pg.page} setPage={pg.setPage} totalPages={pg.totalPages} total={pg.total} pageSize={pg.pageSize} label="requests" />
          </div>
        )}
      </div>

      {reviewing && (
        <div className="modal-overlay show" onClick={() => setReviewing(null)}>
          <div className="modal" style={{ maxWidth: '520px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <h3>{mode === 'approve' ? '✓ Approve Admin Request' : '✕ Reject Admin Request'}</h3>
              <button className="modal-close" onClick={() => setReviewing(null)}>×</button>
            </header>
            <div className="modal-body">
              <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '6px', marginBottom: '14px' }}>
                <strong>{reviewing.requested_admin_name}</strong>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{reviewing.requested_admin_email}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>For hospital: {reviewing.hospital?.name}</div>
              </div>

              {mode === 'approve' ? (
                <>
                  <label className="form-label">Initial Password *</label>
                  <input type="text" className="form-input" placeholder="e.g. Welcome@2026"
                    value={password} onChange={e => setPassword(e.target.value)} />
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                    Communicate this password securely to the hospital. The admin should change it on first login.
                  </div>
                  <label className="form-label" style={{ marginTop: '12px' }}>Notes for the hospital (optional)</label>
                  <textarea className="form-input" rows="2" value={notes} onChange={e => setNotes(e.target.value)} />
                </>
              ) : (
                <>
                  <label className="form-label">Reason for Rejection (≥ 10 characters) *</label>
                  <textarea className="form-input" rows="4" value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. The proposed email belongs to a deactivated user. Please submit a new request with a fresh email." />
                  <div style={{ fontSize: '11px', color: notes.trim().length >= 10 ? 'var(--success)' : 'var(--text3)', marginTop: '4px' }}>
                    {notes.trim().length}/10 characters
                  </div>
                </>
              )}
            </div>
            <footer className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setReviewing(null)}>Cancel</button>
              <button className={mode === 'approve' ? 'btn btn-primary' : 'btn btn-warning'} onClick={handleSubmit} disabled={busy}>
                {busy ? '…' : (mode === 'approve' ? 'Create Admin Account' : 'Reject Request')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRequests;
