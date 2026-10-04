<?php

namespace App\Http\Controllers;

use App\Models\AllocationDecision;
use App\Models\AllocationRun;
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
 * actually going to transplant". Rules enforced here, server-side, and mirrored in
 * the UI purely as a convenience:
 *
 *  1. Checklist validation — no approval action is accepted while a required
 *     item is unticked (7.1).
 *  2. Sequential multi-user approval — doctor first, then admin. An admin cannot
 *     reach in and confirm a case the doctor has not signed (7.2).
 *  3. Every terminal outcome notifies both donor and recipient (7.3).
 *  4. The RECEIVING hospital accepts or declines the offer before the donor side
 *     can sign off, whenever the two are different hospitals.
 *
 * Rule 4 exists because the allocation engine matches across the whole network
 * (AllocationController::loadRecipientPayloads draws from every approved recipient
 * in the country), while this board originally keyed on the donor's hospital alone.
 * The effect was that a hospital could approve — or reject — a transplant for a
 * patient belonging to a hospital that never saw the case. On the seeded data that
 * was 8 of 10 cases.
 *
 * Approval durations are materialised on completion for the performance comparison
 * in metrics() (7.4), with the counterparty's offer-response time tracked
 * separately so a slow receiving centre is not reported as the donor hospital
 * being slow.
 */
class CaseApprovalController extends Controller
{
    /** Roles that may act on a case at all, and whether they may write. */
    private const STAFF = ['admin', 'doctor', 'auditor'];

