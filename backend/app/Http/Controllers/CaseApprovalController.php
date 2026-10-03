<?php

namespace App\Http\Controllers;

use App\Models\AllocationDecision;
use App\Models\CaseApproval;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Module 7 — Hospital Approval Board.
 *
 * Governs the gap between "the engine picked recipient X" (Module 5) and "we are
 * actually going to transplant". Three rules are enforced here, server-side, and
 * mirrored in the UI purely as a convenience:
 *
 *  1. Checklist validation — no approval action is accepted while a required
 *     item is unticked (7.1).
 *  2. Sequential multi-user approval — doctor first, then admin. An admin cannot
 *     reach in and confirm a case the doctor has not signed (7.2).
 *  3. Every terminal outcome notifies both donor and recipient (7.3).
 *
 * Approval durations are materialised on completion for the performance
 * comparison in metrics() (7.4).
 */
class CaseApprovalController extends Controller
{
    /**
     * Resolve which hospital's approval board the caller may act on.
     *
     * Three tiers, drawn on data-minimisation lines:
     *
     *  - Hospital, its linked admins and doctors: full access to their OWN
     *    hospital. They are delivering the care, so they need the patient.
     *  - Auditor: read-only, and ONLY their own hospital. Auditors are hospital
     *    employees (see UserController::createEmployee) - they were previously
     *    grouped with super_admin here and could read every other hospital's
     *    patients, which was a cross-tenant leak.
     *  - Super admin: network supervision. Gets null (all hospitals) so the
     *    cross-hospital aggregates in metrics() work, but every case-level read
     *    rejects it via denyIdentifiableToSupervisor(). Supervising the registry
     *    does not require knowing which named patient had which crossmatch.
     */
    private function scope(Request $request, bool $forWrite): ?int
    {
        $u = $request->user();

        if ($u->role === 'super_admin') {
            if ($forWrite) abort(403, 'Super admins supervise the network; they do not approve or reject individual cases.');
            return null;
        }

        if ($u->role === 'hospital') return (int) $u->id;

        if (in_array($u->role, ['admin', 'doctor', 'auditor'], true)) {
            if (empty($u->linked_hospital_id)) {
                abort(403, 'Your account is not linked to a hospital, so it has no approval board.');
            }
            if ($forWrite && $u->role === 'auditor') {
                abort(403, 'Auditors have read-only access.');
            }
            return (int) $u->linked_hospital_id;
        }

        abort(403, 'Approval board access denied.');
    }

    /**
     * Block the supervisor role from anything that identifies a patient.
     *
     * Aggregate performance and utilisation figures are the registry's own
     * supervision data and carry no patient. Case lists, detail panels and
     * timelines carry names, clinical checklists (serology, crossmatch),
     * doctors' notes and discard reasons - none of which supervision needs.
     */
    private function denyIdentifiableToSupervisor(Request $request): void
    {
        if ($request->user()->role === 'super_admin') {
            abort(403, 'Super admins see network-level metrics only. Case-level records belong to the treating hospital.');
        }
    }

    /** Load a case and assert the caller may act on it. */
    private function findScoped(Request $request, int $id, bool $forWrite): CaseApproval
    {
        $scope = $this->scope($request, $forWrite);

        $approval = CaseApproval::with([
            'donor:id,name,email,unique_id',
            'recipient:id,name,email,unique_id',
            'doctor:id,name', 'admin:id,name', 'rejecter:id,name',
            'decision:id,selected_rank,was_override,override_reason,created_at',
        ])->findOrFail($id);

        if ($scope !== null && (int) $approval->hospital_id !== $scope) {
            abort(403, 'That case belongs to another hospital.');
        }

        return $approval;
    }

    /**
     * Create the governance record for a freshly confirmed allocation decision.
     * Called from AllocationController::createDecision inside its transaction, so
     * a decision can never exist without its approval case.
     */
    public static function openFor(AllocationDecision $decision, ?int $donorUserId, ?string $organ): CaseApproval
    {
        return CaseApproval::create([
            'allocation_decision_id' => $decision->id,
            'hospital_id'            => $decision->hospital_id,
            'donor_user_id'          => $donorUserId,
            'recipient_user_id'      => $decision->selected_recipient_id,
            'organ'                  => $organ,
            'stage'                  => 'checklist',
            'requires_multi_user'    => true,
            'checklist'              => CaseApproval::freshChecklist(),
            'allocated_at'           => $decision->created_at ?? now(),
        ]);
    }

