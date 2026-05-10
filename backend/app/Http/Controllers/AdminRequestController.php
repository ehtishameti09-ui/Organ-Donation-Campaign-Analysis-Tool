<?php

namespace App\Http\Controllers;

use App\Models\AdminRequest;
use App\Models\User;
use App\Rules\StrongPassword;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminRequestController extends Controller
{
    /** POST /api/admin-requests — hospital submits a request */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'hospital' || $user->status !== 'approved') {
            abort(403, 'Only approved hospitals can request admin accounts.');
        }

        $data = $request->validate([
            'requested_admin_name'  => ['required', 'string', 'max:60'],
            'requested_admin_email' => ['required', 'email', 'max:120'],
            'justification'         => ['nullable', 'string', 'max:1000'],
        ]);

        // Block duplicate pending requests for same email at this hospital
        $existing = AdminRequest::where('hospital_id', $user->id)
            ->where('requested_admin_email', $data['requested_admin_email'])
            ->whereIn('status', ['pending', 'approved'])
            ->first();
        if ($existing) {
            return response()->json([
                'message' => "An active request for {$data['requested_admin_email']} already exists ({$existing->status}).",
            ], 422);
        }

        // Block if email already a registered user
        if (User::where('email', $data['requested_admin_email'])->exists()) {
            return response()->json([
                'message' => 'This email already belongs to a registered user. Choose a different email.',
            ], 422);
        }

        $req = AdminRequest::create([
            'hospital_id'           => $user->id,
            'requested_admin_name'  => $data['requested_admin_name'],
            'requested_admin_email' => $data['requested_admin_email'],
            'justification'         => $data['justification'] ?? null,
            'status'                => 'pending',
        ]);

        ActivityLogger::logActivity(
            'admin_request_submitted',
            'Admin account requested',
            "{$user->name} requested admin account for {$req->requested_admin_email}",
            ['hospital_id' => $user->id, 'admin_request_id' => $req->id]
        );

        return response()->json(['data' => $req], 201);
    }

    /** GET /api/admin-requests — super_admin sees all; hospital sees own */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = AdminRequest::with(['hospital:id,name,email', 'reviewer:id,name', 'createdAdmin:id,name,email'])
            ->orderByDesc('created_at');

        if ($user->role === 'hospital') {
            $query->where('hospital_id', $user->id);
        } elseif ($user->role !== 'super_admin') {
            abort(403, 'Only hospitals or super admins can view admin requests.');
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json(['data' => $query->limit(200)->get()]);
    }

    /** POST /api/admin-requests/{id}/approve — super_admin approves and creates admin */
    public function approve(Request $request, int $id): JsonResponse
    {
        if ($request->user()->role !== 'super_admin') {
            abort(403, 'Only super admin can approve admin requests.');
        }

        $data = $request->validate([
            'password' => ['required', new StrongPassword],
            'review_notes' => ['nullable', 'string', 'max:500'],
        ]);

        $req = AdminRequest::findOrFail($id);
        if ($req->status !== 'pending') {
            return response()->json(['message' => "Request is already {$req->status}."], 422);
        }

        // Double-check email still free
        if (User::where('email', $req->requested_admin_email)->exists()) {
            return response()->json(['message' => 'Email no longer available.'], 422);
        }

        $hospital = User::find($req->hospital_id);
        if (!$hospital || $hospital->status !== 'approved') {
            return response()->json(['message' => 'Hospital is no longer approved — cannot create admin.'], 422);
        }

        [$admin, $req] = DB::transaction(function () use ($req, $data, $request, $hospital) {
            $admin = User::create([
                'name'                  => $req->requested_admin_name,
                'email'                 => $req->requested_admin_email,
                'password'              => $data['password'],
                'role'                  => 'admin',
                'status'                => 'approved',
                'email_verified_at'     => now(),
                'registration_complete' => true,
                'linked_hospital_id'    => $hospital->id,
            ]);
            $admin->assignRole('admin');

            $req->update([
                'status'           => 'approved',
                'reviewed_by'      => $request->user()->id,
                'reviewed_at'      => now(),
                'review_notes'     => $data['review_notes'] ?? null,
                'created_admin_id' => $admin->id,
            ]);
            return [$admin, $req];
        });

        ActivityLogger::logActivity(
            'admin_request_approved',
            'Admin request approved',
            "Admin account created for {$admin->email} (hospital: {$hospital->name})",
            ['admin_request_id' => $req->id, 'admin_id' => $admin->id, 'hospital_id' => $hospital->id]
        );

        return response()->json([
            'message' => 'Admin account created.',
            'data'    => $req->load(['hospital:id,name', 'reviewer:id,name', 'createdAdmin:id,name,email']),
        ]);
    }

    /** POST /api/admin-requests/{id}/reject */
    public function reject(Request $request, int $id): JsonResponse
    {
        if ($request->user()->role !== 'super_admin') {
            abort(403, 'Only super admin can reject admin requests.');
        }

        $data = $request->validate([
            'review_notes' => ['required', 'string', 'min:10', 'max:500'],
        ]);

        $req = AdminRequest::findOrFail($id);
        if ($req->status !== 'pending') {
            return response()->json(['message' => "Request is already {$req->status}."], 422);
        }

        $req->update([
            'status'       => 'rejected',
            'reviewed_by'  => $request->user()->id,
            'reviewed_at'  => now(),
            'review_notes' => $data['review_notes'],
        ]);

        ActivityLogger::logActivity(
            'admin_request_rejected',
            'Admin request rejected',
            "Request for {$req->requested_admin_email} was rejected",
            ['admin_request_id' => $req->id]
        );

        return response()->json(['data' => $req->load(['hospital:id,name', 'reviewer:id,name'])]);
    }

    /** DELETE /api/admin-requests/{id} — hospital cancels their own pending request */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $req = AdminRequest::findOrFail($id);

        if ($user->role !== 'hospital' || $req->hospital_id !== $user->id) {
            abort(403, 'You can only cancel your own admin requests.');
        }
        if ($req->status !== 'pending') {
            return response()->json(['message' => "Cannot cancel — request is already {$req->status}."], 422);
        }

        $req->update(['status' => 'cancelled']);
        return response()->json(['data' => $req]);
    }
}
