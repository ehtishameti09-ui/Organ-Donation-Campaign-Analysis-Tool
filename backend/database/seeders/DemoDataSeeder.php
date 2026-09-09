<?php

namespace Database\Seeders;

use App\Http\Controllers\CaseApprovalController;
use App\Models\AllocationDecision;
use App\Models\AllocationPolicy;
use App\Models\AllocationRun;
use App\Models\Appeal;
use App\Models\AdminRequest;
use App\Models\BloodCompatibility;
use App\Models\CaseAppeal;
use App\Models\CaseApproval;
use App\Models\ConsentForm;
use App\Models\Document;
use App\Models\HospitalProfile;
use App\Models\Organ;
use App\Models\OrganEvent;
use App\Models\SurgeryBooking;
use App\Models\SurgicalResource;
use App\Models\User;
use App\Services\AllocationService;
use App\Services\SurgeryScheduler;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Fills every business table that would otherwise sit empty, so each module has
 * something to show.
 *
 * Only demo/business data is created. The infrastructure tables (cache, jobs,
 * sessions, password_reset_tokens) are deliberately left empty — rows there are
 * transient runtime state, and fabricating them would be meaningless at best and
 * misleading at worst. model_has_permissions is also left empty on purpose:
 * this system grants permissions through roles, so direct user-permission rows
 * would misrepresent how the RBAC actually works.
 *
 * Safe to re-run: every section skips itself if its table already has rows, so
 * this can be used to rebuild a demo environment without duplicating anything.
 */
class DemoDataSeeder extends Seeder
{
    private array $hospitals = [];

    public function run(): void
    {
        $this->hospitals = User::where('role', 'hospital')->where('status', 'approved')->get()->all();

        if (!$this->hospitals) {
            $this->command->warn('No approved hospitals found — run DefaultUsersSeeder first.');
            return;
        }

        $this->seedStaff();
        $this->spreadPatientsAcrossHospitals();
        $this->seedDocuments();
        $this->seedConsentForms();
        $this->seedAdminRequests();
        $this->seedAppeals();
        $this->seedAllocationRunsAndDecisions();
        $this->advanceApprovals();
        $this->seedOrgans();
        $this->seedSurgicalResources();
        $this->seedSurgeryBookings();

        $this->command->info('Demo data seeded.');
    }

    /** Every hospital needs a doctor — Module 7's dual sign-off is unusable without one. */
    private function seedStaff(): void
    {
        $created = 0;

        foreach ($this->hospitals as $i => $hospital) {
            $slug = 'h' . $hospital->id;

            $staff = [
                ['role' => 'doctor',     'name' => ['Dr Sana Malik', 'Dr Bilal Raza', 'Dr Ayesha Noor', 'Dr Imran Shah', 'Dr Hina Tariq'][$i % 5]],
                ['role' => 'doctor',     'name' => ['Dr Faisal Khan', 'Dr Zara Ahmed', 'Dr Usman Ali', 'Dr Mehwish Iqbal', 'Dr Kamran Butt'][$i % 5]],
                ['role' => 'data_entry', 'name' => ['Adnan Sheikh', 'Rabia Aslam', 'Tariq Mehmood', 'Nida Farooq', 'Salman Yousaf'][$i % 5]],
                ['role' => 'auditor',    'name' => ['Farhan Qureshi', 'Sadia Rehman', 'Waqar Hussain', 'Amna Javed', 'Bilal Anwar'][$i % 5]],
            ];

            foreach ($staff as $n => $person) {
                $email = strtolower(str_replace([' ', '.'], ['.', ''], $person['name'])) . ".{$slug}.{$n}@odcat.test";
                if (User::where('email', $email)->exists()) continue;

                $user = User::create([
                    'name'               => $person['name'],
                    'email'              => $email,
                    'password'           => 'Staff@123',
                    'role'               => $person['role'],
                    'status'             => 'approved',
                    'linked_hospital_id' => $hospital->id,
                    'email_verified_at'  => now(),
                    'registration_complete' => true,
                ]);
                $user->syncRoles([$person['role']]);
                $created++;
            }
        }

        $this->command->info("  staff accounts: +{$created} (password: Staff@123)");
    }

