<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Keeps the Recent Activity & notification feeds from piling up WITHOUT
 * relying on an OS cron / Task Scheduler.
 *
 * After a response is sent (terminate — so it never slows a request), this
 * checks a cache marker. At most once per hour it runs `activity:purge-daily`,
 * which archives every activity/notification row older than 24h to
 * storage/logs/activity-archive.log and then deletes it. With the app in normal
 * use this guarantees the feeds auto-clear ~24h after each entry, and the
 * scheduled command still works too if a real cron is ever configured.
 */
class AutoPurgeFeeds
{
    /** Run the purge sweep at most this often (minutes). */
    private const THROTTLE_MINUTES = 60;

    public function handle(Request $request, Closure $next)
    {
        return $next($request);
    }

    public function terminate(Request $request, $response): void
    {
        // add() is atomic: only the first request after the TTL expires wins
        // the lock and performs the sweep; everyone else returns immediately.
        if (! Cache::add('feeds:auto-purge:lock', 1, now()->addMinutes(self::THROTTLE_MINUTES))) {
            return;
        }

        try {
            Artisan::call('activity:purge-daily', ['--hours' => 24]);
        } catch (\Throwable $e) {
            // Never let housekeeping break a request lifecycle; just note it.
            Log::warning('AutoPurgeFeeds sweep failed: '.$e->getMessage());
        }
    }
}
