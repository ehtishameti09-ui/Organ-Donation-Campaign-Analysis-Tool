<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Rules\StrongPassword;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use App\Models\User;

class PasswordResetController extends Controller
{
    public function sendResetLink(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $key = 'password-reset:'.strtolower($request->email).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json([
                'message' => 'Too many reset requests. Try again in '.RateLimiter::availableIn($key).' seconds.',
            ], 429);
        }
        RateLimiter::hit($key, 600);

        $status = Password::sendResetLink($request->only('email'));

        ActivityLogger::logAction(
            User::where('email', $request->email)->value('id') ?? 0,
            'password_reset_requested',
            'Password reset link requested',
            ['email' => $request->email]
        );

        return response()->json([
            'message' => $status === Password::RESET_LINK_SENT
                ? 'Password reset link sent. Check your email (or storage/logs/laravel.log in dev).'
                : 'Unable to send reset link. Please verify the email is registered.',
            'status' => $status,
        ], $status === Password::RESET_LINK_SENT ? 200 : 422);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', new StrongPassword],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, $password) {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();

                $user->tokens()->delete(); // invalidate all sessions
                event(new PasswordReset($user));
                ActivityLogger::logAction($user->id, 'password_reset', 'Password reset successful');
            }
        );

        return response()->json([
            'message' => $status === Password::PASSWORD_RESET
                ? 'Password reset successful. Please log in with your new password.'
                : 'Invalid or expired reset token.',
            'status' => $status,
        ], $status === Password::PASSWORD_RESET ? 200 : 422);
    }
}