    /**
     * All 592 patients sat on one hospital, leaving the other four with nothing
     * to allocate. Spread a slice of them so every hospital has a real caseload
     * and the cross-hospital comparisons in Modules 6 and 7 mean something.
     */
    private function spreadPatientsAcrossHospitals(): void
    {
        $others = array_slice($this->hospitals, 1);
        if (!$others) return;

        $moved = 0;

        foreach (['donor', 'recipient'] as $role) {
            foreach ($others as $i => $hospital) {
                $already = User::where('role', $role)->where('preferred_hospital_id', $hospital->id)->count();
                if ($already >= 20) continue;

                $ids = User::where('role', $role)
                    ->where('preferred_hospital_id', $this->hospitals[0]->id)
                    ->orderBy('id')
                    ->skip($i * 25)
                    ->take(25 - $already)
                    ->pluck('id');

                if ($ids->isEmpty()) continue;

                User::whereIn('id', $ids)->update(['preferred_hospital_id' => $hospital->id]);
                $moved += $ids->count();
            }
        }

        $this->command->info("  patients redistributed: {$moved}");
    }

    /**
     * Document rows, pointed at real files.
     *
     * Files already on disk from earlier uploads are reused where they exist —
     * their DB rows were lost, so this reconnects them. Anything else gets a
     * small generated placeholder, so no row ever points at a missing file
     * (which would break the viewer and the download endpoint).
     */
    private function seedDocuments(): void
    {
        if (Document::count() > 0) { $this->command->info('  documents: already present, skipped'); return; }

        $types = ['cnic_front', 'cnic_back', 'medical_certificate', 'blood_type_report'];
        $created = 0;

        // Reconnect orphaned files first.
        foreach (glob(storage_path('app/private/documents/*'), GLOB_ONLYDIR) as $dir) {
            $userId = (int) basename($dir);
            if (!User::whereKey($userId)->exists()) continue;

            foreach (glob("{$dir}/*") as $n => $file) {
                Document::create([
                    'user_id'       => $userId,
                    'document_type' => $types[$n % count($types)],
                    'original_name' => $types[$n % count($types)] . '.' . pathinfo($file, PATHINFO_EXTENSION),
                    'file_path'     => 'documents/' . $userId . '/' . basename($file),
                    'mime_type'     => 'image/jpeg',
                    'size'          => filesize($file) ?: 1024,
                    'status'        => 'approved',
                    'reviewed_by'   => $this->hospitals[0]->id,
                    'reviewed_at'   => now()->subDays(rand(1, 40)),
                ]);
                $created++;
            }
        }

        // Placeholder documents for a sample of patients, so the review queues
        // have something in every state.
        $patients = User::whereIn('role', ['donor', 'recipient'])
            ->where('registration_complete', true)->inRandomOrder()->take(24)->get();

        foreach ($patients as $i => $patient) {
            foreach (array_slice($types, 0, 2) as $t) {
                $path = "documents/{$patient->id}/demo-{$t}.txt";
                Storage::disk('local')->put(
                    "private/{$path}",
                    "ODCAT demo document\nType: {$t}\nPatient: {$patient->name}\nGenerated by DemoDataSeeder.\n"
                );

                $status = ['approved', 'pending', 'rejected'][$i % 3];

                Document::create([
                    'user_id'       => $patient->id,
                    'document_type' => $t,
                    'original_name' => "{$t}.txt",
                    'file_path'     => $path,
                    'mime_type'     => 'text/plain',
                    'size'          => 120,
                    'status'        => $status,
                    'reviewed_by'   => $status === 'pending' ? null : $patient->preferred_hospital_id,
                    'reviewed_at'   => $status === 'pending' ? null : now()->subDays(rand(1, 20)),
                    'review_notes'  => $status === 'rejected' ? 'Image unclear — please re-upload a full-page scan.' : null,
                ]);
                $created++;
            }
        }

        $this->command->info("  documents: +{$created}");
    }

    private function seedConsentForms(): void
    {
        if (ConsentForm::count() > 0) { $this->command->info('  consent_forms: already present, skipped'); return; }

        $people = User::whereIn('role', ['donor', 'recipient'])->inRandomOrder()->take(60)->get();

        foreach ($people as $p) {
            ConsentForm::create([
                'user_id'            => $p->id,
                'user_type'          => $p->role,
                'full_name'          => $p->name,
                'cnic'               => sprintf('%05d-%07d-%d', rand(10000, 99999), rand(1000000, 9999999), rand(1, 9)),
                'signature'          => $p->name,
                'free_will_declared' => true,
                'ip_address'         => '203.0.113.' . rand(2, 250),
                'user_agent'         => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DemoSeeder',
                'submitted_at'       => now()->subDays(rand(2, 90)),
            ]);
        }

        $this->command->info('  consent_forms: +' . $people->count());
    }

