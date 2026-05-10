import { useEffect, useState } from 'react';
import {
  submitAdminRequestViaAPI,
  getAdminRequestsViaAPI,
  approveAdminRequestViaAPI,
  rejectAdminRequestViaAPI,
  cancelAdminRequestViaAPI,
} from '../utils/api';
import { validateEmail, validateName } from '../utils/auth';
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
        <div style={{ fontSize: '16px', fontWeight: '700' }}>👥 Admin Account Requests</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
          {isHospital && 'Submit names of admins your hospital wants — super admin reviews and approves.'}
          {isSuperAdmin && 'Review hospital-submitted admin requests. Hospital-linked admins can only be created from these requests.'}
        </div>
      </div>

      {isHospital && <HospitalRequestForm onSubmitted={load} />}
      {isSuperAdmin && <SuperAdminRequestList requests={requests} onChange={load} />}
      {isHospital && <HospitalRequestList requests={requests} onChange={load} />}
    </div>
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
                onChange={e => setData({ ...data, requested_admin_name: e.target.value })} />
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
const HospitalRequestList = ({ requests, onChange }) => {
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

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Your Admin Requests ({requests.length})</div>
      </div>
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
    </div>
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
