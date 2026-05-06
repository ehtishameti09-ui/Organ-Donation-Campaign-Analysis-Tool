import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import {
  getRecentActivities, getRecentActivitiesForUser, getApprovedHospitals,
  getAllUsers, getDonors, getRecipients, getVerificationMetrics,
  getHospitalAssignedCases, hospitalReviewCase,
  getUserAppeals, submitAppeal
} from '../utils/auth';
import { toast } from '../utils/toast';
import { generateRegistrationPDF } from '../utils/pdfReport';

Chart.register(...registerables);

// Document checklists - correct document keys per wizard
const DONOR_DOC_CHECKLIST = [
  { key: 'cnic_front', label: 'CNIC — Front Side', required: true },
  { key: 'cnic_back', label: 'CNIC — Back Side', required: true },
  { key: 'medicalCertificate', label: 'Medical Fitness Certificate', required: false },
  { key: 'bloodTypeReport', label: 'Blood Type Lab Report', required: false },
  { key: 'consentWitness', label: 'Witness Signed Consent', required: false },
];

const RECIPIENT_DOC_CHECKLIST = [
  { key: 'cnic_front', label: 'CNIC — Front Side', required: true },
  { key: 'cnic_back', label: 'CNIC — Back Side', required: true },
  { key: 'medicalReport', label: 'Medical Diagnosis Report', required: false },
  { key: 'labReports', label: 'Recent Lab Reports', required: false },
  { key: 'doctorReferral', label: 'Doctor Referral Letter', required: false },
  { key: 'insuranceProof', label: 'Insurance/Treatment Coverage', required: false },
];

// ============================================================
// STAT CARD
// ============================================================
const StatCard = ({ value, label, color, change, direction, icon, subtext }) => {
  const colors = {
    blue: { bg: 'var(--primary-light)', fg: 'var(--primary)' },
    green: { bg: 'var(--accent-light)', fg: 'var(--accent)' },
    amber: { bg: 'var(--warning-light)', fg: 'var(--warning)' },
    red: { bg: 'var(--danger-light)', fg: 'var(--danger)' },
    purple: { bg: '#f3f0ff', fg: '#7c5cbf' }
  };
  const c = colors[color] || colors.blue;
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: c.bg, color: c.fg }}>
        <svg viewBox="0 0 24 24" strokeWidth="1.8" fill="none" stroke="currentColor">{icon}</svg>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {change && (
        <div className={`stat-change ${direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'neutral'}`}>
          {direction === 'up' ? '↑' : direction === 'down' ? '↓' : ''} {change}
        </div>
      )}
      {subtext && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{subtext}</div>}
    </div>
  );
};

// ============================================================
// ACTIVITY ITEM
// ============================================================
const ActivityItem = ({ icon, action, user, time }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ width: '32px', height: '32px', background: 'var(--surface2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text1)' }}>{action}</div>
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{user}</div>
    </div>
    <div style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>{time}</div>
  </div>
);

