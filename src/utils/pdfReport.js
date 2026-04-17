export const generateRegistrationPDF = (user) => {
  const isDonor = user.role === 'donor';
  const title = isDonor ? 'Organ Donor Registration Report' : 'Organ Recipient Registration Report';
  const today = new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });

  const row = (label, value) =>
    value != null && value !== '' && value !== null
      ? `<tr><td class="label">${label}</td><td class="value">${value}</td></tr>`
      : '';

  const section = (heading, rows) => {
    const content = rows.filter(Boolean).join('');
    if (!content) return '';
    return `
      <div class="section">
        <div class="section-title">${heading}</div>
        <table class="info-table">${content}</table>
      </div>`;
  };

  const docs = (user.uploadedDocuments || []);
  const docRows = docs.length
    ? docs.map(d => `<li>${d.name || d.documentType || 'Document'} <span class="doc-date">${d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString('en-PK') : ''}</span></li>`).join('')
    : '<li>No documents on record</li>';

  const pledgedOrgans = Array.isArray(user.pledgedOrgans)
    ? user.pledgedOrgans.join(', ')
    : (user.pledgedOrgans || '—');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; padding: 0; }
  @page { size: A4; margin: 20mm 15mm; }
  @media print { body { padding: 0; } .no-print { display: none; } }

  .header { background: linear-gradient(135deg, #1a5c9e 0%, #0eb07a 100%); color: #fff; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between; }
  .header-logo { font-size: 11px; opacity: .8; line-height: 1.5; }
  .header-title h1 { font-size: 18px; font-weight: 700; }
  .header-title p { font-size: 11px; opacity: .85; margin-top: 3px; }
  .header-badge { background: rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 14px; text-align: center; font-size: 11px; }
  .header-badge strong { font-size: 15px; display: block; }

  .body { padding: 24px 32px; }

  .meta-bar { display: flex; gap: 16px; background: #f4f7fb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 11px; color: #555; }
  .meta-bar span { font-weight: 600; color: #1a5c9e; margin-left: 4px; }

  .section { margin-bottom: 18px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #1a5c9e; border-bottom: 2px solid #e2e6ed; padding-bottom: 5px; margin-bottom: 8px; }

  .info-table { width: 100%; border-collapse: collapse; }
  .info-table td { padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #f0f0f0; }
  .info-table .label { width: 36%; color: #666; font-weight: 500; }
  .info-table .value { color: #1a1a2e; font-weight: 600; }

  .doc-list { list-style: none; padding: 0; }
  .doc-list li { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 8px; }
  .doc-list li::before { content: "✓"; color: #0eb07a; font-weight: 700; }
  .doc-date { color: #999; font-size: 10px; margin-left: auto; }

  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
  .status-submitted { background: #dbeafe; color: #1e40af; }
  .status-approved { background: #d1fae5; color: #065f46; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-rejected { background: #fee2e2; color: #991b1b; }

  .footer { margin-top: 24px; border-top: 2px solid #e2e6ed; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
  .footer strong { color: #1a5c9e; }

  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #1a5c9e; color: #fff; border: none; padding: 12px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(26,92,158,.35); }
  .print-btn:hover { background: #1248a0; }
</style>
</head>
<body>

<div class="header">
  <div class="header-logo">
    Organ Donation Campaign<br/>Analysis Tool<br/>Pakistan
  </div>
  <div class="header-title">
    <h1>${title}</h1>
    <p>Official Registration Record — Confidential</p>
  </div>
  <div class="header-badge">
    <strong>${user.name || '—'}</strong>
    ${isDonor ? 'Organ Donor' : 'Organ Recipient'}
  </div>
</div>

<div class="body">

  <div class="meta-bar">
    <div>Report Date:<span>${today}</span></div>
    <div>Registration Status:<span>
      <span class="status-badge status-${user.status || 'pending'}">${(user.status || 'pending').replace(/_/g, ' ')}</span>
    </span></div>
    ${user.preferredHospitalName ? `<div>Hospital:<span>${user.preferredHospitalName}</span></div>` : ''}
    ${user.registrationDate ? `<div>Submitted:<span>${new Date(user.registrationDate).toLocaleDateString('en-PK')}</span></div>` : ''}
  </div>

  ${section('Personal Information', [
    row('Full Name', user.name),
    row('Email Address', user.email),
    row('CNIC Number', user.cnic),
    row('Date of Birth', user.dob),
    row('Age', user.age),
    row('Gender', user.gender),
    row('Phone Number', user.phone),
    row('Address', user.address),
  ])}

  ${section('Emergency Contact', [
    row('Contact Name', user.emergencyContactName),
    row('Relationship', user.emergencyContactRelation),
    row('Contact Phone', user.emergencyContactPhone),
  ])}

  ${isDonor ? section('Donor Details', [
    row('Blood Type', user.bloodType),
    row('Pledged Organs', pledgedOrgans),
    row('Donation Type', user.donationType),
    row('Next of Kin', user.nextOfKin),
    row('Family Informed', user.familyInformed ? 'Yes' : 'No'),
    row('Consent Signed', user.consentSigned ? 'Yes — Digitally Signed' : 'Not yet'),
  ]) : section('Recipient Details', [
    row('Organ Needed', user.organNeeded),
    row('Primary Diagnosis', user.diagnosis),
    row('Urgency Score', user.urgencyScore ? `${user.urgencyScore} / 10` : null),
    row('Survival Estimate', user.survivalEstimate),
    row('Blood Type', user.bloodType),
    row('Treating Doctor', user.treatingDoctor),
    row('Current Hospital', user.currentHospital),
    row('Days on Waitlist', user.daysOnWaitlist),
    row('Consent Signed', user.consentSigned ? 'Yes — Digitally Signed' : 'Not yet'),
  ])}

  ${section('Medical Background', [
    row('Medical History', user.medicalHistory),
    row('Current Medications', user.currentMedications),
  ])}

  ${section('Hospital Assignment', [
    row('Preferred Hospital', user.preferredHospitalName),
    row('Hospital ID', user.preferredHospitalId),
    row('Review Notes', user.hospitalReviewNotes),
  ])}

  <div class="section">
    <div class="section-title">Uploaded Documents (${docs.length})</div>
    <ul class="doc-list">${docRows}</ul>
  </div>

</div>

<div class="footer" style="padding: 0 32px 20px;">
  <div><strong>Organ Donation Campaign Analysis Tool</strong> — Confidential Medical Record</div>
  <div>Generated: ${today} | Ref: ${user.id || user.email}</div>
</div>

<button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF / Print</button>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site to download the report.');
    return;
  }
  win.document.write(html);
  win.document.close();
};
