<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Module 7 — Hospital Approval Board.
 *
 * One row per confirmed allocation decision. The decision says "recipient X was
 * picked"; this row governs whether that pick is actually cleared for transplant.
 *
 * The checklist is snapshotted as JSON from config('governance.approval_checklist')
 * at creation time, so tightening the template later never rewrites the history of
 * what an approver actually signed off on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('allocation_decision_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('hospital_id')->index();
            $table->foreignId('donor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('recipient_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('organ', 30)->nullable();

            // Sequential workflow: checklist -> doctor -> admin -> approved (or rejected at any point).
            // When requires_multi_user is false the doctor stage is skipped and a single
            // hospital/admin confirmation completes the case.
            $table->enum('stage', ['checklist', 'doctor', 'admin', 'approved', 'rejected'])
                  ->default('checklist');
            $table->boolean('requires_multi_user')->default(true);

            $table->json('checklist');

            $table->foreignId('doctor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('doctor_approved_at')->nullable();
            $table->text('doctor_notes')->nullable();

            $table->foreignId('admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('admin_confirmed_at')->nullable();
            $table->text('admin_notes')->nullable();

            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->text('rejection_reason')->nullable();

            // Approval time tracking (Module 7.4). allocated_at mirrors the decision's
            // created_at so the elapsed measure survives even if the decision is edited,
            // and approval_seconds is materialised on completion so the hospital
            // performance comparison is a plain indexed aggregate, not a per-row diff.
            // dateTime, not timestamp: MySQL rejects a NOT NULL TIMESTAMP with no
            // default under strict mode. This column is always written explicitly.
            $table->dateTime('allocated_at');
            $table->timestamp('approved_at')->nullable();
            $table->unsignedInteger('approval_seconds')->nullable();

            $table->timestamps();

            $table->index(['hospital_id', 'stage']);
            $table->index(['hospital_id', 'approved_at']);
            $table->index('stage');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_approvals');
    }
};
