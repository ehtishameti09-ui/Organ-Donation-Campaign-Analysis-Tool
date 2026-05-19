<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('recipient_profiles', function (Blueprint $table) {
            // 'personal' = the account holder is the patient (adult).
            // 'guardian' = a parent/legal guardian manages the account for a child patient.
            $table->string('account_type', 20)->default('personal')->after('user_id');
            $table->string('patient_name', 120)->nullable()->after('account_type');        // child's full name (guardian accounts)
            $table->string('guardian_name', 120)->nullable()->after('patient_name');
            $table->string('guardian_relationship', 40)->nullable()->after('guardian_name'); // Father / Mother / Legal Guardian ...
            $table->string('guardian_cnic', 20)->nullable()->after('guardian_relationship');
            $table->string('guardian_phone', 30)->nullable()->after('guardian_cnic');
        });
    }

    public function down(): void
    {
        Schema::table('recipient_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'account_type', 'patient_name', 'guardian_name',
                'guardian_relationship', 'guardian_cnic', 'guardian_phone',
            ]);
        });
    }
};
