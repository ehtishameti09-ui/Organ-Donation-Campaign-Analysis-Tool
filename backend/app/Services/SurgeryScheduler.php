<?php

namespace App\Services;

use App\Models\SurgeryBooking;
use App\Models\SurgicalResource;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Module 9.1 — transaction-safe booking.
 *
 * THE RACE THIS PREVENTS
 * ----------------------
 * Two coordinators book Theatre 1 for 09:00–13:00 at the same moment. Both
 * requests run "is anything already booked in that window?", both see nothing,
 * both insert. The theatre is now double-booked and nothing in the database
 * says so. Checking-then-writing is not safe unless something stops the two
 * checks from interleaving.
 *
 * HOW IT IS PREVENTED
 * -------------------
 * Every booking takes a SELECT ... FOR UPDATE on the surgical_resources rows it
 * intends to use, inside a transaction, BEFORE running the overlap query. The
 * second transaction blocks on that lock until the first commits, and by the
 * time it proceeds the first booking is visible to its overlap check, so it
 * correctly fails. The resource row acts as the mutex for its own calendar.
 *
 * Two details that matter:
 *
 *  - Locks are acquired in a single query ordered by id. Two transactions that
 *    want an overlapping set of resources therefore always request them in the
 *    same order, which is what stops A-waits-for-B-waits-for-A deadlocks.
 *
 *  - The lock is on surgical_resources, not on surgery_bookings. Locking rows in
 *    the bookings table cannot protect against a row that does not exist yet —
 *    the classic phantom-read problem. The resource row always exists, so it is
 *    a stable thing to serialise on.
 *
 * A unique index cannot express this constraint: overlap is a range predicate,
 * not an equality, and MySQL has no exclusion constraints.
 */
class SurgeryScheduler
{
    /** Thrown as a 422 by the controller. */
    public const CONFLICT = 'conflict';

    /**
     * Create a booking, or return the conflicts that prevented it.
     *
     * @return array{ok: bool, booking?: SurgeryBooking, conflicts?: array}
     */
    public function book(array $data, int $hospitalId, ?int $actorId): array
    {
        return DB::transaction(function () use ($data, $hospitalId, $actorId) {

            $resourceIds = array_values(array_filter([
                $data['theatre_id'], $data['surgeon_id'], $data['icu_bed_id'] ?? null,
            ]));

            // ---- The lock. Ordered by id: consistent acquisition order, no deadlock. ----
            $resources = SurgicalResource::whereIn('id', $resourceIds)
                ->where('hospital_id', $hospitalId)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            // Validate the resources exist, belong here, and are the right type.
            $expect = [
                $data['theatre_id'] => 'theatre',
                $data['surgeon_id'] => 'surgeon',
            ];
            if (!empty($data['icu_bed_id'])) $expect[$data['icu_bed_id']] = 'icu_bed';

            foreach ($expect as $id => $type) {
                $r = $resources->get($id);
                if (!$r)                  return ['ok' => false, 'conflicts' => [['reason' => "Resource #{$id} was not found for your hospital."]]];
                if ($r->type !== $type)   return ['ok' => false, 'conflicts' => [['reason' => "{$r->name} is not a {$type}."]]];
                if (!$r->is_active)       return ['ok' => false, 'conflicts' => [['reason' => "{$r->name} is marked inactive and cannot be booked."]]];
            }

            $start = Carbon::parse($data['scheduled_start']);
            $end   = Carbon::parse($data['scheduled_end']);

            // ICU occupancy runs from the end of surgery for the requested hours.
            $icuFrom = $icuUntil = null;
            if (!empty($data['icu_bed_id'])) {
                $icuFrom  = $end->copy();
                $icuUntil = $end->copy()->addHours(max(1, (int) ($data['icu_hours'] ?? 24)));
            }

            // ---- Overlap check, now safely serialised behind the lock. ----
            $conflicts = $this->findConflicts(
                theatreId: $data['theatre_id'],
                surgeonId: $data['surgeon_id'],
                icuBedId:  $data['icu_bed_id'] ?? null,
                start: $start, end: $end,
                icuFrom: $icuFrom, icuUntil: $icuUntil,
                resources: $resources,
                ignoreBookingId: $data['ignore_booking_id'] ?? null,
            );

            if ($conflicts) return ['ok' => false, 'conflicts' => $conflicts];

            $booking = SurgeryBooking::create([
                'hospital_id'       => $hospitalId,
                'organ_id'          => $data['organ_id'] ?? null,
                'case_approval_id'  => $data['case_approval_id'] ?? null,
                'recipient_user_id' => $data['recipient_user_id'] ?? null,
                'theatre_id'        => $data['theatre_id'],
                'surgeon_id'        => $data['surgeon_id'],
                'icu_bed_id'        => $data['icu_bed_id'] ?? null,
                'scheduled_start'   => $start,
                'scheduled_end'     => $end,
                'icu_from'          => $icuFrom,
                'icu_until'         => $icuUntil,
                'status'            => 'scheduled',
                'notes'             => $data['notes'] ?? null,
                'created_by'        => $actorId,
            ]);

            return ['ok' => true, 'booking' => $booking];
            // COMMIT releases the resource locks; the next waiting booking now
            // sees this row and conflicts against it correctly.
        });
    }

