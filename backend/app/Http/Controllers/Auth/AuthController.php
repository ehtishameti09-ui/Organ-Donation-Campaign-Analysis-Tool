<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\HospitalProfile;
use App\Models\DonorProfile;
use App\Models\RecipientProfile;
use App\Models\ClinicalProfile;
use App\Notifications\VerifyEmailNotification;
use App\Rules\StrongPassword;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Register a new user (donor, recipient, or hospital).
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:60'],
            'email' => ['required', 'email:rfc', 'max:191', Rule::unique('users', 'email')],
            'password' => ['required', 'confirmed', new StrongPassword],
            'password_confirmation' => ['required'],
            'role' => ['required', Rule::in(['donor', 'recipient', 'hospital'])],
            'phone' => ['nullable', 'string', 'max:30'],

            // Hospital fields (required only for hospital role)
            'hospital_name' => ['required_if:role,hospital', 'string', 'min:2', 'max:191'],
            'registration_number' => ['required_if:role,hospital', 'string', 'min:5', 'max:50', Rule::unique('hospital_profiles', 'registration_number')],
            'license_number' => ['required_if:role,hospital', 'string', 'min:5', 'max:50', 'different:registration_number', Rule::unique('hospital_profiles', 'license_number')],
            'hospital_address' => ['nullable', 'string', 'max:500'],
            'contact_person' => ['nullable', 'string', 'max:191'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'phone' => $data['phone'] ?? null,
            'role' => $data['role'],
            'status' => $data['role'] === 'hospital' ? 'pending' : 'registered',
            'registration_type' => $data['role'] === 'hospital' ? 'hospital_request' : 'user_self',
            'registration_complete' => false,
            // Auto-verify email in local development so protected routes work immediately
            'email_verified_at' => app()->environment('local') ? now() : null,
        ]);

        // Assign a human-readable unique ID (e.g. DON-2026-0042)
        $prefix = match($data['role']) {
            'donor'     => 'DON',
            'recipient' => 'REC',
            'hospital'  => 'HOS',
            'admin'     => 'ADM',
            default     => 'USR',
        };
        $user->update([
            'unique_id' => $prefix . '-' . date('Y') . '-' . str_pad($user->id, 4, '0', STR_PAD_LEFT),
        ]);

        // Assign Spatie role
        $user->assignRole($data['role']);

        // Create role-specific profile
        if ($data['role'] === 'hospital') {
            HospitalProfile::create([
                'user_id' => $user->id,
                'hospital_name' => $data['hospital_name'],
                'registration_number' => $data['registration_number'],
                'license_number' => $data['license_number'],
                'hospital_address' => $data['hospital_address'] ?? null,
                'contact_person' => $data['contact_person'] ?? $data['name'],
            ]);
        } elseif ($data['role'] === 'donor') {
            DonorProfile::create(['user_id' => $user->id]);
            ClinicalProfile::create(['user_id' => $user->id]);
        } elseif ($data['role'] === 'recipient') {
            RecipientProfile::create(['user_id' => $user->id]);
            ClinicalProfile::create(['user_id' => $user->id]);
        }

        // Send verification email
        $user->notify(new VerifyEmailNotification);

        // Log activity
        ActivityLogger::logActivity(
            type: $data['role'].'_registered',
            title: ucfirst($data['role']).' registered',
            description: $user->name.' ('.$user->email.') registered as '.$data['role'],
            extra: ['user_id' => $user->id, 'actor_id' => $user->id]
        );
        ActivityLogger::logAction($user->id, 'register', 'New '.$data['role'].' registration');

        // Issue token
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Registration successful. Please check your email to verify your account.',
            'user' => $this->userResource($user->fresh()->load(['hospitalProfile', 'donorProfile', 'recipientProfile', 'clinicalProfile'])),
            'token' => $token,
            'token_type' => 'Bearer',
        ], 201);
    }

    /**
     * Login with email + password.
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $key = 'login:'.strtolower($credentials['email']).'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            return response()->json([
                'message' => "Too many login attempts. Try again in {$seconds} seconds.",
            ], 429);
        }

        $user = User::where('email', $credentials['email'])->first();

        if (!$user || !$user->password || !Hash::check($credentials['password'], $user->password)) {
            RateLimiter::hit($key, 60);
            ActivityLogger::logAction($user?->id ?? 0, 'login_failed', 'Invalid credentials', ['email' => $credentials['email']]);
            throw ValidationException::withMessages([
                'email' => ['Invalid email or password.'],
            ]);
        }

        // Banned check
        if ($user->banned) {
            return response()->json([
                'message' => 'Your account has been banned.',
                'banned' => true,
                'ban_details' => $user->ban_details,
                'user_id' => $user->id, // for appeal submission
            ], 403);
        }

        // Soft-deleted check
        if ($user->is_deleted) {
            if ($user->recovery_deadline && $user->recovery_deadline->isFuture()) {
                return response()->json([
                    'message' => 'Account marked for deletion. You can recover it.',
                    'deleted' => true,
                    'recovery_deadline' => $user->recovery_deadline,
                    'user_id' => $user->id,
                ], 403);
            }
            return response()->json(['message' => 'Account permanently deleted.'], 403);
        }

        // Account locked
        if ($user->locked_until && $user->locked_until->isFuture()) {
            return response()->json([
                'message' => 'Account locked until '.$user->locked_until->toDateTimeString(),
            ], 423);
        }

        RateLimiter::clear($key);

        // Rotate session, issue token
        $user->update([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
            'failed_login_attempts' => 0,
            'locked_until' => null,
        ]);

        // Revoke previous tokens for security (optional — comment out for multi-device)
        // $user->tokens()->delete();

        $token = $user->createToken('auth_token')->plainTextToken;

        ActivityLogger::logAction($user->id, 'login_success', 'User logged in');

        return response()->json([
            'user' => $this->userResource($user->load(['hospitalProfile', 'donorProfile', 'recipientProfile', 'clinicalProfile'])),
            'token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    /**
     * Logout — revoke current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user) {
            $request->user()->currentAccessToken()->delete();
            ActivityLogger::logAction($user->id, 'logout', 'User logged out');
        }
        return response()->json(['message' => 'Logged out successfully.']);
    }

    /**
     * Get current authenticated user.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['hospitalProfile', 'donorProfile', 'recipientProfile', 'clinicalProfile']);
        return response()->json(['user' => $this->userResource($user)]);
    }

    /**
     * Resend verification email.
     */
    public function resendVerification(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        if ($user->email_verified_at) {
            return response()->json(['message' => 'Email already verified.']);
        }

        $key = 'verify-email:'.$user->id;
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json([
                'message' => 'Please wait before requesting another verification email.',
                'retry_after' => RateLimiter::availableIn($key),
            ], 429);
        }
        RateLimiter::hit($key, 300);

        $user->notify(new VerifyEmailNotification);
        return response()->json(['message' => 'Verification email sent. Check your inbox (or storage/logs/laravel.log in dev).']);
    }

    /**
     * Verify email via signed URL (called from frontend after user clicks email link).
     */
    public function verifyEmail(Request $request, $id, $hash): JsonResponse
    {
        $user = User::findOrFail($id);

        if (!hash_equals(sha1($user->getEmailForVerification()), (string) $hash)) {
            return response()->json(['message' => 'Invalid verification link.'], 403);
        }

        if (!$request->hasValidSignature()) {
            return response()->json(['message' => 'Verification link expired or invalid.'], 403);
        }

        if ($user->email_verified_at) {
            return response()->json(['message' => 'Email already verified.', 'verified' => true]);
        }

        $user->forceFill(['email_verified_at' => now()])->save();
        ActivityLogger::logAction($user->id, 'email_verified', 'Email address verified');

        return response()->json(['message' => 'Email verified successfully.', 'verified' => true]);
    }

    /**
     * Build a consistent user response shape that matches the frontend's expected User object.
     */
    public function userResource(User $user): array
    {
        $data = [
            'id' => $user->id,
            'uniqueId' => $user->unique_id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'status' => $user->status,
            'avatar' => $user->avatar,
            'registrationType' => $user->registration_type,
            'registrationComplete' => (bool) $user->registration_complete,
            'registrationDate' => optional($user->created_at)->toIso8601String(),
            'emailVerifiedAt' => optional($user->email_verified_at)->toIso8601String(),
            'banned' => (bool) $user->banned,
            'banDetails' => $user->ban_details,
            'isDeleted' => (bool) $user->is_deleted,
            'deletionDetails' => $user->deletion_details,
            'recoveryDeadline' => optional($user->recovery_deadline)->toIso8601String(),
            'linkedHospitalId' => $user->linked_hospital_id,
            'preferredHospitalId' => $user->preferred_hospital_id,
            'hospitalId' => $user->hospital_id,
            'department' => $user->department,
            'specialization' => $user->specialization,
            'permissions' => $user->getAllPermissions()->pluck('name'),
            'roles' => $user->getRoleNames(),
        ];

        if ($user->hospitalProfile) {
            $data['hospitalName'] = $user->hospitalProfile->hospital_name;
            $data['registrationNumber'] = $user->hospitalProfile->registration_number;
            $data['licenseNumber'] = $user->hospitalProfile->license_number;
            $data['hospitalAddress'] = $user->hospitalProfile->hospital_address;
            $data['contactPerson'] = $user->hospitalProfile->contact_person;
            $data['adminFeedback'] = $user->hospitalProfile->admin_feedback;
            $data['rejectionReason'] = $user->hospitalProfile->rejection_reason;
            $data['adminMessage'] = $user->hospitalProfile->admin_message;
        }

        if ($user->donorProfile) {
            $data = array_merge($data, [
                'bloodType' => $user->donorProfile->blood_type,
                'pledgedOrgans' => $user->donorProfile->pledged_organs,
                'donationType' => $user->donorProfile->donation_type,
                'familyInformed' => $user->donorProfile->family_informed,
                'nextOfKin' => $user->donorProfile->next_of_kin,
                'verificationStatus' => $user->donorProfile->verification_status,
                'caseStatus' => $user->donorProfile->case_status,
                'consentSigned' => $user->donorProfile->consent_signed,
                'submissionDate' => optional($user->donorProfile->submission_date)->toIso8601String(),
            ]);
        }

        if ($user->recipientProfile) {
            $data = array_merge($data, [
                'bloodType' => $user->recipientProfile->blood_type,
                'organNeeded' => $user->recipientProfile->organ_needed,
                'diagnosis' => $user->recipientProfile->diagnosis,
                'urgencyScore' => $user->recipientProfile->urgency_score,
                'comorbidity' => $user->recipientProfile->comorbidity,
                'survivalEstimate' => $user->recipientProfile->survival_estimate,
                'treatingDoctor' => $user->recipientProfile->treating_doctor,
                'currentHospital' => $user->recipientProfile->current_hospital,
                'daysOnWaitlist' => $user->recipientProfile->days_on_waitlist,
                'verificationStatus' => $user->recipientProfile->verification_status,
                'caseStatus' => $user->recipientProfile->case_status,
                'consentSigned' => $user->recipientProfile->consent_signed,
                'submissionDate' => optional($user->recipientProfile->submission_date)->toIso8601String(),
            ]);
        }

        if ($user->clinicalProfile) {
            $data = array_merge($data, [
                'cnic' => $user->clinicalProfile->cnic,
                'dob' => optional($user->clinicalProfile->dob)->toDateString(),
                'gender' => $user->clinicalProfile->gender,
                'age' => $user->clinicalProfile->age,
                'medicalHistory' => $user->clinicalProfile->medical_history,
                'currentMedications' => $user->clinicalProfile->current_medications,
                'address' => $user->clinicalProfile->address,
                'emergencyContactName' => $user->clinicalProfile->emergency_contact_name,
                'emergencyContactPhone' => $user->clinicalProfile->emergency_contact_phone,
                'emergencyContactRelation' => $user->clinicalProfile->emergency_contact_relation,
            ]);
        }

        return $data;
    }
}
