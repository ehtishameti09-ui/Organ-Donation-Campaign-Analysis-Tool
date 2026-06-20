<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Email 2FA is now ON by default for every new account. Existing accounts are
// also opted-in so the security posture is consistent across the user base.
// Anyone who doesn't want it can still disable it from Account Settings.
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('two_factor_enabled')->default(true)->change();
        });

        // Backfill: enable 2FA for every existing account that hasn't already turned it on.
        DB::table('users')->where('two_factor_enabled', false)->update(['two_factor_enabled' => true]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('two_factor_enabled')->default(false)->change();
        });
    }
};
