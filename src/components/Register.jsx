import { useState } from 'react';
import { registerUser, registerBasicAccount, getAllUsers, addActivity } from '../utils/auth';
import { toast } from '../utils/toast';

// ============================================================
// HOSPITAL DOCUMENT CONFIG (only used for hospital flow now)
// ============================================================
const DOCUMENT_CONFIG = {
  registrationCertificate: {
    label: 'Hospital Registration Certificate',
    description: 'Official certificate from Health Ministry / provincial authority registering the hospital.',
    sample: '📋 Example: Ministry of Health letterhead, hospital name, registration number, validity date',
    accept: 'image/*,.pdf',
    maxSizeMB: 10,
    maxSizeLabel: '10 MB',
    required: true
  },
  healthcareLicense: {
    label: 'Healthcare Institution License',
    description: 'Valid license to operate as a healthcare institution. Must not be expired.',
    sample: '📜 Example: PMDC/PHSA license, institution name, valid till date, authority seal',
    accept: 'image/*,.pdf',
    maxSizeMB: 10,
    maxSizeLabel: '10 MB',
    required: true
  },
  taxCertificate: {
    label: 'Tax Registration Certificate (NTN)',
    description: 'National Tax Number certificate from FBR or equivalent tax authority.',
    sample: '💼 Example: FBR certificate, NTN number, registered entity name',
    accept: 'image/*,.pdf',
    maxSizeMB: 5,
    maxSizeLabel: '5 MB',
    required: false
  },
  ethicalPolicy: {
    label: 'Ethical Policy Document',
    description: 'Your hospital\'s organ donation and transplantation ethical guidelines document.',
    sample: '📄 Example: Internal policy document, ethics committee approval, signed by CMO',
    accept: 'image/*,.pdf',
    maxSizeMB: 10,
    maxSizeLabel: '10 MB',
    required: false
  },
  transplantLicense: {
    label: 'Transplant Authorization License',
    description: 'Special authorization to perform transplant surgeries, issued by HOTA or equivalent.',
    sample: '🏅 Example: HOTA certificate, authorized transplant types, surgeon credentials',
    accept: 'image/*,.pdf',
    maxSizeMB: 10,
    maxSizeLabel: '10 MB',
    required: false
  }
};

