import { useState, useEffect } from 'react';
import {
  completeDonorRecipientRegistration,
  resubmitCaseInfo,
  getApprovedHospitals,
  calculateAgeFromDOB,
  ageLabelFromDOB,
  capitalizeName,
} from '../utils/auth';
import { toast } from '../utils/toast';
import { generateRegistrationPDF, generateConsentDeclarationPDF } from '../utils/pdfReport';
import { ORGANS } from '../utils/organs';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other'];

const formatCNIC = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
};

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

// Document configurations
const DONOR_DOCS = {
  cnic_front: { label: 'CNIC — Front Side', required: true, maxSizeMB: 5, hint: 'Photo of the front of your CNIC card' },
  cnic_back: { label: 'CNIC — Back Side', required: true, maxSizeMB: 5, hint: 'Photo of the back of your CNIC card' },
  medicalCertificate: { label: 'Medical Fitness Certificate', required: false, maxSizeMB: 5, hint: 'Issued by a licensed physician within the last 3 months' },
  bloodTypeReport: { label: 'Blood Type Lab Report', required: false, maxSizeMB: 5, hint: 'Recent blood typing test report' },
  consentWitness: { label: 'Witness Signed Consent', required: false, maxSizeMB: 5, hint: 'Family member or guardian witness signature' },
};