    /**
     * Resolve which hospital the caller belongs to.
     *
     * Three tiers, drawn on data-minimisation lines:
     *
     *  - Hospital, its linked admins and doctors: full access to their OWN
     *    hospital's cases, on either side of the offer.
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

        if (in_array($u->role, self::STAFF, true)) {
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
     * Which side of this case the caller is on.
     *
     * 'donor' is checked first so that a same-hospital case (both columns equal)
     * resolves to the side that holds the full set of rights, rather than to the
     * offer-only recipient side.
     */
    private function sideFor(CaseApproval $a, ?int $hospitalId): string
    {
        if ($hospitalId === null)                                  return 'supervisor';
        if ((int) $a->hospital_id === $hospitalId)                 return 'donor';
        if ((int) $a->recipient_hospital_id === $hospitalId)       return 'recipient';

        return 'none';
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

    /**
     * Load a case and assert the caller may act on it from the required side.
     *
     * @return array{0: CaseApproval, 1: string}  the case and the caller's side
     */
    private function findScoped(Request $request, int $id, bool $forWrite, ?string $requireSide = null): array
    {
        $scope = $this->scope($request, $forWrite);

        $approval = CaseApproval::with([
            'donor:id,name,email,unique_id',
            'recipient:id,name,email,unique_id',
            'doctor:id,name', 'admin:id,name', 'rejecter:id,name', 'offerResponder:id,name',
            'hospital:id,name', 'recipientHospital:id,name',
            'decision:id,selected_rank,was_override,override_reason,created_at',
        ])->findOrFail($id);

        $side = $this->sideFor($approval, $scope);

        if ($side === 'none') {
            abort(403, 'That case belongs to another hospital.');
        }

        if ($requireSide !== null && $side !== $requireSide) {
            abort(403, $requireSide === 'donor'
                ? 'Only the procuring hospital can take that action. Your hospital receives this offer — you may accept or decline it.'
                : 'Only the receiving hospital can answer the offer for its own patient.');
        }

        return [$approval, $side];
    }

    /**
     * Create the governance record for a freshly confirmed allocation decision.
     * Called from AllocationController::createDecision inside its transaction, so
     * a decision can never exist without its approval case.
     */
    public static function openFor(
        AllocationDecision $decision,
        ?int $donorUserId,
        ?string $organ,
        ?int $reofferedFromId = null
    ): CaseApproval {
        $recipientHospitalId = $decision->selected_recipient_id
            ? User::whereKey($decision->selected_recipient_id)->value('preferred_hospital_id')
            : null;

        $approval = CaseApproval::create([
            'allocation_decision_id' => $decision->id,
            'hospital_id'            => $decision->hospital_id,
            'recipient_hospital_id'  => $recipientHospitalId,
            'donor_user_id'          => $donorUserId,
            'recipient_user_id'      => $decision->selected_recipient_id,
            'organ'                  => $organ,
            'stage'                  => 'checklist',
            'requires_multi_user'    => true,
            'checklist'              => CaseApproval::freshChecklist(),
            'allocated_at'           => $decision->created_at ?? now(),
            'reoffered_from_id'      => $reofferedFromId,
        ]);

        return $approval;
    }

    /** GET /api/approvals — board listing, both sides. */
    public function index(Request $request): JsonResponse
    {
        $this->denyIdentifiableToSupervisor($request);
        $scope = $this->scope($request, false);

        $data = $request->validate([
            'stage' => 'sometimes|in:checklist,offer,doctor,admin,approved,rejected,declined,open,awaiting_us',
            'side'  => 'sometimes|in:donor,recipient',
            'page'  => 'sometimes|integer|min:1',
            'limit' => 'sometimes|integer|min:1|max:100',
        ]);

        // A case is ours if we are on either side of it.
        $mine = fn ($q) => $q->where(function ($w) use ($scope) {
            $w->where('hospital_id', $scope)->orWhere('recipient_hospital_id', $scope);
        });

        $q = CaseApproval::with([
            'donor:id,name,unique_id', 'recipient:id,name,unique_id',
            'doctor:id,name', 'admin:id,name', 'rejecter:id,name',
            'hospital:id,name', 'recipientHospital:id,name',
        ])->when($scope !== null, $mine);

        if (!empty($data['side']) && $scope !== null) {
            $data['side'] === 'donor'
                ? $q->where('hospital_id', $scope)
                : $q->where('recipient_hospital_id', $scope)->whereColumn('recipient_hospital_id', '!=', 'hospital_id');
        }

        $stage = $data['stage'] ?? null;

        if ($stage === 'open') {
            $q->whereIn('stage', ['checklist', 'offer', 'doctor', 'admin']);
        } elseif ($stage === 'awaiting_us' && $scope !== null) {
            // The actionable queue: cases where the ball is in OUR court. Offers
            // waiting on us as the receiving centre, or our own donor-side work.
            $q->where(function ($w) use ($scope) {
                $w->where(fn ($x) => $x->where('recipient_hospital_id', $scope)->where('stage', 'offer')
                                       ->whereColumn('recipient_hospital_id', '!=', 'hospital_id'))
                  ->orWhere(fn ($x) => $x->where('hospital_id', $scope)
                                         ->whereIn('stage', ['checklist', 'doctor', 'admin']));
            });
        } elseif ($stage && !in_array($stage, ['open', 'awaiting_us'], true)) {
            $q->where('stage', $stage);
        }

        $limit = (int) ($data['limit'] ?? 20);
        $page  = (int) ($data['page'] ?? 1);

        $total = (clone $q)->count();

        // Cases awaiting a human come first (closest to done first), then history.
        $rows = $q->orderByRaw("FIELD(stage,'admin','doctor','offer','checklist','approved','declined','rejected')")
                  ->orderByDesc('allocated_at')
                  ->forPage($page, $limit)
                  ->get();

        // Stage counts drive the filter chips — one grouped query, not seven.
        $counts = CaseApproval::when($scope !== null, $mine)
            ->groupBy('stage')->selectRaw('stage, COUNT(*) as n')->pluck('n', 'stage');

        // How many need THIS hospital to do something — the number worth badging.
        $awaitingUs = $scope === null ? 0 : CaseApproval::where(function ($w) use ($scope) {
            $w->where(fn ($x) => $x->where('recipient_hospital_id', $scope)->where('stage', 'offer')
                                   ->whereColumn('recipient_hospital_id', '!=', 'hospital_id'))
              ->orWhere(fn ($x) => $x->where('hospital_id', $scope)
                                     ->whereIn('stage', ['checklist', 'doctor', 'admin']));
        })->count();

        return response()->json([
            'data'         => $rows->map(fn ($a) => $this->present($a, $this->sideFor($a, $scope))),
            'counts'       => $counts,
            'awaiting_us'  => $awaitingUs,
            'total'        => $total,
            'page'         => $page,
            'limit'        => $limit,
            'read_only'    => $scope === null,
        ]);
    }

    /** GET /api/approvals/{id} */
    public function show(Request $request, int $id): JsonResponse
    {
        $this->denyIdentifiableToSupervisor($request);
        [$approval, $side] = $this->findScoped($request, $id, false);

        return response()->json(['data' => $this->present($approval, $side, true)]);
    }

    /**
     * POST /api/approvals/{id}/checklist — tick or untick one item.
     *
     * Donor side only: these are the procuring hospital's own verification items
     * (serology, crossmatch, consent documents on the donor record).
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

        [$approval, $side] = $this->findScoped($request, $id, true, 'donor');

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
        // has since been withdrawn. An offer already answered is NOT revoked by
        // this: the counterparty's consent stands, and re-asking them because the
        // procuring hospital amended its own paperwork would be noise.
        $walkedBack = false;

        if (!$approval->checklistComplete() && in_array($approval->stage, ['offer', 'doctor', 'admin'], true)) {
            $walkedBack = $approval->stage === 'offer';
            $approval->stage = 'checklist';
            $approval->doctor_id = null;
            $approval->doctor_approved_at = null;

            // An unanswered offer that is withdrawn must also drop its clock. Left
            // running, the paused time would be billed to the counterparty as slow
            // response in metrics() - time during which there was nothing for them
            // to answer.
            if ($walkedBack) $approval->offer_sent_at = null;
        }

        // A completed checklist moves the case on immediately, rather than waiting
        // for someone to attempt a sign-off. Two reasons:
        //
        //  - On a cross-hospital case the completed checklist IS the offer, and the
        //    gate in guardActionable() only fires when the donor side tries to sign
        //    off - so the counterparty would not learn an organ was waiting until
        //    someone clicked a button that was always going to fail.
        //  - Otherwise the board displays "Verification" for a case that is in fact
        //    ready for the doctor, which is simply untrue. That is also what made a
        //    re-completed checklist on an already-accepted case appear stuck.
        //
        // firstApprovalStage() decides which: 'offer' while the counterparty has
        // not answered, otherwise doctor/admin per the case's mode. An offer already
        // accepted is therefore never re-asked.
        $justOffered = false;

        if ($approval->stage === 'checklist' && $approval->checklistComplete()) {
            $approval->stage = $approval->firstApprovalStage();

            if ($approval->stage === 'offer' && !$approval->offer_sent_at) {
                $approval->offer_sent_at = now();
                $justOffered = true;
            }
        }

        $approval->save();

        if ($justOffered) $this->notifyOfferSent($approval);

        return response()->json(['data' => $this->present($approval->fresh(), $side, true)]);
    }

    /** PATCH /api/approvals/{id}/mode — turn the optional doctor stage on or off (7.2). */
    public function setMode(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['requires_multi_user' => 'required|boolean']);
        [$approval, $side] = $this->findScoped($request, $id, true, 'donor');

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

        return response()->json(['data' => $this->present($approval->fresh(), $side, true)]);
    }

