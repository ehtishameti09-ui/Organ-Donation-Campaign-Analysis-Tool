<?php

namespace App\Http\Controllers;

use App\Models\Appeal;
use App\Models\CaseAppeal;
use App\Models\Notification;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class AppealController extends Controller
{
    /** GET /api/appeals — list appeals (admin sees all, users see own) */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Appeal::query()->with('user');
        if (!$user->isAdmin()) $query->where('user_id', $user->id);
        if ($status = $request->query('status')) $query->where('status', $status);
        return response()->json(['appeals' => $query->orderByDesc('created_at')->get()]);
    }

    /** POST /api/appeals — submit a ban/delete appeal (no auth needed: banned/deleted users
     *  cannot log in, so they submit from the login modal). We protect against spam by
     *  requiring the target user to actually be banned or soft-deleted. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id'         => ['required', 'integer', 'exists:users,id'],
            'explanation'     => ['required', 'string', 'min:20'],
            'evidence'        => ['nullable', 'array'],
            'original_action' => ['required', Rule::in(['ban', 'delete'])],
        ]);

        $target = User::findOrFail($data['user_id']);

        // Verify the user is in a state that warrants an appeal
        if ($data['original_action'] === 'ban' && !$target->banned) {
            return response()->json(['message' => 'This account is not currently banned.'], 422);
        }
        if ($data['original_action'] === 'delete' && !$target->is_deleted) {
            return response()->json(['message' => 'This account is not currently deleted.'], 422);
        }

        // Block duplicate pending appeals
        $existing = Appeal::where('user_id', $target->id)
            ->where('original_action', $data['original_action'])
            ->where('status', 'pending')
            ->exists();
        if ($existing) {
            return response()->json(['message' => 'You already have a pending appeal under review.'], 409);
        }

        // Source the original admin + reason from whichever details apply to this action
        $sourceDetails = $data['original_action'] === 'ban' ? ($target->ban_details ?? []) : ($target->deletion_details ?? []);

        $appeal = Appeal::create([
            'user_id'                => $target->id,
            'explanation'            => $data['explanation'],
            'evidence'               => $data['evidence'] ?? null,
            'original_action'        => $data['original_action'],
            'original_category'      => $sourceDetails['category'] ?? null,
            'original_reason'        => $sourceDetails['detailed_reason'] ?? $sourceDetails['reason'] ?? null,
            'original_admin_id'      => $sourceDetails['admin_id'] ?? null,
            'submitted_date'         => now(),
            'admin_response_deadline' => now()->addDays(7),
            'status'                 => 'pending',
        ]);

        ActivityLogger::logAction($target->id, 'appeal_submitted', 'User submitted '.$data['original_action'].' appeal', ['appeal_id' => $appeal->id]);

        // Route the notification to admins of the same hospital, EXCLUDING the admin who took
        // the original action (conflict of interest). Super admins are always notified as a
        // fallback so appeals never go unseen.
        $hospitalScope = $target->linked_hospital_id ?? $target->preferred_hospital_id;
        $reviewerQuery = User::whereIn('role', ['admin', 'super_admin'])->whereNull('deleted_at');
        $reviewerQuery->where(function ($q) use ($hospitalScope) {
            $q->where('role', 'super_admin');
            if ($hospitalScope) {
                $q->orWhere(function ($q2) use ($hospitalScope) {
                    $q2->where('role', 'admin')->where('linked_hospital_id', $hospitalScope);
                });
            }
        });
        if (!empty($sourceDetails['admin_id'])) {
            $reviewerQuery->where('id', '!=', $sourceDetails['admin_id']);
        }
        $reviewerIds = $reviewerQuery->pluck('id');
        foreach ($reviewerIds as $adminId) {
            Notification::create([
                'user_id' => $adminId, 'type' => 'appeal_status',
                'title'   => 'New '.$data['original_action'].' appeal',
                'message' => $target->name.' has submitted an appeal for review.',
                'data'    => ['appeal_id' => $appeal->id, 'user_id' => $target->id, 'original_action' => $data['original_action']],
            ]);
        }

        return response()->json(['message' => 'Appeal submitted. Another administrator will review it within 7 days.', 'appeal' => $appeal], 201);
    }

    /** POST /api/appeals/{appeal}/review */
    public function review(Request $request, Appeal $appeal): JsonResponse
    {
        $admin = $request->user();
        $data = $request->validate([
            'decision' => ['required', Rule::in(['uphold', 'reverse', 'modify'])],
            'notes' => ['required', 'string'],
        ]);

        if (!$admin->isAdmin()) {
            return response()->json(['message' => 'Only administrators can review appeals.'], 403);
        }
        // Conflict-of-interest: cannot review your own ban/delete
        if ($appeal->original_admin_id && $appeal->original_admin_id === $admin->id) {
            return response()->json(['message' => 'Conflict of interest — another admin must review this appeal.'], 403);
        }
        // Hospital-scope: hospital-linked admins can only review appeals for users tied to
        // their own hospital. Super admins can review anything.
        if ($admin->role === 'admin' && $admin->linked_hospital_id) {
            $targetHospital = $appeal->user->linked_hospital_id ?? $appeal->user->preferred_hospital_id;
            if ($targetHospital !== $admin->linked_hospital_id) {
                return response()->json(['message' => 'This appeal is for a user from another hospital.'], 403);
            }
        }

        $statusMap = ['uphold' => 'denied', 'reverse' => 'approved', 'modify' => 'modified'];
        $appeal->update([
            'status' => $statusMap[$data['decision']],
            'decision' => $data['decision'],
            'review_admin_id' => $admin->id,
            'review_notes' => $data['notes'],
            'review_date' => now(),
        ]);

        if ($data['decision'] === 'reverse') {
            // Lift the ban / restore deletion
            $user = $appeal->user;
            if ($appeal->original_action === 'ban') {
                $user->update(['banned' => false, 'status' => 'approved', 'ban_details' => null]);
            } else {
                $user->update(['is_deleted' => false, 'status' => 'approved', 'deletion_details' => null, 'recovery_deadline' => null]);
            }
        }

        Notification::create([
            'user_id' => $appeal->user_id, 'type' => 'appeal_status',
            'title' => 'Appeal '.$statusMap[$data['decision']],
            'message' => $data['notes'],
        ]);
        ActivityLogger::logAction($appeal->user_id, 'appeal_reviewed', $data['notes'], ['decision' => $data['decision']], $admin->id);

        return response()->json(['message' => 'Appeal reviewed.', 'appeal' => $appeal->fresh()]);
    }

    // Hospital case appeals
    public function caseAppealsIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = CaseAppeal::query()->with('user');
        if ($user->isHospital()) $query->where('hospital_id', $user->id);
        elseif (!$user->isAdmin()) $query->where('user_id', $user->id);
        if ($status = $request->query('status')) $query->where('status', $status);
        return response()->json(['case_appeals' => $query->orderByDesc('created_at')->get()]);
    }

    public function submitCaseAppeal(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'hospital_id' => ['required', 'integer', 'exists:users,id'],
            'appeal_text' => ['required', 'string', 'min:20'],
        ]);
        $appeal = CaseAppeal::create([
            'user_id' => $user->id,
            'hospital_id' => $data['hospital_id'],
            'appeal_text' => $data['appeal_text'],
            'submitted_at' => now(),
            'status' => 'pending',
        ]);
        Notification::create([
            'user_id' => $data['hospital_id'], 'type' => 'info',
            'title' => 'New case appeal',
            'message' => $user->name.' has appealed your rejection.',
            'data' => ['case_appeal_id' => $appeal->id],
        ]);
        return response()->json(['message' => 'Case appeal submitted.', 'appeal' => $appeal], 201);
    }

    public function reviewCaseAppeal(Request $request, CaseAppeal $caseAppeal): JsonResponse
    {
        $user = $request->user();
        if (!$user->isHospital() && !$user->isAdmin()) abort(403);
        $data = $request->validate([
            'decision' => ['required', Rule::in(['reopened', 'rejected_final'])],
            'notes' => ['nullable', 'string'],
        ]);

        $caseAppeal->update([
            'status' => $data['decision'],
            'reviewed_by' => $user->id,
            'review_notes' => $data['notes'] ?? null,
            'reviewed_at' => now(),
        ]);

        if ($data['decision'] === 'reopened') {
            $caseUser = $caseAppeal->user;
            $caseUser->update(['status' => 'submitted']);
            if ($caseUser->donorProfile) $caseUser->donorProfile()->update(['case_status' => 'submitted', 'verification_status' => 'submitted']);
            if ($caseUser->recipientProfile) $caseUser->recipientProfile()->update(['case_status' => 'submitted', 'verification_status' => 'submitted']);
        }
        Notification::create([
            'user_id' => $caseAppeal->user_id, 'type' => 'appeal_status',
            'title' => 'Case appeal '.$data['decision'],
            'message' => $data['notes'] ?? '',
        ]);
        return response()->json(['message' => 'Case appeal reviewed.']);
    }
}
