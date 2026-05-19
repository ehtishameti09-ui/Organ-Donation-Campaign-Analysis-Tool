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

    /** POST /api/users/admin — create an unlinked admin (super admin only).
     *  Hospital-linked admins can ONLY be created via the admin-request approval flow. */
    public function createAdmin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'email' => ['required', 'email', Rule::unique('users', 'email')],
            'password' => ['required', new StrongPassword],
            'phone' => ['nullable', 'string', 'max:30'],
            'linked_hospital_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        // Bias prevention: super_admin cannot unilaterally create hospital-linked admins.
        // Those must come through the admin-request approval flow initiated by the hospital itself.
        if (!empty($data['linked_hospital_id'])) {
            return response()->json([
                'message' => 'Hospital-linked admin accounts can only be created by approving an admin request submitted by that hospital. Use the Admin Requests page.',
            ], 403);
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'phone' => $data['phone'] ?? null,
            'role' => 'admin',
            'status' => 'approved',
            'email_verified_at' => now(),
            'registration_complete' => true,
            'linked_hospital_id' => null,
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

    /** POST /api/users/create-employee — hospital + linked admin can create employees (doctor/data_entry/auditor) directly.
     *  Every action is logged immutably with actor, target, hospital scope, and timestamp. */
    public function createEmployee(Request $request): JsonResponse
    {
        $actor = $request->user();

        // Permission gate: only hospital users + admins linked to a hospital can create employees
        $allowedRoles = ['hospital', 'admin'];
        if (!in_array($actor->role, $allowedRoles, true)) {
            return response()->json(['message' => 'Only hospital admins can create employees.'], 403);
        }
        if ($actor->role === 'admin' && empty($actor->linked_hospital_id)) {
            return response()->json(['message' => 'Only hospital-linked admins can create employees.'], 403);
        }

        // Resolve the hospital scope
        $hospitalId = $actor->role === 'hospital' ? $actor->id : (int) $actor->linked_hospital_id;

        $data = $request->validate([
            'name'           => ['required', 'string', 'max:60'],
            'email'          => ['required', 'email', Rule::unique('users', 'email')],
            'password'       => ['required', new StrongPassword],
            'phone'          => ['nullable', 'string', 'max:30'],
            'role'           => ['required', Rule::in(['doctor', 'data_entry', 'auditor'])],
            'department'     => ['nullable', 'string', 'max:100'],
            'specialization' => ['nullable', 'string', 'max:100'],
        ]);

        $employee = User::create([
            'name'                  => $data['name'],
            'email'                 => $data['email'],
            'password'              => $data['password'],
            'phone'                 => $data['phone'] ?? null,
            'role'                  => $data['role'],
            'department'            => $data['department'] ?? null,
            'specialization'        => $data['specialization'] ?? null,
            'status'                => 'approved',
            'email_verified_at'     => now(),
            'registration_complete' => true,
            'linked_hospital_id'    => $hospitalId,
        ]);
        $employee->assignRole($data['role']);

        // Immutable audit-log entry — actor, target, scope, event, when, all in one row
        ActivityLogger::logActivity(
            'employee_created',
            'Employee added',
            "{$actor->name} added {$employee->name} as {$employee->role}",
            [
                'actor_id'          => $actor->id,
                'user_id'           => $employee->id,        // target
                'scope_hospital_id' => $hospitalId,
                'metadata'          => [
                    'actor_name'   => $actor->name,
                    'actor_role'   => $actor->role,
                    'target_name'  => $employee->name,
                    'target_role'  => $employee->role,
                    'target_email' => $employee->email,
                ],
            ]
        );
        ActivityLogger::logAction($employee->id, 'employee_created', "Created by {$actor->name} ({$actor->role})");

        return response()->json([
            'message' => 'Employee created.',
            'user' => app(AuthController::class)->userResource($employee),
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
            'notification_prefs' => ['sometimes', 'array'],
            'notification_prefs.*' => ['sometimes', 'boolean'],

            // Hospital profile fields — accepted as flat keys for convenience
            'hospitalName'        => ['sometimes', 'nullable', 'string', 'max:120'],
            'registrationNumber'  => ['sometimes', 'nullable', 'string', 'max:50', 'regex:/^[A-Z]{2,}[\-\/][A-Z0-9]+(?:[\-\/][A-Z0-9]+)+$/'],
            'licenseNumber'       => ['sometimes', 'nullable', 'string', 'max:50', 'regex:/^[A-Z]{2,}[\-\/][A-Z0-9]+(?:[\-\/][A-Z0-9]+)+$/'],
            'hospitalAddress'     => ['sometimes', 'nullable', 'string', 'max:255'],
            'contactPerson'       => ['sometimes', 'nullable', 'string', 'max:120'],
            'city'                => ['sometimes', 'nullable', 'string', 'max:80'],

            // Or as nested object — both work
            'hospital_profile'    => ['sometimes', 'array'],

            // Donor-profile fields — accepted as flat camelCase keys
            'donationConsent'    => ['sometimes', 'boolean'],
            'donationWillingness'=> ['sometimes', 'string', 'max:20'],
            'familyNotified'     => ['sometimes', 'boolean'],
            'pledgedOrgans'      => ['sometimes', 'array'],
            'donationType'       => ['sometimes', Rule::in(['deceased', 'living', 'both'])],
            'familyInformed'     => ['sometimes', 'boolean'],
            'nextOfKin'          => ['sometimes', 'nullable', 'string', 'max:191'],
            'contactPreference'  => ['sometimes', 'nullable', 'string', 'max:30'],
            'availableForUrgent' => ['sometimes', 'boolean'],

            // Recipient-profile fields — accepted as flat camelCase keys
            'organNeeded'        => ['sometimes', 'nullable', 'string', 'max:60'],
            'bloodCompatibility' => ['sometimes', 'nullable', 'string', 'max:191'],
            'urgencySelf'        => ['sometimes', 'nullable', 'integer', 'min:1', 'max:10'],
            'waitingListVisibility' => ['sometimes', 'nullable', 'string', 'max:30'],
            'travelReady'        => ['sometimes', 'boolean'],
        ], [
            'registrationNumber.regex' => 'Registration number must follow format like PMDC-AKU-1985-001 (uppercase code + dashes/numbers).',
            'licenseNumber.regex'      => 'License number must follow format like SHC-AKU-1985-LIC (uppercase code + dashes/numbers).',
        ]);

        // Pull out hospital-profile fields and apply only user fields to the user model
        $hospitalProfileFlat = array_filter([
            'hospital_name'       => $data['hospitalName']       ?? null,
            'registration_number' => isset($data['registrationNumber']) ? strtoupper($data['registrationNumber']) : null,
            'license_number'      => isset($data['licenseNumber'])      ? strtoupper($data['licenseNumber'])      : null,
            'hospital_address'    => $data['hospitalAddress']   ?? null,
            'contact_person'      => $data['contactPerson']     ?? null,
            'city'                => $data['city']              ?? null,
        ], fn($v) => $v !== null);

        $hospitalProfileNested = $data['hospital_profile'] ?? [];
        $hpData = array_merge($hospitalProfileNested, $hospitalProfileFlat);

        if ($user->role === 'hospital' && !empty($hpData)) {
            $hp = \App\Models\HospitalProfile::firstOrNew(['user_id' => $user->id]);
            // If creating a new profile (no DB row yet) and hospital_name is missing, fall back to user's name
            // so the NOT NULL constraint on hospital_profiles.hospital_name doesn't blow up.
            if (!$hp->exists && empty($hpData['hospital_name'])) {
                $hpData['hospital_name'] = $user->name ?: 'Unnamed Hospital';
            }
            $hp->fill($hpData);
            $hp->save();
            // Bust the cached hospital list so super admin sees the updated info immediately
            \Illuminate\Support\Facades\Cache::forget('hospitals:overview:v1');
        }

        // Donor profile preferences (camelCase → snake_case mapping)
        $donorMap = [
            'donationConsent'    => 'donation_consent',
            'donationWillingness'=> 'donation_willingness',
            'familyNotified'     => 'family_notified',
            'pledgedOrgans'      => 'pledged_organs',
            'donationType'       => 'donation_type',
            'familyInformed'     => 'family_informed',
            'nextOfKin'          => 'next_of_kin',
            'contactPreference'  => 'contact_preference',
            'availableForUrgent' => 'available_for_urgent',
        ];
        $donorUpdates = collect($donorMap)
            ->filter(fn($_v, $camel) => array_key_exists($camel, $data))
            ->mapWithKeys(fn($snake, $camel) => [$snake => $data[$camel]])
            ->toArray();
        if ($user->role === 'donor' && !empty($donorUpdates)) {
            \App\Models\DonorProfile::updateOrCreate(['user_id' => $user->id], $donorUpdates);
        }

        // Recipient profile preferences
        $recipientMap = [
            'organNeeded'           => 'organ_needed',
            'bloodCompatibility'    => 'blood_compatibility',
            'urgencySelf'           => 'urgency_self',
            'waitingListVisibility' => 'waiting_list_visibility',
            'travelReady'           => 'travel_ready',
        ];
        $recipientUpdates = collect($recipientMap)
            ->filter(fn($_v, $camel) => array_key_exists($camel, $data))
            ->mapWithKeys(fn($snake, $camel) => [$snake => $data[$camel]])
            ->toArray();
        if ($user->role === 'recipient' && !empty($recipientUpdates)) {
            \App\Models\RecipientProfile::updateOrCreate(['user_id' => $user->id], $recipientUpdates);
        }

        // Strip the hospital + donor + recipient flat keys before updating the user model
        $userData = collect($data)->except([
            'hospitalName', 'registrationNumber', 'licenseNumber', 'hospitalAddress',
            'contactPerson', 'city', 'hospital_profile',
            ...array_keys($donorMap),
            ...array_keys($recipientMap),
        ])->toArray();

        if (!empty($userData)) {
            $user->update($userData);
        }
        ActivityLogger::logAction($user->id, 'user_updated', 'User profile updated', $data, $request->user()->id);

        // Hospital-scoped audit trail (visible in Recent Activity for the relevant hospital)
        $actor = $request->user();
        $scopeHospital = $user->linked_hospital_id ?? $user->preferred_hospital_id ?? ($actor->role === 'hospital' ? $actor->id : $actor->linked_hospital_id);
        if ($scopeHospital) {
            ActivityLogger::logActivity(
                'user_updated',
                'User updated',
                "{$actor->name} updated {$user->name}",
                [
                    'actor_id'          => $actor->id,
                    'user_id'           => $user->id,
                    'scope_hospital_id' => $scopeHospital,
                    'metadata'          => ['changed_fields' => array_keys($data)],
                ]
            );
        }

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
        if ($request->user()->id === $user->id) {
            return response()->json(['message' => 'You cannot delete your own account from here. Use Account Settings.'], 403);
        }
        // Role hierarchy: an admin cannot delete another admin. Only super admin OR the
        // hospital that owns the linked admin can delete admin accounts.
        if ($user->role === 'admin') {
            $actor = $request->user();
            $isSuperAdmin = $actor->role === 'super_admin';
            $isOwningHospital = $actor->role === 'hospital' && (int) $user->linked_hospital_id === (int) $actor->id;
            if (!$isSuperAdmin && !$isOwningHospital) {
                return response()->json([
                    'message' => 'Admins can only be deleted by the super admin or by the hospital they are linked to.',
                ], 403);
            }
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
        if ($request->user()->id === $user->id) {
            return response()->json(['message' => 'You cannot ban your own account.'], 403);
        }
        // Role hierarchy: an admin cannot ban another admin. Only the super admin OR the
        // hospital that owns the linked admin can take action against admins.
        if ($user->role === 'admin') {
            $actor = $request->user();
            $isSuperAdmin = $actor->role === 'super_admin';
            $isOwningHospital = $actor->role === 'hospital' && (int) $user->linked_hospital_id === (int) $actor->id;
            if (!$isSuperAdmin && !$isOwningHospital) {
                return response()->json([
                    'message' => 'Admins can only be banned by the super admin or by the hospital they are linked to.',
                ], 403);
            }
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
        $actor = $request->user();
        $scopeHospital = $user->linked_hospital_id ?? $user->preferred_hospital_id ?? ($actor->role === 'hospital' ? $actor->id : $actor->linked_hospital_id);
        if ($scopeHospital) {
            ActivityLogger::logActivity(
                $data['ban_type'] === 'warning' ? 'user_warned' : 'user_banned',
                ($data['ban_type'] === 'warning' ? 'User warned' : 'User banned'),
                "{$actor->name} {$data['ban_type']}d {$user->name}: {$data['detailed_reason']}",
                ['actor_id' => $actor->id, 'user_id' => $user->id, 'scope_hospital_id' => $scopeHospital, 'metadata' => $data]
            );
        }
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
        $actor = $request->user();
        $authError = $this->checkUserActionPermission($actor, $user, 'unban');
        if ($authError) return response()->json(['message' => $authError], 403);

        $user->update(['banned' => false, 'status' => 'approved', 'ban_details' => null]);
        ActivityLogger::logAction($user->id, 'ban_reversed', 'Ban reversed by admin', [], $actor->id);
        $scopeHospital = $user->linked_hospital_id ?? $user->preferred_hospital_id ?? ($actor->role === 'hospital' ? $actor->id : $actor->linked_hospital_id);
        if ($scopeHospital) {
            ActivityLogger::logActivity(
                'user_unbanned',
                'User unbanned',
                "{$actor->name} reversed ban on {$user->name}",
                ['actor_id' => $actor->id, 'user_id' => $user->id, 'scope_hospital_id' => $scopeHospital]
            );
        }
        Notification::create([
            'user_id' => $user->id, 'type' => 'info',
            'title' => 'Account restored',
            'message' => 'Your account has been restored. You can log in normally.',
        ]);
        return response()->json([
            'message' => 'User unbanned.',
            'user' => app(AuthController::class)->userResource($user->fresh()),
        ]);
    }

    /** POST /api/users/{user}/restore — admin/hospital restores a soft-deleted user.
     *  Mirrors unban; the user keeps their data because the row was never actually destroyed. */
    public function restore(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $authError = $this->checkUserActionPermission($actor, $user, 'restore');
        if ($authError) return response()->json(['message' => $authError], 403);
        if (!$user->is_deleted) {
            return response()->json(['message' => 'This account is not currently deleted.'], 422);
        }

        $user->update([
            'is_deleted'        => false,
            'status'            => 'approved',
            'deletion_details'  => null,
            'recovery_deadline' => null,
        ]);

        ActivityLogger::logAction($user->id, 'account_restored', 'Account restored by admin', [], $actor->id);
        $scopeHospital = $user->linked_hospital_id ?? $user->preferred_hospital_id ?? ($actor->role === 'hospital' ? $actor->id : $actor->linked_hospital_id);
        if ($scopeHospital) {
            ActivityLogger::logActivity(
                'user_restored',
                'User account restored',
                "{$actor->name} restored {$user->name}'s account",
                ['actor_id' => $actor->id, 'user_id' => $user->id, 'scope_hospital_id' => $scopeHospital]
            );
        }
        Notification::create([
            'user_id' => $user->id, 'type' => 'info',
            'title'   => 'Account restored',
            'message' => 'Your account has been restored by an administrator. You can log in normally.',
        ]);

        return response()->json([
            'message' => 'User restored.',
            'user'    => app(AuthController::class)->userResource($user->fresh()),
        ]);
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

    /** POST /api/users/restore-self-public — restore a self-deleted account from the login
     *  screen. A deleted user has no auth token, so this endpoint re-verifies the user's
     *  email + password instead, then restores the account (if within the recovery window)
     *  and signs them straight back in. */
    public function restoreSelfPublic(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();
        if (!$user || !$user->password || !\Illuminate\Support\Facades\Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Incorrect email or password.'], 401);
        }
        if (!$user->is_deleted) {
            return response()->json(['message' => 'This account is not marked for deletion.'], 422);
        }
        // Only the user's OWN self-deletion can be reversed here. Admin deletions go
        // through the appeal flow (a different admin must review).
        $isSelfDelete = !empty(optional($user->deletion_details)['is_self_delete'])
            || (optional($user->deletion_details)['admin_id'] ?? null) === $user->id;
        if (!$isSelfDelete) {
            return response()->json(['message' => 'This account was deleted by an administrator and cannot be self-restored. Please submit an appeal.'], 403);
        }
        if ($user->recovery_deadline && $user->recovery_deadline->isPast()) {
            return response()->json(['message' => 'The 30-day recovery window has expired. This account can no longer be restored.'], 410);
        }

        $user->update([
            'is_deleted'        => false,
            'status'            => 'approved',
            'deletion_details'  => null,
            'recovery_deadline' => null,
        ]);
        ActivityLogger::logAction($user->id, 'account_restored', 'User restored their self-deleted account from login');

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message'    => 'Account restored. Welcome back!',
            'token'      => $token,
            'token_type' => 'Bearer',
            'user'       => app(AuthController::class)->userResource(
                $user->fresh()->load(['hospitalProfile', 'donorProfile', 'recipientProfile', 'clinicalProfile'])
            ),
        ]);
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

    /**
     * Centralized authorization for admin-style actions (ban/unban/delete/restore) on a target user.
     * Returns null if allowed, or an error message string if denied.
     *
     * Rules:
     *   - You cannot act on a super admin
     *   - You cannot act on yourself via these endpoints
     *   - super_admin can act on anyone
     *   - hospital can act on users tied to it (linked_hospital_id or preferred_hospital_id == self id),
     *     including its own linked admins
     *   - admin can act on non-admin users tied to its hospital (donors/recipients/employees) but NOT
     *     on other admins (peer rule). Only super_admin or the owning hospital may act on admins.
     */
    private function checkUserActionPermission(User $actor, User $target, string $action): ?string
    {
        $verb = $action; // for nicer error messages
        if ($target->isSuperAdmin()) {
            return "Cannot {$verb} super admin.";
        }
        if ($actor->id === $target->id) {
            return "You cannot {$verb} your own account.";
        }
        if ($actor->role === 'super_admin') return null;

        if ($actor->role === 'hospital') {
            $belongsToThisHospital =
                (int) $target->linked_hospital_id === (int) $actor->id ||
                (int) $target->preferred_hospital_id === (int) $actor->id ||
                (int) $target->id === (int) $actor->id; // self check already above, but harmless
            return $belongsToThisHospital
                ? null
                : "You can only {$verb} users tied to your hospital.";
        }

        if ($actor->role === 'admin') {
            if ($target->role === 'admin') {
                return "Admins cannot {$verb} other admins. Only the super admin or the owning hospital can do that.";
            }
            // Optional scope check: admin can only act within its own hospital
            if ($actor->linked_hospital_id) {
                $targetHospital = $target->linked_hospital_id ?? $target->preferred_hospital_id;
                if ($targetHospital && (int) $targetHospital !== (int) $actor->linked_hospital_id) {
                    return "You can only {$verb} users at your assigned hospital.";
                }
            }
            return null;
        }

        return "You are not authorized to {$verb} users.";
    }
}