    /**
     * POST /api/approvals/{id}/offer-respond — the receiving hospital's answer.
     *
     * This is the stage the board was missing. The hospital that holds the
     * recipient's chart decides whether to take the organ for its patient; the
     * procuring hospital cannot answer on its behalf, and cannot proceed past this
     * point until it has an answer.
     *
     * A decline is deliberately NOT a rejection. The patient stays on the list and
     * the organ falls to the next-ranked candidate from the same run, because an
     * organ stranded by a decline is an organ lost to the cold-chain clock.
     */
    public function respondToOffer(Request $request, int $id): JsonResponse
    {
        $min = (int) config('governance.rejection_reason_min', 20);

        $data = $request->validate([
            'accept' => 'required|boolean',
            'reason' => "required_if:accept,false|nullable|string|min:{$min}|max:2000",
            'notes'  => 'nullable|string|max:2000',
        ]);

        [$approval, $side] = $this->findScoped($request, $id, true, 'recipient');
        $user = $request->user();

        if (!in_array($user->role, ['hospital', 'admin', 'doctor'], true)) {
            return response()->json(['message' => 'You cannot answer organ offers.'], 403);
        }
        if ($approval->isTerminal()) {
            return response()->json(['message' => 'This case has already been closed.'], 422);
        }
        if ($approval->stage !== 'offer') {
            return response()->json([
                'message' => $approval->offerAccepted()
                    ? 'This offer has already been answered.'
                    : 'This case is not at the offer stage yet — the procuring hospital is still completing its verification checklist.',
            ], 422);
        }

        $now     = now();
        $accept  = (bool) $data['accept'];
        $elapsed = $approval->offer_sent_at ? max(0, $approval->offer_sent_at->diffInSeconds($now)) : null;

        $reoffered = null;

        DB::transaction(function () use ($approval, $accept, $data, $user, $now, $elapsed, &$reoffered) {
            $approval->forceFill([
                'offer_responded_at' => $now,
                'offer_response_by'  => $user->id,
                'offer_notes'        => $accept ? ($data['notes'] ?? null) : $data['reason'],
                'offer_seconds'      => $elapsed,
            ]);

            if ($accept) {
                // Consent obtained: hand the case back to the donor side.
                $approval->stage = $approval->requires_multi_user ? 'doctor' : 'admin';
                $approval->save();
                return;
            }

            $approval->stage = 'declined';
            $approval->save();

            $reoffered = $this->reofferToNextCandidate($approval, $user->id);
        });

        $fresh = $approval->fresh();

        if ($accept) {
            $this->notifyDonorSide($fresh, true, null);
            ActivityLogger::logActivity('case_approve', 'Organ offer accepted',
                "Case #{$fresh->id}: receiving hospital accepted the offer", ['actor_id' => $user->id]);
            ActivityLogger::logAction($user->id, 'case_offer_accepted', 'Offer accepted', ['approval_id' => $fresh->id]);
        } else {
            $this->announce($fresh, 'declined');
            $this->notifyDonorSide($fresh, false, $reoffered);
            ActivityLogger::logActivity('case_reject', 'Organ offer declined',
                "Case #{$fresh->id}: receiving hospital declined the offer", ['actor_id' => $user->id]);
            ActivityLogger::logAction($user->id, 'case_offer_declined', $data['reason'], ['approval_id' => $fresh->id]);
        }

        Cache::flush();

        return response()->json([
            'data'      => $this->present($fresh, $side, true),
            'reoffered' => $reoffered ? [
                'approval_id' => $reoffered->id,
                'rank'        => $reoffered->decision?->selected_rank,
            ] : null,
            'message' => $accept
                ? 'Offer accepted — the procuring hospital has been notified and can now complete sign-off.'
                : ($reoffered
                    ? 'Offer declined. The organ has been offered to the next-ranked candidate.'
                    : 'Offer declined. No further eligible candidate was found in this allocation run — the procuring hospital has been notified.'),
        ]);
    }

