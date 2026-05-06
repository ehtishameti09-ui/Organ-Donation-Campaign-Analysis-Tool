# Organ Donation Campaign Analysis Tool - Complete Setup Guide

A production-ready Laravel backend with React frontend for organ donation case management, hospital coordination, and admin oversight.

## System Overview

**Backend**: Laravel 11 API (PHP, MySQL, Sanctum authentication)
**Frontend**: React (Vite)
**Database**: MySQL via XAMPP
**Authentication**: Sanctum SPA + Email verification + Google OAuth 2.0
**Authorization**: RBAC (Role-Based Access Control) with 8 roles and 27 granular permissions

### Key Features

- ✅ Email verified registration with mandatory verification
- ✅ Argon2id password hashing (military-grade security)
- ✅ Rate limiting (5 login attempts/60s, 3 password resets/10min)
- ✅ Role-based dashboards: Super Admin, Admin, Hospital, Doctor, Data Entry, Auditor, Donor, Recipient
- ✅ Hospital approval workflow with document verification
- ✅ Donor/Recipient case submission and hospital review process
- ✅ Multi-admin appeal system with conflict-of-interest enforcement
- ✅ Soft-delete with 30-day recovery window
- ✅ Comprehensive audit logging and activity tracking
- ✅ 60+ REST API endpoints with full role scoping

---

## Prerequisites

### Required Software

- **XAMPP** (Apache + MySQL + PHP 8.2+)
  - Download: https://www.apachefriends.org/
  - Ensure MySQL is running on port 3306
  - Ensure Apache is running on port 80

- **Node.js & npm** (v18+)
  - Download: https://nodejs.org/
  - Verify: `node --version` and `npm --version`

- **Git** (optional, for version control)
  - Download: https://git-scm.com/

### Port Requirements

- Backend API: `8000` (Laravel)
- Frontend: `3000` (Vite dev server)
- MySQL: `3306`
- Apache: `80`

---

## Step-by-Step Setup

### Step 1: Start XAMPP and Create Database

1. **Open XAMPP Control Panel** and start:
   - Apache
   - MySQL

2. **Create database** via phpMyAdmin:
   ```
   URL: http://localhost/phpmyadmin
   Create new database: odcat_backend
   Charset: utf8mb4
   ```

### Step 2: Backend Setup

#### 2.1 Navigate to backend directory

```bash
cd "c:\Users\ilaib\Desktop\Organ-Donation-Campaign-Analysis-Tool\backend"
```

#### 2.2 Install dependencies

```bash
composer install
```

#### 2.3 Configure environment

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` file with these critical settings:

```ini
APP_NAME="ODCAT"
APP_ENV=local
APP_DEBUG=true
APP_KEY=base64:xxxxx  # Will be generated in next step

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=odcat_backend
DB_USERNAME=root
DB_PASSWORD=  # Leave empty for default XAMPP setup

HASH_DRIVER=argon2id
HASH_ARGON_MEMORY=65536
HASH_ARGON_THREADS=2
HASH_ARGON_TIME=4

FRONTEND_URL=http://localhost:3000
SESSION_DOMAIN=localhost

MAIL_DRIVER=log  # Emails appear in storage/logs/laravel.log during development

