<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Document;
use App\Models\Activity;
use App\Models\DonorProfile;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    /** GET /api/dashboard/summary — ONE consolidated call replacing 6 parallel ones. Cached 30s. */
    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        $cacheKey = "dashboard:summary:{$user->id}:{$user->role}";

        $payload = Cache::remember($cacheKey, 30, function () use ($user) {
            $hospitalScope = $user->isHospital() ? $user->id : ($user->linked_hospital_id ?? null);

            // Reuse existing metrics builder
            $metrics = $this->computeMetrics($user, $hospitalScope);

            // Recent activities — scoped to the user's hospital when applicable so each hospital sees its own audit feed
            $actQuery = Activity::with(['user:id,name,role', 'actor:id,name,role'])->orderByDesc('created_at');
            if ($hospitalScope) {
                $actQuery->where('scope_hospital_id', $hospitalScope);
            }
            $activities = $actQuery->limit(20)->get([
                'id', 'type', 'icon', 'title', 'description',
                'user_id', 'actor_id', 'scope_hospital_id', 'metadata',
                'created_at',
            ]);

            // Recent users — lightweight (no profile data)
            $recentUsersQ = User::orderByDesc('created_at');
            if ($hospitalScope) {
                $recentUsersQ->where(function ($q) use ($hospitalScope) {
                    $q->where('preferred_hospital_id', $hospitalScope)
                      ->orWhere('linked_hospital_id', $hospitalScope);
                });
            }
            $recentUsers = $recentUsersQ->limit(10)
                ->get(['id', 'name', 'email', 'role', 'status', 'created_at']);

            // Approved hospitals — small list
            $approvedHospitals = User::where('role', 'hospital')
                ->where('status', 'approved')
                ->limit(50)
                ->get(['id', 'name', 'email']);

            return [
                'metrics'           => $metrics,
                'recent_activities' => $activities,
                'recent_users'      => $recentUsers,
                'approved_hospitals'=> $approvedHospitals,
                'computed_at'       => now()->toIso8601String(),
            ];
        });

        return response()->json($payload);
    }

    private function computeMetrics(User $user, ?int $hospitalScope): array
    {
        if (in_array($user->role, ['donor', 'recipient'], true)) {
            return [
                'totalUsers' => 0,
                'totalDonors' => User::where('role', 'donor')->count(),
                'totalRecipients' => User::where('role', 'recipient')->count(),
                'totalHospitals' => User::where('role', 'hospital')->where('status', 'approved')->count(),
                'pendingHospitals' => 0,
                'pendingCases' => 0,
                'approvedDonors' => 0,
                'approvedRecipients' => 0,
                'totalDocuments' => 0,
            ];
        }

        $donorQuery = User::where('role', 'donor');
        $recipientQuery = User::where('role', 'recipient');
        if ($hospitalScope) {
            $donorQuery->where('preferred_hospital_id', $hospitalScope);
            $recipientQuery->where('preferred_hospital_id', $hospitalScope);
        }

        return [
            'totalUsers' => User::count(),
            'totalDonors' => $donorQuery->count(),
            'totalRecipients' => $recipientQuery->count(),
            'totalHospitals' => User::where('role', 'hospital')->where('status', 'approved')->count(),
            'pendingHospitals' => User::where('role', 'hospital')->where('status', 'pending')->count(),
            'pendingCases' => (clone $donorQuery)->where('status', 'submitted')->count() + (clone $recipientQuery)->where('status', 'submitted')->count(),
            'approvedDonors' => (clone $donorQuery)->where('status', 'approved')->count(),
            'approvedRecipients' => (clone $recipientQuery)->where('status', 'approved')->count(),
            'totalDocuments' => Document::count(),
        ];
    }
    /** GET /api/dashboard/chart-data — cached 60s */
    public function chartData(Request $request): JsonResponse
    {
        $user = $request->user();
        $hospitalScope = $user->isHospital() ? $user->id : ($user->linked_hospital_id ?? null);
        $cacheKey = "dashboard:chart:{$user->id}:{$hospitalScope}";

        $payload = Cache::remember($cacheKey, 60, function () use ($hospitalScope) {
            return $this->buildChartData($hospitalScope);
        });

        return response()->json($payload);
    }

    private function buildChartData(?int $hospitalScope): array
    {
        $months = [];
        $donorCounts = [];
        $transplantCounts = [];

        for ($i = 5; $i >= 0; $i--) {
            $date = now()->subMonths($i);
            $months[] = $date->format('M Y');
            $start = $date->copy()->startOfMonth();
            $end   = $date->copy()->endOfMonth();

            $donorQ = User::where('role', 'donor')->whereBetween('created_at', [$start, $end]);
            if ($hospitalScope) $donorQ->where('preferred_hospital_id', $hospitalScope);
            $donorCounts[] = $donorQ->count();

            $txQ = User::where('role', 'donor')->where('status', 'approved')->whereBetween('updated_at', [$start, $end]);
            if ($hospitalScope) $txQ->where('preferred_hospital_id', $hospitalScope);
            $transplantCounts[] = $txQ->count();
        }

        $organCounts = ['Kidney' => 0, 'Liver' => 0, 'Heart' => 0, 'Lung' => 0, 'Others' => 0];
        $profileQ = DonorProfile::whereNotNull('pledged_organs');
        if ($hospitalScope) {
            $profileQ->whereHas('user', fn($q) => $q->where('preferred_hospital_id', $hospitalScope));
        }
        foreach ($profileQ->pluck('pledged_organs') as $organs) {
            foreach ((array) $organs as $organ) {
                $key = ucfirst(strtolower(trim($organ)));
                if (isset($organCounts[$key])) {
                    $organCounts[$key]++;
                } else {
                    $organCounts['Others']++;
                }
            }
        }

        return [
            'months'           => $months,
            'donors'           => $donorCounts,
            'transplants'      => $transplantCounts,
            'organDistribution' => $organCounts,
        ];
    }

    /** GET /api/dashboard/metrics */
    public function metrics(Request $request): JsonResponse
    {
        $user = $request->user();

        // Donors and recipients only see their own summary
        if (in_array($user->role, ['donor', 'recipient'], true)) {
            return response()->json([
                'totalUsers' => 0,
                'totalDonors' => User::where('role', 'donor')->count(),
                'totalRecipients' => User::where('role', 'recipient')->count(),
                'totalHospitals' => User::where('role', 'hospital')->where('status', 'approved')->count(),
                'pendingHospitals' => 0,
                'pendingCases' => 0,
                'approvedDonors' => 0,
                'approvedRecipients' => 0,
                'totalDocuments' => 0,
                'recentActivities' => [],
            ]);
        }

        $hospitalScope = $user->isHospital() ? $user->id : ($user->linked_hospital_id ?? null);

        $donorQuery = User::where('role', 'donor');
        $recipientQuery = User::where('role', 'recipient');
        if ($hospitalScope) {
            $donorQuery->where('preferred_hospital_id', $hospitalScope);
            $recipientQuery->where('preferred_hospital_id', $hospitalScope);
        }

        return response()->json([
            'totalUsers' => User::count(),
            'totalDonors' => $donorQuery->count(),
            'totalRecipients' => $recipientQuery->count(),
            'totalHospitals' => User::where('role', 'hospital')->where('status', 'approved')->count(),
            'pendingHospitals' => User::where('role', 'hospital')->where('status', 'pending')->count(),
            'pendingCases' => (clone $donorQuery)->where('status', 'submitted')->count() + (clone $recipientQuery)->where('status', 'submitted')->count(),
            'approvedDonors' => (clone $donorQuery)->where('status', 'approved')->count(),
            'approvedRecipients' => (clone $recipientQuery)->where('status', 'approved')->count(),
            'totalDocuments' => Document::count(),
            'recentActivities' => Activity::orderByDesc('created_at')->limit(10)->get(),
        ]);
    }
}
