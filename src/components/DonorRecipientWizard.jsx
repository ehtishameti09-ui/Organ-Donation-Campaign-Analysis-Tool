import { useState, useMemo, useEffect } from 'react';
import {
  completeDonorRecipientRegistration,
  resubmitCaseInfo,
  getApprovedHospitals,
  calculateAgeFromDOB,
} from '../utils/auth';
import { toast } from '../utils/toast';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ORGANS = ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Cornea', 'Bone Marrow'];
const GENDERS = ['Male', 'Female', 'Other'];

// Document configurations
const DONOR_DOCS = {
  cnic: { label: 'CNIC (Front & Back)', required: true, maxSizeMB: 5, hint: 'Clear photo of both sides of your CNIC' },
  medicalCertificate: { label: 'Medical Fitness Certificate', required: true, maxSizeMB: 5, hint: 'Issued by a licensed physician within the last 3 months' },
  bloodTypeReport: { label: 'Blood Type Lab Report', required: true, maxSizeMB: 5, hint: 'Recent blood typing test report' },
  consentWitness: { label: 'Witness Signed Consent (Optional)', required: false, maxSizeMB: 5, hint: 'Family member or guardian witness signature' },
};

const RECIPIENT_DOCS = {
  cnic: { label: 'CNIC (Front & Back)', required: true, maxSizeMB: 5, hint: 'Clear photo of both sides of your CNIC' },
  medicalReport: { label: 'Medical Diagnosis Report', required: true, maxSizeMB: 10, hint: 'Detailed diagnosis from your treating physician' },
  labReports: { label: 'Recent Lab Reports', required: true, maxSizeMB: 10, hint: 'Latest blood work, organ function tests' },
  doctorReferral: { label: 'Doctor Referral Letter', required: true, maxSizeMB: 5, hint: 'Letter from treating doctor recommending transplant' },
  insuranceProof: { label: 'Insurance / Treatment Coverage (Optional)', required: false, maxSizeMB: 5, hint: 'Insurance card or coverage proof if applicable' },
};