    /** GET /api/approvals — board listing. */
    public function index(Request $request): JsonResponse
    {
        $this->denyIdentifiableToSupervisor($request);
        $scope = $this->scope($request, false);

        $data = $request->validate([
            'stage' => 'sometimes|in:checklist,doctor,admin,approved,rejected,open',
            'page'  => 'sometimes|integer|min:1',
            'limit' => 'sometimes|integer|min:1|max:100',
        ]);

        $q = CaseApproval::with([
            'donor:id,name,unique_id', 'recipient:id,name,unique_id',
            'doctor:id,name', 'admin:id,name', 'rejecter:id,name',
            'hospital:id,name',
        ])->when($scope !== null, fn ($x) => $x->where('hospital_id', $scope));

        if (($data['stage'] ?? null) === 'open') {
            $q->whereIn('stage', ['checklist', 'doctor', 'admin']);
        } elseif (!empty($data['stage'])) {
            $q->where('stage', $data['stage']);
        }

        $limit = (int) ($data['limit'] ?? 20);
        $page  = (int) ($data['page'] ?? 1);

        $total = (clone $q)->count();

        // Cases awaiting a human come first (closest to done first), then history.
        $rows = $q->orderByRaw("FIELD(stage,'admin','doctor','checklist','approved','rejected')")
                  ->orderByDesc('allocated_at')
                  ->forPage($page, $limit)
                  ->get();

        // Stage counts drive the filter chips — one grouped query, not five.
        $counts = CaseApproval::when($scope !== null, fn ($x) => $x->where('hospital_id', $scope))
            ->groupBy('stage')->selectRaw('stage, COUNT(*) as n')->pluck('n', 'stage');

        return response()->json([
            'data'      => $rows->map(fn ($a) => $this->present($a)),
            'counts'    => $counts,
            'total'     => $total,
            'page'      => $page,
            'limit'     => $limit,
            'read_only' => $scope === null,
        ]);
    }

    /** GET /api/approvals/{id} */
    public function show(Request $request, int $id): JsonResponse
    {
        $this->denyIdentifiableToSupervisor($request);
        return response()->json(['data' => $this->present($this->findScoped($request, $id, false), true)]);
    }

