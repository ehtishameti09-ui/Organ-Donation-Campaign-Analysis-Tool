<?php

namespace App\Console\Commands;

use App\Models\Organ;
use App\Services\ColdChainMonitor;
use Illuminate\Console\Command;

/**
 * Module 8.1 — unattended cold-chain alerting.
 *
 * Run on a schedule, this is what makes the alert independent of anyone having
 * the app open. It sweeps every live organ, and for any that has crossed the
 * warning (85%) or breach (100%) line without having been alerted, it sends the
 * email and records the event.
 *
 * Deliberately does NOT use the queue. QUEUE_CONNECTION is `database` and no
 * worker runs here, so a queued mail would sit in the jobs table unsent — the
 * exact silent failure this command exists to remove. The command is already
 * running in the background, so sending inline costs nothing that matters.
 *
 * Also marks organs that are past their limit and still sitting unused as
 * `expired`, which is what makes the expired-organ rate in the utilization
 * metrics real rather than something a human has to remember to record.
 */
class CheckColdChain extends Command
{
    protected $signature = 'organs:check-cold-chain
                            {--expire-after=48 : Hours past the cold ischemia limit before an untransplanted organ is auto-marked expired. 0 disables.}
                            {--dry-run : Report what would be alerted without sending anything}';

    protected $description = 'Send cold ischemia warning/breach alerts for organs that have crossed their limit, and retire long-expired organs';

    public function handle(ColdChainMonitor $monitor): int
    {
        $live = Organ::whereNotIn('status', Organ::TERMINAL)->whereNotNull('recovered_at')->get();

        if ($live->isEmpty()) {
            $this->info('No organs currently in the cold chain.');
            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $pending = $live->filter(function ($o) {
                $s = $o->coldChain()['state'];
                return ($s === 'breached' && !$o->breach_notified_at)
                    || ($s === 'warning' && !$o->warning_notified_at);
            });

            $this->info("Dry run — {$live->count()} live organ(s), {$pending->count()} would alert:");
            foreach ($pending as $o) {
                $c = $o->coldChain();
                $this->line("  {$o->reference} ({$o->organ_type}) — {$c['state']}, {$c['percent_used']}% of limit");
            }
            return self::SUCCESS;
        }

        $raised = $monitor->sweep($live, immediateEmail: true);

        foreach ($raised as $r) {
            $this->line("  alerted {$r['reference']} — {$r['level']}");
        }

        $expired = $this->retireLongExpired($live);

        $this->info(sprintf(
            'Cold chain check complete — %d live organ(s), %d alert(s) sent, %d auto-expired.',
            $live->count(), count($raised), $expired
        ));

        return self::SUCCESS;
    }

    /**
     * An organ far past its limit and still not transplanted is not "in the cold
     * chain" any more, it is waste. Retiring it keeps the live list meaningful
     * and stops it being alerted about forever.
     *
     * The threshold is generous (default 48h past the limit) because this is an
     * automated write against clinical data — it should only fire where the
     * outcome is not in any doubt.
     */
    private function retireLongExpired($live): int
    {
        $graceHours = (int) $this->option('expire-after');
        if ($graceHours <= 0) return 0;

        $count = 0;

        foreach ($live as $organ) {
            $chain = $organ->coldChain();
            if ($chain['state'] !== 'breached') continue;

            $overBy = $chain['elapsed_minutes'] - $chain['limit_minutes'];
            if ($overBy < $graceHours * 60) continue;

            $organ->update([
                'status'         => 'expired',
                'discarded_at'   => now(),
                'discard_reason' => sprintf(
                    'Automatically retired: %sh past the %sh cold ischemia limit without transplant.',
                    round($chain['elapsed_minutes'] / 60, 1),
                    round($chain['limit_minutes'] / 60, 1)
                ),
            ]);

            \App\Models\OrganEvent::record($organ->id, 'expired', 'Recorded as expired',
                "Automatically retired by the scheduled cold chain check — {$graceHours}h past the limit with no transplant recorded.");

            $this->line("  expired {$organ->reference}");
            $count++;
        }

        return $count;
    }
}
