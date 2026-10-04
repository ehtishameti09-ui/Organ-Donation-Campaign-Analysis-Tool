<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\PasswordResetController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\TwoFactorController;
use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\HospitalController;
use App\Http\Controllers\DonorController;
use App\Http\Controllers\RecipientController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\AppealController;
use App\Http\Controllers\ActivityController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\AllocationController;
use App\Http\Controllers\AdminRequestController;
use App\Http\Controllers\CaseApprovalController;
use App\Http\Controllers\OrganController;
use App\Http\Controllers\SurgeryController;

// Public routes (no authentication required)
Route::post('/register', [AuthController::class, 'register'])->name('register');
Route::post('/login', [AuthController::class, 'login'])->name('login');
Route::post('/password-reset/send-link', [PasswordResetController::class, 'sendResetLink'])->name('password.send-link');
Route::post('/password-reset/verify-code', [PasswordResetController::class, 'verifyCode'])->name('password.verify-code');
Route::post('/password-reset/reset', [PasswordResetController::class, 'reset'])->name('password.reset');
Route::post('/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])->name('verification.verify');
Route::get('/oauth/google/status',   [GoogleAuthController::class, 'status'])->name('oauth.google.status');
Route::get('/oauth/google/redirect', [GoogleAuthController::class, 'redirect'])->name('oauth.google.redirect');
Route::get('/oauth/google/callback', [GoogleAuthController::class, 'callback'])->name('oauth.google.callback');

// Public 2FA endpoints (used during the login challenge)
Route::post('/2fa/email/verify', [TwoFactorController::class, 'verifyLoginCode'])->name('2fa.email.verify');
Route::post('/2fa/email/resend', [TwoFactorController::class, 'resendLoginCode'])->name('2fa.email.resend');

// Pre-account verification (email link + phone OTP). No DB rows are created
// here — state lives in the cache; /api/register consumes the tokens.
// The controller enforces a stricter, user-friendly per-(email+ip) limit
// (3 free, 30s cooldown, max 5 in 10min); the route throttle is just a
// per-IP backstop against scripted abuse — keep it generous so the
// controller's nicer messages are what users actually see.
Route::post('/auth/email/start',   [EmailVerificationController::class, 'start'])->middleware('throttle:30,10')->name('auth.email.start');
Route::post('/auth/email/confirm', [EmailVerificationController::class, 'confirm'])->middleware('throttle:30,1')->name('auth.email.confirm');
Route::get('/auth/email/status',   [EmailVerificationController::class, 'status'])->middleware('throttle:120,1')->name('auth.email.status');

// Public appeals endpoint — banned/deleted users can't log in, so they submit from
// the login modal. Server-side validation ensures only actually banned/deleted users
// can create appeals, and duplicate-pending checks prevent spam.
Route::post('/appeals/public', [\App\Http\Controllers\AppealController::class, 'store'])->name('appeals.public.store');

// Public self-restore — a self-deleted user has no token, so they re-verify
// email + password from the login modal to recover their account.
Route::post('/users/restore-self-public', [\App\Http\Controllers\UserController::class, 'restoreSelfPublic'])->name('users.restore-self-public');

// Public marketing stats — used on the login page splash. Cached briefly.
Route::get('/stats/public', function () {
    return \Illuminate\Support\Facades\Cache::remember('stats:public:v1', 30, function () {
        return [
            'transplants'  => \App\Models\User::where('role', 'donor')->where('status', 'approved')->count(),
            'activeDonors' => \App\Models\User::where('role', 'donor')->where('status', 'approved')->where('registration_complete', true)->count(),
            'hospitals'    => \App\Models\User::where('role', 'hospital')->where('status', 'approved')->count(),
        ];
    });
})->name('stats.public');

// Documents — authenticated but NOT email-gated. A hospital (and donors/
// recipients) must be able to submit registration documents before verifying
// their email. The controller still enforces ownership, role and status rules.
Route::middleware(['auth:sanctum', 'not.banned', 'audit'])->group(function () {
    Route::post('/documents/upload', [DocumentController::class, 'upload'])->name('documents.upload');
    Route::get('/documents', [DocumentController::class, 'index'])->name('documents.index');
    Route::get('/documents/{document}/download', [DocumentController::class, 'download'])->name('documents.download');
    Route::delete('/documents/{document}', [DocumentController::class, 'destroy'])->name('documents.destroy');
    Route::post('/documents/{document}/review', [DocumentController::class, 'review'])->name('documents.review');
});

// Authenticated routes
Route::middleware(['auth:sanctum', 'verified.email', 'not.banned', 'audit'])->group(function () {
    // Auth routes
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
    Route::get('/me', [AuthController::class, 'me'])->name('me');
    Route::post('/email/resend-verification', [AuthController::class, 'resendVerification'])->name('verification.resend');

    // Two-factor authentication (email OTP)
    Route::post('/2fa/email/request-setup', [TwoFactorController::class, 'requestSetupCode'])->name('2fa.email.request-setup');
    Route::post('/2fa/email/confirm-setup', [TwoFactorController::class, 'confirmSetup'])->name('2fa.email.confirm-setup');
    Route::post('/2fa/email/disable', [TwoFactorController::class, 'disable'])->name('2fa.email.disable');

    // User profile and account management
    Route::get('/users', [UserController::class, 'index'])->name('users.index');
    Route::get('/users/{user}', [UserController::class, 'show'])->name('users.show');
    Route::patch('/users/{user}', [UserController::class, 'update'])->name('users.update');
    Route::post('/users/{user}/ban', [UserController::class, 'ban'])->name('users.ban');
    Route::post('/users/{user}/unban', [UserController::class, 'unban'])->name('users.unban');
    Route::post('/users/{user}/restore', [UserController::class, 'restore'])->name('users.restore');
    Route::post('/users/restore-self', [UserController::class, 'restoreSelf'])->name('users.restore-self');
    Route::post('/users/me/add-role',  [UserController::class, 'addRole'])->name('users.add-role');
    Route::post('/users/delete-self', [UserController::class, 'deleteSelf'])->name('users.delete-self');
    Route::delete('/users/{user}', [UserController::class, 'destroy'])->name('users.destroy');
    Route::post('/users/{user}/change-password', [UserController::class, 'changePassword'])->name('users.change-password');

    // Hospitals
    Route::get('/hospitals', [HospitalController::class, 'index'])->name('hospitals.index');
    Route::get('/hospitals/pending', [HospitalController::class, 'pending'])->name('hospitals.pending');
    Route::get('/hospitals/overview', [HospitalController::class, 'overview'])->name('hospitals.overview');

    // Donors
    Route::get('/donors', [DonorController::class, 'index'])->name('donors.index');
    Route::post('/donors/complete-registration', [DonorController::class, 'completeRegistration'])->name('donors.complete-registration');
    Route::post('/donors/sign-consent', [DonorController::class, 'signConsent'])->name('donors.sign-consent');
    Route::post('/donors/{donor}/verify', [DonorController::class, 'verify'])->name('donors.verify');

    // Recipients
    Route::get('/recipients', [RecipientController::class, 'index'])->name('recipients.index');
    Route::post('/recipients/complete-registration', [RecipientController::class, 'completeRegistration'])->name('recipients.complete-registration');
    Route::post('/recipients/{recipient}/verify', [RecipientController::class, 'verify'])->name('recipients.verify');

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::patch('/notifications/{notification}/mark-read', [NotificationController::class, 'markRead'])->name('notifications.mark-read');
    Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllRead'])->name('notifications.mark-all-read');
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy'])->name('notifications.destroy');

    // Appeals (ban/delete appeals)
    Route::get('/appeals', [AppealController::class, 'index'])->name('appeals.index');
    Route::post('/appeals', [AppealController::class, 'store'])->name('appeals.store');
    Route::post('/appeals/{appeal}/review', [AppealController::class, 'review'])->name('appeals.review');

    // Case appeals (hospital rejection appeals)
    Route::get('/case-appeals', [AppealController::class, 'caseAppealsIndex'])->name('case-appeals.index');
    Route::post('/case-appeals', [AppealController::class, 'submitCaseAppeal'])->name('case-appeals.store');
    Route::post('/case-appeals/{caseAppeal}/review', [AppealController::class, 'reviewCaseAppeal'])->name('case-appeals.review');

    // Activity logs (authenticated users)
    Route::get('/activities', [ActivityController::class, 'index'])->name('activities.index');
    Route::get('/me/action-logs', [ActivityController::class, 'myLogs'])->name('action-logs.mine');
    // Audit trail + real-time security alerts. The controller enforces the
    // permission hierarchy (super_admin/auditor: all; hospital/hospital-admin:
    // own hospital; others: 403), so no role middleware here.
    Route::get('/audit-logs', [ActivityController::class, 'auditLogs'])->name('audit-logs.index');
    Route::get('/security/alerts', [ActivityController::class, 'securityAlerts'])->name('security.alerts');

    // Dashboard metrics — accessible to all authenticated users (controller handles role scoping)
    Route::get('/dashboard/metrics', [DashboardController::class, 'metrics'])->name('dashboard.metrics');
    Route::get('/dashboard/chart-data', [DashboardController::class, 'chartData'])->name('dashboard.chart-data');
    Route::get('/dashboard/summary', [DashboardController::class, 'summary'])->name('dashboard.summary');

    // Admin requests — controller enforces role rules (hospital submits; super_admin reviews)
    Route::get('/admin-requests',                       [AdminRequestController::class, 'index']);
    Route::post('/admin-requests',                      [AdminRequestController::class, 'store']);
    Route::post('/admin-requests/{id}/approve',         [AdminRequestController::class, 'approve']);
    Route::post('/admin-requests/{id}/reject',          [AdminRequestController::class, 'reject']);
    Route::delete('/admin-requests/{id}',               [AdminRequestController::class, 'cancel']);

    // Module 7 — Hospital Approval Board.
    // Deliberately NOT inside the role:hospital|admin group: doctors provide the
    // clinical sign-off and super_admin/auditor need read-only oversight for the
    // cross-hospital comparison. The controller scopes every call by hospital and
    // enforces which role may perform which stage.
    Route::get('/approvals',                     [CaseApprovalController::class, 'index'])->name('approvals.index');
    Route::get('/approvals/metrics',             [CaseApprovalController::class, 'metrics'])->name('approvals.metrics');
    Route::get('/approvals/{id}',                [CaseApprovalController::class, 'show'])->whereNumber('id')->name('approvals.show');
    Route::post('/approvals/{id}/checklist',     [CaseApprovalController::class, 'updateChecklist'])->whereNumber('id')->name('approvals.checklist');
    Route::patch('/approvals/{id}/mode',         [CaseApprovalController::class, 'setMode'])->whereNumber('id')->name('approvals.mode');
    Route::post('/approvals/{id}/offer-respond', [CaseApprovalController::class, 'respondToOffer'])->whereNumber('id')->name('approvals.offer-respond');
    Route::post('/approvals/{id}/doctor-approve',[CaseApprovalController::class, 'doctorApprove'])->whereNumber('id')->name('approvals.doctor-approve');
    Route::post('/approvals/{id}/admin-confirm', [CaseApprovalController::class, 'adminConfirm'])->whereNumber('id')->name('approvals.admin-confirm');
    Route::post('/approvals/{id}/reject',        [CaseApprovalController::class, 'reject'])->whereNumber('id')->name('approvals.reject');

    // Module 8 — Organ Lifecycle & Cold Chain. Same scoping contract as the
    // approval board: the owning hospital (and its linked admins/doctors) can
    // act; super_admin and auditor observe read-only.
    Route::get('/organs',                    [OrganController::class, 'index'])->name('organs.index');
    Route::get('/organs/metrics',            [OrganController::class, 'metrics'])->name('organs.metrics');
    Route::post('/organs',                   [OrganController::class, 'store'])->name('organs.store');
    Route::get('/organs/{id}',               [OrganController::class, 'show'])->whereNumber('id')->name('organs.show');
    Route::patch('/organs/{id}/status',      [OrganController::class, 'updateStatus'])->whereNumber('id')->name('organs.status');
    Route::post('/organs/{id}/events',       [OrganController::class, 'addEvent'])->whereNumber('id')->name('organs.events');

    // Module 9 — Surgery Scheduling & Resource Allocation. Booking safety is
    // enforced in SurgeryScheduler (row locks + overlap check in one transaction).
    Route::get('/surgery/resources',        [SurgeryController::class, 'resources'])->name('surgery.resources');
    Route::post('/surgery/resources',       [SurgeryController::class, 'storeResource'])->name('surgery.resources.store');
    Route::patch('/surgery/resources/{id}', [SurgeryController::class, 'updateResource'])->whereNumber('id')->name('surgery.resources.update');
    Route::get('/surgery/bookings',         [SurgeryController::class, 'bookings'])->name('surgery.bookings');
    Route::post('/surgery/bookings',        [SurgeryController::class, 'book'])->name('surgery.book');
    Route::patch('/surgery/bookings/{id}',  [SurgeryController::class, 'updateBooking'])->whereNumber('id')->name('surgery.bookings.update');
    Route::get('/surgery/calendar',         [SurgeryController::class, 'month'])->name('surgery.calendar');
    Route::get('/surgery/utilization',      [SurgeryController::class, 'utilization'])->name('surgery.utilization');

    // Admin-only routes
    Route::middleware(['role:super_admin|admin'])->group(function () {
        Route::post('/users/create-admin', [UserController::class, 'createAdmin'])->name('users.create-admin');

        // Hospital management
        Route::post('/hospitals/{hospital}/approve', [HospitalController::class, 'approve'])->name('hospitals.approve');
        Route::post('/hospitals/{hospital}/reject', [HospitalController::class, 'reject'])->name('hospitals.reject');
        Route::post('/hospitals/{hospital}/request-info', [HospitalController::class, 'requestInfo'])->name('hospitals.request-info');

    });

    // Module 4 — Explainable Allocation Engine
    // Restricted to hospitals + hospital-linked admins (not super_admin or unlinked admins) to prevent bias.
    Route::middleware(['role:hospital|admin'])->group(function () {
        // Employee management — hospital + linked admin can directly create employees for their hospital
        Route::post('/users/create-employee', [UserController::class, 'createEmployee'])->name('users.create-employee');

        Route::get('/allocation/policies',                  [AllocationController::class, 'listPolicies']);
        Route::post('/allocation/policies',                 [AllocationController::class, 'createPolicy']);
        Route::patch('/allocation/policies/{id}/activate',  [AllocationController::class, 'activatePolicy']);
        Route::get('/allocation/eligible-donors',           [AllocationController::class, 'eligibleDonors']);
        Route::post('/allocation/run',                      [AllocationController::class, 'run']);
        Route::get('/allocation/pending-allocations',       [AllocationController::class, 'pendingAllocations']);
        Route::post('/allocation/simulate',                 [AllocationController::class, 'simulate']);
        Route::get('/allocation/runs',                      [AllocationController::class, 'listRuns']);
        Route::get('/allocation/runs/{id}',                 [AllocationController::class, 'showRun']);

        // Module 5 — Matching & Override Governance
        Route::get('/allocation/compatibility-matrix',      [AllocationController::class, 'compatibilityMatrix']);
        Route::get('/allocation/hospital-distances',        [AllocationController::class, 'hospitalDistances']);
        Route::post('/allocation/decisions',                [AllocationController::class, 'createDecision']);
        Route::get('/allocation/decisions',                 [AllocationController::class, 'listDecisions']);
        Route::get('/allocation/override-stats',            [AllocationController::class, 'overrideStats']);

        // Module 6 — Fairness Lab
        Route::get('/allocation/fairness-overview',         [AllocationController::class, 'fairnessOverview']);
        Route::get('/allocation/runs/{id}/fairness',        [AllocationController::class, 'fairnessReport']);
        Route::get('/allocation/runs/{id}/sensitivity',     [AllocationController::class, 'sensitivityReport']);
        Route::get('/allocation/runs/{id}/export.csv',      [AllocationController::class, 'exportCsv']);
    });
});

// Health check + lightweight public feature flags the frontend uses to
// hide / show flow steps without redeploying.
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'features' => [
            'require_email_verification' => (bool) config('auth.require_email_verification'),
        ],
    ]);
});
