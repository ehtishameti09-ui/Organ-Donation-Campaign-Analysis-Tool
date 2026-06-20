<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Reverts the 2FA-on-by-default rollout. New accounts default to 2FA OFF,
// and every existing account is reset to OFF too. Users who want 2FA can
// enable it themselves from Account Settings.
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('two_factor_enabled')->default(false)->change();
        });

        DB::table('users')->where('two_factor_enabled', true)->update(['two_factor_enabled' => false]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('two_factor_enabled')->default(true)->change();
        });

        DB::table('users')->where('two_factor_enabled', false)->update(['two_factor_enabled' => true]);
    }
};