    private function seedAdminRequests(): void
    {
        if (AdminRequest::count() > 0) { $this->command->info('  admin_requests: already present, skipped'); return; }

        $superAdmin = User::where('role', 'super_admin')->first();
        $states = ['pending', 'approved', 'rejected'];
        $n = 0;

        foreach ($this->hospitals as $i => $hospital) {
            $status = $states[$i % 3];

            AdminRequest::create([
                'hospital_id'           => $hospital->id,
                'requested_admin_name'  => ['Nadeem Akhtar', 'Saira Batool', 'Junaid Aslam', 'Maria Shah', 'Owais Siddiqui'][$i % 5],
                'requested_admin_email' => "admin.request.h{$hospital->id}@odcat.test",
                'justification'         => 'Our transplant coordination volume has grown and we need a dedicated administrator to manage donor and recipient case review.',
                'status'                => $status,
                'reviewed_by'           => $status === 'pending' ? null : optional($superAdmin)->id,
                'reviewed_at'           => $status === 'pending' ? null : now()->subDays(rand(1, 15)),
                'review_notes'          => match ($status) {
                    'approved' => 'Approved — hospital volume justifies a dedicated admin.',
                    'rejected' => 'Declined for now; existing staff coverage is sufficient at current case volume.',
                    default    => null,
                },
            ]);
            $n++;
        }

        $this->command->info("  admin_requests: +{$n}");
    }

    private function seedAppeals(): void
    {
        if (Appeal::count() === 0) {
            $users = User::whereIn('role', ['donor', 'recipient'])->inRandomOrder()->take(3)->get();
            $admin = User::where('role', 'super_admin')->first();

            foreach ($users as $i => $u) {
                $status = ['pending', 'approved', 'denied'][$i % 3];

                Appeal::create([
                    'user_id'          => $u->id,
                    'explanation'      => 'My account was suspended after a documentation mismatch. The CNIC I uploaded was an older card; I have since submitted the reissued one and request a review.',
                    'submitted_date'   => now()->subDays(rand(2, 20)),
                    'status'           => $status,
                    'original_action'  => 'ban',
                    'original_category'=> 'documentation',
                    'original_reason'  => 'Submitted identity document did not match registration details.',
                    'original_admin_id'=> optional($admin)->id,
                    'admin_response_deadline' => now()->addDays(7),
                    'review_date'      => $status === 'pending' ? null : now()->subDays(rand(1, 5)),
                    'review_admin_id'  => $status === 'pending' ? null : optional($admin)->id,
                    'review_notes'     => $status === 'pending' ? null : 'Reviewed against resubmitted documentation.',
                    'decision'         => match ($status) { 'approved' => 'reverse', 'denied' => 'uphold', default => null },
                ]);
            }
            $this->command->info('  appeals: +' . $users->count());
        }

        if (CaseAppeal::count() === 0) {
            $users = User::whereIn('role', ['donor', 'recipient'])
                ->whereNotNull('preferred_hospital_id')->inRandomOrder()->take(4)->get();

            foreach ($users as $i => $u) {
                $status = ['pending', 'reopened', 'rejected_final'][$i % 3];

                CaseAppeal::create([
                    'user_id'      => $u->id,
                    'hospital_id'  => $u->preferred_hospital_id,
                    'appeal_text'  => 'My case was rejected on the grounds of incomplete clinical data. My consultant has now provided the missing histocompatibility report and I am requesting the case be reconsidered.',
                    'status'       => $status,
                    'submitted_at' => now()->subDays(rand(1, 25)),
                    'reviewed_by'  => $status === 'pending' ? null : $u->preferred_hospital_id,
                    'reviewed_at'  => $status === 'pending' ? null : now()->subDays(rand(1, 6)),
                    'review_notes' => match ($status) {
                        'reopened'       => 'Additional clinical data accepted — case reopened for review.',
                        'rejected_final' => 'Rejection upheld; the submitted data does not change the eligibility assessment.',
                        default          => null,
                    },
                ]);
            }
            $this->command->info('  case_appeals: +' . $users->count());
        }
    }

