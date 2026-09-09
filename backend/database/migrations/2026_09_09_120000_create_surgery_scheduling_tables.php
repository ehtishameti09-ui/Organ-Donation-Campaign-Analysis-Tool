<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Module 9 — Surgery Scheduling & Resource Allocation.
 *
 * Two tables: the bookable resources a hospital owns, and the bookings against
 * them. A booking reserves a theatre and a surgeon for the operating window, and
 * optionally an ICU bed for a longer recovery window that starts when surgery ends.
 *
 * The indexes on (resource, start, end) are what make the overlap check in
 * SurgeryController::book cheap — that query runs inside a row lock, so it must
 * not be a table scan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('surgical_resources', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('hospital_id')->index();
            $table->enum('type', ['theatre', 'icu_bed', 'surgeon']);
            $table->string('name', 120);
            $table->string('code', 30);
            // Surgeons are usually staff accounts; linking lets a surgeon see
            // their own list. Nullable because a hospital may record a visiting
            // surgeon who has no login.
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['hospital_id', 'type', 'code']);
            $table->index(['hospital_id', 'type', 'is_active']);
        });

        Schema::create('surgery_bookings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('hospital_id')->index();

            $table->foreignId('organ_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('case_approval_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('recipient_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->foreignId('theatre_id')->constrained('surgical_resources')->cascadeOnDelete();
            $table->foreignId('surgeon_id')->constrained('surgical_resources')->cascadeOnDelete();
            $table->foreignId('icu_bed_id')->nullable()->constrained('surgical_resources')->nullOnDelete();

            $table->dateTime('scheduled_start');
            $table->dateTime('scheduled_end');
            $table->dateTime('icu_from')->nullable();
            $table->dateTime('icu_until')->nullable();

            $table->enum('status', ['scheduled', 'in_progress', 'completed', 'cancelled'])
                  ->default('scheduled')->index();
            $table->text('notes')->nullable();
            $table->string('cancel_reason', 500)->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // Overlap lookups are always (one resource) × (time range) × (not cancelled).
            $table->index(['theatre_id', 'scheduled_start', 'scheduled_end']);
            $table->index(['surgeon_id', 'scheduled_start', 'scheduled_end']);
            $table->index(['icu_bed_id', 'icu_from', 'icu_until']);
            $table->index(['hospital_id', 'scheduled_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('surgery_bookings');
        Schema::dropIfExists('surgical_resources');
    }
};