// ============================================================
// APPROVAL PROGRESS TRACKER
// ============================================================
const HospitalProgressTracker = ({ status }) => {
  const steps = [
    { key: 'created', label: 'Account Created', icon: '✓' },
    { key: 'submitted', label: 'Documents Submitted', icon: '✓' },
    { key: 'review', label: 'Under Review', icon: '⏳' },
    { key: 'approved', label: 'Approved / Action Required', icon: '🏥' },
  ];

  const getStepStatus = (key) => {
    if (status === 'pending') {
      if (key === 'created' || key === 'submitted') return 'done';
      if (key === 'review') return 'current';
      return 'pending';
    }
    if (status === 'info_requested') {
      if (key === 'created' || key === 'submitted' || key === 'review') return 'done';
      if (key === 'approved') return 'action';
      return 'pending';
    }
    if (status === 'approved') {
      return 'done';
    }
    if (status === 'rejected') {
      if (key === 'created' || key === 'submitted' || key === 'review') return 'done';
      if (key === 'approved') return 'rejected';
      return 'done';
    }
    return 'pending';
  };

  const getColor = (st) => {
    if (st === 'done') return '#0eb07a';
    if (st === 'current') return '#1a5c9e';
    if (st === 'action') return '#e8900a';
    if (st === 'rejected') return '#d63e3e';
    return '#e2e6ed';
  };

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '0' }}>
        {steps.map((step, i) => {
          const st = getStepStatus(step.key);
          const color = getColor(st);
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : 'none' }}>
              <div style={{ textAlign: 'center', minWidth: '70px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: st === 'pending' ? 'var(--text3)' : '#fff', fontSize: '16px', fontWeight: '700', transition: 'all .3s' }}>
                  {st === 'done' ? '✓' : st === 'action' ? '!' : st === 'rejected' ? '✗' : i + 1}
                </div>
                <div style={{ fontSize: '11px', fontWeight: '600', color: st === 'pending' ? 'var(--text3)' : st === 'current' ? 'var(--primary)' : st === 'action' ? 'var(--warning)' : st === 'rejected' ? 'var(--danger)' : 'var(--accent)', lineHeight: '1.3', whiteSpace: 'pre-wrap', textAlign: 'center' }}>
                  {step.label.replace(' / ', '\n/ ')}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: '3px', background: st === 'done' ? '#0eb07a' : 'var(--border)', marginTop: '18px', borderRadius: '2px', transition: 'background .3s' }}></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// HOSPITAL CASES PANEL — for hospital to review submitted donor/recipient cases
// ============================================================
const HospitalCasesPanel = ({ hospitalId, hospitalUser }) => {
  const [cases, setCases] = useState([]);
  const [filter, setFilter] = useState('pending'); // pending | all | approved | rejected
  const [selectedCase, setSelectedCase] = useState(null);
  const [reviewAction, setReviewAction] = useState(null); // 'approve' | 'reject' | 'request_info'
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadCases = async () => {
    const data = await getHospitalAssignedCases(hospitalId);
    setCases(data);
  };

  useEffect(() => {
    loadCases();
  }, [hospitalId]);

  const filtered = cases.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'pending') return c.status === 'submitted' || c.status === 'info_requested';
    if (filter === 'approved') return c.status === 'approved';
    if (filter === 'rejected') return c.status === 'rejected';
    return true;
  });

  const handleReviewSubmit = async () => {
    if (!selectedCase || !reviewAction) return;
    if ((reviewAction === 'reject' || reviewAction === 'request_info') && !reviewNotes.trim()) {
      toast('Please provide notes/reason for this action.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await hospitalReviewCase(selectedCase.id, reviewAction, reviewNotes, hospitalId, selectedCase.role);
      const labels = { approve: 'approved', reject: 'rejected', request_info: 'flagged for additional info' };
      toast(`Case ${labels[reviewAction]} successfully.`, 'success');
      setSelectedCase(null);
      setReviewAction(null);
      setReviewNotes('');
      loadCases();
    } catch (err) {
      toast(err.message || 'Action failed.', 'error');
    }
    setSubmitting(false);
  };

  const statusBadge = (status) => {
    const map = {
      submitted: { cls: 'badge-blue', label: 'Submitted' },
      info_requested: { cls: 'badge-amber', label: 'Info Requested' },
      approved: { cls: 'badge-green', label: 'Approved' },
      rejected: { cls: 'badge-red', label: 'Rejected' },
      registered: { cls: 'badge-gray', label: 'Registered' },
    };
    const cfg = map[status] || map.registered;
    return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
  };

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="card-title">📋 Donor &amp; Recipient Cases</div>
          <div className="card-sub">Review and manage cases submitted to your hospital</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'pending', label: 'Pending', count: cases.filter(c => c.status === 'submitted' || c.status === 'info_requested').length },
            { id: 'approved', label: 'Approved', count: cases.filter(c => c.status === 'approved').length },
            { id: 'rejected', label: 'Rejected', count: cases.filter(c => c.status === 'rejected').length },
            { id: 'all', label: 'All', count: cases.length },
          ].map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              style={{
                padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600',
                border: `1.5px solid ${filter === t.id ? 'var(--primary)' : 'var(--border)'}`,
                background: filter === t.id ? 'var(--primary)' : 'var(--surface)',
                color: filter === t.id ? '#fff' : 'var(--text2)', cursor: 'pointer'
              }}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>📭</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text2)' }}>No cases in this category</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Cases submitted by donors and recipients to your hospital will appear here.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Type</th>
                <th>Blood / Organ</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: '600', fontSize: '13px' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{c.email}</div>
                  </td>
                  <td>
                    <span className={`badge ${c.role === 'donor' ? 'badge-green' : 'badge-blue'}`}>
                      {c.role === 'donor' ? '❤️ Donor' : '🏥 Recipient'}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    <div><strong>{c.bloodType || '—'}</strong></div>
                    <div style={{ color: 'var(--text3)' }}>{c.role === 'donor' ? (c.pledgedOrgans || []).slice(0, 2).join(', ') || '—' : c.organNeeded || '—'}</div>
                  </td>
                  <td>{statusBadge(c.status)}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    {c.submissionDate ? new Date(c.submissionDate).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => setSelectedCase(c)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review Modal */}
      {selectedCase && (
        <div className="modal-overlay show" onClick={() => { setSelectedCase(null); setReviewAction(null); setReviewNotes(''); }}>
          <div className="modal" style={{ maxWidth: '720px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{selectedCase.role === 'donor' ? '❤️ Donor' : '🏥 Recipient'} Case Review</h3>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Patient ID: {selectedCase.id}</div>
              </div>
              <button className="modal-close" onClick={() => { setSelectedCase(null); setReviewAction(null); setReviewNotes(''); }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Patient Info */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '10px' }}>Patient Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  {[
                    ['Name', selectedCase.name],
                    ['Email', selectedCase.email],
                    ['Phone', selectedCase.phone],
                    ['CNIC', selectedCase.cnic],
                    ['Age', selectedCase.age],
                    ['Gender', selectedCase.gender],
                    ['Blood Type', selectedCase.bloodType],
                    ['DOB', selectedCase.dob],
                    ['Address', selectedCase.address],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} style={{ background: 'var(--surface2)', padding: '8px 12px', borderRadius: 'var(--radius)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: '600' }}>{label}</div>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Emergency Contact */}
              {selectedCase.emergencyContactName && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '10px' }}>Emergency Contact</h4>
                  <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                    {selectedCase.emergencyContactName} ({selectedCase.emergencyContactRelation || 'Relation N/A'}) — {selectedCase.emergencyContactPhone}
                  </div>
                </div>
              )}

              {/* Donor-specific */}
              {selectedCase.role === 'donor' && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '10px' }}>Donation Pledge</h4>
                  <div style={{ background: 'var(--accent-light)', padding: '12px', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                    <div><strong>Organs Pledged:</strong> {(selectedCase.pledgedOrgans || []).join(', ') || '—'}</div>
                    <div><strong>Donation Type:</strong> {selectedCase.donationType || '—'}</div>
                    <div><strong>Family Informed:</strong> {selectedCase.familyInformed ? 'Yes' : 'No'}</div>
                    {selectedCase.nextOfKin && <div><strong>Next of Kin:</strong> {selectedCase.nextOfKin}</div>}
                  </div>
                </div>
              )}

              {/* Recipient-specific */}
              {selectedCase.role === 'recipient' && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '10px' }}>Transplant Case</h4>
                  <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                    <div><strong>Organ Needed:</strong> {selectedCase.organNeeded || '—'}</div>
                    <div><strong>Diagnosis:</strong> {selectedCase.diagnosis || '—'}</div>
                    <div><strong>Urgency:</strong> {selectedCase.urgencyScore || '—'}/10</div>
                    {selectedCase.treatingDoctor && <div><strong>Treating Doctor:</strong> {selectedCase.treatingDoctor}</div>}
                    {selectedCase.currentHospital && <div><strong>Current Hospital:</strong> {selectedCase.currentHospital}</div>}
                  </div>
                </div>
              )}

              {/* Medical History */}
              {(selectedCase.medicalHistory || selectedCase.currentMedications) && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '10px' }}>Medical Background</h4>
                  {selectedCase.medicalHistory && (
                    <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: 'var(--radius)', fontSize: '13px', marginBottom: '8px' }}>
                      <strong>History:</strong> {selectedCase.medicalHistory}
                    </div>
                  )}
                  {selectedCase.currentMedications && (
                    <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                      <strong>Current Medications:</strong> {selectedCase.currentMedications}
                    </div>
                  )}
                </div>
              )}

              {/* Profile Change History */}
              {(selectedCase.profileChangelog || []).length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--warning)', letterSpacing: '.5px', marginBottom: '10px' }}>
                    ✏️ Profile Change History ({selectedCase.profileChangelog.length} update{selectedCase.profileChangelog.length !== 1 ? 's' : ''})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[...selectedCase.profileChangelog].reverse().map((entry, i) => (
                      <div key={i} style={{ border: '1px solid var(--warning-light)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                        <div style={{ background: 'var(--warning-light)', padding: '6px 12px', fontSize: '11px', fontWeight: '600', color: 'var(--warning)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Update #{selectedCase.profileChangelog.length - i}</span>
                          <span>{new Date(entry.changedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {entry.fields.map((f, j) => (
                            <div key={j} style={{ fontSize: '12px', display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '8px', alignItems: 'start' }}>
                              <span style={{ fontWeight: '600', color: 'var(--text2)', fontSize: '11px', paddingTop: '2px' }}>{f.label}</span>
                              <div style={{ background: '#fee2e2', borderRadius: '4px', padding: '3px 8px', color: '#991b1b' }}>
                                <span style={{ fontSize: '9px', fontWeight: '700', display: 'block', marginBottom: '1px' }}>BEFORE</span>
                                {f.oldValue || <em style={{ color: '#ccc' }}>empty</em>}
                              </div>
                              <div style={{ background: '#dcfce7', borderRadius: '4px', padding: '3px 8px', color: '#166534' }}>
                                <span style={{ fontSize: '9px', fontWeight: '700', display: 'block', marginBottom: '1px' }}>AFTER</span>
                                {f.newValue || <em style={{ color: '#ccc' }}>empty</em>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '10px' }}>
                  📂 Submitted Documents ({(selectedCase.uploadedDocuments || []).length})
                </h4>
                {(selectedCase.uploadedDocuments || []).length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No documents uploaded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(selectedCase.uploadedDocuments || []).map((doc, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                        <span style={{ fontSize: '16px' }}>📄</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: '600' }}>{doc.name || doc.documentType}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            {doc.documentType} • {doc.size ? (doc.size / 1024).toFixed(1) + ' KB' : ''}
                          </div>
                        </div>
                        {doc.data && (
                          <a href={doc.data} download={doc.name} className="btn btn-xs btn-outline">View</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Previous review */}
              {selectedCase.hospitalReviewNotes && (
                <div style={{ marginBottom: '20px', padding: '12px 14px', background: 'var(--warning-light)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--warning)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--warning)', fontWeight: '700', marginBottom: '4px' }}>Previous Review Note</div>
                  <div style={{ fontSize: '12px' }}>{selectedCase.hospitalReviewNotes}</div>
                </div>
              )}

              {/* Action Selection */}
              {(selectedCase.status === 'submitted' || selectedCase.status === 'info_requested') && (
                <div>
                  <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '10px' }}>
                    Select Action
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    {[
                      { id: 'approve', label: '✅ Approve', color: '#0eb07a' },
                      { id: 'request_info', label: '📋 Request Info', color: '#e8900a' },
                      { id: 'reject', label: '❌ Reject', color: '#d63e3e' },
                    ].map(a => (
                      <button key={a.id} onClick={() => setReviewAction(a.id)}
                        style={{
                          padding: '12px', borderRadius: 'var(--radius)',
                          border: `2px solid ${reviewAction === a.id ? a.color : 'var(--border)'}`,
                          background: reviewAction === a.id ? a.color : 'var(--surface)',
                          color: reviewAction === a.id ? '#fff' : a.color,
                          fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                        }}>
                        {a.label}
                      </button>
                    ))}
                  </div>

                  {reviewAction && (
                    <div className="form-group">
                      <label className="form-label">
                        {reviewAction === 'approve' ? 'Optional approval note' : reviewAction === 'reject' ? 'Reason for rejection *' : 'What additional info is needed? *'}
                      </label>
                      <textarea className="form-input" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                        style={{ minHeight: '80px', resize: 'vertical' }}
                        placeholder={reviewAction === 'request_info'
                          ? 'e.g. "Please upload a clearer copy of your medical certificate and provide an updated lab report."'
                          : reviewAction === 'reject'
                            ? 'e.g. "Documents do not meet minimum requirements."'
                            : 'e.g. "All documents verified, welcome to Organ Donation Campaign Analysis Tool."'} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setSelectedCase(null); setReviewAction(null); setReviewNotes(''); }}>Cancel</button>
              {(selectedCase.status === 'submitted' || selectedCase.status === 'info_requested') && reviewAction && (
                <button className="btn btn-primary" onClick={handleReviewSubmit} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// REJECTED WITH APPEAL — for rejected donor/recipient
// ============================================================
const RejectedWithAppeal = ({ user, onNavigate }) => {
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [existingAppeals, setExistingAppeals] = useState([]);

  useEffect(() => {
    getUserAppeals(user.id).then(a => setExistingAppeals(a)).catch(() => {});
  }, [user.id]);

  const pendingBanAppeal = existingAppeals.find(a => a.status === 'pending');
  const pendingCaseAppeal = existingAppeals.find(a => a.status === 'pending');

  const reviewDate = user.hospitalReviewDate ? new Date(user.hospitalReviewDate) : new Date();
  const deadline = new Date(reviewDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const handleAppealSubmit = async () => {
    if (!appealText.trim()) { toast('Please provide an explanation for your appeal.', 'error'); return; }
    setSubmittingAppeal(true);
    try {
      await submitAppeal(user.id, appealText);
      toast('Appeal submitted successfully. Administrators will review your case.', 'success');
      setShowAppealForm(false);
      setAppealText('');
      const updated = await getUserAppeals(user.id);
      setExistingAppeals(updated);
    } catch (err) {
      toast(err.message || 'Appeal submission failed.', 'error');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #fef2f2 0%, #fde8e8 100%)', border: '2px solid #fca5a5' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ width: '56px', height: '56px', background: '#dc2626', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>❌</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, color: '#991b1b', fontSize: '17px' }}>Registration Rejected</h3>
            <p style={{ margin: '4px 0 12px', fontSize: '13px', color: '#7f1d1d', lineHeight: '1.6' }}>
              {user.hospitalReviewNotes || 'Your registration was not approved by the hospital.'}
            </p>

            {/* Countdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '10px 14px', background: '#fff', borderRadius: '8px', border: '1px solid #fca5a5' }}>
              <span style={{ fontSize: '18px' }}>⏰</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: daysRemaining > 0 ? '#dc2626' : '#6b7280' }}>
                  {daysRemaining > 0 ? `${daysRemaining} days remaining to appeal` : 'Appeal deadline has passed'}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>You can appeal within 7 days of rejection</div>
              </div>
            </div>

            {isHospitalRejection && user.caseAppealRejected ? (
              <div style={{ padding: '12px 16px', background: 'var(--danger-light)', borderRadius: '8px', fontSize: '13px', color: 'var(--danger)', fontWeight: '600' }}>
                Your appeal has been reviewed and rejected. No further appeals are possible for this case.
              </div>
            ) : pendingCaseAppeal ? (
              <div style={{ padding: '12px 16px', background: 'var(--warning-light)', borderRadius: '8px', fontSize: '13px', color: 'var(--warning)', fontWeight: '600' }}>
                Your appeal is being reviewed by the hospital. You will be notified of the outcome.
              </div>
            ) : pendingBanAppeal ? (
              <div style={{ padding: '12px 16px', background: 'var(--warning-light)', borderRadius: '8px', fontSize: '13px', color: 'var(--warning)', fontWeight: '600' }}>
                Your appeal is being reviewed by 3 administrators. You will be notified of the outcome.
              </div>
            ) : daysRemaining > 0 && !user.caseAppealRejected ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn" style={{ background: '#dc2626', color: '#fff', border: 'none' }}
                  onClick={() => setShowAppealForm(true)}>
                  Appeal Decision
                </button>
                <button className="btn btn-outline" onClick={() => onNavigate && onNavigate('complete-registration')}>
                  Resubmit with New Documents
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Appeal Form Modal */}
      {showAppealForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowAppealForm(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Appeal Rejection</h3>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>
              {isHospitalRejection
                ? 'Your appeal will be sent to the hospital for reconsideration of your case.'
                : 'Your appeal will be sent to 3 independent administrators for review. A majority vote (2 approvals) is required to restore your account.'}
            </p>

            <div style={{ padding: '12px', background: 'var(--danger-light)', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '12px' }}>
              <strong style={{ color: 'var(--danger)' }}>Original Reason:</strong>{' '}
              <span style={{ color: 'var(--text1)' }}>{user.hospitalReviewNotes || 'Not specified'}</span>
            </div>

            <div className="form-group">
              <label className="form-label">Explain why this decision should be reversed *</label>
              <textarea className="form-input" rows={5} value={appealText} onChange={e => setAppealText(e.target.value)}
                placeholder="Provide your explanation, any corrections, or new evidence that supports your case..." />
            </div>

            <div style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: 'var(--primary)' }}>
              You can also upload new documents by clicking "Resubmit with New Documents" on the dashboard.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" style={{ flex: 1, background: '#dc2626' }} onClick={handleAppealSubmit} disabled={submittingAppeal}>
                {submittingAppeal ? 'Submitting...' : 'Submit Appeal'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAppealForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// CRITICAL FIELDS — read-only system generated scores
// ============================================================
const CriticalFieldsPanel = ({ user }) => {
  if (user.role !== 'recipient') return null;
  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔒</span> System Generated Scores
        </div>
        <div className="card-sub">Future Allocation Engine — Read Only</div>
      </div>
      <div className="grid3">
        {[
          { label: 'Urgency Score', value: user.urgencyScore || user.urgency || '—', color: parseFloat(user.urgencyScore || user.urgency) >= 7 ? 'var(--danger)' : 'var(--warning)' },
          { label: 'Comorbidity Score', value: user.comorbidity || '—', color: 'var(--primary)' },
          { label: 'Survival Estimate', value: user.survivalEstimate || '—', color: 'var(--accent)' },
        ].map((f, i) => (
          <div key={i} style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px dashed var(--border2)', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>{f.label}</div>
            <input type="text" value={f.value} disabled readOnly
              style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '24px', fontWeight: '700', color: f.color, textAlign: 'center', padding: 0, cursor: 'not-allowed' }} />
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>System Generated</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// MAIN DASHBOARD
// ============================================================
const Dashboard = ({ user, onNavigate }) => {
  const trendsChartRef = useRef(null);
  const organsChartRef = useRef(null);
  const trendsChartInstance = useRef(null);
  const organsChartInstance = useRef(null);
  const [activities, setActivities] = useState([]);
  const [approvedHospitals, setApprovedHospitals] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [allUsers, setAllUsers] = useState([]);
  const [donors, setDonors] = useState([]);
  const [recipients, setRecipients] = useState([]);

  useEffect(() => {
    // Load real data from API
    const loadData = async () => {
      const activities = await getRecentActivitiesForUser(user.id, 8);
      const hospitals = await getApprovedHospitals();
      const metrics = await getVerificationMetrics();
      const users = await getAllUsers();
      const donorsList = await getDonors();
      const recipientsList = await getRecipients();

      setActivities(activities);
      setApprovedHospitals(hospitals);
      setMetrics(metrics);
      setAllUsers(users);
      setDonors(donorsList);
      setRecipients(recipientsList);
    };

    loadData();

    if (user.role === 'admin' || user.role === 'super_admin' || (user.role === 'hospital' && user.status === 'approved')) {
      initCharts();
    }
    return () => {
      if (trendsChartInstance.current) trendsChartInstance.current.destroy();
      if (organsChartInstance.current) organsChartInstance.current.destroy();
    };
  }, [user.role, user.status, user.id]);

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const initCharts = () => {
    if (trendsChartRef.current) {
      const ctx = trendsChartRef.current.getContext('2d');
      if (trendsChartInstance.current) trendsChartInstance.current.destroy();
      trendsChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            { label: 'Transplants', data: [95, 102, 118, 125, 132, 140], borderColor: '#1a5c9e', backgroundColor: 'rgba(26,92,158,.08)', tension: .35, fill: true, pointRadius: 4, pointBackgroundColor: '#1a5c9e' },
            { label: 'Donors', data: [145, 152, 168, 178, 185, 195], borderColor: '#0eb07a', backgroundColor: 'rgba(14,176,122,.06)', tension: .35, fill: true, pointRadius: 4, pointBackgroundColor: '#0eb07a' },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 11 } } } },
          scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.04)' } }, x: { grid: { display: false } } }
        }
      });
    }
    if (organsChartRef.current) {
      const ctx = organsChartRef.current.getContext('2d');
      if (organsChartInstance.current) organsChartInstance.current.destroy();
      organsChartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Kidney', 'Liver', 'Heart', 'Lung', 'Others'],
          datasets: [{ data: [385, 245, 156, 98, 67], backgroundColor: ['#1a5c9e', '#0eb07a', '#e8900a', '#7c5cbf', '#d63e3e'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' }
      });
    }
  };

  // ---- HOSPITAL: Pending Approval ----
  if (user.role === 'hospital' && user.status === 'pending') {
    return (
      <div>
        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          <span className="alert-icon">⏳</span>
          <div className="alert-content">
            <h4>Registration Under Review</h4>
            <p>Your hospital application is being reviewed by our admin team. You have restricted access until approved.</p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div className="card-title">Application Progress</div>
            <div className="card-sub">Track your hospital registration status</div>
          </div>
          <HospitalProgressTracker status="pending" />
        </div>

        <div className="grid2" style={{ marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Hospital Information</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Hospital Name', val: user.hospitalName },
                { label: 'Registration No.', val: user.registrationNumber || '—' },
                { label: 'Submission Date', val: user.registrationDate ? new Date(user.registrationDate).toLocaleDateString() : '—' },
                { label: 'Submitted Documents', val: `${(user.uploadedDocuments || []).length} files` },
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{f.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{f.val || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">What You Can Do Now</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { icon: '✅', text: 'View your application status' },
                { icon: '✅', text: 'View and update your profile' },
                { icon: '✅', text: 'Upload or update documents' },
                { icon: '🚫', text: 'Manage campaigns (requires approval)' },
                { icon: '🚫', text: 'Access analytics (requires approval)' },
                { icon: '🚫', text: 'Appear in public hospital list (requires approval)' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: item.icon === '🚫' ? 'var(--text3)' : 'var(--text1)' }}>
                  <span>{item.icon}</span>{item.text}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--text2)', textAlign: 'center' }}>
              Estimated review time: 2–3 business days
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- HOSPITAL: Info Requested ----
  if (user.role === 'hospital' && user.status === 'info_requested') {
    return (
      <div>
        <div className="alert" style={{ background: '#fff7ed', borderLeft: '4px solid var(--warning)', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px' }}>
          <span style={{ fontSize: '20px' }}>📋</span>
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--warning)', marginBottom: '4px' }}>Action Required — Additional Documents Needed</h4>
            <p style={{ fontSize: '13px', color: 'var(--text1)', lineHeight: '1.6' }}>
              The admin has reviewed your application and needs more information. Please upload the required documents from Account Settings.
            </p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div className="card-title">Application Progress</div>
          </div>
          <HospitalProgressTracker status="info_requested" />
        </div>

        <div className="grid2" style={{ marginBottom: '20px' }}>
          <div className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--warning)' }}>Admin Message</div>
            </div>
            <div style={{ background: 'var(--warning-light)', padding: '14px', borderRadius: 'var(--radius)', fontSize: '13px', lineHeight: '1.7', color: 'var(--text1)', whiteSpace: 'pre-wrap' }}>
              {user.adminMessage || 'Please upload the missing required documents to complete your verification.'}
            </div>
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text3)' }}>
              Requested on {new Date().toLocaleDateString()}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Document Upload History</div>
            </div>
            {(user.uploadedDocuments || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: '13px' }}>No documents uploaded yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(user.uploadedDocuments || []).slice(0, 4).map((doc, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                    <span style={{ fontSize: '18px' }}>📄</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600' }}>{doc.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{(doc.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <span className="badge badge-amber" style={{ fontSize: '10px' }}>Pending</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('settings')} style={{ minWidth: '200px' }}>
            Upload Additional Documents
          </button>
        </div>
      </div>
    );
  }

  // ---- HOSPITAL: Rejected ----
  if (user.role === 'hospital' && user.status === 'rejected') {
    return (
      <div>
        <div className="alert" style={{ background: 'var(--danger-light)', borderLeft: '4px solid var(--danger)', display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px' }}>
          <span style={{ fontSize: '20px' }}>❌</span>
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--danger)', marginBottom: '4px' }}>Registration Rejected</h4>
            <p style={{ fontSize: '13px', color: 'var(--text1)' }}>
              {user.rejectionReason || 'Your application was not approved. Please contact support for more information.'}
            </p>
          </div>
        </div>

        <div className="card" style={{ marginTop: '20px', textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏥</div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>Need to Reapply?</h3>
          <p style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '400px', margin: '0 auto 20px' }}>
            If you believe this decision was made in error or you have additional information, please contact our support team.
          </p>
          <a href="mailto:support@odcat.com" className="btn btn-outline">Contact Support</a>
        </div>
      </div>
    );
  }

  // ---- ADMIN / SUPER_ADMIN Dashboard ----
  if (user.role === 'admin' || user.role === 'super_admin') {
    const pendingHospitals = allUsers.filter(u => u.role === 'hospital' && u.status === 'pending').length;

    return (
      <div>
        <div className="grid4" style={{ marginBottom: '20px' }}>
          <StatCard value={allUsers.filter(u => !u.deleted && !u.banned).length} label="Total Users"
            color="blue" change={`${donors.length} donors, ${recipients.length} recipients`} direction="neutral"
            icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>} />
          <StatCard value={donors.length} label="Registered Donors"
            color="green" change={`${donors.filter(d => d.verificationStatus === 'approved').length} verified`} direction="up"
            icon={<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>} />
          <StatCard value={recipients.length} label="Recipients on Waitlist"
            color="amber" change={`${recipients.filter(r => parseFloat(r.urgencyScore) >= 7).length} critical`} direction="neutral"
            icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>} />
          <StatCard value={pendingHospitals} label="Pending Hospitals"
            color="red" change="Awaiting review" direction="neutral"
            icon={<><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M12 7v10M7 12h10"/></>} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Performance Trends</div>
              <div className="card-sub">Monthly transplants & donor registrations</div>
            </div>
            <div className="chart-wrap" style={{ height: '220px' }}>
              <canvas ref={trendsChartRef}></canvas>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Organ Distribution</div>
              <div className="card-sub">Current allocation breakdown</div>
            </div>
            <div className="chart-wrap" style={{ height: '180px' }}>
              <canvas ref={organsChartRef}></canvas>
            </div>
            <div className="chart-legend">
              {[{ label: 'Kidney', color: '#1a5c9e' }, { label: 'Liver', color: '#0eb07a' }, { label: 'Heart', color: '#e8900a' }, { label: 'Lung', color: '#7c5cbf' }, { label: 'Others', color: '#d63e3e' }].map((it, i) => (
                <div className="legend-item" key={i}>
                  <div className="legend-dot" style={{ background: it.color }}></div>{it.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Activity</div>
              <div className="card-sub">Real-time system events</div>
            </div>
            <div className="scroll-list-md">
              {activities.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                  No recent activity yet. Activity will appear as users register and actions are performed.
                </div>
              ) : (
                activities.map((act, i) => (
                  <ActivityItem key={i} icon={act.icon || '📋'} action={act.title} user={act.description} time={timeAgo(act.timestamp)} />
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">System Alerts</div>
              <div className="card-sub">Requires attention</div>
            </div>
            {pendingHospitals > 0 && (
              <div className="alert alert-warning">
                <span className="alert-icon">⚠️</span>
                <div className="alert-content">
                  <h4>{pendingHospitals} Hospital{pendingHospitals > 1 ? 's' : ''} Awaiting Approval</h4>
                  <p>Review pending hospital registrations in User Management.</p>
                </div>
              </div>
            )}
            {metrics.pending > 0 && (
              <div className="alert alert-info">
                <span className="alert-icon">📋</span>
                <div className="alert-content">
                  <h4>{metrics.pending} Donor Verifications Pending</h4>
                  <p>Donors awaiting document verification in Donor Management.</p>
                </div>
              </div>
            )}
            <div className="alert alert-success">
              <span className="alert-icon">✅</span>
              <div className="alert-content">
                <h4>System Online</h4>
                <p>All services operational. Last check: just now.</p>
              </div>
            </div>
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
                <tr><th>Procedure</th><th>Hospital</th><th>Time</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr><td><strong>Kidney Transplant Surgery</strong></td><td>City General</td><td>Tomorrow, 9:00 AM</td><td><span className="badge badge-green">Confirmed</span></td></tr>
                <tr><td><strong>Donor Screening</strong></td><td>Memorial MC</td><td>Tomorrow, 2:00 PM</td><td><span className="badge badge-blue">Scheduled</span></td></tr>
                <tr><td><strong>Liver Transplant</strong></td><td>University Hospital</td><td>Apr 18, 8:00 AM</td><td><span className="badge badge-amber">Pending</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---- HOSPITAL: Approved Dashboard ----
  if (user.role === 'hospital' && user.status === 'approved') {
    const trustScore = calculateTrustScore(user);
    const trustStatus = getTrustScoreStatus(trustScore);
    return (
      <div>
        <div className="alert alert-success" style={{ marginBottom: '20px' }}>
          <span className="alert-icon">🏥</span>
          <div className="alert-content">
            <h4>Welcome, {user.hospitalName}!</h4>
            <p>Your hospital is fully approved and active in the Organ Donation Campaign Analysis Tool network.</p>
          </div>
        </div>

        {/* PENDING CASES SECTION */}
        <HospitalCasesPanel hospitalId={user.id} hospitalUser={user} />
        <div className="grid4" style={{ marginBottom: '20px' }}>
          <StatCard value={trustScore + '%'} label="Compliance Score" color="blue" change={trustStatus.label} direction="up"
            icon={<><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></>} />
          <StatCard value="Approved" label="Hospital Status" color="green" change="Fully Verified" direction="up"
            icon={<><path d="M22 11.08V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6.08"/><polyline points="6 9 12 15 20 7"/></>} />
          <StatCard value={(user.uploadedDocuments || []).length} label="Documents On File" color="amber" change="documents uploaded" direction="up"
            icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>} />
          <StatCard value={new Date(user.registrationDate).getFullYear()} label="Member Since" color="purple" change="Active member" direction="up"
            icon={<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Performance Trends</div>
            </div>
            <div className="chart-wrap" style={{ height: '200px' }}>
              <canvas ref={trendsChartRef}></canvas>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Activity</div>
            </div>
            <div className="scroll-list-sm">
              {activities.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>No recent activity</div>
              ) : (
                activities.map((act, i) => (
                  <ActivityItem key={i} icon={act.icon} action={act.title} user={act.description} time={timeAgo(act.timestamp)} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- DONOR Dashboard ----
  if (user.role === 'donor') {
    const verStatus = user.verificationStatus || user.status || 'registered';
    const preferredHospitals = approvedHospitals.slice(0, 4);
    const needsRegistration = !user.registrationComplete && user.status === 'registered';
    const needsResubmit = user.status === 'info_requested';
    const isUnderReview = user.status === 'submitted';
    const isApproved = user.status === 'approved';
    const isRejected = user.status === 'rejected';

    return (
      <div>
        {/* Complete Registration CTA */}
        {needsRegistration && (
          <div className="card" style={{ marginBottom: '20px', padding: '24px', background: 'linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%)', border: '2px solid #fbd5d5' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', background: '#dc2626', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>❤️</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, color: '#991b1b', fontSize: '17px' }}>Complete Your Donor Registration</h3>
                <p style={{ margin: '4px 0 14px', fontSize: '13px', color: '#7f1d1d', lineHeight: '1.6' }}>
                  Your basic account is ready! To become an active organ donor, please complete your registration:
                  read &amp; sign the official Pakistan consent form, fill in your medical details, upload required
                  documents, and submit to your preferred hospital for review.
                </p>
                <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('complete-registration')} style={{ background: '#dc2626', borderColor: '#dc2626' }}>
                  ▶ Start Registration Wizard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resubmit alert */}
        {needsResubmit && (
          <div className="card" style={{ marginBottom: '20px', padding: '24px', background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', border: '2px solid #fed7aa' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', background: '#ea580c', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>📋</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, color: '#9a3412', fontSize: '17px' }}>Hospital Requested Additional Information</h3>
                <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#7c2d12', lineHeight: '1.6' }}>
                  The hospital reviewing your case needs additional information from you.
                </p>
                {user.hospitalReviewNotes && (
                  <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #ea580c', fontSize: '12px', color: '#7c2d12', marginBottom: '12px' }}>
                    <strong>Note from hospital:</strong> {user.hospitalReviewNotes}
                  </div>
                )}
                <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('complete-registration')} style={{ background: '#ea580c', borderColor: '#ea580c' }}>
                  📤 Resubmit Information
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Under review banner */}
        {isUnderReview && (
          <div className="alert alert-info" style={{ marginBottom: '20px' }}>
            <span className="alert-icon">⏳</span>
            <div className="alert-content">
              <h4>Submitted &amp; Under Review</h4>
              <p>Your registration has been submitted to {user.preferredHospitalName || 'the selected hospital'} and is currently being reviewed. You will be notified of any updates.</p>
            </div>
          </div>
        )}

        {/* Approved banner */}
        {isApproved && (
          <div className="alert alert-success" style={{ marginBottom: '20px' }}>
            <span className="alert-icon">✅</span>
            <div className="alert-content">
              <h4>Registration Approved!</h4>
              <p>Your donor registration has been approved by {user.preferredHospitalName || 'the hospital'}. You are now an active organ donor.</p>
            </div>
          </div>
        )}

        {/* Rejected banner with Appeal */}
        {isRejected && <RejectedWithAppeal user={user} onNavigate={onNavigate} />}

        {!needsRegistration && !needsResubmit && !isUnderReview && !isApproved && !isRejected && (
          <div className="alert alert-success" style={{ marginBottom: '20px' }}>
            <span className="alert-icon">❤️</span>
            <div className="alert-content">
              <h4>Welcome back, {user.name}!</h4>
              <p>Thank you for being a registered donor. Your generosity can save lives.</p>
            </div>
          </div>
        )}

        <div className="grid4" style={{ marginBottom: '20px' }}>
          <StatCard value={verStatus === 'approved' ? 'Active' : verStatus === 'under_review' ? 'Under Review' : 'Pending'} label="Verification Status"
            color={verStatus === 'approved' ? 'green' : verStatus === 'under_review' ? 'blue' : 'amber'}
            change={verStatus === 'approved' ? '✓ Verified' : 'Awaiting verification'} direction="up"
            icon={<><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></>} />
          <StatCard value={(user.uploadedDocuments || []).length} label="Documents Uploaded" color="blue"
            change="uploaded files" direction="up"
            icon={<><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></>} />
          <StatCard value={user.bloodType || '—'} label="Blood Type" color="red"
            change="Your blood group" direction="neutral"
            icon={<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>} />
          <StatCard value={user.consentSigned ? 'Signed' : 'Pending'} label="Consent Form" color={user.consentSigned ? 'green' : 'amber'}
            change={user.consentSigned ? 'Consent on file' : 'Signature required'} direction="neutral"
            icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>} />
        </div>

        {/* Verification Progress */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Your Verification Progress</div>
              <div className="card-sub">Steps to become a verified active donor</div>
            </div>
            {(isUnderReview || isApproved) && (
              <button
                className="btn btn-ghost"
                onClick={() => generateRegistrationPDF(user)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', flexShrink: 0 }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Report
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 0' }}>
            {['Registered', 'Submitted', 'Under Review', 'Approved', 'Active Donor'].map((step, i, arr) => {
              const stepStatuses = { pending: 1, submitted: 2, under_review: 3, approved: 4 };
              const currentStep = stepStatuses[verStatus] || 1;
              const isDone = i < currentStep;
              const isCurrent = i === currentStep - 1;
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'flex-start', flex: i < arr.length - 1 ? 1 : 'none' }}>
                  <div style={{ textAlign: 'center', minWidth: '72px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isDone ? '#0eb07a' : isCurrent ? '#1a5c9e' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', color: isDone || isCurrent ? '#fff' : 'var(--text3)', fontSize: '13px', fontWeight: '700' }}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: isCurrent ? 'var(--primary)' : isDone ? 'var(--accent)' : 'var(--text3)', lineHeight: '1.3' }}>{step}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ flex: 1, height: '2px', background: isDone ? '#0eb07a' : 'var(--border)', marginTop: '18px', borderRadius: '2px' }}></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Preferred Hospitals */}
        {preferredHospitals.length > 0 && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div className="card-title">Preferred Hospitals</div>
              <div className="card-sub">Organ Donation Campaign Analysis Tool-verified hospitals in our network</div>
            </div>
            <div className="grid2">
              {preferredHospitals.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                  <div style={{ width: '40px', height: '40px', background: 'var(--primary-light)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🏥</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{h.hospitalName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{h.hospitalAddress || 'Organ Donation Campaign Analysis Tool Certified'}</div>
                    <span className="badge badge-green" style={{ fontSize: '10px', marginTop: '4px' }}>Verified</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Document Checklist */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Document Checklist</div>
            <div className="card-sub">Required documentation status</div>
          </div>
          {DONOR_DOC_CHECKLIST.map(req => {
            const hasDoc = (user.uploadedDocuments || []).some(d => d.documentType === req.key);
            const statusColor = hasDoc ? 'var(--accent)' : req.required ? 'var(--danger)' : 'var(--text3)';
            const statusLabel = hasDoc ? 'Uploaded' : req.required ? 'Missing (Required)' : 'Not uploaded (Optional)';
            return (
              <div key={req.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px' }}>
                  {req.required ? '* ' : ''}{req.label}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: statusColor }}>
                  {hasDoc ? '✓ ' : '✗ '}{statusLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- DOCTOR / DATA_ENTRY / AUDITOR — generic welcome dashboard ----
  if (user.role === 'doctor' || user.role === 'data_entry' || user.role === 'auditor') {
    const roleTitles = { doctor: 'Doctor', data_entry: 'Data Entry Operator', auditor: 'Auditor' };
    const roleIcons = { doctor: '🩺', data_entry: '📝', auditor: '🔍' };
    const roleDescs = {
      doctor: 'Review incoming donor and recipient cases from your assigned hospital.',
      data_entry: 'Add, edit, and manage donor and recipient records.',
      auditor: 'View system data, audit logs, and compliance reports (read-only).'
    };
    const rolePages = { doctor: 'doctor-review', data_entry: 'data-entry', auditor: 'audit' };

    return (
      <div>
        <div className="alert alert-success" style={{ marginBottom: '20px' }}>
          <span className="alert-icon">{roleIcons[user.role]}</span>
          <div className="alert-content">
            <h4>Welcome, {user.name}!</h4>
            <p>{roleDescs[user.role]}</p>
          </div>
        </div>

        <div className="grid3" style={{ marginBottom: '20px' }}>
          {[
            { label: 'Role', value: roleTitles[user.role], color: 'var(--primary)', bg: 'var(--primary-light)' },
            { label: 'Status', value: user.status === 'suspended' ? 'Suspended' : 'Active', color: user.status === 'suspended' ? 'var(--danger)' : 'var(--accent)', bg: user.status === 'suspended' ? 'var(--danger-light)' : 'var(--accent-light)' },
            { label: 'Hospital', value: user.hospitalName || 'Organ Donation Campaign Analysis Tool System', color: '#7c5cbf', bg: '#f3f0ff' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>{s.label}</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>{roleIcons[user.role]}</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Go to Your Workspace</h3>
          <p style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '400px', margin: '0 auto 20px' }}>
            Access your specialized dashboard to start working.
          </p>
          <button className="btn btn-primary" onClick={() => onNavigate && onNavigate(rolePages[user.role])}>
            Open {roleTitles[user.role]} Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ---- RECIPIENT Dashboard ----
  if (user.role === 'recipient') {
    const cs = user.caseStatus || 'registered';
    const caseSteps = ['registered', 'verified', 'eligible', 'active'];
    const csIdx = caseSteps.indexOf(cs);
    const preferredHospitals = approvedHospitals.slice(0, 4);
    const days = user.daysOnWaitlist || Math.round((new Date() - new Date(user.registrationDate)) / (1000 * 60 * 60 * 24));

    const needsRegistration = !user.registrationComplete && user.status === 'registered';
    const needsResubmit = user.status === 'info_requested';
    const isUnderReview = user.status === 'submitted';
    const isApproved = user.status === 'approved';
    const isRejected = user.status === 'rejected';

    return (
      <div>
        {/* Complete Registration CTA */}
        {needsRegistration && (
          <div className="card" style={{ marginBottom: '20px', padding: '24px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '2px solid #93c5fd' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', background: '#1e40af', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>🏥</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '17px' }}>Complete Your Recipient Registration</h3>
                <p style={{ margin: '4px 0 14px', fontSize: '13px', color: '#1e40af', lineHeight: '1.6' }}>
                  Your basic account is ready! To register your case for transplant matching, please complete:
                  read &amp; sign the Pakistan consent form, fill in your medical/clinical details, upload required
                  documents, and submit to a hospital for review.
                </p>
                <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('complete-registration')}>
                  ▶ Start Registration Wizard
                </button>
              </div>
            </div>
          </div>
        )}

        {needsResubmit && (
          <div className="card" style={{ marginBottom: '20px', padding: '24px', background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', border: '2px solid #fed7aa' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', background: '#ea580c', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>📋</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, color: '#9a3412', fontSize: '17px' }}>Hospital Requested Additional Information</h3>
                <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#7c2d12', lineHeight: '1.6' }}>
                  The hospital reviewing your case needs additional information from you.
                </p>
                {user.hospitalReviewNotes && (
                  <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #ea580c', fontSize: '12px', color: '#7c2d12', marginBottom: '12px' }}>
                    <strong>Note from hospital:</strong> {user.hospitalReviewNotes}
                  </div>
                )}
                <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('complete-registration')} style={{ background: '#ea580c', borderColor: '#ea580c' }}>
                  📤 Resubmit Information
                </button>
              </div>
            </div>
          </div>
        )}

        {isUnderReview && (
          <div className="alert alert-info" style={{ marginBottom: '20px' }}>
            <span className="alert-icon">⏳</span>
            <div className="alert-content">
              <h4>Submitted &amp; Under Review</h4>
              <p>Your registration has been submitted to {user.preferredHospitalName || 'the selected hospital'} and is currently being reviewed.</p>
            </div>
          </div>
        )}

        {isApproved && (
          <div className="alert alert-success" style={{ marginBottom: '20px' }}>
            <span className="alert-icon">✅</span>
            <div className="alert-content">
              <h4>Registration Approved!</h4>
              <p>Your recipient case has been approved by {user.preferredHospitalName || 'the hospital'}. You are now on the active waiting list.</p>
            </div>
          </div>
        )}

        {isRejected && <RejectedWithAppeal user={user} onNavigate={onNavigate} />}

        {!needsRegistration && !needsResubmit && !isUnderReview && !isApproved && !isRejected && (
          <div className="alert alert-info" style={{ marginBottom: '20px' }}>
            <span className="alert-icon">🏥</span>
            <div className="alert-content">
              <h4>Welcome, {user.name}</h4>
              <p>Your recipient case is being managed by the Organ Donation Campaign Analysis Tool team. We'll notify you of any updates.</p>
            </div>
          </div>
        )}

        <div className="grid4" style={{ marginBottom: '20px' }}>
          <StatCard value={cs.charAt(0).toUpperCase() + cs.slice(1)} label="Case Status"
            color={cs === 'active' ? 'green' : cs === 'eligible' ? 'amber' : 'blue'} change={`Step ${csIdx + 1} of 4`} direction="up"
            icon={<><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></>} />
          <StatCard value={`${days}d`} label="Days on Waitlist" color="amber"
            change={`Organ: ${user.organNeeded || '—'}`} direction="neutral"
            icon={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />
          <StatCard value={user.urgencyScore || '—'} label="Urgency Score" color={parseFloat(user.urgencyScore) >= 7 ? 'red' : 'blue'}
            change={parseFloat(user.urgencyScore) >= 7 ? 'Critical' : 'Moderate'} direction="up"
            icon={<><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>} />
          <StatCard value={user.survivalEstimate || '—'} label="Survival Estimate" color="green"
            change="Rule-based calculation" direction="up"
            icon={<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>} />
        </div>

        {/* Case Status Bar */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Case Progress</div>
              <div className="card-sub">Your recipient case journey</div>
            </div>
            {(isUnderReview || isApproved) && (
              <button
                className="btn btn-ghost"
                onClick={() => generateRegistrationPDF(user)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', flexShrink: 0 }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Report
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 0' }}>
            {caseSteps.map((step, i, arr) => {
              const colors = { registered: '#8494a8', verified: '#1a5c9e', eligible: '#e8900a', active: '#0eb07a' };
              const isDone = i <= csIdx;
              const isCurrent = i === csIdx;
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'flex-start', flex: i < arr.length - 1 ? 1 : 'none' }}>
                  <div style={{ textAlign: 'center', minWidth: '72px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isDone ? colors[step] : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', color: isDone ? '#fff' : 'var(--text3)', fontSize: '13px', fontWeight: '700', border: isCurrent ? `3px solid ${colors[step]}` : 'none' }}>
                      {isDone && !isCurrent ? '✓' : i + 1}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: isCurrent ? colors[step] : isDone ? colors[step] : 'var(--text3)', textTransform: 'capitalize' }}>{step}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ flex: 1, height: '2px', background: isDone && i < csIdx ? colors[step] : 'var(--border)', marginTop: '18px', borderRadius: '2px' }}></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Preferred Hospitals */}
        {preferredHospitals.length > 0 && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div className="card-title">Preferred Hospitals</div>
              <div className="card-sub">Verified transplant centers in our network</div>
            </div>
            <div className="grid2">
              {preferredHospitals.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <div style={{ width: '40px', height: '40px', background: 'var(--accent-light)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🏥</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600' }}>{h.hospitalName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{h.hospitalAddress || 'Organ Donation Campaign Analysis Tool Certified'}</div>
                    <span className="badge badge-green" style={{ fontSize: '10px', marginTop: '4px' }}>Verified</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Critical Read-Only Scores */}
        <CriticalFieldsPanel user={user} />

        {/* Diagnosis Info */}
        {(user.diagnosis || user.organNeeded) && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Medical Information</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Diagnosis', val: user.diagnosis || '—' },
                { label: 'Organ Needed', val: user.organNeeded ? user.organNeeded.charAt(0).toUpperCase() + user.organNeeded.slice(1) : '—' },
                { label: 'Blood Type', val: user.bloodType || '—' },
                { label: 'Lab Values', val: user.labValues || '—' },
              ].map((f, i) => (
                <div key={i} style={{ background: 'var(--surface2)', padding: '12px 14px', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '.3px' }}>{f.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{f.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

const calculateTrustScore = (hospital) => {
  if (!hospital || hospital.role !== 'hospital') return 0;
  const docs = hospital.uploadedDocuments || [];
  const hasRegCert = docs.some(d => d.documentType === 'registrationCertificate');
  const hasLicense = docs.some(d => d.documentType === 'healthcareLicense');
  const legalDocs = (hasRegCert ? 20 : 0) + (hasLicense ? 20 : 0);
  const medicalInfo = (hospital.hospitalName && hospital.registrationNumber && hospital.licenseNumber) ? 30 : 0;
  const hasTaxCert = docs.some(d => d.documentType === 'taxCertificate');
  const hasEthicalPolicy = docs.some(d => d.documentType === 'ethicalPolicy');
  const hasTransplantLicense = docs.some(d => d.documentType === 'transplantLicense');
  const optionalDocs = (hasTaxCert ? 10 : 0) + (hasEthicalPolicy ? 10 : 0) + (hasTransplantLicense ? 10 : 0);
  return legalDocs + medicalInfo + optionalDocs;
};

const getTrustScoreStatus = (score) => {
  if (score >= 80) return { label: 'Excellent' };
  if (score >= 60) return { label: 'Good' };
  if (score >= 40) return { label: 'Fair' };
  return { label: 'Incomplete' };
};

export default Dashboard;