    /**
     * Real allocation runs, produced by the actual AllocationService rather than
     * invented numbers — so the explainability, fairness and override screens all
     * have genuine, self-consistent scoring data behind them.
     */
    private function seedAllocationRunsAndDecisions(): void
    {
        if (AllocationRun::count() > 0) { $this->command->info('  allocation_runs: already present, skipped'); return; }

        $policy = AllocationPolicy::where('is_active', true)->first() ?? AllocationPolicy::first();
        if (!$policy) { $this->command->warn('  no allocation policy — skipping runs'); return; }

        /** @var AllocationService $allocator */
        $allocator = app(AllocationService::class);
        $allocator->setCompatibilityMatrix(BloodCompatibility::asMatrix());

        $runs = 0; $decisions = 0;

        foreach ($this->hospitals as $hospital) {
            $donors = User::where('role', 'donor')->where('status', 'approved')
                ->where('preferred_hospital_id', $hospital->id)
                ->whereHas('donorProfile')->inRandomOrder()->take(4)->get();

            foreach ($donors as $idx => $donor) {
                [$donorPayload, $recipientPayloads, $organ] = $this->buildPayload($donor, $hospital->id);
                if (!$donorPayload || count($recipientPayloads) < 2) continue;

                $ranked = $allocator->rank($donorPayload, $recipientPayloads, $policy->weights, $organ);
                if (count($ranked) < 2) continue;

                $run = AllocationRun::create([
                    'policy_id'        => $policy->id,
                    'donor_user_id'    => $donor->id,
                    'organ'            => $organ,
                    'weights_snapshot' => $policy->weights,
                    'dataset_snapshot' => [
                        'donor'             => $donorPayload,
                        'recipient_count'   => count($recipientPayloads),
                        'snapshot_taken_at' => now()->subDays(rand(1, 30))->toIso8601String(),
                        'seeded'            => true,
                    ],
                    'results'         => $ranked,
                    'candidate_count' => count($ranked),
                    'run_by'          => $hospital->id,
                    'mode'            => $idx === 3 ? 'simulation' : 'live',
                ]);
                $run->created_at = now()->subDays(rand(2, 30));
                $run->save();
                $runs++;

                if ($run->mode === 'simulation') continue;

                // A spread of outcomes: a straight top-rank confirmation, a
                // justified override, and a rejection — so the governance and
                // fairness screens have all three to work with.
                $kind = $idx % 3;
                $rank = $kind === 1 ? min(2, count($ranked)) : 1;

                $decision = AllocationDecision::create([
                    'allocation_run_id'     => $run->id,
                    'selected_recipient_id' => $ranked[$rank - 1]['user_id'] ?? $ranked[0]['user_id'],
                    'selected_rank'         => $rank,
                    'was_override'          => $kind === 1,
                    'was_rejected'          => $kind === 2,
                    'override_reason'       => match ($kind) {
                        1 => 'Top-ranked candidate was unreachable within the cold ischemia window; second-ranked accepted after consultant review.',
                        2 => 'Donor organ found unsuitable on final inspection; allocation not proceeded with for this cycle.',
                        default => null,
                    },
                    'decided_by'  => $hospital->id,
                    'hospital_id' => $hospital->id,
                    'status'      => 'confirmed',
                    'notes'       => 'Recorded during demo data seeding.',
                ]);
                $decision->created_at = $run->created_at->copy()->addHours(rand(1, 8));
                $decision->save();
                $decisions++;

                if (!$decision->was_rejected) {
                    CaseApprovalController::openFor($decision, $donor->id, $organ);
                }
            }
        }

        $this->command->info("  allocation_runs: +{$runs}, decisions: +{$decisions}, case_approvals opened: " . CaseApproval::count());
    }

