<?php

namespace Database\Seeders;

use App\Models\ClinicalProfile;
use App\Models\DonorProfile;
use App\Models\RecipientProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Imports the Kidney Organ Supply Chain dataset (CSV) into the system.
 * Each CSV row contains a paired patient + donor — both are created as users
 * linked to the seeded approved hospital, with profiles populated from the data.
 */
class KidneyDatasetSeeder extends Seeder
{
    private array $firstNames = [
        'Ahmed', 'Ali', 'Hassan', 'Hussain', 'Bilal', 'Faisal', 'Imran', 'Junaid',
        'Kamran', 'Khalid', 'Nasir', 'Naveed', 'Omar', 'Rashid', 'Saad', 'Salman',
        'Tariq', 'Umar', 'Usman', 'Waseem', 'Yasir', 'Zain', 'Abdullah', 'Hamza',
        'Fatima', 'Ayesha', 'Maryam', 'Khadija', 'Sara', 'Zainab', 'Hina', 'Nadia',
        'Saima', 'Sana', 'Sumaira', 'Asma', 'Bushra', 'Farah', 'Iqra', 'Lubna',
        'Mehwish', 'Nimra', 'Rabia', 'Samia', 'Tahira', 'Uzma', 'Yasmin', 'Zoya',
    ];

    private array $lastNames = [
        'Khan', 'Ahmed', 'Ali', 'Hussain', 'Malik', 'Sheikh', 'Iqbal', 'Hassan',
        'Raza', 'Qureshi', 'Siddiqui', 'Mahmood', 'Saleem', 'Akhtar', 'Aziz',
        'Bashir', 'Cheema', 'Dar', 'Ghazi', 'Haider', 'Jamil', 'Khalil', 'Latif',
        'Mansoor', 'Naqvi', 'Pasha', 'Rauf', 'Shah', 'Tariq', 'Wahid', 'Yousaf',
    ];

    public function run(): void
    {
        $csvPath = database_path('data/kidney_dataset.csv');
        if (!file_exists($csvPath)) {
            $this->command->warn("Dataset CSV not found at {$csvPath}.");
            return;
        }

        $hospital = User::where('role', 'hospital')->where('status', 'approved')->first();
        if (!$hospital) {
            $this->command->warn('No approved hospital found — run hospital seeder first.');
            return;
        }
        $hospitalId = $hospital->id;

        // Skip if dataset already loaded (avoids exploding on re-runs)
        $existing = User::where('email', 'like', '%@odcat.dataset')->count();
        if ($existing >= 500) {
            $this->command->info("Dataset users already loaded ({$existing} found). Skipping.");
            return;
        }

        $handle = fopen($csvPath, 'r');
        $headers = fgetcsv($handle);
        $maxRows = 250; // 250 rows × 2 = 500 users

        $created = 0;
        $skipped = 0;
        $rowNum = 0;

        DB::beginTransaction();
        try {
            while (($row = fgetcsv($handle)) !== false && $rowNum < $maxRows) {
                $rowNum++;
                $data = array_combine($headers, $row);
                if (!$data) { $skipped++; continue; }
                try {
                    $this->createPair($data, $hospitalId, $rowNum);
                    $created += 2;
                } catch (\Throwable $e) {
                    $skipped++;
                }
            }
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->command->error("Import failed: {$e->getMessage()}");
            fclose($handle);
            return;
        }

        fclose($handle);
        $this->command->info("✅ Imported {$created} users from kidney dataset (skipped {$skipped} rows).");
    }