    /**
     * Advance the organ to the next-ranked candidate after a decline.
     *
     * Walks the stored ranking on the original run rather than re-scoring: the
     * decision must stay faithful to the policy version and dataset that produced
     * the original offer, and re-running could reorder candidates because the
     * waitlist has moved on since.
     *
     * Candidates already tried for this run are skipped, so a chain of declines
     * walks steadily down the list instead of looping back to the top.
     */
    private function reofferToNextCandidate(CaseApproval $declined, int $actorId): ?CaseApproval
    {
        // Loaded FRESH, not reused from $declined->decision: findScoped() eager-loads
        // that relation with a column subset for the detail panel, which omits
        // allocation_run_id, decided_by and hospital_id. Reading them off the
        // partial model yielded nulls and this method returned silently without
        // re-offering anything - the organ was simply stranded.
        $decision = AllocationDecision::find($declined->allocation_decision_id);
        if (!$decision) return null;

        $run = AllocationRun::find($decision->allocation_run_id);
        if (!$run) return null;

        $results = $run->results ?? [];
        if (empty($results)) return null;

        // Everyone this run has already been offered to, in any state.
        $alreadyTried = AllocationDecision::where('allocation_run_id', $run->id)
            ->pluck('selected_recipient_id')
            ->map(fn ($v) => (int) $v)
            ->all();

        // Rank order, lowest first. The stored rows carry 'rank' but may not be
        // sorted, and an override can mean the declined case was not rank 1.
        usort($results, fn ($a, $b) => ($a['rank'] ?? PHP_INT_MAX) <=> ($b['rank'] ?? PHP_INT_MAX));

        foreach ($results as $candidate) {
            $uid = (int) ($candidate['user_id'] ?? 0);
            if (!$uid || in_array($uid, $alreadyTried, true)) continue;

            // Eligibility is re-checked at offer time, not trusted from the
            // snapshot: a candidate may have been banned, transplanted or
            // un-approved since the run.
            $stillEligible = User::whereKey($uid)
                ->where('role', 'recipient')
                ->where('status', 'approved')
                ->exists();
            if (!$stillEligible) continue;

            $next = AllocationDecision::create([
                'allocation_run_id'     => $run->id,
                'selected_recipient_id' => $uid,
                'selected_rank'         => (int) ($candidate['rank'] ?? 0),
                'was_override'          => false,
                'was_rejected'          => false,
                'override_reason'       => null,
                // The re-offer is automatic, but decided_by is NOT nullable and
                // attributing it to the declining clinician would be wrong. It
                // belongs to whoever ran the original allocation - this is their
                // ranked list advancing by one - and the note records that no human
                // picked this candidate individually.
                'decided_by'            => $decision->decided_by,
                'hospital_id'           => $decision->hospital_id,
                'status'                => 'confirmed',
                'notes'                 => "Automatic re-offer after case #{$declined->id} was declined by the receiving hospital.",
            ]);

            return self::openFor($next, $declined->donor_user_id, $declined->organ, $declined->id)
                ->load('decision:id,selected_rank');
        }

        return null;
    }

