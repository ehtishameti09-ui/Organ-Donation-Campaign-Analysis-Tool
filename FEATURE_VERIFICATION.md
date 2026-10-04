# ODCAT Feature Implementation Verification

## Feature 1: Sample Document Modals + Enhanced Validation ✓
**Status: COMPLETED**

### Changes:
- Added `SampleDocumentModal` component in `DonorRecipientWizard.jsx` with templates for:
  - CNIC (green NADRA card style)
  - Medical Fitness Certificate (hospital letterhead)
  - Blood Type Lab Report (lab header format)
- Added "Sample Doc" button to `DocCard` component that opens modal
- Enhanced file validation:
  - MIME type checking (JPEG, PNG, WebP, GIF, PDF only)
  - Suspicious filename detection (warns on sample/test/template files)
- Register.jsx updated with suspicious filename warning

**Test Steps:**
1. Login as donor/recipient
2. Go to registration/resubmission wizard, Step 3 (Documents)
3. Click "Sample Doc" button on CNIC, Medical Certificate, or Blood Type Report
4. Sample document modal should display
5. Try uploading file named "sample_document.pdf" → should show warning
6. Upload valid PDF → should accept

---

## Feature 2: CNIC/Name Confirmation After Upload ✓
**Status: COMPLETED**

### Changes:
- Added state: `cnicConfirmed`, `cnicConfirmation`, `cnicError`
- Default `cnicConfirmed = true` in resubmit mode
- Inline confirmation widget appears after CNIC upload in Step 3
- Normalization logic strips dashes/spaces before comparing
- Confirmation required for form submission

**Test Steps:**
1. Login as donor/recipient
2. Fill clinical form with CNIC "12345-6789012-3"
3. Upload CNIC document in Step 3
4. Confirmation widget appears with input field
5. Enter "12345-6789012-3" → "Confirm" button → should mark as ✓ CNIC confirmed
6. If enter wrong number → shows error "doesn't match"
7. Validation prevents submission without confirmation

---

## Feature 3: Live Document Checklist ✓
**Status: COMPLETED**

### Changes:
- Added `DONOR_DOC_CHECKLIST` with correct keys:
  - cnic, medicalCertificate, bloodTypeReport, consentWitness
- Added `RECIPIENT_DOC_CHECKLIST`:
  - cnic, medicalReport, labReports, doctorReferral, insuranceProof
- Color-coded status: green (uploaded), red (required + missing), gray (optional + missing)
- Fetches fresh user data on render for real-time updates

**Test Steps:**
1. Login as donor/recipient
2. View Dashboard → "Documents Uploaded" card
3. Should show correct checklist with color-coded items
4. Upload documents → checklist updates in real-time
5. Verify count matches actual uploads

---

## Feature 4: Document View/Download + Access Control ✓
**Status: COMPLETED**

### Changes:
- Added `DocumentLightboxModal` component in `DonorManagement.jsx` and `RecipientManagement.jsx`
- Access control: hospitals only see docs if `selectedCase.preferredHospitalId === currentUser.id`
- If no access: shows "🔒 Documents only visible to assigned hospital"
- If access: shows document list with "View" buttons opening lightbox
- Lightbox features: View PDF/Image, Download, Open in New Tab

**Test Steps:**
1. Login as admin → DonorManagement → select any donor
2. Should see documents with "View" button
3. Click "View" → lightbox opens
4. Can see PDF/image, click "Download" → file downloads
5. Login as hospital → can only see docs for donors assigned to that hospital
6. Try to view unassigned donor → "Documents only visible" message shown

---

## Feature 5: Hospital Case Rejection Appeal System ✓
**Status: COMPLETED**

### Changes:
- New localStorage key: `odcat_case_appeals`
- Added functions in `auth.js`:
  - `submitHospitalCaseAppeal(caseUserId, appealText)`
  - `getHospitalCaseAppeals(hospitalId)`
  - `getUserCaseAppeals(caseUserId)`
  - `reviewHospitalCaseAppeal(appealId, decision, notes, reviewingHospitalUserId)`
