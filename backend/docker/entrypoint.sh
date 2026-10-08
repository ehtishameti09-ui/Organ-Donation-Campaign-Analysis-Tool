#!/usr/bin/env bash
#
# Container entrypoint: wait for the database, prepare the app, start Apache.
#
# Ordering matters. Apache must not accept traffic before migrations have run, or
# the first visitor hits a schema that does not exist yet and sees a 500 - and on a
# free tier that sleeps, "the first visitor" happens repeatedly.

set -euo pipefail

echo "[entrypoint] starting"

# ---------------------------------------------------------------- $PORT
# Render (and most container hosts) inject the port to bind. Apache's shipped
# config hardcodes 80, so rewrite it. Default matches Render's convention so the
# image also runs locally with `docker run -p 10000:10000`.
PORT="${PORT:-10000}"
echo "[entrypoint] binding Apache to port ${PORT}"
sed -ri "s/^Listen 80$/Listen ${PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

# ---------------------------------------------------------------- APP_KEY
# Laravel cannot decrypt sessions or the OAuth state parameter without it. A
# generated-at-boot key would change on every restart and invalidate every
# existing session, so this is a hard failure rather than a silent fallback.
if [ -z "${APP_KEY:-}" ]; then
  echo "[entrypoint] FATAL: APP_KEY is not set."
  echo "[entrypoint] Generate one locally with:  php artisan key:generate --show"
  echo "[entrypoint] then set it as an environment variable on the host."
  exit 1
fi

# ---------------------------------------------------------------- database
# A managed database and the app container start independently; the database is
# often still accepting-connections-soon when we get here.
if [ -n "${DB_HOST:-}" ]; then
  echo "[entrypoint] waiting for ${DB_HOST}:${DB_PORT:-3306}"
  for i in $(seq 1 30); do
    if mysqladmin ping -h"${DB_HOST}" -P"${DB_PORT:-3306}" --silent 2>/dev/null; then
      echo "[entrypoint] database reachable after ${i} attempt(s)"
      break
    fi
    if [ "$i" = "30" ]; then
      echo "[entrypoint] FATAL: database unreachable after 30 attempts (~60s)."
      echo "[entrypoint] Check DB_HOST/DB_PORT and that the database allows connections from this host."
      exit 1
    fi
    sleep 2
  done
fi

# ---------------------------------------------------------------- app
# Clear first: the image may have been built with caches baked in from a local
# run, and a stale cached config would point at the wrong database.
php artisan config:clear --quiet || true

php artisan deploy:prepare

# ---------------------------------------------------------------- scheduler
# The cold-chain sweep and the stalled-offer sweep run every five minutes.
# schedule:work is a long-lived foreground process, so it goes to the background
# here alongside Apache.
#
# CAVEAT: on a free tier that sleeps when idle, this only runs while the container
# is awake. Time-critical alerting needs either an always-on instance or an
# external cron hitting the app. See DEPLOYMENT.md.
if [ "${RUN_SCHEDULER:-true}" = "true" ]; then
  echo "[entrypoint] starting scheduler"
  php artisan schedule:work >/dev/stdout 2>&1 &
fi

echo "[entrypoint] handing over to Apache"
exec apache2-foreground
