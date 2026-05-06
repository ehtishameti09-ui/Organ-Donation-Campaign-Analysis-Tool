<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('action_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // target user
            $table->unsignedBigInteger('admin_id')->nullable(); // who performed
            $table->unsignedBigInteger('review_admin_id')->nullable(); // for appeal reviews
            $table->string('action_type'); // ban, delete, appeal_submitted, login_success, login_failed, ...
            $table->text('reason')->nullable();
            $table->json('action_details')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamps();

            $table->index('action_type');
            $table->index('admin_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('action_logs');
    }
};
