<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipient_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();

            $table->enum('blood_type', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])->nullable();
            $table->string('organ_needed')->nullable();
            $table->text('diagnosis')->nullable();
            $table->decimal('urgency_score', 4, 2)->nullable();
            $table->decimal('comorbidity', 4, 2)->nullable();
            $table->string('survival_estimate')->nullable();
            $table->string('treating_doctor')->nullable();
            $table->string('current_hospital')->nullable();
            $table->integer('days_on_waitlist')->default(0);

            $table->enum('verification_status', ['pending', 'submitted', 'under_review', 'approved', 'rejected'])->default('pending');
            $table->enum('case_status', ['submitted', 'approved', 'rejected', 'active'])->default('submitted');
            $table->boolean('consent_signed')->default(false);
            $table->timestamp('consent_date')->nullable();
            $table->timestamp('submission_date')->nullable();

            // Preferences
            $table->enum('blood_compatibility', ['compatible', 'any'])->default('compatible');
            $table->enum('urgency_self', ['low', 'moderate', 'high'])->default('moderate');
            $table->boolean('waiting_list_visibility')->default(true);
            $table->boolean('travel_ready')->default(false);
            $table->boolean('notify_on_match')->default(true);
            $table->text('preferred_hospital_notes')->nullable();

            $table->json('document_statuses')->nullable();
            $table->boolean('documents_resubmitted')->default(false);
            $table->timestamp('resubmission_date')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recipient_profiles');
    }
};
