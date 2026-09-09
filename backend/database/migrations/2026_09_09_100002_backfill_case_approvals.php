<?php

use App\Models\AllocationDecision;
use App\Models\CaseApproval;
use Illuminate\Database\Migrations\Migration;

/**
 * Every allocation decision made before Module 7 existed still needs a
 * governance case, otherwise those transplants sit in limbo: confirmed by the
 * engine but with no board entry that could ever clear them.
 *
 * Rejected decisions are already terminal and get no case. Runs once and is
 * idempotent — decisions that already have a case are skipped.
 */
return new class extends Migration
{
    public function up(): void
    {
        $existing = CaseApproval::pluck('allocation_decision_id')->all();

        AllocationDecision::with('run:id,organ,donor_user_id')
            ->where('was_rejected', false)
            ->whereNotIn('id', $existing)
            ->chunkById(200, function ($decisions) {
                foreach ($decisions as $d) {
                    CaseApproval::create([
                        'allocation_decision_id' => $d->id,
                        'hospital_id'            => $d->hospital_id,
                        'donor_user_id'          => optional($d->run)->donor_user_id,
                        'recipient_user_id'      => $d->selected_recipient_id,
                        'organ'                  => optional($d->run)->organ,
                        'stage'                  => 'checklist',
                        'requires_multi_user'    => true,
                        'checklist'              => CaseApproval::freshChecklist(),
                        'allocated_at'           => $d->created_at ?? now(),
                    ]);
                }
            });
    }

    public function down(): void
    {
        // The forward migration only fills gaps; dropping the table (in the
        // create migration's down()) is the real rollback.
    }
};
