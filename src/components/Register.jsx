import { useState } from 'react';
import { registerUser, getAllUsers } from '../utils/auth';
import { toast } from '../utils/toast';

const Register = ({ onRegistrationSuccess, onBackToLogin }) => {
  const [accountType, setAccountType] = useState('donor');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    bloodType: '',
    age: '',
    medicalHistory: '',
    organNeeded: '',
    hospitalName: '',
    registrationNumber: '',
    licenseNumber: '',
    hospitalAddress: '',
    contactPerson: '',
    phone: ''
  });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [documentChecklist, setDocumentChecklist] = useState({
    // Required (Step 2)
    registrationCertificate: false,
    healthcareLicense: false,
    // Optional (Step 3)
    taxCertificate: false,
    ethicalPolicy: false,
    transplantLicense: false
  });
  const [complianceDeclaration, setComplianceDeclaration] = useState({
    lawsCompliance: false,
    platformTerms: false
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleTypeSelect = (type) => {
    setAccountType(type);
    setStep(2);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast('Please fill all required fields.', 'error');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      toast('Passwords do not match.', 'error');
      return false;
    }

    if (formData.password.length < 8) {
      toast('Password must be at least 8 characters.', 'error');
      return false;
    }

    const users = getAllUsers();
    if (users.some(u => u.email === formData.email)) {
      toast('Email already registered.', 'error');
      return false;
    }

    if (accountType === 'donor' && !formData.bloodType) {
      toast('Please select blood type.', 'error');
      return false;
    }

    if (accountType === 'recipient' && !formData.organNeeded) {
      toast('Please select organ needed.', 'error');
      return false;
    }

    if (accountType === 'hospital' && (!formData.hospitalName || !formData.registrationNumber || !formData.licenseNumber)) {
      toast('Please complete basic hospital information.', 'error');
      return false;
    }

    return true;
  };

  const validateHospitalDocuments = () => {
    if (accountType !== 'hospital') return true;
    
    if (!documentChecklist.registrationCertificate || !documentChecklist.healthcareLicense) {
      toast('Please upload both required documents.', 'error');
      return false;
    }
    
    return true;
  };

  const validateHospitalDeclaration = () => {
    if (accountType !== 'hospital') return true;
    
    if (!complianceDeclaration.lawsCompliance || !complianceDeclaration.platformTerms) {
      toast('Please review and confirm all declarations.', 'error');
      return false;
    }
    
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // For hospitals, step 2 is basic info form, so we validate and proceed to step 3
    if (accountType === 'hospital' && step === 2) {
      if (!validateForm()) return;
      setStep(3);
      return;
    }
    
    // For donors/recipients, validate form and go to step 3 (review)
    if (accountType !== 'hospital') {
      if (!validateForm()) return;
      setStep(3);
      return;
    }
  };

  const handleFileUpload = (e, documentType = null) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedFiles(prev => [...prev, { 
          name: file.name, 
          type: file.type,
          size: file.size,
          data: reader.result,
          documentType: documentType || 'other'
        }]);
        toast(`Document "${file.name}" uploaded.`, 'success', 2000);
        
        // Mark as uploaded if document type is specified
        if (documentType && documentChecklist.hasOwnProperty(documentType)) {
          setDocumentChecklist(prev => ({ ...prev, [documentType]: true }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index) => {
    const removedFile = uploadedFiles[index];
    // Uncheck from checklist if document type matches
    if (removedFile.documentType && documentChecklist.hasOwnProperty(removedFile.documentType)) {
      const remainingDocs = uploadedFiles.filter((_, i) => i !== index && _.documentType === removedFile.documentType);
      if (remainingDocs.length === 0) {
        setDocumentChecklist(prev => ({ ...prev, [removedFile.documentType]: false }));
      }
    }
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Calculate Trust Score for Hospital Registration
  const calculateTrustScore = () => {
    if (accountType !== 'hospital') return 0;
    
    // 40% from Legal Docs (required)
    const legalDocs = (documentChecklist.registrationCertificate ? 20 : 0) + 
                      (documentChecklist.healthcareLicense ? 20 : 0);
    
    // 30% from Medical Info (form fields)
    const medicalInfo = (formData.hospitalName && formData.registrationNumber && formData.licenseNumber) ? 30 : 0;
    
    // 30% from Optional Proof
    const optionalDocs = (documentChecklist.taxCertificate ? 10 : 0) + 
                         (documentChecklist.ethicalPolicy ? 10 : 0) + 
                         (documentChecklist.transplantLicense ? 10 : 0);
    
    return legalDocs + medicalInfo + optionalDocs;
  };

  const getTrustScoreStatus = (score) => {
    if (score >= 80) return { label: 'Excellent', color: '#10b981' };
    if (score >= 60) return { label: 'Good', color: '#3b82f6' };
    if (score >= 40) return { label: 'Fair', color: '#f59e0b' };
    return { label: 'Incomplete', color: '#ef4444' };
  };

  const handleConfirmSubmit = () => {
    if (submitting) return; // Prevent double submission
    
    setSubmitting(true);
    setLoading(true);
    
    setTimeout(() => {
      const registrationData = { 
        type: accountType, 
        ...formData,
        uploadedDocuments: accountType === 'hospital' ? uploadedFiles : []
      };
      registerUser(registrationData);
      
      const msg = accountType === 'hospital' 
        ? 'Hospital registration submitted for approval!' 
        : 'Account created successfully! Welcome to ODCAT!';
      toast(msg, 'success');
      
      setTimeout(() => {
        if (accountType === 'hospital') {
          onBackToLogin();
        } else {
          onRegistrationSuccess({ 
            name: formData.name, 
            email: formData.email,
            password: formData.password,
            role: accountType
          });
        }
      }, 1500);
      setLoading(false);
      setSubmitting(false);
    }, 800);
  };

  // Step 1: Choose Account Type
  if (step === 1) {
    return (
      <div className="auth-wrapper">
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-logo">
              <div className="auth-logo-icon">
                <svg viewBox="0 0 24 24" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <div className="auth-logo-text">
                <h1>ODCAT</h1>
                <p>Organ Donation Campaign Analysis Tool</p>
              </div>
            </div>
            <h2 className="auth-headline">Join Our Mission</h2>
            <p className="auth-subtext">
              Create an account to participate in organ donation and transplantation. Choose your role below.
            </p>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Create Account</h2>
              <p>Choose how you would like to participate in ODCAT</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => handleTypeSelect('donor')}
                className="registration-card"
              >
                <div className="registration-card-icon">👤</div>
                <div className="registration-card-content">
                  <h3>Register as Donor</h3>
                  <p>Register to become an organ donor and help save lives</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTypeSelect('recipient')}
                className="registration-card"
              >
                <div className="registration-card-icon">💝</div>
                <div className="registration-card-content">
                  <h3>Register as Recipient</h3>
                  <p>Register if you need an organ transplant</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTypeSelect('hospital')}
                className="registration-card"
              >
                <div className="registration-card-icon">🏥</div>
                <div className="registration-card-content">
                  <h3>Register Hospital</h3>
                  <p>Register your hospital for organ transplant services (requires approval)</p>
                </div>
              </button>
            </div>

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
                Already have an account? 
                <a href="#" className="form-link" onClick={(e) => { e.preventDefault(); onBackToLogin(); }}>
                  Sign in
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Hospital Step 3: Required Documents
  if (accountType === 'hospital' && step === 3) {
    return (
      <div className="auth-wrapper">
        <div className="auth-left" style={{ justifyContent: 'flex-start', paddingTop: '20px' }}>
          <div className="auth-brand">
            <h2 className="auth-headline" style={{ fontSize: '28px' }}>📄 Required Documents</h2>
            <p className="auth-subtext">Upload documents required for hospital verification</p>
          </div>
        </div>

        <div className="auth-right" style={{ paddingRight: '24px' }}>
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Step 2 of 4: Required Documents</h2>
              <p>Hospital Registration Certificate & Healthcare License</p>
            </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' }}>
              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={documentChecklist.registrationCertificate}
                      disabled
                      style={{ marginRight: '8px', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>
                      🏛️ Hospital Registration Certificate
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text2)', marginLeft: '24px', marginBottom: '8px' }}>
                    Official registration document from government
                  </p>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => document.querySelector('#hosp-cert').click()}
                    style={{ marginLeft: '24px' }}
                  >
                    {documentChecklist.registrationCertificate ? '✓ Uploaded - Replace' : '+ Upload Certificate'}
                  </button>
                  <input 
                    id="hosp-cert"
                    type="file" 
                    accept=".pdf,image/*"
                    onChange={(e) => handleFileUpload(e, 'registrationCertificate')}
                    style={{ display: 'none' }}
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={documentChecklist.healthcareLicense}
                      disabled
                      style={{ marginRight: '8px', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>
                      ⚕️ Healthcare License
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text2)', marginLeft: '24px', marginBottom: '8px' }}>
                    Medical practice license or health department clearance
                  </p>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => document.querySelector('#hosp-license').click()}
                    style={{ marginLeft: '24px' }}
                  >
                    {documentChecklist.healthcareLicense ? '✓ Uploaded - Replace' : '+ Upload License'}
                  </button>
                  <input 
                    id="hosp-license"
                    type="file" 
                    accept=".pdf,image/*"
                    onChange={(e) => handleFileUpload(e, 'healthcareLicense')}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              <div style={{ 
                background: 'var(--success-light)',
                padding: '12px',
                borderRadius: 'var(--radius)',
                fontSize: '12px',
                color: 'var(--success)',
                marginBottom: '16px',
                display: documentChecklist.registrationCertificate && documentChecklist.healthcareLicense ? 'block' : 'none'
              }}>
                ✓ All required documents uploaded
              </div>

              {uploadedFiles.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--text1)' }}>
                    📁 Uploaded Files ({uploadedFiles.length})
                  </h3>
                  {uploadedFiles.map((file, idx) => {
                    const docTypeLabels = {
                      registrationCertificate: 'Hospital Registration Certificate',
                      healthcareLicense: 'Healthcare License',
                      taxCertificate: 'Tax Certificate',
                      ethicalPolicy: 'Ethical Policy',
                      transplantLicense: 'Transplant License',
                      other: 'Document'
                    };
                    return (
                      <div key={idx} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'var(--surface1)',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        fontSize: '12px',
                        border: '1px solid var(--border)'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500' }}>📄 {file.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '2px' }}>
                            {docTypeLabels[file.documentType] || docTypeLabels.other}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          style={{ 
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            fontSize: '18px',
                            padding: '4px 8px'
                          }}
                          title="Remove file"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)} style={{ flex: 1 }}>
                ← Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!validateHospitalDocuments()) return;
                  setStep(4);
                }}
                style={{ flex: 1 }}
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Hospital Step 4: Optional Documents + Declaration
  if (accountType === 'hospital' && step === 4) {
    const trustScore = calculateTrustScore();
    const trustStatus = getTrustScoreStatus(trustScore);

    return (
      <div className="auth-wrapper">
        <div className="auth-left" style={{ justifyContent: 'flex-start', paddingTop: '20px' }}>
          <div className="auth-brand">
            <h2 className="auth-headline" style={{ fontSize: '28px' }}>📑 Trust Score Improvement</h2>
            <p className="auth-subtext">Add optional documents to improve your trust score</p>
          </div>
        </div>

        <div className="auth-right" style={{ paddingRight: '24px' }}>
          <div className="auth-card">
            <div className="auth-card-header">
              <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Step 3 of 4: Optional Documents</span>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  background: trustStatus.color,
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius)',
                  minWidth: '100px',
                  textAlign: 'center'
                }}>
                  {trustScore}% {trustStatus.label}
                </div>
              </h2>
              <p>Upload additional documents to build trust</p>
            </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', color: 'var(--text2)' }}>
                  Trust Score Breakdown:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  <div style={{ background: 'var(--surface2)', padding: '8px', borderRadius: '6px' }}>
                    <div>📋 Legal (40%)</div>
                    <div style={{ fontWeight: '600', color: 'var(--primary)' }}>
                      {Math.min(40, (documentChecklist.registrationCertificate ? 20 : 0) + (documentChecklist.healthcareLicense ? 20 : 0))}%
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface2)', padding: '8px', borderRadius: '6px' }}>
                    <div>🏥 Medical (30%)</div>
                    <div style={{ fontWeight: '600', color: 'var(--primary)' }}>
                      {formData.hospitalName && formData.registrationNumber && formData.licenseNumber ? 30 : 0}%
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface2)', padding: '8px', borderRadius: '6px', gridColumn: '1 / -1' }}>
                    <div>✨ Optional (30%)</div>
                    <div style={{ fontWeight: '600', color: 'var(--primary)' }}>
                      {(documentChecklist.taxCertificate ? 10 : 0) + (documentChecklist.ethicalPolicy ? 10 : 0) + (documentChecklist.transplantLicense ? 10 : 0)}%
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>Optional Documents (Improves Trust)</h3>
                
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={documentChecklist.taxCertificate}
                      disabled
                      style={{ marginRight: '8px', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: '500' }}>💰 Tax Certificate</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => document.querySelector('#tax-cert').click()}
                    style={{ marginLeft: '24px' }}
                  >
                    {documentChecklist.taxCertificate ? '✓ Uploaded' : '+ Upload'}
                  </button>
                  <input 
                    id="tax-cert"
                    type="file" 
                    accept=".pdf,image/*"
                    onChange={(e) => handleFileUpload(e, 'taxCertificate')}
                    style={{ display: 'none' }}
                  />
                </div>

                <div style={{ marginBottom: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={documentChecklist.ethicalPolicy}
                      disabled
                      style={{ marginRight: '8px', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: '500' }}>🛡️ Ethical Policy</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => document.querySelector('#ethical-policy').click()}
                    style={{ marginLeft: '24px' }}
                  >
                    {documentChecklist.ethicalPolicy ? '✓ Uploaded' : '+ Upload'}
                  </button>
                  <input 
                    id="ethical-policy"
                    type="file" 
                    accept=".pdf,image/*"
                    onChange={(e) => handleFileUpload(e, 'ethicalPolicy')}
                    style={{ display: 'none' }}
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={documentChecklist.transplantLicense}
                      disabled
                      style={{ marginRight: '8px', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: '500' }}>🏥 Transplant License</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => document.querySelector('#transplant-license').click()}
                    style={{ marginLeft: '24px' }}
                  >
                    {documentChecklist.transplantLicense ? '✓ Uploaded' : '+ Upload'}
                  </button>
                  <input 
                    id="transplant-license"
                    type="file" 
                    accept=".pdf,image/*"
                    onChange={(e) => handleFileUpload(e, 'transplantLicense')}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>🛡️ Declaration & Compliance</h3>
                
                <label style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '12px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={complianceDeclaration.lawsCompliance}
                    onChange={(e) => setComplianceDeclaration(prev => ({ ...prev, lawsCompliance: e.target.checked }))}
                    style={{ marginRight: '8px', marginTop: '2px', width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '12px' }}>
                    ☑️ I confirm our hospital complies with all applicable laws and regulations
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={complianceDeclaration.platformTerms}
                    onChange={(e) => setComplianceDeclaration(prev => ({ ...prev, platformTerms: e.target.checked }))}
                    style={{ marginRight: '8px', marginTop: '2px', width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '12px' }}>
                    ☑️ I agree to ODCAT platform terms and conditions
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(3)} style={{ flex: 1 }}>
                ← Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!validateHospitalDeclaration()) return;
                  setStep(5);
                }}
                style={{ flex: 1 }}
              >
                Review →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Hospital Step 5: Final Review
  if (accountType === 'hospital' && step === 5) {
    const trustScore = calculateTrustScore();
    const trustStatus = getTrustScoreStatus(trustScore);

    return (
      <div className="auth-wrapper">
        <div className="auth-left" style={{ justifyContent: 'flex-start', paddingTop: '20px' }}>
          <div className="auth-brand">
            <h2 className="auth-headline" style={{ fontSize: '28px' }}>✓ Review Your Application</h2>
            <p className="auth-subtext">Please verify all information before submitting</p>
          </div>
        </div>

        <div className="auth-right" style={{ paddingRight: '24px' }}>
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Step 4 of 4: Final Review</h2>
              <p>Your hospital registration application</p>
            </div>

            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' }}>
              <div style={{
                background: trustStatus.color,
                color: 'white',
                padding: '16px',
                borderRadius: 'var(--radius)',
                marginBottom: '16px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '32px', fontWeight: '600' }}>{trustScore}%</div>
                <div style={{ fontSize: '13px' }}>Trust Score: {trustStatus.label}</div>
              </div>

              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase', color: 'var(--text2)' }}>
                  🏥 Hospital Information
                </h3>
                <div style={{ fontSize: '12px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Hospital Name</div>
                    <div style={{ fontWeight: '600' }}>{formData.hospitalName}</div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Registration Number</div>
                    <div style={{ fontWeight: '600' }}>{formData.registrationNumber}</div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>License Number</div>
                    <div style={{ fontWeight: '600' }}>{formData.licenseNumber || '—'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Contact Person</div>
                    <div style={{ fontWeight: '600' }}>{formData.contactPerson}</div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase', color: 'var(--text2)' }}>
                  📄 Documents Submitted
                </h3>
                {uploadedFiles.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>No documents uploaded</div>
                ) : (
                  <div>
                    {uploadedFiles.map((file, idx) => {
                      const docTypeLabels = {
                        registrationCertificate: '🏛️ Hospital Registration Certificate',
                        healthcareLicense: '⚕️ Healthcare License',
                        taxCertificate: '💰 Tax Certificate',
                        ethicalPolicy: '🛡️ Ethical Policy',
                        transplantLicense: '🏥 Transplant License',
                        other: '📄 Document'
                      };
                      return (
                        <div key={idx} style={{ fontSize: '12px', marginBottom: '8px' }}>
                          <div style={{ fontWeight: '500' }}>{docTypeLabels[file.documentType] || docTypeLabels.other}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text2)' }}>📁 {file.name}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--accent-light)', padding: '12px', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '12px', color: 'var(--accent)' }}>
                <strong>Next Steps:</strong> Your application will be reviewed by our admin team within 2-3 business days. You'll receive an email notification once approved.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(4)} style={{ flex: 1 }}>
                ← Back to Edit
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleConfirmSubmit}
                disabled={loading || submitting}
                style={{ flex: 1 }}
              >
                {loading ? '⏳ Submitting...' : '✓ Submit Application'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Fill Form
  if (step === 2) {
    const formStyle = { maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' };
    return (
      <div className="auth-wrapper">
        <div className="auth-left" style={{ justifyContent: 'flex-start', paddingTop: '20px' }}>
          <div className="auth-brand">
            <h2 className="auth-headline" style={{ fontSize: '28px' }}>
              {accountType === 'donor' && '🩸 Become a Donor'}
              {accountType === 'recipient' && '💝 Recipient Registration'}
              {accountType === 'hospital' && '🏥 Hospital Registration'}
            </h2>
            <p className="auth-subtext">
              {accountType === 'donor' && 'Help save lives by registering as an organ donor'}
              {accountType === 'recipient' && 'Register to join the transplant recipient list'}
              {accountType === 'hospital' && 'Register your hospital to provide transplant services (subject to verification)'}
            </p>
          </div>
        </div>

        <div className="auth-right" style={{ paddingRight: '24px' }}>
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Complete Your Profile</h2>
              <p>Provide accurate information for verification</p>
            </div>

            <form onSubmit={handleSubmit} style={formStyle}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  className="form-input"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  className="form-input"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password *</label>
                <input
                  className="form-input"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Min. 8 characters"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password *</label>
                <input
                  className="form-input"
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm password"
                  required
                />
              </div>

              {accountType === 'donor' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Blood Type *</label>
                    <select
                      className="form-select"
                      name="bloodType"
                      value={formData.bloodType}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select blood type</option>
                      <option value="O+">O+ (Universal Donor)</option>
                      <option value="O-">O- (Universal Donor, RBC)</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+ (Universal Recipient)</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Age</label>
                    <input
                      className="form-input"
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleInputChange}
                      placeholder="Your age"
                      min="18"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Medical History</label>
                    <textarea
                      className="form-input"
                      name="medicalHistory"
                      value={formData.medicalHistory}
                      onChange={handleInputChange}
                      placeholder="Any relevant medical conditions"
                      style={{ minHeight: '80px', resize: 'vertical' }}
                    />
                  </div>
                </>
              )}

              {accountType === 'recipient' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Age *</label>
                    <input
                      className="form-input"
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleInputChange}
                      placeholder="Your age"
                      required
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Organ Needed *</label>
                    <select
                      className="form-select"
                      name="organNeeded"
                      value={formData.organNeeded}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select organ</option>
                      <option value="kidney">Kidney</option>
                      <option value="liver">Liver</option>
                      <option value="heart">Heart</option>
                      <option value="lung">Lung</option>
                      <option value="pancreas">Pancreas</option>
                      <option value="cornea">Cornea</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Medical History *</label>
                    <textarea
                      className="form-input"
                      name="medicalHistory"
                      value={formData.medicalHistory}
                      onChange={handleInputChange}
                      placeholder="Current condition and medical details"
                      required
                      style={{ minHeight: '100px', resize: 'vertical' }}
                    />
                  </div>
                </>
              )}

              {accountType === 'hospital' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Hospital Name *</label>
                    <input
                      className="form-input"
                      name="hospitalName"
                      value={formData.hospitalName}
                      onChange={handleInputChange}
                      placeholder="Official hospital name"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Registration Number *</label>
                    <input
                      className="form-input"
                      name="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={handleInputChange}
                      placeholder="Government registration number"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">License Number</label>
                    <input
                      className="form-input"
                      name="licenseNumber"
                      value={formData.licenseNumber}
                      onChange={handleInputChange}
                      placeholder="Medical license number"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Hospital Address</label>
                    <textarea
                      className="form-input"
                      name="hospitalAddress"
                      value={formData.hospitalAddress}
                      onChange={handleInputChange}
                      placeholder="Full address"
                      style={{ minHeight: '80px', resize: 'vertical' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Person *</label>
                    <input
                      className="form-input"
                      name="contactPerson"
                      value={formData.contactPerson}
                      onChange={handleInputChange}
                      placeholder="Name of authorized person"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      className="form-input"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="Contact phone number"
                      type="tel"
                    />
                  </div>

                  {accountType !== 'hospital' && (
                    <div className="form-group">
                      <label className="form-label">Medical Information</label>
                      <textarea
                        className="form-input"
                        name="additionalInfo"
                        placeholder="Any additional information"
                        style={{ minHeight: '60px', resize: 'vertical' }}
                      />
                    </div>
                  )}
                </>
              )}

              <div style={{ background: 'var(--accent-light)', padding: '12px', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--accent)', marginBottom: '16px' }}>
                {accountType === 'hospital' ? '👉 Hospital details will be verified. Documents upload is in the next steps.' : 'All information looks correct. Proceed to review your profile.'}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} style={{ flex: 1 }}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {accountType === 'hospital' ? 'Continue to Documents →' : 'Review & Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Step 3 (Donor/Recipient Review) or handled above for hospitals
  // Check if we're in the donor/recipient review flow
  // Step 3 (Donor/Recipient Review)
  if (step === 3 && accountType !== 'hospital') {
    const reviewStyle = {
      background: 'var(--surface2)',
      padding: '16px',
      borderRadius: 'var(--radius)',
      marginBottom: '20px',
      fontSize: '13px',
      maxHeight: '50vh',
      overflowY: 'auto'
    };

  return (
    <div className="auth-wrapper">
      <div className="auth-left" style={{ justifyContent: 'center' }}>
        <div className="auth-brand">
          <h2 className="auth-headline" style={{ fontSize: '32px' }}>
            {accountType === 'hospital' ? '🎉 Final Step' : '✓ Ready to Go!'}
          </h2>
          <p className="auth-subtext">
            {accountType === 'hospital' 
              ? 'Your hospital registration will be verified by our admin team. You will be notified once approved.'
              : 'Your account is ready to create. Click confirm to complete registration.'}
          </p>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>Review Your Information</h2>
            <p>Please verify all details before confirming</p>
          </div>

          <div style={reviewStyle}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ color: 'var(--text3)', fontSize: '11px', marginBottom: '2px' }}>Account Type</div>
              <div style={{ fontWeight: '600' }}>
                {accountType === 'donor' && '🩸 Organ Donor'}
                {accountType === 'recipient' && '💝 Organ Recipient'}
                {accountType === 'hospital' && '🏥 Hospital'}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Name</div>
                <div style={{ fontWeight: '500' }}>{formData.name}</div>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Email</div>
                <div style={{ fontWeight: '500' }}>{formData.email}</div>
              </div>

              {accountType === 'donor' && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Blood Type</div>
                    <div style={{ fontWeight: '500' }}>{formData.bloodType}</div>
                  </div>
                  {formData.age && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Age</div>
                      <div style={{ fontWeight: '500' }}>{formData.age}</div>
                    </div>
                  )}
                </>
              )}

              {accountType === 'recipient' && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Age</div>
                    <div style={{ fontWeight: '500' }}>{formData.age}</div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Organ Needed</div>
                    <div style={{ fontWeight: '500' }}>{formData.organNeeded}</div>
                  </div>
                </>
              )}

              {accountType === 'hospital' && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Hospital Name</div>
                    <div style={{ fontWeight: '500' }}>{formData.hospitalName}</div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Registration Number</div>
                    <div style={{ fontWeight: '500' }}>{formData.registrationNumber}</div>
                  </div>
                  {formData.contactPerson && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Contact Person</div>
                      <div style={{ fontWeight: '500' }}>{formData.contactPerson}</div>
                    </div>
                  )}
                  {uploadedFiles.length > 0 && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                      <div style={{ color: 'var(--text3)', fontSize: '11px', marginBottom: '8px' }}>Supporting Documents</div>
                      {uploadedFiles.map((file, idx) => {
                        const docTypeLabels = {
                          registrationCertificate: 'Hospital Registration Certificate',
                          healthcareLicense: 'Healthcare License',
                          emailVerification: 'Official Email Verification',
                          basicDetailsForm: 'Basic Details Form',
                          other: 'Additional Document'
                        };
                        return (
                          <div key={idx} style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '6px' }}>
                            <div>✓ {file.name}</div>
                            <div style={{ fontSize: '10px', color: 'var(--primary)' }}>
                              {docTypeLabels[file.documentType] || docTypeLabels.other}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '20px', padding: '12px', background: 'var(--accent-light)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--accent)' }}>
            All information looks good and is ready to submit.
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)} style={{ flex: 1 }} disabled={loading || submitting}>
              Back to Edit
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirmSubmit} style={{ flex: 1 }} disabled={loading || submitting}>
              {loading ? 'Creating...' : 'Confirm & Register'}
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '16px' }}>
            By registering, you agree to ODCAT terms and conditions
          </p>
        </div>
      </div>
    </div>
  );
  }
};

export default Register;
