<?php

namespace Tests\Unit;

use App\Services\AllocationService;
use Tests\TestCase;

class AllocationServiceTest extends TestCase
{
    private AllocationService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = new AllocationService();
    }

    public function test_score_breakdown_sums_to_final(): void
    {
        $r = ['urgency_score' => 8.0, 'days_on_waitlist' => 180, 'survival_estimate' => '70', 'age' => 35];
        $b = $this->svc->score($r, AllocationService::DEFAULT_WEIGHTS);
        $this->assertEquals(round($b['urgency'] + $b['waiting'] + $b['survival'] + $b['age'], 2), $b['final']);
    }

    public function test_higher_urgency_yields_higher_urgency_contribution(): void
    {
        $low  = $this->svc->score(['urgency_score' => 2.0, 'days_on_waitlist' => 0, 'survival_estimate' => '50', 'age' => 30]);
        $high = $this->svc->score(['urgency_score' => 9.5, 'days_on_waitlist' => 0, 'survival_estimate' => '50', 'age' => 30]);
        $this->assertGreaterThan($low['urgency'], $high['urgency']);
    }

    public function test_blood_type_compatibility_o_negative_universal(): void
    {
        foreach (['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'] as $rec) {
            $this->assertTrue($this->svc->bloodCompatible('O-', $rec), "O- should match $rec");
        }
    }

    public function test_blood_type_compatibility_ab_positive_universal_recipient(): void
    {
        foreach (['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as $don) {
            $this->assertTrue($this->svc->bloodCompatible($don, 'AB+'), "AB+ should accept $don");
        }
    }

    public function test_incompatible_blood_blocks_match(): void
    {
        $this->assertFalse($this->svc->bloodCompatible('A+', 'O-'));
        $this->assertFalse($this->svc->bloodCompatible('B+', 'A+'));
    }

    public function test_rank_excludes_organ_mismatch(): void
    {
        $donor = ['blood_type' => 'O+', 'pledged_organs' => ['kidney']];
        $recipients = [
            ['user_id' => 1, 'blood_type' => 'O+', 'organ_needed' => 'liver',  'urgency_score' => 9, 'days_on_waitlist' => 100, 'survival_estimate' => 70, 'age' => 30],
            ['user_id' => 2, 'blood_type' => 'O+', 'organ_needed' => 'kidney', 'urgency_score' => 5, 'days_on_waitlist' => 100, 'survival_estimate' => 70, 'age' => 30],
        ];
        $ranked = $this->svc->rank($donor, $recipients, AllocationService::DEFAULT_WEIGHTS, 'kidney');
        $this->assertCount(1, $ranked);
        $this->assertEquals(2, $ranked[0]['user_id']);
    }

    public function test_rank_orders_by_descending_score(): void
    {
        $donor = ['blood_type' => 'O+', 'pledged_organs' => ['kidney']];
        $recipients = [
            ['user_id' => 1, 'blood_type' => 'O+', 'organ_needed' => 'kidney', 'urgency_score' => 3, 'days_on_waitlist' => 30,  'survival_estimate' => 60, 'age' => 50],
            ['user_id' => 2, 'blood_type' => 'O+', 'organ_needed' => 'kidney', 'urgency_score' => 9, 'days_on_waitlist' => 200, 'survival_estimate' => 80, 'age' => 28],
        ];
        $ranked = $this->svc->rank($donor, $recipients);
        $this->assertEquals(2, $ranked[0]['user_id']);
        $this->assertEquals(1, $ranked[0]['rank']);
        $this->assertGreaterThan($ranked[1]['final_score'], $ranked[0]['final_score']);
    }

    public function test_changing_weights_changes_rankings(): void
    {
        $donor = ['blood_type' => 'O+', 'pledged_organs' => ['kidney']];
        $recipients = [
            ['user_id' => 'A', 'blood_type' => 'O+', 'organ_needed' => 'kidney', 'urgency_score' => 9, 'days_on_waitlist' => 0,   'survival_estimate' => 50, 'age' => 60],
            ['user_id' => 'B', 'blood_type' => 'O+', 'organ_needed' => 'kidney', 'urgency_score' => 4, 'days_on_waitlist' => 365, 'survival_estimate' => 50, 'age' => 60],
        ];
        $urgencyHeavy = $this->svc->rank($donor, $recipients, ['urgency' => 80, 'waiting' => 10, 'survival' => 5, 'age' => 5]);
        $waitingHeavy = $this->svc->rank($donor, $recipients, ['urgency' => 10, 'waiting' => 80, 'survival' => 5, 'age' => 5]);
        $this->assertEquals('A', $urgencyHeavy[0]['user_id']);
        $this->assertEquals('B', $waitingHeavy[0]['user_id']);
    }

    public function test_zero_weights_yields_zero_score(): void
    {
        $b = $this->svc->score(['urgency_score' => 9, 'days_on_waitlist' => 365, 'survival_estimate' => 95, 'age' => 30], ['urgency' => 0, 'waiting' => 0, 'survival' => 0, 'age' => 0]);
        $this->assertEquals(0, $b['final']);
    }

    public function test_haversine_zero_distance_for_same_coordinates(): void
    {
        $this->assertEqualsWithDelta(0.0, $this->svc->distanceKm(33.6007, 73.0443, 33.6007, 73.0443), 0.01);
    }

    public function test_haversine_known_distance_islamabad_to_lahore(): void
    {
        // Islamabad ≈ 33.6844°N, 73.0479°E ; Lahore ≈ 31.5204°N, 74.3587°E. Real distance ≈ 273 km.
        $d = $this->svc->distanceKm(33.6844, 73.0479, 31.5204, 74.3587);
        $this->assertGreaterThan(260, $d);
        $this->assertLessThan(290, $d);
    }

    public function test_haversine_returns_null_on_missing_coords(): void
    {
        $this->assertNull($this->svc->distanceKm(null, 73.0, 33.6, 73.0));
        $this->assertNull($this->svc->distanceKm(33.6, null, 33.6, 73.0));
    }

    public function test_distance_zero_km_gives_max_distance_contribution(): void
    {
        $weights = ['urgency' => 0, 'waiting' => 0, 'survival' => 0, 'age' => 0, 'distance' => 100];
        $b = $this->svc->score(['distance_km' => 0], $weights);
        $this->assertEqualsWithDelta(100, $b['distance'], 0.01);
    }

    public function test_distance_at_max_km_gives_zero_contribution(): void
    {
        $weights = ['urgency' => 0, 'waiting' => 0, 'survival' => 0, 'age' => 0, 'distance' => 100];
        $b = $this->svc->score(['distance_km' => 1500], $weights);
        $this->assertEqualsWithDelta(0, $b['distance'], 0.01);
    }

    public function test_closer_recipient_outranks_far_recipient_when_distance_weight_high(): void
    {
        $donor = ['blood_type' => 'O+', 'pledged_organs' => ['kidney']];
        $recipients = [
            ['user_id' => 'far',   'blood_type' => 'O+', 'organ_needed' => 'kidney', 'urgency_score' => 7, 'days_on_waitlist' => 100, 'survival_estimate' => 70, 'age' => 35, 'distance_km' => 1200],
            ['user_id' => 'near',  'blood_type' => 'O+', 'organ_needed' => 'kidney', 'urgency_score' => 7, 'days_on_waitlist' => 100, 'survival_estimate' => 70, 'age' => 35, 'distance_km' => 50],
        ];
        $weights = ['urgency' => 25, 'waiting' => 15, 'survival' => 15, 'age' => 5, 'distance' => 40];
        $ranked = $this->svc->rank($donor, $recipients, $weights);
        $this->assertEquals('near', $ranked[0]['user_id']);
        $this->assertEquals('far',  $ranked[1]['user_id']);
    }

    public function test_compatibility_matrix_can_be_overridden(): void
    {
        // Default: A+ → AB+ is compatible
        $this->assertTrue($this->svc->bloodCompatible('A+', 'AB+'));

        // Override with empty matrix should fall back to defaults (defensive)
        $this->svc->setCompatibilityMatrix([]);
        $this->assertTrue($this->svc->bloodCompatible('A+', 'AB+'));

        // Now override with restrictive matrix
        $this->svc->setCompatibilityMatrix(['O+' => ['O+']]);
        $this->assertTrue($this->svc->bloodCompatible('O+', 'O+'));
        $this->assertFalse($this->svc->bloodCompatible('A+', 'AB+'));
    }
}
