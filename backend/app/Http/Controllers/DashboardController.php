<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Document;
use App\Models\Activity;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
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
