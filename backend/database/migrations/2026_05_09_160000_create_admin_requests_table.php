<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hospital_id')->constrained('users')->cascadeOnDelete();
            $table->string('requested_admin_name');
            $table->string('requested_admin_email');
            $table->text('justification')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected', 'cancelled'])->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_notes')->nullable();
            $table->foreignId('created_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['hospital_id', 'status']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_requests');
    }
};
