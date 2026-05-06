<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Ban / Delete appeals
        Schema::create('appeals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('explanation');
            $table->json('evidence')->nullable();
            $table->timestamp('submitted_date')->nullable();
            $table->enum('status', ['pending', 'approved', 'denied', 'modified'])->default('pending');
            $table->enum('original_action', ['ban', 'delete']);
            $table->string('original_category')->nullable();
            $table->text('original_reason')->nullable();
            $table->unsignedBigInteger('original_admin_id')->nullable();
            $table->timestamp('admin_response_deadline')->nullable();
            $table->timestamp('review_date')->nullable();
            $table->unsignedBigInteger('review_admin_id')->nullable();
            $table->text('review_notes')->nullable();
            $table->enum('decision', ['uphold', 'reverse', 'modify'])->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        // Hospital case rejection appeals (separate workflow)
        Schema::create('case_appeals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete(); // donor/recipient
            $table->unsignedBigInteger('hospital_id'); // user_id of hospital
            $table->text('appeal_text');
            $table->enum('status', ['pending', 'reopened', 'rejected_final'])->default('pending');
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->text('review_notes')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['hospital_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_appeals');
        Schema::dropIfExists('appeals');
    }
};
