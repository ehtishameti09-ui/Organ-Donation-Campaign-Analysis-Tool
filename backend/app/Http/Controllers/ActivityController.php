<?php

namespace App\Http\Controllers;

use App\Models\ActionLog;
use App\Models\Activity;
use App\Models\User;
use App\Support\UserAgentParser;
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

    /**
     * GET /api/audit-logs — the audit trail, scoped to the caller's role per the
     * permission hierarchy:
     *   - super_admin / auditor / system admin .. everything
     *   - hospital / hospital-linked admin ...... that hospital's staff only
     *   - everyone else ......................... forbidden (use /me/action-logs)
     *
     * Supports: q (search), action_type, date_from, date_to, limit.
     */
    public function auditLogs(Request $request): JsonResponse
    {
        $user = $request->user();

        $scope = $this->resolveScope($user);
        if ($scope === 'none') {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $query = ActionLog::query()->with(['user:id,name,email', 'admin:id,name']);

        if ($scope === 'hospital') {
            $hospitalId = $user->isHospital() ? $user->id : $user->linked_hospital_id;
            $query->whereIn('user_id', $this->hospitalUserIds($hospitalId));
        }

        // --- Filters ---
        if ($userId = $request->query('user_id')) {
            $query->where('user_id', $userId);
        }
        if ($action = $request->query('action_type')) {
            $query->where('action_type', $action);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('created_at', '<=', $to);
        }
        if ($q = trim((string) $request->query('q', ''))) {
            $query->where(function ($w) use ($q) {
                $w->where('action_type', 'like', "%{$q}%")
                  ->orWhere('reason', 'like', "%{$q}%")
                  ->orWhere('ip_address', 'like', "%{$q}%")
                  ->orWhere('user_agent', 'like', "%{$q}%")
                  ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$q}%")->orWhere('email', 'like', "%{$q}%"));
            });
        }

        $logs = $query->orderByDesc('created_at')
            ->limit($request->integer('limit', 200))
            ->get()
            ->map(fn ($log) => $this->presentLog($log));

        return response()->json([
            'logs' => $logs,
            'scope' => $scope,
            'immutable' => true,
        ]);
    }

    /**
     * GET /api/security/alerts — recent suspicious logins for the real-time
     * security panel. Same role scoping as the audit trail.
     */
    public function securityAlerts(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $this->resolveScope($user);
        if ($scope === 'none') {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $query = ActionLog::query()
            ->with(['user:id,name,email'])
            ->where('action_type', 'login_suspicious')
            ->where('created_at', '>=', now()->subDays(7));

        if ($scope === 'hospital') {
            $hospitalId = $user->isHospital() ? $user->id : $user->linked_hospital_id;
            $query->whereIn('user_id', $this->hospitalUserIds($hospitalId));
        }

        $alerts = $query->orderByDesc('created_at')->limit(50)->get()
            ->map(fn ($log) => $this->presentLog($log));

        return response()->json(['alerts' => $alerts, 'count' => $alerts->count()]);
    }

    /** GET /api/me/action-logs — own logs */
    public function myLogs(Request $request): JsonResponse
    {
        $logs = ActionLog::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')->limit(100)->get()
            ->map(fn ($log) => $this->presentLog($log));
        return response()->json(['logs' => $logs, 'immutable' => true]);
    }

    // ---- helpers ------------------------------------------------------------

    /** 'all' | 'hospital' | 'none' */
    private function resolveScope(User $user): string
    {
        if ($user->role === 'super_admin' || $user->role === 'auditor') {
            return 'all';
        }
        if ($user->role === 'admin') {
            return $user->linked_hospital_id ? 'hospital' : 'all';
        }
        if ($user->isHospital()) {
            return 'hospital';
        }
        return 'none';
    }

    /** All user ids that belong to a given hospital (staff, donors, recipients, the hospital itself). */
    private function hospitalUserIds(?int $hospitalId): array
    {
        if (!$hospitalId) return [-1];
        return User::where('id', $hospitalId)
            ->orWhere('preferred_hospital_id', $hospitalId)
            ->orWhere('linked_hospital_id', $hospitalId)
            ->pluck('id')
            ->all();
    }

    /** Attach parsed device/browser + suspicious flag to a log row. */
    private function presentLog(ActionLog $log): array
    {
        $details = $log->action_details ?? [];
        $suspicious = ($log->action_type === 'login_suspicious')
            || (bool) ($details['suspicious'] ?? false);

        return array_merge($log->toArray(), [
            'browser' => UserAgentParser::browser($log->user_agent),
            'platform' => UserAgentParser::platform($log->user_agent),
            'device_type' => UserAgentParser::deviceType($log->user_agent),
            'device' => $details['device'] ?? UserAgentParser::describe($log->user_agent),
            'suspicious' => $suspicious,
        ]);
    }
}
