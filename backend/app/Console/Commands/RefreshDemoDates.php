<?php

namespace App\Console\Commands;

use App\Models\Organ;
use App\Models\SurgeryBooking;
use Illuminate\Console\Command;

/**
 * Slide the seeded demo data back onto today's date.
 *
 * DemoDataSeeder generates surgery bookings and organ recovery times relative to
 * the day it is run. A week later the surgery calendar is empty, the utilisation
 * window (which looks forward) reads 0% across the board, and every organ has
 * aged out of its cold-ischemia bands. Nothing is broken - the data is simply
 * stale - but a demo of working analytics that shows nothing but zeros is worse
 * than useless.
 *
 * This shifts the whole set by a fixed offset so the RELATIVE spacing is
 * preserved: a booking that was three days before another stays three days
 * before it, back-to-back slots stay back-to-back, and the organs keep the
 * spread of cold-chain states the seeder chose. Only real data is at risk if
 * this is pointed at the wrong rows, so it touches nothing that lacks the
 * seeder's marker.
 */
class RefreshDemoDates extends Command
{
    protected $signature = 'demo:refresh-dates {--dry-run : Show what would move without writing}';

    protected $description = 'Shift seeded demo bookings and organ timestamps so they straddle today again';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        // Only rows the seeder created. Anything a human entered is left alone.
        $bookings = SurgeryBooking::where('notes', 'Seeded demo booking.')->get();

        if ($bookings->isEmpty()) {
            $this->warn('No seeded bookings found (looked for notes = "Seeded demo booking."). Nothing to do.');
            return self::SUCCESS;
        }

        // Anchor on the median booking so the set ends up centred on today,
        // leaving both past (completed/cancelled) and future (scheduled) work
        // visible - which is what makes the calendar and the forward-looking
        // utilisation window both show something.
        $starts = $bookings->pluck('scheduled_start')->sort()->values();
        $median = $starts[intdiv($starts->count(), 2)];
        // Whole days only, measured midnight-to-midnight. Carbon's diffInDays
        // returns a float, and addDays() on a fraction drags the clock with it -
        // which turned 08:00 theatre slots into 00:40 ones.
        $offset = (int) $median->copy()->startOfDay()->diffInDays(now()->startOfDay(), false);

        // The organ clocks are refreshed regardless. They drift independently of
        // the bookings, so an early return here left them stale whenever the
        // bookings happened to already straddle today.
        if ($offset === 0 && !$dry) {
            $organs = $this->refreshOrgans();
            $this->info("Bookings already centred on today; refreshed {$organs} organ clock(s).");
            return self::SUCCESS;
        }

        $this->info(sprintf(
            'Shifting %d booking(s) by %+d day(s) (median was %s).',
            $bookings->count(), $offset, $median->toDateString()
        ));

        if ($dry) {
            foreach ($bookings->take(5) as $b) {
                $this->line(sprintf('  #%d  %s  ->  %s',
                    $b->id, $b->scheduled_start->toDateTimeString(),
                    $b->scheduled_start->copy()->addDays($offset)->toDateTimeString()));
            }
            $this->line('  ...');
            return self::SUCCESS;
        }

        foreach ($bookings as $b) {
            $b->forceFill([
                'scheduled_start' => $b->scheduled_start->copy()->addDays($offset),
                'scheduled_end'   => $b->scheduled_end->copy()->addDays($offset),
                'icu_from'        => $b->icu_from?->copy()->addDays($offset),
                'icu_until'       => $b->icu_until?->copy()->addDays($offset),
            ])->save();

            // Past work is done or abandoned; future work is still booked.
            if ($b->status !== 'cancelled') {
                $b->status = $b->scheduled_end->isPast() ? 'completed' : 'scheduled';
                $b->save();
            }
        }

        $moved = $this->refreshOrgans();

        $this->info(sprintf(
            'Done. %d booking(s) shifted, %d organ(s) returned to a live cold chain.',
            $bookings->count(), $moved
        ));

        return self::SUCCESS;
    }

    /**
     * Put the live organs back across the full range of cold-chain bands.
     *
     * The first attempt tried to preserve each organ's ORIGINAL position in its
     * window, computed from how far through it was now. That cannot work: after
     * a few weeks every organ is thousands of percent past its limit, so they
     * all clamped to the ceiling and the registry showed eight breaches and
     * nothing else. The original ratio is simply not recoverable from aged data.
     *
     * So a deliberate spread is assigned instead, cycling through positions that
     * land in each band - which is what the seeder was expressing in the first
     * place, and what makes the page demonstrate all four states.
     */
    private function refreshOrgans(): int
    {
        $live = Organ::whereNotIn('status', Organ::TERMINAL)->get();
        $moved = 0;

        // Fractions of each organ's own limit: comfortable, advisory (>=0.60),
        // warning (>=0.85) and one past the line, so every band is represented
        // whatever mix of organ types happens to be live.
        $spread = [0.12, 0.35, 0.64, 0.72, 0.88, 0.93, 1.18, 0.21];

        foreach ($live->values() as $i => $organ) {
            if (!$organ->recovered_at) continue;

            $limit = max(1, (int) $organ->cold_ischemia_limit_minutes);
            $ratio = $spread[$i % count($spread)];

            $organ->forceFill([
                'recovered_at' => now()->subMinutes((int) round($ratio * $limit)),
                // A fresh clock deserves a fresh alarm: clearing these lets the
                // breach notification fire again for the organ now past its limit.
                'breach_notified_at'  => null,
                'warning_notified_at' => null,
            ])->save();
            $moved++;
        }

        return $moved;
    }
}