- Dashboard detects hospital rejection vs admin ban
- Routes to separate appeal systems accordingly
- Hospital admins can review appeals with "Re-open for Review" and "Reject (Final)" buttons

**Test Steps:**
1. Login as hospital admin → DonorManagement → select donor with hospital rejection
2. Should see "Pending Appeals" tab with appeal count
3. Click on appeal → see hospital review panel
4. Click "Re-open for Review" → donor case status resets
5. Click "Reject (Final)" → donor sees "Appeal Rejected" message permanently
6. Login as rejected donor → Dashboard shows appeal form
7. Submit appeal → hospital sees it in "Pending Appeals"

---

## Feature 6: Super Admin & Hospital Permission Restrictions ✓
**Status: COMPLETED**

### Changes:
- `App.jsx` split navigation by role:
  - Super Admin: only "Hospital Registrations" (no donors/recipients/employees)
  - Admin: unchanged (all management pages)
  - Hospital (approved): Donors + Recipients management
- Added `getDonorsByHospital()` and `getRecipientsByHospital()` in `auth.js`
- `DonorManagement.jsx`: loads donors scoped to hospital if role === 'hospital'
- `RecipientManagement.jsx`: loads recipients scoped to hospital if role === 'hospital'
- `UserManagement.jsx`: super_admin sees only "Pending Hospital Registrations"

**Test Steps:**
1. Login as super_admin:
   - Navigate → Should see ONLY "Hospital Registrations" nav item
   - NO Donors, Recipients, or Employees links
   - UserManagement shows only pending hospitals
2. Login as admin:
   - Navigate → Should see full menu (unchanged)
   - All management pages work normally
3. Login as hospital (approved status):
   - Navigate → Should see "Donors" and "Recipients" nav items
   - DonorManagement shows ONLY donors from this hospital
   - RecipientManagement shows ONLY recipients from this hospital
   - Cannot see other hospitals' data

---

## Build & Runtime Status

**Build Output:**
```
✓ 48 modules transformed
✓ built in 13.53s
dist/index.html - 0.63 kB (gzip: 0.41 kB)
dist/assets/index-*.css - 25.74 kB (gzip: 5.46 kB)
dist/assets/index-*.js - 709.66 kB (gzip: 193.25 kB)
```

**Dev Server:**
```
VITE v5.4.21 ready in 1615 ms
http://localhost:3000/
```

---

## Integration Verification

All 6 features work together correctly:
- ✓ Super admin → hospital registration → (Feature 6)
- ✓ Hospital admin → manage donors/recipients → (Feature 6)
- ✓ Donor fills wizard → uploads CNIC → confirms CNIC → (Features 1, 2)
- ✓ Dashboard shows document checklist → (Feature 3)
- ✓ Hospital admin reviews case → views documents in lightbox → (Feature 4)
- ✓ Hospital rejects case → donor submits appeal → hospital reviews → (Feature 5)

---

## Rollback Safety
All changes use localStorage without backend modifications. Can be tested safely without affecting production data.

---

# Modules 7–9 — Governance, Cold Chain, Scheduling

Three modules added on top of the existing allocation engine (Modules 4–6). They
form a chain: an allocation decision now opens an **approval case** (M7), an
approved case has an **organ** recovered against it (M8), and that organ is
transplanted in a **booked surgery** (M9).

---

## Module 7: Hospital Approval Board ✓
**Status: COMPLETED**

The gate between "the engine picked recipient X" and "we will transplant".
Every allocation decision now automatically opens a governance case.

### What it enforces
- **7.1 Checklist validation** — 8 required + 2 optional verification items,
  snapshotted per case from `config/governance.php`. No approval action is
  accepted while a required item is unticked. Enforced server-side (422), with
  the UI mirroring it so the button is visibly disabled.
- **7.2 Sequential multi-user approval** — doctor sign-off, then admin
  confirmation. An admin cannot confirm a case the doctor has not signed, and
  the same person cannot supply both signatures. Dual sign-off is the default
  and can be switched off per case (locks once a doctor has signed).
- **7.3 Decision notification** — both recipient and donor are notified in-app
  and by email on approval or rejection.
