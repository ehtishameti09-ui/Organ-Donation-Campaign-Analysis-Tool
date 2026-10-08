# Deploying ODCAT

Written for: whoever is putting this online — you, or a teammate who has never
seen the project. Follow it top to bottom; every step says what to copy where.

---

## Why this takes three services

ODCAT is not a static site. It is a React frontend **and** a Laravel 11 API **and**
a MySQL database, and the three have genuinely different hosting needs:

| Part | Needs | Goes on |
|---|---|---|
| React (`src/`) | Static file serving | **Vercel** — free, fast, never sleeps |
| Laravel (`backend/`) | PHP 8.2, persistent disk, cron | **Render** — free Docker container |
| MySQL | Managed database | **Aiven** or **Clever Cloud** — free MySQL |

**Vercel cannot host the backend.** It has no PHP runtime, no MySQL, and wipes the
filesystem on every deploy — which would delete uploaded documents. Trying to put
Laravel on Vercel is the single most common way this goes wrong.

Render has no free MySQL (only Postgres), which is why the database is a third
provider.

---

## Before you start

Generate an app key and keep it somewhere safe:

```bash
cd backend
php artisan key:generate --show
```

Copy the whole thing, `base64:` prefix included. Laravel uses it to encrypt
sessions and the Google OAuth `state` parameter. **If it changes later, everyone
is signed out** — so set it once and do not regenerate it per deploy.

---

## Step 1 — MySQL

Using **Aiven** (no card required for the free plan):

