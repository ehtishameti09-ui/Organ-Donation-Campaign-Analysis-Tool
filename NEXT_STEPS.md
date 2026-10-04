# Next Steps

What is left, and what only you can do. Everything below is actionable — no
background reading required.

---

## 1. Things only you can do

### ☑ Click through Google sign-in — **confirmed working, 4 Oct 2026**

This was the one step that could not be automated: Google blocks headless
browsers, so every test mocks the consent screen. Both sides of it were
verified automatically; the screen itself needed a human.

Confirmed by hand. Nothing in the project is now unverified for want of testing.

If it ever misbehaves later, the diagnostic is the address bar — the `error=`
value in the query string says exactly which branch of the callback refused.
To re-check:

1. **"Continue with Google"** with an account that already exists → lands signed in
2. **Create Account → Donor → "Sign up with Google"** with a fresh Google account
   → lands on **Complete Your Donor Registration**

### ☐ Decide whether the security write-up stays public

`FEATURE_VERIFICATION.md` documents 11 security defects in detail, and the repo
is public. My view: **keep it**. It is strong evidence of engineering rigour for
a defence, every defect is fixed in the same history, and nothing here runs with
real patient data. But it is a deliberate choice, not a default — make it
knowingly.

### ☐ Test registration end-to-end with a real inbox

`REQUIRE_EMAIL_VERIFICATION` is now `true`, so email/password signup requires
clicking a link in an actual email. SMTP delivery was verified, but the full
round trip was not. Try one real registration before you rely on it in a demo.

---

## 2. Before every demo

```bash
cd backend
php artisan demo:refresh-dates      # bookings and organ clocks back onto today
```

The approval board now has two sides, so a good demo signs in as **two**
hospitals: one procuring (ticks the checklist, then waits) and one receiving
(accepts or declines the offer). The seeded data puts at least one case at
**Offer Pending** and one at **Declined** so both are visible without clicking
anything.

`DemoDataSeeder` generates data relative to the day it runs. After a week or
two the calendar empties, every utilisation figure reads 0%, and all organs show
as breached. This slides the set back. **Run it the morning of any demo.**

Quick sanity check that the data looks alive:

```bash
php artisan organs:check-cold-chain --dry-run
php artisan offers:check-stalled --dry-run   # unanswered organ offers
```

---

## 3. Starting the app

Open the **XAMPP Control Panel** → start **Apache** and **MySQL**. Then:

```bash
npm run dev                      # frontend on :3000
```

Do **not** run `php artisan serve` — Apache already serves the API on :8000.

The first API request after starting Apache takes ~60s (OPcache compiling from
cold); every one after is ~0.1s. Warm it deliberately so a demo never hits it:

```bash
curl http://localhost:8000/api/health
```

---

## 4. Running the tests

```bash
cd backend && composer run test   # 115 backend tests
npm run test:smoke                # frontend, needs the app running
```

Use `composer run test`, **not** `php artisan test` — it clears the cached
config first. With config cached, `phpunit.xml` is ignored and the suite points
at your real database. There is a hard interlock in `tests/TestCase.php` that
stops this, but the wrapper avoids the situation entirely.

**After editing `.env`, run `php artisan config:cache`** or the change is
ignored.

---

## 5. Audit coverage — what is and is not verified

Every mutating API route was enumerated and checked. Current state:

| Area | Status |
|---|---|
| User management (role, ban, delete, edit, status) | ✅ fixed + tested |
| Clinical approval (donor / recipient verify) | ✅ fixed + tested |
| Patient documents (read, review, upload, delete) | ✅ fixed + tested |
| Modules 7–9 (approvals, organs, surgery) | ✅ fixed + tested |
| Cross-hospital offers (two-sided approval board) | ✅ fixed + tested |
| Cross-hospital data minimisation (allocation pool) | ✅ fixed + tested + scrubbed at rest |
| Google sign-in / sign-up / account linking | ✅ fixed + tested |
| Case appeals + ban appeals | ✅ verified scoped |
| Notifications | ✅ verified scoped (own records only) |
| Admin requests | ✅ verified (super-admin only to approve) |
| `users/me/add-role` | ✅ verified safe (donor/recipient only) |
| `change-password` | ✅ verified safe (self only, needs current password) |
| Allocation engine (Modules 4–6) | ✅ verified scoped |
| Dashboard / activity / audit logs | ✅ verified scoped |

No unguarded mutating route remains. That is a statement about *authorization*,
not a claim that the system is free of all defects.

---

## 6. Known gaps, with my recommendation

| Gap | Recommendation |
|---|---|
| **Permissions are declarative, not enforced.** 24 Spatie permissions exist; no code reads them. Authorization is entirely role-based. | Leave as-is and keep the seeder's warning comment. Enforcing them now is a large refactor with real regression risk and no behaviour change. |
| **Frontend tests are smoke-level.** They catch pages that throw, failing requests, and a role seeing the wrong data — not every button. | Good enough for this project. Extend only if a specific flow keeps breaking. |
| **2FA is off by default.** `TwoFactorController` works and users can opt in from Account Settings. | Consider defaulting it **on for hospital and admin accounts** — those hold other people's clinical data. Donors and recipients can stay opt-in. I can do this if you want it. |
| ~~Backups are local only.~~ **Done** - every verified backup now mirrors to OneDrive automatically. | Nothing to do. The copy lives in `OneDrive - Punjab Group of Colleges\odcat-backups`. Keep it private - the dumps contain password hashes. |
| **No CI.** Tests run only when someone runs them. | Low value for an FYP. Skip unless your supervisor asks. |
| ~~Allocation runs held other hospitals' patient names at rest.~~ **Done** - `php artisan allocation:scrub-pii` cleaned 2,361 records across 19 runs, and new runs never store them. | Nothing to do. Re-run the command after restoring any backup taken before 4 Oct 2026, since those dumps still contain the old data. |
| ~~Nothing chased an offer nobody answered.~~ **Done** - `offers:check-stalled` runs every 5 minutes and reminds both hospitals once the offer passes 20% of that organ's cold-ischemia limit. | Nothing to do. Note it deliberately does **not** auto-decline: that would record a clinical decision no clinician made. It escalates and leaves the decision with the people qualified to take it. |

---

## 7. If something breaks

```bash
# Restore the database from the latest verified backup
& "C:\xampp\mysql\bin\mysql.exe" -u root -P 3307 odcat_backend < "D:\Sham\fyp\odcat-backups\odcat_backend_<stamp>.sql"

# Rebuild demo data from scratch
cd backend
php artisan db:seed --class=DemoDataSeeder --force
php artisan demo:refresh-dates
```

Backups run daily at 03:00 and are **verified by restore** before being kept.
Check the last run:

```powershell
Get-ScheduledTaskInfo -TaskName 'ODCAT Database Backup'
```