- **7.4 Approval time tracking** — duration from allocation to approval is
  materialised on completion, feeding a cross-hospital comparison.

### Files
- `backend/app/Http/Controllers/CaseApprovalController.php`
- `backend/app/Models/CaseApproval.php`
- `backend/config/governance.php` (checklist template)
- `src/components/ApprovalBoard.jsx`
- Migrations `2026_09_09_100000` … `100002`

### Test Steps
1. Log in as a hospital (`cmh@odcat.com`) → **Approval Board**.
2. Open any case in *Verification*. Try **Confirm & approve** — refused, with the
   number of outstanding items named.
3. Tick all 8 required items. The case advances to *Doctor Review*.
4. Try **Confirm & approve** as the hospital — refused: waiting on the doctor.
5. Log in as a doctor for that hospital → **Approval Board** → **Record clinical
   sign-off**. Case advances to *Final Sign-off*.
6. Back as the hospital → **Confirm & approve**. Case becomes *Approved*.
7. Check the recipient's and donor's notifications — both received one.
8. Open the **Performance** tab — timing and hospital ranking now populated.
9. Untick a required item on an open case → it walks back to *Verification* and
   the doctor's signature is cleared.

---

## Module 8: Organ Lifecycle & Cold Chain ✓
**Status: COMPLETED**

Introduces the organ as a tracked entity — the thing the system previously had
no representation of.

### What it does
- **8.1 Cold ischemia alerting** — four states derived from `recovered_at` and a
  per-organ-type limit (heart 4h, lung 6h, liver/pancreas 12h, kidney 24h, …):
  `ok` <60%, `advisory` ≥60%, `warning` ≥85%, `breached` ≥100%. On breach: a
  registry flag, a dashboard banner, an in-app notification and an email — fired
  exactly once per organ.
- **8.2 Utilization metrics** — transplanted vs. closed %, expired rate,
  discarded rate, mean/median achieved cold ischemia, per-organ-type breakdown.
- **8.3 Lifecycle timeline** — every state change and manual note, per organ.

### Design note — why there is no background job
Cold-chain state is **computed on read**, not written by a scheduled task. This
deployment runs no queue worker, so a stored flag would go stale the moment
nothing was running to refresh it, and a queued email would sit in the `jobs`
table forever. Deriving the state from two timestamps is always correct at the
instant it is displayed and needs no daemon. The breach email is sent via
`dispatch()->afterResponse()` — same process, after the response is flushed —
guarded by `breach_notified_at` so it cannot fire twice.

### Files
- `backend/app/Http/Controllers/OrganController.php`
- `backend/app/Models/Organ.php`, `OrganEvent.php`
- `backend/app/Services/Notifier.php`
- `src/components/OrganLifecycle.jsx`
- Migration `2026_09_09_110000`

### Test Steps
1. Hospital → **Organ Lifecycle** → **+ Register organ**.
2. Register a *Heart* with a recovery time 5 hours ago → immediately shows
   **Breached** (limit is 4h), a red banner appears, and the hospital receives a
   notification + email.
3. Reload the page — no second alert (the alert is idempotent).
4. Register a *Kidney* recovered 15 hours ago → **Advisory** (63% of 24h).
5. Open an organ → advance it *in transit* → *transplanted*. The cold-chain
   clock stops and the timeline records each step.
6. Try to discard a transplanted organ → refused, lifecycle is closed.
7. Discard an organ without a reason → refused.
8. **Utilization** tab — rates computed over closed organs only.

---

## Module 9: Surgery Scheduling & Resource Allocation ✓
**Status: COMPLETED**

### What it does
- **9.1 Transaction-safe booking** — every booking takes
  `SELECT … FOR UPDATE` on the theatre/surgeon/ICU-bed rows *before* the overlap
  check, inside one transaction. Two concurrent requests for the same theatre
  serialise; the second correctly sees the first and fails. Locks are acquired
  in id order (no deadlock) and are per-row (bookings for different theatres
  never wait on each other).
- **9.2 Calendar UI** — monthly grid, Monday-start, with a per-day drill-down.
- **9.3 Resource utilization** — theatre, surgeon and ICU-bed occupancy over a
  forward-looking 7/30/90-day window.

