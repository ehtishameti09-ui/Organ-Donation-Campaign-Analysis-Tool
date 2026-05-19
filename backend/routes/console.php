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
