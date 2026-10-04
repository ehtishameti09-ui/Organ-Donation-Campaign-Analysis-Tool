<?php

namespace App\Console\Commands;

use App\Models\CaseApproval;
use App\Models\Organ;
use App\Models\User;
use App\Services\Notifier;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Chase organ offers that nobody has answered.
 *
 * The two-sided approval board makes the procuring hospital wait for the receiving
 * hospital's decision, which is correct - that hospital holds the patient's chart
 * and obtains their consent. But it also created a failure mode that did not exist
 * before: previously a hospital could complete an approval on its own, so nothing
 * could block indefinitely. Now an offer can sit untouched while the
 * cold-ischemia clock runs, and the organ is lost to a missed notification rather
 * than to any clinical decision.
 *
 * Nobody is blamed and nothing is auto-declined. Auto-declining on a timeout would
 * be worse than the stall: it would record a clinical decision that no clinician
 * made, against a patient who might well have been accepted. Instead both sides are
 * told - the receiving hospital so it can answer, and the procuring hospital so it
 * can pick up the phone or route the organ elsewhere by hand.
 *
 * Scheduled every five minutes alongside organs:check-cold-chain.
 *
 *   php artisan offers:check-stalled --dry-run
 */
class CheckStalledOffers extends Command
{
    protected $signature = 'offers:check-stalled {--dry-run : Report without notifying or stamping}';

    protected $description = 'Remind both hospitals about organ offers left unanswered too long';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $fraction = (float) config('governance.offer_escalation_fraction', 0.20);
        $floor    = (int) config('governance.offer_escalation_min_minutes', 30);

        // Open offers that have never been escalated. Ordered oldest first so the
        // most urgent are handled even if a later one somehow throws.
        $pending = CaseApproval::where('stage', 'offer')
            ->whereNull('offer_escalated_at')
            ->whereNotNull('offer_sent_at')
            ->orderBy('offer_sent_at')
            ->get();

        if ($pending->isEmpty()) {
            $this->info('No unanswered offers past their threshold.');
            return self::SUCCESS;
        }

        $escalated = 0;
        $waiting   = 0;

        foreach ($pending as $case) {
            $limit     = Organ::limitFor($case->organ);
            $threshold = max($floor, (int) round($limit * $fraction));
            $openFor   = $case->offer_sent_at->diffInMinutes(now());

            if ($openFor < $threshold) {
                $waiting++;
                continue;
            }

            $this->line(sprintf(
                '  case #%d (%s): open %d min, threshold %d min',
                $case->id, $case->organ ?? 'organ', $openFor, $threshold
            ));

            if ($dry) { $escalated++; continue; }

            // Conditional update, so two overlapping runs cannot both notify.
            $claimed = DB::table('case_approvals')
                ->where('id', $case->id)
                ->where('stage', 'offer')
                ->whereNull('offer_escalated_at')
                ->update(['offer_escalated_at' => now()]);

            if (!$claimed) continue;

            $this->escalate($case, $openFor, $threshold);
            $escalated++;
        }

        $this->newLine();
        $this->info(sprintf(
            '%d offer(s) %s, %d still within threshold.',
            $escalated, $dry ? 'would be escalated' : 'escalated', $waiting
        ));

        return self::SUCCESS;
    }

    private function escalate(CaseApproval $case, int $openFor, int $threshold): void
    {
        $organ    = $case->organ ? strtolower($case->organ) : 'organ';
        $hours    = round($openFor / 60, 1);
        $meta     = ['approval_id' => $case->id, 'organ' => $case->organ, 'kind' => 'offer_stalled'];

        $receiving = $case->recipient_hospital_id ? User::find($case->recipient_hospital_id) : null;
        $procuring = $case->hospital_id ? User::find($case->hospital_id) : null;

        Notifier::notifyAndEmail($receiving, 'offer_stalled', "URGENT: {$organ} offer still awaiting your decision",
            "A {$organ} offer for one of your patients (case #{$case->id}) has been open for {$hours} hour(s) "
            . "with no answer, past the {$threshold}-minute response window for this organ type.\n\n"
            . "The procuring hospital cannot proceed without your decision, and the cold-ischemia clock is running. "
            . "Please accept or decline it now.\n\n"
            . 'If your patient is not suitable, declining promptly lets the organ go to the next candidate '
            . 'rather than being wasted.', $meta);

        Notifier::notifyAndEmail($procuring, 'offer_stalled', "{$organ} offer unanswered after {$hours}h",
            "Case #{$case->id}: the receiving hospital has not yet answered your {$organ} offer "
            . "({$hours} hour(s) open). They have been reminded.\n\n"
            . 'Consider contacting them directly. If they cannot respond, rejecting this case will let you '
            . 'allocate the organ again rather than waiting on it.', $meta);
    }
}
