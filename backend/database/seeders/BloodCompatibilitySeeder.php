<?php

namespace Database\Seeders;

use App\Models\BloodCompatibility;
use App\Models\HospitalProfile;
use Illuminate\Database\Seeder;

class BloodCompatibilitySeeder extends Seeder
{
    public function run(): void
    {
        if (BloodCompatibility::count() > 0) {
            $this->seedHospitalLocations();
            return;
        }

        $matrix = [
            'O-'  => ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
            'O+'  => ['O+', 'A+', 'B+', 'AB+'],
            'A-'  => ['A-', 'A+', 'AB-', 'AB+'],
            'A+'  => ['A+', 'AB+'],
            'B-'  => ['B-', 'B+', 'AB-', 'AB+'],
            'B+'  => ['B+', 'AB+'],
            'AB-' => ['AB-', 'AB+'],
            'AB+' => ['AB+'],
        ];

        $allTypes = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
        foreach ($allTypes as $donor) {
            foreach ($allTypes as $recipient) {
                BloodCompatibility::create([
                    'donor_blood_type'     => $donor,
                    'recipient_blood_type' => $recipient,
                    'compatible'           => in_array($recipient, $matrix[$donor] ?? [], true),
                    'notes'                => null,
                ]);
            }
        }

        $this->command->info('Seeded 64 blood compatibility rules (8x8 ABO matrix).');
        $this->seedHospitalLocations();
    }

    private function seedHospitalLocations(): void
    {
        // Pakistani hospital coordinates — used for distance/Haversine display.
        $locations = [
            'CMH Rawalpindi'         => ['lat' => 33.6007, 'lng' => 73.0443, 'city' => 'Rawalpindi', 'type' => 'urban'],
            'AKU Karachi'            => ['lat' => 24.8917, 'lng' => 67.0782, 'city' => 'Karachi',    'type' => 'urban'],
            'Shifa International'    => ['lat' => 33.7022, 'lng' => 73.0567, 'city' => 'Islamabad',  'type' => 'urban'],
            'Mayo Hospital'          => ['lat' => 31.5786, 'lng' => 74.3097, 'city' => 'Lahore',     'type' => 'urban'],
            'Lady Reading Hospital'  => ['lat' => 34.0151, 'lng' => 71.5249, 'city' => 'Peshawar',   'type' => 'urban'],
        ];

        // Random small offset for jitter when multiple seeded hospitals share base name
        $count = 0;
        foreach (HospitalProfile::all() as $hp) {
            if ($hp->latitude && $hp->longitude) continue;
            $matched = null;
            foreach ($locations as $name => $loc) {
                if (stripos($hp->hospital_name ?? '', explode(' ', $name)[0]) !== false) {
                    $matched = $loc;
                    break;
                }
            }
            // Fallback: place inside Pakistan (Lahore area)
            if (!$matched) $matched = ['lat' => 31.5204, 'lng' => 74.3587, 'city' => 'Lahore', 'type' => 'urban'];

            $hp->update([
                'latitude'  => $matched['lat'],
                'longitude' => $matched['lng'],
                'city'      => $matched['city'],
                'city_type' => $matched['type'],
            ]);
            $count++;
        }
        if ($count > 0) $this->command->info("Backfilled location coordinates for {$count} hospitals.");
    }
}