    private function createPair(array $row, int $hospitalId, int $rowNum): void
    {
        // ===== RECIPIENT (Patient) =====
        $patientId = trim($row['Patient_ID'] ?? '');
        if (!$patientId) throw new \RuntimeException('missing Patient_ID');
        $patientEmail = 'patient.' . strtolower($patientId) . '@odcat.dataset';
        if (User::where('email', $patientEmail)->exists()) return; // idempotent

        $patientAge = max(1, (int) ($row['Patient_Age'] ?? 40));
        $patientName = $this->generateName('recipient', $rowNum);

        $recipient = User::create([
            'name'                  => $patientName,
            'email'                 => $patientEmail,
            'password'              => Hash::make('Recipient@123'),
            'role'                  => 'recipient',
            'status'                => 'approved',
            'preferred_hospital_id' => $hospitalId,
            'registration_complete' => true,
            'registration_type'     => 'user_self',
            'email_verified_at'     => now(),
        ]);
        $recipient->assignRole('recipient');

        $waitlistDays = rand(15, 730);
        $urgency = max(1.0, min(10.0, (float) ($row['Biological_Markers'] ?? 5.0)));
        $survival = round((float) ($row['Predicted_Survival_Chance'] ?? 80), 1);

        RecipientProfile::create([
            'user_id'             => $recipient->id,
            'blood_type'          => $this->normalizeBloodType($row['Patient_BloodType'] ?? 'O+'),
            'organ_needed'        => strtolower(trim($row['Organ_Required'] ?? 'kidney')),
            'diagnosis'           => trim($row['Diagnosis_Result'] ?? 'CKD'),
            'urgency_score'       => $urgency,
            'comorbidity'         => round(rand(0, 100) / 30.0, 2),
            'survival_estimate'   => (string) $survival,
            'days_on_waitlist'    => $waitlistDays,
            'verification_status' => 'approved',
            'case_status'         => 'submitted',
            'consent_signed'      => true,
            'consent_date'        => now()->subDays($waitlistDays),
            'submission_date'     => now()->subDays($waitlistDays),
        ]);

        ClinicalProfile::create([
            'user_id' => $recipient->id,
            'dob'     => now()->subYears($patientAge)->subDays(rand(0, 365))->format('Y-m-d'),
            'gender'  => $this->randomGender($rowNum),
        ]);

        // ===== DONOR =====
        $donorId = trim($row['Donor_ID'] ?? '');
        if (!$donorId) return;
        $donorEmail = 'donor.' . strtolower($donorId) . '@odcat.dataset';
        if (User::where('email', $donorEmail)->exists()) return;

        $donorAge = max(18, (int) ($row['Donor_Age'] ?? 35));
        $donorName = $this->generateName('donor', $rowNum);

        $donor = User::create([
            'name'                  => $donorName,
            'email'                 => $donorEmail,
            'password'              => Hash::make('Donor@123'),
            'role'                  => 'donor',
            'status'                => 'approved',
            'preferred_hospital_id' => $hospitalId,
            'registration_complete' => true,
            'registration_type'     => 'user_self',
            'email_verified_at'     => now(),
        ]);
        $donor->assignRole('donor');

        $organ = strtolower(trim($row['Organ_Donated'] ?? 'kidney'));
        $organs = [$organ];
        // Some donors pledge multiple organs to make Auto-Match richer
        if ($rowNum % 3 === 0 && $organ === 'kidney') $organs[] = 'liver';

        DonorProfile::create([
            'user_id'             => $donor->id,
            'blood_type'          => $this->normalizeBloodType($row['Donor_BloodType'] ?? 'O+'),
            'pledged_organs'      => $organs,
            'donation_type'       => $rowNum % 2 === 0 ? 'deceased' : 'living',
            'family_informed'     => true,
            'consent_signed'      => true,
            'consent_date'        => now()->subDays(rand(30, 365)),
            'verification_status' => 'approved',
            'case_status'         => 'approved',
            'donation_consent'    => true,
            'family_notified'     => true,
        ]);

        ClinicalProfile::create([
            'user_id' => $donor->id,
            'dob'     => now()->subYears($donorAge)->subDays(rand(0, 365))->format('Y-m-d'),
            'gender'  => $this->randomGender($rowNum + 1),
        ]);
    }

    private function generateName(string $type, int $seed): string
    {
        $first = $this->firstNames[$seed % count($this->firstNames)];
        $last  = $this->lastNames[($seed * 7) % count($this->lastNames)];
        return "{$first} {$last}";
    }

    private function randomGender(int $seed): string
    {
        $r = $seed % 100;
        if ($r < 48) return 'Male';
        if ($r < 96) return 'Female';
        return 'Other';
    }

    /** AB → AB+ default; tolerate trailing whitespace */
    private function normalizeBloodType(string $type): string
    {
        $type = strtoupper(trim($type));
        if (!preg_match('/^(O|A|B|AB)([+-])?$/', $type)) return 'O+';
        if (in_array($type, ['O', 'A', 'B', 'AB'], true)) {
            // Mix of + and - to keep dataset varied
            return $type . '+';
        }
        return $type;
    }
}
