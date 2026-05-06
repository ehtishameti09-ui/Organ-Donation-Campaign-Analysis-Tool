<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Auth\AuthController;
use App\Models\DonorProfile;
use App\Models\ClinicalProfile;
use App\Models\ConsentForm;
use App\Models\Notification;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class DonorController extends Controller
{
    /** GET /api/donors */
    public function index(Request $request): JsonResponse
    {
        $authUser = $request->user();
        $query = User::where('role', 'donor')->with(['donorProfile', 'clinicalProfile']);

        if ($authUser->isHospital()) {
            $query->where('preferred_hospital_id', $authUser->id);
        } elseif ($authUser->role === 'admin' && $authUser->linked_hospital_id) {
            $query->where('preferred_hospital_id', $authUser->linked_hospital_id);
        }

        if ($status = $request->query('status')) $query->where('status', $status);
        if ($blood = $request->query('blood_type')) {
            $query->whereHas('donorProfile', fn ($q) => $q->where('blood_type', $blood));
        }

        $donors = $query->orderByDesc('created_at')->paginate($request->integer('per_page', 25));
        $donors->getCollection()->transform(fn ($u) => app(AuthController::class)->userResource($u));
        return response()->json($donors);
    }

    /** POST /api/me/donor/complete-registration */
    public function completeRegistration(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'donor') {
            return response()->json(['message' => 'Only donor accounts can complete donor registration.'], 403);
        }

        $data = $request->validate([
            'cnic' => ['required', 'regex:/^\d{5}-\d{7}-\d$/'],
            'dob' => ['required', 'date', 'before:today'],
            'gender' => ['required', Rule::in(['Male', 'Female', 'Other'])],
            'blood_type' => ['required', Rule::in(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])],
            'phone' => ['required', 'string', 'max:30'],
            'address' => ['required', 'string', 'max:500'],
            'pledged_organs' => ['required', 'array', 'min:1'],
            'donation_type' => ['required', Rule::in(['deceased', 'living', 'both'])],
            'family_informed' => ['required', 'boolean'],
            'next_of_kin' => ['nullable', 'string', 'max:191'],
            'medical_history' => ['nullable', 'string'],
            'current_medications' => ['nullable', 'string'],
            'emergency_contact_name' => ['nullable', 'string', 'max:191'],
            'emergency_contact_phone' => ['nullable', 'string', 'max:30'],
            'emergency_contact_relation' => ['nullable', 'string', 'max:50'],
            'preferred_hospital_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'hospital')->where('status', 'approved')],
        ]);

        // Use date-only comparison (today() at midnight) to avoid timezone/time-of-day edge cases
        $dobDate = \Illuminate\Support\Carbon::createFromFormat('Y-m-d', $data['dob'])->startOfDay();
        $age = (int) $dobDate->diffInYears(\Illuminate\Support\Carbon::today());
        if ($age < 18) {
            return response()->json(['message' => 'Donor must be at least 18 years old. Please check your date of birth.'], 422);
        }

        $user->update([
            'phone' => $data['phone'],
            'preferred_hospital_id' => $data['preferred_hospital_id'],
            'status' => 'submitted',
            'registration_complete' => true,
        ]);

        ClinicalProfile::updateOrCreate(['user_id' => $user->id], [
            'cnic' => $data['cnic'], 'dob' => $data['dob'], 'gender' => $data['gender'], 'age' => $age,
            'medical_history' => $data['medical_history'] ?? null,
            'current_medications' => $data['current_medications'] ?? null,
            'address' => $data['address'],
            'emergency_contact_name' => $data['emergency_contact_name'] ?? null,
            'emergency_contact_phone' => $data['emergency_contact_phone'] ?? null,
            'emergency_contact_relation' => $data['emergency_contact_relation'] ?? null,
        ]);

        DonorProfile::updateOrCreate(['user_id' => $user->id], [
            'blood_type' => $data['blood_type'],
            'pledged_organs' => $data['pledged_organs'],
            'donation_type' => $data['donation_type'],
            'family_informed' => $data['family_informed'],
            'next_of_kin' => $data['next_of_kin'] ?? null,
            'verification_status' => 'submitted',
            'case_status' => 'submitted',
            'submission_date' => now(),
        ]);

        ActivityLogger::logActivity('donor_submitted', 'Donor submitted case', $user->name.' submitted donor registration', [
            'user_id' => $user->id, 'actor_id' => $user->id, 'scope_hospital_id' => $data['preferred_hospital_id'],
        ]);
        Notification::create([
            'user_id' => $data['preferred_hospital_id'], 'type' => 'new_case',
            'title' => 'New Donor Case', 'message' => $user->name.' submitted a new donor registration for review.',
            'data' => ['donor_id' => $user->id],
        ]);

        return response()->json([
            'message' => 'Donor registration submitted for review.',
            'user' => app(AuthController::class)->userResource($user->fresh()->load(['donorProfile', 'clinicalProfile'])),
        ]);
    }

    /** POST /api/donors/{donor}/verify (hospital/admin) */
    public function verify(Request $request, User $donor): JsonResponse
    {
        if ($donor->role !== 'donor') return response()->json(['message' => 'Not a donor.'], 422);

        $data = $request->validate([
            'action' => ['required', Rule::in(['approve', 'reject', 'request_info'])],
            'notes' => ['nullable', 'string'],
        ]);

        $statusMap = ['approve' => 'approved', 'reject' => 'rejected', 'request_info' => 'info_requested'];
        $verificationMap = ['approve' => 'approved', 'reject' => 'rejected', 'request_info' => 'under_review'];

        $donor->update(['status' => $statusMap[$data['action']]]);
        $donor->donorProfile()->update([
            'verification_status' => $verificationMap[$data['action']],
            'case_status' => $data['action'] === 'approve' ? 'approved' : ($data['action'] === 'reject' ? 'rejected' : 'submitted'),
        ]);

        Notification::create([
            'user_id' => $donor->id, 'type' => 'case_'.$data['action'],
            'title' => 'Donor case '.$data['action'],
            'message' => $data['notes'] ?? 'Your case status has been updated.',
        ]);
        ActivityLogger::logActivity('donor_'.$data['action'].'d', 'Donor '.$data['action'].'d', $donor->name, [
            'user_id' => $donor->id, 'actor_id' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Donor case '.$data['action'].'d.']);
    }

    /** POST /api/me/consent — sign consent form */
    public function signConsent(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'full_name' => ['required', 'string', 'max:191'],
            'cnic' => ['required', 'regex:/^\d{5}-\d{7}-\d$/'],
            'signature' => ['required', 'string'],
            'free_will_declared' => ['required', 'accepted'],
        ]);

        ConsentForm::updateOrCreate(['user_id' => $user->id], [
            'user_type' => $user->role === 'donor' ? 'donor' : 'recipient',
            'full_name' => $data['full_name'],
            'cnic' => $data['cnic'],
            'signature' => $data['signature'],
            'free_will_declared' => true,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string)$request->userAgent(), 0, 255),
            'submitted_at' => now(),
        ]);

        if ($user->role === 'donor') {
            $user->donorProfile()->update(['consent_signed' => true, 'consent_date' => now()]);
        } else {
            $user->recipientProfile()->update(['consent_signed' => true, 'consent_date' => now()]);
        }

        return response()->json(['message' => 'Consent recorded.']);
    }
}