// ============================================================
// PAKISTAN-SPECIFIC THOTA CONSENT FORM
// ============================================================
const PakistanConsentForm = ({ userType, name, onAccept, onDecline }) => {
  const [agreed, setAgreed] = useState(false);
  const [witnessed, setWitnessed] = useState(false);
  const [readToBottom, setReadToBottom] = useState(false);
  const [signature, setSignature] = useState(name || '');
  const [cnic, setCnic] = useState('');

  const handleScroll = (e) => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
      setReadToBottom(true);
    }
  };

  const canSign = agreed && witnessed && readToBottom && signature.trim() && cnic.trim().length >= 13;

  const handleAccept = () => {
    if (!canSign) {
      toast('Please complete all fields and check both confirmation boxes.', 'warning');
      return;
    }
    onAccept({ signature, cnic });
  };

  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ background: 'linear-gradient(135deg, #014421 0%, #0c6b3a 100%)', color: '#fff', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,.8)', letterSpacing: '1px' }}>
            ISLAMIC REPUBLIC OF PAKISTAN
          </div>
          <div style={{ background: 'rgba(255,255,255,.15)', padding: '4px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: '700' }}>
            OFFICIAL DOCUMENT
          </div>
        </div>
        <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>
          {userType === 'donor' ? 'Organ & Tissue Donation Pledge Form' : 'Transplant Recipient Registration Form'}
        </h3>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.85)', marginTop: '4px' }}>
          Under Transplantation of Human Organs &amp; Tissues Act (THOTA) 2010 — Government of Pakistan
        </div>
      </div>

      <div style={{ padding: '12px 24px', background: '#fef3e0', borderBottom: '1px solid #fbd38d', fontSize: '12px', color: '#7c4a03' }}>
        ⚠️ <strong>Please scroll through and read the entire form carefully.</strong> This is a legally binding declaration under Pakistani law.
      </div>

      <div onScroll={handleScroll} style={{ padding: '24px', maxHeight: '460px', overflowY: 'auto', fontSize: '13px', lineHeight: '1.85', color: '#333' }}>
        <div style={{ background: '#f8f9fb', padding: '14px 16px', borderRadius: '8px', borderLeft: '4px solid #014421', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#014421', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>
            Form Reference
          </div>
          <div style={{ fontSize: '12px', color: '#555' }}>
            <strong>Document No:</strong> ODCAT/{userType.toUpperCase()}/{Date.now().toString().slice(-8)}<br />
            <strong>Date:</strong> {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}<br />
            <strong>Issuing Authority:</strong> Human Organ Transplant Authority (HOTA), Pakistan<br />
            <strong>Platform:</strong> ODCAT — Organ Donation Coordination &amp; Transplant System
          </div>
        </div>

        <h4 style={{ color: '#014421', marginBottom: '8px' }}>SECTION 1 — Declaration of Identity</h4>
        <p>
          I, the undersigned <strong>{name}</strong>, a citizen of the Islamic Republic of Pakistan,
          do hereby make this voluntary declaration of my own free will, in sound state of mind, and without
          any coercion, fraud, misrepresentation or undue influence whatsoever.
        </p>

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>
          SECTION 2 — {userType === 'donor' ? 'Pledge to Donate' : 'Registration as Recipient'}
        </h4>

        {userType === 'donor' ? (
          <>
            <p>
              In accordance with the provisions of the <strong>Transplantation of Human Organs and Tissues Act, 2010
              (THOTA)</strong>, and Section 3 thereof, I hereby pledge and consent to donate my organs and/or tissues
              for the purpose of medical transplantation to save the lives of other human beings.
            </p>
            <p>I further consent to:</p>
            <ol>
              <li>The retrieval of my organs/tissues by authorized medical practitioners after my death (deceased donation),
                or during my lifetime where medically appropriate (living donation).</li>
              <li>The medical examination, blood tests, tissue typing, HLA cross-matching, and other clinical
                assessments required to establish suitability for donation.</li>
              <li>The use of my donated organs solely for therapeutic purposes and not for commercial sale or trade,
                as expressly prohibited under Section 6 of THOTA 2010.</li>
              <li>The disclosure of my anonymized medical information to authorized transplant coordinators,
                hospitals registered with HOTA, and ODCAT platform staff.</li>
              <li>The ODCAT platform contacting my family / next of kin in the event of a successful match.</li>
            </ol>
          </>
        ) : (
          <>
            <p>
              In accordance with the provisions of the <strong>Transplantation of Human Organs and Tissues Act, 2010
              (THOTA)</strong>, I hereby register myself as a transplant recipient on the ODCAT platform and consent
              to be placed on the National Organ Waiting List under the supervision of the Human Organ Transplant Authority (HOTA).
            </p>
            <p>I further consent to:</p>
            <ol>
              <li>Providing accurate, complete, and truthful medical information for the purpose of case
                evaluation and matching.</li>
              <li>Undergoing required medical evaluations including blood tests, tissue typing, organ function
                assessments, and psychological evaluations.</li>
              <li>Being matched with a compatible donor based on medical urgency, compatibility, waiting time,
                and geographic factors — and not on financial, social, ethnic, religious, or political grounds.</li>
              <li>Receiving the organ/tissue from a registered donor through legal means only, and never through
                commercial purchase, which is a punishable offence under THOTA Section 6.</li>
              <li>Following all post-transplant medical instructions and reporting outcomes to the treating hospital.</li>
            </ol>
          </>
        )}

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>SECTION 3 — Rights and Withdrawal</h4>
        <p>I understand and acknowledge that:</p>
        <ul>
          <li>I have the absolute right to withdraw this consent at any time, without giving any reason, by submitting
            a written withdrawal request through the ODCAT platform or the registered hospital.</li>
          <li>Withdrawal of consent shall not affect any other medical treatment I may receive.</li>
          <li>My personal and medical information will be handled in accordance with the Personal Data Protection
            Bill of Pakistan and shall not be disclosed without my consent except as required by law.</li>
          <li>{userType === 'donor'
            ? 'My family/next of kin will be informed of my pledge and their wishes considered at the time of donation.'
            : 'My placement on the waiting list does not guarantee that an organ will become available.'}</li>
          <li>Any false declaration may result in disqualification from the program and may attract legal consequences
            under Section 9 of THOTA 2010.</li>
        </ul>

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>SECTION 4 — Religious &amp; Ethical Affirmation</h4>
        <p>
          I affirm that I have considered the religious, cultural, and ethical implications of this declaration.
          The Council of Islamic Ideology (CII) of Pakistan, in its 2010 ruling, declared organ donation
          and transplantation as <em>permissible (mubah)</em> under Islamic Sharia where it is required to save
          a human life and where no commercial transaction is involved.
        </p>

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>SECTION 5 — Legal Framework</h4>
        <p>
          This declaration is made under and shall be governed by:
        </p>
        <ul>
          <li>Transplantation of Human Organs and Tissues Act, 2010 (THOTA)</li>
          <li>Human Organ Transplant Authority (HOTA) Rules &amp; Regulations</li>
          <li>Pakistan Medical &amp; Dental Council (PMDC) ethical guidelines</li>
          <li>Provincial Health Care Commission Acts (where applicable)</li>
        </ul>
        <p style={{ background: '#fff5f5', border: '1px solid #fbd5d5', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#9b2c2c' }}>
          <strong>⚠️ NOTICE:</strong> Any commercial dealing in human organs is a punishable offence under
          Section 6 of THOTA 2010, with imprisonment up to ten (10) years and a fine of up to one (1) million Pakistani Rupees.
          ODCAT does not tolerate or facilitate any such activity.
        </p>

        <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#888', borderTop: '1px dashed #ccc', paddingTop: '14px' }}>
          — END OF OFFICIAL CONSENT FORM —
        </p>
      </div>

      {!readToBottom && (
        <div style={{ padding: '10px 24px', background: '#fff8e1', borderTop: '1px solid #f6e58d', fontSize: '12px', color: '#7c4a03', textAlign: 'center', fontWeight: '600' }}>
          ↓ Scroll to the bottom to enable signing
        </div>
      )}

      {/* Signature Section */}
      <div style={{ padding: '20px 24px', borderTop: '2px solid #014421', background: '#f8f9fb' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: '#014421', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Section 6 — Signature &amp; Identity Verification
        </div>

        <div className="grid2">
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px' }}>Full Name (as per CNIC) *</label>
            <input className="form-input" value={signature} onChange={e => setSignature(e.target.value)}
              placeholder="Type your full legal name" disabled={!readToBottom} />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px' }}>CNIC Number *</label>
            <input className="form-input" value={cnic}
              onChange={e => setCnic(e.target.value.replace(/[^0-9-]/g, '').slice(0, 15))}
              placeholder="XXXXX-XXXXXXX-X" disabled={!readToBottom} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: readToBottom ? 'pointer' : 'not-allowed', opacity: readToBottom ? 1 : 0.5, marginBottom: '10px' }}>
          <input type="checkbox" checked={agreed} onChange={e => readToBottom && setAgreed(e.target.checked)} disabled={!readToBottom} style={{ marginTop: '3px' }} />
          <span style={{ fontSize: '12px', color: 'var(--text1)', lineHeight: '1.5' }}>
            I have read, understood, and voluntarily agree to all sections of this consent form.
            I confirm that all information I am providing is accurate and truthful, and I am of sound mind.
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: readToBottom ? 'pointer' : 'not-allowed', opacity: readToBottom ? 1 : 0.5 }}>
          <input type="checkbox" checked={witnessed} onChange={e => readToBottom && setWitnessed(e.target.checked)} disabled={!readToBottom} style={{ marginTop: '3px' }} />
          <span style={{ fontSize: '12px', color: 'var(--text1)', lineHeight: '1.5' }}>
            I declare that this consent is given of my own free will, without any coercion, fraud, or
            commercial inducement, and I understand the legal consequences of providing false information.
          </span>
        </label>
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onDecline}>Decline</button>
        <button className="btn btn-primary" onClick={handleAccept} disabled={!canSign}
          style={{ opacity: canSign ? 1 : 0.5 }}>
          ✍️ Sign &amp; Agree
        </button>
      </div>
    </div>
  );
};

