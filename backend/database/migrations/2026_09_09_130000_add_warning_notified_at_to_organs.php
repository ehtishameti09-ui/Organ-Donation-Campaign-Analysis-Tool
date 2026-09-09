<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Unattended cold-chain alerting needs a second idempotency stamp.
 *
 * Alerting only on breach is alerting too late — by then the organ may already
 * be unusable. The scheduled monitor also warns at 85% of the limit, while
 * there is still time to act, and this column stops that warning repeating on
 * every sweep the same way breach_notified_at does for the breach.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organs', function (Blueprint $table) {
            $table->timestamp('warning_notified_at')->nullable()->after('breach_notified_at');
        });
    }

    public function down(): void
    {
        Schema::table('organs', function (Blueprint $table) {
            $table->dropColumn('warning_notified_at');
        });
    }
};
