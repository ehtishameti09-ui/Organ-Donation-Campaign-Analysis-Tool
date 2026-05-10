<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('allocation_decisions', function (Blueprint $table) {
            $table->boolean('was_rejected')->default(false)->after('was_override');
            $table->index('was_rejected');
        });
    }

    public function down(): void
    {
        Schema::table('allocation_decisions', function (Blueprint $table) {
            $table->dropIndex(['was_rejected']);
            $table->dropColumn('was_rejected');
        });
    }
};