    /**
     * Build donor + candidate payloads in exactly the shape AllocationService
     * expects — mirroring AllocationController::buildPayload and
     * loadRecipientPayloads, including the cross-hospital pool and distance,
     * so seeded runs score identically to ones made through the UI.
     */
    private function buildPayload(User $donor, int $hospitalId): array
    {
        $dp = $donor->donorProfile;
        if (!$dp) return [null, [], 'kidney'];

        $pledged = is_array($dp->pledged_organs ?? null) ? $dp->pledged_organs : [];
        $organ   = strtolower($pledged[0] ?? 'kidney');

        $donorPayload = [
            'user_id'        => $donor->id,
            'name'           => $donor->name,
            'blood_type'     => $dp->blood_type,
            'pledged_organs' => $pledged,
            'hospital_id'    => $hospitalId,
        ];

        /** @var AllocationService $allocator */
        $allocator = app(AllocationService::class);

        $donorHospital = HospitalProfile::where('user_id', $hospitalId)->first();
        $lookup = HospitalProfile::select('user_id', 'hospital_name', 'city', 'latitude', 'longitude')
            ->get()->keyBy('user_id');

        $payloads = User::where('role', 'recipient')->where('status', 'approved')
            ->with(['recipientProfile', 'clinicalProfile:id,user_id,dob,gender'])
            ->get()
            ->map(function ($u) use ($hospitalId, $donorHospital, $lookup, $allocator) {
                $rp = $u->recipientProfile;
                $cp = $u->clinicalProfile;
                if (!$rp) return null;

                $recHospital = $lookup[$u->preferred_hospital_id] ?? null;

                return [
                    'user_id'           => $u->id,
                    'name'              => $u->name,
                    'email'             => $u->email,
                    'blood_type'        => $rp->blood_type,
                    'organ_needed'      => $rp->organ_needed,
                    'urgency_score'     => $rp->urgency_score ?? 5.0,
                    'days_on_waitlist'  => $rp->days_on_waitlist ?? 0,
                    'survival_estimate' => $rp->survival_estimate,
                    'age'               => $cp?->dob ? (int) abs(now()->diffInYears($cp->dob)) : null,
                    'gender'            => $cp?->gender,
                    'diagnosis'         => $rp->diagnosis,
                    'hospital_id'       => $u->preferred_hospital_id,
                    'hospital_name'     => $recHospital?->hospital_name ?? '-',
                    'hospital_city'     => $recHospital?->city ?? '-',
                    'distance_km'       => $allocator->distanceKm(
                        $donorHospital?->latitude, $donorHospital?->longitude,
                        $recHospital?->latitude, $recHospital?->longitude
                    ),
                    'is_cross_hospital' => $u->preferred_hospital_id != $hospitalId,
                ];
            })
            ->filter()->values()->all();

        return [$donorPayload, $payloads, $organ];
    }

    /** Push the seeded approval cases across the whole Module 7 pipeline. */
    private function advanceApprovals(): void
    {
        $cases = CaseApproval::where('stage', 'checklist')->get();
        if ($cases->isEmpty()) return;

        $advanced = ['checklist' => 0, 'doctor' => 0, 'admin' => 0, 'approved' => 0, 'rejected' => 0];

        foreach ($cases as $i => $case) {
            $doctor = User::where('role', 'doctor')->where('linked_hospital_id', $case->hospital_id)->first();
            $target = ['checklist', 'doctor', 'admin', 'approved', 'rejected'][$i % 5];

            if ($target === 'checklist') { $advanced['checklist']++; continue; }

            // Tick the checklist the way a user would, recording who and when.
            $checklist = collect($case->checklist)->map(fn ($item) => $item + [
                'checked'    => true,
                'checked_by' => optional($doctor)->name ?? 'Hospital Coordinator',
                'checked_at' => now()->subHours(rand(2, 60))->toIso8601String(),
            ])->all();
            $case->checklist = $checklist;

            if ($target === 'rejected') {
                $case->fill([
                    'stage'            => 'rejected',
                    'rejected_by'      => optional($doctor)->id ?? $case->hospital_id,
                    'rejected_at'      => now()->subDays(rand(1, 10)),
                    'rejection_reason' => 'Recipient developed an acute infection during the pre-operative window; the match cannot be cleared safely at this time.',
                ]);
                $case->save();
                $advanced['rejected']++;
                continue;
            }

            $case->stage = 'doctor';

            if (in_array($target, ['admin', 'approved'], true) && $doctor) {
                $case->fill([
                    'doctor_id'          => $doctor->id,
                    'doctor_approved_at' => now()->subDays(rand(1, 8)),
                    'doctor_notes'       => 'Crossmatch negative, serology clear, recipient fit for surgery. Cleared clinically.',
                    'stage'              => 'admin',
                ]);
            }

            if ($target === 'approved' && $doctor) {
                $approvedAt = now()->subDays(rand(0, 5));
                $case->fill([
                    'admin_id'           => $case->hospital_id,
                    'admin_confirmed_at' => $approvedAt,
                    'admin_notes'        => 'Approved for transplant. Theatre and retrieval logistics confirmed.',
                    'stage'              => 'approved',
                    'approved_at'        => $approvedAt,
                    'approval_seconds'   => max(600, $case->allocated_at->diffInSeconds($approvedAt)),
                ]);
            }

            $case->save();
            $advanced[$case->stage]++;
        }

        $this->command->info('  case_approvals advanced: ' . json_encode($advanced));
    }

