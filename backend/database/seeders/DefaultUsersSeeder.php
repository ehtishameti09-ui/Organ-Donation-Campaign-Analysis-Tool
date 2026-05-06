<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\HospitalProfile;
use App\Models\DonorProfile;
use App\Models\RecipientProfile;
use App\Models\ClinicalProfile;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DefaultUsersSeeder extends Seeder
{
    public function run(): void
    {
        // Default Super Admin (matches frontend demo creds)
        $superAdmin = User::updateOrCreate(
            ['email' => 'admin@odcat.com'],
            [
                'name' => 'ODCAT Super Admin',
                'password' => 'Admin@123', // hashed via cast
                'role' => 'super_admin',
                'status' => 'approved',
                'registration_type' => 'user_self',
                'registration_complete' => true,
                'email_verified_at' => Carbon::now(),
            ]
        );
        $superAdmin->syncRoles(['super_admin']);

        // Default Admin (matches frontend demo creds)
        $admin = User::updateOrCreate(
            ['email' => 'dr.ali@odcat.com'],
            [
                'name' => 'Dr. Ali (Admin)',
                'password' => 'Admin@123',
                'role' => 'admin',
                'status' => 'approved',
                'registration_complete' => true,
                'email_verified_at' => Carbon::now(),
            ]
        );
        $admin->syncRoles(['admin']);

        // Sample Hospital (matches frontend demo creds)
        $hospital = User::updateOrCreate(
            ['email' => 'cmh@odcat.com'],
            [
                'name' => 'CMH Rawalpindi (Contact)',
                'password' => 'Hospital@123',
                'role' => 'hospital',
                'status' => 'approved',
                'registration_type' => 'hospital_request',
                'registration_complete' => true,
                'email_verified_at' => Carbon::now(),
            ]
        );
        $hospital->syncRoles(['hospital']);

        HospitalProfile::updateOrCreate(
            ['user_id' => $hospital->id],
            [
                'hospital_name' => 'CMH Rawalpindi',
                'registration_number' => 'PMC-2024-001234',
                'license_number' => 'PHSA-RWP-2024-7890',
                'hospital_address' => 'Mall Road, Rawalpindi Cantt',
                'contact_person' => 'CMH Rawalpinski (Contact)',
                'approved_at' => Carbon::now(),
                'approved_by' => $superAdmin->id,
            ]
        );

        // Demo Donor
        $donor = User::updateOrCreate(
            ['email' => 'ahmed.khan@odcat.com'],
            [
                'name' => 'Ahmed Raza Khan',
                'password' => 'Donor@123',
                'role' => 'donor',
                'status' => 'approved',
                'registration_type' => 'user_self',
                'registration_complete' => true,
                'email_verified_at' => Carbon::now(),
                'preferred_hospital_id' => $hospital->id,
            ]
        );
        $donor->syncRoles(['donor']);

        DonorProfile::updateOrCreate(
            ['user_id' => $donor->id],
            [
                'blood_type' => 'B+',
                'pledged_organs' => ['kidney', 'liver'],
                'donation_type' => 'living',
                'verification_status' => 'approved',
                'case_status' => 'active',
            ]
        );

        ClinicalProfile::updateOrCreate(
            ['user_id' => $donor->id],
            [
                'cnic' => '12345-6789012-3',
                'dob' => '1998-05-15',
                'gender' => 'Male',
                'age' => 28,
                'medical_history' => 'No previous medical conditions. Regular health checkups.',
                'emergency_contact_name' => 'Fatima Khan',
                'emergency_contact_phone' => '+923001234567',
            ]
        );

        // Demo Recipient
        $recipient = User::updateOrCreate(
            ['email' => 'nadia.qureshi@odcat.com'],
            [
                'name' => 'Nadia Qureshi',
                'password' => 'Recipient@123',
                'role' => 'recipient',
                'status' => 'approved',
                'registration_type' => 'user_self',
                'registration_complete' => true,
                'email_verified_at' => Carbon::now(),
                'preferred_hospital_id' => $hospital->id,
            ]
        );
        $recipient->syncRoles(['recipient']);

        RecipientProfile::updateOrCreate(
            ['user_id' => $recipient->id],
            [
                'organ_needed' => 'kidney',
                'diagnosis' => 'End-stage renal disease (ESRD)',
                'urgency_score' => 7.2,
                'comorbidity' => 3.5,
                'survival_estimate' => '77',
                'verification_status' => 'approved',
                'case_status' => 'approved',
            ]
        );

        ClinicalProfile::updateOrCreate(
            ['user_id' => $recipient->id],
            [
                'cnic' => '54321-9876543-2',
                'dob' => '1992-03-20',
                'gender' => 'Female',
                'age' => 34,
                'medical_history' => 'End-stage renal disease (ESRD). Diagnosed 5 years ago.',
                'emergency_contact_name' => 'Ali Qureshi',
                'emergency_contact_phone' => '+923009876543',
            ]
        );

        $this->command->info('✅ Default users created:');
        $this->command->line('  Super Admin: admin@odcat.com              / Admin@123');
        $this->command->line('  Admin:       dr.ali@odcat.com             / Admin@123');
        $this->command->line('  Hospital:    cmh@odcat.com                / Hospital@123');
        $this->command->line('  Donor:       ahmed.khan@odcat.com         / Donor@123');
        $this->command->line('  Recipient:   nadia.qureshi@odcat.com      / Recipient@123');
    }
}
