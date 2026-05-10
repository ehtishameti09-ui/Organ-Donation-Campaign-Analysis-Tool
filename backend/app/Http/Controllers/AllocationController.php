<?php

namespace App\Http\Controllers;

use App\Models\AllocationDecision;
use App\Models\AllocationPolicy;
use App\Models\AllocationRun;
use App\Models\BloodCompatibility;
use App\Models\DonorProfile;
use App\Models\HospitalProfile;
use App\Models\RecipientProfile;
use App\Models\User;
use App\Services\AllocationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AllocationController extends Controller
{
    public function __construct(private AllocationService $allocator) {}

    /**
     * Resolve the hospital scope for the current user, or abort if disallowed.
     * Super admins are blocked to prevent allocation bias.
     * General (unlinked) admins are blocked — only hospital-linked admins can run.
     */
    private function hospitalScope(Request $request): int
    {
        $u = $request->user();
        if ($u->role === 'super_admin') {
            abort(403, 'Super admins cannot use the allocation engine. This is intentional to prevent allocation bias.');
        }
        if ($u->role === 'hospital') {
            return (int) $u->id;
        }
        if ($u->role === 'admin') {
            if (empty($u->linked_hospital_id)) {
                abort(403, 'Only admins linked to a specific hospital can use the allocation engine.');
            }
            return (int) $u->linked_hospital_id;
        }
        abort(403, 'Allocation engine access denied.');
    }

    /** GET /api/allocation/policies */
    public function listPolicies(Request $request): JsonResponse
    {
        $this->hospitalScope($request);
        $policies = AllocationPolicy::with('creator:id,name,email')
            ->orderByDesc('is_active')
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => $policies]);
    }

    /** POST /api/allocation/policies — create new version */
    public function createPolicy(Request $request): JsonResponse
    {
        $this->hospitalScope($request);
        $data = $request->validate([
            'version'     => 'required|string|max:30',
            'name'        => 'required|string|max:100',
            'description' => 'nullable|string|max:500',
            'weights'     => 'required|array',
            'weights.urgency'  => 'required|numeric|min:0|max:100',
            'weights.waiting'  => 'required|numeric|min:0|max:100',
            'weights.survival' => 'required|numeric|min:0|max:100',
            'weights.age'      => 'required|numeric|min:0|max:100',
            'weights.distance' => 'sometimes|numeric|min:0|max:100',
            'activate'    => 'sometimes|boolean',
        ]);

        // Distance defaults to 0 if not provided (backward compat with old policies)
        $data['weights']['distance'] = $data['weights']['distance'] ?? 0;

        $sum = array_sum($data['weights']);
        if (abs($sum - 100) > 0.01) {
            return response()->json(['message' => "Weights must sum to 100 (got {$sum})"], 422);
        }

        $policy = DB::transaction(function () use ($data, $request) {
            $activate = $data['activate'] ?? false;
            if ($activate) {
                AllocationPolicy::where('is_active', true)->update(['is_active' => false]);
            }

            return AllocationPolicy::create([
                'version'     => $data['version'],
                'name'        => $data['name'],
                'description' => $data['description'] ?? null,
                'weights'     => $data['weights'],
                'is_active'   => $activate,
                'created_by'  => $request->user()->id,
            ]);
        });

        return response()->json(['data' => $policy], 201);
    }

    /** PATCH /api/allocation/policies/{id}/activate */
    public function activatePolicy(Request $request, int $id): JsonResponse
    {
        $this->hospitalScope($request);
        DB::transaction(function () use ($id) {
            AllocationPolicy::where('is_active', true)->update(['is_active' => false]);
            AllocationPolicy::findOrFail($id)->update(['is_active' => true]);
        });
        return response()->json(['message' => 'Policy activated']);
    }

    /** POST /api/allocation/run — run allocation for a donor + organ */
    public function run(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);

        $data = $request->validate([
            'donor_user_id' => 'required|integer|exists:users,id',
            'organ'         => 'required|string|max:30',
            'policy_id'     => 'sometimes|integer|exists:allocation_policies,id',
        ]);

        $donorBelongs = User::where('id', $data['donor_user_id'])
            ->where('preferred_hospital_id', $hospitalId)
            ->exists();
        if (!$donorBelongs) {
            abort(403, 'Donor does not belong to your hospital.');
        }

        $policy = isset($data['policy_id'])
            ? AllocationPolicy::findOrFail($data['policy_id'])
            : AllocationPolicy::where('is_active', true)->firstOrFail();

        $this->allocator->setCompatibilityMatrix(BloodCompatibility::asMatrix());

        [$donorPayload, $recipientPayloads] = $this->buildPayload($data['donor_user_id'], $hospitalId);

        $ranked = $this->allocator->rank($donorPayload, $recipientPayloads, $policy->weights, $data['organ']);

        $run = AllocationRun::create([
            'policy_id'        => $policy->id,
            'donor_user_id'    => $data['donor_user_id'],
            'organ'            => $data['organ'],
            'weights_snapshot' => $policy->weights,
            'dataset_snapshot' => [
                'donor'             => $donorPayload,
                'recipient_count'   => count($recipientPayloads),
                'snapshot_taken_at' => now()->toIso8601String(),
            ],
            'results'         => $ranked,
            'candidate_count' => count($ranked),
            'run_by'          => $request->user()->id,
            'mode'            => 'live',
        ]);

        return response()->json([
            'data'   => $ranked,
            'run_id' => $run->id,
            'policy' => $policy,
        ]);
    }

    /** POST /api/allocation/simulate — re-run a historical run with new weights */
    public function simulate(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $data = $request->validate([
            'run_id'  => 'required|integer|exists:allocation_runs,id',
            'weights' => 'required|array',
            'weights.urgency'  => 'required|numeric|min:0|max:100',
            'weights.waiting'  => 'required|numeric|min:0|max:100',
            'weights.survival' => 'required|numeric|min:0|max:100',
            'weights.age'      => 'required|numeric|min:0|max:100',
            'weights.distance' => 'sometimes|numeric|min:0|max:100',
        ]);

        $data['weights']['distance'] = $data['weights']['distance'] ?? 0;

        $sum = array_sum($data['weights']);
        if (abs($sum - 100) > 0.01) {
            return response()->json(['message' => "Weights must sum to 100 (got {$sum})"], 422);
        }

        $original = AllocationRun::findOrFail($data['run_id']);

        $runDonorBelongs = User::where('id', $original->donor_user_id)
            ->where('preferred_hospital_id', $hospitalId)
            ->exists();
        if (!$runDonorBelongs) {
            abort(403, 'You can only simulate runs that belong to your hospital.');
        }

        $donorPayload = $original->dataset_snapshot['donor'] ?? null;
        $originalResults = $original->results;
        $recipientPayloads = array_map(function ($r) {
            unset($r['score_breakdown'], $r['final_score'], $r['rank']);
            return $r;
        }, $originalResults);

        if (!$donorPayload) {
            return response()->json(['message' => 'Original run has no donor snapshot'], 422);
        }

        $this->allocator->setCompatibilityMatrix(BloodCompatibility::asMatrix());
        $rerank = $this->allocator->rank($donorPayload, $recipientPayloads, $data['weights'], $original->organ);

        $simRun = AllocationRun::create([
            'policy_id'        => $original->policy_id,
            'donor_user_id'    => $original->donor_user_id,
            'organ'            => $original->organ,
            'weights_snapshot' => $data['weights'],
            'dataset_snapshot' => $original->dataset_snapshot,
            'results'          => $rerank,
            'candidate_count'  => count($rerank),
            'run_by'           => $request->user()->id,
            'mode'             => 'simulation',
            'parent_run_id'    => $original->id,
        ]);

        $comparison = $this->buildComparison($originalResults, $rerank);

        return response()->json([
            'simulation_run_id' => $simRun->id,
            'original'          => $originalResults,
            'simulated'         => $rerank,
            'comparison'        => $comparison,
        ]);
    }

    /** GET /api/allocation/runs */
    public function listRuns(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $hospitalDonorIds = User::where('role', 'donor')
            ->where('preferred_hospital_id', $hospitalId)
            ->pluck('id');

        $runs = AllocationRun::with(['policy:id,version,name', 'donor:id,name,email', 'runner:id,name'])
            ->whereIn('donor_user_id', $hospitalDonorIds)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json(['data' => $runs]);
    }

    /** GET /api/allocation/runs/{id} */
    public function showRun(Request $request, int $id): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $run = AllocationRun::with(['policy', 'donor:id,name,email', 'runner:id,name'])
            ->findOrFail($id);

        $donorBelongs = User::where('id', $run->donor_user_id)
            ->where('preferred_hospital_id', $hospitalId)
            ->exists();
        if (!$donorBelongs) abort(403, 'Run not visible to your hospital.');

        return response()->json(['data' => $run]);
    }

    /** GET /api/allocation/eligible-donors — list donors for the dropdown (hospital-scoped) */
    public function eligibleDonors(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $donors = User::where('role', 'donor')
            ->where('status', 'approved')
            ->where('preferred_hospital_id', $hospitalId)
            ->with('donorProfile:id,user_id,blood_type,pledged_organs')
            ->select('id', 'name', 'email')
            ->limit(200)
            ->get();
        return response()->json(['data' => $donors]);
    }

    // ==================== MODULE 5 ====================

    /** GET /api/allocation/compatibility-matrix — cached 1 hour (matrix rarely changes) */
    public function compatibilityMatrix(Request $request): JsonResponse
    {
        $this->hospitalScope($request);
        $rows = Cache::remember('allocation:compat-matrix', 3600, function () {
            return BloodCompatibility::orderBy('donor_blood_type')->orderBy('recipient_blood_type')->get();
        });
        return response()->json(['data' => $rows]);
    }

    /** GET /api/allocation/hospital-distances — cached 10 min */
    public function hospitalDistances(Request $request): JsonResponse
    {
        $this->hospitalScope($request);
        $cached = Cache::remember('allocation:hospital-distances', 600, function () {
            return HospitalProfile::whereNotNull('latitude')->whereNotNull('longitude')->get();
        });
        $hospitals = $cached;

        $rows = [];
        foreach ($hospitals as $a) {
            foreach ($hospitals as $b) {
                if ($a->id === $b->id) continue;
                $rows[] = [
                    'from'     => $a->hospital_name,
                    'from_city' => $a->city,
                    'to'       => $b->hospital_name,
                    'to_city'   => $b->city,
                    'km'       => $this->allocator->distanceKm($a->latitude, $a->longitude, $b->latitude, $b->longitude),
                ];
            }
        }
        usort($rows, fn($x, $y) => $x['km'] <=> $y['km']);

        return response()->json([
            'hospitals' => $hospitals->map(fn($h) => [
                'id' => $h->id, 'name' => $h->hospital_name, 'city' => $h->city,
                'latitude' => $h->latitude, 'longitude' => $h->longitude, 'city_type' => $h->city_type,
            ]),
            'distances' => $rows,
        ]);
    }

    /** POST /api/allocation/decisions — record allocation decision (with override governance).
     *  Accepts EITHER:
     *    1) `allocation_run_id` (Manual Run flow — run already persisted), OR
     *    2) `donor_user_id` + `organ` (Auto-Match flow — run is created inline atomically with the decision).
     */
    public function createDecision(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);

        $data = $request->validate([
            'allocation_run_id'      => 'sometimes|integer|exists:allocation_runs,id',
            'donor_user_id'          => 'sometimes|integer|exists:users,id',
            'organ'                  => 'sometimes|string|max:30',
            'selected_recipient_id'  => 'required|integer|exists:users,id',
            'selected_rank'          => 'required|integer|min:1',
            'decision_type'          => 'sometimes|in:confirmed,overridden,rejected',
            'override_reason'        => 'nullable|string|max:2000',
            'notes'                  => 'nullable|string|max:2000',
        ]);

        $isRejected = ($data['decision_type'] ?? null) === 'rejected';
        $isOverride = !$isRejected && $data['selected_rank'] > 1;

        if ($isOverride || $isRejected) {
            $reason = trim($data['override_reason'] ?? '');
            $action = $isRejected ? 'rejection' : 'override';
            if (mb_strlen($reason) < 20) {
                return response()->json([
                    'message' => "An {$action} requires a justification of at least 20 characters.",
                    'errors'  => ['override_reason' => ["Minimum 20 characters required when an {$action} is recorded."]],
                ], 422);
            }
        }

        // Resolve or create the run + decision atomically.
        $decision = DB::transaction(function () use ($data, $hospitalId, $isOverride, $isRejected, $request) {
            if (isset($data['allocation_run_id'])) {
                $run = AllocationRun::findOrFail($data['allocation_run_id']);
                $runDonorBelongs = User::where('id', $run->donor_user_id)
                    ->where('preferred_hospital_id', $hospitalId)->exists();
                if (!$runDonorBelongs) abort(403, 'Run not for your hospital.');
            } else {
                if (empty($data['donor_user_id']) || empty($data['organ'])) {
                    abort(422, 'Either allocation_run_id, or donor_user_id + organ, must be provided.');
                }
                $donorBelongs = User::where('id', $data['donor_user_id'])
                    ->where('preferred_hospital_id', $hospitalId)->exists();
                if (!$donorBelongs) abort(403, 'Donor not for your hospital.');

                $policy = AllocationPolicy::where('is_active', true)->firstOrFail();
                $this->allocator->setCompatibilityMatrix(BloodCompatibility::asMatrix());
                [$donorPayload, $recipientPayloads] = $this->buildPayload($data['donor_user_id'], $hospitalId);
                $ranked = $this->allocator->rank($donorPayload, $recipientPayloads, $policy->weights, $data['organ']);

                $run = AllocationRun::create([
                    'policy_id'        => $policy->id,
                    'donor_user_id'    => $data['donor_user_id'],
                    'organ'            => $data['organ'],
                    'weights_snapshot' => $policy->weights,
                    'dataset_snapshot' => [
                        'donor'             => $donorPayload,
                        'recipient_count'   => count($recipientPayloads),
                        'snapshot_taken_at' => now()->toIso8601String(),
                        'auto_matched'      => true,
                    ],
                    'results'         => $ranked,
                    'candidate_count' => count($ranked),
                    'run_by'          => $request->user()->id,
                    'mode'            => 'live',
                ]);
            }

            return AllocationDecision::create([
                'allocation_run_id'     => $run->id,
                'selected_recipient_id' => $data['selected_recipient_id'],
                'selected_rank'         => $data['selected_rank'],
                'was_override'          => $isOverride,
                'was_rejected'          => $isRejected,
                'override_reason'       => ($isOverride || $isRejected) ? $data['override_reason'] : null,
                'decided_by'            => $request->user()->id,
                'hospital_id'           => $hospitalId,
                'status'                => 'confirmed',
                'notes'                 => $data['notes'] ?? null,
            ]);
        });

        // Bust dashboard caches so stat counts update immediately for everyone
        Cache::flush();

        return response()->json(['data' => $decision->load(['recipient:id,name,email', 'decider:id,name', 'run:id,organ'])], 201);
    }

    /** GET /api/allocation/pending-allocations — auto-match all approved donors that have no final decision yet.
     *  In-memory only — does NOT persist runs on every page load (huge perf win).
     *  A run is created later, atomically with the decision, by createDecision().
     *  Uses the active policy. The hospital uses this as their primary workflow. */
    public function pendingAllocations(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $page  = max(1, (int) $request->query('page', 1));
        $limit = max(1, min(50, (int) $request->query('limit', 10)));
        $cacheKey = "allocation:pending:{$hospitalId}:p{$page}:l{$limit}";

        // Cached 5 minutes — invalidated automatically on any decision via Cache::flush()
        $payload = Cache::remember($cacheKey, 300, function () use ($hospitalId, $request, $page, $limit) {
            return $this->buildPendingAllocations($hospitalId, $request, $page, $limit);
        });

        return response()->json($payload);
    }

    private function buildPendingAllocations(int $hospitalId, Request $request, int $page = 1, int $limit = 10): array
    {
        // Donors that already have a confirmed (non-rejected) decision — exclude them.
        // Single SQL query instead of join+pluck loop.
        $settledDonorIds = AllocationDecision::query()
            ->select('allocation_runs.donor_user_id')
            ->join('allocation_runs', 'allocation_runs.id', '=', 'allocation_decisions.allocation_run_id')
            ->where('allocation_decisions.hospital_id', $hospitalId)
            ->where('allocation_decisions.was_rejected', false)
            ->where('allocation_decisions.status', 'confirmed')
            ->pluck('allocation_runs.donor_user_id');

        $baseDonorQ = User::where('role', 'donor')
            ->where('status', 'approved')
            ->where('preferred_hospital_id', $hospitalId)
            ->whereNotIn('id', $settledDonorIds);

        $totalDonors = (clone $baseDonorQ)->count();

        $donors = $baseDonorQ
            ->with('donorProfile:id,user_id,blood_type,pledged_organs,donation_type')
            ->select('id', 'name', 'email', 'preferred_hospital_id', 'role', 'status')
            ->orderBy('id')
            ->skip(($page - 1) * $limit)
            ->take($limit)
            ->get();

        $policy = AllocationPolicy::where('is_active', true)->first();
        if (!$policy) {
            return ['data' => [], 'policy' => null, 'message' => 'No active policy.'];
        }

        $this->allocator->setCompatibilityMatrix(BloodCompatibility::asMatrix());

        // CRITICAL: load recipients ONCE outside the donor loop. Same hospital → same pool.
        $recipientPayloads = $this->loadRecipientPayloads($hospitalId);
        $recipientCount    = count($recipientPayloads);

        $matches = [];
        foreach ($donors as $donor) {
            $organs = $donor->donorProfile?->pledged_organs ?? [];
            if (empty($organs)) continue;

            $donorPayload = [
                'user_id'        => $donor->id,
                'name'           => $donor->name,
                'blood_type'     => $donor->donorProfile?->blood_type,
                'pledged_organs' => $organs,
            ];

            $organMatches = [];
            foreach ($organs as $organ) {
                $ranked = $this->allocator->rank($donorPayload, $recipientPayloads, $policy->weights, $organ);
                if (empty($ranked)) {
                    $organMatches[] = [
                        'organ'           => $organ,
                        'top_match'       => null,
                        'candidate_count' => 0,
                        'message'         => 'No compatible recipient found',
                    ];
                    continue;
                }
                $organMatches[] = [
                    'organ'           => $organ,
                    'donor_user_id'   => $donor->id,    // used by createDecision to build run inline
                    'top_match'       => $ranked[0],
                    'runner_up'       => $ranked[1] ?? null,
                    'candidate_count' => count($ranked),
                ];
            }

            if (!empty($organMatches)) {
                $matches[] = [
                    'donor' => [
                        'id'              => $donor->id,
                        'name'            => $donor->name,
                        'email'           => $donor->email,
                        'blood_type'      => $donor->donorProfile?->blood_type,
                        'pledged_organs'  => $organs,
                        'donation_type'   => $donor->donorProfile?->donation_type,
                    ],
                    'organ_matches' => $organMatches,
                ];
            }
        }

        return [
            'data'             => $matches,
            'recipient_count'  => $recipientCount,
            'pagination'       => [
                'page'        => $page,
                'limit'       => $limit,
                'total'       => $totalDonors,
                'total_pages' => max(1, (int) ceil($totalDonors / $limit)),
            ],
            'policy'           => ['version' => $policy->version, 'name' => $policy->name, 'weights' => $policy->weights],
        ];
    }

    /**
     * Load ALL approved recipients across the network (cross-hospital pool).
     * Each payload includes the recipient's hospital info + distance from the donor's hospital.
     * `$donorHospitalId` is the donor's hospital — used to compute distance and flag cross-hospital matches.
     */
    private function loadRecipientPayloads(int $donorHospitalId): array
    {
        // Donor's hospital coordinates (for distance computation)
        $donorHospital = HospitalProfile::where('user_id', $donorHospitalId)->first();
        $donorLat = $donorHospital?->latitude;
        $donorLng = $donorHospital?->longitude;

        // Build a one-shot lookup of all hospitals' coordinates
        $hospitalLookup = HospitalProfile::select('user_id', 'hospital_name', 'city', 'latitude', 'longitude')
            ->get()
            ->keyBy('user_id');

        $recipients = User::where('role', 'recipient')
            ->where('status', 'approved')
            ->with(['recipientProfile', 'clinicalProfile:id,user_id,dob,gender'])
            ->get();

        return $recipients->map(function ($u) use ($donorHospitalId, $donorLat, $donorLng, $hospitalLookup) {
            $rp  = $u->recipientProfile;
            $cp  = $u->clinicalProfile;
            $dob = $cp?->dob;
            $age = $dob ? (int) abs(now()->diffInYears($dob)) : null;

            $recHospital = $hospitalLookup[$u->preferred_hospital_id] ?? null;
            $recLat = $recHospital?->latitude;
            $recLng = $recHospital?->longitude;
            $distanceKm = $this->allocator->distanceKm($donorLat, $donorLng, $recLat, $recLng);
            $sameHospital = $u->preferred_hospital_id == $donorHospitalId;

            return [
                'user_id'             => $u->id,
                'name'                => $u->name,
                'email'               => $u->email,
                'blood_type'          => $rp?->blood_type,
                'organ_needed'        => $rp?->organ_needed,
                'urgency_score'       => $rp?->urgency_score ?? 5.0,
                'days_on_waitlist'    => $rp?->days_on_waitlist ?? 0,
                'survival_estimate'   => $rp?->survival_estimate,
                'age'                 => $age,
                'gender'              => $cp?->gender,
                'diagnosis'           => $rp?->diagnosis,
                'hospital_id'         => $u->preferred_hospital_id,
                'hospital_name'       => $recHospital?->hospital_name ?? '—',
                'hospital_city'       => $recHospital?->city ?? '—',
                'distance_km'         => $distanceKm,
                'is_cross_hospital'   => !$sameHospital,
            ];
        })->toArray();
    }

    /** GET /api/allocation/decisions — list decisions for current hospital */
    public function listDecisions(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $decisions = AllocationDecision::with([
            'recipient:id,name,email',
            'decider:id,name,role',
            'run:id,organ,policy_id',
            'run.policy:id,version,name',
        ])
            ->where('hospital_id', $hospitalId)
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();
        return response()->json(['data' => $decisions]);
    }

    /** GET /api/allocation/override-stats — analytics for current hospital */
    public function overrideStats(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);

        $total       = AllocationDecision::where('hospital_id', $hospitalId)->count();
        $overrides   = AllocationDecision::where('hospital_id', $hospitalId)->where('was_override', true)->count();
        $overridePct = $total > 0 ? round(($overrides / $total) * 100, 1) : 0.0;

        $topUsers = AllocationDecision::select('decided_by', DB::raw('count(*) as override_count'))
            ->where('hospital_id', $hospitalId)
            ->where('was_override', true)
            ->groupBy('decided_by')
            ->orderByDesc('override_count')
            ->limit(10)
            ->with('decider:id,name,role')
            ->get();

        $byOrgan = AllocationDecision::join('allocation_runs', 'allocation_runs.id', '=', 'allocation_decisions.allocation_run_id')
            ->where('allocation_decisions.hospital_id', $hospitalId)
            ->select('allocation_runs.organ',
                DB::raw('count(*) as total'),
                DB::raw('sum(case when allocation_decisions.was_override = 1 then 1 else 0 end) as overrides'))
            ->groupBy('allocation_runs.organ')
            ->get()
            ->map(fn($r) => [
                'organ'        => $r->organ,
                'total'        => (int) $r->total,
                'overrides'    => (int) $r->overrides,
                'override_pct' => $r->total > 0 ? round(($r->overrides / $r->total) * 100, 1) : 0.0,
            ]);

        $recent = AllocationDecision::with(['recipient:id,name', 'decider:id,name', 'run:id,organ'])
            ->where('hospital_id', $hospitalId)
            ->where('was_override', true)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return response()->json([
            'summary'    => [
                'total_decisions' => $total,
                'overrides'       => $overrides,
                'override_pct'    => $overridePct,
            ],
            'top_users'  => $topUsers,
            'by_organ'   => $byOrgan,
            'recent'     => $recent,
        ]);
    }

    // ==================== MODULE 6 ====================

    /** GET /api/allocation/fairness-overview — batch fairness across ALL runs for current hospital.
     *  Returns each run with its key bias deviations + flagged status, plus aggregate summary stats.
     *  This drives the auto-running Fairness Lab page in one round trip. */
    public function fairnessOverview(Request $request): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $k         = max(1, (int) $request->query('k', 5));
        $threshold = (float) $request->query('threshold', 15.0);

        $hospitalDonorIds = User::where('role', 'donor')
            ->where('preferred_hospital_id', $hospitalId)
            ->pluck('id');

        $runs = AllocationRun::with(['policy:id,version,name', 'donor:id,name', 'runner:id,name'])
            ->whereIn('donor_user_id', $hospitalDonorIds)
            ->where('mode', 'live')
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        $rows = [];
        $flaggedCount = 0;
        $byCategory = ['age' => 0, 'gender' => 0, 'urgency' => 0];

        foreach ($runs as $run) {
            $results = $run->results ?? [];
            if (empty($results)) continue;
            $top = array_slice($results, 0, $k);

            $age     = $this->compareDistributions($this->ageGroupCounts($results),  $this->ageGroupCounts($top),  $threshold);
            $gender  = $this->compareDistributions($this->genderCounts($results),    $this->genderCounts($top),    $threshold);
            $urgency = $this->compareDistributions($this->urgencyBandCounts($results), $this->urgencyBandCounts($top), $threshold);

            $flagged = $age['flagged'] || $gender['flagged'] || $urgency['flagged'];
            if ($flagged) {
                $flaggedCount++;
                if ($age['flagged'])     $byCategory['age']++;
                if ($gender['flagged'])  $byCategory['gender']++;
                if ($urgency['flagged']) $byCategory['urgency']++;
            }

            $rows[] = [
                'id'              => $run->id,
                'organ'           => $run->organ,
                'created_at'      => $run->created_at?->toIso8601String(),
                'donor_name'      => $run->donor?->name,
                'policy'          => $run->policy?->version,
                'pool_size'       => count($results),
                'k'               => $k,
                'age_max_dev'     => $age['max_dev_pp'],
                'gender_max_dev'  => $gender['max_dev_pp'],
                'urgency_max_dev' => $urgency['max_dev_pp'],
                'flagged'         => $flagged,
                'flagged_categories' => array_values(array_filter([
                    $age['flagged']     ? 'age'     : null,
                    $gender['flagged']  ? 'gender'  : null,
                    $urgency['flagged'] ? 'urgency' : null,
                ])),
            ];
        }

        arsort($byCategory);
        $topCategory = empty($flaggedCount) ? null : array_key_first($byCategory);

        return response()->json([
            'summary' => [
                'total_runs'            => count($rows),
                'flagged_runs'          => $flaggedCount,
                'flagged_pct'           => count($rows) > 0 ? round(($flaggedCount / count($rows)) * 100, 1) : 0,
                'top_bias_category'     => $topCategory,
                'category_counts'       => $byCategory,
                'k'                     => $k,
                'threshold_pct'         => $threshold,
            ],
            'runs' => $rows,
        ]);
    }

    /** GET /api/allocation/runs/{id}/fairness — fairness index for a run's top-K vs candidate pool */
    public function fairnessReport(Request $request, int $id): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $run = AllocationRun::findOrFail($id);

        $donorBelongs = User::where('id', $run->donor_user_id)
            ->where('preferred_hospital_id', $hospitalId)->exists();
        if (!$donorBelongs) abort(403, 'Run not visible to your hospital.');

        $k = max(1, (int) $request->query('k', 5));
        $threshold = (float) $request->query('threshold', 15.0);

        $results = $run->results ?? [];
        if (empty($results)) {
            return response()->json(['message' => 'Run has no results to analyze.'], 422);
        }

        $topK = array_slice($results, 0, $k);

        $report = [
            'k'             => $k,
            'pool_size'     => count($results),
            'threshold_pct' => $threshold,
            'age_groups'    => $this->compareDistributions(
                $this->ageGroupCounts($results),
                $this->ageGroupCounts($topK),
                $threshold
            ),
            'gender'        => $this->compareDistributions(
                $this->genderCounts($results),
                $this->genderCounts($topK),
                $threshold
            ),
            'urgency_band'  => $this->compareDistributions(
                $this->urgencyBandCounts($results),
                $this->urgencyBandCounts($topK),
                $threshold
            ),
            'flagged'       => false,
        ];
        $report['flagged'] = $report['age_groups']['flagged'] || $report['gender']['flagged'] || $report['urgency_band']['flagged'];

        return response()->json(['data' => $report]);
    }

    /** GET /api/allocation/runs/{id}/sensitivity — sensitivity vs simulations spawned from this run */
    public function sensitivityReport(Request $request, int $id): JsonResponse
    {
        $hospitalId = $this->hospitalScope($request);
        $original = AllocationRun::findOrFail($id);

        $donorBelongs = User::where('id', $original->donor_user_id)
            ->where('preferred_hospital_id', $hospitalId)->exists();
        if (!$donorBelongs) abort(403, 'Run not visible to your hospital.');

        $simulations = AllocationRun::where('parent_run_id', $original->id)
            ->orderByDesc('created_at')
            ->get();

        if ($simulations->isEmpty()) {
            return response()->json([
                'message'     => 'No simulations have been run against this allocation. Run a Simulation first to generate sensitivity data.',
                'original_id' => $original->id,
                'comparisons' => [],
            ]);
        }

        $k = max(1, (int) $request->query('k', 5));
        $comparisons = $simulations->map(function ($sim) use ($original, $k) {
            return $this->buildSensitivity($original->results ?? [], $sim->results ?? [], $sim, $k);
        });

        return response()->json([
            'original_id' => $original->id,
            'comparisons' => $comparisons,
        ]);
    }

    /** GET /api/allocation/runs/{id}/export.csv — export ranking as CSV */
    public function exportCsv(Request $request, int $id): Response
    {
        $hospitalId = $this->hospitalScope($request);
        $run = AllocationRun::findOrFail($id);

        $donorBelongs = User::where('id', $run->donor_user_id)
            ->where('preferred_hospital_id', $hospitalId)->exists();
        if (!$donorBelongs) abort(403, 'Run not visible to your hospital.');

        $rows  = [['Rank', 'Recipient', 'Blood', 'Organ', 'Age', 'Gender', 'Urgency', 'Waiting Days', 'Survival', 'Urgency Pts', 'Waiting Pts', 'Survival Pts', 'Age Pts', 'Final Score']];
        foreach (($run->results ?? []) as $r) {
            $b = $r['score_breakdown'] ?? [];
            $rows[] = [
                $r['rank'] ?? '',
                $r['name'] ?? '',
                $r['blood_type'] ?? '',
                $r['organ_needed'] ?? '',
                $r['age'] ?? '',
                $r['gender'] ?? '',
                $r['urgency_score'] ?? '',
                $r['days_on_waitlist'] ?? '',
                $r['survival_estimate'] ?? '',
                $b['urgency'] ?? '',
                $b['waiting'] ?? '',
                $b['survival'] ?? '',
                $b['age'] ?? '',
                $r['final_score'] ?? '',
            ];
        }

        $csv = "";
        foreach ($rows as $row) {
            $csv .= implode(',', array_map(fn($v) => '"' . str_replace('"', '""', (string) $v) . '"', $row)) . "\r\n";
        }

        $filename = "allocation_run_{$run->id}_{$run->organ}.csv";
        return response($csv, 200, [
            'Content-Type'        => 'text/csv; charset=utf-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    // ==================== INTERNAL ====================

    private function buildPayload(int $donorUserId, int $hospitalId): array
    {
        $donorUser = User::with('donorProfile')->findOrFail($donorUserId);
        $donorPayload = [
            'user_id'        => $donorUser->id,
            'name'           => $donorUser->name,
            'blood_type'     => $donorUser->donorProfile?->blood_type,
            'pledged_organs' => $donorUser->donorProfile?->pledged_organs ?? [],
            'hospital_id'    => $hospitalId,
        ];

        // Cross-hospital pool — uses the same loader as pendingAllocations for consistency
        $recipientPayloads = $this->loadRecipientPayloads($hospitalId);

        return [$donorPayload, $recipientPayloads];
    }


    private function buildComparison(array $original, array $simulated): array
    {
        $origIndex = [];
        foreach ($original as $r) $origIndex[$r['user_id']] = $r['rank'] ?? null;

        $rows = [];
        foreach ($simulated as $r) {
            $oldRank = $origIndex[$r['user_id']] ?? null;
            $newRank = $r['rank'];
            $delta   = ($oldRank !== null) ? ($oldRank - $newRank) : null;
            $rows[] = [
                'user_id'        => $r['user_id'],
                'name'           => $r['name'] ?? '—',
                'old_rank'       => $oldRank,
                'new_rank'       => $newRank,
                'rank_change'    => $delta,
                'old_score'      => $original[array_search($r['user_id'], array_column($original, 'user_id'))]['final_score'] ?? null,
                'new_score'      => $r['final_score'],
            ];
        }
        return $rows;
    }

    // ===== Module 6 helpers =====

    private function ageGroupCounts(array $rows): array
    {
        $buckets = ['<18' => 0, '18-40' => 0, '41-60' => 0, '60+' => 0, 'unknown' => 0];
        foreach ($rows as $r) {
            $age = $r['age'] ?? null;
            if ($age === null) { $buckets['unknown']++; continue; }
            if ($age < 18)      $buckets['<18']++;
            elseif ($age <= 40) $buckets['18-40']++;
            elseif ($age <= 60) $buckets['41-60']++;
            else                $buckets['60+']++;
        }
        return $buckets;
    }

    private function genderCounts(array $rows): array
    {
        $buckets = ['Male' => 0, 'Female' => 0, 'Other' => 0, 'unknown' => 0];
        foreach ($rows as $r) {
            $g = $r['gender'] ?? null;
            if (!$g)                            $buckets['unknown']++;
            elseif ($g === 'Male')              $buckets['Male']++;
            elseif ($g === 'Female')            $buckets['Female']++;
            else                                $buckets['Other']++;
        }
        return $buckets;
    }

    private function urgencyBandCounts(array $rows): array
    {
        $buckets = ['low' => 0, 'moderate' => 0, 'high' => 0];
        foreach ($rows as $r) {
            $u = (float) ($r['urgency_score'] ?? 0);
            if ($u < 4)       $buckets['low']++;
            elseif ($u < 7)   $buckets['moderate']++;
            else              $buckets['high']++;
        }
        return $buckets;
    }

    /**
     * Compare two count distributions as percentages.
     * Returns max absolute deviation (in percentage points) and a flagged boolean if it exceeds threshold.
     */
    private function compareDistributions(array $pool, array $topK, float $thresholdPct): array
    {
        $poolTotal = max(1, array_sum($pool));
        $topTotal  = max(1, array_sum($topK));

        $rows = [];
        $maxDev = 0.0;
        foreach ($pool as $bucket => $poolCount) {
            $poolPct = round(($poolCount / $poolTotal) * 100, 1);
            $topPct  = round((($topK[$bucket] ?? 0) / $topTotal) * 100, 1);
            $dev     = round($topPct - $poolPct, 1);
            $maxDev  = max($maxDev, abs($dev));
            $rows[]  = [
                'bucket'        => $bucket,
                'pool_count'    => (int) $poolCount,
                'pool_pct'      => $poolPct,
                'top_count'     => (int) ($topK[$bucket] ?? 0),
                'top_pct'       => $topPct,
                'deviation_pp'  => $dev,
            ];
        }
        return [
            'rows'        => $rows,
            'max_dev_pp'  => round($maxDev, 1),
            'flagged'     => $maxDev > $thresholdPct,
        ];
    }

    /**
     * Compute sensitivity metrics: rank shift mean, top-K survival/age shift, urgency-band shift.
     */
    private function buildSensitivity(array $original, array $simulated, AllocationRun $sim, int $k): array
    {
        $origMap = [];
        foreach ($original as $r) $origMap[$r['user_id']] = $r;

        $rankDeltas   = [];
        $survivalOrig = [];
        $survivalSim  = [];
        $ageOrig      = [];
        $ageSim       = [];

        $topOrig = array_slice($original, 0, $k);
        $topSim  = array_slice($simulated, 0, $k);

        foreach ($topOrig as $r) {
            $survivalOrig[] = (float) preg_replace('/[^0-9.]/', '', (string) ($r['survival_estimate'] ?? 0));
            $ageOrig[]      = (int) ($r['age'] ?? 0);
        }
        foreach ($topSim as $r) {
            $survivalSim[]  = (float) preg_replace('/[^0-9.]/', '', (string) ($r['survival_estimate'] ?? 0));
            $ageSim[]       = (int) ($r['age'] ?? 0);
        }

        foreach ($simulated as $r) {
            $orig = $origMap[$r['user_id']] ?? null;
            if ($orig && isset($orig['rank']) && isset($r['rank'])) {
                $rankDeltas[] = abs($orig['rank'] - $r['rank']);
            }
        }

        $mean = fn(array $a) => empty($a) ? 0 : array_sum($a) / count($a);

        // Identity churn — how many of original top-K are still in sim top-K
        $origTopIds = array_column($topOrig, 'user_id');
        $simTopIds  = array_column($topSim, 'user_id');
        $intersect  = array_intersect($origTopIds, $simTopIds);
        $churnPct   = count($origTopIds) > 0 ? round((1 - count($intersect) / count($origTopIds)) * 100, 1) : 0;

        return [
            'simulation_run_id'       => $sim->id,
            'simulation_weights'      => $sim->weights_snapshot,
            'simulation_created_at'   => $sim->created_at?->toIso8601String(),
            'k'                       => $k,
            'mean_rank_shift'         => round($mean($rankDeltas), 2),
            'max_rank_shift'          => empty($rankDeltas) ? 0 : max($rankDeltas),
            'survival_change_pct'     => round($mean($survivalSim) - $mean($survivalOrig), 2),
            'age_shift_years'         => round($mean($ageSim) - $mean($ageOrig), 2),
            'top_k_churn_pct'         => $churnPct,
        ];
    }
}
