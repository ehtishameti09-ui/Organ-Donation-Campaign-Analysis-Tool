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

    /** POST /api/appeals — submit a ban/delete appeal */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'explanation' => ['required', 'string', 'min:20'],
            'evidence' => ['nullable', 'array'],
            'original_action' => ['required', Rule::in(['ban', 'delete'])],
        ]);

        $target = User::findOrFail($data['user_id']);
        if ($target->id !== ($request->user()?->id ?? 0)) {
            // Allow unauthenticated submission only with explicit user_id check (e.g., via banned modal)
            // But require correct identification — for safety, require auth
            if (!$request->user()) abort(401);
        }

        $appeal = Appeal::create([
            'user_id' => $target->id,
            'explanation' => $data['explanation'],
            'evidence' => $data['evidence'] ?? null,
            'original_action' => $data['original_action'],
            'original_category' => optional($target->ban_details)['category'] ?? null,
            'original_reason' => optional($target->ban_details)['detailed_reason'] ?? null,
            'original_admin_id' => optional($target->ban_details)['admin_id'] ?? null,
            'submitted_date' => now(),
            'admin_response_deadline' => now()->addDays(7),
            'status' => 'pending',
        ]);

        ActivityLogger::logAction($target->id, 'appeal_submitted', 'User submitted appeal', ['appeal_id' => $appeal->id]);

        // Notify all admins
        $adminIds = User::whereIn('role', ['admin', 'super_admin'])->pluck('id');
        foreach ($adminIds as $adminId) {
            Notification::create([
                'user_id' => $adminId, 'type' => 'appeal_status',
                'title' => 'New appeal submitted', 'message' => $target->name.' has submitted an appeal.',
                'data' => ['appeal_id' => $appeal->id, 'user_id' => $target->id],
            ]);
        }

        return response()->json(['message' => 'Appeal submitted.', 'appeal' => $appeal], 201);
    }

    /** POST /api/appeals/{appeal}/review */
    public function review(Request $request, Appeal $appeal): JsonResponse
    {
        $admin = $request->user();
        $data = $request->validate([
            'decision' => ['required', Rule::in(['uphold', 'reverse', 'modify'])],
            'notes' => ['required', 'string'],
        ]);

        // Conflict-of-interest: cannot review own ban
        if ($appeal->original_admin_id && $appeal->original_admin_id === $admin->id) {
            return response()->json(['message' => 'Conflict of interest. Another admin must review this appeal.'], 403);
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
