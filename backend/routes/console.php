<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Every day just after midnight, archive the previous days' Recent Activity and
// notification rows to storage/logs/activity-archive.log and delete them so the
// UI feeds reset daily. The audit trail (action_logs) is left untouched.
Schedule::command('activity:purge-daily')
    ->dailyAt('00:05')
    ->withoutOverlapping();

// Module 8.1 — unattended cold ischemia alerting.
//
// Every five minutes, warn on organs that have reached 85% of their limit and
// alert on any that have passed it. Without this the alert only fires when a
// human happens to open the app, which is no use overnight — and the tightest
// window in the system is a heart at four hours.
//
// Five minutes is chosen against that four-hour window: it bounds the worst-case
// alerting delay to ~2% of the shortest limit, while staying cheap (one indexed
// query over live organs, which is a handful of rows, not a table scan).
//
// withoutOverlapping is belt-and-braces — the alerts are already idempotent via
// their conditional UPDATE — and runInBackground keeps a slow SMTP handshake
// from delaying anything else on the schedule.
Schedule::command('organs:check-cold-chain')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();
