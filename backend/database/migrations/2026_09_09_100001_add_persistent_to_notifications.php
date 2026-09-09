<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The daily purge (activity:purge-daily) clears the notifications table on a
 * 24h rolling window so the UI feed stays cosmetic and small. That is right for
 * "a document was reviewed" chatter, but wrong for governance outcomes — a
 * donor or recipient being told their transplant was approved, or that an organ
 * breached its cold-ischemia limit, is a record they must still see next week.
 *
 * This flag opts individual rows out of the purge. Default false, so every
 * existing notification keeps exactly the behaviour it has today.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->boolean('is_persistent')->default(false)->after('data');
            $table->index('is_persistent');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex(['is_persistent']);
            $table->dropColumn('is_persistent');
        });
    }
};
