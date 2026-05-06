<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('phone')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable(); // nullable for Google OAuth users
            $table->string('google_id')->nullable()->unique();
            $table->string('avatar')->nullable();

            // Role & status
            $table->enum('role', [
                'super_admin', 'admin', 'hospital', 'doctor',
                'data_entry', 'auditor', 'donor', 'recipient'
            ])->default('donor');
            $table->enum('status', [
                'pending', 'approved', 'info_requested', 'registered',
                'submitted', 'rejected', 'banned', 'warned', 'deleted'
            ])->default('registered');
            $table->enum('registration_type', ['user_self', 'hospital_request'])->default('user_self');
            $table->boolean('registration_complete')->default(false);

            // Hospital linking
            $table->unsignedBigInteger('linked_hospital_id')->nullable()->index();
            $table->unsignedBigInteger('preferred_hospital_id')->nullable()->index();

            // Ban / soft-delete
            $table->boolean('banned')->default(false);
            $table->json('ban_details')->nullable();
            $table->boolean('is_deleted')->default(false);
            $table->json('deletion_details')->nullable();
            $table->timestamp('recovery_deadline')->nullable();

            // Notification preferences
            $table->boolean('email_notifications')->default(true);
            $table->boolean('app_notifications')->default(true);
            $table->boolean('status_updates')->default(true);
            $table->boolean('opportunity_alerts')->default(true);

            // Login tracking
            $table->timestamp('last_login_at')->nullable();
            $table->string('last_login_ip', 45)->nullable();
            $table->integer('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();

            // Profile changelog (audit edits)
            $table->json('profile_changelog')->nullable();

            $table->rememberToken();
            $table->timestamps();

            $table->index('role');
            $table->index('status');
            $table->index('banned');
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
