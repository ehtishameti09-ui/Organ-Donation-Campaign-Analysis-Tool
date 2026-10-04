<?php

namespace App\Console\Commands;

use App\Models\AllocationRun;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Remove cross-hospital identity from allocation runs recorded before the
 * allocation payload was minimised.
 *
 * `allocation_runs.results` is a JSON snapshot of the whole ranked candidate pool,
 * and it used to include the name, email and diagnosis of every approved recipient
 * in the network - not just the donor hospital's own patients. The live payload no
 * longer carries those fields and the read paths scrub them, but the rows on disk
 * still hold them. A disclosure control that only applies at the API is not a
 * control over data at rest: anyone with database access, a backup file, or a
 * future endpoint that touches `results` would still see it.
 *
 * The scoring fields are left exactly as they were. Re-running an old ranking must
 * still reproduce the same order, and AllocationService::rank() never reads name,
 * email or diagnosis - so removing them cannot change a result. That is what makes
 * this safe to run over historical evidence.
 *
 *   php artisan allocation:scrub-pii --dry-run
 *   php artisan allocation:scrub-pii
 */
class ScrubRunPii extends Command
{
    protected $signature = 'allocation:scrub-pii {--dry-run : Report what would change without writing}';

    protected $description = 'Strip cross-hospital names, emails and diagnoses from stored allocation run results';

    /** Display-only fields that must not cross a hospital boundary. */
    private const STRIP = ['name', 'email', 'diagnosis'];

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        // One lookup instead of a query per run.
        $donorHospitals = User::whereIn('id', AllocationRun::distinct()->pluck('donor_user_id'))
            ->pluck('preferred_hospital_id', 'id');

        $runs = AllocationRun::select('id', 'donor_user_id', 'results')->get();

        if ($runs->isEmpty()) {
            $this->info('No allocation runs stored. Nothing to do.');
            return self::SUCCESS;
        }

        $runsChanged = 0;
        $rowsChanged = 0;
        $skipped     = 0;

        foreach ($runs as $run) {
            $donorHospitalId = $donorHospitals[$run->donor_user_id] ?? null;

            // Without the donor's hospital there is no boundary to measure against.
            // Withholding from everyone would be the safe default, but it would also
            // destroy the hospital's own patients' data in its own run, so these are
            // reported rather than guessed at.
            if ($donorHospitalId === null) {
                $skipped++;
                $this->warn("  run #{$run->id}: donor has no hospital - skipped, review by hand");
                continue;
            }

            $results = $run->results ?? [];
            $touched = 0;

            foreach ($results as $i => $row) {
                if (isset($row['hospital_id']) && (int) $row['hospital_id'] === (int) $donorHospitalId) {
                    continue;
                }

                $changed = false;
                foreach (self::STRIP as $field) {
                    if (($row[$field] ?? null) !== null) {
                        $row[$field] = null;
                        $changed = true;
                    }
                }

                if (!$changed) continue;

                $row['match_code']        = $row['match_code'] ?? ('REC-' . ($row['user_id'] ?? '?'));
                $row['identity_withheld'] = true;

                $results[$i] = $row;
                $touched++;
            }

            if ($touched === 0) continue;

            $runsChanged++;
            $rowsChanged += $touched;

            if ($dry) {
                $this->line("  run #{$run->id}: would scrub {$touched} candidate(s)");
                continue;
            }

            $run->results = $results;
            $run->save();
        }

        $verb = $dry ? 'would be scrubbed' : 'scrubbed';
        $this->newLine();
        $this->info("{$rowsChanged} candidate record(s) across {$runsChanged} run(s) {$verb}.");

        if ($skipped) {
            $this->warn("{$skipped} run(s) skipped because the donor has no hospital.");
        }

        if ($dry && $rowsChanged) {
            $this->line('Re-run without --dry-run to apply.');
        }

        return self::SUCCESS;
    }
}