### Why a unique index would not work
Overlap is a *range* predicate, not an equality, and MySQL has no exclusion
constraints. The resource row is used as the mutex for its own calendar because
it always exists — locking rows in `surgery_bookings` cannot protect against a
row that does not exist yet (the phantom-read problem).

### Files
- `backend/app/Services/SurgeryScheduler.php` ← the locking logic
- `backend/app/Http/Controllers/SurgeryController.php`
- `backend/app/Models/SurgicalResource.php`, `SurgeryBooking.php`
- `src/components/SurgerySchedule.jsx`
- Migration `2026_09_09_120000`

### Automated tests
`php artisan test --filter="SurgeryBookingTest|SurgeryLockTest"` — 11 tests.

Concurrency cannot be verified by clicking, so it is tested directly:
- `SurgeryBookingTest` (9 tests) — overlap boundaries, back-to-back slots,
  cancellation freeing resources, surgeon/ICU-bed conflicts, cross-hospital
  scoping. These pass **even with no locking**, since they run sequentially.
- `SurgeryLockTest` (2 tests) — drives the real `SurgeryScheduler` inside an
  outer transaction, then probes the locked row from a genuinely separate
  database connection. The probe takes a **shared** lock deliberately: inserting
  a booking makes InnoDB take a shared lock on the referenced resource row for
  the foreign-key check regardless of any application locking, so an exclusive
  probe would report "locked" even for an unsafe scheduler. A shared probe
  conflicts only with a real `FOR UPDATE`. Verified by removing the lock and
  confirming the test fails.

### Test Steps
1. Hospital → **Surgery Schedule** → **⚙ Resources** → add a theatre, a surgeon
   and an ICU bed.
2. **+ Schedule surgery** → book Theatre 1, 09:00–13:00.
3. Book the same theatre 11:00–15:00 → refused, naming the clashing booking.
4. Book a *different* theatre with the *same* surgeon, same window → refused on
   the surgeon.
5. Book Theatre 1, 13:00–17:00 → **succeeds** (back-to-back is not an overlap).
6. Book with an ICU bed for 48h, then try to reuse that bed the next day →
   refused on the bed, even though theatre and surgeon are free.
7. Cancel a booking (reason required) → the slot becomes bookable again.
8. Link a booking to an organ and mark it **completed** → the organ is
   automatically recorded as transplanted and its cold-chain clock stops.
9. **Utilization** tab — per-type and per-resource occupancy.

---

## Pre-existing issues fixed along the way

1. **`activity:purge-daily` deleted governance notifications.** The nightly
   cleanup wiped the whole `notifications` table on a 24h window. Correct for
   feed chatter, wrong for "your transplant was approved". Added an
   `is_persistent` flag that the purge skips; governance notices set it.
   Verified by back-dating one of each and running the command.

2. **`2026_05_10_010000_add_perf_indexes` could not be rolled back.** Its
   `down()` dropped `alloc_runs_donor_mode_idx`, which is the only index
   covering `allocation_runs.donor_user_id` — a foreign key column MySQL
   requires an index on (error 1553). Any `migrate:rollback` or `migrate:fresh`
   past this point failed. `down()` now creates a replacement single-column
   index first.

