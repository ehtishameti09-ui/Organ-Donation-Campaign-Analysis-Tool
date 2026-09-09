<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Module 8 — Organ Lifecycle & Cold Chain.
 *
 * The system previously ended at the allocation decision: there was no entity
 * representing the physical organ, so nothing to track, time, or expire. This
 * table is that entity, and it is what Module 9's surgery bookings hang off.
 *
 * Cold ischemia is deliberately NOT stored as a status column. Storing "is it
 * breached?" means the answer is only as fresh as the last background job that
 * wrote it — and this app runs no queue worker. Instead we store recovered_at
 * plus the limit, and derive the state on every read. It is arithmetic on two
 * columns, always correct at the instant it is displayed, and needs no daemon.
 *
 * breach_notified_at exists purely to make the alert idempotent: the first read
 * that observes a breach sends the notification and stamps this, so the alert
 * fires exactly once no matter how many dashboards are open.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organs', function (Blueprint $table) {
            $table->id();

            $table->foreignId('allocation_decision_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('case_approval_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('donor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('recipient_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('hospital_id')->index();

            $table->string('organ_type', 30);
            $table->string('reference', 40)->unique();   // human-facing tag, e.g. ORG-2026-0007

            // available  — recovered, not yet allocated to a confirmed recipient
            // allocated  — matched and approved, awaiting surgery
            // in_transit — moving between centres
            // transplanted / discarded / expired — terminal
            $table->enum('status', ['available', 'allocated', 'in_transit', 'transplanted', 'discarded', 'expired'])
                  ->default('available')->index();

            // Cold ischemia clock. recovered_at is the start; the limit is seeded
            // per organ type from config('governance.cold_ischemia_minutes').
            $table->dateTime('recovered_at');
            $table->unsignedInteger('cold_ischemia_limit_minutes');

            $table->dateTime('transplanted_at')->nullable();
            $table->dateTime('discarded_at')->nullable();
            $table->string('discard_reason', 500)->nullable();

            $table->timestamp('breach_notified_at')->nullable();

            $table->timestamps();

            $table->index(['hospital_id', 'status']);
            $table->index(['status', 'recovered_at']);
        });

        Schema::create('organ_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organ_id')->constrained()->cascadeOnDelete();
            $table->string('event_type', 40);
            $table->string('title', 160);
            $table->text('description')->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('meta')->nullable();
            $table->dateTime('occurred_at');
            $table->timestamps();

            $table->index(['organ_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organ_events');
        Schema::dropIfExists('organs');
    }
};