// ============================================================
// DOCUMENT UPLOAD CARD
// ============================================================
const DocCard = ({ docKey, config, uploaded, onUpload, onRemove }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    // Enhanced file validation
    const validMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validMime.includes(file.type)) {
      toast('Invalid file type. Please upload a JPEG, PNG, WebP, GIF, or PDF.', 'error');
      return;
    }
    // Warn about suspicious file names
    if (/sample|example|test|template|placeholder|dummy/i.test(file.name)) {
      toast('This file appears to be a sample. Please upload your real document.', 'warning');
    }
    const maxBytes = config.maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      toast(`File too large. Maximum ${config.maxSizeMB} MB.`, 'error'); return;
    }
    if (file.size < 5000) {
      toast('File appears too small or blank. Please upload a clear document.', 'warning'); return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onUpload(docKey, {
        name: file.name, type: file.type, size: file.size, data: reader.result,
        documentType: docKey, uploadedAt: new Date().toISOString()
      });
      toast(`"${file.name}" uploaded.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      border: `2px dashed ${uploaded ? 'var(--accent)' : dragOver ? 'var(--primary)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)', padding: '14px',
      background: uploaded ? 'var(--accent-light)' : dragOver ? 'var(--primary-light)' : 'var(--surface)',
      transition: 'all .2s', marginBottom: '10px'
    }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: uploaded ? 'var(--accent)' : 'var(--surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
          {uploaded ? '✅' : '📄'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>
            {config.label} {config.required && <span className="badge badge-red" style={{ fontSize: '9px', marginLeft: '4px' }}>Required</span>}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>{config.hint}</div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>Max {config.maxSizeMB} MB • Images or PDF</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} accept="image/*,.pdf"
              onChange={e => handleFile(e.target.files[0])} />
            <span className={`btn btn-xs ${uploaded ? 'btn-ghost' : 'btn-outline'}`} style={{ cursor: 'pointer' }}>
              {uploaded ? 'Replace' : 'Upload'}
            </span>
          </label>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setShowSample(true)}
            style={{ fontSize: '11px' }}>
            Sample Doc
          </button>
          {uploaded && (
            <button type="button" className="btn btn-xs" onClick={() => onRemove(docKey)}
              style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: 'none' }}>
              Remove
            </button>
          )}
        </div>
      </div>
      {uploaded && (
        <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(14,176,122,.1)', borderRadius: '6px', fontSize: '11px', color: 'var(--text1)' }}>
          📎 {uploaded.name} • {(uploaded.size / 1024).toFixed(1)} KB
        </div>
      )}
    </div>
  );
};

