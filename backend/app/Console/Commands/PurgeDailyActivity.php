<?php

namespace App\Console\Commands;

use App\Models\Activity;
use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Daily housekeeping for the UI feeds.
 *
 * The "Recent Activity" feed (activities table) and user notifications
 * (notifications table) would otherwise grow without bound. This command uses a
 * rolling window: any row older than 24 hours is first written, line by line,
 * to the permanent `activity_archive` log file and then removed from the
 * database, so the feeds auto-clear roughly a day after each entry appears.
 *
 * The audit trail (`action_logs`) is intentionally NOT touched here — every
 * action remains permanently recorded there. This command only trims the
 * cosmetic dashboard/notification feeds so they refresh each day.
 */
class PurgeDailyActivity extends Command
{
    protected $signature = 'activity:purge-daily
                            {--hours=24 : Delete rows older than this many hours}';

    protected $description = 'Archive recent activities & notifications older than 24h to a log file, then delete them so the UI feeds do not pile up';

    public function handle(): int
    {
        $hours = max(1, (int) $this->option('hours'));
        // Rolling window: anything older than `hours` ago is archived & purged.
        $cutoff = Carbon::now()->subHours($hours);

        $archive = Log::channel('activity_archive');
        $runId = now()->toDateTimeString();

        $activitiesPurged = $this->purge(
            table: 'activities',
            label: 'activity',
            cutoff: $cutoff,
            archive: $archive,
            runId: $runId,
        );

        $notificationsPurged = $this->purge(
            table: 'notifications',
            label: 'notification',
            cutoff: $cutoff,
            archive: $archive,
            runId: $runId,
        );

        $summary = "Daily purge complete — archived & deleted {$activitiesPurged} activity row(s) and {$notificationsPurged} notification row(s) older than {$cutoff->toDateTimeString()}.";
        $archive->info($summary, ['run' => $runId]);
        $this->info($summary);

        return self::SUCCESS;
    }

    /**
     * Stream rows older than the cutoff to the archive log, then bulk-delete them.
     * Uses the query builder for the delete so it bypasses the Activity model's
     * immutability guard — that guard protects against accidental edits/deletes
     * in normal request code, while this scheduled, archive-first prune is the
     * one sanctioned path that is allowed to remove old feed rows.
     */
    private function purge(string $table, string $label, Carbon $cutoff, $archive, string $runId): int
    {
        $total = 0;

        DB::table($table)
            ->where('created_at', '<', $cutoff)
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($table, $label, $archive, $runId, &$total) {
                $ids = [];
                foreach ($rows as $row) {
                    $ids[] = $row->id;
                    $archive->info("[{$label}] " . json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), [
                        'run' => $runId,
                    ]);
                }
                DB::table($table)->whereIn('id', $ids)->delete();
                $total += count($ids);
            });

        return $total;
    }
}