SANCTUM_STATEFUL_DOMAINS=localhost:3000,127.0.0.1:3000
```

#### 2.4 Generate app key

```bash
php artisan key:generate
```

#### 2.5 Run database migrations

```bash
php artisan migrate:fresh
```

This creates all tables: users, hospitals, donors, recipients, documents, appeals, activities, notifications, etc.

#### 2.6 Seed demo data

```bash
php artisan db:seed
```

This creates:
- **8 roles** with granular permissions
- **3 demo accounts**:
  - `admin@odcat.com` / `Admin@123` (Super Admin)
  - `dr.ali@odcat.com` / `Admin@123` (Admin)
  - `cmh@odcat.com` / `Admin@123` (Hospital)

#### 2.7 Clear caches

```bash
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan cache:clear
```

### Step 3: Frontend Setup

#### 3.1 Navigate to frontend directory

```bash
cd "c:\Users\ilaib\Desktop\Organ-Donation-Campaign-Analysis-Tool"
```

#### 3.2 Install dependencies

```bash
npm install
```

#### 3.3 Note: API Integration

The frontend's `src/utils/api.js` is pre-configured to call the backend at:
```
http://localhost:8000/api
```

And `src/utils/auth.js` uses this API service for:
- `login()` → calls `POST /api/login`
- `logout()` → calls `POST /api/logout`
- `registerUser()` → calls `POST /api/register`

All authentication tokens are stored in `localStorage['odcat_token']`.

---

## Running the Application

### Terminal 1: Start Laravel Backend

```bash
cd "c:\Users\ilaib\Desktop\Organ-Donation-Campaign-Analysis-Tool\backend"
php artisan serve --port=8000
```

**Expected Output:**
```
INFO  Server running on [http://127.0.0.1:8000].
```

### Terminal 2: Start React Frontend

```bash
cd "c:\Users\ilaib\Desktop\Organ-Donation-Campaign-Analysis-Tool"
npm run dev
```

**Expected Output:**
```
  VITE v5.0.0  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

### Terminal 3 (Optional): Check Logs

```bash
cd "c:\Users\ilaib\Desktop\Organ-Donation-Campaign-Analysis-Tool\backend"
tail -f storage/logs/laravel.log
```

---

## Testing the Setup

### Health Check

```bash
curl http://localhost:8000/api/health
# Expected: {"status":"ok"}
```

### Login Test (curl)

```bash
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@odcat.com","password":"Admin@123"}'
```

**Expected Response:**
```json
{
  "user": {
    "id": 1,
    "name": "ODCAT Super Admin",
    "email": "admin@odcat.com",
    "role": "super_admin",
    "status": "approved",
    "permissions": [...]
  },
  "token": "1|xxxxxxxxxxxxx",
  "token_type": "Bearer"
}
```

### Login Test (Browser)

1. Open `http://localhost:3000`
2. Enter credentials:
   - Email: `admin@odcat.com`
   - Password: `Admin@123`
3. Click **Login**
4. Expected: Dashboard loads with metrics

---

## Testing via Postman

### 1. Import Collection

Create a new Postman collection with these endpoints:

#### Auth Endpoints

**POST** `/api/register`
```json
{
  "name": "Test User",
  "email": "test@example.com",
  "password": "SecurePass@123",
  "password_confirmation": "SecurePass@123",
  "role": "donor",
  "phone": "+923001234567"
}
```

**POST** `/api/login`
```json
{
  "email": "admin@odcat.com",
  "password": "Admin@123"
}
```

Response includes `token` - copy this value to use in subsequent requests.

**POST** `/api/logout`
- Header: `Authorization: Bearer <TOKEN>`
- No body needed

**GET** `/api/me`
- Header: `Authorization: Bearer <TOKEN>`

#### Dashboard

**GET** `/api/dashboard/metrics`
- Header: `Authorization: Bearer <TOKEN>`
- Role Required: `super_admin` or `admin`

#### Users

**GET** `/api/users`
- Header: `Authorization: Bearer <TOKEN>`

**GET** `/api/users/{id}`
- Header: `Authorization: Bearer <TOKEN>`

**PATCH** `/api/users/{id}`
- Header: `Authorization: Bearer <TOKEN>`
- Body: `{"name": "New Name", "phone": "+923001234567"}`

#### Hospitals

**GET** `/api/hospitals`
- Header: `Authorization: Bearer <TOKEN>`

**GET** `/api/hospitals/pending`
- Header: `Authorization: Bearer <TOKEN>`
- Role Required: `super_admin` or `admin`

**POST** `/api/hospitals/{id}/approve`
- Header: `Authorization: Bearer <TOKEN>`
- Role Required: `super_admin` or `admin`
- Body:
```json
{
  "feedback": "Documentation complete. Approved for operations."
}
```

#### Documents

**POST** `/api/documents/upload`
- Header: `Authorization: Bearer <TOKEN>`
- Form Data:
  - `files[]`: (file)
  - `document_type`: "medical_certificate"
  - `user_id`: (optional, admin can upload on behalf)

**GET** `/api/documents`
- Header: `Authorization: Bearer <TOKEN>`
- Query: `?user_id=1&document_type=medical_certificate`

**GET** `/api/documents/{id}/download`
- Header: `Authorization: Bearer <TOKEN>`

#### Notifications

**GET** `/api/notifications`
- Header: `Authorization: Bearer <TOKEN>`
- Query: `?unread_only=1` (optional)

**PATCH** `/api/notifications/{id}/mark-read`
- Header: `Authorization: Bearer <TOKEN>`

### 2. Set Environment Variable

In Postman, create an environment variable `{{token}}` by:
1. Click **Environment** (top right)
2. Create new environment: `ODCAT`
3. Add variable:
   - Key: `token`
   - Value: `<paste token from login response>`
4. Select this environment before running requests

---

## Database Schema Overview

### Core Tables

**users**
- Base user table with 90+ fields
- Includes: role, status, banned, is_deleted, soft-delete tracking
- Fields: email_verified_at, password (Argon2id), last_login_at

**hospital_profiles**
- Hospital-specific data
- Fields: hospital_name, registration_number, license_number, address, contact_person
- Tracking: approved_at, approved_by, rejected_at, rejection_reason

**donor_profiles**
- Donor case data
- Fields: blood_type, pledged_organs (JSON), verification_status, case_status
- Document tracking: document_statuses (JSON)

**recipient_profiles**
- Recipient case data
- Fields: organ_needed, diagnosis, urgency_score, comorbidity, survival_estimate
- Tracking: case_status, verification_status

**clinical_profiles**
- Shared medical data for all users
- Fields: CNIC, DOB, age, gender, medical_history, emergency_contact

**documents**
- File storage tracking
- Fields: document_type, file_path, mime_type, size, status
- Tracking: reviewed_by, reviewed_at, review_notes

**appeals**
- Ban/delete appeals with multi-admin review
- Conflict-of-interest check: original_admin_id vs review_admin_id
- Response deadline: 7 days

**case_appeals**
- Hospital case rejection appeals
- Status: pending/reopened/rejected_final
- Deadline: 7 days from rejection

**action_logs**
- Comprehensive audit trail
- Captures: user_id (target), admin_id (performer), action_type, reason
- Meta: IP address, user agent, action_details (JSON)

**activities**
- Activity feed for dashboards
- Emoji-coded activity types
- Scope filtering: scope_hospital_id for hospital-level visibility

---

## Demo Accounts

### All demo passwords: `Admin@123` (for first two) or hospital-specific

| Email | Password | Role | Hospital | Notes |
|-------|----------|------|----------|-------|
| admin@odcat.com | Admin@123 | Super Admin | - | Full system access |
| dr.ali@odcat.com | Admin@123 | Admin | - | User management, hospital approval |
| cmh@odcat.com | Admin@123 | Hospital | CMH Rawalpindi | Hospital-scoped dashboard |

**Test Case: Donor Registration Workflow**

1. **Super Admin** (`admin@odcat.com`) logs in → Dashboard shows metrics
2. Create new **Donor**:
   - Name: "Test Donor"
   - Email: "testdonor@example.com"
   - Password: "SecurePass@123"
   - Role: "donor"
3. Donor completes registration → submits to hospital
4. **Hospital Admin** (`cmh@odcat.com`) reviews case:
   - Approves or requests more info
5. **Admin** (`dr.ali@odcat.com`) sees all activity in audit logs

---

## Troubleshooting

### Issue: "Target class [App\Http\Controllers\AuthController] does not exist"

**Solution**: Auth controllers are in `App/Http/Controllers/Auth/` namespace. Routes file must use:
```php
use App\Http\Controllers\Auth\AuthController;
```

### Issue: "Rate limiter [api] is not defined"

**Solution**: Rate limiters are defined in `AppServiceProvider.php` boot() method. Ensure they're registered:
```php
RateLimiter::for('api', function ($request) {
    return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
});
```

### Issue: MySQL connection error

**Solution**:
1. Verify XAMPP MySQL is running (green indicator)
2. Check `.env`: `DB_HOST=127.0.0.1`, `DB_USERNAME=root`, `DB_PASSWORD=` (empty)
3. Test: `mysql -u root` from command line

### Issue: Frontend can't reach backend API

**Solution**:
1. Verify backend is running: `http://localhost:8000/api/health` returns `{"status":"ok"}`
2. Check `src/utils/api.js`: API_BASE should be `http://localhost:8000/api`
3. CORS is configured in `bootstrap/app.php` to allow requests from `localhost:3000`

### Issue: "Email already exists" on registration

**Solution**: Email must be unique. Use a new email like `user-` + timestamp or clear database:
```bash
php artisan migrate:fresh --seed
```

---

## Production Deployment Checklist

Before deploying to production:

- [ ] Set `APP_ENV=production` in `.env`
- [ ] Set `APP_DEBUG=false` in `.env`
- [ ] Generate new `APP_KEY`: `php artisan key:generate`
- [ ] Configure real database (not local XAMPP)
- [ ] Set up proper email service (not `log` driver)
- [ ] Configure Google OAuth credentials in `.env`
- [ ] Set up database backups (Spatie Backup configured)
- [ ] Configure HTTPS/SSL certificates
- [ ] Run `php artisan optimize` for production caching
- [ ] Set proper file permissions on `storage/` and `bootstrap/cache/`
- [ ] Test all APIs with Postman/browser before going live

---

## Development Tips

### Enable Debug Mode

Edit `.env`:
```ini
APP_DEBUG=true
```

Errors will appear in JSON responses with stack traces.

### View Activity Logs

```bash
tail -f "c:\Users\ilaib\Desktop\Organ-Donation-Campaign-Analysis-Tool\backend\storage\logs\laravel.log"
```

All actions (register, login, ban, appeal, etc.) are logged here.

### Database Commands

Reset everything (WARNING: deletes all data):
```bash
php artisan migrate:fresh --seed
```

Migrate only (keep existing data):
```bash
php artisan migrate
```

Seed only (add demo data):
```bash
php artisan db:seed
```

### API Rate Limiting

Configured in `AppServiceProvider.php`:
- Login: 5 attempts per 60 seconds (per IP)
- Password reset: 3 attempts per 10 minutes (per IP)
- Email verification: 3 attempts per 5 minutes (per IP)
- General API: 60 requests per minute (per user or IP)

---

## Documentation

- **Controllers**: `backend/app/Http/Controllers/` (12 files)
- **Models**: `backend/app/Models/` (12 models with full relationships)
- **Migrations**: `backend/database/migrations/` (10 migration files)
- **Middleware**: `backend/app/Http/Middleware/` (custom security middleware)
- **Routes**: `backend/routes/api.php` (60+ endpoints)
- **API Service**: `src/utils/api.js` (frontend API client)
- **Auth Utilities**: `src/utils/auth.js` (1400+ lines of helper functions)

---

## Support & Issues

For issues or questions:
1. Check `storage/logs/laravel.log` for backend errors
2. Check browser console (F12) for frontend errors
3. Verify all services are running:
   - `curl http://localhost:8000/api/health`
   - `http://localhost:3000/` loads in browser
   - MySQL is running in XAMPP

---

## License

Internal use only. All rights reserved.

---

**Last Updated**: May 2026
**Version**: 1.0 (Production Ready)
