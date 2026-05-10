<?php

namespace Database\Seeders;

use App\Models\AllocationPolicy;
use Illuminate\Database\Seeder;

/**
 * Adds `distance: 0` to every existing policy (backward-compat — behavior unchanged).
 * Then creates a new "Network-Aware" policy that gives distance real weight, so the user
 * can switch to it and immediately see cross-hospital matching with distance scoring.
 */
class DistancePolicyMigrationSeeder extends Seeder
{
    public function run(): void
    {
        $patched = 0;
        foreach (AllocationPolicy::all() as $p) {
            $w = $p->weights ?? [];
            if (!isset($w['distance'])) {
                $w['distance'] = 0;
                $p->update(['weights' => $w]);
                $patched++;
            }
        }

        $existing = AllocationPolicy::where('version', '2.0-network-aware')->first();
        if (!$existing) {
            AllocationPolicy::create([
                'version'     => '2.0-network-aware',
                'name'        => 'Network-Aware (Cross-Hospital)',
                'description' => 'Includes distance in scoring — favours geographically closer recipients to reduce cold-ischemia risk while still matching across the entire hospital network.',
                'weights'     => [
                    'urgency'  => 35,
                    'waiting'  => 20,
                    'survival' => 20,
                    'age'      => 10,
                    'distance' => 15,
                ],
                'is_active'   => false,
            ]);
            $this->command->info("✅ Patched {$patched} policies with distance:0 + created new '2.0-network-aware' policy.");
        } else {
            $this->command->info("✅ Patched {$patched} policies with distance:0 (network-aware policy already exists).");
        }
    }
}