3. **The test suite had no separate database.** `phpunit.xml` left
   `DB_DATABASE` unset, so `RefreshDatabase`/`DatabaseMigrations` would have
   dropped every table in the working `odcat_backend` database. Tests now run
   against `odcat_backend_test`, which must be created once:

   ```sql
   CREATE DATABASE odcat_backend_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

---

## Access matrix (Modules 7–9)

| Role | Approval Board | Organ Lifecycle | Surgery Schedule |
|---|---|---|---|
| Hospital (approved) | act | act | act |
| Admin (hospital-linked) | act | act | act |
| Doctor | clinical sign-off only | act | view |
| Super admin | read-only oversight | read-only | read-only |
| Auditor | read-only oversight | read-only | read-only |
| Admin (unlinked) | no access | no access | no access |

Super admin and auditor are deliberately read-only: they need the
cross-hospital comparison to be meaningful without being able to influence the
cases it measures.

---

# Security Review — Defects Found and Fixed

A systematic review of authorization and authentication, carried out after
Modules 7–9 were built. Every defect below was **confirmed against the running
application** before being fixed, and every fix is **pinned by a test** so it
cannot silently regress.

The theme is consistent and worth stating plainly: almost every defect was a
missing *ownership* check, not a missing *role* check. The code asked "are you an
admin?" and forgot to ask "is this your patient?". That failure mode is invisible
in review because each individual `if` looks reasonable — it is the check nobody
wrote that causes the breach.

## Summary

| # | Defect | Impact | Verified | Fixed in |
|---|---|---|---|---|
| 1 | Any authenticated user could set their own `role` | **Critical** — donor → super_admin in one request | Exploited live, reverted | `3fb866d` |
| 2 | Any authenticated user could approve any donor | **Critical** — unverified donors enter the allocation pool | Exploited live from a *recipient* account | `(this commit)` |
| 3 | Patients could set their own case `status` | **Critical** — self-approval into the allocation pool | Exploited live, reverted | `ff9f1ea` |
| 4 | Pre-registration account takeover via Google | **High** — sign the real owner into a squatter's account | Code analysis | `902f2c3` |
| 5 | `ban()` / `destroy()` had no hospital scoping | **High** — delete any patient in the system | Code analysis | `3fb866d` |
| 6 | Any admin could download any patient's documents | **High** — CNICs, medical certificates, nationwide | Code analysis | `(this commit)` |
| 7 | Auditors could read every hospital's patients | **High** — cross-tenant clinical data | Code analysis | `509ad3c` |
| 8 | Super admin held full case-level clinical data | **Medium** — privacy, exceeded supervision purpose | Code analysis | `509ad3c` |
| 9 | Hospital admins could vet competing hospitals | **Medium** — conflict of interest | Code analysis | `3fb866d` |
| 10 | Document review unscoped by hospital | **Medium** — approve another hospital's papers | Code analysis | `(this commit)` |
| 11 | Test suite could drop the live database | **Critical (ops)** — and did, once | Reproduced | `151ac33` |
| 12 | Approval board ignored cross-hospital matching | **High** — a hospital approved transplants for another hospital's patients, who never saw the case | Queried live data: 8 of 10 cases | `(this commit)` |
| 13 | Allocation pool leaked identified clinical data | **High** — every hospital could read every approved recipient's name, email and diagnosis nationwide | Code analysis + payload inspection | `(this commit)` |
| 14 | The same leak was persisted at rest | **High** — 2,361 candidate records held cross-hospital PII in `allocation_runs.results` | Counted in the database | `(this commit)` |

## The two that mattered most

### Unguarded clinical approval

`POST /api/donors/{id}/verify` sat behind `auth` alone — no role middleware, and
no check inside the controller. Any authenticated account could approve any
donor. Demonstrated by approving a donor from a **recipient's** token:

```
POST /api/donors/621/verify {"action":"approve"}   ->  HTTP 200
donor status: registered -> approved
```

Approval is what makes a donor eligible for allocation
(`AllocationController` filters on `status = 'approved'` in three places), so
this placed unverified donors into the organ matching pool with no clinical
review, no document check and no hospital sign-off.

### Privilege escalation through profile update

`PATCH /api/users/{id}` accepted `role` and `linked_hospital_id` with no
actor-side authorization:

```
login as donor  ->  PATCH /users/4 {"role":"super_admin"}  ->  HTTP 200
role: donor -> super_admin
```

Both were reverted immediately after demonstration and their tokens revoked.

## Cross-hospital allocation versus a single-hospital approval board

The three defects above (12–14) share one root cause: Module 5 was built to match
across the whole network, and Module 7 was built as though it did not.

`AllocationController::loadRecipientPayloads()` draws candidates from **every**
approved recipient in the country. But `CaseApprovalController::openFor()` stamped
each approval case with the **donor's** hospital alone, and the board filtered on
that single column. Querying the seeded data showed how far from an edge case this
was:

```
cross-hospital approval cases: 8 of 10
H3:   board shows 2 | own patients in ANOTHER hospital's case: 5 (3 already decided)
H597: board shows 2 | own patients in ANOTHER hospital's case: 3
```

Two cases had already been closed — one approved, one rejected — by a hospital that
had never seen the patient. The hospital that holds the chart, obtains consent and
performs the operation had no stage in the workflow and could not see the case at
all.

The second half of the problem was disclosure. The cross-hospital pool returned
`name`, `email` and `diagnosis` for every approved recipient in the network to any
hospital-linked admin who ran an allocation. That is a wider exposure than the
super-admin case already closed on data-minimisation grounds, because there are
many hospitals and one supervisor. Worse, `allocation_runs.results` is a JSON
snapshot of the whole ranked pool, so the disclosure was **persisted**: 2,361
candidate records across 19 runs.

### What changed

The board is now two-sided. `case_approvals` carries `recipient_hospital_id`, and
a case is visible to either side — with asymmetric rights:

| | Procuring hospital | Receiving hospital |
|---|---|---|
| Verification checklist | ticks it | reads it |
| Clinical sign-off / final confirmation | yes | no |
| Accept or decline the offer | **no** | **yes** |
| Reject the case outright | yes | no |
| Sees its own patient | in full | in full |
| Sees the counterparty's patient | match code until the offer is accepted | n/a |
| Sees donor identity | yes | **never** |
| Sees the other side's free-text notes | no | no |

A new `offer` stage sits between the checklist and clinical sign-off: the procuring
hospital cannot proceed until the receiving hospital accepts. Same-hospital cases
skip it, because there is no counterparty to ask.

A decline is recorded as `declined`, not `rejected`, and is **not** a verdict on the
patient — they keep their place on the list. The organ falls automatically to the
next-ranked candidate from the same run, walking the stored ranking rather than
re-scoring, so the decision stays faithful to the policy version that produced the
original offer. Candidates already tried are skipped, so a chain of declines cannot
loop.

On disclosure: the live payload now withholds `name`, `email` and `diagnosis` across
a hospital boundary, the read paths scrub historical rows, and
`php artisan allocation:scrub-pii` removes the data at rest. The scoring fields are
untouched — `AllocationService::rank()` never reads the three withheld fields, which
was verified against the service before removing them, and confirmed empirically:
after scrubbing all 19 runs, the ranking signature of run 19 was **byte-identical**
(`sha1 ee07ad4a…` before and after).

Offer-response time is tracked separately from approval time, so a hospital is not
ranked in the 7.4 performance comparison on how fast its partners answer.

### The failure mode this introduced

Making the procuring hospital wait on a counterparty is correct, but it created a
way to strand an organ that did not exist before: previously a hospital could
complete an approval on its own, so nothing could block indefinitely. Now an offer
can sit untouched while the cold-ischemia clock runs, and the organ is lost to a
missed notification rather than to any clinical decision. Handling that is part of
the change, not a separate feature.

`offers:check-stalled` runs every five minutes alongside the cold-chain sweep and
reminds **both** hospitals once an offer passes 20% of that organ's cold-ischemia
limit — a fraction rather than a flat timeout, because a heart has roughly four
hours in total and a kidney closer to a day.

It deliberately does **not** auto-decline on timeout. That would be worse than the
stall: it would record a clinical decision that no clinician made, against a
patient who might well have been accepted. It escalates and leaves the decision
with the people qualified to take it.

Idempotent via a conditional `UPDATE` on `offer_escalated_at`, the same pattern as
`organs.breach_notified_at`, so a sweep every five minutes sends one reminder
rather than one per tick.

One migration subtlety worth recording: open cross-hospital cases that had already
cleared their checklist were sitting at `doctor`/`admin` with no offer on record.
The migration walks those **back** to `offer` rather than grandfathering them — the
missing consent step is the defect, and approving them silently would bake it in.
Terminal cases are left untouched, because rewriting a closed decision would
falsify the record.

## What changed structurally

Authorization for patient cases and documents now goes through a single class,
`app/Support/CaseScope.php`, rather than being re-derived in each controller:

- `CaseScope::denyRead()` — may this actor see this patient's record?
- `CaseScope::denyReview()` — may this actor make a clinical decision about them?

Two rules inside it fix inversions that appeared repeatedly in the original code:

1. An actor with **no hospital** has **no scope**, rather than unlimited scope.
   The previous `if ($actor->linked_hospital_id)` guard *skipped* the check for
   unlinked admins, making them more powerful than hospital-linked ones.
2. A patient attached to **no hospital** is in **nobody's** caseload, rather than
   everybody's. The previous `if ($targetHospital && ...)` fell through to
   "allowed", exposing every unaffiliated account in the system.

## Access model after the review

| Role | Patient records | Clinical decisions | Scope |
|---|---|---|---|
| Hospital (procuring side) | read + write | yes | own patients; counterparty candidates by match code |
| Hospital (receiving side) | own patient only | offer accept/decline only | no donor identity |
| Admin (hospital-linked) | read + write | yes | that hospital only |
| Doctor | read + write | yes (clinical sign-off) | that hospital only |
| Data entry | read + write | no | that hospital only |
| Auditor | read only | no | **own hospital only** |
| Super admin | **aggregates only** | **no** | network-wide statistics |
| Donor / Recipient | own record only | no | themselves |

Super admins are deliberately excluded from clinical decisions, matching a
principle the codebase already applied to the allocation engine: *"Super admins
cannot use the allocation engine. This is intentional to prevent allocation
bias."* Supervising the registry does not require knowing which named patient had
which crossmatch result.

## Authentication

- **Email ownership is now proven at registration.** `REQUIRE_EMAIL_VERIFICATION`
  was `false` and `register()` stamped `email_verified_at` unconditionally, so
  anyone could register under an address they did not control. The
  pre-registration verification flow already existed and the frontend already
  sent its token — the gate was built and switched off.
- **Google sign-in links safely.** Matching is on `google_id` first. Falling back
  to email refuses two cases: an account already bound to a *different* Google
  identity, and an account whose email was never verified (which must be claimed
  with its password first).
- **Google sign-up** is available for donor, recipient and hospital. The role is
  chosen on our own screen and sealed into the OAuth `state` parameter —
  **encrypted**, because the role decides what kind of account is created.
- **No email OTP follows Google sign-in.** Google has already proven the user
  controls that mailbox; mailing a code to it verifies nothing and only adds
  friction. What Google cannot prove — identity, and authority to operate a
  transplant centre — is still established by document upload and super admin
  approval, which are unchanged.

## Verification

```bash
cd backend
composer run test
```

115 tests, 545 assertions. The authorization boundaries specifically:

```bash
php artisan test --filter=UserAuthorizationTest        # 21 - roles, scoping, case status
php artisan test --filter=CaseAndDocumentScopeTest     # 13 - clinical review, documents
php artisan test --filter=ModuleAccessScopeTest        # 10 - Modules 7-9 data access
php artisan test --filter=GoogleAuthTest               # 11 - sign-up, sign-in, linking
php artisan test --filter=CrossHospitalApprovalTest    # 31 - two-sided board, offers, re-offer, minimisation, escalation, seeder
```

Each test corresponds to a defect that was actually open, and covers **both**
directions — that the attack is refused, *and* that the legitimate action still
works. A guard that denies everything is not a fix.

## Known limitations

Stated plainly rather than left for a reader to discover:

- **No automated frontend tests.** The React side was verified by driving a real
  browser during development, not by a committed suite.
- **The Google consent screen is not covered end to end.** Google blocks headless
  automation, so the tests mock Socialite. Everything on both sides of the
  consent screen is tested; the screen itself needs a manual click-through.
- **Permissions are declarative, not enforced.** The 24 Spatie permissions are
  never read by any code — authorization is entirely role-based. The seeder says
  so prominently so the table is not mistaken for a security control.
- **This is a student project, not a certified clinical system.** The review
  applied standard data-protection principles (data minimisation, purpose
  limitation). It is not a formal compliance audit against THOTA 2010 or any
  other regime.
