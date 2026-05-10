<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Adds composite indexes to speed up common query patterns once the dataset
 * grows past a few hundred rows. All indexes are conditional — skipped if
 * already present, so the migration is safe to re-run.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->addIndexIfMissing('users', ['role', 'status', 'preferred_hospital_id'], 'users_role_status_pref_hospital_idx');
        $this->addIndexIfMissing('allocation_runs', ['donor_user_id', 'mode'], 'alloc_runs_donor_mode_idx');
        $this->addIndexIfMissing('allocation_runs', ['mode', 'created_at'], 'alloc_runs_mode_created_idx');
        $this->addIndexIfMissing('allocation_decisions', ['hospital_id', 'was_rejected', 'status'], 'alloc_dec_hospital_rej_status_idx');
        $this->addIndexIfMissing('activities', ['created_at'], 'activities_created_idx');
    }

    public function down(): void
    {
        $this->dropIndexIfExists('users', 'users_role_status_pref_hospital_idx');
        $this->dropIndexIfExists('allocation_runs', 'alloc_runs_donor_mode_idx');
        $this->dropIndexIfExists('allocation_runs', 'alloc_runs_mode_created_idx');
        $this->dropIndexIfExists('allocation_decisions', 'alloc_dec_hospital_rej_status_idx');
        $this->dropIndexIfExists('activities', 'activities_created_idx');
    }

    private function addIndexIfMissing(string $table, array $columns, string $indexName): void
    {
        if (!Schema::hasTable($table)) return;
        $exists = collect(DB::select("SHOW INDEX FROM `{$table}`"))
            ->pluck('Key_name')
            ->contains($indexName);
        if (!$exists) {
            Schema::table($table, fn(Blueprint $t) => $t->index($columns, $indexName));
        }
    }

    private function dropIndexIfExists(string $table, string $indexName): void
    {
        if (!Schema::hasTable($table)) return;
        $exists = collect(DB::select("SHOW INDEX FROM `{$table}`"))
            ->pluck('Key_name')
            ->contains($indexName);
        if ($exists) {
            Schema::table($table, fn(Blueprint $t) => $t->dropIndex($indexName));
        }
    }
};
