<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('allocation_decisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('allocation_run_id')->constrained()->cascadeOnDelete();
            $table->foreignId('selected_recipient_id')->constrained('users')->cascadeOnDelete();
            $table->integer('selected_rank');
            $table->boolean('was_override')->default(false);
            $table->text('override_reason')->nullable();
            $table->foreignId('decided_by')->constrained('users');
            $table->unsignedBigInteger('hospital_id')->index();
            $table->enum('status', ['confirmed', 'cancelled'])->default('confirmed');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['hospital_id', 'was_override']);
            $table->index('decided_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('allocation_decisions');
    }
};