    /**
     * Find bookings that clash with the requested windows.
     *
     * Overlap is `existing.start < new.end AND existing.end > new.start`. Strict
     * inequalities on both sides are deliberate: a booking ending exactly at
     * 13:00 and another starting exactly at 13:00 do NOT overlap, which is the
     * behaviour a scheduler needs for back-to-back slots.
     */
    private function findConflicts(
        int $theatreId, int $surgeonId, ?int $icuBedId,
        Carbon $start, Carbon $end, ?Carbon $icuFrom, ?Carbon $icuUntil,
        $resources, ?int $ignoreBookingId = null
    ): array {
        $conflicts = [];

        // Theatre
        $t = SurgeryBooking::whereIn('status', SurgeryBooking::BLOCKING)
            ->when($ignoreBookingId, fn ($q) => $q->where('id', '!=', $ignoreBookingId))
            ->where('theatre_id', $theatreId)
            ->where('scheduled_start', '<', $end)
            ->where('scheduled_end', '>', $start)
            ->first();
        if ($t) {
            $conflicts[] = $this->describe('theatre', $resources->get($theatreId), $t, $t->scheduled_start, $t->scheduled_end);
        }

        // Surgeon
        $s = SurgeryBooking::whereIn('status', SurgeryBooking::BLOCKING)
            ->when($ignoreBookingId, fn ($q) => $q->where('id', '!=', $ignoreBookingId))
            ->where('surgeon_id', $surgeonId)
            ->where('scheduled_start', '<', $end)
            ->where('scheduled_end', '>', $start)
            ->first();
        if ($s) {
            $conflicts[] = $this->describe('surgeon', $resources->get($surgeonId), $s, $s->scheduled_start, $s->scheduled_end);
        }

        // ICU bed — occupies its own, longer window.
        if ($icuBedId && $icuFrom && $icuUntil) {
            $b = SurgeryBooking::whereIn('status', SurgeryBooking::BLOCKING)
                ->when($ignoreBookingId, fn ($q) => $q->where('id', '!=', $ignoreBookingId))
                ->where('icu_bed_id', $icuBedId)
                ->whereNotNull('icu_from')
                ->where('icu_from', '<', $icuUntil)
                ->where('icu_until', '>', $icuFrom)
                ->first();
            if ($b) {
                $conflicts[] = $this->describe('icu_bed', $resources->get($icuBedId), $b, $b->icu_from, $b->icu_until);
            }
        }

        return $conflicts;
    }

    private function describe(string $type, ?SurgicalResource $r, SurgeryBooking $b, $from, $to): array
    {
        $name = $r?->name ?? ucfirst(str_replace('_', ' ', $type));
        return [
            'type'       => $type,
            'resource'   => $name,
            'booking_id' => $b->id,
            'from'       => $from?->toIso8601String(),
            'to'         => $to?->toIso8601String(),
            'reason'     => sprintf(
                '%s is already booked %s–%s (booking #%d).',
                $name,
                $from?->format('d M H:i'),
                $to?->format('H:i'),
                $b->id
            ),
        ];
    }
}