    /** Organs across every lifecycle state, and every cold-chain band. */
    private function seedOrgans(): void
    {
        if (Organ::count() > 0) { $this->command->info('  organs: already present, skipped'); return; }

        // minutesAgo is chosen relative to each organ type's limit so the
        // registry demonstrates ok / advisory / warning / breached at a glance.
        $plan = [
            ['kidney', 'available',    120,   null],
            ['kidney', 'available',    900,   null],   // advisory  (~63% of 24h)
            ['kidney', 'allocated',    1300,  null],   // warning   (~90%)
            ['liver',  'in_transit',   500,   null],   // advisory  (~69% of 12h)
            ['heart',  'available',    100,   null],   // ok        (~42% of 4h)
            ['heart',  'allocated',    230,   null],   // warning   (~96%)
            ['lung',   'in_transit',   330,   null],   // warning   (~92% of 6h)
            ['kidney', 'transplanted', 1100,  600],
            ['liver',  'transplanted', 700,   420],
            ['kidney', 'transplanted', 1400,  900],
            ['pancreas','discarded',   800,   null],
            ['heart',  'expired',      400,   null],   // breached  (past 4h)
            ['cornea', 'available',    2000,  null],
        ];

        $approved = CaseApproval::where('stage', 'approved')->get();
        $made = 0;

        foreach ($plan as $i => [$type, $status, $minutesAgo, $transplantAfter]) {
            $hospital = $this->hospitals[$i % count($this->hospitals)];
            $approval = $approved->get($i);

            $recovered = now()->subMinutes($minutesAgo);

            $organ = Organ::create([
                'allocation_decision_id' => optional($approval)->allocation_decision_id,
                'case_approval_id'       => optional($approval)->id,
                'donor_user_id'          => optional($approval)->donor_user_id,
                'recipient_user_id'      => optional($approval)->recipient_user_id,
                'hospital_id'            => $approval->hospital_id ?? $hospital->id,
                'organ_type'             => $type,
                'reference'              => Organ::nextReference(),
                'status'                 => $status,
                'recovered_at'           => $recovered,
                'cold_ischemia_limit_minutes' => Organ::limitFor($type),
                'transplanted_at'        => $status === 'transplanted' ? $recovered->copy()->addMinutes($transplantAfter) : null,
                'discarded_at'           => in_array($status, ['discarded', 'expired'], true) ? $recovered->copy()->addMinutes(60) : null,
                'discard_reason'         => match ($status) {
                    'discarded' => 'Biopsy showed unacceptable fibrosis; organ not suitable for transplant.',
                    'expired'   => 'Cold ischemia limit exceeded before a suitable recipient could be prepared.',
                    default     => null,
                },
                // Pre-stamped so historical rows do not fire fresh alerts for
                // events that are already in the past.
                'breach_notified_at'  => $status === 'expired' ? $recovered->copy()->addMinutes(50) : null,
            ]);

            OrganEvent::record($organ->id, 'recovered', 'Organ recovered',
                "Cold chain started. Limit {$organ->cold_ischemia_limit_minutes} minutes.", null, [], $recovered);

            if ($status === 'in_transit') {
                OrganEvent::record($organ->id, 'in_transit', 'In transit',
                    'Dispatched to the transplant centre by road.', null, [], $recovered->copy()->addMinutes(45));
            }
            if ($status === 'transplanted') {
                OrganEvent::record($organ->id, 'transplanted', 'Transplanted',
                    'Transplant completed; cold chain closed.', null, [], $organ->transplanted_at);
            }
            if (in_array($status, ['discarded', 'expired'], true)) {
                OrganEvent::record($organ->id, $status, $status === 'expired' ? 'Recorded as expired' : 'Discarded',
                    $organ->discard_reason, null, [], $organ->discarded_at);
            }

            $made++;
        }

        $this->command->info("  organs: +{$made} (with timeline events)");
    }

