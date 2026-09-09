<?php

namespace Tests\Feature;

use App\Models\SurgeryBooking;
use App\Models\SurgicalResource;
use App\Models\User;
use App\Services\SurgeryScheduler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Module 9.1 — booking rules: overlap detection, resource eligibility, scoping.
 *
 * These run under RefreshDatabase (one migration, each test in a rolled-back
 * transaction) because they only need a single connection.
 *
 * They do NOT prove the concurrency safety — every assertion here passes even
 * with no locking at all, since the calls are sequential. SurgeryLockTest is
 * what proves the lock exists.
 */
class SurgeryBookingTest extends TestCase
{
    use RefreshDatabase;

    private int $hospitalId;
    private SurgicalResource $theatre;
    private SurgicalResource $surgeon;
    private SurgicalResource $icuBed;

    protected function setUp(): void
    {
        parent::setUp();

        $hospital = User::create([
            'name' => 'Test Hospital', 'email' => 'hospital@test.local',
            'password' => 'password', 'role' => 'hospital', 'status' => 'approved',
        ]);
        $this->hospitalId = $hospital->id;

        $this->theatre = SurgicalResource::create([
            'hospital_id' => $this->hospitalId, 'type' => 'theatre', 'name' => 'Theatre 1', 'code' => 'T1',
        ]);
        $this->surgeon = SurgicalResource::create([
            'hospital_id' => $this->hospitalId, 'type' => 'surgeon', 'name' => 'Dr Test', 'code' => 'S1',
        ]);
        $this->icuBed = SurgicalResource::create([
            'hospital_id' => $this->hospitalId, 'type' => 'icu_bed', 'name' => 'ICU Bed 1', 'code' => 'B1',
        ]);
    }

    private function book(string $start, string $end, array $overrides = []): array
    {
        return app(SurgeryScheduler::class)->book(array_merge([
            'theatre_id'      => $this->theatre->id,
            'surgeon_id'      => $this->surgeon->id,
            'scheduled_start' => $start,
            'scheduled_end'   => $end,
        ], $overrides), $this->hospitalId, null);
    }

    public function test_a_free_slot_is_booked(): void
    {
        $r = $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00');

        $this->assertTrue($r['ok']);
        $this->assertDatabaseCount('surgery_bookings', 1);
    }

    public function test_an_exactly_overlapping_slot_is_rejected(): void
    {
        $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00');
        $r = $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00');

        $this->assertFalse($r['ok']);
        $this->assertSame('theatre', $r['conflicts'][0]['type']);
        $this->assertDatabaseCount('surgery_bookings', 1);
    }

    public function test_a_partially_overlapping_slot_is_rejected(): void
    {
        $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00');

        // Starts inside the existing booking.
        $this->assertFalse($this->book('2026-10-01 12:00:00', '2026-10-01 15:00:00')['ok']);
        // Ends inside it.
        $this->assertFalse($this->book('2026-10-01 07:00:00', '2026-10-01 10:00:00')['ok']);
        // Fully contains it.
        $this->assertFalse($this->book('2026-10-01 08:00:00', '2026-10-01 14:00:00')['ok']);
        // Fully inside it.
        $this->assertFalse($this->book('2026-10-01 10:00:00', '2026-10-01 11:00:00')['ok']);

        $this->assertDatabaseCount('surgery_bookings', 1);
    }

    /**
     * The boundary case a scheduler gets wrong if it uses <= instead of <:
     * a theatre freed at 13:00 must be bookable from 13:00.
     */
    public function test_back_to_back_slots_are_allowed(): void
    {
        $this->assertTrue($this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00')['ok']);
        $this->assertTrue($this->book('2026-10-01 13:00:00', '2026-10-01 17:00:00')['ok']);

        $this->assertDatabaseCount('surgery_bookings', 2);
    }

    public function test_a_cancelled_booking_frees_its_resources(): void
    {
        $first = $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00');
        $this->assertFalse($this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00')['ok']);

        $first['booking']->update(['status' => 'cancelled']);

        $this->assertTrue($this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00')['ok']);
    }

    public function test_a_busy_surgeon_blocks_a_free_theatre(): void
    {
        $theatre2 = SurgicalResource::create([
            'hospital_id' => $this->hospitalId, 'type' => 'theatre', 'name' => 'Theatre 2', 'code' => 'T2',
        ]);

        $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00');

        // Different theatre, same surgeon, same window — the surgeon cannot be in two places.
        $r = $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00', ['theatre_id' => $theatre2->id]);

        $this->assertFalse($r['ok']);
        $this->assertSame('surgeon', $r['conflicts'][0]['type']);
    }

    /**
     * The ICU bed is held for a recovery window that starts when surgery ends,
     * so two surgeries far enough apart to share a theatre can still collide on
     * the bed.
     */
    public function test_icu_bed_is_held_for_the_recovery_window(): void
    {
        $surgeon2 = SurgicalResource::create([
            'hospital_id' => $this->hospitalId, 'type' => 'surgeon', 'name' => 'Dr Two', 'code' => 'S2',
        ]);

        $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00', [
            'icu_bed_id' => $this->icuBed->id, 'icu_hours' => 48,
        ]);

        // Next day: theatre and surgeon are free, but the bed is still occupied.
        $r = $this->book('2026-10-02 09:00:00', '2026-10-02 13:00:00', [
            'surgeon_id' => $surgeon2->id,
            'icu_bed_id' => $this->icuBed->id, 'icu_hours' => 24,
        ]);

        $this->assertFalse($r['ok']);
        $this->assertSame('icu_bed', $r['conflicts'][0]['type']);
    }

    public function test_an_inactive_resource_cannot_be_booked(): void
    {
        $this->theatre->update(['is_active' => false]);

        $r = $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00');

        $this->assertFalse($r['ok']);
        $this->assertStringContainsString('inactive', $r['conflicts'][0]['reason']);
    }

    public function test_another_hospitals_resource_cannot_be_booked(): void
    {
        $other = User::create([
            'name' => 'Other Hospital', 'email' => 'other@test.local',
            'password' => 'password', 'role' => 'hospital', 'status' => 'approved',
        ]);
        $theirTheatre = SurgicalResource::create([
            'hospital_id' => $other->id, 'type' => 'theatre', 'name' => 'Their Theatre', 'code' => 'X1',
        ]);

        $r = $this->book('2026-10-01 09:00:00', '2026-10-01 13:00:00', ['theatre_id' => $theirTheatre->id]);

        $this->assertFalse($r['ok']);
        $this->assertDatabaseCount('surgery_bookings', 0);
    }
}
