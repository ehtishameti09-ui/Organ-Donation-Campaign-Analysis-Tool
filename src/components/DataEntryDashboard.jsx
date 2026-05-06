import { useState, useMemo, useEffect } from 'react';
import { getDonors, getRecipients, addDonorRecord, addRecipientRecord, addActivity, calculateSurvivalEstimate, calculateAgeFromDOB } from '../utils/auth';
import { updateUserViaAPI } from '../utils/api';
import { toast } from '../utils/toast';

const ORGANS = ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Cornea', 'Bone Marrow', 'Skin', 'Intestine'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const DataEntryDashboard = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState('donors');
  const [showForm, setShowForm] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [donors, setDonors] = useState([]);
  const [recipients, setRecipients] = useState([]);

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', dob: '', age: '', gender: '', bloodType: '',
    address: '', medicalHistory: '', pledgedOrgans: [], organNeeded: '',
    diagnosis: '', urgencyScore: '', comorbidityScore: '',
  });

  useEffect(() => {
    const load = async () => {
      const [d, r] = await Promise.all([getDonors(), getRecipients()]);
      setDonors(d);
      setRecipients(r);
    };
    load();
  }, [refreshKey]);

  const displayList = activeTab === 'donors' ? donors : recipients;
  const filteredList = useMemo(() => {
    if (!search) return displayList;
    const s = search.toLowerCase();
    return displayList.filter(u => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [displayList, search]);

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', dob: '', age: '', gender: '', bloodType: '', address: '', medicalHistory: '', pledgedOrgans: [], organNeeded: '', diagnosis: '', urgencyScore: '', comorbidityScore: '' });
    setEditingRecord(null);
  };

  const openAddForm = (type) => {
    resetForm();
    setShowForm(type);
  };

  const openEditForm = (record) => {
    setEditingRecord(record);
    setFormData({
      name: record.name || '',
      email: record.email || '',
      phone: record.phone || '',
      dob: record.dob || '',
      age: record.age ? String(record.age) : '',
      gender: record.gender || '',
      bloodType: record.bloodType || '',
      address: record.address || '',
      medicalHistory: record.medicalHistory || '',
      pledgedOrgans: record.pledgedOrgans || [],
      organNeeded: record.organNeeded || '',
      diagnosis: record.diagnosis || '',
      urgencyScore: record.urgencyScore ? String(record.urgencyScore) : '',
      comorbidityScore: record.comorbidity ? String(record.comorbidity) : '',
    });
    setShowForm(record.role);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast('Name is required.', 'error'); return; }

    try {
      if (editingRecord) {
        const updates = {
          name: formData.name,
          phone: formData.phone,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender,
          bloodType: formData.bloodType,
          address: formData.address,
          medicalHistory: formData.medicalHistory,
        };
        if (editingRecord.role === 'donor') {
          updates.pledgedOrgans = formData.pledgedOrgans;
        } else {
          updates.organNeeded = formData.organNeeded;
          updates.diagnosis = formData.diagnosis;
          updates.urgencyScore = formData.urgencyScore ? parseFloat(formData.urgencyScore) : null;
          updates.comorbidity = formData.comorbidityScore ? parseFloat(formData.comorbidityScore) : null;
          if (updates.urgencyScore && updates.comorbidity) {
            updates.survivalEstimate = calculateSurvivalEstimate(
              parseInt(formData.age || 30), updates.urgencyScore, updates.comorbidity
            ) + '%';
          }
        }
        await updateUserViaAPI(editingRecord.id, updates);
        toast('Record updated successfully.', 'success');
      } else if (showForm === 'donor') {
        await addDonorRecord(formData, currentUser.id);
        toast('Donor record added successfully.', 'success');
      } else {
        await addRecipientRecord(formData, currentUser.id);
        toast('Recipient record added successfully.', 'success');
      }
      setShowForm(null);
      resetForm();
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleOrgan = (organ) => {
    setFormData(p => ({
      ...p,
      pledgedOrgans: p.pledgedOrgans.includes(organ)
        ? p.pledgedOrgans.filter(o => o !== organ)
        : [...p.pledgedOrgans, organ],
    }));
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid4" style={{ marginBottom: '24px' }}>
        {[
          { label: 'Total Donors', value: donors.length, color: 'var(--danger)', bg: 'var(--danger-light)' },
          { label: 'Total Recipients', value: recipients.length, color: 'var(--primary)', bg: 'var(--primary-light)' },
          { label: 'Pending Verification', value: [...donors, ...recipients].filter(u => !u.verificationStatus || u.verificationStatus === 'pending').length, color: 'var(--warning)', bg: 'var(--warning-light)' },
          { label: 'Added by You', value: [...donors, ...recipients].filter(u => u.addedBy === currentUser.id).length, color: 'var(--accent)', bg: 'var(--accent-light)' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Toolbar */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '16px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0', background: 'var(--surface3)', borderRadius: 'var(--radius)', padding: '3px' }}>
            {['donors', 'recipients'].map(t => (
              <button key={t} onClick={() => { setActiveTab(t); setSearch(''); }}
                style={{ padding: '8px 20px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all .2s',
                  background: activeTab === t ? 'var(--surface)' : 'transparent', color: activeTab === t ? 'var(--primary)' : 'var(--text3)', boxShadow: activeTab === t ? 'var(--shadow-sm)' : 'none' }}>
                {t === 'donors' ? `Donors (${donors.length})` : `Recipients (${recipients.length})`}
              </button>
            ))}
          </div>
          <input className="form-input" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: '180px' }} />
          <button className="btn btn-primary" onClick={() => openAddForm(activeTab === 'donors' ? 'donor' : 'recipient')}>
            + Add {activeTab === 'donors' ? 'Donor' : 'Recipient'}
          </button>
        </div>
      </div>

      {/* Records Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
              {['Name', 'Blood Type', 'Age', activeTab === 'donors' ? 'Pledged Organs' : 'Organ Needed',
                activeTab === 'donors' ? 'Status' : 'Urgency', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredList.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>No records found.</td></tr>
            )}
            {filteredList.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{r.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.email}</div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {r.bloodType ? <span className="badge badge-red">{r.bloodType}</span> : <span style={{ color: 'var(--text3)' }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text2)' }}>{r.age || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text2)' }}>
                  {activeTab === 'donors' ? ((r.pledgedOrgans || []).join(', ') || '—') : (r.organNeeded || '—')}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {activeTab === 'donors'
                    ? <span className={`badge ${r.verificationStatus === 'approved' ? 'badge-green' : r.verificationStatus === 'rejected' ? 'badge-red' : 'badge-amber'}`}>
                        {r.verificationStatus || 'pending'}
                      </span>
                    : <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--warning)' }}>{r.urgencyScore || r.urgency || '—'}</span>
                  }
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => openEditForm(r)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upload Documents Info Panel */}
      <div style={{ marginTop: '20px', background: 'var(--primary-light)', border: '1px solid rgba(26,92,158,.2)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>📤</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>Document Upload</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Documents can be uploaded during the donor/recipient registration wizard or through their individual profile pages.</div>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setShowForm(null); resetForm(); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '580px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>
              {editingRecord ? `Edit ${showForm === 'donor' ? 'Donor' : 'Recipient'}` : `Add New ${showForm === 'donor' ? 'Donor' : 'Recipient'}`}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>
              {editingRecord ? 'Update the record information.' : 'Enter details for the new record.'}
            </p>

            <form onSubmit={handleSubmit}>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Full name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={formData.email} disabled={!!editingRecord}
                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                </div>
              </div>
              <div className="grid3">
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input className="form-input" type="date" value={formData.dob}
                    onChange={e => {
                      const dob = e.target.value;
                      const age = calculateAgeFromDOB(dob);
                      setFormData(p => ({ ...p, dob, age: age || p.age }));
                    }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input className="form-input" type="number" value={formData.age}
                    onChange={e => setFormData(p => ({ ...p, age: e.target.value }))} placeholder="Age" min="1" max="120" />
                </div>
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select className="form-input" value={formData.gender}
                    onChange={e => setFormData(p => ({ ...p, gender: e.target.value }))}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Blood Type</label>
                  <select className="form-input" value={formData.bloodType}
                    onChange={e => setFormData(p => ({ ...p, bloodType: e.target.value }))}>
                    <option value="">Select</option>
                    {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="03XX-XXXXXXX" />
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="form-input" value={formData.address}
                    onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} placeholder="City, Province" />
                </div>
              </div>

              {showForm === 'donor' && (
                <div className="form-group">
                  <label className="form-label">Pledged Organs</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {ORGANS.map(organ => (
                      <button key={organ} type="button" onClick={() => toggleOrgan(organ)}
                        style={{ padding: '6px 14px', borderRadius: '999px', border: `2px solid ${formData.pledgedOrgans.includes(organ) ? 'var(--accent)' : 'var(--border)'}`,
                          background: formData.pledgedOrgans.includes(organ) ? 'var(--accent-light)' : 'var(--surface)', color: formData.pledgedOrgans.includes(organ) ? 'var(--accent)' : 'var(--text2)',
                          cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all .2s' }}>
                        {formData.pledgedOrgans.includes(organ) ? '✓ ' : ''}{organ}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showForm === 'recipient' && (
                <>
                  <div className="grid2">
                    <div className="form-group">
                      <label className="form-label">Organ Needed</label>
                      <select className="form-input" value={formData.organNeeded}
                        onChange={e => setFormData(p => ({ ...p, organNeeded: e.target.value }))}>
                        <option value="">Select organ</option>
                        {ORGANS.map(o => <option key={o} value={o.toLowerCase()}>{o}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Diagnosis</label>
                      <input className="form-input" value={formData.diagnosis}
                        onChange={e => setFormData(p => ({ ...p, diagnosis: e.target.value }))} placeholder="Primary diagnosis" />
                    </div>
                  </div>

                  {/* Critical fields — read-only display */}
                  <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '14px', marginBottom: '12px', border: '1px dashed var(--border2)' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>🔒</span> System Generated (Future Allocation Engine)
                    </div>
                    <div className="grid3">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Urgency Score</label>
                        <input className="form-input" type="number" step="0.1" min="1" max="10"
                          value={formData.urgencyScore}
                          onChange={e => setFormData(p => ({ ...p, urgencyScore: e.target.value }))}
                          placeholder="1-10" disabled style={{ cursor: 'not-allowed', background: 'var(--surface3)' }} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Comorbidity Score</label>
                        <input className="form-input" type="number" step="0.1" min="0" max="10"
                          value={formData.comorbidityScore}
                          onChange={e => setFormData(p => ({ ...p, comorbidityScore: e.target.value }))}
                          placeholder="0-10" disabled style={{ cursor: 'not-allowed', background: 'var(--surface3)' }} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Survival Estimate</label>
                        <input className="form-input" type="text" disabled
                          value={formData.urgencyScore && formData.comorbidityScore
                            ? calculateSurvivalEstimate(parseInt(formData.age || 30), parseFloat(formData.urgencyScore), parseFloat(formData.comorbidityScore)) + '%'
                            : '—'}
                          style={{ cursor: 'not-allowed', background: 'var(--surface3)', fontWeight: '700', color: 'var(--primary)' }} />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Medical History</label>
                <textarea className="form-input" rows={3} value={formData.medicalHistory}
                  onChange={e => setFormData(p => ({ ...p, medicalHistory: e.target.value }))} placeholder="Previous conditions, surgeries, medications..." />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingRecord ? 'Save Changes' : `Add ${showForm === 'donor' ? 'Donor' : 'Recipient'}`}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(null); resetForm(); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataEntryDashboard;
