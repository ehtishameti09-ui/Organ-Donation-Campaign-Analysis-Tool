<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Auth\AuthController;
use App\Models\RecipientProfile;
use App\Models\ClinicalProfile;
use App\Models\Notification;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class RecipientController extends Controller
{
    /** GET /api/recipients */
    public function index(Request $request): JsonResponse
    {
        $authUser = $request->user();
        $query = User::where('role', 'recipient')->with(['recipientProfile', 'clinicalProfile']);

        if ($authUser->isHospital()) {
            $query->where('preferred_hospital_id', $authUser->id);
        } elseif ($authUser->role === 'admin' && $authUser->linked_hospital_id) {
            $query->where('preferred_hospital_id', $authUser->linked_hospital_id);
        }

        if ($status = $request->query('status')) $query->where('status', $status);
        if ($organ = $request->query('organ_needed')) {
            $query->whereHas('recipientProfile', fn ($q) => $q->where('organ_needed', $organ));
        }

        $recipients = $query->orderByDesc('created_at')->paginate($request->integer('per_page', 25));
        $recipients->getCollection()->transform(fn ($u) => app(AuthController::class)->userResource($u));
        return response()->json($recipients);
    }

    /** POST /api/me/recipient/complete-registration */
    public function completeRegistration(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'recipient') {
            return response()->json(['message' => 'Only recipient accounts can complete recipient registration.'], 403);
        }

        $data = $request->validate([
            'cnic' => ['required', 'regex:/^\d{5}-\d{7}-\d$/'],
            'dob' => ['required', 'date', 'before:today'],
            'gender' => ['required', Rule::in(['Male', 'Female', 'Other'])],
            'blood_type' => ['required', Rule::in(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])],
            'phone' => ['required', 'string', 'max:30'],
            'address' => ['required', 'string', 'max:500'],
            'organ_needed' => ['required', 'string'],
            'diagnosis' => ['nullable', 'string'],
            'urgency_score' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'comorbidity' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'treating_doctor' => ['nullable', 'string', 'max:191'],
            'current_hospital' => ['nullable', 'string', 'max:191'],
            'medical_history' => ['nullable', 'string'],
            'current_medications' => ['nullable', 'string'],
            'emergency_contact_name' => ['nullable', 'string', 'max:191'],
            'emergency_contact_phone' => ['nullable', 'string', 'max:30'],
            'emergency_contact_relation' => ['nullable', 'string', 'max:50'],
            'preferred_hospital_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'hospital')->where('status', 'approved')],

            // Account type: 'personal' (adult patient manages own account) or
            // 'guardian' (a parent/legal guardian manages the account for a child patient).
            'account_type' => ['nullable', Rule::in(['personal', 'guardian'])],
            'patient_name' => ['required_if:account_type,guardian', 'nullable', 'string', 'max:120'],
            'guardian_name' => ['required_if:account_type,guardian', 'nullable', 'string', 'max:120'],
            'guardian_relationship' => ['required_if:account_type,guardian', 'nullable', 'string', 'max:40'],
            'guardian_cnic' => ['required_if:account_type,guardian', 'nullable', 'regex:/^\d{5}-\d{7}-\d$/'],
            'guardian_phone' => ['required_if:account_type,guardian', 'nullable', 'string', 'max:30'],
        ], [
            'patient_name.required_if' => "The patient's (child's) full name is required for a guardian account.",
            'guardian_name.required_if' => "The guardian's full name is required.",
            'guardian_relationship.required_if' => 'Please state your relationship to the patient.',
            'guardian_cnic.required_if' => "The guardian's CNIC is required.",
            'guardian_cnic.regex' => "Guardian CNIC must be in the format XXXXX-XXXXXXX-X.",
            'guardian_phone.required_if' => "The guardian's phone number is required.",
        ]);

        $accountType = $data['account_type'] ?? 'personal';

        $dobDate = \Illuminate\Support\Carbon::createFromFormat('Y-m-d', $data['dob'])->startOfDay();
        $age = (int) $dobDate->diffInYears(\Illuminate\Support\Carbon::today());

        // A PERSONAL recipient account holder must be an adult (≥18). A child
        // patient must be registered through a Parent/Guardian account instead.
        if ($accountType === 'personal' && $age < 18) {
            return response()->json([
                'message' => 'A personal account holder must be at least 18 years old. To register a child, use a Parent/Guardian account.',
            ], 422);
        }

        // Auto-calculate survival estimate (basic formula based on urgency and comorbidity)
        $urgency = (float) ($data['urgency_score'] ?? 5);
        $comorb = (float) ($data['comorbidity'] ?? 3);
        $survivalPct = max(20, min(95, 100 - ($urgency * 5) - ($comorb * 3)));
        $survivalEstimate = round($survivalPct).'%';

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

        RecipientProfile::updateOrCreate(['user_id' => $user->id], [
            'blood_type' => $data['blood_type'],
            'organ_needed' => $data['organ_needed'],
            'diagnosis' => $data['diagnosis'] ?? null,
            'urgency_score' => $urgency,
            'comorbidity' => $comorb,
            'survival_estimate' => $survivalEstimate,
            'treating_doctor' => $data['treating_doctor'] ?? null,
            'current_hospital' => $data['current_hospital'] ?? null,
            'verification_status' => 'submitted',
            'case_status' => 'submitted',
            'submission_date' => now(),
            'account_type' => $accountType,
            'patient_name' => $accountType === 'guardian' ? ($data['patient_name'] ?? null) : null,
            'guardian_name' => $accountType === 'guardian' ? ($data['guardian_name'] ?? null) : null,
            'guardian_relationship' => $accountType === 'guardian' ? ($data['guardian_relationship'] ?? null) : null,
            'guardian_cnic' => $accountType === 'guardian' ? ($data['guardian_cnic'] ?? null) : null,
            'guardian_phone' => $accountType === 'guardian' ? ($data['guardian_phone'] ?? null) : null,
        ]);

        ActivityLogger::logActivity('recipient_submitted', 'Recipient submitted case', $user->name.' submitted recipient registration', [
            'user_id' => $user->id, 'actor_id' => $user->id, 'scope_hospital_id' => $data['preferred_hospital_id'],
        ]);
        Notification::create([
            'user_id' => $data['preferred_hospital_id'], 'type' => 'new_case',
            'title' => 'New Recipient Case', 'message' => $user->name.' submitted a recipient registration for review.',
            'data' => ['recipient_id' => $user->id, 'organ_needed' => $data['organ_needed']],
        ]);

        return response()->json([
            'message' => 'Recipient registration submitted.',
            'survival_estimate' => $survivalEstimate,
            'user' => app(AuthController::class)->userResource($user->fresh()->load(['recipientProfile', 'clinicalProfile'])),
        ]);
    }

    /** POST /api/recipients/{recipient}/verify (hospital/admin) */
    public function verify(Request $request, User $recipient): JsonResponse
    {
        if ($recipient->role !== 'recipient') return response()->json(['message' => 'Not a recipient.'], 422);

        $data = $request->validate([
            'action' => ['required', Rule::in(['approve', 'reject', 'request_info'])],
            'notes' => ['nullable', 'string'],
        ]);

        $statusMap = ['approve' => 'approved', 'reject' => 'rejected', 'request_info' => 'info_requested'];
        $verificationMap = ['approve' => 'approved', 'reject' => 'rejected', 'request_info' => 'under_review'];

        $recipient->update(['status' => $statusMap[$data['action']]]);
        $profileUpdate = [
            'verification_status' => $verificationMap[$data['action']],
            'case_status' => $data['action'] === 'approve' ? 'approved' : ($data['action'] === 'reject' ? 'rejected' : 'submitted'),
        ];
        if ($data['action'] === 'reject') {
            $profileUpdate['rejected_by'] = $request->user()->id;
            $profileUpdate['rejection_reason'] = $data['notes'] ?? null;
            $profileUpdate['rejected_at'] = now();
        } elseif ($data['action'] === 'approve') {
            $profileUpdate['rejected_by'] = null;
            $profileUpdate['rejection_reason'] = null;
            $profileUpdate['rejected_at'] = null;
        }
        $recipient->recipientProfile()->update($profileUpdate);

        Notification::create([
            'user_id' => $recipient->id, 'type' => 'case_'.$data['action'],
            'title' => 'Recipient case '.$data['action'],
            'message' => $data['notes'] ?? 'Your case status has been updated.',
        ]);
        ActivityLogger::logActivity('recipient_'.$data['action'].'d', 'Recipient '.$data['action'].'d', $recipient->name, [
            'user_id' => $recipient->id, 'actor_id' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Recipient case '.$data['action'].'d.']);
    }
}
