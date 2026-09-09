<?php

namespace Tests\Feature;

use App\Models\SurgicalResource;
use App\Services\SurgeryScheduler;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Module 9.1 — proof that the booking lock is real.
 *
 * WHY THIS FILE IS SEPARATE FROM SurgeryBookingTest
 * -------------------------------------------------
 * Those tests run under RefreshDatabase, which wraps each test in a transaction
 * that is rolled back at the end. Nothing is ever committed, so a second
 * database connection cannot see any of it — which makes it impossible to test
 * cross-connection locking there. DatabaseTruncation commits normally and
 * cleans up by truncating afterwards, so a second connection sees real data.
 *
 * WHAT THESE TESTS ADD
 * --------------------
 * Every overlap assertion in SurgeryBookingTest passes even if SurgeryScheduler
 * did no locking whatsoever, because those calls happen one after another. A
 * double-booking only occurs when two requests interleave, and PHPUnit is
 * single-threaded. So instead of trying to fake concurrency, these tests assert
 * the mechanism directly: hold the lock on one connection, and prove a second
 * connection is genuinely blocked by it.
 */
class SurgeryLockTest extends TestCase
{
    use DatabaseTruncation;

    private int $hospitalId;
    private SurgicalResource $theatre;
    private SurgicalResource $theatre2;
    private SurgicalResource $surgeon;

    protected function setUp(): void
    {
        parent::setUp();

        $hospital = User::create([
            'name' => 'Lock Test Hospital', 'email' => 'locktest@test.local',
            'password' => 'password', 'role' => 'hospital', 'status' => 'approved',
        ]);

        $this->theatre = SurgicalResource::create([
            'hospital_id' => $hospital->id, 'type' => 'theatre', 'name' => 'Theatre 1', 'code' => 'T1',
        ]);
        $this->theatre2 = SurgicalResource::create([
            'hospital_id' => $hospital->id, 'type' => 'theatre', 'name' => 'Theatre 2', 'code' => 'T2',
        ]);
        $this->surgeon = SurgicalResource::create([
            'hospital_id' => $hospital->id, 'type' => 'surgeon', 'name' => 'Dr Lock', 'code' => 'S1',
        ]);
        $this->hospitalId = $hospital->id;
    }

    /**
     * Probe the row from a genuinely separate connection and report whether it
     * was blocked.
     *
     * The probe takes a SHARED lock, not an exclusive one, and that distinction
     * is the whole point. Inserting a surgery_bookings row makes InnoDB take a
     * shared (S) lock on the referenced surgical_resources row to check the
     * foreign key — which happens whether or not the scheduler locks anything.
     * An exclusive probe would block on that S lock too, so it would report
     * "locked" even for a scheduler with no locking at all, and the test would
     * prove nothing.
     *
     * A shared probe is compatible with the FK's S lock and conflicts only with
     * a real exclusive lock. So it blocks if and only if the scheduler actually
     * took SELECT ... FOR UPDATE.
     */
    private function secondConnectionBlockedOn(int $resourceId): bool
    {
        config(['database.connections.lock_probe' => config('database.connections.mysql')]);
        DB::purge('lock_probe');
        $probe = DB::connection('lock_probe');
        $probe->statement('SET SESSION innodb_lock_wait_timeout = 1');

        try {
            $probe->beginTransaction();
            $probe->table('surgical_resources')->where('id', $resourceId)->sharedLock()->get();
            $probe->rollBack();
            return false;
        } catch (\Illuminate\Database\QueryException $e) {
            try { $probe->rollBack(); } catch (\Throwable) {}
            return true;
        } finally {
            $probe->disconnect();
        }
    }

    /**
     * THE RACE-CONDITION TEST.
     *
     * This drives the real SurgeryScheduler rather than locking a row by hand,
     * so it proves the production code path takes the lock — not merely that
     * MySQL has row locks.
     *
     * The trick is the outer transaction. SurgeryScheduler::book opens its own
     * transaction, which nests as a savepoint here and therefore does not commit
     * or release anything. So once book() returns, this test is still holding
     * every lock the scheduler acquired, and a second connection can be used to
     * ask whether the theatre row is actually locked.
     *
     * If the FOR UPDATE were removed from SurgeryScheduler, the probe would
     * acquire the row instantly and this test would fail — which is exactly the
     * condition under which two concurrent bookings both pass the overlap check
     * and double-book the same theatre.
     */
    public function test_the_scheduler_holds_an_exclusive_lock_on_the_resources_it_books(): void
    {
        DB::beginTransaction();

        $result = app(SurgeryScheduler::class)->book([
            'theatre_id'      => $this->theatre->id,
            'surgeon_id'      => $this->surgeon->id,
            'scheduled_start' => '2026-10-01 09:00:00',
            'scheduled_end'   => '2026-10-01 13:00:00',
        ], $this->hospitalId, null);

        $this->assertTrue($result['ok'], 'Setup failed: the booking itself was rejected.');

        // The scheduler locked this row; the outer transaction still holds it.
        $blockedOnBooked = $this->secondConnectionBlockedOn($this->theatre->id);

        // Control: a theatre the booking never touched must remain free.
        $blockedOnUntouched = $this->secondConnectionBlockedOn($this->theatre2->id);

        DB::rollBack();

        $this->assertTrue(
            $blockedOnBooked,
            'SurgeryScheduler did not hold an exclusive lock on the theatre it booked. '
            . 'Without that lock two concurrent requests can both pass the overlap check '
            . 'and double-book the same theatre.'
        );
        $this->assertFalse(
            $blockedOnUntouched,
            'Booking one theatre locked an unrelated theatre — the lock is too coarse and '
            . 'would serialise every booking in the hospital.'
        );
    }

    /**
     * The lock must be per-row, not per-table. If booking Theatre 1 blocked
     * Theatre 2, the scheduler would serialise every booking in the hospital and
     * the safety fix would have become a throughput bug.
     */
    public function test_locking_one_resource_does_not_block_another(): void
    {
        DB::beginTransaction();
        DB::table('surgical_resources')->where('id', $this->theatre->id)->lockForUpdate()->get();

        $blocked = $this->secondConnectionBlockedOn($this->theatre2->id);

        DB::rollBack();

        $this->assertFalse($blocked, 'Locking one theatre blocked an unrelated theatre — the lock is too coarse.');
    }
}