1. Sign up at [aiven.io](https://aiven.io) → **Create service** → **MySQL**.
2. Pick the **Free** plan and any region near your clients.
3. Wait for it to say *Running* (3–5 minutes).
4. Open the service → **Connection information**. Note these five values:

| Aiven field | Render variable |
|---|---|
| Host | `DB_HOST` |
| Port | `DB_PORT` |
| Database | `DB_DATABASE` |
| User | `DB_USERNAME` |
| Password | `DB_PASSWORD` |

Aiven requires TLS. The blueprint already sets `MYSQL_ATTR_SSL_CA` to the
container's system CA bundle, which is what makes that work — leave it alone.

---

## Step 2 — Backend on Render

1. Push this repository to GitHub if you have not already.
2. At [render.com](https://render.com) → **New** → **Blueprint**.
3. Select the repo. Render reads [`render.yaml`](render.yaml) and proposes a
   service called **odcat-api**. Approve it.
4. It will ask for every variable marked `sync: false`. Fill in:

   | Variable | Value |
   |---|---|
   | `APP_KEY` | the key from *Before you start* |
   | `APP_URL` | `https://odcat-api.onrender.com` (adjust if your name differs) |
   | `FRONTEND_URL` | leave blank for now — Step 4 |
   | `DB_*` | the five Aiven values |
   | `MAIL_*` | see *Email* below |
   | `GOOGLE_*` | optional, see *Google sign-in* below |

5. Deploy. The first build takes 5–10 minutes because it compiles PHP extensions.

The container runs `php artisan deploy:prepare` on boot, which migrates, seeds
demo data **only if the database is empty**, links storage and caches config.
Watch the logs — you should see `[entrypoint] handing over to Apache`.

Check it:

```bash
curl https://odcat-api.onrender.com/api/health
```

### Email

Registration emails a verification link, so **nobody can finish signing up
without working SMTP**. For Gmail:

| Variable | Value |
|---|---|
| `MAIL_HOST` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` | your Gmail address |
| `MAIL_PASSWORD` | a [Google App Password](https://myaccount.google.com/apppasswords) — **not** your account password |
| `MAIL_FROM_ADDRESS` | your Gmail address |

---

## Step 3 — Frontend on Vercel

1. At [vercel.com](https://vercel.com) → **Add New** → **Project** → import the repo.
2. Vercel detects Vite and reads [`vercel.json`](vercel.json). Leave the build
   settings as they are.
3. Add one environment variable, for **all** environments:

   ```
   VITE_API_BASE = https://odcat-api.onrender.com/api
   ```

   Mind the trailing `/api` and no trailing slash.

4. Deploy. You get a URL like `https://odcat.vercel.app`.

> `VITE_API_BASE` is baked into the JavaScript bundle at build time, not read at
> runtime. Changing it requires a **redeploy**, not a restart.

---

## Step 4 — Introduce them to each other

The two services each need the other's URL, so this cannot be done before both
exist.

Back on **Render** → odcat-api → **Environment**:

```
FRONTEND_URL = https://odcat.vercel.app
```

Save; Render redeploys. This is what puts your Vercel domain into the CORS
allow-list in [`backend/config/cors.php`](backend/config/cors.php). **Until you do
this, every request from the deployed site is blocked by the browser** and the app
looks completely broken with nothing useful in the UI — check the browser console
for `No 'Access-Control-Allow-Origin' header` if you see that.

Now open the Vercel URL and sign in.

---

## Google sign-in (optional)

Skip this and the "Continue with Google" button hides itself automatically.

In the [Google Cloud console](https://console.cloud.google.com) → your OAuth
client → **Authorised redirect URIs**, add exactly:

```
https://odcat-api.onrender.com/api/oauth/google/callback
```

Then set on Render:

```
GOOGLE_CLIENT_ID      = ...
GOOGLE_CLIENT_SECRET  = ...
GOOGLE_REDIRECT_URI   = https://odcat-api.onrender.com/api/oauth/google/callback
```

**Set `GOOGLE_REDIRECT_URI` explicitly.** Its fallback in
[`config/services.php`](backend/config/services.php#L41) points at
`/api/auth/google/callback`, but the actual route is `/api/**oauth**/google/callback`
— relying on the default gives you a `redirect_uri_mismatch` that is tedious to
diagnose.

---

## What the free tier will and will not do

Be aware of these **before** you put the link in front of a client.

### The backend sleeps

A free Render service shuts down after ~15 minutes of no traffic. The next request
wakes it, which takes **about 50 seconds**. A client clicking your link cold will
watch a blank screen for the better part of a minute and conclude it is broken.

Two ways to handle it:

- **Warm it before the meeting.** Open the API health URL a minute beforehand.
- **Keep it awake** with a free uptime pinger ([cron-job.org](https://cron-job.org))
  hitting `/api/health` every 10 minutes. The Apache config already excludes that
  path from the access log so it will not drown out real requests.

### Uploaded documents do not survive a deploy

Render's free plan has no persistent disk. Documents uploaded through the app live
in the container and are **deleted on every redeploy**. Fine for a demo; for
anything real, attach a Render disk (paid) or move uploads to S3-compatible object
storage.

The seeded demo data references documents that were never uploaded to this
instance, so document previews will 404 until you upload something. The rest of
the app is unaffected.

### Scheduled sweeps only run while awake

`organs:check-cold-chain` and `offers:check-stalled` are set to run every five
minutes, via `schedule:work` inside the container. A sleeping instance runs
nothing. If timely alerting matters, either keep the instance awake as above, or
set `RUN_SCHEDULER=false` and drive the commands from an external cron.

---

## Security — read this before sharing the link

Going public changes the risk picture in two specific ways.

1. **The demo accounts are publicly known.** `DemoDataSeeder` creates hospital and
   admin logins with fixed passwords, and anyone who reads this repository can see
   them. On a public URL that means strangers can sign in as a hospital
   administrator and change data your client is looking at. If that is not what
   you want, change those passwords after the first deploy:

   ```bash
   php artisan tinker
   # >>> User::where('email','admin@odcat.com')->first()->update(['password' => 'something-else'])
   ```

2. **`FEATURE_VERIFICATION.md` documents 14 security defects**, and the repository
   is public. They are all fixed, but the file is a precise map of what to try, and
   the vulnerable code is still in the git history. That was low-risk while nothing
   was deployed. A live instance makes it a real target.

   If clients are the only intended audience, consider making the GitHub
   repository private — which also hides the history, something deleting the file
   would not.

Also confirm `APP_DEBUG` is `false` on Render. The blueprint sets it, but verify:
Laravel's debug page prints database credentials to anyone who triggers an error.

---

## Redeploying

Both hosts deploy on push to `main`. Render rebuilds the container and re-runs
`deploy:prepare`; Vercel rebuilds the bundle. Neither drops the database.

To reset the demo data deliberately, from Render's shell:

```bash
php artisan migrate:fresh --force && php artisan deploy:prepare --force-seed
```

To slide the demo dates back onto today without touching anything else:

```bash
php artisan demo:refresh-dates
```