// ============================================================
// MAIN WIZARD COMPONENT
// ============================================================
const DonorRecipientWizard = ({ user, onComplete, onCancel, mode = 'new' }) => {
  // mode: 'new' = first-time registration, 'resubmit' = info_requested resubmission
  const isResubmit = mode === 'resubmit';
  const [currentStep, setCurrentStep] = useState(isResubmit ? 2 : 1); // skip consent on resubmit
  const [submitting, setSubmitting] = useState(false);

  const isDonor = user.role === 'donor';

  // Consent data
  const [consentData, setConsentData] = useState(null);

  // Clinical form data (pre-filled if resubmitting)
  const [clinical, setClinical] = useState({
    cnic: user.cnic || '',
    dob: user.dob || '',
    gender: user.gender || '',
    age: user.age || '',
    bloodType: user.bloodType || '',
    phone: user.phone || '',
    address: user.address || '',
    emergencyContactName: user.emergencyContactName || '',
    emergencyContactPhone: user.emergencyContactPhone || '',
    emergencyContactRelation: user.emergencyContactRelation || '',
    medicalHistory: user.medicalHistory || '',
    currentMedications: user.currentMedications || '',
    // Donor
    pledgedOrgans: user.pledgedOrgans || [],
    donationType: user.donationType || 'deceased',
    familyInformed: user.familyInformed || false,
    nextOfKin: user.nextOfKin || '',
    // Recipient
    organNeeded: user.organNeeded || '',
    diagnosis: user.diagnosis || '',
    urgencyScore: user.urgencyScore || 5,
    treatingDoctor: user.treatingDoctor || '',
    currentHospital: user.currentHospital || '',
  });

  const [documents, setDocuments] = useState({});
  const [preferredHospitalId, setPreferredHospitalId] = useState(user.preferredHospitalId || '');

  const docConfig = isDonor ? DONOR_DOCS : RECIPIENT_DOCS;
  const approvedHospitals = useMemo(() => getApprovedHospitals(), []);

  // Total steps: 1=Consent, 2=Clinical, 3=Documents, 4=Hospital & Submit
  const totalSteps = 4;

  // Auto-calculate age from DOB
  useEffect(() => {
    if (clinical.dob) {
      const calculatedAge = calculateAgeFromDOB(clinical.dob);
      if (calculatedAge && calculatedAge !== clinical.age) {
        setClinical(prev => ({ ...prev, age: calculatedAge }));
      }
    }
  }, [clinical.dob]);

  const handleClinicalChange = (e) => {
    const { name, value, type, checked } = e.target;
    setClinical(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const togglePledgedOrgan = (organ) => {
    setClinical(prev => ({
      ...prev,
      pledgedOrgans: prev.pledgedOrgans.includes(organ)
        ? prev.pledgedOrgans.filter(o => o !== organ)
        : [...prev.pledgedOrgans, organ]
    }));
  };

  const handleDocUpload = (key, fileData) => {
    setDocuments(prev => ({ ...prev, [key]: fileData }));
  };

  const handleDocRemove = (key) => {
    setDocuments(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // ===== STEP VALIDATION =====
  const validateClinical = () => {
    if (!clinical.cnic || clinical.cnic.length < 13) {
      toast('Please enter a valid 13-digit CNIC.', 'error'); return false;
    }
    if (!clinical.dob || !clinical.gender || !clinical.bloodType || !clinical.age) {
      toast('Please fill all basic identity fields.', 'error'); return false;
    }
    if (!clinical.phone || !clinical.address) {
      toast('Phone and address are required.', 'error'); return false;
    }
    if (!clinical.emergencyContactName || !clinical.emergencyContactPhone) {
      toast('Please provide emergency contact details.', 'error'); return false;
    }
    if (isDonor && (!clinical.pledgedOrgans || clinical.pledgedOrgans.length === 0)) {
      toast('Please select at least one organ to pledge.', 'error'); return false;
    }
    if (!isDonor && (!clinical.organNeeded || !clinical.diagnosis)) {
      toast('Organ needed and diagnosis are required.', 'error'); return false;
    }
    return true;
  };

  const validateDocs = () => {
    const required = Object.entries(docConfig).filter(([, c]) => c.required).map(([k]) => k);
    const missing = required.filter(k => !documents[k] && !(user.uploadedDocuments || []).find(d => d.documentType === k));
    if (missing.length > 0) {
      toast(`Please upload: ${missing.map(k => docConfig[k].label).join(', ')}`, 'error');
      return false;
    }
    return true;
  };

  const validateHospital = () => {
    if (!preferredHospitalId) {
      toast('Please select a hospital to submit your case to.', 'error'); return false;
    }
    return true;
  };

  // ===== NAVIGATION =====
  const goNext = () => {
    if (currentStep === 1 && !consentData) {
      toast('Please sign the consent form first.', 'warning'); return;
    }
    if (currentStep === 2 && !validateClinical()) return;
    if (currentStep === 3 && !validateDocs()) return;
    if (currentStep === 4) {
      handleSubmit(); return;
    }
    setCurrentStep(s => s + 1);
  };

  const goBack = () => {
    if (currentStep > 1 && !isResubmit) setCurrentStep(s => s - 1);
    else if (isResubmit && currentStep > 2) setCurrentStep(s => s - 1);
  };

  const handleConsentAccepted = (data) => {
    setConsentData(data);
    toast('Consent form signed successfully.', 'success');
    setCurrentStep(2);
  };

  const handleSubmit = () => {
    if (!validateHospital()) return;
    setSubmitting(true);

    setTimeout(() => {
      try {
        const selectedHospital = approvedHospitals.find(h => h.id === preferredHospitalId);
        const docs = Object.values(documents);

        if (isResubmit) {
          // Resubmission: keep existing data, just update fields and add new docs
          resubmitCaseInfo(user.id, {
            ...clinical,
            age: clinical.age ? parseInt(clinical.age) : null,
          }, docs);
          toast('Information resubmitted to the hospital.', 'success');
        } else {
          // New full registration
          completeDonorRecipientRegistration(user.id, {
            ...clinical,
            age: clinical.age ? parseInt(clinical.age) : null,
            fullName: consentData?.signature || user.name,
            signature: consentData?.signature,
            documents: docs,
            preferredHospitalId,
            preferredHospitalName: selectedHospital?.hospitalName || selectedHospital?.name,
          });
          toast('Registration submitted! It is now under review by the selected hospital.', 'success');
        }
        onComplete && onComplete();
      } catch (err) {
        toast(err.message || 'Submission failed. Please try again.', 'error');
        setSubmitting(false);
      }
    }, 700);
  };

  // ===== RENDER =====
  const stepLabels = ['Consent', 'Clinical Details', 'Documents', 'Submit'];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div className="card" style={{ marginBottom: '16px', padding: '20px 24px', background: 'linear-gradient(135deg, var(--primary) 0%, #2d7dc6 100%)', color: '#fff', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '20px' }}>
              {isResubmit ? '🔄 Resubmit Information' : `Complete Your ${isDonor ? 'Donor' : 'Recipient'} Registration`}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,.85)' }}>
              {isResubmit
                ? `The hospital has requested additional information. ${user.hospitalReviewNotes ? `Note: "${user.hospitalReviewNotes}"` : ''}`
                : `Hi ${user.name}, let's complete your registration in 4 quick steps.`}
            </p>
          </div>
          <button onClick={onCancel} className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="card" style={{ marginBottom: '16px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isActive = currentStep === stepNum;
            const isDone = currentStep > stepNum;
            return (
              <div key={label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: isDone ? 'var(--accent)' : isActive ? 'var(--primary)' : 'var(--surface3)',
                  color: isDone || isActive ? '#fff' : 'var(--text3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: '700', flexShrink: 0,
                  border: isActive ? '3px solid var(--primary-light)' : 'none',
                }}>
                  {isDone ? '✓' : stepNum}
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: '600' }}>Step {stepNum}</div>
                  <div style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500', color: isActive ? 'var(--primary)' : 'var(--text2)' }}>{label}</div>
                </div>
                {i < stepLabels.length - 1 && (
                  <div style={{ flex: 1, height: '2px', background: isDone ? 'var(--accent)' : 'var(--border)', marginLeft: '8px' }}></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: Consent */}
      {currentStep === 1 && (
        <PakistanConsentForm
          userType={user.role}
          name={user.name}
          onAccept={handleConsentAccepted}
          onDecline={onCancel}
        />
      )}

      {/* STEP 2: Clinical Form */}
      {currentStep === 2 && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginTop: 0 }}>📋 {isDonor ? 'Donor' : 'Recipient'} Clinical &amp; Personal Details</h3>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px' }}>
            Please provide accurate information. All required fields are marked with *.
          </p>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '12px' }}>Identity</h4>
            <div className="grid2">
              <div className="form-group">
                <label className="form-label">CNIC Number *</label>
                <input className="form-input" name="cnic" value={clinical.cnic}
                  onChange={e => setClinical(p => ({ ...p, cnic: e.target.value.replace(/[^0-9-]/g, '').slice(0, 15) }))}
                  placeholder="XXXXX-XXXXXXX-X" required />
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth *</label>
                <input className="form-input" name="dob" type="date" value={clinical.dob} onChange={handleClinicalChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Gender *</label>
                <select className="form-select" name="gender" value={clinical.gender} onChange={handleClinicalChange} required>
                  <option value="">Select gender</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Age *</label>
                <input className="form-input" name="age" type="number" value={clinical.age} onChange={handleClinicalChange} min="1" max="120" required />
              </div>
              <div className="form-group">
                <label className="form-label">Blood Type *</label>
                <select className="form-select" name="bloodType" value={clinical.bloodType} onChange={handleClinicalChange} required>
                  <option value="">Select</option>
                  {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Phone *</label>
                <input className="form-input" name="phone" type="tel" value={clinical.phone} onChange={handleClinicalChange} required placeholder="03XX-XXXXXXX" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Full Address *</label>
              <input className="form-input" name="address" value={clinical.address} onChange={handleClinicalChange} required placeholder="House #, Street, Area, City, Province" />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '12px' }}>Emergency Contact</h4>
            <div className="grid2">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" name="emergencyContactName" value={clinical.emergencyContactName} onChange={handleClinicalChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone *</label>
                <input className="form-input" name="emergencyContactPhone" type="tel" value={clinical.emergencyContactPhone} onChange={handleClinicalChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Relationship</label>
                <input className="form-input" name="emergencyContactRelation" value={clinical.emergencyContactRelation} onChange={handleClinicalChange} placeholder="e.g. Father, Spouse, Sibling" />
              </div>
            </div>
          </div>

          {/* Donor-specific fields */}
          {isDonor && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '12px' }}>❤️ Donation Pledge</h4>
              <div className="form-group">
                <label className="form-label">Organs You Wish to Pledge *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {ORGANS.map(organ => {
                    const active = clinical.pledgedOrgans.includes(organ);
                    return (
                      <button key={organ} type="button" onClick={() => togglePledgedOrgan(organ)}
                        style={{ padding: '6px 14px', borderRadius: '999px', border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--surface)', color: active ? '#fff' : 'var(--text2)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                        {active && '✓ '}{organ}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Donation Type</label>
                  <select className="form-select" name="donationType" value={clinical.donationType} onChange={handleClinicalChange}>
                    <option value="deceased">Deceased Donation Only</option>
                    <option value="living">Living Donation Only</option>
                    <option value="both">Both Living and Deceased</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Next of Kin Name</label>
                  <input className="form-input" name="nextOfKin" value={clinical.nextOfKin} onChange={handleClinicalChange} placeholder="Person to inform after donation" />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <input type="checkbox" name="familyInformed" checked={clinical.familyInformed} onChange={handleClinicalChange} />
                <span style={{ fontSize: '13px' }}>My family is aware and supportive of my decision to donate.</span>
              </label>
            </div>
          )}

          {/* Recipient-specific fields */}
          {!isDonor && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '12px' }}>🏥 Transplant Case</h4>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Organ Needed *</label>
                  <select className="form-select" name="organNeeded" value={clinical.organNeeded} onChange={handleClinicalChange} required>
                    <option value="">Select organ</option>
                    {ORGANS.map(o => <option key={o} value={o.toLowerCase()}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Urgency (1-10)</label>
                  <input className="form-input" type="number" name="urgencyScore" value={clinical.urgencyScore} onChange={handleClinicalChange} min="1" max="10" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Primary Diagnosis *</label>
                <input className="form-input" name="diagnosis" value={clinical.diagnosis} onChange={handleClinicalChange} required placeholder="e.g. End-Stage Renal Disease (ESRD)" />
              </div>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Treating Doctor</label>
                  <input className="form-input" name="treatingDoctor" value={clinical.treatingDoctor} onChange={handleClinicalChange} placeholder="Dr. Name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Currently Treated At</label>
                  <input className="form-input" name="currentHospital" value={clinical.currentHospital} onChange={handleClinicalChange} placeholder="Hospital name" />
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '12px' }}>Medical Background</h4>
            <div className="form-group">
              <label className="form-label">Medical History</label>
              <textarea className="form-input" name="medicalHistory" value={clinical.medicalHistory} onChange={handleClinicalChange} style={{ minHeight: '70px', resize: 'vertical' }} placeholder="Past surgeries, chronic conditions, allergies..." />
            </div>
            <div className="form-group">
              <label className="form-label">Current Medications</label>
              <textarea className="form-input" name="currentMedications" value={clinical.currentMedications} onChange={handleClinicalChange} style={{ minHeight: '60px', resize: 'vertical' }} placeholder="List medications you are currently taking" />
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Documents */}
      {currentStep === 3 && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginTop: 0 }}>📂 Upload Required Documents</h3>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px' }}>
            Please upload clear, legible copies. Blurry or low-quality scans may be flagged for re-upload.
          </p>

          {Object.entries(docConfig).map(([key, config]) => (
            <div key={key}>
              <DocCard docKey={key} config={config}
                uploaded={documents[key]} onUpload={handleDocUpload} onRemove={handleDocRemove} />
            </div>
          ))}

          {(user.uploadedDocuments || []).length > 0 && isResubmit && (
            <div style={{ marginTop: '16px', padding: '14px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text1)', marginBottom: '8px' }}>📁 Previously Submitted Documents</div>
              {user.uploadedDocuments.map((doc, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--text2)', padding: '4px 0' }}>
                  ✓ {doc.name || doc.documentType}
                </div>
              ))}
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px', fontStyle: 'italic' }}>
                You can upload replacements above. Existing files remain unless replaced.
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Hospital & Submit */}
      {currentStep === 4 && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginTop: 0 }}>🏥 Select a Hospital &amp; Submit</h3>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px' }}>
            Choose the hospital you would like to submit your case to for review and approval.
          </p>

          {approvedHospitals.length === 0 ? (
            <div style={{ padding: '20px', background: 'var(--warning-light)', borderRadius: 'var(--radius)', textAlign: 'center', color: 'var(--warning)' }}>
              ⚠️ No approved hospitals are available right now. Please contact the admin or try again later.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {approvedHospitals.map(h => {
                const selected = preferredHospitalId === h.id;
                return (
                  <button key={h.id} type="button" onClick={() => setPreferredHospitalId(h.id)}
                    style={{
                      textAlign: 'left', padding: '14px 18px', borderRadius: 'var(--radius-lg)',
                      border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                      background: selected ? 'var(--primary-light)' : 'var(--surface)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px',
                      transition: 'all .2s'
                    }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: selected ? 'var(--primary)' : 'var(--surface3)',
                      color: selected ? '#fff' : 'var(--text2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '20px', flexShrink: 0
                    }}>🏨</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text1)' }}>
                        {h.hospitalName || h.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                        {h.hospitalAddress || h.email} • Reg# {h.registrationNumber || 'N/A'}
                      </div>
                    </div>
                    {selected && <span style={{ color: 'var(--primary)', fontSize: '20px' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: '20px', padding: '14px', background: 'var(--accent-light)', borderRadius: 'var(--radius)', borderLeft: '4px solid var(--accent)', fontSize: '12px', color: 'var(--text1)', lineHeight: '1.6' }}>
            <strong>📋 Summary:</strong><br />
            ✓ Consent form signed<br />
            ✓ Clinical details completed<br />
            ✓ {Object.keys(documents).length} new document(s) uploaded<br />
            ✓ Selected hospital: {approvedHospitals.find(h => h.id === preferredHospitalId)?.hospitalName || 'None'}
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {currentStep > 1 && (
        <div className="card" style={{ marginTop: '16px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={goBack} className="btn btn-ghost" disabled={(isResubmit && currentStep === 2) || (!isResubmit && currentStep === 1)}>
            ← Back
          </button>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Step {currentStep} of {totalSteps}</div>
          <button onClick={goNext} className="btn btn-primary" disabled={submitting}>
            {currentStep === 4
              ? (submitting ? 'Submitting...' : (isResubmit ? '📤 Resubmit to Hospital' : '📤 Submit to Hospital'))
              : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DonorRecipientWizard;
