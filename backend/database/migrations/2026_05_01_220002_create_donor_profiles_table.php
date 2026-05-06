<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('donor_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();

            // Donation details
            $table->enum('blood_type', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])->nullable();
            $table->json('pledged_organs')->nullable(); // ['Kidney', 'Liver', ...]
            $table->enum('donation_type', ['deceased', 'living'])->nullable();
            $table->boolean('family_informed')->default(false);
            $table->string('next_of_kin')->nullable();

            // Case workflow
            $table->enum('verification_status', ['pending', 'submitted', 'under_review', 'approved', 'rejected'])->default('pending');
            $table->enum('case_status', ['submitted', 'approved', 'rejected', 'active'])->default('submitted');
            $table->boolean('consent_signed')->default(false);
            $table->timestamp('consent_date')->nullable();
            $table->timestamp('submission_date')->nullable();

            // Preferences
            $table->boolean('donation_consent')->default(true);
            $table->enum('donation_willingness', ['open', 'restricted'])->default('open');
            $table->boolean('family_notified')->default(false);
            $table->enum('contact_preference', ['phone', 'email'])->default('email');
            $table->boolean('available_for_urgent')->default(false);

            // Document statuses (per-doc review)
            $table->json('document_statuses')->nullable();
            $table->boolean('documents_resubmitted')->default(false);
            $table->timestamp('resubmission_date')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('donor_profiles');
    }
};
