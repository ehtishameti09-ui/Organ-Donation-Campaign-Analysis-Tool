<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hospital_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('hospital_name');
            $table->string('registration_number')->unique();
            $table->string('license_number')->unique();
            $table->text('hospital_address')->nullable();
            $table->string('contact_person')->nullable();

            // Approval workflow
            $table->text('admin_feedback')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->text('admin_message')->nullable(); // for info_requested
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->unsignedBigInteger('rejected_by')->nullable();
            $table->timestamp('rejected_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hospital_profiles');
    }
};
