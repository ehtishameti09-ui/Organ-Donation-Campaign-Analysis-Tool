<?php

namespace Database\Seeders;

use App\Models\HospitalProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Adds 4 approved hospitals with real Pakistani coordinates so the Hospital
 * Distance Matrix has more than one row to display.
 */
class AdditionalHospitalsSeeder extends Seeder
{
    private array $hospitals = [
        [
            'name'       => 'Aga Khan University Hospital',
            'email'      => 'aku@odcat.com',
            'reg'        => 'PMDC-AKU-1985-001',
            'license'    => 'SHC-AKU-1985-LIC',
            'address'    => 'Stadium Road, Karachi 74800',
            'contact'    => 'Dr Saima Iqbal',
            'lat'        => 24.8917,
            'lng'        => 67.0782,
            'city'       => 'Karachi',
            'city_type'  => 'urban',
        ],
        [
            'name'       => 'Shifa International Hospital',
            'email'      => 'shifa@odcat.com',
            'reg'        => 'PMDC-SIH-1993-002',
            'license'    => 'PHC-SIH-1993-LIC',
            'address'    => 'Sector H-8/4, Islamabad',
            'contact'    => 'Dr Ahmed Mahmood',
            'lat'        => 33.7022,
            'lng'        => 73.0567,
            'city'       => 'Islamabad',
            'city_type'  => 'urban',
        ],
        [
            'name'       => 'Mayo Hospital',
            'email'      => 'mayo@odcat.com',
            'reg'        => 'PMDC-MYO-1871-003',
            'license'    => 'PHC-MYO-1871-LIC',
            'address'    => 'Hospital Road, Lahore',
            'contact'    => 'Dr Tariq Hussain',
            'lat'        => 31.5786,
            'lng'        => 74.3097,
            'city'       => 'Lahore',
            'city_type'  => 'urban',
        ],
        [
            'name'       => 'Lady Reading Hospital',
            'email'      => 'lrh@odcat.com',
            'reg'        => 'PMDC-LRH-1924-004',
            'license'    => 'KPHC-LRH-1924-LIC',
            'address'    => 'Soekarno Square, Peshawar',
            'contact'    => 'Dr Yasir Khan',
            'lat'        => 34.0151,
            'lng'        => 71.5249,
            'city'       => 'Peshawar',
            'city_type'  => 'urban',
        ],
    ];

    public function run(): void
    {
        $created = 0;
        $skipped = 0;

        DB::transaction(function () use (&$created, &$skipped) {
            foreach ($this->hospitals as $h) {
                if (User::where('email', $h['email'])->exists()) {
                    $skipped++;
                    continue;
                }

                $user = User::create([
                    'name'                  => $h['name'],
                    'email'                 => $h['email'],
                    'password'              => Hash::make('Hospital@123'),
                    'role'                  => 'hospital',
                    'status'                => 'approved',
                    'registration_type'     => 'hospital_request',
                    'registration_complete' => true,
                    'email_verified_at'     => now(),
                ]);
                $user->assignRole('hospital');

                HospitalProfile::create([
                    'user_id'             => $user->id,
                    'hospital_name'       => $h['name'],
                    'registration_number' => $h['reg'],
                    'license_number'      => $h['license'],
                    'hospital_address'    => $h['address'],
                    'contact_person'      => $h['contact'],
                    'latitude'            => $h['lat'],
                    'longitude'           => $h['lng'],
                    'city'                => $h['city'],
                    'city_type'           => $h['city_type'],
                    'approved_at'         => now()->subDays(rand(60, 365)),
                ]);

                $created++;
            }
        });

        // Bust the cached hospital distances so the UI sees the new rows immediately
        Cache::forget('allocation:hospital-distances');

        $this->command->info("✅ Added {$created} hospitals (skipped {$skipped} that already existed).");
    }
}
