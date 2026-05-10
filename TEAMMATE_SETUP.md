# ODCAT — Quick Setup for Collaborators

This file gets you running locally **without anyone sharing secrets**. You'll generate your own `APP_KEY`, your own DB password, and (optionally) your own Gmail App Password.

> 🔒 **Never ask anyone to send you their `.env` file.** It contains live credentials. Use this guide instead.

## Prerequisites

- **PHP 8.2+** + **Composer** (XAMPP works on Windows)
- **MySQL 8** (or MariaDB) running locally
- **Node.js 18+** + **npm**
- **Git**

## 1. Clone

```bash
git clone https://github.com/ehtishameti09-ui/Organ-Donation-Campaign-Analysis-Tool.git odcat
cd odcat
```

## 2. Backend (Laravel)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

Open `backend/.env` and set your **own** local DB values:

```env
DB_DATABASE=odcat_backend
DB_USERNAME=root
DB_PASSWORD=          # leave blank for default XAMPP, otherwise your local password
```

Create the database (in phpMyAdmin or via CLI):

```sql
CREATE DATABASE odcat_backend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Run migrations and seed demo data:

```bash
php artisan migrate --seed
```

Start the API:

```bash
php artisan serve --port=8000
```

API now at `http://localhost:8000`.

## 3. Frontend (React + Vite)

In a **new terminal**, from the project root:

```bash
npm install
npm run dev
```

App now at `http://localhost:3000`.

## 4. Demo Accounts

Created automatically by the seeder:

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@odcat.com` | `Admin@123` |
| Admin | `dr.ali@odcat.com` | `Admin@123` |
| Hospital | `cmh@odcat.com` | `Hospital@123` |
| Donor | `ahmed.khan@odcat.com` | `Donor@123` |
| Recipient | `nadia.qureshi@odcat.com` | `Recipient@123` |

---

## Two-Factor Authentication (2FA)

Any user can enable email-OTP 2FA from **Account Settings → Security → Set Up 2FA**. After it's enabled, every login (including Google sign-in) requires a 6-digit code emailed to that account.

### Where do the OTPs go?

By default `MAIL_MAILER=log` in `.env.example`, which means **emails are written to a log file, not actually sent**. Open this file to read codes during development:

```
backend/storage/logs/laravel-YYYY-MM-DD.log
```

Look for lines like `Your ODCAT verification code is: 123456`.

### Optional: deliver real emails to your inbox

You only need this if you want OTPs to land in a real inbox (e.g. for testing the full flow end-to-end). **Use your OWN Gmail account — never anyone else's credentials.**

1. Enable **2-Step Verification** on your Gmail account.
2. Go to *Google Account → Security → App passwords*, create one named `ODCAT-mail`, copy the 16 characters Google shows (only shown once).
3. Update `backend/.env`:

   ```env
   MAIL_MAILER=smtp
   MAIL_HOST=smtp.gmail.com
   MAIL_PORT=587
   MAIL_USERNAME=your-gmail@gmail.com
   MAIL_PASSWORD="your16charapppw"
   MAIL_ENCRYPTION=tls
   MAIL_FROM_ADDRESS="your-gmail@gmail.com"
   ```

4. Apply and restart:

   ```bash
   php artisan config:clear
   # then stop and restart `php artisan serve`
   ```

If you accidentally commit or leak the App Password, **revoke it immediately** at *Google Account → Security → App passwords*.

---

## Optional: Google sign-in

The "Continue with Google" button is auto-disabled when `GOOGLE_CLIENT_ID` is empty. If you want to enable it locally:

1. Create an OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — type "Web application".
2. Add authorized redirect URI: `http://localhost:8000/api/oauth/google/callback`
3. Set in `backend/.env`:

   ```env
   GOOGLE_CLIENT_ID=...your client id...
   GOOGLE_CLIENT_SECRET=...your client secret...
   GOOGLE_REDIRECT_URI=http://localhost:8000/api/oauth/google/callback
   ```

4. Restart Laravel.

---

## What NEVER to share or commit

These contain secrets and are already in `.gitignore`:

- `backend/.env` — your `APP_KEY`, DB password, Gmail App Password, Google OAuth secret
- `backend/storage/logs/*` — may contain OTP codes, request data, error stack traces

If a teammate asks for your `.env`, **send them this file instead**.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `SQLSTATE[HY000] [2002]` | MySQL isn't running — start it (XAMPP / `mysqld`) |
| `vite: command not found` | Run `npm install` from the project root |
| CORS errors in browser | Confirm `FRONTEND_URL=http://localhost:3000` in `backend/.env` |
| 2FA OTP not in inbox | You're on `MAIL_MAILER=log` — read it from `storage/logs/laravel-*.log`, or configure SMTP above |
| `Class "App\Http\..."` errors | `composer dump-autoload` then restart Laravel |
| Database changes not appearing | `php artisan migrate:fresh --seed` (⚠ wipes data) |

---

## Project layout

| Path | What lives there |
|---|---|
| `src/` | React frontend (Vite) |
| `backend/app/Http/Controllers/` | API controllers |
| `backend/app/Models/` | Eloquent models |
| `backend/database/migrations/` | Schema migrations |
| `backend/database/seeders/` | Demo data seeders |
| `backend/routes/api.php` | All API endpoints |
| `backend/storage/logs/` | Laravel logs (incl. emailed OTPs in dev) |
