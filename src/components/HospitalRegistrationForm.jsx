import { useState } from 'react';
import { updateUserViaAPI } from '../utils/api';
import { toast } from '../utils/toast';

/**
 * Post-Google-signup hospital registration form.
 * The user already has an account (Google-authenticated, status=pending) but needs
 * to provide hospital-specific details (registration number, license, address, etc.)
 * before super admin review.
 */
const HospitalRegistrationForm = ({ user, onComplete }) => {
  const [data, setData] = useState({
    hospitalName:       user.name || '',
    registrationNumber: '',
    licenseNumber:      '',
    contactPerson:      user.name || '',
    phone:              user.phone || '',
    hospitalAddress:    '',
    city:               'Rawalpindi',
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (k) => (e) => setData(d => ({ ...d, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!data.hospitalName.trim() || !data.registrationNumber.trim() || !data.licenseNumber.trim()
        || !data.contactPerson.trim() || !data.phone.trim() || !data.hospitalAddress.trim()) {
      toast('Please fill in all required fields.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await updateUserViaAPI(user.id, {
        phone: data.phone,
        hospital_profile: {
          hospital_name:       data.hospitalName,
          registration_number: data.registrationNumber.toUpperCase(),
          license_number:      data.licenseNumber.toUpperCase(),
          contact_person:      data.contactPerson,
          hospital_address:    data.hospitalAddress,
          city:                data.city,
        },
      });
      toast('Hospital registration submitted! A super admin will review your application.', 'success');
      onComplete && onComplete();
    } catch (err) {
      toast(err.message || 'Failed to submit registration.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a5c9e 0%, #2871be 100%)',
        color: 'white', padding: '20px 24px', borderRadius: 'var(--radius)', marginBottom: '20px',
      }}>
        <div style={{ fontSize: '17px', fontWeight: '700' }}>🏨 Complete Your Hospital Registration</div>
        <div style={{ fontSize: '13px', opacity: 0.92, marginTop: '4px' }}>
          Welcome, {user.name?.split(' ')[0]}! Provide your hospital's details below — a super admin will review and approve your account.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ padding: '20px' }}>
        <div className="card-header" style={{ marginBottom: '16px' }}>
          <div className="card-title">Hospital Information</div>
          <div className="card-sub">All fields marked * are required for approval</div>
        </div>

        <div className="form-group">
          <label className="form-label">Hospital Name *</label>
          <input className="form-input" value={data.hospitalName} onChange={update('hospitalName')} placeholder="e.g. Aga Khan University Hospital" />
        </div>

        <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Registration # (PMDC) *</label>
            <input className="form-input" value={data.registrationNumber} onChange={update('registrationNumber')} placeholder="e.g. PMDC-AKU-1985-001" />
          </div>
          <div className="form-group">
            <label className="form-label">License # *</label>
            <input className="form-input" value={data.licenseNumber} onChange={update('licenseNumber')} placeholder="e.g. SHC-AKU-1985-LIC" />
          </div>
        </div>

        <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Contact Person *</label>
            <input className="form-input" value={data.contactPerson} onChange={update('contactPerson')} placeholder="e.g. Dr. Sara Iqbal" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone *</label>
            <input className="form-input" value={data.phone} onChange={update('phone')} placeholder="e.g. +92-300-1234567" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Hospital Address *</label>
          <textarea className="form-input" rows="3" value={data.hospitalAddress} onChange={update('hospitalAddress')} placeholder="Complete physical address" />
        </div>

        <div className="form-group">
          <label className="form-label">City</label>
          <select className="form-input" value={data.city} onChange={update('city')}>
            {['Rawalpindi', 'Islamabad', 'Karachi', 'Lahore', 'Peshawar', 'Quetta', 'Faisalabad', 'Multan', 'Other'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div style={{
          padding: '12px 14px',
          background: '#fff8e6',
          border: '1px solid #f0c14b',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#7a5a00',
          marginBottom: '16px',
        }}>
          <strong>📋 Next steps after submission:</strong>
          <ol style={{ marginTop: '6px', marginBottom: 0, paddingLeft: '20px' }}>
            <li>Super admin reviews your application (typically 1–3 business days)</li>
            <li>You may be asked to upload registration & license documents</li>
            <li>Once approved, you can register donors/recipients and use the allocation engine</li>
          </ol>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting…' : '📨 Submit Registration'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default HospitalRegistrationForm;
