<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\PasswordResetController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\HospitalController;
use App\Http\Controllers\DonorController;
use App\Http\Controllers\RecipientController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\AppealController;
use App\Http\Controllers\ActivityController;
use App\Http\Controllers\DashboardController;

// Public routes (no authentication required)
Route::post('/register', [AuthController::class, 'register'])->name('register');
Route::post('/login', [AuthController::class, 'login'])->name('login');
Route::post('/password-reset/send-link', [PasswordResetController::class, 'sendResetLink'])->name('password.send-link');
Route::post('/password-reset/reset', [PasswordResetController::class, 'reset'])->name('password.reset');
Route::post('/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])->name('verification.verify');
Route::get('/oauth/google/redirect', [GoogleAuthController::class, 'redirect'])->name('oauth.google.redirect');
Route::get('/oauth/google/callback', [GoogleAuthController::class, 'callback'])->name('oauth.google.callback');

// Authenticated routes
Route::middleware(['auth:sanctum', 'verified.email', 'not.banned', 'audit'])->group(function () {
    // Auth routes
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
    Route::get('/me', [AuthController::class, 'me'])->name('me');
    Route::post('/email/resend-verification', [AuthController::class, 'resendVerification'])->name('verification.resend');

    // User profile and account management
    Route::get('/users', [UserController::class, 'index'])->name('users.index');
    Route::get('/users/{user}', [UserController::class, 'show'])->name('users.show');
    Route::patch('/users/{user}', [UserController::class, 'update'])->name('users.update');
    Route::post('/users/{user}/ban', [UserController::class, 'ban'])->name('users.ban');
    Route::post('/users/{user}/unban', [UserController::class, 'unban'])->name('users.unban');
    Route::post('/users/restore-self', [UserController::class, 'restoreSelf'])->name('users.restore-self');
    Route::post('/users/delete-self', [UserController::class, 'deleteSelf'])->name('users.delete-self');
    Route::delete('/users/{user}', [UserController::class, 'destroy'])->name('users.destroy');
    Route::post('/users/{user}/change-password', [UserController::class, 'changePassword'])->name('users.change-password');

    // Hospitals
    Route::get('/hospitals', [HospitalController::class, 'index'])->name('hospitals.index');
    Route::get('/hospitals/pending', [HospitalController::class, 'pending'])->name('hospitals.pending');

    // Donors
    Route::get('/donors', [DonorController::class, 'index'])->name('donors.index');
    Route::post('/donors/complete-registration', [DonorController::class, 'completeRegistration'])->name('donors.complete-registration');
    Route::post('/donors/sign-consent', [DonorController::class, 'signConsent'])->name('donors.sign-consent');
    Route::post('/donors/{donor}/verify', [DonorController::class, 'verify'])->name('donors.verify');

    // Recipients
    Route::get('/recipients', [RecipientController::class, 'index'])->name('recipients.index');
    Route::post('/recipients/complete-registration', [RecipientController::class, 'completeRegistration'])->name('recipients.complete-registration');
    Route::post('/recipients/{recipient}/verify', [RecipientController::class, 'verify'])->name('recipients.verify');

    // Documents
    Route::post('/documents/upload', [DocumentController::class, 'upload'])->name('documents.upload');
    Route::get('/documents', [DocumentController::class, 'index'])->name('documents.index');
    Route::get('/documents/{document}/download', [DocumentController::class, 'download'])->name('documents.download');
    Route::delete('/documents/{document}', [DocumentController::class, 'destroy'])->name('documents.destroy');
    Route::post('/documents/{document}/review', [DocumentController::class, 'review'])->name('documents.review');

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

    // Dashboard metrics — accessible to all authenticated users (controller handles role scoping)
    Route::get('/dashboard/metrics', [DashboardController::class, 'metrics'])->name('dashboard.metrics');

    // Admin-only routes
    Route::middleware(['role:super_admin|admin'])->group(function () {
        Route::post('/users/create-admin', [UserController::class, 'createAdmin'])->name('users.create-admin');
        Route::get('/audit-logs', [ActivityController::class, 'auditLogs'])->name('audit-logs.index');

        // Hospital management
        Route::post('/hospitals/{hospital}/approve', [HospitalController::class, 'approve'])->name('hospitals.approve');
        Route::post('/hospitals/{hospital}/reject', [HospitalController::class, 'reject'])->name('hospitals.reject');
        Route::post('/hospitals/{hospital}/request-info', [HospitalController::class, 'requestInfo'])->name('hospitals.request-info');
    });
});

// Health check
Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});
