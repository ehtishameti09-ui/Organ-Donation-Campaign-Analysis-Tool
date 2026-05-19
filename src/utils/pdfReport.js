import { ageLabelFromDOB } from './auth.js';

export const generateRegistrationPDF = (user) => {
  const isDonor = user.role === 'donor';
  const title = isDonor ? 'Organ Donor Registration Report' : 'Organ Recipient Registration Report';
  const today = new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
  const uniqueId = user.uniqueId || user.unique_id || `${isDonor ? 'DON' : 'REC'}-${new Date().getFullYear()}-${String(user.id || '0').padStart(4, '0')}`;

  const row = (label, value) =>
    value != null && value !== '' && value !== null
      ? `<tr><td class="label">${label}</td><td class="value">${value}</td></tr>`
      : '';

  const section = (icon, heading, rows) => {
    const content = rows.filter(Boolean).join('');
    if (!content) return '';
    return `
      <div class="section">
        <div class="section-title"><span class="section-icon">${icon}</span>${heading}</div>
        <table class="info-table">${content}</table>
      </div>`;
  };

  // Parent/Guardian recipient account: the account holder is the guardian, but
  // the clinical record (CNIC/DOB/gender/blood) belongs to the CHILD patient.
  const isGuardian = !isDonor && user.accountType === 'guardian';
  const patientName = isGuardian ? (user.patientName || '—') : (user.name || '—');

  // Friendly age: infants under 1 year show as months/days, not "0 years".
  const displayAge = ageLabelFromDOB(user.dob)
    || (user.age != null && user.age !== '' ? `${user.age} year${Number(user.age) === 1 ? '' : 's'}` : null);

  const docs = (user.uploadedDocuments || []);

  const pledgedOrgans = Array.isArray(user.pledgedOrgans)
    ? user.pledgedOrgans.join(' &nbsp;·&nbsp; ')
    : (user.pledgedOrgans || '—');

  const statusColor = {
    submitted: { bg: '#dbeafe', fg: '#1e40af', label: 'Submitted' },
    approved:  { bg: '#dcfce7', fg: '#166534', label: 'Approved' },
    pending:   { bg: '#fef9c3', fg: '#854d0e', label: 'Pending' },
    rejected:  { bg: '#fee2e2', fg: '#991b1b', label: 'Rejected' },
    info_requested: { bg: '#ffedd5', fg: '#9a3412', label: 'Info Requested' },
    registered: { bg: '#f1f5f9', fg: '#475569', label: 'Registered' },
  }[user.status || 'pending'] || { bg: '#f1f5f9', fg: '#475569', label: user.status || 'Pending' };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet"/>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  /* Force browsers to print background colors / gradients */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  html, body {
    font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 12.5px;
    color: #1e293b;
    background: #eef2f7;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  @page {
    size: A4;
    margin: 8mm;
  }
  @media print {
    html, body { background: #fff; }
    .no-print { display: none !important; }
    .page {
      box-shadow: none;
      margin: 0 !important;
      border-radius: 0;
      max-width: 100%;
      page-break-inside: avoid;
    }
    .section { page-break-inside: avoid; }
    .sig-block { page-break-inside: avoid; }
  }

  /* ── PAGE WRAPPER ── */
  .page {
    max-width: 820px;
    margin: 28px auto;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 10px 45px rgba(15,52,96,.18);
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  /* ── HEADER ── */
  .header {
    background: linear-gradient(135deg, #0f3460 0%, #1a5c9e 55%, #0eb07a 100%);
    padding: 0;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 260px; height: 260px;
    border-radius: 50%;
    background: rgba(255,255,255,.06);
  }
  .header::after {
    content: '';
    position: absolute;
    bottom: -40px; left: 30%;
    width: 180px; height: 180px;
    border-radius: 50%;
    background: rgba(255,255,255,.04);
  }
  .header-inner {
    position: relative;
    z-index: 1;
    padding: 28px 36px 24px;
    display: flex;
    align-items: flex-start;
    gap: 20px;
  }
  .header-seal {
    width: 62px; height: 62px;
    border-radius: 50%;
    background: rgba(255,255,255,.18);
    border: 2px solid rgba(255,255,255,.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 26px;
    flex-shrink: 0;
  }
  .header-text { flex: 1; }
  .header-org {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(255,255,255,.7);
    margin-bottom: 4px;
  }
  .header-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    line-height: 1.2;
    margin-bottom: 4px;
  }
  .header-sub {
    font-size: 11px;
    color: rgba(255,255,255,.65);
    letter-spacing: .3px;
  }
  .header-right {
    text-align: right;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 7px;
    padding-left: 18px;
    border-left: 1px solid rgba(255,255,255,.22);
  }
  .header-name-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(255,255,255,.6);
  }
  .header-name {
    font-size: 19px;
    font-weight: 700;
    color: #fff;
    line-height: 1.15;
    max-width: 230px;
    word-break: break-word;
  }
  .header-role-badge {
    display: inline-block;
    background: rgba(255,255,255,.22);
    border: 1px solid rgba(255,255,255,.4);
    border-radius: 20px;
    padding: 4px 14px;
    font-size: 10.5px;
    font-weight: 600;
    color: #fff;
    letter-spacing: .4px;
    white-space: nowrap;
  }

  /* ── WATERMARK STRIP ── */
  .watermark-strip {
    background: rgba(255,255,255,.1);
    border-top: 1px solid rgba(255,255,255,.15);
    padding: 7px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9.5px;
    color: rgba(255,255,255,.6);
    letter-spacing: .5px;
    position: relative; z-index: 1;
  }

  /* ── META BAR ── */
  .meta-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #e8edf3;
    background: #f8fafc;
  }
  .meta-item {
    flex: 1;
    padding: 12px 18px;
    border-right: 1px solid #e8edf3;
  }
  .meta-item:last-child { border-right: none; }
  .meta-label {
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .8px;
    color: #94a3b8;
    margin-bottom: 3px;
  }
  .meta-value {
    font-size: 12px;
    font-weight: 700;
    color: #1e293b;
  }
  .status-pill {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .2px;
    background: ${statusColor.bg};
    color: ${statusColor.fg};
  }

  /* ── BODY ── */
  .body { padding: 30px 36px; }

  /* ── SECTIONS ── */
  .section { margin-bottom: 24px; }
  .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #1a5c9e;
    padding-bottom: 9px;
    border-bottom: 2px solid #e2e8f0;
    margin-bottom: 12px;
    position: relative;
  }
  .section-title::before {
    content: '';
    position: absolute;
    left: 0; bottom: -2px;
    width: 60px; height: 2px;
    background: linear-gradient(90deg, #1a5c9e, #0eb07a);
  }
  .section-icon {
    width: 26px; height: 26px;
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
    border: 1px solid #dbeafe;
  }

  /* ── TABLE ── */
  .info-table {
    width: 100%;
    border-collapse: collapse;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }
  .info-table tr:nth-child(even) td { background: #f8fafc; }
  .info-table tr:hover td { background: #f1f5f9; }
  .info-table td {
    padding: 9px 14px;
    vertical-align: top;
    border-bottom: 1px solid #f1f5f9;
    line-height: 1.55;
  }
  .info-table tr:last-child td { border-bottom: none; }
  .info-table .label {
    width: 36%;
    color: #64748b;
    font-weight: 500;
    font-size: 11.5px;
    background: #fafbfc !important;
    border-right: 1px solid #f1f5f9;
  }
  .info-table .value {
    color: #0f172a;
    font-weight: 600;
    font-size: 12.5px;
  }

  /* ── DOCUMENTS ── */
  .doc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .doc-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    background: linear-gradient(180deg, #ffffff, #f8fafc);
    border: 1px solid #e2e8f0;
    font-size: 11.5px;
  }
  .doc-check {
    width: 22px; height: 22px;
    background: #dcfce7;
    color: #166534;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    border: 1.5px solid #86efac;
  }
  .doc-name {
    flex: 1;
    color: #1e293b;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .doc-date { color: #94a3b8; font-size: 10.5px; flex-shrink: 0; }

  /* ── SIGNATURE BLOCK ── */
  .sig-block {
    margin-top: 28px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  .sig-box {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 18px;
    background: linear-gradient(180deg, #ffffff, #f8fafc);
    min-height: 105px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .sig-label {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .9px;
    color: #1a5c9e;
  }
  .sig-line {
    border-top: 1.5px solid #cbd5e1;
    padding-top: 6px;
    font-size: 10px;
    color: #64748b;
  }

  /* ── FOOTER ── */
  .footer {
    background: linear-gradient(180deg, #f8fafc, #eef2f7);
    border-top: 2px solid #e2e8f0;
    padding: 16px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: #64748b;
  }
  .footer-left strong {
    color: #1a5c9e;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .3px;
  }
  .footer-right { text-align: right; line-height: 1.7; }
  .footer-right strong { color: #0eb07a; }

  /* ── PRINT BUTTON ── */
  .print-fab {
    position: fixed;
    bottom: 28px; right: 28px;
    background: linear-gradient(135deg, #1a5c9e, #0eb07a);
    color: #fff;
    border: none;
    padding: 13px 24px;
    border-radius: 50px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(26,92,158,.4);
    display: flex; align-items: center; gap: 8px;
    letter-spacing: .2px;
    transition: transform .15s, box-shadow .15s;
  }
  .print-fab:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 28px rgba(26,92,158,.45);
  }
</style>
</head>
<body>

<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-inner">
      <div class="header-seal">${isDonor ? '❤️' : '🏥'}</div>
      <div class="header-text">
        <div class="header-org">Organ Donation Campaign Analysis Tool &nbsp;·&nbsp; ODCAT</div>
        <div class="header-title">${title}</div>
        <div class="header-sub">Registration Record &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; For verification at a HOTA-authorized hospital</div>
      </div>
      <div class="header-right">
        <div class="header-name-label">${isDonor ? 'Donor' : 'Patient'}</div>
        <div class="header-name">${patientName}</div>
        <div class="header-role-badge">${isDonor ? 'Registered Organ Donor' : (isGuardian ? 'Transplant Recipient · Minor' : 'Transplant Recipient')}</div>
      </div>
    </div>
    <div class="watermark-strip">
      <span>FRAMEWORK REFERENCE: THOTA 2010</span>
      <span>GENERATED ${today}</span>
    </div>
  </div>

  <!-- META BAR -->
  <div>
    <!-- Unique ID gets its own full-width row so it can never wrap -->
    <div style="background:#0f3460;display:flex;align-items:center;gap:10px;padding:10px 22px;white-space:nowrap;">
      <span style="font-size:9.5px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.6);">Unique ID</span>
      <span style="font-size:14px;font-weight:700;font-family:monospace;letter-spacing:1px;color:#fff;">${uniqueId}</span>
    </div>
    <div class="meta-bar">
      <div class="meta-item">
        <div class="meta-label">Report Date</div>
        <div class="meta-value">${today}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Registration Status</div>
        <div class="meta-value"><span class="status-pill">${statusColor.label}</span></div>
      </div>
    </div>
  </div>

  <!-- BODY -->
  <div class="body">

    ${isGuardian ? `
    ${section('👨‍👩‍👧', 'Guardian / Account Holder', [
      row('Guardian Name', user.guardianName || user.name),
      row('Relationship to Patient', user.guardianRelationship),
      row('Guardian CNIC', user.guardianCnic),
      row('Guardian Phone', user.guardianPhone || user.phone),
      row('Account Email', user.email),
    ])}

    ${section('🧒', 'Patient (Child) Information', [
      row('Patient Name', user.patientName),
      row("Child's CNIC / B-Form No.", user.cnic),
      row('Date of Birth', user.dob),
      row('Age', displayAge),
      row('Gender', user.gender),
      row('Residential Address', user.address),
    ])}
    ` : `
    ${section('👤', 'Personal Information', [
      row('Full Name', user.name),
      row('Email Address', user.email),
      row('CNIC Number', user.cnic),
      row('Date of Birth', user.dob),
      row('Age', displayAge),
      row('Gender', user.gender),
      row('Phone Number', user.phone),
      row('Residential Address', user.address),
    ])}
    `}

    ${section('🚨', 'Emergency Contact', [
      row('Contact Name', user.emergencyContactName),
      row('Relationship', user.emergencyContactRelation),
      row('Contact Phone', user.emergencyContactPhone),
    ])}

    ${isDonor ? section('❤️', 'Donor Clinical Details', [
      row('Blood Type', user.bloodType),
      row('Pledged Organs', pledgedOrgans),
      row('Donation Type', user.donationType ? user.donationType.charAt(0).toUpperCase() + user.donationType.slice(1) : null),
      row('Next of Kin', user.nextOfKin),
      row('Family Informed', user.familyInformed ? 'Yes — Family is aware and supportive' : 'No'),
      row('Consent Acknowledged', user.consentSigned ? '✓ Acknowledged in app' : 'Pending'),
    ]) : section('🩺', 'Recipient Clinical Details', [
      row('Organ Needed', user.organNeeded ? user.organNeeded.charAt(0).toUpperCase() + user.organNeeded.slice(1) : null),
      row('Primary Diagnosis', user.diagnosis),
      row('Urgency Score', user.urgencyScore ? `${user.urgencyScore} / 10` : null),
      row('Survival Estimate', user.survivalEstimate),
      row('Blood Type', user.bloodType),
      row('Treating Doctor', user.treatingDoctor),
      row('Currently Treated At', user.currentHospital),
      row('Days on Waitlist', user.daysOnWaitlist ? `${user.daysOnWaitlist} days` : null),
      row('Consent Acknowledged', user.consentSigned ? '✓ Acknowledged in app' : 'Pending'),
    ])}

    ${section('🩻', 'Medical Background', [
      row('Medical History', user.medicalHistory),
      row('Current Medications', user.currentMedications),
    ])}

    ${section('🏥', 'Submitted To', [
      row('Reviewing Hospital', user.preferredHospitalName),
      row('Hospital Review Notes', user.hospitalReviewNotes),
    ])}

    <!-- SIGNATURE BLOCK -->
    <div class="sig-block">
      <div class="sig-box">
        <div class="sig-label">${isGuardian ? 'Guardian Signature' : 'Applicant Signature'}</div>
        <div class="sig-line">${(isGuardian ? (user.guardianName || user.name) : user.name) || ''}${isGuardian ? ` (on behalf of ${user.patientName || 'the patient'})` : ''} &nbsp;&nbsp;&nbsp;&nbsp; Date: ${today}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">Hospital Verification Officer</div>
        <div class="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date: ___________</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">Official Stamp</div>
        <div style="height:36px;border:1px dashed #cbd5e1;border-radius:6px;margin-top:4px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:9px;color:#cbd5e1;letter-spacing:.5px;">HOSPITAL STAMP</span>
        </div>
      </div>
    </div>

  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-left">
      <strong>Organ Donation Campaign Analysis Tool (ODCAT)</strong><br/>
      Auto-generated record. Not a Government of Pakistan or HOTA document — final
      verification occurs at a HOTA-authorized hospital.
    </div>
  </div>

</div>

<button class="print-fab no-print" onclick="window.print()">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  Save as PDF / Print
</button>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=950,height=780');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site to download the report.');
    return;
  }
  win.document.write(html);
  win.document.close();
};

/**
 * Printable "Declaration of Intent" — the version a user prints, signs by hand with
 * witnesses, and takes to a HOTA-authorized hospital for the actual legal process.
 * This is deliberately framed as a pre-registration declaration, NOT a legal consent
 * instrument, with a non-affiliation disclaimer.
 */
export const generateConsentDeclarationPDF = ({ userType, name, cnic }) => {
  const isDonor = userType === 'donor';
  const today = new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
  const refNo = `ODCAT/${(userType || 'USER').toUpperCase()}/${Date.now().toString().slice(-8)}`;
  const safeName = (name || '').replace(/</g, '&lt;');
  const safeCnic = (cnic || '').replace(/</g, '&lt;');

  const intentList = isDonor ? `
    <li>Be contacted to begin the formal, in-person donation process through an authorized hospital.</li>
    <li>Undergo the medical examination, blood tests, tissue typing and HLA cross-matching required to establish suitability, carried out by authorized medical practitioners.</li>
    <li>Donate only for therapeutic purposes and never for commercial sale or trade (an offence under Section 6 of THOTA 2010).</li>
    <li>Allow my anonymized medical information to be shared with authorized transplant coordinators and HOTA-registered hospitals for matching.</li>
    <li>Have my family / next of kin involved in the formal donation decision as required by law.</li>` : `
    <li>Provide accurate, complete and truthful medical information for case evaluation and matching.</li>
    <li>Undergo required medical evaluations (blood tests, tissue typing, organ-function and psychological assessments) through an authorized hospital.</li>
    <li>Be matched on medical grounds only — urgency, compatibility, waiting time and geography — never on financial, social, ethnic, religious or political grounds.</li>
    <li>Receive an organ only through lawful means and never through commercial purchase (an offence under Section 6 of THOTA 2010).</li>
    <li>Follow all post-transplant medical instructions and report outcomes to the treating hospital.</li>`;

  const docTitle = isDonor ? 'Organ &amp; Tissue Donation' : 'Transplant Recipient Pre-Registration';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>ODCAT — ${isDonor ? 'Organ & Tissue Donation' : 'Transplant Recipient'} Declaration of Intent</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  :root{--ink:#1c2620;--green:#014421;--green2:#0c6b3a;--gold:#b08a3e;--muted:#5b6660;--line:#cdd5cf}
  body{font-family:'Source Serif 4',Georgia,'Times New Roman',serif;color:var(--ink);background:#e7eae8;padding:32px 16px;line-height:1.7;font-size:13.5px}
  .sheet{max-width:820px;margin:0 auto;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.14);position:relative}
  /* double rule border for a formal certificate feel */
  .frame{position:absolute;inset:14px;border:1.5px solid var(--green);pointer-events:none}
  .frame::after{content:"";position:absolute;inset:5px;border:0.75px solid var(--gold)}
  /* security watermark so it can never be mistaken for an official instrument */
  .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}
  .wm span{font-family:'Inter',sans-serif;font-size:74px;font-weight:800;color:rgba(1,68,33,.05);letter-spacing:6px;transform:rotate(-32deg);white-space:nowrap;text-align:center;line-height:1.25}
  .inner{position:relative;padding:48px 56px 56px}
  /* masthead */
  .crest{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,var(--green) 0%,var(--green2) 100%);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 6px rgba(1,68,33,.3)}
  .crest svg{width:28px;height:28px}
  .mast{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:2px solid var(--green)}
  .mast .org{font-family:'Inter',sans-serif}
  .mast .org .l1{font-size:15px;font-weight:700;color:var(--green);letter-spacing:.3px}
  .mast .org .l2{font-size:10.5px;font-weight:600;color:var(--muted);letter-spacing:2.5px;text-transform:uppercase;margin-top:3px}
  .mast .seal{margin-left:auto;font-family:'Inter',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:1.5px;color:var(--gold);border:1px solid var(--gold);border-radius:4px;padding:6px 12px;line-height:1.2;white-space:nowrap}
  .title{text-align:center;margin:26px 0 4px}
  .title h1{font-size:23px;font-weight:700;color:var(--ink);letter-spacing:.2px}
  .title .rule{width:80px;height:3px;background:var(--gold);margin:12px auto 8px;border-radius:2px}
  .title .sub{font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);letter-spacing:.4px}
  /* reference strip */
  .ref{display:grid;grid-template-columns:1fr 1fr;gap:2px 28px;font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);background:#f5f8f6;border:1px solid var(--line);border-radius:6px;padding:12px 18px;margin:24px 0 8px}
  .ref div b{color:var(--ink);font-weight:600}
  .disc{font-family:'Inter',sans-serif;background:#fdf6e7;border:1px solid #e6cf95;color:#6b531f;font-size:11px;padding:13px 16px;border-radius:6px;line-height:1.65;margin-bottom:6px}
  .disc b{color:#4a3a12}
  h2{font-family:'Inter',sans-serif;font-size:12.5px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:1px;margin:24px 0 9px;padding-bottom:5px;border-bottom:1px solid var(--line)}
  p{margin:0 0 11px;text-align:justify}
  ol,ul{margin:0 0 11px 24px}
  li{margin-bottom:6px;text-align:justify}
  .prefill{font-weight:700;color:var(--green);border-bottom:1px solid var(--green);padding:0 4px}
  .notice{font-family:'Inter',sans-serif;background:#fdeeee;border:1px solid #e7b9b9;color:#8a2c2c;font-size:11px;padding:12px 14px;border-radius:6px;margin-top:10px;line-height:1.6}
  .sign{margin-top:30px;padding-top:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:34px 48px;margin-top:24px}
  .fld .ln{border-bottom:1.4px solid var(--ink);height:34px}
  .fld .cap{font-family:'Inter',sans-serif;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-top:7px}
  .thumb{border:1.4px dashed var(--muted);border-radius:4px;height:84px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px}
  .thumb .cap{font-family:'Inter',sans-serif;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
  .steps{font-family:'Inter',sans-serif;background:#eef7f1;border:1px solid #b8dcc6;border-left:4px solid var(--green);border-radius:6px;padding:15px 18px;margin-top:26px;font-size:11.5px;color:#1d4d33;line-height:1.85}
  .steps b{display:block;margin-bottom:7px;font-size:12px;text-transform:uppercase;letter-spacing:.6px}
  .steps .n{display:inline-block;width:18px;height:18px;background:var(--green);color:#fff;border-radius:50%;text-align:center;line-height:18px;font-size:10px;font-weight:700;margin-right:7px}
  .foot{font-family:'Inter',sans-serif;text-align:center;border-top:1px solid var(--line);margin-top:26px;padding-top:14px}
  .foot-meta{font-size:9.5px;color:#9aa39d;letter-spacing:.3px}
  .foot-disc{font-size:10px;color:var(--muted);font-weight:600;letter-spacing:.4px;margin-top:6px}
  .print-fab{position:fixed;bottom:26px;right:26px;background:var(--green);color:#fff;border:none;border-radius:999px;padding:13px 22px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:9px;box-shadow:0 6px 18px rgba(0,0,0,.28)}
  .print-fab:hover{background:var(--green2)}
  @media print{
    body{background:#fff;padding:0;font-size:12px}
    .sheet{box-shadow:none;max-width:none}
    .frame{inset:0}
    .no-print{display:none!important}
    @page{margin:12mm}
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="frame"></div>
  <div class="wm"><span>ODCAT&nbsp;·&nbsp;PRE-REGISTRATION<br/>NOT A LEGAL INSTRUMENT</span></div>
  <div class="inner">

    <div class="mast">
      <div class="crest">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 21s-7-4.35-9.5-9C1 9 2.5 4.5 7 4.5c2.2 0 3.6 1.2 5 3 1.4-1.8 2.8-3 5-3 4.5 0 6 4.5 4.5 7.5C19 16.65 12 21 12 21z"/>
        </svg>
      </div>
      <div class="org">
        <div class="l1">Organ Donation Campaign Analysis Tool</div>
        <div class="l2">ODCAT · Academic Healthcare Platform</div>
      </div>
      <div class="seal">PRE-REGISTRATION</div>
    </div>

    <div class="title">
      <h1>Declaration of Intent</h1>
      <div class="rule"></div>
      <div class="sub">${docTitle} &nbsp;·&nbsp; Framework reference: THOTA 2010</div>
    </div>

    <div class="ref">
      <div><b>Reference No.</b> &nbsp;${refNo}</div>
      <div><b>Date</b> &nbsp;${today}</div>
      <div><b>Framework</b> &nbsp;THOTA 2010 (administered by HOTA)</div>
      <div><b>Platform</b> &nbsp;ODCAT — academic / non-governmental</div>
    </div>

    <div class="disc">
      <b>This is a declaration of intent for platform pre-registration — not a legal consent instrument.</b>
      Legally binding consent under THOTA 2010 is executed <b>in person at a HOTA-authorized hospital</b>, before
      witnesses and the hospital Evaluation Committee. ODCAT is an academic platform and is <b>not affiliated with,
      or endorsed by, HOTA or the Government of Pakistan</b>. This document does not replace the official hospital paperwork.
    </div>

    <h2>Article I — Declaration of Identity</h2>
    <p>I, <span class="prefill">${safeName || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>${safeCnic ? `, holding CNIC <span class="prefill">${safeCnic}</span>` : ''},
    make this voluntary declaration of my own free will, in a sound state of mind, and without any coercion,
    fraud, misrepresentation or undue influence, for the purpose of pre-registering my intent on the ODCAT platform.</p>

    <h2>Article II — ${isDonor ? 'Intent to Donate' : 'Intent to Register as Recipient'}</h2>
    <p>Consistent with the principles of the Transplantation of Human Organs and Tissues Act, 2010 (THOTA),
    I express my <b>intent</b> ${isDonor ? 'to donate my organs and/or tissues for medical transplantation to help save human lives'
      : 'to be pre-registered as a prospective transplant recipient on the ODCAT platform'}. I understand that
    legally effective consent will only be given later, in person, at a HOTA-authorized hospital.</p>
    <p>By pre-registering, I indicate my willingness to:</p>
    <ol>${intentList}</ol>

    <h2>Article III — Rights and Withdrawal</h2>
    <ul>
      <li>I may withdraw this pre-registration at any time, without giving a reason.</li>
      <li>Withdrawal will not affect any other medical treatment I may receive.</li>
      <li>My information will be handled in line with applicable Pakistani data-protection law.</li>
      <li>${isDonor ? 'My family / next of kin will be involved in the formal in-person donation decision.'
        : 'Pre-registration does not place me on any official waiting list and does not guarantee an organ.'}</li>
      <li>Providing false information may have legal consequences under THOTA 2010.</li>
    </ul>

    <h2>Article IV — Religious &amp; Ethical Note</h2>
    <p>The Council of Islamic Ideology (CII) of Pakistan has held organ donation and transplantation to be
    permissible (<i>mubah</i>) under Islamic Sharia where it is needed to save a human life and where no commercial
    transaction is involved. Provided for awareness only — not religious or legal advice.</p>

    <div class="notice"><b>⚠ Notice —</b> Commercial dealing in human organs is a punishable offence under
    Section 6 of THOTA 2010 (imprisonment up to ten years and a fine up to one million Pakistani Rupees).</div>

    <div class="sign">
      <h2>Article V — Execution by Hand</h2>
      <div class="grid">
        <div class="fld"><div class="ln"></div><div class="cap">Declarant — signature &amp; date</div></div>
        <div class="fld"><div class="ln"></div><div class="cap">Declarant — full name (block letters)</div></div>
        <div class="fld"><div class="ln"></div><div class="cap">CNIC number</div></div>
        <div class="fld"><div class="thumb"><span class="cap">Left thumb impression</span></div></div>
        <div class="fld"><div class="ln"></div><div class="cap">Witness 1 — signature, name &amp; CNIC</div></div>
        <div class="fld"><div class="ln"></div><div class="cap">Witness 2 — signature, name &amp; CNIC</div></div>
      </div>
    </div>

    <div class="steps">
      <b>Making this legally effective</b>
      <span class="n">1</span> Print and sign this declaration by hand with two witnesses.<br/>
      <span class="n">2</span> Take it, with your original CNIC and medical records, to a HOTA-authorized transplant hospital.<br/>
      <span class="n">3</span> Complete the hospital's official consent forms and Evaluation Committee process — that is the step that carries legal standing under THOTA 2010.
    </div>

    <div class="foot">
      <div class="foot-meta">Generated by ODCAT (academic project) on ${today} &nbsp;·&nbsp; Reference ${refNo}</div>
      <div class="foot-disc">This is not a Government of Pakistan or HOTA document.</div>
    </div>
  </div>
</div>

<button class="print-fab no-print" onclick="window.print()">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  Save as PDF / Print
</button>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=820');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site to download the declaration.');
    return;
  }
  win.document.write(html);
  win.document.close();
};
