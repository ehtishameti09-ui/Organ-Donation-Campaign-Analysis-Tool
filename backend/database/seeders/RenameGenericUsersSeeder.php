<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * One-off cleanup: replaces placeholder names like "Donor D003" / "Patient P017"
 * with realistic Pakistani names. Deterministic — same user always gets the same name.
 */
class RenameGenericUsersSeeder extends Seeder
{
    private array $firstNames = [
        'Ahmed', 'Ali', 'Hassan', 'Hussain', 'Bilal', 'Faisal', 'Imran', 'Junaid',
        'Kamran', 'Khalid', 'Nasir', 'Naveed', 'Omar', 'Rashid', 'Saad', 'Salman',
        'Tariq', 'Umar', 'Usman', 'Waseem', 'Yasir', 'Zain', 'Abdullah', 'Hamza',
        'Arsalan', 'Asad', 'Atif', 'Babar', 'Danish', 'Ehsan', 'Faisal', 'Furqan',
        'Ghulam', 'Haris', 'Idrees', 'Jamshed', 'Kashif', 'Mansoor', 'Mubeen', 'Nadeem',
        'Fatima', 'Ayesha', 'Maryam', 'Khadija', 'Sara', 'Zainab', 'Hina', 'Nadia',
        'Saima', 'Sana', 'Sumaira', 'Asma', 'Bushra', 'Farah', 'Iqra', 'Lubna',
        'Mehwish', 'Nimra', 'Rabia', 'Samia', 'Tahira', 'Uzma', 'Yasmin', 'Zoya',
        'Aliya', 'Beenish', 'Dua', 'Eman', 'Faiza', 'Gulnaz', 'Hafsa', 'Ifra',
    ];

    private array $lastNames = [
        'Khan', 'Ahmed', 'Ali', 'Hussain', 'Malik', 'Sheikh', 'Iqbal', 'Hassan',
        'Raza', 'Qureshi', 'Siddiqui', 'Mahmood', 'Saleem', 'Akhtar', 'Aziz',
        'Bashir', 'Cheema', 'Dar', 'Ghazi', 'Haider', 'Jamil', 'Khalil', 'Latif',
        'Mansoor', 'Naqvi', 'Pasha', 'Rauf', 'Shah', 'Tariq', 'Wahid', 'Yousaf',
        'Zafar', 'Aslam', 'Butt', 'Chaudhary', 'Farooq', 'Gilani', 'Hashmi', 'Ismail',
    ];

    public function run(): void
    {
        $generic = User::where(function ($q) {
            $q->where('name', 'REGEXP', '^Donor D[0-9]+$')
              ->orWhere('name', 'REGEXP', '^Patient P[0-9]+$');
        })->get();

        if ($generic->isEmpty()) {
            $this->command->info('No generic-named users found.');
            return;
        }

        $count = 0;
        foreach ($generic as $user) {
            $newName = $this->generateName($user->id);
            $user->update(['name' => $newName]);
            $count++;
        }

        $this->command->info("✅ Renamed {$count} users from generic IDs to realistic names.");
    }

    /** Deterministic name from user ID — same ID → same name on every run. */
    private function generateName(int $id): string
    {
        $first = $this->firstNames[$id % count($this->firstNames)];
        $last  = $this->lastNames[($id * 13 + 7) % count($this->lastNames)];
        return "{$first} {$last}";
    }
}
