<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('allocation_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('policy_id')->constrained('allocation_policies')->cascadeOnDelete();
            $table->foreignId('donor_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('organ');
            $table->json('weights_snapshot');
            $table->json('dataset_snapshot');
            $table->json('results');
            $table->integer('candidate_count');
            $table->foreignId('run_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('mode', ['live', 'simulation'])->default('live');
            $table->foreignId('parent_run_id')->nullable()->constrained('allocation_runs')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('allocation_runs');
    }
};
