<?php

namespace App\Services;

use App\Models\User;
use App\Models\RecipientProfile;
use App\Models\DonorProfile;

/**
 * AllocationService — pure scoring logic for the explainable allocation engine.
 * Designed to be unit-testable and free of side effects.
 *
 * Public API:
 *   - score(array $recipientData, array $weights): array  → returns per-criterion contributions + final score
 *   - rank(array $donor, array $recipients, array $weights): array  → ranked list with breakdown
 *   - bloodCompatible(string $donorBlood, string $recipientBlood): bool
 *
 * Inputs are plain arrays so the service has no DB dependency and can be tested in isolation.
 */
class AllocationService
{
    /** Default policy weights — must sum to 100 */
    public const DEFAULT_WEIGHTS = [
        'urgency'  => 40,
        'waiting'  => 25,
        'survival' => 25,
        'age'      => 10,
        'distance' => 0, // backward compatible: existing policies keep behavior; new policies can give it weight
    ];

    /** Maximum useful distance for normalization (km). Beyond this, distance score floors at 0. */
    public const DISTANCE_MAX_KM = 1500.0;

    /** Default ABO blood compatibility matrix (donor → eligible recipient types).
     *  Can be overridden via {@see setCompatibilityMatrix()} so the controller can supply a DB-backed matrix. */
    public const DEFAULT_COMPATIBILITY = [
        'O-'  => ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
        'O+'  => ['O+', 'A+', 'B+', 'AB+'],
        'A-'  => ['A-', 'A+', 'AB-', 'AB+'],
        'A+'  => ['A+', 'AB+'],
        'B-'  => ['B-', 'B+', 'AB-', 'AB+'],
        'B+'  => ['B+', 'AB+'],
        'AB-' => ['AB-', 'AB+'],
        'AB+' => ['AB+'],
    ];

    /** @var array<string,array<string>> Active compatibility matrix used by {@see bloodCompatible()} */
    private array $compatibility = self::DEFAULT_COMPATIBILITY;

    public function setCompatibilityMatrix(array $matrix): void
    {
        // Defensive: only accept non-empty matrices, otherwise stay on defaults
        if (!empty($matrix)) $this->compatibility = $matrix;
    }

    public function getCompatibilityMatrix(): array
    {
        return $this->compatibility;
    }

    /**
     * Compute score breakdown for a single recipient.
     *
     * @param array $r  Required keys: urgency_score (0-10), days_on_waitlist (int), survival_estimate (string|float), age (int|null)
     * @param array $w  Weights: urgency, waiting, survival, age (each 0-100)
     * @return array{urgency:float,waiting:float,survival:float,age:float,final:float}
     */
    public function score(array $r, array $w = self::DEFAULT_WEIGHTS): array
    {
        $urgencyRaw  = $this->normUrgency($r['urgency_score'] ?? 5.0);
        $waitingRaw  = $this->normWaiting((int) ($r['days_on_waitlist'] ?? 0));
        $survivalRaw = $this->normSurvival($r['survival_estimate'] ?? null);
        $ageRaw      = $this->normAge($r['age'] ?? null);
        $distanceRaw = $this->normDistance($r['distance_km'] ?? null);

        $urgency  = round($urgencyRaw  * ($w['urgency']  ?? 0), 2);
        $waiting  = round($waitingRaw  * ($w['waiting']  ?? 0), 2);
        $survival = round($survivalRaw * ($w['survival'] ?? 0), 2);
        $age      = round($ageRaw      * ($w['age']      ?? 0), 2);
        $distance = round($distanceRaw * ($w['distance'] ?? 0), 2);

        return [
            'urgency'  => $urgency,
            'waiting'  => $waiting,
            'survival' => $survival,
            'age'      => $age,
            'distance' => $distance,
            'final'    => round($urgency + $waiting + $survival + $age + $distance, 2),
        ];
    }

