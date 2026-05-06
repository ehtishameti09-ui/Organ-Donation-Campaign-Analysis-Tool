<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\HospitalProfile;
use App\Models\DonorProfile;
use App\Models\RecipientProfile;
use App\Models\ClinicalProfile;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Imports organ supply-chain dataset.
 * Donors  → varied organs: kidney(10), liver(8), heart(6), lung(6), pancreas(5), cornea(5)
 * Recipients → varied organs: kidney(15), liver(10), heart(8), lung(7), pancreas(5), cornea(5)
 */
class DatasetSeeder extends Seeder
{
    public function run(): void
    {
        $hospital = User::where('role', 'hospital')
            ->where('status', 'approved')
            ->first();

        if (!$hospital) {
            $this->command->warn('⚠  No approved hospital found. Run DefaultUsersSeeder first.');
            return;
        }

        $this->command->info("🏥 Linking dataset users to: {$hospital->name}");

        $donorCount     = $this->seedDonors($hospital->id);
        $recipientCount = $this->seedRecipients($hospital->id);

        $this->command->info("✅ Seeded {$donorCount} donors and {$recipientCount} recipients.");
    }

    // ─── Donor Dataset ───────────────────────────────────────────────────────
    // Columns: donor_id, age, blood_type, organ_donated, medical_approval

    private function donorRows(): array
    {
        return [
            // Kidney donors (10)
            ['D001', 28, 'O+',  'Kidney',   'Yes'],
            ['D002', 35, 'A+',  'Kidney',   'Yes'],
            ['D003', 42, 'B+',  'Kidney',   'Yes'],
            ['D004', 31, 'AB+', 'Kidney',   'Yes'],
            ['D005', 27, 'O-',  'Kidney',   'Yes'],
            ['D006', 38, 'A-',  'Kidney',   'Yes'],
            ['D007', 45, 'B-',  'Kidney',   'Yes'],
            ['D008', 29, 'O+',  'Kidney',   'Yes'],
            ['D009', 33, 'A+',  'Kidney',   'No'],
            ['D010', 40, 'B+',  'Kidney',   'Yes'],
            // Liver donors (8)
            ['D011', 26, 'AB-', 'Liver',    'Yes'],
            ['D012', 37, 'O+',  'Liver',    'Yes'],
            ['D013', 44, 'A+',  'Liver',    'Yes'],
            ['D014', 30, 'B+',  'Liver',    'No'],
            ['D015', 36, 'O-',  'Liver',    'Yes'],
            ['D016', 43, 'A-',  'Liver',    'Yes'],
            ['D017', 25, 'B+',  'Liver',    'Yes'],
            ['D018', 39, 'AB+', 'Liver',    'Yes'],
            // Heart donors (6)
            ['D019', 32, 'O+',  'Heart',    'Yes'],
            ['D020', 47, 'A+',  'Heart',    'Yes'],
            ['D021', 28, 'B-',  'Heart',    'Yes'],
            ['D022', 34, 'O+',  'Heart',    'No'],
            ['D023', 41, 'A+',  'Heart',    'Yes'],
            ['D024', 29, 'B+',  'Heart',    'Yes'],
            // Lung donors (6)
            ['D025', 36, 'AB+', 'Lung',     'Yes'],
            ['D026', 48, 'O-',  'Lung',     'Yes'],
            ['D027', 31, 'A-',  'Lung',     'Yes'],
            ['D028', 38, 'B+',  'Lung',     'Yes'],
            ['D029', 26, 'O+',  'Lung',     'Yes'],
            ['D030', 43, 'A+',  'Lung',     'Yes'],
            // Pancreas donors (5)
            ['D031', 35, 'B-',  'Pancreas', 'No'],
            ['D032', 27, 'AB-', 'Pancreas', 'Yes'],
            ['D033', 40, 'O+',  'Pancreas', 'Yes'],
            ['D034', 33, 'A+',  'Pancreas', 'Yes'],
            ['D035', 46, 'B+',  'Pancreas', 'Yes'],
            // Cornea donors (5)
            ['D036', 30, 'O-',  'Cornea',   'Yes'],
            ['D037', 37, 'A-',  'Cornea',   'Yes'],
            ['D038', 44, 'B+',  'Cornea',   'Yes'],
            ['D039', 29, 'AB+', 'Cornea',   'Yes'],
            ['D040', 32, 'O+',  'Cornea',   'No'],
        ];
    }

