<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Auth\AuthController;
use App\Models\HospitalProfile;
use App\Models\Notification;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class HospitalController extends Controller
{
    /** GET /api/hospitals — list all approved hospitals (used for selection dropdowns) */
    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status', 'approved');
        $hospitals = User::where('role', 'hospital')
            ->where('status', $status)
            ->with('hospitalProfile')
            ->orderBy('name')
            ->get();
        return response()->json([
            'hospitals' => $hospitals->map(fn ($h) => app(AuthController::class)->userResource($h)),
        ]);
    }

    /** GET /api/hospitals/pending — list pending + info_requested + rejected hospitals for admin review */
    public function pending(Request $request): JsonResponse
    {
        $statusFilter = $request->query('status'); // optional: 'pending','info_requested','rejected'

        $query = User::where('role', 'hospital')
            ->with('hospitalProfile');

        if ($statusFilter) {
            $query->where('status', $statusFilter);
        } else {
            $query->whereIn('status', ['pending', 'info_requested', 'rejected']);
        }

        $hospitals = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'hospitals' => $hospitals->map(fn ($h) => app(AuthController::class)->userResource($h)),
        ]);
    }

    /** POST /api/hospitals/{hospital}/approve */
    public function approve(Request $request, User $hospital): JsonResponse
    {
        if ($hospital->role !== 'hospital') {
            return response()->json(['message' => 'Not a hospital user.'], 422);
        }

        $data = $request->validate(['feedback' => ['nullable', 'string', 'max:1000']]);

        $hospital->update(['status' => 'approved']);
        HospitalProfile::where('user_id', $hospital->id)->update([
            'admin_feedback' => $data['feedback'] ?? null,
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'rejection_reason' => null,
            'admin_message' => null,
        ]);

        Notification::create([
            'user_id' => $hospital->id, 'type' => 'info',
            'title' => 'Hospital approved',
            'message' => 'Your hospital registration has been approved. You can now manage donors and recipients.',
            'data' => $data,
        ]);
        ActivityLogger::logActivity('hospital_approved', 'Hospital approved', $hospital->name.' was approved', [
            'user_id' => $hospital->id, 'actor_id' => $request->user()->id,
        ]);
        ActivityLogger::logAction($hospital->id, 'hospital_approved', 'Hospital approved by super admin', $data, $request->user()->id);

        return response()->json(['message' => 'Hospital approved.', 'hospital' => app(AuthController::class)->userResource($hospital->fresh()->load('hospitalProfile'))]);
    }

    /** POST /api/hospitals/{hospital}/reject */
    public function reject(Request $request, User $hospital): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5']]);
        $hospital->update(['status' => 'rejected']);
        HospitalProfile::where('user_id', $hospital->id)->update([
            'rejection_reason' => $data['reason'],
            'rejected_by' => $request->user()->id,
            'rejected_at' => now(),
        ]);

        Notification::create([
            'user_id' => $hospital->id, 'type' => 'info',
            'title' => 'Hospital registration rejected',
            'message' => $data['reason'],
        ]);
        ActivityLogger::logActivity('hospital_rejected', 'Hospital rejected', $hospital->name.': '.$data['reason'], [
            'user_id' => $hospital->id, 'actor_id' => $request->user()->id,
        ]);
        ActivityLogger::logAction($hospital->id, 'hospital_rejected', $data['reason'], [], $request->user()->id);

        return response()->json(['message' => 'Hospital rejected.']);
    }

    /** POST /api/hospitals/{hospital}/request-info */
    public function requestInfo(Request $request, User $hospital): JsonResponse
    {
        $data = $request->validate(['message' => ['required', 'string', 'min:5']]);
        $hospital->update(['status' => 'info_requested']);
        HospitalProfile::where('user_id', $hospital->id)->update(['admin_message' => $data['message']]);

        Notification::create([
            'user_id' => $hospital->id, 'type' => 'info',
            'title' => 'Additional information requested',
            'message' => $data['message'],
        ]);
        ActivityLogger::logActivity('hospital_info_requested', 'Hospital info requested', $hospital->name, [
            'user_id' => $hospital->id, 'actor_id' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Info request sent to hospital.']);
    }
}