    /**
     * Rank a list of recipients for a given donor.
     *
     * @param array $donor       Required: blood_type, pledged_organs (array)
     * @param array $recipients  Each: user_id, name, blood_type, organ_needed, urgency_score, days_on_waitlist, survival_estimate, age
     * @param array $weights
     * @param string|null $organ  Optional filter for specific organ
     * @return array  Ranked recipients with score breakdown + reason
     */
    public function rank(array $donor, array $recipients, array $weights = self::DEFAULT_WEIGHTS, ?string $organ = null): array
    {
        $donorBlood   = strtoupper(trim($donor['blood_type'] ?? ''));
        $pledged      = array_map('strtolower', (array) ($donor['pledged_organs'] ?? []));

        $eligible = [];
        foreach ($recipients as $r) {
            $recBlood     = strtoupper(trim($r['blood_type'] ?? ''));
            $organNeeded  = strtolower(trim($r['organ_needed'] ?? ''));

            if ($organ && $organNeeded !== strtolower($organ)) continue;
            if (!empty($pledged) && !in_array($organNeeded, $pledged, true)) continue;
            if ($donorBlood && $recBlood && !$this->bloodCompatible($donorBlood, $recBlood)) continue;

            $breakdown = $this->score($r, $weights);
            $eligible[] = array_merge($r, [
                'score_breakdown' => $breakdown,
                'final_score'     => $breakdown['final'],
            ]);
        }

        usort($eligible, fn($a, $b) => $b['final_score'] <=> $a['final_score']);
        foreach ($eligible as $i => &$e) $e['rank'] = $i + 1;

        return $eligible;
    }

    public function bloodCompatible(string $donor, string $recipient): bool
    {
        $donor     = strtoupper(trim($donor));
        $recipient = strtoupper(trim($recipient));
        return isset($this->compatibility[$donor]) && in_array($recipient, $this->compatibility[$donor], true);
    }

    /**
     * Compute great-circle distance between two coordinates using the Haversine formula.
     * Returns kilometers. Returns null if any coordinate is missing.
     */
    public function distanceKm(?float $lat1, ?float $lng1, ?float $lat2, ?float $lng2): ?float
    {
        if ($lat1 === null || $lng1 === null || $lat2 === null || $lng2 === null) return null;
        $earthRadiusKm = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
           + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return round($earthRadiusKm * $c, 2);
    }

    /** ---- Normalization helpers (each returns 0.0–1.0) ---- */

    private function normUrgency($score): float
    {
        $v = is_numeric($score) ? (float) $score : 5.0;
        return max(0.0, min(1.0, $v / 10.0));
    }

    private function normWaiting(int $days): float
    {
        // Caps at 365 days (1 year) for full score
        return max(0.0, min(1.0, $days / 365.0));
    }

    private function normSurvival($estimate): float
    {
        if (is_numeric($estimate)) return max(0.0, min(1.0, ((float) $estimate) / 100.0));
        if (is_string($estimate)) {
            if (preg_match('/(\d+(?:\.\d+)?)/', $estimate, $m)) {
                return max(0.0, min(1.0, ((float) $m[1]) / 100.0));
            }
        }
        return 0.5;
    }

    private function normAge($age): float
    {
        if ($age === null || !is_numeric($age)) return 0.5;
        $a = (int) $age;
        // Higher score for younger productive-life recipients (peaks 18-40, declines after)
        if ($a < 18)  return 0.85;
        if ($a <= 40) return 1.0;
        if ($a <= 55) return 0.75;
        if ($a <= 65) return 0.55;
        return 0.30;
    }

    /**
     * Distance scoring: closer = higher score.
     * 0 km → 1.0 (max)
     * DISTANCE_MAX_KM or beyond → 0.0
     * null / unknown → 0.5 (neutral fallback so unmapped hospitals aren't penalized)
     */
    private function normDistance($km): float
    {
        if ($km === null || !is_numeric($km)) return 0.5;
        $d = max(0.0, (float) $km);
        if ($d >= self::DISTANCE_MAX_KM) return 0.0;
        return max(0.0, min(1.0, 1.0 - ($d / self::DISTANCE_MAX_KM)));
    }
}
