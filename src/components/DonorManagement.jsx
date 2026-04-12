import { useState, useEffect } from 'react';
import {
  getDonors, getDonorsByHospital, verifyDonor, updateDonorDocumentStatus,
  getVerificationMetrics, getAllUsers, saveUsers,
  createNotification, logUserAction, addActivity
} from '../utils/auth';
import { toast } from '../utils/toast';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ORGANS = ['kidney', 'liver', 'heart', 'lung', 'pancreas', 'cornea', 'bone marrow'];
const VERIFICATION_STATES = ['registered', 'submitted', 'under_review', 'approved', 'rejected'];

const statusConfig = {
  approved: { label: 'Approved', cls: 'badge-green' },
  rejected: { label: 'Rejected', cls: 'badge-red' },
  under_review: { label: 'Under Review', cls: 'badge-blue' },
  pending: { label: 'Pending', cls: 'badge-amber' },
  active: { label: 'Active', cls: 'badge-green' },
  submitted: { label: 'Submitted', cls: 'badge-blue' },
  registered: { label: 'Registered', cls: 'badge-gray' },
};

// Document Lightbox Modal
const DocumentLightboxModal = ({ doc, onClose }) => {
  if (!doc) return null;
  const isPdf = doc.type === 'application/pdf';
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = doc.data;
    link.download = doc.name || `document.${isPdf ? 'pdf' : 'jpg'}`;
    link.click();
  };
  return (
    <div className="modal-overlay show" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ maxWidth: '85vw', maxHeight: '85vh', background: 'var(--surface)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>{doc.name}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm btn-outline" onClick={handleDownload}>Download</button>
            <button className="btn btn-sm btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>×</button>
          </div>
        </div>
        <div style={{ width: '85vw', height: '70vh', overflow: 'auto' }}>
          {isPdf ? (
            <iframe src={doc.data} style={{ width: '100%', height: '100%', border: 'none' }} />
          ) : (
            <img src={doc.data} alt={doc.name} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', margin: '0 auto' }} />
          )}
        </div>
      </div>
    </div>
  );
};

