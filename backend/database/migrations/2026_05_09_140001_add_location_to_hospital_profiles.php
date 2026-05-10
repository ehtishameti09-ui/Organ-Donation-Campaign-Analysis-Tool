<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hospital_profiles', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->after('hospital_address');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->enum('city_type', ['urban', 'rural'])->default('urban')->after('longitude');
            $table->string('city', 80)->nullable()->after('city_type');
        });
    }

    public function down(): void
    {
        Schema::table('hospital_profiles', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'city_type', 'city']);
        });
    }
};
