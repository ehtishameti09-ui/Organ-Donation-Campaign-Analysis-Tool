<?php

namespace App\Http\Controllers;

use App\Models\ActionLog;
use App\Models\Activity;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ActivityController extends Controller
{
    /** GET /api/activities — activity feed scoped per role */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Activity::query()->with(['user:id,name,email', 'actor:id,name']);

        if ($user->isHospital()) {
            $query->where('scope_hospital_id', $user->id);
        } elseif ($user->role === 'admin' && $user->linked_hospital_id) {
            $query->where('scope_hospital_id', $user->linked_hospital_id);
        } elseif (!$user->isAdmin()) {
            $query->where('user_id', $user->id);
        }

        $items = $query->orderByDesc('created_at')->limit($request->integer('limit', 50))->get();
        return response()->json(['activities' => $items]);
    }

    /** GET /api/audit-logs — admin & auditor only */
    public function auditLogs(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->isAdmin() && $user->role !== 'auditor') {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        $query = ActionLog::query()->with(['user:id,name,email', 'admin:id,name']);
        if ($userId = $request->query('user_id')) $query->where('user_id', $userId);
        if ($action = $request->query('action_type')) $query->where('action_type', $action);
        $logs = $query->orderByDesc('created_at')->limit($request->integer('limit', 100))->get();
        return response()->json(['logs' => $logs]);
    }

    /** GET /api/me/action-logs — own logs */
    public function myLogs(Request $request): JsonResponse
    {
        $logs = ActionLog::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')->limit(100)->get();
        return response()->json(['logs' => $logs]);
    }
}
