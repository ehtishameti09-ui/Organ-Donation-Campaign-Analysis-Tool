<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Idempotency stamp for stalled-offer escalation.
 *
 * The offer stage introduced a new way to strand an organ: before it existed, the
 * procuring hospital could complete an approval on its own, so nothing could block
 * indefinitely. Now a case waits on a counterparty who might simply not look at
 * it, while the cold-ischemia clock runs. Something has to chase it.
 *
 * Same pattern as organs.breach_notified_at: a nullable timestamp, set once, so a
 * command running every five minutes sends one reminder rather than one per tick.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_approvals', function (Blueprint $table) {
            $table->timestamp('offer_escalated_at')->nullable()->after('offer_seconds');
            // The scheduled sweep looks for open offers only.
            $table->index(['stage', 'offer_sent_at']);
        });
    }

    public function down(): void
    {
        Schema::table('case_approvals', function (Blueprint $table) {
            $table->dropIndex(['stage', 'offer_sent_at']);
            $table->dropColumn('offer_escalated_at');
        });
    }
};