    private function seedSurgicalResources(): void
    {
        if (SurgicalResource::count() > 0) { $this->command->info('  surgical_resources: already present, skipped'); return; }

        $made = 0;

        foreach ($this->hospitals as $hospital) {
            $surgeons = User::where('role', 'doctor')->where('linked_hospital_id', $hospital->id)->take(2)->get();

            foreach ([1, 2] as $n) {
                SurgicalResource::create([
                    'hospital_id' => $hospital->id, 'type' => 'theatre',
                    'name' => "Theatre {$n}", 'code' => "T{$n}", 'is_active' => true,
                ]);
                $made++;
            }

            foreach ([1, 2, 3] as $n) {
                SurgicalResource::create([
                    'hospital_id' => $hospital->id, 'type' => 'icu_bed',
                    'name' => "ICU Bed {$n}", 'code' => "B{$n}", 'is_active' => true,
                ]);
                $made++;
            }

            foreach ($surgeons as $n => $surgeon) {
                SurgicalResource::create([
                    'hospital_id' => $hospital->id, 'type' => 'surgeon',
                    'name' => $surgeon->name, 'code' => 'S' . ($n + 1),
                    'user_id' => $surgeon->id, 'is_active' => true,
                ]);
                $made++;
            }
        }

        $this->command->info("  surgical_resources: +{$made}");
    }

    /**
     * Bookings go through SurgeryScheduler, not straight inserts — so the demo
     * schedule is guaranteed conflict-free by the same locking and overlap rules
     * the application enforces, rather than by luck.
     */
    private function seedSurgeryBookings(): void
    {
        if (SurgeryBooking::count() > 0) { $this->command->info('  surgery_bookings: already present, skipped'); return; }

        /** @var SurgeryScheduler $scheduler */
        $scheduler = app(SurgeryScheduler::class);
        $booked = 0; $refused = 0;

        foreach ($this->hospitals as $hospital) {
            $theatres = SurgicalResource::where('hospital_id', $hospital->id)->ofType('theatre')->get();
            $surgeons = SurgicalResource::where('hospital_id', $hospital->id)->ofType('surgeon')->get();
            $beds     = SurgicalResource::where('hospital_id', $hospital->id)->ofType('icu_bed')->get();

            if ($theatres->isEmpty() || $surgeons->isEmpty()) continue;

            $approvals = CaseApproval::where('hospital_id', $hospital->id)->where('stage', 'approved')->get();

            // A spread across last week and the next fortnight, so the calendar
            // shows history, today, and upcoming work.
            foreach (range(-6, 13) as $i => $dayOffset) {
                if ($i % 2 === 1) continue;

                $start = Carbon::today()->addDays($dayOffset)->setTime([8, 11, 14][$i % 3], 0);
                $end   = $start->copy()->addHours([3, 4, 5][$i % 3]);

                $result = $scheduler->book([
                    'theatre_id'       => $theatres[$i % $theatres->count()]->id,
                    'surgeon_id'       => $surgeons[$i % $surgeons->count()]->id,
                    'icu_bed_id'       => $beds->isNotEmpty() ? $beds[$i % $beds->count()]->id : null,
                    'icu_hours'        => 24,
                    'scheduled_start'  => $start->toDateTimeString(),
                    'scheduled_end'    => $end->toDateTimeString(),
                    'case_approval_id' => optional($approvals->get($i))->id,
                    'recipient_user_id'=> optional($approvals->get($i))->recipient_user_id,
                    'notes'            => 'Seeded demo booking.',
                ], $hospital->id, $hospital->id);

                if (!$result['ok']) { $refused++; continue; }

                // Past bookings are completed or cancelled; future ones stay scheduled.
                $booking = $result['booking'];
                if ($dayOffset < 0) {
                    $booking->status = $i % 4 === 0 ? 'cancelled' : 'completed';
                    if ($booking->status === 'cancelled') {
                        $booking->cancel_reason = 'Recipient not fit for surgery on the day; rescheduled.';
                    }
                    $booking->save();
                }
                $booked++;
            }
        }

        $this->command->info("  surgery_bookings: +{$booked}" . ($refused ? " ({$refused} slots refused as conflicting — expected)" : ''));
    }
}