const DonorManagement = ({ currentUser }) => {
  const [donors, setDonors] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [search, setSearch] = useState('');
  const [filterBlood, setFilterBlood] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOrgan, setFilterOrgan] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [lightboxDoc, setLightboxDoc] = useState(null);

  useEffect(() => {
    loadDonors();
    setMetrics(getVerificationMetrics());
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setShowModal(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const loadDonors = () => {
    if (currentUser.role === 'hospital') {
      setDonors(getDonorsByHospital(currentUser.id));
    } else if (currentUser.role === 'admin' && currentUser.linkedHospitalId) {
      setDonors(getDonorsByHospital(currentUser.linkedHospitalId));
    } else {
      setDonors(getDonors());
    }
    setMetrics(getVerificationMetrics());
  };

  const filteredDonors = donors.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.name?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q) ||
      d.bloodType?.toLowerCase().includes(q) || d.city?.toLowerCase().includes(q);
    const matchBlood = !filterBlood || d.bloodType === filterBlood;
    const vStatus = d.verificationStatus || 'pending';
    const matchStatus = !filterStatus || vStatus === filterStatus;
    const matchOrgan = !filterOrgan || (d.pledgedOrgans || []).includes(filterOrgan);
    const regDate = d.registrationDate ? new Date(d.registrationDate) : null;
    const matchFrom = !filterDateFrom || (regDate && regDate >= new Date(filterDateFrom));
    const matchTo = !filterDateTo || (regDate && regDate <= new Date(filterDateTo + 'T23:59:59'));

    if (activeTab === 'pending') return matchSearch && matchBlood && matchOrgan && matchFrom && matchTo &&
      (!d.verificationStatus || d.verificationStatus === 'pending');
    if (activeTab === 'review') return matchSearch && matchBlood && matchOrgan && matchFrom && matchTo &&
      d.verificationStatus === 'under_review';
    if (activeTab === 'approved') return matchSearch && matchBlood && matchOrgan && matchFrom && matchTo &&
      d.verificationStatus === 'approved';

    return matchSearch && matchBlood && matchStatus && matchOrgan && matchFrom && matchTo;
  });

  const openDonorModal = (donor) => {
    setSelectedDonor(donor);
    setVerifyNotes(donor.verificationNotes || '');
    setShowModal(true);
  };

  const handleVerify = (status) => {
    if (!verifyNotes.trim() && status === 'rejected') {
      toast('Please provide rejection reason.', 'error');
      return;
    }
    setVerifying(true);
    setTimeout(() => {
      verifyDonor(selectedDonor.id, status, verifyNotes, currentUser.id);
      loadDonors();
      setShowModal(false);
      toast(status === 'approved' ? 'Donor approved!' : status === 'rejected' ? 'Donor rejected.' : 'Status updated.', status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info');
      setVerifying(false);
    }, 600);
  };

  const handleDocStatus = (docType, docStatus) => {
    updateDonorDocumentStatus(selectedDonor.id, docType, docStatus, currentUser.id);
    const updated = getDonors().find(d => d.id === selectedDonor.id);
    setSelectedDonor(updated);
    loadDonors();
    toast(`Document marked as ${docStatus}.`, 'info');
  };

  const handleMarkUnderReview = () => {
    handleVerify('under_review');
  };

  const resetFilters = () => {
    setSearch(''); setFilterBlood(''); setFilterStatus('');
    setFilterOrgan(''); setFilterDateFrom(''); setFilterDateTo('');
  };

  const hasFilters = search || filterBlood || filterStatus || filterOrgan || filterDateFrom || filterDateTo;

  const getStepStatus = (donor, step) => {
    const vs = donor.verificationStatus || 'pending';
    const steps = ['registered', 'submitted', 'under_review', 'approved'];
    const stepIdx = steps.indexOf(step);
    const currentIdx = steps.indexOf(vs === 'rejected' ? 'submitted' : vs);
    if (vs === 'rejected' && step === 'approved') return 'rejected';
    if (stepIdx < currentIdx) return 'done';
    if (stepIdx === currentIdx) return 'current';
    return 'pending';
  };

  return (
    <div>
      {/* Metrics Row */}
      <div className="grid4" style={{ marginBottom: '20px' }}>
        <MetricCard value={metrics.total || 0} label="Total Donors" color="blue"
          icon={<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>} />
        <MetricCard value={metrics.pending || 0} label="Pending Review" color="amber"
          icon={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />
        <MetricCard value={`${metrics.avgApprovalDays || 0}d`} label="Avg. Approval Time" color="purple"
          icon={<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />
        <MetricCard value={`${metrics.rejectionRate || 0}%`} label="Rejection Rate" color="red"
          icon={<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>} />
      </div>

      {/* Verification Performance */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header flex justify-between items-center">
          <div>
            <div className="card-title">Verification Pipeline</div>
            <div className="card-sub">Current donor verification status breakdown</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: 'Registered', val: metrics.total, color: '#8494a8' },
            { label: 'Under Review', val: Math.max(0, (metrics.total || 0) - (metrics.approved || 0) - (metrics.rejected || 0) - (metrics.pending || 0)), color: '#1a5c9e' },
            { label: 'Approved', val: metrics.approved, color: '#0eb07a' },
            { label: 'Rejected', val: metrics.rejected, color: '#d63e3e' },
            { label: 'Pending', val: metrics.pending, color: '#e8900a' },
          ].map((item, i) => (
            <div key={i} style={{ flex: 1, minWidth: '100px', background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 16px', borderTop: `3px solid ${item.color}` }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text1)' }}>{item.val || 0}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label className="form-label">Search Donors</label>
            <div className="search-bar" style={{ width: '100%' }}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, blood type, city..." style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label">Blood Type</label>
            <select className="form-select" value={filterBlood} onChange={e => setFilterBlood(e.target.value)}>
              <option value="">All Types</option>
              {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '130px' }}>
            <label className="form-label">Verification Status</label>
            <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label">Organ Pledged</label>
            <select className="form-select" value={filterOrgan} onChange={e => setFilterOrgan(e.target.value)}>
              <option value="">All Organs</option>
              {ORGANS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label">From Date</label>
            <input type="date" className="form-input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label">To Date</label>
            <input type="date" className="form-input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ alignSelf: 'flex-end' }}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '4px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[
          { key: 'all', label: `All (${donors.length})` },
          { key: 'pending', label: `Pending (${donors.filter(d => !d.verificationStatus || d.verificationStatus === 'pending').length})` },
          { key: 'review', label: `Under Review (${donors.filter(d => d.verificationStatus === 'under_review').length})` },
          { key: 'approved', label: `Approved (${donors.filter(d => d.verificationStatus === 'approved').length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: 'none',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              background: activeTab === t.key ? 'var(--primary)' : 'transparent',
              color: activeTab === t.key ? '#fff' : 'var(--text2)',
              transition: 'all .15s'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Donor List */}
      <div className="card">
        {filteredDonors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">❤️</div>
            <h3>No donors found</h3>
            <p>No donors match your current filters. Try adjusting your search criteria.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Blood Type</th>
                  <th>Age</th>
                  <th>Pledged Organs</th>
                  <th>Verification</th>
                  <th>Registered</th>
                  <th>Documents</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDonors.map(donor => {
                  const vs = donor.verificationStatus || 'pending';
                  const sc = statusConfig[vs] || statusConfig.pending;
                  const docs = donor.uploadedDocuments || [];
                  return (
                    <tr key={donor.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', background: 'var(--primary-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: 'var(--primary)', flexShrink: 0 }}>
                            {donor.name?.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '13px' }}>{donor.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{donor.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                          {donor.bloodType || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px' }}>{donor.age || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(donor.pledgedOrgans || ['All Organs']).map(o => (
                            <span key={o} className="badge badge-blue" style={{ fontSize: '10px' }}>{o}</span>
                          ))}
                        </div>
                      </td>
                      <td><span className={`badge ${sc.cls}`}>{sc.label}</span></td>
                      <td style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {donor.registrationDate ? new Date(donor.registrationDate).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: docs.length > 0 ? 'var(--accent)' : 'var(--warning)' }}>
                          {docs.length} file{docs.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => openDonorModal(donor)}>
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Donor Review Modal */}
      {showModal && selectedDonor && (
        <div className="modal-overlay show" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '680px', width: '95%' }}>
            <div className="modal-header">
              <div>
                <h3>Donor Verification — {selectedDonor.name}</h3>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{selectedDonor.email}</div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh' }}>

              {/* Verification Progress */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text3)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Verification Progress
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                  {['registered', 'submitted', 'under_review', 'approved'].map((step, i, arr) => {
                    const st = getStepStatus(selectedDonor, step);
                    const labels = { registered: 'Registered', submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved' };
                    const colors = { done: '#0eb07a', current: '#1a5c9e', pending: '#e2e6ed', rejected: '#d63e3e' };
                    return (
                      <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: colors[st], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', color: st === 'pending' ? 'var(--text3)' : '#fff', fontSize: '13px', fontWeight: '700' }}>
                            {st === 'done' ? '✓' : st === 'rejected' ? '✗' : i + 1}
                          </div>
                          <div style={{ fontSize: '10px', fontWeight: '600', color: st === 'current' ? 'var(--primary)' : 'var(--text3)', whiteSpace: 'nowrap' }}>{labels[step]}</div>
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{ flex: 1, height: '2px', background: st === 'done' ? '#0eb07a' : 'var(--border)', margin: '0 4px', marginBottom: '16px' }}></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Donor Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                {[
                  { label: 'Blood Type', val: selectedDonor.bloodType || '—' },
                  { label: 'Age', val: selectedDonor.age || '—' },
                  { label: 'Registration Date', val: selectedDonor.registrationDate ? new Date(selectedDonor.registrationDate).toLocaleDateString() : '—' },
                  { label: 'Consent Signed', val: selectedDonor.consentSigned ? 'Yes' : 'No' },
                ].map((f, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '3px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '.3px' }}>{f.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: '600' }}>{f.val}</div>
                  </div>
                ))}
              </div>

              {selectedDonor.medicalHistory && (
                <div style={{ background: 'var(--surface2)', padding: '12px 14px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase' }}>Medical History</div>
                  <div style={{ fontSize: '13px', color: 'var(--text1)', lineHeight: '1.6' }}>{selectedDonor.medicalHistory}</div>
                </div>
              )}

              {/* Documents Review */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text3)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Document Review
                </div>
                {currentUser.role === 'hospital' && selectedDonor.preferredHospitalId !== currentUser.id ? (
                  <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '12px', fontSize: '13px', color: 'var(--danger)' }}>
                    🔒 Documents are only visible to the assigned hospital
                  </div>
                ) : (selectedDonor.uploadedDocuments || []).length === 0 ? (
                  <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', padding: '12px', fontSize: '13px', color: 'var(--warning)' }}>
                    No documents uploaded yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(selectedDonor.uploadedDocuments || []).map((doc, i) => {
                      const ds = selectedDonor.documentStatuses?.[doc.documentType] || {};
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                          <div style={{ width: '32px', height: '32px', background: 'var(--primary-light)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                            📄
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '600' }}>{doc.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                              {doc.documentType?.replace(/([A-Z])/g, ' $1').trim()} • {(doc.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {ds.status && (
                              <span className={`badge ${ds.status === 'approved' ? 'badge-green' : ds.status === 'rejected' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: '10px' }}>
                                {ds.status}
                              </span>
                            )}
                            <button className="btn btn-xs btn-outline" onClick={() => setLightboxDoc(doc)}>View</button>
                            <button className="btn btn-ghost btn-xs" onClick={() => handleDocStatus(doc.documentType, 'approved')}>✓ OK</button>
                            <button className="btn btn-xs" style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: 'none' }}
                              onClick={() => handleDocStatus(doc.documentType, 'rejected')}>✗ Reject</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Required docs checklist */}
              <div style={{ background: 'var(--surface2)', padding: '12px 14px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase' }}>Required Documents</div>
                {[
                  { key: 'idProof', label: 'Government ID Proof (CNIC/Passport)' },
                  { key: 'medicalCertificate', label: 'Medical Fitness Certificate' },
                ].map(req => {
                  const hasDoc = (selectedDonor.uploadedDocuments || []).some(d => d.documentType === req.key);
                  return (
                    <div key={req.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: hasDoc ? 'var(--accent)' : 'var(--danger)', fontWeight: '700', fontSize: '14px' }}>{hasDoc ? '✓' : '✗'}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text1)' }}>{req.label}</span>
                      {!hasDoc && <span className="badge badge-red" style={{ fontSize: '10px', marginLeft: 'auto' }}>Missing</span>}
                    </div>
                  );
                })}
              </div>

              {/* Verification Notes */}
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label">Verification Notes / Reason</label>
                <textarea className="form-input" style={{ height: '80px', resize: 'vertical', paddingTop: '8px' }}
                  value={verifyNotes} onChange={e => setVerifyNotes(e.target.value)}
                  placeholder="Add notes about this donor's verification (required for rejection)..." />
              </div>

              {selectedDonor.verificationNotes && selectedDonor.verificationStatus && (
                <div className="alert alert-info" style={{ marginBottom: '0' }}>
                  <span className="alert-icon">📝</span>
                  <div className="alert-content">
                    <h4>Previous Notes</h4>
                    <p>{selectedDonor.verificationNotes}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--warning-light)', color: 'var(--warning)', border: '1px solid var(--warning)' }}
                onClick={handleMarkUnderReview} disabled={verifying}>
                Mark Under Review
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleVerify('rejected')} disabled={verifying}>
                Reject
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => handleVerify('approved')} disabled={verifying}>
                {verifying ? 'Saving...' : 'Approve Donor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Lightbox */}
      {lightboxDoc && <DocumentLightboxModal doc={lightboxDoc} onClose={() => setLightboxDoc(null)} />}
    </div>
  );
};

const MetricCard = ({ value, label, color, icon }) => {
  const colors = { blue: { bg: 'var(--primary-light)', fg: 'var(--primary)' }, amber: { bg: 'var(--warning-light)', fg: 'var(--warning)' }, red: { bg: 'var(--danger-light)', fg: 'var(--danger)' }, green: { bg: 'var(--accent-light)', fg: 'var(--accent)' }, purple: { bg: '#f3f0ff', fg: '#7c5cbf' } };
  const c = colors[color] || colors.blue;
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: c.bg, color: c.fg }}>
        <svg viewBox="0 0 24 24" strokeWidth="1.8" fill="none" stroke="currentColor">{icon}</svg>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
};

export default DonorManagement;
