import { useState, useEffect } from 'react';
import {
  getRecipients, getRecipientsByHospital, updateRecipientCase, calculateSurvivalEstimate,
  getWaitingTimeAnalytics
} from '../utils/auth';
import { generateRegistrationPDF } from '../utils/pdfReport';
import { toast } from '../utils/toast';

const ORGANS = ['kidney', 'liver', 'heart', 'lung', 'pancreas', 'cornea', 'bone marrow'];

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

const caseStatusSteps = ['registered', 'verified', 'eligible', 'active'];
const caseStatusConfig = {
  registered: { label: 'Registered', color: '#8494a8', bg: '#f0f2f6' },
  verified: { label: 'Verified', color: '#1a5c9e', bg: '#e8f1fb' },
  eligible: { label: 'Eligible', color: '#e8900a', bg: '#fef3e0' },
  active: { label: 'Active', color: '#0eb07a', bg: '#e6f9f2' },
  inactive: { label: 'Inactive', color: '#d63e3e', bg: '#fdeaea' },
};

const RecipientManagement = ({ currentUser }) => {
  const [recipients, setRecipients] = useState([]);
  const [waitingAnalytics, setWaitingAnalytics] = useState([]);
  const [search, setSearch] = useState('');
  const [filterOrgan, setFilterOrgan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');
  const [sortBy, setSortBy] = useState('urgency');
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [caseForm, setCaseForm] = useState({});
  const [lightboxDoc, setLightboxDoc] = useState(null);

  useEffect(() => {
    loadRecipients();
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setShowModal(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const loadRecipients = async () => {
    try {
      let r;
      if (currentUser.role === 'hospital') {
        r = await getRecipientsByHospital(currentUser.id);
      } else if (currentUser.role === 'admin' && currentUser.linkedHospitalId) {
        r = await getRecipientsByHospital(currentUser.linkedHospitalId);
      } else {
        r = await getRecipients();
      }
      setRecipients(r);
      const analytics = await getWaitingTimeAnalytics();
      setWaitingAnalytics(analytics);
    } catch {}
  };

  const filteredAndSorted = recipients
    .filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.diagnosis?.toLowerCase().includes(q);
      const matchOrgan = !filterOrgan || r.organNeeded === filterOrgan;
      const matchStatus = !filterStatus || (r.caseStatus || 'registered') === filterStatus;
      const urgency = parseFloat(r.urgencyScore || 0);
      const matchUrgency = !filterUrgency ||
        (filterUrgency === 'high' && urgency >= 7) ||
        (filterUrgency === 'medium' && urgency >= 4 && urgency < 7) ||
        (filterUrgency === 'low' && urgency < 4);
      return matchSearch && matchOrgan && matchStatus && matchUrgency;
    })
    .sort((a, b) => {
      if (sortBy === 'urgency') return (parseFloat(b.urgencyScore) || 0) - (parseFloat(a.urgencyScore) || 0);
      if (sortBy === 'waiting') return (b.daysOnWaitlist || 0) - (a.daysOnWaitlist || 0);
      if (sortBy === 'name') return a.name?.localeCompare(b.name) || 0;
      if (sortBy === 'survival') return (parseFloat(a.survivalEstimate) || 0) - (parseFloat(b.survivalEstimate) || 0);
      return 0;
    });

  const openCaseModal = (recipient) => {
    setSelectedRecipient(recipient);
    setCaseForm({
      diagnosis: recipient.diagnosis || '',
      age: recipient.age || '',
      organNeeded: recipient.organNeeded || '',
      urgencyScore: recipient.urgencyScore || 5,
      comorbidityScore: recipient.comorbidityScore || 3,
      labValues: recipient.labValues || '',
      caseStatus: recipient.caseStatus || 'registered',
      clinicalNotes: recipient.clinicalNotes || '',
      bloodType: recipient.bloodType || '',
    });
    setShowModal(true);
  };

  const handleFormChange = (field, value) => {
    setCaseForm(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-calculate survival estimate when relevant fields change
      if (['age', 'urgencyScore', 'comorbidityScore'].includes(field)) {
        const est = calculateSurvivalEstimate(
          parseInt(updated.age) || 30,
          parseFloat(updated.urgencyScore) || 5,
          parseFloat(updated.comorbidityScore) || 3
        );
        updated._previewSurvival = est;
      }
      return updated;
    });
  };

  const handleSaveCase = async () => {
    if (!caseForm.diagnosis || !caseForm.age || !caseForm.organNeeded) {
      toast('Please fill diagnosis, age, and organ needed.', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateRecipientCase(selectedRecipient.id, {
        ...caseForm,
        daysOnWaitlist: Math.round((new Date() - new Date(selectedRecipient.registrationDate)) / (1000 * 60 * 60 * 24))
      }, currentUser.id);
      await loadRecipients();
      setShowModal(false);
      toast('Recipient case updated!', 'success');
    } catch (e) {
      toast(e.message || 'Update failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getUrgencyColor = (score) => {
    const s = parseFloat(score);
    if (s >= 8) return { color: '#d63e3e', bg: '#fdeaea', label: 'Critical' };
    if (s >= 6) return { color: '#e8900a', bg: '#fef3e0', label: 'High' };
    if (s >= 4) return { color: '#1a5c9e', bg: '#e8f1fb', label: 'Medium' };
    return { color: '#0eb07a', bg: '#e6f9f2', label: 'Low' };
  };

  const getStatusStepIndex = (status) => {
    const idx = caseStatusSteps.indexOf(status);
    return idx === -1 ? 0 : idx;
  };

  const totalRecipients = recipients.length;
  const activeRecipients = recipients.filter(r => r.caseStatus === 'active').length;
  const criticalRecipients = recipients.filter(r => parseFloat(r.urgencyScore) >= 8).length;
  const avgWaiting = recipients.length > 0
    ? Math.round(recipients.reduce((sum, r) => sum + (r.daysOnWaitlist || 0), 0) / recipients.length)
    : 0;

  return (
    <div>
      {/* Metrics */}
      <div className="grid4" style={{ marginBottom: '20px' }}>
        {[
          { val: totalRecipients, label: 'Total Recipients', color: 'blue', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></> },
          { val: activeRecipients, label: 'Active on Waitlist', color: 'green', icon: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
          { val: criticalRecipients, label: 'Critical Urgency', color: 'red', icon: <><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></> },
          { val: `${avgWaiting}d`, label: 'Avg. Wait Time', color: 'amber', icon: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
        ].map((m, i) => {
          const colors = { blue: { bg: 'var(--primary-light)', fg: 'var(--primary)' }, green: { bg: 'var(--accent-light)', fg: 'var(--accent)' }, red: { bg: 'var(--danger-light)', fg: 'var(--danger)' }, amber: { bg: 'var(--warning-light)', fg: 'var(--warning)' } };
          const c = colors[m.color];
          return (
            <div className="stat-card" key={i}>
              <div className="stat-icon" style={{ background: c.bg, color: c.fg }}>
                <svg viewBox="0 0 24 24" strokeWidth="1.8" fill="none" stroke="currentColor">{m.icon}</svg>
              </div>
              <div className="stat-value">{m.val}</div>
              <div className="stat-label">{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Waiting Time by Organ */}
      {waitingAnalytics.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div className="card-title">Average Waiting Time by Organ Type</div>
            <div className="card-sub">Days recipients have been on the waiting list</div>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {waitingAnalytics.map(item => (
              <div key={item.organ} style={{ flex: 1, minWidth: '120px', background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text1)' }}>{item.avgDays}d</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px', textTransform: 'capitalize' }}>{item.organ}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{item.count} recipient{item.count !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label className="form-label">Search Recipients</label>
            <div className="search-bar" style={{ width: '100%' }}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, diagnosis..." style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label">Organ Needed</label>
            <select className="form-select" value={filterOrgan} onChange={e => setFilterOrgan(e.target.value)}>
              <option value="">All Organs</option>
              {ORGANS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label">Case Status</label>
            <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="registered">Registered</option>
              <option value="verified">Verified</option>
              <option value="eligible">Eligible</option>
              <option value="active">Active</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '110px' }}>
            <label className="form-label">Urgency Level</label>
            <select className="form-select" value={filterUrgency} onChange={e => setFilterUrgency(e.target.value)}>
              <option value="">All Levels</option>
              <option value="high">High (7-10)</option>
              <option value="medium">Medium (4-6)</option>
              <option value="low">Low (&lt;4)</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label className="form-label">Sort By</label>
            <select className="form-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="urgency">Urgency Score</option>
              <option value="waiting">Waiting Time</option>
              <option value="survival">Survival Estimate</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Recipient List */}
      <div className="card">
        {filteredAndSorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏥</div>
            <h3>No recipients found</h3>
            <p>No recipients match your current filters.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Organ Needed</th>
                  <th>Diagnosis</th>
                  <th>Urgency</th>
                  <th>Survival Est.</th>
                  <th>Wait Days</th>
                  <th>Case Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map(r => {
                  const urgInfo = getUrgencyColor(r.urgencyScore);
                  const cs = caseStatusConfig[r.caseStatus || 'registered'] || caseStatusConfig.registered;
                  const days = r.daysOnWaitlist || Math.round((new Date() - new Date(r.registrationDate)) / (1000 * 60 * 60 * 24));
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', background: 'var(--accent-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: 'var(--accent)', flexShrink: 0 }}>
                            {r.name?.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '13px' }}>{r.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>
                          {r.organNeeded || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text2)', maxWidth: '150px' }}>
                        <span className="truncate" style={{ display: 'block' }}>{r.diagnosis || '—'}</span>
                      </td>
                      <td>
                        <span style={{ background: urgInfo.bg, color: urgInfo.color, padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                          {r.urgencyScore || '—'} <span style={{ fontWeight: '400', fontSize: '10px' }}>({urgInfo.label})</span>
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${r.survivalEstimate?.replace('%', '') || 0}%`, height: '100%', background: parseInt(r.survivalEstimate) >= 70 ? '#0eb07a' : parseInt(r.survivalEstimate) >= 50 ? '#e8900a' : '#d63e3e' }}></div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '600' }}>{r.survivalEstimate || '—'}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '13px', fontWeight: '600', color: days > 180 ? 'var(--danger)' : days > 90 ? 'var(--warning)' : 'var(--text1)' }}>
                        {days}d
                      </td>
                      <td>
                        <span style={{ background: cs.bg, color: cs.color, padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '600' }}>
                          {cs.label}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => openCaseModal(r)}>
                          Manage Case
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

      {/* Case Management Modal */}
      {showModal && selectedRecipient && (
        <div className="modal-overlay show" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '700px', width: '95%' }}>
            <div className="modal-header">
              <div>
                <h3>Case Management — {selectedRecipient.name}</h3>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{selectedRecipient.email}</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => generateRegistrationPDF(selectedRecipient)}
                  title="Open full patient report in a new tab"
                >
                  👁 View Info
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  onClick={() => generateRegistrationPDF(selectedRecipient)}
                  title="Open patient report — use Save as PDF / Print to download"
                >
                  ⬇ Download Report
                </button>
                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
              </div>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh' }}>

              {/* Status Progress Bar */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text3)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '.5px' }}>Case Progress</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {caseStatusSteps.map((step, i, arr) => {
                    const currentIdx = getStatusStepIndex(caseForm.caseStatus || 'registered');
                    const isDone = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    const config = caseStatusConfig[step];
                    return (
                      <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div onClick={() => handleFormChange('caseStatus', step)}
                            style={{
                              width: '36px', height: '36px', borderRadius: '50%', margin: '0 auto 6px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: isDone || isCurrent ? config.color : 'var(--border)',
                              color: isDone || isCurrent ? '#fff' : 'var(--text3)',
                              fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                              border: isCurrent ? `3px solid ${config.color}` : 'none',
                              outline: isCurrent ? `2px solid ${config.bg}` : 'none',
                              transition: 'all .2s'
                            }}>
                            {isDone ? '✓' : i + 1}
                          </div>
                          <div style={{ fontSize: '10px', fontWeight: '600', color: isCurrent ? config.color : 'var(--text3)', whiteSpace: 'nowrap' }}>{config.label}</div>
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{ flex: 1, height: '3px', background: isDone ? config.color : 'var(--border)', margin: '0 6px', marginBottom: '20px', borderRadius: '2px' }}></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Clinical Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Organ Needed *</label>
                  <select className="form-select" value={caseForm.organNeeded} onChange={e => handleFormChange('organNeeded', e.target.value)}>
                    <option value="">Select organ</option>
                    {ORGANS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Blood Type</label>
                  <select className="form-select" value={caseForm.bloodType} onChange={e => handleFormChange('bloodType', e.target.value)}>
                    <option value="">Select</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Primary Diagnosis *</label>
                  <input className="form-input" value={caseForm.diagnosis} onChange={e => handleFormChange('diagnosis', e.target.value)}
                    placeholder="e.g. End-Stage Renal Disease (ESRD)" />
                </div>
                <div>
                  <label className="form-label">Patient Age *</label>
                  <input type="number" className="form-input" value={caseForm.age} onChange={e => handleFormChange('age', e.target.value)}
                    min="1" max="100" placeholder="Age in years" />
                </div>
                <div>
                  <label className="form-label">Lab Values (key metrics)</label>
                  <input className="form-input" value={caseForm.labValues} onChange={e => handleFormChange('labValues', e.target.value)}
                    placeholder="e.g. Creatinine: 8.2 mg/dL, GFR: 12" />
                </div>
              </div>

              {/* Scoring */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Urgency Score (1–10)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="range" min="1" max="10" step="0.5" value={caseForm.urgencyScore || 5}
                      onChange={e => handleFormChange('urgencyScore', e.target.value)}
                      style={{ flex: 1 }} />
                    <span style={{ fontSize: '16px', fontWeight: '700', color: parseFloat(caseForm.urgencyScore) >= 7 ? 'var(--danger)' : parseFloat(caseForm.urgencyScore) >= 4 ? 'var(--warning)' : 'var(--accent)', minWidth: '28px' }}>
                      {caseForm.urgencyScore}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    {parseFloat(caseForm.urgencyScore) >= 8 ? 'Critical' : parseFloat(caseForm.urgencyScore) >= 6 ? 'High' : parseFloat(caseForm.urgencyScore) >= 4 ? 'Medium' : 'Low'}
                  </div>
                </div>
                <div>
                  <label className="form-label">Comorbidity Score (0–10)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="range" min="0" max="10" step="0.5" value={caseForm.comorbidityScore || 3}
                      onChange={e => handleFormChange('comorbidityScore', e.target.value)}
                      style={{ flex: 1 }} />
                    <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text1)', minWidth: '28px' }}>
                      {caseForm.comorbidityScore}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    {parseFloat(caseForm.comorbidityScore) >= 8 ? 'Severe' : parseFloat(caseForm.comorbidityScore) >= 5 ? 'Moderate' : 'Mild'}
                  </div>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '700' }}>Survival Estimate</div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: (caseForm._previewSurvival || parseInt(selectedRecipient.survivalEstimate)) >= 70 ? 'var(--accent)' : (caseForm._previewSurvival || parseInt(selectedRecipient.survivalEstimate)) >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {caseForm._previewSurvival || selectedRecipient.survivalEstimate || '—'}
                    {caseForm._previewSurvival ? '%' : ''}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Auto-calculated</div>
                </div>
              </div>

              {/* Clinical Notes */}
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label">Clinical Notes</label>
                <textarea className="form-input" style={{ height: '80px', resize: 'vertical', paddingTop: '8px' }}
                  value={caseForm.clinicalNotes} onChange={e => handleFormChange('clinicalNotes', e.target.value)}
                  placeholder="Additional clinical observations, treatment history, special requirements..." />
              </div>

              {/* Wait Info */}
              <div style={{ background: 'var(--surface2)', padding: '12px 16px', borderRadius: 'var(--radius)', display: 'flex', gap: '24px' }}>
                {[
                  { label: 'Days on Waitlist', val: selectedRecipient.daysOnWaitlist || Math.round((new Date() - new Date(selectedRecipient.registrationDate)) / (1000 * 60 * 60 * 24)) + 'd' },
                  { label: 'Registration Date', val: selectedRecipient.registrationDate ? new Date(selectedRecipient.registrationDate).toLocaleDateString() : '—' },
                  { label: 'Last Updated', val: selectedRecipient.lastCaseUpdate ? new Date(selectedRecipient.lastCaseUpdate).toLocaleDateString() : 'Never' },
                ].map((f, i) => (
                  <div key={i}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: '700' }}>{f.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)', marginTop: '2px' }}>{f.val}</div>
                  </div>
                ))}
              </div>

              {/* Uploaded Documents */}
              {(selectedRecipient.uploadedDocuments || []).length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ marginTop: 0, fontSize: '13px', fontWeight: '600' }}>Submitted Documents</h4>
                  {(() => {
                    const canView = currentUser.role === 'admin' ||
                      (currentUser.role === 'hospital' && selectedRecipient.preferredHospitalId === currentUser.id) ||
                      (currentUser.role === 'admin' && currentUser.linkedHospitalId === selectedRecipient.preferredHospitalId);
                    if (!canView) return (
                      <div style={{ color: 'var(--text3)', fontSize: '12px' }}>
                        🔒 Documents only visible to assigned hospital
                      </div>
                    );
                    return selectedRecipient.uploadedDocuments.map((doc, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px' }}>📎 {doc.name}</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-xs btn-outline" onClick={() => setLightboxDoc(doc)}>View</button>
                          <button className="btn btn-xs btn-ghost" onClick={() => { const a = document.createElement('a'); a.href = doc.data; a.download = doc.name; a.click(); }}>Download</button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveCase} disabled={saving}>
                {saving ? 'Saving...' : 'Save Case'}
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

export default RecipientManagement;
