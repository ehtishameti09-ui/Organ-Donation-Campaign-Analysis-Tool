import { useState, useEffect } from 'react';
import { hospitalReviewCase, getHospitalAssignedCases } from '../utils/auth';
import { toast } from '../utils/toast';

const DoctorDashboard = ({ currentUser }) => {
  const [tab, setTab] = useState('incoming');
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [cases, setCases] = useState([]);

  useEffect(() => {
    const load = async () => {
      const hospitalId = currentUser.hospitalId || currentUser.linkedHospitalId || currentUser.id;
      const data = await getHospitalAssignedCases(hospitalId);
      setCases(data);
    };
    load();
  }, [currentUser, refreshKey]);

  const incoming = cases.filter(c => c.status === 'submitted' || c.verificationStatus === 'submitted');
  const reviewed = cases.filter(c => ['approved', 'rejected', 'info_requested'].includes(c.status) && c.hospitalReviewedBy);

  const displayCases = tab === 'incoming' ? incoming : reviewed;

  const handleReview = async () => {
    if (!reviewAction) { toast('Please select an action.', 'error'); return; }
    if (reviewAction === 'reject' && !reviewNotes.trim()) { toast('Please provide a reason for rejection.', 'error'); return; }
    if (reviewAction === 'request_info' && !reviewNotes.trim()) { toast('Please specify what additional information is needed.', 'error'); return; }

    try {
      await hospitalReviewCase(reviewModal.id, reviewAction, reviewNotes, currentUser.hospitalId || currentUser.id);
      toast(
        reviewAction === 'approve' ? 'Case approved successfully.' :
        reviewAction === 'reject' ? 'Case rejected.' : 'Additional information requested.',
        reviewAction === 'approve' ? 'success' : 'info'
      );
      setReviewModal(null);
      setReviewAction('');
      setReviewNotes('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      submitted: { cls: 'badge-blue', label: 'Pending Review' },
      approved: { cls: 'badge-green', label: 'Approved' },
      rejected: { cls: 'badge-red', label: 'Rejected' },
      info_requested: { cls: 'badge-amber', label: 'Info Requested' },
    };
    const m = map[status] || { cls: 'badge-gray', label: status };
    return <span className={`badge ${m.cls}`}>{m.label}</span>;
  };

  return (
    <div>
      {/* Stats Row */}
      <div className="grid4" style={{ marginBottom: '24px' }}>
        {[
          { label: 'Total Cases', value: cases.length, color: 'var(--primary)', bg: 'var(--primary-light)' },
          { label: 'Pending Review', value: incoming.length, color: 'var(--warning)', bg: 'var(--warning-light)' },
          { label: 'Approved', value: cases.filter(c => c.status === 'approved').length, color: 'var(--accent)', bg: 'var(--accent-light)' },
          { label: 'Rejected', value: cases.filter(c => c.status === 'rejected').length, color: 'var(--danger)', bg: 'var(--danger-light)' },
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
          { id: 'incoming', label: `Incoming Requests (${incoming.length})` },
          { id: 'reviewed', label: `Reviewed (${reviewed.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all .2s',
              background: tab === t.id ? 'var(--surface)' : 'transparent', color: tab === t.id ? 'var(--primary)' : 'var(--text3)', boxShadow: tab === t.id ? 'var(--shadow-sm)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Case Cards */}
      {displayCases.length === 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '60px 20px', textAlign: 'center', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{tab === 'incoming' ? '📭' : '📋'}</div>
          <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text1)', marginBottom: '4px' }}>
            {tab === 'incoming' ? 'No Pending Requests' : 'No Reviewed Cases'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
            {tab === 'incoming' ? 'New donor/recipient requests will appear here.' : 'Cases you have reviewed will appear here.'}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {displayCases.map(c => (
          <div key={c.id} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: c.role === 'donor' ? 'var(--danger-light)' : 'var(--primary-light)', color: c.role === 'donor' ? 'var(--danger)' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700' }}>
                  {c.role === 'donor' ? '❤️' : '🏥'}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text1)' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{c.role === 'donor' ? 'Organ Donor' : 'Transplant Recipient'} • {c.email}</div>
                </div>
              </div>
              {getStatusBadge(c.status)}
            </div>

            {/* Info Grid */}
            <div className="grid3" style={{ marginBottom: '14px' }}>
              {[
                { label: 'Blood Type', value: c.bloodType || '—' },
                { label: 'Age', value: c.age || '—' },
                { label: 'Gender', value: c.gender || '—' },
                { label: c.role === 'donor' ? 'Pledged Organs' : 'Organ Needed', value: c.role === 'donor' ? (c.pledgedOrgans || []).join(', ') || '—' : c.organNeeded || '—' },
                { label: 'Phone', value: c.phone || '—' },
                { label: 'Submitted', value: c.submissionDate ? new Date(c.submissionDate).toLocaleDateString() : '—' },
              ].map((info, i) => (
                <div key={i} style={{ padding: '10px', background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: '12px' }}>
                  <div style={{ color: 'var(--text3)', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '.3px', fontSize: '10px' }}>{info.label}</div>
                  <div style={{ color: 'var(--text1)', fontWeight: '500' }}>{info.value}</div>
                </div>
              ))}
            </div>

            {/* Critical Read-Only Fields */}
            {c.role === 'recipient' && (
              <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '14px', border: '1px dashed var(--border2)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>🔒</span> System Generated (Future Allocation Engine)
                </div>
                <div className="grid3">
                  {[
                    { label: 'Urgency Score', value: c.urgencyScore || c.urgency || '—' },
                    { label: 'Comorbidity Score', value: c.comorbidity || '—' },
                    { label: 'Survival Estimate', value: c.survivalEstimate || '—' },
                  ].map((f, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase' }}>{f.label}</div>
                      <input type="text" value={f.value} disabled readOnly
                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '16px', fontWeight: '700', color: 'var(--primary)', padding: '2px 0', cursor: 'not-allowed' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents */}
            {(c.uploadedDocuments || []).length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Documents ({c.uploadedDocuments.length})</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {c.uploadedDocuments.map((doc, i) => (
                    <div key={i} style={{ padding: '6px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📎</span> {doc.name || doc.documentType || `Document ${i + 1}`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Medical History */}
            {c.medicalHistory && (
              <div style={{ marginBottom: '14px', padding: '10px', background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--text2)' }}>
                <span style={{ fontWeight: '600' }}>Medical History: </span>{c.medicalHistory}
              </div>
            )}

            {/* Review Notes (if already reviewed) */}
            {c.hospitalReviewNotes && (
              <div style={{ marginBottom: '14px', padding: '10px', background: c.status === 'approved' ? 'var(--accent-light)' : c.status === 'rejected' ? 'var(--danger-light)' : 'var(--warning-light)', borderRadius: 'var(--radius)', fontSize: '12px' }}>
                <span style={{ fontWeight: '600' }}>Review Notes: </span>{c.hospitalReviewNotes}
              </div>
            )}

            {/* Actions */}
            {tab === 'incoming' && (
              <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                  onClick={() => { setReviewModal(c); setReviewAction('approve'); setReviewNotes(''); }}>
                  Approve
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
                  onClick={() => { setReviewModal(c); setReviewAction('reject'); setReviewNotes(''); }}>
                  Reject
                </button>
                <button className="btn btn-sm btn-outline"
                  onClick={() => { setReviewModal(c); setReviewAction('request_info'); setReviewNotes(''); }}>
                  Request More Info
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Review Modal */}
      {reviewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setReviewModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '480px', maxWidth: '95vw', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>
              {reviewAction === 'approve' ? '✅ Approve Case' : reviewAction === 'reject' ? '❌ Reject Case' : '📋 Request More Info'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>
              Reviewing: {reviewModal.name} ({reviewModal.role})
            </p>

            {/* Action selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['approve', 'reject', 'request_info'].map(a => (
                <button key={a} onClick={() => setReviewAction(a)}
                  style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius)', border: `2px solid ${reviewAction === a ? (a === 'approve' ? 'var(--accent)' : a === 'reject' ? 'var(--danger)' : 'var(--warning)') : 'var(--border)'}`,
                    background: reviewAction === a ? (a === 'approve' ? 'var(--accent-light)' : a === 'reject' ? 'var(--danger-light)' : 'var(--warning-light)') : 'var(--surface)',
                    cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: reviewAction === a ? (a === 'approve' ? 'var(--accent)' : a === 'reject' ? 'var(--danger)' : 'var(--warning)') : 'var(--text2)' }}>
                  {a === 'approve' ? '✅ Approve' : a === 'reject' ? '❌ Reject' : '📋 More Info'}
                </button>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">
                {reviewAction === 'reject' ? 'Reason for Rejection *' : reviewAction === 'request_info' ? 'What info is needed? *' : 'Notes (optional)'}
              </label>
              <textarea className="form-input" rows={4} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                placeholder={reviewAction === 'reject' ? 'Explain why this case is being rejected...' : reviewAction === 'request_info' ? 'Specify the additional documents or information needed...' : 'Add any notes...'} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button className="btn btn-primary" style={{ flex: 1,
                background: reviewAction === 'approve' ? 'var(--accent)' : reviewAction === 'reject' ? 'var(--danger)' : 'var(--warning)' }}
                onClick={handleReview}>
                Confirm {reviewAction === 'approve' ? 'Approval' : reviewAction === 'reject' ? 'Rejection' : 'Request'}
              </button>
              <button className="btn btn-ghost" onClick={() => setReviewModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorDashboard;
