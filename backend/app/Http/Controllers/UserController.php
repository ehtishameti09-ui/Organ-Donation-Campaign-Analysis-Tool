<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Auth\AuthController;
use App\Models\User;
use App\Models\Notification;
use App\Rules\StrongPassword;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /** GET /api/users — list users (scoped by role) */
    public function index(Request $request): JsonResponse
    {
        $authUser = $request->user();
        $query = User::query()->with(['hospitalProfile', 'donorProfile', 'recipientProfile', 'clinicalProfile']);

        // Role-based scoping
        if ($authUser->isHospital()) {
            // Hospitals see only donors/recipients linked to them
            $query->where(function ($q) use ($authUser) {
                $q->where('preferred_hospital_id', $authUser->id)
                  ->orWhere('linked_hospital_id', $authUser->id);
            });
        } elseif ($authUser->role === 'admin' && $authUser->linked_hospital_id) {
            // Admin linked to a specific hospital
            $query->where(function ($q) use ($authUser) {
                $q->where('preferred_hospital_id', $authUser->linked_hospital_id)
                  ->orWhere('linked_hospital_id', $authUser->linked_hospital_id);
            });
        } elseif ($authUser->isSuperAdmin()) {
            // Super admin → only hospital registrations
            if ($request->boolean('hospitals_only', false) || !$request->filled('role')) {
                $query->where('role', 'hospital');
            }
        }

        // Filters
        if ($role = $request->query('role')) {
            $query->where('role', $role);
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->orderByDesc('created_at')->paginate($request->integer('per_page', 25));
        $resource = app(AuthController::class);
        $users->getCollection()->transform(fn ($u) => $resource->userResource($u));
        return response()->json($users);
    }

    /** POST /api/users/admin — create a new admin user (super admin only) */
    public function createAdmin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'email' => ['required', 'email', Rule::unique('users', 'email')],
            'password' => ['required', new StrongPassword],
            'phone' => ['nullable', 'string', 'max:30'],
            'linked_hospital_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'phone' => $data['phone'] ?? null,
            'role' => 'admin',
            'status' => 'approved',
            'email_verified_at' => now(),
            'registration_complete' => true,
            'linked_hospital_id' => $data['linked_hospital_id'] ?? null,
        ]);
        $user->assignRole('admin');

        ActivityLogger::logActivity('admin_added', 'Admin added', $user->name.' was added as admin', [
            'user_id' => $user->id, 'actor_id' => $request->user()->id,
        ]);
        ActivityLogger::logAction($user->id, 'admin_created', 'New admin account created');

        return response()->json([
            'message' => 'Admin created.',
            'user' => app(AuthController::class)->userResource($user),
        ], 201);
    }

    /** GET /api/users/{user} */
    public function show(User $user): JsonResponse
    {
        $user->load(['hospitalProfile', 'donorProfile', 'recipientProfile', 'clinicalProfile', 'documents', 'consentForm']);
        return response()->json(['user' => app(AuthController::class)->userResource($user)]);
    }

    /** PATCH /api/users/{user} — update user fields */
    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'status' => ['sometimes', Rule::in(['pending', 'approved', 'info_requested', 'registered', 'submitted', 'rejected', 'banned', 'warned'])],
            'role' => ['sometimes', Rule::in(['super_admin', 'admin', 'hospital', 'doctor', 'data_entry', 'auditor', 'donor', 'recipient'])],
            'linked_hospital_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'department' => ['sometimes', 'nullable', 'string', 'max:100'],
            'specialization' => ['sometimes', 'nullable', 'string', 'max:100'],
            'email_notifications' => ['sometimes', 'boolean'],
            'app_notifications' => ['sometimes', 'boolean'],
            'status_updates' => ['sometimes', 'boolean'],
            'opportunity_alerts' => ['sometimes', 'boolean'],
        ]);

        $user->update($data);
        ActivityLogger::logAction($user->id, 'user_updated', 'User profile updated', $data, $request->user()->id);

        return response()->json([
            'message' => 'Updated.',
            'user' => app(AuthController::class)->userResource($user->fresh()),
        ]);
    }

    /** DELETE /api/users/{user} — soft-delete user */
    public function destroy(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:10'],
            'category' => ['required', 'string'],
        ]);

        if ($user->isSuperAdmin()) {
            return response()->json(['message' => 'Cannot delete super admin.'], 403);
        }

        $user->update([
            'is_deleted' => true,
            'status' => 'deleted',
            'deletion_details' => [
                'category' => $data['category'],
                'reason' => $data['reason'],
                'admin_id' => $request->user()->id,
                'deletion_date' => now()->toIso8601String(),
                'recovery_deadline' => now()->addDays(30)->toIso8601String(),
            ],
            'recovery_deadline' => now()->addDays(30),
        ]);
        $user->tokens()->delete();

        ActivityLogger::logAction($user->id, 'delete', $data['reason'], $data, $request->user()->id);
        ActivityLogger::logActivity('user_deleted', 'User deleted', $user->name.' was deleted', [
            'user_id' => $user->id, 'actor_id' => $request->user()->id,
        ]);
        Notification::create([
            'user_id' => $user->id, 'type' => 'delete',
            'title' => 'Account marked for deletion',
            'message' => 'Your account has been deleted. You can recover within 30 days.',
            'data' => $data,
        ]);

        return response()->json(['message' => 'User deleted (soft).']);
    }

    /** POST /api/users/{user}/ban */
    public function ban(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'category' => ['required', 'string'],
            'category_label' => ['nullable', 'string'],
            'detailed_reason' => ['required', 'string', 'min:10'],
            'ban_type' => ['required', Rule::in(['warning', 'temporary', 'permanent'])],
            'duration' => ['nullable', 'integer', 'min:1'], // days for temporary
        ]);

        if ($user->isSuperAdmin()) {
            return response()->json(['message' => 'Cannot ban super admin.'], 403);
        }

        $expiry = $data['ban_type'] === 'temporary' && !empty($data['duration'])
            ? now()->addDays((int)$data['duration'])
            : null;

        $user->update([
            'banned' => $data['ban_type'] !== 'warning',
            'status' => $data['ban_type'] === 'warning' ? 'warned' : 'banned',
            'ban_details' => array_merge($data, [
                'ban_date' => now()->toIso8601String(),
                'admin_id' => $request->user()->id,
                'expiry_date' => optional($expiry)->toIso8601String(),
            ]),
        ]);
        $user->tokens()->delete();

        ActivityLogger::logAction($user->id, 'ban', $data['detailed_reason'], $data, $request->user()->id);
        Notification::create([
            'user_id' => $user->id, 'type' => 'ban',
            'title' => 'Account '.($data['ban_type'] === 'warning' ? 'warned' : 'banned'),
            'message' => $data['detailed_reason'],
            'data' => $data,
        ]);

        return response()->json([
            'message' => 'User '.($data['ban_type'] === 'warning' ? 'warned' : 'banned').'.',
            'user' => app(AuthController::class)->userResource($user->fresh()),
        ]);
    }

    /** POST /api/users/{user}/unban */
    public function unban(Request $request, User $user): JsonResponse
    {
        $user->update(['banned' => false, 'status' => 'approved', 'ban_details' => null]);
        ActivityLogger::logAction($user->id, 'ban_reversed', 'Ban reversed by admin', [], $request->user()->id);
        Notification::create([
            'user_id' => $user->id, 'type' => 'info',
            'title' => 'Account restored',
            'message' => 'Your account has been restored. You can log in normally.',
        ]);
        return response()->json(['message' => 'User unbanned.']);
    }

    /** POST /api/users/me/restore — restore self-deleted account during recovery window */
    public function restoreSelf(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->is_deleted) {
            return response()->json(['message' => 'Account is not deleted.'], 422);
        }
        if ($user->recovery_deadline && $user->recovery_deadline->isPast()) {
            return response()->json(['message' => 'Recovery window expired.'], 410);
        }
        $user->update([
            'is_deleted' => false, 'status' => 'approved',
            'deletion_details' => null, 'recovery_deadline' => null,
        ]);
        ActivityLogger::logAction($user->id, 'account_restored', 'User restored their deleted account');
        return response()->json(['message' => 'Account restored.', 'user' => app(AuthController::class)->userResource($user)]);
    }

    /** POST /api/users/me/delete — self-delete with 30-day recovery */
    public function deleteSelf(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:10'],
            'confirmation' => ['required', 'in:DELETE'],
        ]);
        $user = $request->user();
        $user->update([
            'is_deleted' => true,
            'status' => 'deleted',
            'recovery_deadline' => now()->addDays(30),
            'deletion_details' => [
                'reason' => $data['reason'],
                'is_self_delete' => true,
                'deletion_date' => now()->toIso8601String(),
                'recovery_deadline' => now()->addDays(30)->toIso8601String(),
            ],
        ]);
        ActivityLogger::logAction($user->id, 'user_self_deleted', $data['reason']);
        return response()->json(['message' => 'Account marked for deletion. You have 30 days to restore.']);
    }

    /** POST /api/me/password-change */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', new StrongPassword],
        ]);
        $user = $request->user();
        $user->update(['password' => $data['password']]);
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();
        ActivityLogger::logAction($user->id, 'password_changed', 'Password changed by user');
        return response()->json(['message' => 'Password changed. Other sessions logged out.']);
    }
}