const RECIPIENT_DOCS = {
  cnic_front: { label: 'CNIC — Front Side', required: true, maxSizeMB: 5, hint: 'Photo of the front of your CNIC card' },
  cnic_back: { label: 'CNIC — Back Side', required: true, maxSizeMB: 5, hint: 'Photo of the back of your CNIC card' },
  medicalReport: { label: 'Medical Diagnosis Report', required: false, maxSizeMB: 10, hint: 'Detailed diagnosis from your treating physician' },
  labReports: { label: 'Recent Lab Reports', required: false, maxSizeMB: 10, hint: 'Latest blood work, organ function tests' },
  doctorReferral: { label: 'Doctor Referral Letter', required: false, maxSizeMB: 5, hint: 'Letter from treating doctor recommending transplant' },
  insuranceProof: { label: 'Insurance / Treatment Coverage', required: false, maxSizeMB: 5, hint: 'Insurance card or coverage proof if applicable' },
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

  const canSign = agreed && witnessed && readToBottom && signature.trim() && cnic.replace(/\D/g, '').length >= 13;

  const handleAccept = () => {
    if (!canSign) {
      toast('Please complete all fields and check both confirmation boxes.', 'warning');
      return;
    }
    onAccept({ signature, cnic });
  };

  const isDonor = userType === 'donor';

  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ background: 'linear-gradient(135deg, #014421 0%, #0c6b3a 100%)', color: '#fff', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,.8)', letterSpacing: '1px' }}>
            ODCAT · ORGAN DONATION CAMPAIGN ANALYSIS TOOL
          </div>
          <div style={{ background: 'rgba(255,255,255,.15)', padding: '4px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: '700' }}>
            PRE-REGISTRATION
          </div>
        </div>
        <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>
          {isDonor ? 'Organ & Tissue Donation — Declaration of Intent' : 'Transplant Recipient — Pre-Registration & Declaration of Intent'}
        </h3>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.85)', marginTop: '4px' }}>
          Framework reference: Transplantation of Human Organs &amp; Tissues Act (THOTA) 2010
        </div>
      </div>

      {/* Honest disclaimer — replaces the misleading "legally binding" banner */}
      <div style={{ padding: '14px 24px', background: '#fef3e0', borderBottom: '1px solid #fbd38d', fontSize: '12px', color: '#7c4a03', lineHeight: '1.6' }}>
        ℹ️ <strong>This is a declaration of intent for platform pre-registration — not a legal consent instrument.</strong>{' '}
        Legally binding organ-donation/recipient consent under THOTA 2010 is executed <strong>in person at a HOTA-authorized
        hospital</strong>, before witnesses and the hospital Evaluation Committee. ODCAT is an academic platform and is{' '}
        <strong>not affiliated with, or endorsed by, HOTA or the Government of Pakistan</strong>.
      </div>

      <div onScroll={handleScroll} style={{ padding: '24px', maxHeight: '460px', overflowY: 'auto', fontSize: '13px', lineHeight: '1.85', color: '#333' }}>
        <div style={{ background: '#f8f9fb', padding: '14px 16px', borderRadius: '8px', borderLeft: '4px solid #014421', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#014421', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>
            Reference
          </div>
          <div style={{ fontSize: '12px', color: '#555' }}>
            <strong>Reference No:</strong> ODCAT/{userType.toUpperCase()}/{Date.now().toString().slice(-8)}<br />
            <strong>Date:</strong> {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}<br />
            <strong>Legal framework cited:</strong> THOTA 2010 (administered by the Human Organ Transplant Authority, HOTA)<br />
            <strong>Platform:</strong> ODCAT — academic / non-governmental
          </div>
        </div>

        <h4 style={{ color: '#014421', marginBottom: '8px' }}>SECTION 1 — Declaration of Identity</h4>
        <p>
          I, <strong>{name}</strong>, make this voluntary declaration of my own free will, in a sound state of
          mind, and without any coercion, fraud, misrepresentation or undue influence, for the purpose of
          pre-registering my intent on the ODCAT platform.
        </p>

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>
          SECTION 2 — {isDonor ? 'Intent to Donate' : 'Intent to Register as Recipient'}
        </h4>

        {isDonor ? (
          <>
            <p>
              Consistent with the principles of the <strong>Transplantation of Human Organs and Tissues Act, 2010
              (THOTA)</strong>, I express my <strong>intent</strong> to donate my organs and/or tissues for medical
              transplantation to help save human lives. I understand that legally effective consent will only be
              given later, in person, at a HOTA-authorized hospital.
            </p>
            <p>By pre-registering, I indicate my willingness to:</p>
            <ol>
              <li>Be contacted to begin the formal, in-person donation process through an authorized hospital.</li>
              <li>Undergo the medical examination, blood tests, tissue typing and HLA cross-matching required
                to establish suitability — carried out by authorized medical practitioners.</li>
              <li>Donate only for therapeutic purposes and never for commercial sale or trade, which is an
                offence under Section 6 of THOTA 2010.</li>
              <li>Allow my anonymized medical information to be shared with authorized transplant coordinators
                and HOTA-registered hospitals for matching.</li>
              <li>Have my family / next of kin involved in the formal donation decision as required by law.</li>
            </ol>
          </>
        ) : (
          <>
            <p>
              Consistent with the principles of the <strong>Transplantation of Human Organs and Tissues Act, 2010
              (THOTA)</strong>, I express my <strong>intent</strong> to be pre-registered as a prospective transplant
              recipient on the ODCAT platform. I understand that formal placement on any official waiting list, and
              legally effective consent, occur only through a HOTA-authorized hospital.
            </p>
            <p>By pre-registering, I indicate my willingness to:</p>
            <ol>
              <li>Provide accurate, complete and truthful medical information for case evaluation and matching.</li>
              <li>Undergo required medical evaluations (blood tests, tissue typing, organ-function and
                psychological assessments) through an authorized hospital.</li>
              <li>Be matched on medical grounds — urgency, compatibility, waiting time and geography — and
                never on financial, social, ethnic, religious or political grounds.</li>
              <li>Receive an organ only through lawful means and never through commercial purchase, which is
                an offence under Section 6 of THOTA 2010.</li>
              <li>Follow all post-transplant medical instructions and report outcomes to the treating hospital.</li>
            </ol>
          </>
        )}

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>SECTION 3 — Rights and Withdrawal</h4>
        <p>I understand and acknowledge that:</p>
        <ul>
          <li>I may withdraw this pre-registration at any time, without giving a reason, through the ODCAT
            platform or the hospital handling my case.</li>
          <li>Withdrawal will not affect any other medical treatment I may receive.</li>
          <li>My personal and medical information will be handled in line with applicable Pakistani data-protection
            law and not disclosed without my consent except where required by law.</li>
          <li>{isDonor
            ? 'My family / next of kin will be informed and involved in the formal, in-person donation decision.'
            : 'Pre-registration does not place me on any official waiting list and does not guarantee an organ will become available.'}</li>
          <li>Providing false information may result in removal from the platform and may have legal
            consequences under THOTA 2010.</li>
        </ul>

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>SECTION 4 — Religious &amp; Ethical Note</h4>
        <p>
          The Council of Islamic Ideology (CII) of Pakistan has held organ donation and transplantation to be
          <em> permissible (mubah)</em> under Islamic Sharia where it is needed to save a human life and where no
          commercial transaction is involved. This note is provided for awareness and is not religious or legal advice.
        </p>

        <h4 style={{ color: '#014421', marginTop: '20px', marginBottom: '8px' }}>SECTION 5 — Legal Framework (for reference)</h4>
        <p>The formal, in-person process is governed by:</p>
        <ul>
          <li>Transplantation of Human Organs and Tissues Act, 2010 (THOTA)</li>
          <li>Human Organ Transplant Authority (HOTA) Rules &amp; Regulations</li>
          <li>Pakistan Medical &amp; Dental Council (PMDC) ethical guidelines</li>
          <li>Applicable provincial healthcare-commission laws</li>
        </ul>
        <p style={{ background: '#fff5f5', border: '1px solid #fbd5d5', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#9b2c2c' }}>
          <strong>⚠️ Notice:</strong> Commercial dealing in human organs is a punishable offence under
          Section 6 of THOTA 2010 (imprisonment up to ten years and a fine up to one million Pakistani Rupees).
          ODCAT does not tolerate or facilitate any such activity.
        </p>

        <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#888', borderTop: '1px dashed #ccc', paddingTop: '14px' }}>
          — END OF PRE-REGISTRATION DECLARATION —
        </p>
      </div>

      {!readToBottom && (
        <div style={{ padding: '10px 24px', background: '#fff8e1', borderTop: '1px solid #f6e58d', fontSize: '12px', color: '#7c4a03', textAlign: 'center', fontWeight: '600' }}>
          ↓ Scroll to the bottom to continue
        </div>
      )}

      {/* Acknowledgement Section */}
      <div style={{ padding: '20px 24px', borderTop: '2px solid #014421', background: '#f8f9fb' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: '#014421', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Section 6 — Acknowledgement &amp; Identity
        </div>

        <div className="grid2">
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px' }}>Full Name (as per CNIC) *</label>
            <input className="form-input" value={signature} onChange={e => setSignature(capitalizeName(e.target.value))}
              placeholder="Type your full legal name" disabled={!readToBottom} />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px' }}>CNIC Number *</label>
            <input className="form-input" value={cnic}
              onChange={e => setCnic(formatCNIC(e.target.value))}
              placeholder="XXXXX-XXXXXXX-X" disabled={!readToBottom} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: readToBottom ? 'pointer' : 'not-allowed', opacity: readToBottom ? 1 : 0.5, marginBottom: '10px' }}>
          <input type="checkbox" checked={agreed} onChange={e => readToBottom && setAgreed(e.target.checked)} disabled={!readToBottom} style={{ marginTop: '3px' }} />
          <span style={{ fontSize: '12px', color: 'var(--text1)', lineHeight: '1.5' }}>
            I have read and understood this declaration. I understand it is a pre-registration of intent on the
            ODCAT platform and <strong>not</strong> a legally binding consent. The information I have provided is
            accurate and truthful.
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: readToBottom ? 'pointer' : 'not-allowed', opacity: readToBottom ? 1 : 0.5 }}>
          <input type="checkbox" checked={witnessed} onChange={e => readToBottom && setWitnessed(e.target.checked)} disabled={!readToBottom} style={{ marginTop: '3px' }} />
          <span style={{ fontSize: '12px', color: 'var(--text1)', lineHeight: '1.5' }}>
            I acknowledge that legally effective consent under THOTA 2010 must be given in person at a
            HOTA-authorized hospital, and that this declaration is made of my own free will without any
            coercion or commercial inducement.
          </span>
        </label>
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-ghost"
          onClick={() => generateConsentDeclarationPDF({ userType, name: signature || name, cnic })}
          title="Open a printable copy you can sign by hand and take to a HOTA-authorized hospital"
          style={{ color: '#014421', fontWeight: 600 }}
        >
          ⬇ Download to sign offline
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-ghost" onClick={onDecline}>Decline</button>
          <button className="btn btn-primary" onClick={handleAccept} disabled={!canSign}
            style={{ opacity: canSign ? 1 : 0.5 }}>
            ✍️ Acknowledge &amp; Continue
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// DOCUMENT UPLOAD CARD
// ============================================================
// ============================================================
// CNIC DOUBLE-UPLOAD CARD (front + back)
// ============================================================
const CnicDocCard = ({ uploadedFront, uploadedBack, onUpload, onRemove }) => {
  const processFile = (side, file) => {
    if (!file) return;
    const validMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validMime.includes(file.type)) {
      toast('Invalid file type. Please upload a JPEG, PNG, WebP, GIF, or PDF.', 'error'); return;
    }
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) { toast('File too large. Maximum 5 MB.', 'error'); return; }
    if (file.size < 5000) { toast('File appears too small or blank.', 'warning'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      const key = side === 'front' ? 'cnic_front' : 'cnic_back';
      onUpload(key, { name: file.name, type: file.type, size: file.size, data: reader.result, documentType: key, uploadedAt: new Date().toISOString() });
      toast(`CNIC ${side} uploaded.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const bothDone = uploadedFront && uploadedBack;

  const Slot = ({ side, uploaded }) => (
    <div style={{
      flex: 1, border: `2px dashed ${uploaded ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: '12px', background: uploaded ? 'var(--accent-light)' : 'var(--surface2)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center'
    }}>
      <div style={{ fontSize: '28px' }}>{uploaded ? '✅' : side === 'front' ? '🪪' : '🔄'}</div>
      <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text1)' }}>
        {side === 'front' ? 'Front Side' : 'Back Side'}
      </div>
      {uploaded
        ? <div style={{ fontSize: '10px', color: 'var(--text2)', wordBreak: 'break-all' }}>{uploaded.name}</div>
        : <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{side === 'front' ? 'Photo with name & CNIC no.' : 'Photo with address & barcode'}</div>
      }
      <label style={{ cursor: 'pointer', marginTop: '4px' }}>
        <input type="file" style={{ display: 'none' }} accept="image/*,.pdf"
          onChange={e => processFile(side, e.target.files[0])} />
        <span className={`btn btn-xs ${uploaded ? 'btn-ghost' : 'btn-outline'}`} style={{ cursor: 'pointer' }}>
          {uploaded ? 'Replace' : 'Upload'}
        </span>
      </label>
      {uploaded && (
        <button type="button" className="btn btn-xs"
          onClick={() => onRemove(side === 'front' ? 'cnic_front' : 'cnic_back')}
          style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: 'none' }}>
          Remove
        </button>
      )}
    </div>
  );

  return (
    <div style={{
      border: `2px dashed ${bothDone ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)', padding: '14px', marginBottom: '10px',
      background: bothDone ? 'var(--accent-light)' : 'var(--surface)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px' }}>🪪</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>
            CNIC (Front &amp; Back) <span className="badge badge-red" style={{ fontSize: '9px', marginLeft: '4px' }}>Required</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Upload both sides of your National Identity Card</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <Slot side="front" uploaded={uploadedFront} />
        <Slot side="back" uploaded={uploadedBack} />
      </div>
    </div>
  );
};

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
            {config.label}
            {config.required
              ? <span className="badge badge-red" style={{ fontSize: '9px', marginLeft: '4px' }}>Required</span>
              : <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--text3)', marginLeft: '6px', fontStyle: 'italic' }}>optional</span>}
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
    // Recipient account type: 'personal' (adult patient) or 'guardian' (parent/guardian of a child patient)
    accountType: user.accountType || 'personal',
    patientName: user.patientName || '',
    guardianName: user.guardianName || '',
    guardianRelationship: user.guardianRelationship || '',
    guardianCnic: user.guardianCnic || '',
    guardianPhone: user.guardianPhone || '',
  });

  const isGuardian = !isDonor && clinical.accountType === 'guardian';

  // Adult (≥18) is required for living donors AND for recipients registering a
  // PERSONAL account. Only a parent/guardian account (registering a child) has
  // no minimum age. Recomputed each render so toggling Personal/Guardian
  // immediately re-applies the correct DOB limit.
  const requiresAdult = !isGuardian;
  // Use local date parts — toISOString() shifts the date in UTC+5.
  const maxDOB = (() => {
    const d = new Date();
    if (requiresAdult) d.setFullYear(d.getFullYear() - 18);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  const [documents, setDocuments] = useState({});
  const [preferredHospitalId, setPreferredHospitalId] = useState(user.preferredHospitalId || '');

  const docConfig = isDonor ? DONOR_DOCS : RECIPIENT_DOCS;
  const [approvedHospitals, setApprovedHospitals] = useState([]);

  useEffect(() => {
    getApprovedHospitals().then(h => setApprovedHospitals(h)).catch(() => {});
  }, []);

  // Total steps: 1=Consent, 2=Clinical, 3=Documents, 4=Hospital & Submit
  const totalSteps = 4;

  // Auto-calculate age from DOB. calculateAgeFromDOB returns '' for an
  // invalid/incomplete/future date and 0 for a newborn — both must be applied
  // (so a stale wrong age is cleared and infants correctly show 0).
  useEffect(() => {
    const calculatedAge = clinical.dob ? calculateAgeFromDOB(clinical.dob) : '';
    if (calculatedAge !== clinical.age) {
      setClinical(prev => ({ ...prev, age: calculatedAge }));
    }
  }, [clinical.dob]);

  const handleClinicalChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'dob' && value) {
      // Clamp typed date: if it's after maxDOB, reset to maxDOB.
      // requiresAdult: maxDOB enforces the 18+ rule (donor / personal recipient).
      // guardian (child): maxDOB is today, so this only blocks future dates.
      if (value > maxDOB) {
        setClinical(prev => ({ ...prev, dob: maxDOB }));
        toast(requiresAdult
          ? (isDonor ? 'Donors must be at least 18 years old.' : 'A personal account holder must be at least 18 years old.')
          : 'Date of birth cannot be in the future.', 'warning');
        return;
      }
    }
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
    if (isGuardian) {
      if (!clinical.patientName.trim()) { toast("Please enter the patient's (child's) full name.", 'error'); return false; }
      if (!clinical.guardianName.trim()) { toast("Please enter the guardian's full name.", 'error'); return false; }
      if (!clinical.guardianRelationship) { toast('Please select your relationship to the patient.', 'error'); return false; }
      if (!clinical.guardianCnic || clinical.guardianCnic.replace(/\D/g, '').length < 13) {
        toast("Please enter the guardian's valid 13-digit CNIC.", 'error'); return false;
      }
      if (!clinical.guardianPhone || clinical.guardianPhone.replace(/\D/g, '').length < 10) {
        toast("Please enter the guardian's valid phone number.", 'error'); return false;
      }
    }
    if (!clinical.cnic || clinical.cnic.replace(/\D/g, '').length < 13) {
      toast(isGuardian ? "Please enter the child's valid 13-digit CNIC / B-Form number." : 'Please enter a valid 13-digit CNIC.', 'error'); return false;
    }
    // age can legitimately be 0 (newborn), so check for empty string, not falsiness
    const ageMissing = clinical.age === '' || clinical.age === null || clinical.age === undefined;
    if (!clinical.dob || !clinical.gender || !clinical.bloodType || ageMissing) {
      toast('Please enter a valid date of birth and fill all basic identity fields.', 'error'); return false;
    }
    // Adult required for donors and PERSONAL recipient accounts.
    // Guardian (child) accounts have no minimum age.
    if (requiresAdult && parseInt(clinical.age) < 18) {
      toast(isDonor
        ? 'Donors must be at least 18 years old to register.'
        : 'A personal account holder must be at least 18 years old. To register a child, choose "Parent / Guardian account".',
        'error'); return false;
    }
    if (!clinical.phone || !clinical.address) {
      toast('Phone and address are required.', 'error'); return false;
    }
    if (isDonor && (!clinical.emergencyContactName || !clinical.emergencyContactPhone || !clinical.emergencyContactRelation)) {
      toast('Please provide emergency contact name, phone, and relationship.', 'error'); return false;
    }
    if (isDonor && (!clinical.pledgedOrgans || clinical.pledgedOrgans.length === 0)) {
      toast('Please select at least one organ to pledge.', 'error'); return false;
    }
    if (!isDonor && !clinical.organNeeded) {
      toast('Organ needed is required.', 'error'); return false;
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
    if (data.cnic) {
      setClinical(prev => ({ ...prev, cnic: data.cnic }));
    }
    toast('Consent form signed successfully.', 'success');
    setCurrentStep(2);
  };

  const handleSubmit = async () => {
    if (!validateHospital()) return;
    setSubmitting(true);

    try {
      const selectedHospital = approvedHospitals.find(h => h.id == preferredHospitalId);
      const docs = Object.values(documents);

      if (isResubmit) {
        await resubmitCaseInfo(user.id, {
          ...clinical,
          age: clinical.age ? parseInt(clinical.age) : null,
        }, docs);
        toast('Information resubmitted to the hospital.', 'success');
      } else {
        await completeDonorRecipientRegistration(user.id, {
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

          {/* Account type — recipients only. Children can receive transplants, so a parent/
              guardian can manage the account on the patient's behalf. */}
          {!isDonor && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '12px' }}>Who is this account for?</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { v: 'personal', icon: '🧑', t: 'Personal account', d: 'I am the patient and I am registering for myself (adult).' },
                  { v: 'guardian', icon: '👨‍👩‍👧', t: 'Parent / Guardian account', d: "I am registering on behalf of a child or dependent who needs a transplant." },
                ].map(opt => {
                  const active = clinical.accountType === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setClinical(p => {
                        if (opt.v === 'guardian') {
                          // The signer of the consent form (Section 6) IS the
                          // guardian, so pre-fill the guardian's name + CNIC from
                          // it. The child's CNIC/B-Form is a separate field and
                          // must be entered fresh, so clear it.
                          return {
                            ...p,
                            accountType: 'guardian',
                            cnic: '',
                            guardianName: p.guardianName || consentData?.signature || user.name || '',
                            guardianCnic: p.guardianCnic || consentData?.cnic || '',
                          };
                        }
                        // Personal: signer = patient, restore their own CNIC.
                        return { ...p, accountType: 'personal', cnic: consentData?.cnic || p.cnic };
                      })}
                      style={{
                        textAlign: 'left', padding: '16px', borderRadius: 'var(--radius)', cursor: 'pointer',
                        border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        background: active ? 'var(--primary-light)' : 'var(--surface)',
                        transition: 'all .15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '20px' }}>{opt.icon}</span>
                        <span style={{ fontWeight: '700', fontSize: '14px', color: active ? 'var(--primary)' : 'var(--text1)' }}>{opt.t}</span>
                        {active && <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: '700' }}>✓</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5' }}>{opt.d}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Guardian & patient details — only when a parent/guardian is registering */}
          {isGuardian && (
            <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--primary-light)', border: '1px solid rgba(26,92,158,.2)', borderRadius: 'var(--radius)' }}>
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '4px' }}>👨‍👩‍👧 Guardian &amp; Patient</h4>
              <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' }}>
                You (the guardian) manage this account. The medical details below are for the <strong>child / patient</strong>.
              </p>
              <div className="grid2">
                <div className="form-group">
                  <label className="form-label">Patient's (Child's) Full Name *</label>
                  <input className="form-input" value={clinical.patientName}
                    onChange={e => setClinical(p => ({ ...p, patientName: capitalizeName(e.target.value) }))}
                    placeholder="Child's full name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Your Name (Guardian) *</label>
                  <input className="form-input" value={clinical.guardianName}
                    onChange={e => setClinical(p => ({ ...p, guardianName: capitalizeName(e.target.value) }))}
                    placeholder="Your full legal name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Relationship to Patient *</label>
                  <select className="form-select" value={clinical.guardianRelationship}
                    onChange={e => setClinical(p => ({ ...p, guardianRelationship: e.target.value }))} required>
                    <option value="">Select</option>
                    {['Father', 'Mother', 'Legal Guardian', 'Grandparent', 'Sibling', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Your CNIC (Guardian) *</label>
                  <input className="form-input" value={clinical.guardianCnic}
                    onChange={e => setClinical(p => ({ ...p, guardianCnic: formatCNIC(e.target.value) }))}
                    placeholder="XXXXX-XXXXXXX-X" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Your Phone (Guardian) *</label>
                  <input className="form-input" type="tel" value={clinical.guardianPhone}
                    onChange={e => setClinical(p => ({ ...p, guardianPhone: formatPKPhone(e.target.value) }))}
                    placeholder="03XX-XXXXXXX" required />
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '.5px', marginBottom: '12px' }}>
              {isGuardian ? "Patient (Child) Identity" : 'Identity'}
            </h4>
            <div className="grid2">
              <div className="form-group">
                <label className="form-label">{isGuardian ? "Child's CNIC / B-Form No. *" : 'CNIC Number *'}</label>
                <input className="form-input" name="cnic" value={clinical.cnic}
                  onChange={e => setClinical(p => ({ ...p, cnic: formatCNIC(e.target.value) }))}
                  placeholder="XXXXX-XXXXXXX-X" required />
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth *</label>
                <input className="form-input" name="dob" type="date" value={clinical.dob} onChange={handleClinicalChange} max={maxDOB} required />
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
                <input className="form-input" name="age" type="text"
                  value={clinical.dob ? (ageLabelFromDOB(clinical.dob) || '—') : ''}
                  readOnly
                  placeholder="Auto-calculated from date of birth"
                  style={{ background: 'var(--surface2)', cursor: 'not-allowed' }}
                  tabIndex={-1} />
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
                <input className="form-input" name="phone" type="tel" value={clinical.phone}
                  onChange={e => setClinical(p => ({ ...p, phone: formatPKPhone(e.target.value) }))}
                  required placeholder="03XX-XXXXXXX" />
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
                <label className="form-label">Name {isDonor ? '*' : <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--text3)', fontStyle: 'italic' }}>optional</span>}</label>
                <input className="form-input" name="emergencyContactName" value={clinical.emergencyContactName} onChange={handleClinicalChange} required={isDonor} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone {isDonor ? '*' : <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--text3)', fontStyle: 'italic' }}>optional</span>}</label>
                <input className="form-input" name="emergencyContactPhone" type="tel" value={clinical.emergencyContactPhone}
                  onChange={e => setClinical(p => ({ ...p, emergencyContactPhone: formatPKPhone(e.target.value) }))}
                  required={isDonor} placeholder="03XX-XXXXXXX" />
              </div>
              <div className="form-group">
                <label className="form-label">Relationship {isDonor ? '*' : <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--text3)', fontStyle: 'italic' }}>optional</span>}</label>
                <input className="form-input" name="emergencyContactRelation" value={clinical.emergencyContactRelation} onChange={handleClinicalChange} placeholder="e.g. Father, Spouse, Sibling" required={isDonor} />
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
                  <input className="form-input" type="number" name="urgencyScore" value={clinical.urgencyScore} min="1" max="10"
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setClinical(p => ({ ...p, urgencyScore: isNaN(v) ? '' : Math.min(10, Math.max(1, v)) }));
                    }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Primary Diagnosis <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--text3)', fontStyle: 'italic' }}>optional</span></label>
                <input className="form-input" name="diagnosis" value={clinical.diagnosis} onChange={handleClinicalChange} placeholder="e.g. End-Stage Renal Disease (ESRD)" />
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

          <CnicDocCard
            uploadedFront={documents.cnic_front}
            uploadedBack={documents.cnic_back}
            onUpload={handleDocUpload}
            onRemove={handleDocRemove}
          />
          {Object.entries(docConfig).filter(([key]) => key !== 'cnic_front' && key !== 'cnic_back').map(([key, config]) => (
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
                const selected = preferredHospitalId == h.id;
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
            ✓ Selected hospital: {approvedHospitals.find(h => h.id == preferredHospitalId)?.hospitalName || 'None'}
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {currentStep > 1 && (
        <div className="card" style={{ marginTop: '16px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <button onClick={goBack} className="btn btn-ghost" disabled={(isResubmit && currentStep === 2) || (!isResubmit && currentStep === 1)}>
            ← Back
          </button>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Step {currentStep} of {totalSteps}</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {currentStep === 4 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => generateRegistrationPDF({
                  ...user,
                  ...clinical,
                  preferredHospitalName: approvedHospitals.find(h => h.id == preferredHospitalId)?.hospitalName || user.preferredHospitalName,
                })}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Report
              </button>
            )}
            <button onClick={goNext} className="btn btn-primary" disabled={submitting}>
              {currentStep === 4
                ? (submitting ? 'Submitting...' : (isResubmit ? '📤 Resubmit to Hospital' : '📤 Submit to Hospital'))
                : 'Next →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DonorRecipientWizard;
