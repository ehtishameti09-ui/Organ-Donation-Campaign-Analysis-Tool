<?php

namespace Database\Seeders;

use App\Models\AllocationPolicy;
use Illuminate\Database\Seeder;

class AllocationPolicySeeder extends Seeder
{
    public function run(): void
    {
        if (AllocationPolicy::count() > 0) return;

        AllocationPolicy::create([
            'version'     => '1.0',
            'name'        => 'Baseline Equity Policy',
            'description' => 'Initial balanced policy. Urgency 40 / Waiting 25 / Survival 25 / Age 10.',
            'weights'     => [
                'urgency'  => 40,
                'waiting'  => 25,
                'survival' => 25,
                'age'      => 10,
            ],
            'is_active'   => true,
        ]);

        AllocationPolicy::create([
            'version'     => '1.1-urgency',
            'name'        => 'Urgency-Weighted Variant',
            'description' => 'Heavier weight on clinical urgency. Useful for emergency-driven allocation studies.',
            'weights'     => [
                'urgency'  => 60,
                'waiting'  => 15,
                'survival' => 20,
                'age'      => 5,
            ],
            'is_active'   => false,
        ]);

        AllocationPolicy::create([
            'version'     => '1.2-utility',
            'name'        => 'Utility-Weighted Variant',
            'description' => 'Heavier weight on long-term survival and younger productive life. Utilitarian.',
            'weights'     => [
                'urgency'  => 25,
                'waiting'  => 15,
                'survival' => 40,
                'age'      => 20,
            ],
            'is_active'   => false,
        ]);
    }
}
