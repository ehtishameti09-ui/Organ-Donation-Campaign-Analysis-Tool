<?php

namespace App\Services;

use App\Models\Organ;
use App\Models\OrganEvent;
use App\Models\User;

/**
 * Module 8.1 — the single place cold-chain alerts are raised.
 *
 * Two callers share this so they can never disagree:
 *
 *  - OrganController, on any registry read. Keeps the UI instantly correct for
 *    whoever is looking, with no dependency on a daemon being alive.
 *  - organs:check-cold-chain, run by the scheduler. Makes alerting unattended:
 *    the email goes out even if nobody has the app open.
 *
 * Whichever gets there first wins the row and sends exactly one alert. That is
 * enforced by a conditional UPDATE (see claim()), not by a lock — if two
 * processes observe the same breach in the same instant, only one UPDATE
 * matches, and the loser stays silent.
 */
class ColdChainMonitor
{
    /**
     * Raise any outstanding warning/breach alerts for the given organs.
     *
     * @param  iterable<Organ>|null $organs  Defaults to every live organ.
     * @param  bool $immediateEmail  True in console context, where there is no
     *                               HTTP response to send the mail after.
     * @return array<int, array{reference: string, level: string}>
     */
    public function sweep(?iterable $organs = null, bool $immediateEmail = false): array
    {
        $organs ??= Organ::whereNotIn('status', Organ::TERMINAL)
            ->whereNotNull('recovered_at')
            ->get();

        $raised = [];

        foreach ($organs as $organ) {
            if ($organ->isTerminal()) continue;

            $state = $organ->coldChain()['state'];

            if ($state === 'breached' && !$organ->breach_notified_at) {
                if ($this->claim($organ, 'breach_notified_at')) {
                    $this->alert($organ, 'breached', $immediateEmail);
                    $raised[] = ['reference' => $organ->reference, 'level' => 'breached'];
                }
                continue;
            }

            if ($state === 'warning' && !$organ->warning_notified_at) {
                if ($this->claim($organ, 'warning_notified_at')) {
                    $this->alert($organ, 'warning', $immediateEmail);
                    $raised[] = ['reference' => $organ->reference, 'level' => 'warning'];
                }
            }
        }

        return $raised;
    }

    /**
     * Atomically claim the right to send this alert.
     *
     * The WHERE ... IS NULL is what makes it safe: only one UPDATE can match,
     * so concurrent sweeps cannot both send. Returns true for the winner.
     */
    private function claim(Organ $organ, string $column): bool
    {
        $won = Organ::where('id', $organ->id)->whereNull($column)->update([$column => now()]);

        if ($won) $organ->{$column} = now();

        return (bool) $won;
    }

    private function alert(Organ $organ, string $level, bool $immediateEmail): void
    {
        $chain  = $organ->coldChain();
        $hours  = round($chain['elapsed_minutes'] / 60, 1);
        $limitH = round($chain['limit_minutes'] / 60, 1);
        $left   = round(max(0, $chain['remaining_minutes']) / 60, 1);

        if ($level === 'breached') {
            $title = "Cold ischemia limit exceeded — {$organ->reference}";
            $body  = "The {$organ->organ_type} recorded as {$organ->reference} has EXCEEDED its cold ischemia limit.\n\n"
                   . "Elapsed: {$hours}h\n"
                   . "Limit:   {$limitH}h\n"
                   . "Recovered: " . optional($organ->recovered_at)->toDayDateTimeString() . "\n\n"
                   . "This organ requires immediate review — viability may be compromised.";
            $eventTitle = 'Cold ischemia limit exceeded';
            $eventDesc  = "Elapsed {$hours}h against a {$limitH}h limit.";
        } else {
            $title = "Cold ischemia warning — {$organ->reference} ({$chain['percent_used']}% used)";
            $body  = "The {$organ->organ_type} recorded as {$organ->reference} is approaching its cold ischemia limit.\n\n"
                   . "Elapsed:   {$hours}h ({$chain['percent_used']}% of the limit)\n"
                   . "Limit:     {$limitH}h\n"
                   . "Remaining: approximately {$left}h\n"
                   . "Recovered: " . optional($organ->recovered_at)->toDayDateTimeString() . "\n\n"
                   . "Transplant or transfer should be underway. This is a warning, not a breach — there is still time to act.";
            $eventTitle = 'Cold ischemia warning';
            $eventDesc  = "Reached {$chain['percent_used']}% of the {$limitH}h limit.";
        }

        $hospital = User::find($organ->hospital_id);

        Notifier::persistent($organ->hospital_id, "cold_chain_{$level}", $title, $body, [
            'organ_id'        => $organ->id,
            'reference'       => $organ->reference,
            'level'           => $level,
            'elapsed_minutes' => $chain['elapsed_minutes'],
            'limit_minutes'   => $chain['limit_minutes'],
        ]);

        Notifier::email($hospital?->email, $title, $body, $immediateEmail);

        OrganEvent::record($organ->id, "cold_chain_{$level}", $eventTitle, $eventDesc, null, $chain);

        ActivityLogger::logActivity(
            $level === 'breached' ? 'organ_breach' : 'organ_warning',
            $eventTitle,
            "{$organ->reference} — {$eventDesc}",
            ['user_id' => $organ->hospital_id]
        );
    }
}
