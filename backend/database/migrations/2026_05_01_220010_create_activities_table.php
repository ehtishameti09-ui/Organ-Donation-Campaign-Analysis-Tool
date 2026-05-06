<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            $table->string('type'); // hospital_registered, donor_approved, ...
            $table->string('icon', 10)->nullable(); // emoji
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedBigInteger('user_id')->nullable(); // user involved
            $table->unsignedBigInteger('actor_id')->nullable(); // who triggered
            $table->unsignedBigInteger('scope_hospital_id')->nullable(); // for hospital-scoped activity
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('type');
            $table->index(['scope_hospital_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activities');
    }
};