    private function seedDonors(int $hospitalId): int
    {
        $count = 0;
        foreach ($this->donorRows() as $row) {
            [$donorId, $age, $bloodType, $organDonated, $approval] = $row;

            $email = 'donor.' . strtolower($donorId) . '@dataset.odcat.com';

            $verificationStatus = $approval === 'Yes' ? 'approved' : 'submitted';
            $caseStatus         = $approval === 'Yes' ? 'active'   : 'submitted';

            $user = User::updateOrCreate(
                ['email' => $email],
                [
                    'name'                  => "Donor {$donorId}",
                    'password'              => 'Dataset@123',
                    'role'                  => 'donor',
                    'status'                => 'approved',
                    'registration_type'     => 'user_self',
                    'registration_complete' => true,
                    'email_verified_at'     => Carbon::now(),
                    'preferred_hospital_id' => $hospitalId,
                ]
            );
            $user->syncRoles(['donor']);

            // Assign unique ID if not yet set
            if (!$user->unique_id) {
                $user->update([
                    'unique_id' => 'DON-' . date('Y') . '-' . str_pad($user->id, 4, '0', STR_PAD_LEFT),
                ]);
            }

            DonorProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'blood_type'           => $bloodType,
                    'pledged_organs'       => [strtolower($organDonated)],
                    'donation_type'        => 'living',
                    'verification_status'  => $verificationStatus,
                    'case_status'          => $caseStatus,
                    'family_informed'      => true,
                    'available_for_urgent' => true,
                    'submission_date'      => Carbon::now()->subDays(rand(10, 90)),
                ]
            );

            ClinicalProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'age'    => $age,
                    'gender' => $this->randomGender(),
                    'dob'    => Carbon::now()->subYears($age)->subDays(rand(0, 364))->toDateString(),
                ]
            );

            $count++;
        }
        return $count;
    }

    // ─── Recipient Dataset ────────────────────────────────────────────────────
    // Columns: patient_id, age, blood_type, organ_required, diagnosis,
    //          urgency_score (0-10), organ_status, predicted_survival_pct

    private function recipientRows(): array
    {
        return [
            // Kidney recipients (15)
            ['P001', 45, 'O+',  'Kidney',   'Chronic Kidney Disease',                     7.2, 'Available',    72],
            ['P002', 52, 'A+',  'Kidney',   'End-Stage Renal Disease',                    8.5, 'Allocated',    65],
            ['P003', 38, 'B+',  'Kidney',   'Polycystic Kidney Disease',                  6.1, 'Available',    80],
            ['P004', 61, 'AB+', 'Kidney',   'Diabetic Nephropathy',                       9.0, 'Transplanted', 55],
            ['P005', 29, 'O-',  'Kidney',   'IgA Nephropathy',                            5.3, 'Available',    85],
            ['P006', 47, 'A-',  'Kidney',   'Hypertensive Nephrosclerosis',               7.8, 'Available',    70],
            ['P007', 55, 'B-',  'Kidney',   'Focal Segmental Glomerulosclerosis',         8.2, 'Allocated',    62],
            ['P008', 33, 'O+',  'Kidney',   'Lupus Nephritis',                            6.7, 'Available',    78],
            ['P009', 48, 'A+',  'Kidney',   'Chronic Kidney Disease',                     7.5, 'Available',    68],
            ['P010', 64, 'B+',  'Kidney',   'End-Stage Renal Disease',                    9.2, 'Transplanted', 50],
            ['P011', 42, 'AB-', 'Kidney',   'Alport Syndrome',                            6.4, 'Available',    75],
            ['P012', 57, 'O+',  'Kidney',   'Diabetic Nephropathy',                       8.8, 'Allocated',    58],
            ['P013', 36, 'A+',  'Kidney',   'Polycystic Kidney Disease',                  5.9, 'Available',    82],
            ['P014', 50, 'B+',  'Kidney',   'Membranous Nephropathy',                     7.1, 'Available',    71],
            ['P015', 43, 'O-',  'Kidney',   'IgA Nephropathy',                            6.8, 'Allocated',    73],
            // Liver recipients (10)
            ['P016', 54, 'A-',  'Liver',    'Liver Cirrhosis',                            8.1, 'Available',    61],
            ['P017', 47, 'B+',  'Liver',    'Hepatocellular Carcinoma',                   8.6, 'Allocated',    54],
            ['P018', 39, 'AB+', 'Liver',    'Non-Alcoholic Steatohepatitis',              6.5, 'Available',    72],
            ['P019', 62, 'O+',  'Liver',    'Primary Biliary Cholangitis',                9.0, 'Transplanted', 48],
            ['P020', 35, 'A+',  'Liver',    'Alcoholic Liver Disease',                    7.2, 'Available',    67],
            ['P021', 58, 'B-',  'Liver',    'Autoimmune Hepatitis',                       8.4, 'Allocated',    57],
            ['P022', 44, 'O+',  'Liver',    'Wilson\'s Disease',                          6.9, 'Available',    76],
            ['P023', 51, 'AB-', 'Liver',    'Primary Sclerosing Cholangitis',             7.7, 'Available',    64],
            ['P024', 67, 'O-',  'Liver',    'Acute Liver Failure',                        9.4, 'Transplanted', 43],
            ['P025', 32, 'A+',  'Liver',    'Budd-Chiari Syndrome',                       6.3, 'Available',    83],
            // Heart recipients (8)
            ['P026', 56, 'O+',  'Heart',    'Dilated Cardiomyopathy',                     8.3, 'Available',    59],
            ['P027', 49, 'A+',  'Heart',    'Ischemic Heart Disease',                     7.9, 'Allocated',    63],
            ['P028', 63, 'B+',  'Heart',    'Heart Failure Stage IV',                     9.2, 'Transplanted', 47],
            ['P029', 41, 'AB+', 'Heart',    'Congenital Heart Defect',                    6.8, 'Available',    74],
            ['P030', 38, 'O-',  'Heart',    'Hypertrophic Cardiomyopathy',                7.1, 'Available',    71],
            ['P031', 57, 'A-',  'Heart',    'Arrhythmogenic Right Ventricular Dysplasia', 8.5, 'Allocated',    56],
            ['P032', 44, 'B-',  'Heart',    'Restrictive Cardiomyopathy',                 7.4, 'Available',    68],
            ['P033', 52, 'O+',  'Heart',    'Viral Myocarditis',                          8.0, 'Available',    62],
            // Lung recipients (7)
            ['P034', 61, 'A+',  'Lung',     'COPD End-Stage',                             9.1, 'Transplanted', 49],
            ['P035', 46, 'B+',  'Lung',     'Idiopathic Pulmonary Fibrosis',              8.2, 'Allocated',    58],
            ['P036', 31, 'AB+', 'Lung',     'Cystic Fibrosis',                            7.0, 'Available',    75],
            ['P037', 54, 'O-',  'Lung',     'Primary Pulmonary Hypertension',             8.7, 'Available',    55],
            ['P038', 42, 'A-',  'Lung',     'Bronchiectasis',                             6.6, 'Available',    77],
            ['P039', 59, 'B+',  'Lung',     'Lymphangioleiomyomatosis',                   7.8, 'Allocated',    61],
            ['P040', 37, 'O+',  'Lung',     'Emphysema',                                  7.3, 'Available',    69],
            // Pancreas recipients (5)
            ['P041', 48, 'A+',  'Pancreas', 'Type 1 Diabetes Mellitus',                  7.5, 'Available',    66],
            ['P042', 36, 'B+',  'Pancreas', 'Chronic Pancreatitis',                       6.8, 'Allocated',    73],
            ['P043', 53, 'O+',  'Pancreas', 'Pancreatic Exocrine Insufficiency',          8.0, 'Available',    60],
            ['P044', 29, 'AB+', 'Pancreas', 'Cystic Fibrosis-Related Diabetes',           6.2, 'Available',    84],
            ['P045', 61, 'A-',  'Pancreas', 'Post-Pancreatectomy Syndrome',               8.9, 'Transplanted', 51],
            // Cornea recipients (5)
            ['P046', 34, 'O+',  'Cornea',   'Keratoconus Advanced',                       5.8, 'Available',    90],
            ['P047', 27, 'A+',  'Cornea',   'Corneal Scarring',                           5.2, 'Available',    93],
            ['P048', 55, 'B+',  'Cornea',   'Fuchs Endothelial Dystrophy',                6.4, 'Allocated',    81],
            ['P049', 43, 'AB-', 'Cornea',   'Bullous Keratopathy',                        6.0, 'Available',    86],
            ['P050', 38, 'O-',  'Cornea',   'Corneal Chemical Burn',                      7.1, 'Available',    79],
        ];
    }

    private function seedRecipients(int $hospitalId): int
    {
        $count = 0;
        foreach ($this->recipientRows() as $row) {
            [$patientId, $age, $bloodType, $organRequired, $diagnosis,
             $urgencyScore, $organStatus, $survivalPct] = $row;

            $email = 'patient.' . strtolower($patientId) . '@dataset.odcat.com';

            $caseStatus = match ($organStatus) {
                'Transplanted' => 'approved',
                'Allocated'    => 'approved',
                default        => 'active',
            };

            $user = User::updateOrCreate(
                ['email' => $email],
                [
                    'name'                  => "Patient {$patientId}",
                    'password'              => 'Dataset@123',
                    'role'                  => 'recipient',
                    'status'                => 'approved',
                    'registration_type'     => 'user_self',
                    'registration_complete' => true,
                    'email_verified_at'     => Carbon::now(),
                    'preferred_hospital_id' => $hospitalId,
                ]
            );
            $user->syncRoles(['recipient']);

            // Assign unique ID if not yet set
            if (!$user->unique_id) {
                $user->update([
                    'unique_id' => 'REC-' . date('Y') . '-' . str_pad($user->id, 4, '0', STR_PAD_LEFT),
                ]);
            }

            RecipientProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'blood_type'          => $bloodType,
                    'organ_needed'        => strtolower($organRequired),
                    'diagnosis'           => $diagnosis,
                    'urgency_score'       => $urgencyScore,
                    'survival_estimate'   => (string) $survivalPct,
                    'verification_status' => 'approved',
                    'case_status'         => $caseStatus,
                    'current_hospital'    => 'CMH Rawalpindi',
                    'days_on_waitlist'    => rand(30, 730),
                    'submission_date'     => Carbon::now()->subDays(rand(30, 180)),
                ]
            );

            ClinicalProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'age'             => $age,
                    'gender'          => $this->randomGender(),
                    'dob'             => Carbon::now()->subYears($age)->subDays(rand(0, 364))->toDateString(),
                    'medical_history' => $diagnosis . '. Awaiting ' . strtolower($organRequired) . ' transplant.',
                ]
            );

            $count++;
        }
        return $count;
    }

    private function randomGender(): string
    {
        return rand(0, 1) ? 'Male' : 'Female';
    }
}
