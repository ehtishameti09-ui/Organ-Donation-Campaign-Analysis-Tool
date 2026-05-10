<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blood_compatibility', function (Blueprint $table) {
            $table->id();
            $table->string('donor_blood_type', 5);
            $table->string('recipient_blood_type', 5);
            $table->boolean('compatible')->default(false);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['donor_blood_type', 'recipient_blood_type']);
            $table->index('donor_blood_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blood_compatibility');
    }
};