    /** POST /api/approvals/{id}/doctor-approve — stage 1 of the sequential workflow. */
    public function doctorApprove(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['notes' => 'nullable|string|max:2000']);
        [$approval, $side] = $this->findScoped($request, $id, true, 'donor');
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

        return response()->json(['data' => $this->present($approval->fresh(), $side, true)]);
    }

    /**
     * POST /api/approvals/{id}/admin-confirm — final stage. Completes the case,
     * stamps the elapsed time, and notifies donor + recipient.
     */
    public function adminConfirm(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['notes' => 'nullable|string|max:2000']);
        [$approval, $side] = $this->findScoped($request, $id, true, 'donor');
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

        return response()->json(['data' => $this->present($approval->fresh(), $side, true)]);
    }

    /** POST /api/approvals/{id}/reject — terminal rejection from any open stage. */
    public function reject(Request $request, int $id): JsonResponse
    {
        $min = (int) config('governance.rejection_reason_min', 20);

        $data = $request->validate(['reason' => "required|string|min:{$min}|max:2000"]);
        [$approval, $side] = $this->findScoped($request, $id, true, 'donor');
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

        return response()->json(['data' => $this->present($approval->fresh(), $side, true)]);
    }

    /**
     * GET /api/approvals/metrics — approval time tracking + hospital comparison (7.4).
     *
     * Reads the materialised approval_seconds column, so this is one grouped read
     * rather than a per-case timestamp diff. Median is computed in PHP over the
     * per-hospital duration lists because MySQL has no portable percentile
     * aggregate; the row volume here is approvals, not log lines, so that is cheap.
     *
     * Scoped to the DONOR side, because that is whose process is being measured.
     * Offer-response time is subtracted out: the procuring hospital cannot control
     * how long a counterparty takes to answer, so including it would rank hospitals
     * by their partners' responsiveness rather than their own.
     */
    public function metrics(Request $request): JsonResponse
    {
        $scope = $this->scope($request, false);

        $rows = CaseApproval::where('stage', 'approved')
            ->whereNotNull('approval_seconds')
            ->join('users', 'users.id', '=', 'case_approvals.hospital_id')
            ->get([
                'case_approvals.hospital_id',
                'case_approvals.approval_seconds',
                'case_approvals.offer_seconds',
                'users.name as hospital_name',
            ]);

        $byHospital = [];
        foreach ($rows as $r) {
            $byHospital[$r->hospital_id]['name'] = $r->hospital_name;
            $byHospital[$r->hospital_id]['durations'][] = (int) $r->approval_seconds;
            // What the hospital itself was responsible for.
            $byHospital[$r->hospital_id]['own'][] = max(0, (int) $r->approval_seconds - (int) ($r->offer_seconds ?? 0));
            if ($r->offer_seconds !== null) {
                $byHospital[$r->hospital_id]['offer'][] = (int) $r->offer_seconds;
            }
        }

        $hospitals = [];
        $all = [];
        foreach ($byHospital as $hid => $h) {
            $d = $h['durations'];
            sort($d);
            $own = $h['own'] ?? [];
            sort($own);
            $offer = $h['offer'] ?? [];
            sort($offer);
            $all = array_merge($all, $d);
            $hospitals[] = [
                'hospital_id'      => (int) $hid,
                'hospital_name'    => $h['name'],
                'approved'         => count($d),
                'avg_seconds'      => (int) round(array_sum($d) / count($d)),
                'median_seconds'   => self::median($d),
                'fastest_seconds'  => $d[0],
                'slowest_seconds'  => $d[count($d) - 1],
                // Excludes time spent waiting on the receiving centre.
                'own_avg_seconds'  => $own ? (int) round(array_sum($own) / count($own)) : null,
                'offer_wait_avg'   => $offer ? (int) round(array_sum($offer) / count($offer)) : null,
                'is_you'           => $scope !== null && (int) $hid === $scope,
            ];
        }

        // Ranked on the hospital's OWN time, not wall-clock, for the same reason.
        usort($hospitals, fn ($a, $b) => ($a['own_avg_seconds'] ?? $a['avg_seconds']) <=> ($b['own_avg_seconds'] ?? $b['avg_seconds']));
        foreach ($hospitals as $i => &$h) $h['rank'] = $i + 1;
        unset($h);

        sort($all);

        $mine = $scope !== null ? collect($hospitals)->firstWhere('hospital_id', $scope) : null;

        $pipeline = CaseApproval::when($scope !== null, fn ($q) => $q->where(function ($w) use ($scope) {
            $w->where('hospital_id', $scope)->orWhere('recipient_hospital_id', $scope);
        }))->groupBy('stage')->selectRaw('stage, COUNT(*) as n')->pluck('n', 'stage');

        // Cross-hospital share is a genuine supervision metric and carries no
        // patient, so the supervisor tier sees it too.
        $crossTotal = CaseApproval::whereColumn('recipient_hospital_id', '!=', 'hospital_id')->count();

        return response()->json([
            'network' => [
                'approved'       => count($all),
                'avg_seconds'    => $all ? (int) round(array_sum($all) / count($all)) : null,
                'median_seconds' => self::median($all),
                'hospitals'      => count($hospitals),
                'cross_hospital' => $crossTotal,
                'total_cases'    => CaseApproval::count(),
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
     * Shared gate for both donor-side approval actions: the case must be open, the
     * checklist complete (7.1), the counterparty must have accepted, and the case
     * must be sitting at exactly this stage — which is what makes the workflow
     * sequential rather than parallel (7.2).
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
        // the stage check below compares against the real current stage. For a
        // cross-hospital case this moves it to 'offer' and stamps the clock, which
        // is what puts it in the counterparty's queue.
        if ($approval->stage === 'checklist') {
            $approval->stage = $approval->firstApprovalStage();
            if ($approval->stage === 'offer' && !$approval->offer_sent_at) {
                $approval->offer_sent_at = now();
                $approval->save();
                $this->notifyOfferSent($approval);
            } else {
                $approval->save();
            }
        }

        if ($approval->stage === 'offer') {
            $hospital = optional($approval->recipientHospital)->name ?? 'the receiving hospital';
            return response()->json([
                'message' => "This organ has been offered to {$hospital}, which holds the recipient's record. Sign-off cannot proceed until they accept the offer.",
            ], 422);
        }

        if ($approval->stage !== $stage) {
            $waiting = $approval->stage === 'doctor'
                ? 'clinical sign-off from a doctor'
                : 'final confirmation from the hospital admin';
            return response()->json(['message' => "This case is waiting on {$waiting}."], 422);
        }

        return null;
    }

    /** Tell the receiving hospital an organ is waiting on their answer. */
    private function notifyOfferSent(CaseApproval $approval): void
    {
        $hospital = $approval->recipient_hospital_id ? User::find($approval->recipient_hospital_id) : null;
        if (!$hospital) return;

        $organ = $approval->organ ? strtolower($approval->organ) : 'organ';

        Notifier::notifyAndEmail($hospital, 'offer_received', "Organ offer awaiting your decision ({$organ})",
            "An allocation run at another centre has matched one of your patients to a {$organ}.\n\n"
            . "Your hospital must accept or decline this offer before the procuring hospital can proceed. "
            . "The cold-chain clock is running, so please respond promptly.\n\n"
            . "Open the Approval Board and look for case #{$approval->id} under \"Needs your answer\".",
            ['approval_id' => $approval->id, 'organ' => $approval->organ, 'kind' => 'offer']);
    }

    /** Tell the procuring hospital how the counterparty answered. */
    private function notifyDonorSide(CaseApproval $approval, bool $accepted, ?CaseApproval $reoffered): void
    {
        $hospital = $approval->hospital_id ? User::find($approval->hospital_id) : null;
        if (!$hospital) return;

        $organ = $approval->organ ? strtolower($approval->organ) : 'organ';
        $meta  = ['approval_id' => $approval->id, 'organ' => $approval->organ, 'kind' => 'offer_response'];

        if ($accepted) {
            Notifier::notifyAndEmail($hospital, 'offer_accepted', "Organ offer accepted ({$organ})",
                "The receiving hospital has accepted your {$organ} offer on case #{$approval->id}. "
                . 'The case is now back with your team for clinical sign-off and final confirmation.', $meta);
            return;
        }

        $tail = $reoffered
            ? "The organ has been automatically offered to the next-ranked candidate — case #{$reoffered->id}."
            : 'No further eligible candidate was found in this allocation run. This organ now needs manual attention.';

        Notifier::notifyAndEmail($hospital, 'offer_declined', "Organ offer declined ({$organ})",
            "The receiving hospital declined your {$organ} offer on case #{$approval->id}.\n\n"
            . "Reason given: {$approval->offer_notes}\n\n{$tail}", $meta);
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

            return;
        }

        if ($outcome === 'declined') {
            // Deliberately gentler than a rejection, and accurate: a decline is a
            // clinical judgement about THIS organ for this patient at this moment,
            // not a verdict on their eligibility.
            Notifier::notifyAndEmail($recipient, 'case_declined', 'Update on your transplant case',
                "Your transplant team reviewed a {$organ} offer for you and decided not to proceed with this particular organ.\n\n"
                . "Reason recorded: {$approval->offer_notes}\n\n"
                . 'You remain on the waiting list with your position unchanged, and you remain eligible for future offers. '
                . 'Your team can explain their reasoning if you would like to discuss it.', $meta);

            Notifier::notifyAndEmail($donor, 'case_declined', 'Update on a donation match',
                "The {$organ} match associated with your record was not taken forward by the receiving centre. "
                . 'Where possible the organ is offered to the next suitable patient.', $meta);

            return;
        }

        $reason = $approval->rejection_reason;

        Notifier::notifyAndEmail($recipient, 'case_rejected', 'Update on your transplant case',
            "The hospital approval board did not clear this {$organ} match.\n\nReason given: {$reason}\n\nThis does not remove you from the waiting list — you remain eligible for future matches.", $meta);

        Notifier::notifyAndEmail($donor, 'case_rejected', 'Update on a donation match',
            "The {$organ} match associated with your record was not cleared by the approval board.\n\nReason given: {$reason}", $meta);
    }

    /**
     * A non-identifying handle for a patient the viewer is not entitled to name.
     *
     * Prefers the registry's own unique_id so two hospitals can discuss the same
     * candidate over the phone, and falls back to the primary key, which the caller
     * already holds (it is needed to action the case) and which carries no personal
     * information on its own.
     */
    private static function matchCode(?User $u, string $prefix): ?string
    {
        if (!$u) return null;

        return $u->unique_id ?: "{$prefix}-{$u->id}";
    }

    /**
     * Shape one case for the UI, including the derived gate state.
     *
     * Field visibility is asymmetric, because the two sides need different things
     * and neither needs everything:
     *
     *  - Each side sees ITS OWN patient in full. It already holds that record.
     *  - The procuring hospital sees the candidate as a match code until the offer
     *    is accepted. It needs to know a match exists and where it is, not who the
     *    person is; identity is released once the transplant is actually going
     *    ahead and logistics have to be arranged. Diagnosis and email are never
     *    released across the boundary.
     *  - The receiving hospital never sees donor identity. It needs the organ's
     *    clinical facts to decide, which the checklist carries, not a name.
     *  - Free-text notes do not cross the boundary in either direction. Structured
     *    fields can be minimised; prose is where identity leaks.
     */
    private function present(CaseApproval $a, string $side, bool $full = false): array
    {
        $checklist = $a->checklist ?? [];
        $required  = array_filter($checklist, fn ($i) => $i['required'] ?? false);
        $done      = array_filter($required, fn ($i) => $i['checked'] ?? false);

        $cross        = $a->isCrossHospital();
        $isDonorSide  = $side === 'donor';
        $accepted     = $a->offerAccepted();

        // Stated as what each side is POSITIVELY entitled to, rather than as a set
        // of exclusions. Written the other way round - "withhold unless cross and
        // donor-side" - any side that is neither party (a supervisor reaching this
        // method through some future path) fell through to being shown both names.
        // denyIdentifiableToSupervisor() already blocks that caller, but a
        // disclosure rule should not depend on a guard somewhere else holding.
        $isRecipientSide = $side === 'recipient';

        // Your own patient, always. The counterparty's, only once they have
        // accepted and the transplant is actually going ahead.
        $nameRecipient = $isRecipientSide || ($isDonorSide && (!$cross || $accepted));
        // Donor identity: only the procuring side, ever.
        $nameDonor     = $isDonorSide;

        $recipient = $a->recipient ? [
            'id'        => $a->recipient->id,
            'name'      => $nameRecipient ? $a->recipient->name : null,
            'unique_id' => $a->recipient->unique_id,
            'label'     => $nameRecipient ? $a->recipient->name : self::matchCode($a->recipient, 'REC'),
            'withheld'  => !$nameRecipient,
        ] : null;

        $donor = $a->donor ? [
            'id'        => $a->donor->id,
            'name'      => $nameDonor ? $a->donor->name : null,
            'unique_id' => $nameDonor ? $a->donor->unique_id : null,
            'label'     => $nameDonor ? $a->donor->name : self::matchCode($a->donor, 'DNR'),
            'withheld'  => !$nameDonor,
        ] : null;

        $out = [
            'id'                  => $a->id,
            'decision_id'         => $a->allocation_decision_id,
            'hospital_id'         => (int) $a->hospital_id,
            'hospital_name'       => $a->relationLoaded('hospital') ? optional($a->hospital)->name : null,
            'recipient_hospital_id'   => $a->recipient_hospital_id ? (int) $a->recipient_hospital_id : null,
            'recipient_hospital_name' => $a->relationLoaded('recipientHospital') ? optional($a->recipientHospital)->name : null,
            'is_cross_hospital'   => $cross,
            'side'                => $side,
            'organ'               => $a->organ,
            'stage'               => $a->stage,
            'requires_multi_user' => $a->requires_multi_user,
            'donor'               => $donor,
            'recipient'           => $recipient,
            'checklist_total'     => count($required),
            'checklist_done'      => count($done),
            'checklist_complete'  => $a->checklistComplete(),
            'doctor'              => $isDonorSide ? optional($a->doctor)->name : null,
            'doctor_approved_at'  => optional($a->doctor_approved_at)?->toIso8601String(),
            'admin'               => $isDonorSide ? optional($a->admin)->name : null,
            'admin_confirmed_at'  => optional($a->admin_confirmed_at)?->toIso8601String(),
            'rejected_by'         => $isDonorSide ? optional($a->rejecter)->name : null,
            'rejection_reason'    => $a->rejection_reason,
            'offer_sent_at'       => optional($a->offer_sent_at)?->toIso8601String(),
            'offer_responded_at'  => optional($a->offer_responded_at)?->toIso8601String(),
            'offer_responded_by'  => $side === 'recipient' ? optional($a->offerResponder)->name : null,
            'offer_notes'         => $a->offer_notes,
            'offer_seconds'       => $a->offer_seconds,
            'reoffered_from_id'   => $a->reoffered_from_id,
            'allocated_at'        => optional($a->allocated_at)?->toIso8601String(),
            'approved_at'         => optional($a->approved_at)?->toIso8601String(),
            'approval_seconds'    => $a->approval_seconds,
            // Live elapsed for open cases, so the board can surface what is ageing.
            'elapsed_seconds'     => $a->approval_seconds ?? ($a->allocated_at ? $a->allocated_at->diffInSeconds(now()) : null),
            // What this viewer may actually do, so the UI never offers a button the
            // server will refuse.
            'can_act'             => $isDonorSide && !$a->isTerminal() && $a->stage !== 'offer',
            'can_answer_offer'    => $side === 'recipient' && $a->stage === 'offer',
            'awaiting_offer'      => $a->stage === 'offer',
        ];

        if ($full) {
            $out['checklist'] = $checklist;
            // Prose stays on the side that wrote it.
            $out['doctor_notes'] = $isDonorSide ? $a->doctor_notes : null;
            $out['admin_notes']  = $isDonorSide ? $a->admin_notes : null;
            $out['decision']     = $a->decision ? [
                'selected_rank'   => $a->decision->selected_rank,
                'was_override'    => (bool) $a->decision->was_override,
                // The receiving centre is told THAT the pick was an override - that
                // is material to accepting it - but the procuring hospital's
                // internal justification is not theirs to read.
                'override_reason' => $isDonorSide ? $a->decision->override_reason : null,
            ] : null;
        }

        return $out;
    }
}