    /**
     * POST /api/approvals/{id}/checklist — tick or untick one item.
     *
     * Locked once the case is terminal: an approved case's checklist is the
     * evidence for that approval and must not drift afterwards.
     */
    public function updateChecklist(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'key'     => 'required|string|max:60',
            'checked' => 'required|boolean',
        ]);

        $approval = $this->findScoped($request, $id, true);

        if ($approval->isTerminal()) {
            return response()->json(['message' => 'This case is closed — its checklist can no longer be edited.'], 422);
        }

        $checklist = $approval->checklist;
        $found = false;

        foreach ($checklist as &$item) {
            if ($item['key'] === $data['key']) {
                $found = true;
                $item['checked']    = $data['checked'];
                $item['checked_by'] = $data['checked'] ? $request->user()->name : null;
                $item['checked_at'] = $data['checked'] ? now()->toIso8601String() : null;
                break;
            }
        }
        unset($item);

        if (!$found) return response()->json(['message' => 'Unknown checklist item.'], 422);

        $approval->checklist = $checklist;

        // Unticking a required item after the checklist stage has been cleared
        // walks the case back — an approval cannot stay pending on evidence that
        // has since been withdrawn.
        if (!$approval->checklistComplete() && in_array($approval->stage, ['doctor', 'admin'], true)) {
            $approval->stage = 'checklist';
            $approval->doctor_id = null;
            $approval->doctor_approved_at = null;
        }

        $approval->save();

        return response()->json(['data' => $this->present($approval->fresh(), true)]);
    }

    /** PATCH /api/approvals/{id}/mode — turn the optional doctor stage on or off (7.2). */
    public function setMode(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['requires_multi_user' => 'required|boolean']);
        $approval = $this->findScoped($request, $id, true);

        if (!in_array($request->user()->role, ['hospital', 'admin'], true)) {
            return response()->json(['message' => 'Only the hospital or a hospital admin can change the approval mode.'], 403);
        }
        if ($approval->isTerminal()) {
            return response()->json(['message' => 'This case is closed.'], 422);
        }
        if ($approval->doctor_approved_at) {
            return response()->json(['message' => 'The doctor has already signed this case — the mode is locked.'], 422);
        }

        $approval->requires_multi_user = $data['requires_multi_user'];
        if ($approval->stage !== 'checklist') $approval->stage = $approval->firstApprovalStage();
        $approval->save();

        return response()->json(['data' => $this->present($approval->fresh(), true)]);
    }

    /** POST /api/approvals/{id}/doctor-approve — stage 1 of the sequential workflow. */
    public function doctorApprove(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['notes' => 'nullable|string|max:2000']);
        $approval = $this->findScoped($request, $id, true);
        $user = $request->user();

        if ($user->role !== 'doctor') {
            return response()->json(['message' => 'Only a doctor can provide the clinical sign-off.'], 403);
        }
        if ($guard = $this->guardActionable($approval, 'doctor')) return $guard;

        $approval->update([
            'doctor_id'          => $user->id,
            'doctor_approved_at' => now(),
            'doctor_notes'       => $data['notes'] ?? null,
            'stage'              => 'admin',
        ]);

        ActivityLogger::logActivity('case_approve', 'Doctor sign-off recorded',
            "Case #{$approval->id} cleared clinical review", ['actor_id' => $user->id]);
        ActivityLogger::logAction($user->id, 'case_doctor_approved', 'Clinical sign-off', ['approval_id' => $approval->id]);

        return response()->json(['data' => $this->present($approval->fresh(), true)]);
    }

    /**
     * POST /api/approvals/{id}/admin-confirm — final stage. Completes the case,
     * stamps the elapsed time, and notifies donor + recipient.
     */
    public function adminConfirm(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['notes' => 'nullable|string|max:2000']);
        $approval = $this->findScoped($request, $id, true);
        $user = $request->user();

        if (!in_array($user->role, ['hospital', 'admin'], true)) {
            return response()->json(['message' => 'Only the hospital or a hospital admin can give final confirmation.'], 403);
        }
        if ($guard = $this->guardActionable($approval, 'admin')) return $guard;

        // Conflict of interest: the same human cannot supply both signatures.
        if ($approval->requires_multi_user && (int) $approval->doctor_id === (int) $user->id) {
            return response()->json(['message' => 'The doctor who signed this case cannot also give the final confirmation.'], 422);
        }

        $now = now();

        $approval->update([
            'admin_id'           => $user->id,
            'admin_confirmed_at' => $now,
            'admin_notes'        => $data['notes'] ?? null,
            'stage'              => 'approved',
            'approved_at'        => $now,
            'approval_seconds'   => max(0, $approval->allocated_at ? $approval->allocated_at->diffInSeconds($now) : 0),
        ]);

        $this->announce($approval->fresh(), 'approved');

        ActivityLogger::logActivity('case_approve', 'Transplant case approved',
            "Case #{$approval->id} approved for transplant", ['actor_id' => $user->id]);
        ActivityLogger::logAction($user->id, 'case_approved', 'Final approval confirmed', ['approval_id' => $approval->id]);

        Cache::flush();

        return response()->json(['data' => $this->present($approval->fresh(), true)]);
    }

    /** POST /api/approvals/{id}/reject — terminal rejection from any open stage. */
    public function reject(Request $request, int $id): JsonResponse
    {
        $min = (int) config('governance.rejection_reason_min', 20);

        $data = $request->validate(['reason' => "required|string|min:{$min}|max:2000"]);
        $approval = $this->findScoped($request, $id, true);
        $user = $request->user();

        if (!in_array($user->role, ['hospital', 'admin', 'doctor'], true)) {
            return response()->json(['message' => 'You cannot act on approval cases.'], 403);
        }
        if ($approval->isTerminal()) {
            return response()->json(['message' => 'This case has already been closed.'], 422);
        }

        $approval->update([
            'stage'            => 'rejected',
            'rejected_by'      => $user->id,
            'rejected_at'      => now(),
            'rejection_reason' => $data['reason'],
        ]);

        $this->announce($approval->fresh(), 'rejected');

        ActivityLogger::logActivity('case_reject', 'Transplant case rejected',
            "Case #{$approval->id} was rejected at the approval board", ['actor_id' => $user->id]);
        ActivityLogger::logAction($user->id, 'case_rejected', $data['reason'], ['approval_id' => $approval->id]);

        Cache::flush();

        return response()->json(['data' => $this->present($approval->fresh(), true)]);
    }

    /**
     * GET /api/approvals/metrics — approval time tracking + hospital comparison (7.4).
     *
     * Reads the materialised approval_seconds column, so this is one grouped read
     * rather than a per-case timestamp diff. Median is computed in PHP over the
     * per-hospital duration lists because MySQL has no portable percentile
     * aggregate; the row volume here is approvals, not log lines, so that is cheap.
     */
    public function metrics(Request $request): JsonResponse
    {
        $scope = $this->scope($request, false);

        $rows = CaseApproval::where('stage', 'approved')
            ->whereNotNull('approval_seconds')
            ->join('users', 'users.id', '=', 'case_approvals.hospital_id')
            ->get(['case_approvals.hospital_id', 'case_approvals.approval_seconds', 'users.name as hospital_name']);

        $byHospital = [];
        foreach ($rows as $r) {
            $byHospital[$r->hospital_id]['name'] = $r->hospital_name;
            $byHospital[$r->hospital_id]['durations'][] = (int) $r->approval_seconds;
        }

        $hospitals = [];
        $all = [];
        foreach ($byHospital as $hid => $h) {
            $d = $h['durations'];
            sort($d);
            $all = array_merge($all, $d);
            $hospitals[] = [
                'hospital_id'     => (int) $hid,
                'hospital_name'   => $h['name'],
                'approved'        => count($d),
                'avg_seconds'     => (int) round(array_sum($d) / count($d)),
                'median_seconds'  => self::median($d),
                'fastest_seconds' => $d[0],
                'slowest_seconds' => $d[count($d) - 1],
                'is_you'          => $scope !== null && (int) $hid === $scope,
            ];
        }

        usort($hospitals, fn ($a, $b) => $a['avg_seconds'] <=> $b['avg_seconds']);
        foreach ($hospitals as $i => &$h) $h['rank'] = $i + 1;
        unset($h);

        sort($all);

        $mine = $scope !== null ? collect($hospitals)->firstWhere('hospital_id', $scope) : null;

        $pipeline = CaseApproval::when($scope !== null, fn ($q) => $q->where('hospital_id', $scope))
            ->groupBy('stage')->selectRaw('stage, COUNT(*) as n')->pluck('n', 'stage');

        return response()->json([
            'network' => [
                'approved'       => count($all),
                'avg_seconds'    => $all ? (int) round(array_sum($all) / count($all)) : null,
                'median_seconds' => self::median($all),
                'hospitals'      => count($hospitals),
            ],
            'mine'      => $mine,
            'hospitals' => $hospitals,
            'pipeline'  => $pipeline,
            'read_only' => $scope === null,
        ]);
    }

    private static function median(array $sorted): ?int
    {
        $n = count($sorted);
        if ($n === 0) return null;
        $mid = intdiv($n, 2);
        return $n % 2 ? $sorted[$mid] : (int) round(($sorted[$mid - 1] + $sorted[$mid]) / 2);
    }

    /**
     * Shared gate for both approval actions: the case must be open, the checklist
     * complete (7.1), and the case must be sitting at exactly this stage — which
     * is what makes the workflow sequential rather than parallel (7.2).
     */
    private function guardActionable(CaseApproval $approval, string $stage): ?JsonResponse
    {
        if ($approval->isTerminal()) {
            return response()->json(['message' => 'This case has already been closed.'], 422);
        }

        if (!$approval->checklistComplete()) {
            $n = $approval->requiredOutstanding();
            return response()->json([
                'message' => "The verification checklist is incomplete — {$n} required item(s) still outstanding. Every required item must be confirmed before a decision can be recorded.",
            ], 422);
        }

        // Checklist is complete but the row still says 'checklist'; advance it so
        // the stage check below compares against the real current stage.
        if ($approval->stage === 'checklist') {
            $approval->stage = $approval->firstApprovalStage();
            $approval->save();
        }

        if ($approval->stage !== $stage) {
            $waiting = $approval->stage === 'doctor'
                ? 'clinical sign-off from a doctor'
                : 'final confirmation from the hospital admin';
            return response()->json(['message' => "This case is waiting on {$waiting}."], 422);
        }

        return null;
    }

    /** 7.3 — notify recipient and donor of the outcome, in-app and by email. */
    private function announce(CaseApproval $approval, string $outcome): void
    {
        $organ = $approval->organ ? strtolower($approval->organ) : 'organ';

        $recipient = $approval->recipient_user_id ? User::find($approval->recipient_user_id) : null;
        $donor     = $approval->donor_user_id ? User::find($approval->donor_user_id) : null;

        $meta = [
            'approval_id' => $approval->id,
            'decision_id' => $approval->allocation_decision_id,
            'organ'       => $approval->organ,
            'outcome'     => $outcome,
        ];

        if ($outcome === 'approved') {
            Notifier::notifyAndEmail($recipient, 'case_approved', 'Your transplant case has been approved',
                "Good news — the hospital approval board has cleared your {$organ} transplant case. Your transplant team will be in touch with next steps and scheduling.", $meta);

            Notifier::notifyAndEmail($donor, 'case_approved', 'Donation match approved',
                "The hospital approval board has cleared the {$organ} donation match associated with your record. Thank you for your gift.", $meta);
        } else {
            $reason = $approval->rejection_reason;

            Notifier::notifyAndEmail($recipient, 'case_rejected', 'Update on your transplant case',
                "The hospital approval board did not clear this {$organ} match.\n\nReason given: {$reason}\n\nThis does not remove you from the waiting list — you remain eligible for future matches.", $meta);

            Notifier::notifyAndEmail($donor, 'case_rejected', 'Update on a donation match',
                "The {$organ} match associated with your record was not cleared by the approval board.\n\nReason given: {$reason}", $meta);
        }
    }

    /** Shape one case for the UI, including the derived gate state. */
    private function present(CaseApproval $a, bool $full = false): array
    {
        $checklist = $a->checklist ?? [];
        $required  = array_filter($checklist, fn ($i) => $i['required'] ?? false);
        $done      = array_filter($required, fn ($i) => $i['checked'] ?? false);

        $out = [
            'id'                  => $a->id,
            'decision_id'         => $a->allocation_decision_id,
            'hospital_id'         => (int) $a->hospital_id,
            'hospital_name'       => $a->relationLoaded('hospital') ? optional($a->hospital)->name : null,
            'organ'               => $a->organ,
            'stage'               => $a->stage,
            'requires_multi_user' => $a->requires_multi_user,
            'donor'               => $a->donor ? ['id' => $a->donor->id, 'name' => $a->donor->name, 'unique_id' => $a->donor->unique_id] : null,
            'recipient'           => $a->recipient ? ['id' => $a->recipient->id, 'name' => $a->recipient->name, 'unique_id' => $a->recipient->unique_id] : null,
            'checklist_total'     => count($required),
            'checklist_done'      => count($done),
            'checklist_complete'  => $a->checklistComplete(),
            'doctor'              => optional($a->doctor)->name,
            'doctor_approved_at'  => optional($a->doctor_approved_at)?->toIso8601String(),
            'admin'               => optional($a->admin)->name,
            'admin_confirmed_at'  => optional($a->admin_confirmed_at)?->toIso8601String(),
            'rejected_by'         => optional($a->rejecter)->name,
            'rejection_reason'    => $a->rejection_reason,
            'allocated_at'        => optional($a->allocated_at)?->toIso8601String(),
            'approved_at'         => optional($a->approved_at)?->toIso8601String(),
            'approval_seconds'    => $a->approval_seconds,
            // Live elapsed for open cases, so the board can surface what is ageing.
            'elapsed_seconds'     => $a->approval_seconds ?? ($a->allocated_at ? $a->allocated_at->diffInSeconds(now()) : null),
        ];

        if ($full) {
            $out['checklist']    = $checklist;
            $out['doctor_notes'] = $a->doctor_notes;
            $out['admin_notes']  = $a->admin_notes;
            $out['decision']     = $a->decision ? [
                'selected_rank'   => $a->decision->selected_rank,
                'was_override'    => (bool) $a->decision->was_override,
                'override_reason' => $a->decision->override_reason,
            ] : null;
        }

        return $out;
    }
}