// ============================================================
// DOCUMENT UPLOAD CARD (used in hospital flow)
// ============================================================
const DocumentUploadCard = ({ docKey, config, uploadedDoc, onUpload, onRemove }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    // Check for suspicious file names
    if (/sample|example|test|template|placeholder|dummy/i.test(file.name)) {
      toast('This file appears to be a sample. Please upload your real document.', 'warning');
    }
    const maxBytes = config.maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      toast(`File too large. Maximum size is ${config.maxSizeLabel}. Please compress or use a smaller file.`, 'error');
      return;
    }
    const validTypes = config.accept.split(',').map(t => t.trim());
    const isImage = file.type.startsWith('image/') && validTypes.includes('image/*');
    const isPdf = file.type === 'application/pdf' && validTypes.includes('.pdf');
    if (!isImage && !isPdf) {
      toast(`Invalid file type. Accepted: ${config.accept}`, 'error');
      return;
    }
    if (file.size < 5000) {
      toast('File appears to be too small or blank. Please upload a clear, legible document.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onUpload(docKey, { name: file.name, type: file.type, size: file.size, data: reader.result, documentType: docKey, uploadedAt: new Date().toISOString() });
      toast(`"${file.name}" uploaded successfully.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div style={{ border: `2px dashed ${uploadedDoc ? 'var(--accent)' : dragOver ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '16px', background: uploadedDoc ? 'var(--accent-light)' : dragOver ? 'var(--primary-light)' : 'var(--surface)', transition: 'all .2s', marginBottom: '12px' }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', background: uploadedDoc ? 'var(--accent)' : 'var(--surface3)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
          {uploadedDoc ? '✅' : config.required ? '📋' : '📄'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{config.label}</span>
            {config.required && <span className="badge badge-red" style={{ fontSize: '10px' }}>Required</span>}
            {!config.required && <span className="badge badge-gray" style={{ fontSize: '10px' }}>Optional</span>}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '6px' }}>{config.description}</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Max size: {config.maxSizeLabel} • Accepted: Images or PDF</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <label style={{ cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} accept={config.accept}
              onChange={e => handleFile(e.target.files[0])} />
            <span className={`btn btn-sm ${uploadedDoc ? 'btn-ghost' : 'btn-outline'}`} style={{ cursor: 'pointer' }}>
              {uploadedDoc ? 'Replace' : 'Upload'}
            </span>
          </label>
          {uploadedDoc && (
            <button type="button" className="btn btn-xs" onClick={() => onRemove(docKey)}
              style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: 'none' }}>
              Remove
            </button>
          )}
        </div>
      </div>

      {uploadedDoc && (
        <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(14,176,122,.1)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📎</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text1)' }}>{uploadedDoc.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{(uploadedDoc.size / 1024).toFixed(1)} KB • Uploaded just now</div>
          </div>
          <span style={{ fontSize: '16px', color: 'var(--accent)' }}>✓</span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// MAIN REGISTER COMPONENT
// ============================================================
const Register = ({ onRegistrationSuccess, onBackToLogin }) => {
  const [accountType, setAccountType] = useState(null);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', confirmPassword: '', phone: '',
    // Hospital-only
    hospitalName: '', registrationNumber: '', licenseNumber: '',
    hospitalAddress: '', contactPerson: '',
  });
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [complianceDecl, setComplianceDecl] = useState({ lawsCompliance: false, platformTerms: false });
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const formatPKPhone = (value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('92')) {
      const rest = digits.slice(2, 12);
      if (rest.length <= 3) return `+92 ${rest}`;
      return `+92 ${rest.slice(0, 3)} ${rest.slice(3)}`;
    }
    const local = digits.slice(0, 11);
    if (local.length <= 4) return local;
    return `${local.slice(0, 4)}-${local.slice(4)}`;
  };

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'phone' ? formatPKPhone(value) : value }));
  };

  // ============================================================
  // VALIDATION
  // ============================================================

  // Validate the basic credentials section. Works for ALL account types.
  // For hospital, we validate `contactPerson` (the displayed "name" field) instead of `name`.
  const validateCredentials = () => {
    const displayName = accountType === 'hospital' ? formData.contactPerson : formData.name;

    if (!displayName || !displayName.trim()) {
      toast('Please enter your full name.', 'error'); return false;
    }
    if (!formData.email.trim()) {
      toast('Email is required.', 'error'); return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast('Please enter a valid email address.', 'error'); return false;
    }
    if (!formData.password) {
      toast('Password is required.', 'error'); return false;
    }
    if (formData.password.length < 8) {
      toast('Password must be at least 8 characters.', 'error'); return false;
    }
    if (!/[A-Z]/.test(formData.password)) {
      toast('Password must contain at least one uppercase letter.', 'error'); return false;
    }
    if (!/[a-z]/.test(formData.password)) {
      toast('Password must contain at least one lowercase letter.', 'error'); return false;
    }
    if (!/[0-9]/.test(formData.password)) {
      toast('Password must contain at least one number.', 'error'); return false;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password)) {
      toast('Password must contain at least one special character (!@#$%^&*).', 'error'); return false;
    }
    if (formData.password !== formData.confirmPassword) {
      toast('Passwords do not match.', 'error'); return false;
    }
    const users = getAllUsers();
    if (users.some(u => u.email === formData.email && !u.deleted)) {
      toast('This email is already registered.', 'error'); return false;
    }
    return true;
  };

  const validateHospitalInfo = () => {
    if (!formData.hospitalName.trim() || !formData.registrationNumber.trim() || !formData.licenseNumber.trim() || !formData.phone.trim() || !formData.hospitalAddress.trim()) {
      toast('Please fill all hospital information fields.', 'error'); return false;
    }
    return true;
  };

  const validateHospitalDocs = () => {
    const missingRequired = ['registrationCertificate', 'healthcareLicense'].filter(k => !uploadedDocs[k]);
    if (missingRequired.length > 0) {
      toast('Please upload all required documents (Hospital Registration Certificate and Healthcare License).', 'error');
      return false;
    }
    if (!complianceDecl.lawsCompliance || !complianceDecl.platformTerms) {
      toast('Please confirm all compliance declarations.', 'error'); return false;
    }
    return true;
  };

  const handleDocUpload = (docKey, fileData) => {
    setUploadedDocs(prev => ({ ...prev, [docKey]: fileData }));
  };

  const handleDocRemove = (docKey) => {
    setUploadedDocs(prev => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
  };

  // ============================================================
  // SUBMISSION HANDLERS
  // ============================================================

  // Donor / recipient: just create a basic account, no clinical data
  const handleDonorRecipientSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validateCredentials()) return;
    setSubmitting(true);
    setTimeout(() => {
      try {
        registerBasicAccount(formData.name, formData.email, formData.password, accountType, formData.phone);
        onRegistrationSuccess({
          type: accountType,
          email: formData.email,
          password: formData.password,
          name: formData.name,
        });
      } catch (err) {
        toast(err.message || 'Registration failed. Please try again.', 'error');
        setSubmitting(false);
      }
    }, 500);
  };

  // Hospital: full multi-step registration with documents
  const handleHospitalNext = (e) => {
    if (e) e.preventDefault();
    if (step === 2 && !validateCredentials()) return;
    if (step === 3 && !validateHospitalInfo()) return;
    setStep(s => s + 1);
  };

  const handleHospitalSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validateHospitalDocs()) return;
    setSubmitting(true);
    setTimeout(() => {
      try {
        const regData = {
          type: 'hospital',
          email: formData.email,
          password: formData.password,
          name: formData.contactPerson, // hospital uses contactPerson as the user "name"
          contactPerson: formData.contactPerson,
          phone: formData.phone,
          hospitalName: formData.hospitalName,
          registrationNumber: formData.registrationNumber,
          licenseNumber: formData.licenseNumber,
          hospitalAddress: formData.hospitalAddress,
          uploadedDocuments: Object.values(uploadedDocs),
        };
        registerUser(regData);
        addActivity('hospital_registered', '🏥', 'New Hospital Registration', `${formData.hospitalName} submitted a registration request`);
        onRegistrationSuccess(regData);
      } catch (err) {
        toast(err.message || 'Registration failed. Please try again.', 'error');
        setSubmitting(false);
      }
    }, 600);
  };

  // ============================================================
  // STEP 1: ACCOUNT TYPE SELECTION
  // ============================================================
  if (step === 1) {
    return (
      <div className="auth-wrapper">
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-logo">
              <div className="auth-logo-icon">
                <svg viewBox="0 0 24 24" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <div className="auth-logo-text"><h1>Organ Donation Campaign Analysis Tool</h1><p>Healthcare System</p></div>
            </div>
            <div className="auth-headline">Join Pakistan's<br />Organ Donation<br />Network</div>
            <div className="auth-subtext">Create your account to become part of a life-saving mission. Every registration matters.</div>
          </div>
          <div className="auth-stats">
            <div className="auth-stat"><div className="auth-stat-val">1,247+</div><div className="auth-stat-lbl">Lives Saved</div></div>
            <div className="auth-stat"><div className="auth-stat-val">500+</div><div className="auth-stat-lbl">Active Donors</div></div>
            <div className="auth-stat"><div className="auth-stat-val">48</div><div className="auth-stat-lbl">Partner Hospitals</div></div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card" style={{ maxWidth: '480px' }}>
            <div className="auth-mobile-brand">
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>Organ Donation Campaign Analysis Tool</div>
            </div>
            <div className="auth-card-header">
              <h2>Create Your Account</h2>
              <p>Choose how you want to participate in the organ donation network</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { type: 'donor', icon: '❤️', title: 'Organ Donor', desc: 'Quick signup. After login, complete your donor registration to start saving lives.' },
                { type: 'recipient', icon: '🏥', title: 'Transplant Recipient', desc: 'Quick signup. After login, complete your case registration to get matched with donors.' },
                { type: 'hospital', icon: '🏨', title: 'Hospital / Medical Center', desc: 'Register your hospital to access the Organ Donation Campaign Analysis Tool transplant coordination network.' },
              ].map(card => (
                <button key={card.type} type="button" onClick={() => { setAccountType(card.type); setStep(2); }}
                  className="registration-card" style={{ textAlign: 'left', width: '100%', border: '2px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '14px', transition: 'all .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-light)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}>
                  <div style={{ fontSize: '28px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)', borderRadius: 'var(--radius)', flexShrink: 0 }}>{card.icon}</div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text1)', marginBottom: '4px' }}>{card.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5' }}>{card.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <button type="button" onClick={onBackToLogin}
                style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>
                Already have an account? Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // DONOR / RECIPIENT — SIMPLE BASIC ACCOUNT FORM
  // ============================================================
  if (accountType === 'donor' || accountType === 'recipient') {
    return (
      <div className="auth-wrapper">
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-logo">
              <div className="auth-logo-icon">
                <svg viewBox="0 0 24 24" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <div className="auth-logo-text"><h1>Organ Donation Campaign Analysis Tool</h1><p>Healthcare System</p></div>
            </div>
            <div className="auth-headline">{accountType === 'donor' ? 'Become a Life Saver' : 'Register for Transplant'}</div>
            <div className="auth-subtext">
              {accountType === 'donor'
                ? 'Quick signup — just basic info now. Complete your full registration after logging in.'
                : 'Quick signup — just basic info now. Complete your full case registration after logging in.'}
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,.7)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              How It Works
            </div>
            {[
              '1. Create your basic account (now)',
              '2. Read & sign Pakistan consent form',
              '3. Fill medical / clinical details',
              '4. Upload required documents',
              '5. Submit to your preferred hospital'
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,.85)', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: '#0eb07a', fontWeight: '700' }}>{i === 0 ? '➤' : '○'}</span> {item}
              </div>
            ))}
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card" style={{ maxWidth: '460px' }}>
            <button type="button" onClick={() => { setStep(1); setAccountType(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ← Back to account type
            </button>

            <div className="auth-card-header">
              <h2>{accountType === 'donor' ? '❤️ Quick Donor Signup' : '🏥 Quick Recipient Signup'}</h2>
              <p>Just basic details for now — you'll complete the full registration after logging in.</p>
            </div>

            <form onSubmit={handleDonorRecipientSubmit} autoComplete="off">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" name="name" value={formData.name}
                  onChange={handleInput} placeholder="Your legal full name" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input className="form-input" name="email" type="email" value={formData.email}
                  onChange={handleInput} placeholder="your@email.com" required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-input" name="phone" type="tel" value={formData.phone}
                  onChange={handleInput} placeholder="03XX-XXXXXXX" />
              </div>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <div className="form-input-wrap">
                    <input className="form-input" name="password" type={showPass ? 'text' : 'password'} value={formData.password}
                      onChange={handleInput} placeholder="Min. 8 chars, 1 upper, 1 number" required />
                    <button type="button" className="form-input-toggle" onClick={() => setShowPass(p => !p)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm Password *</label>
                  <div className="form-input-wrap">
                    <input className="form-input" name="confirmPassword" type={showConfirmPass ? 'text' : 'password'} value={formData.confirmPassword}
                      onChange={handleInput} placeholder="Repeat password" required />
                    <button type="button" className="form-input-toggle" onClick={() => setShowConfirmPass(p => !p)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--primary-light)', border: '1px solid rgba(26,92,158,.2)', borderRadius: 'var(--radius)', padding: '12px', marginBottom: '16px', fontSize: '12px', color: 'var(--primary)' }}>
                <strong>📋 Next Step:</strong> After login, you'll be guided through the consent form, medical details, document upload, and hospital selection.
              </div>

              <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                {submitting ? 'Creating Account...' : 'Create Account & Continue →'}
              </button>

              <button type="button" onClick={onBackToLogin}
                className="btn btn-ghost btn-full" style={{ marginTop: '8px' }}>
                Cancel — Back to Login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // HOSPITAL — MULTI-STEP REGISTRATION
  // ============================================================
  if (accountType === 'hospital') {
    const hospitalStepTitles = ['', '', 'Account Details', 'Hospital Info', 'Documents'];
    const hospitalStepSubtitles = ['', '', 'Create your login credentials', 'Hospital details & address', 'Upload required documents'];

    return (
      <div className="auth-wrapper">
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-logo">
              <div className="auth-logo-icon">
                <svg viewBox="0 0 24 24" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <div className="auth-logo-text"><h1>Organ Donation Campaign Analysis Tool</h1><p>Healthcare System</p></div>
            </div>
            <div className="auth-headline">Hospital Registration</div>
            <div className="auth-subtext">Join Pakistan's premier organ transplant coordination network. Your hospital will be verified before getting full access.</div>
          </div>

          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,.7)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Registration Steps
            </div>
            {['Account Details', 'Hospital Information', 'Document Upload', 'Admin Review'].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: step - 2 > i ? '#0eb07a' : step - 2 === i ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                  {step - 2 > i ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '13px', color: step - 2 === i ? '#fff' : 'rgba(255,255,255,.65)', fontWeight: step - 2 === i ? '600' : '400' }}>{s}</span>
              </div>
            ))}
            <div style={{ marginTop: '20px', padding: '14px', background: 'rgba(255,255,255,.08)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'rgba(255,255,255,.8)', lineHeight: '1.6' }}>
              <strong>Instant Access:</strong> After registration, you can log in immediately with restricted access while your application is under review.
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card" style={{ maxWidth: '520px' }}>
            <button type="button" onClick={() => { if (step === 2) { setStep(1); setAccountType(null); } else { setStep(s => s - 1); } }}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ← {step === 2 ? 'Back to account type' : 'Previous step'}
            </button>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              {[2, 3, 4].map(s => (
                <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: step >= s ? 'var(--primary)' : 'var(--border)', transition: 'background .3s' }}></div>
              ))}
            </div>

            <div className="auth-card-header">
              <h2>🏨 {hospitalStepTitles[step]}</h2>
              <p>{hospitalStepSubtitles[step]}</p>
            </div>

            {/* Step 2: Account Info */}
            {step === 2 && (
              <form onSubmit={handleHospitalNext}>
                <div className="form-group">
                  <label className="form-label">Contact Person Name *</label>
                  <input className="form-input" name="contactPerson" value={formData.contactPerson}
                    onChange={handleInput} placeholder="Your full name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input className="form-input" name="email" type="email" value={formData.email}
                    onChange={handleInput} placeholder="hospital@example.com" required />
                </div>
                <div className="grid2">
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <div className="form-input-wrap">
                      <input className="form-input" name="password" type={showPass ? 'text' : 'password'} value={formData.password}
                        onChange={handleInput} placeholder="Min. 8 chars" required />
                      <button type="button" className="form-input-toggle" onClick={() => setShowPass(p => !p)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm Password *</label>
                    <div className="form-input-wrap">
                      <input className="form-input" name="confirmPassword" type={showConfirmPass ? 'text' : 'password'} value={formData.confirmPassword}
                        onChange={handleInput} placeholder="Repeat" required />
                      <button type="button" className="form-input-toggle" onClick={() => setShowConfirmPass(p => !p)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ background: 'var(--accent-light)', border: '1px solid rgba(14,176,122,.2)', borderRadius: 'var(--radius)', padding: '12px', marginBottom: '16px', fontSize: '12px', color: 'var(--accent)' }}>
                  ✓ After registration, you can log in immediately. Full access granted after admin approval.
                </div>
                <button type="submit" className="btn btn-primary btn-full">Next: Hospital Info →</button>
                <button type="button" onClick={onBackToLogin} className="btn btn-ghost btn-full" style={{ marginTop: '8px' }}>Cancel</button>
              </form>
            )}

            {/* Step 3: Hospital Info */}
            {step === 3 && (
              <form onSubmit={handleHospitalNext}>
                <div className="form-group">
                  <label className="form-label">Hospital / Institution Name *</label>
                  <input className="form-input" name="hospitalName" value={formData.hospitalName}
                    onChange={handleInput} placeholder="e.g. Combined Military Hospital (CMH)" required />
                </div>
                <div className="grid2">
                  <div className="form-group">
                    <label className="form-label">Registration Number *</label>
                    <input className="form-input" name="registrationNumber" value={formData.registrationNumber}
                      onChange={handleInput} placeholder="e.g. PHSA-2024-001" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">License Number *</label>
                    <input className="form-input" name="licenseNumber" value={formData.licenseNumber}
                      onChange={handleInput} placeholder="e.g. LIC-PMDC-001" required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Full Address *</label>
                  <input className="form-input" name="hospitalAddress" value={formData.hospitalAddress}
                    onChange={handleInput} placeholder="Street address, City, Province" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number *</label>
                  <input className="form-input" name="phone" type="tel" value={formData.phone}
                    onChange={handleInput} placeholder="051-XXXXXXX" required />
                </div>
                <button type="submit" className="btn btn-primary btn-full">Next: Upload Documents →</button>
              </form>
            )}

            {/* Step 4: Documents */}
            {step === 4 && (
              <form onSubmit={handleHospitalSubmit}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)', marginBottom: '6px' }}>Required Documents</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
                    Upload clear, legible documents. Blurry or unclear files will be flagged for re-upload.
                  </div>
                  {['registrationCertificate', 'healthcareLicense'].map(key => (
                    <DocumentUploadCard key={key} docKey={key} config={DOCUMENT_CONFIG[key]}
                      uploadedDoc={uploadedDocs[key]} onUpload={handleDocUpload} onRemove={handleDocRemove} />
                  ))}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)', marginBottom: '6px' }}>Optional Documents</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
                    Additional documents improve your compliance score and may speed up approval.
                  </div>
                  {['taxCertificate', 'ethicalPolicy', 'transplantLicense'].map(key => (
                    <DocumentUploadCard key={key} docKey={key} config={DOCUMENT_CONFIG[key]}
                      uploadedDoc={uploadedDocs[key]} onUpload={handleDocUpload} onRemove={handleDocRemove} />
                  ))}
                </div>

                <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)', marginBottom: '10px' }}>Compliance Declarations</div>
                  {[
                    { key: 'lawsCompliance', label: 'I certify that this hospital complies with all applicable laws, HOTA regulations, and PMDC guidelines regarding organ donation and transplantation.' },
                    { key: 'platformTerms', label: 'I agree to the Organ Donation Campaign Analysis Tool platform terms, data handling policies, and accept responsibility for the accuracy of all submitted information.' },
                  ].map(d => (
                    <label key={d.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                      <input type="checkbox" checked={complianceDecl[d.key]}
                        onChange={e => setComplianceDecl(prev => ({ ...prev, [d.key]: e.target.checked }))}
                        style={{ marginTop: '3px', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5' }}>{d.label}</span>
                    </label>
                  ))}
                </div>

                <div style={{ background: 'var(--accent-light)', border: '1px solid rgba(14,176,122,.2)', borderRadius: 'var(--radius)', padding: '12px', marginBottom: '16px', fontSize: '12px', color: 'var(--accent)' }}>
                  ✓ After submitting, you can log in immediately with your registered email and password.
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                  {submitting ? 'Submitting Registration...' : 'Submit Hospital Registration'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Register;
