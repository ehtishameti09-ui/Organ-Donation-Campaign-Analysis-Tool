<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Allow the unified Appeal system to handle rejected donor/recipient cases.
        DB::statement("ALTER TABLE appeals MODIFY COLUMN original_action ENUM('ban','delete','case_rejection') NOT NULL");

        // Record which admin rejected a case so the appeal can be routed to a
        // DIFFERENT admin (conflict-of-interest) and the donor can see the reason.
        foreach (['donor_profiles', 'recipient_profiles'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->unsignedBigInteger('rejected_by')->nullable();
                $t->text('rejection_reason')->nullable();
                $t->timestamp('rejected_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE appeals MODIFY COLUMN original_action ENUM('ban','delete') NOT NULL");

        foreach (['donor_profiles', 'recipient_profiles'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn(['rejected_by', 'rejection_reason', 'rejected_at']);
            });
        }
    }
};
