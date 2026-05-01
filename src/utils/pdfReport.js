export const generateRegistrationPDF = (user) => {
  const isDonor = user.role === 'donor';
  const title = isDonor ? 'Organ Donor Registration Report' : 'Organ Recipient Registration Report';
  const today = new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
  const refId = (user.id || user.email || 'N/A').toString().toUpperCase().slice(0, 12);

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
  }
  .header-name {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 3px;
  }
  .header-role-badge {
    display: inline-block;
    background: rgba(255,255,255,.2);
    border: 1px solid rgba(255,255,255,.35);
    border-radius: 20px;
    padding: 3px 12px;
    font-size: 10.5px;
    font-weight: 600;
    color: #fff;
    letter-spacing: .3px;
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
        <div class="header-org">Government of Pakistan &nbsp;·&nbsp; Organ Donation Campaign Analysis Tool</div>
        <div class="header-title">${title}</div>
        <div class="header-sub">Official Registration Record &nbsp;·&nbsp; Confidential &amp; Legally Binding</div>
      </div>
      <div class="header-right">
        <div class="header-name">${user.name || '—'}</div>
        <div class="header-role-badge">${isDonor ? 'Registered Organ Donor' : 'Transplant Recipient'}</div>
      </div>
    </div>
    <div class="watermark-strip">
      <span>REF: ${refId}</span>
      <span>TRANSPLANTATION OF HUMAN ORGANS &amp; TISSUES ACT, 2010 (THOTA)</span>
      <span>GENERATED: ${today}</span>
    </div>
  </div>

  <!-- META BAR -->
  <div class="meta-bar">
    <div class="meta-item">
      <div class="meta-label">Report Date</div>
      <div class="meta-value">${today}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Registration Status</div>
      <div class="meta-value"><span class="status-pill">${statusColor.label}</span></div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Assigned Hospital</div>
      <div class="meta-value">${user.preferredHospitalName || '—'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Documents on File</div>
      <div class="meta-value">${docs.length}</div>
    </div>
  </div>

  <!-- BODY -->
  <div class="body">

    ${section('👤', 'Personal Information', [
      row('Full Name', user.name),
      row('Email Address', user.email),
      row('CNIC Number', user.cnic),
      row('Date of Birth', user.dob),
      row('Age', user.age ? `${user.age} years` : null),
      row('Gender', user.gender),
      row('Phone Number', user.phone),
      row('Residential Address', user.address),
    ])}

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
      row('Consent Signed', user.consentSigned ? '✓ Yes — Digitally Signed & Witnessed' : 'Pending'),
    ]) : section('🩺', 'Recipient Clinical Details', [
      row('Organ Needed', user.organNeeded ? user.organNeeded.charAt(0).toUpperCase() + user.organNeeded.slice(1) : null),
      row('Primary Diagnosis', user.diagnosis),
      row('Urgency Score', user.urgencyScore ? `${user.urgencyScore} / 10` : null),
      row('Survival Estimate', user.survivalEstimate),
      row('Blood Type', user.bloodType),
      row('Treating Doctor', user.treatingDoctor),
      row('Currently Treated At', user.currentHospital),
      row('Days on Waitlist', user.daysOnWaitlist ? `${user.daysOnWaitlist} days` : null),
      row('Consent Signed', user.consentSigned ? '✓ Yes — Digitally Signed & Witnessed' : 'Pending'),
    ])}

    ${section('🩻', 'Medical Background', [
      row('Medical History', user.medicalHistory),
      row('Current Medications', user.currentMedications),
    ])}

    ${section('🏥', 'Hospital Assignment', [
      row('Preferred Hospital', user.preferredHospitalName),
      row('Hospital Reference ID', user.preferredHospitalId),
      row('Hospital Review Notes', user.hospitalReviewNotes),
    ])}

    <!-- SIGNATURE BLOCK -->
    <div class="sig-block">
      <div class="sig-box">
        <div class="sig-label">Applicant Signature</div>
        <div class="sig-line">${user.name || ''} &nbsp;&nbsp;&nbsp;&nbsp; Date: ${today}</div>
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
      <strong>Organ Donation Campaign Analysis Tool — Pakistan</strong><br/>
      This document is auto-generated and is legally valid under THOTA 2010.
    </div>
    <div class="footer-right">
      Reference No: <strong>${refId}</strong><br/>
      Generated: <strong>${today}</strong>
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
