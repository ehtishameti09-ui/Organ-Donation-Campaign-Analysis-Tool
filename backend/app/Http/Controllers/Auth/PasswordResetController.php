<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Rules\StrongPassword;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use App\Models\User;

class PasswordResetController extends Controller
{
    private const CODE_TTL = 120;        // 120 seconds — short-lived, single-use
    private const MAX_VERIFY_ATTEMPTS = 5;

    private static function cacheKey(string $email): string
    {
        return 'pwreset:'.strtolower(trim($email));
    }

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

        $user = User::where('email', $request->email)->first();

        // Only registered accounts can reset a password. Reject unknown emails explicitly
        // so the user gets clear feedback instead of being sent to a code screen for an
        // address that has no account.
        if (!$user) {
            return response()->json([
                'message' => 'No account is registered with this email address. Please check the email or create an account.',
            ], 404);
        }

        // Deleted / banned accounts can't reset — they have their own recovery/appeal flows
        if ($user->is_deleted) {
            return response()->json([
                'message' => 'This account has been deleted. Password reset is not available — use the account recovery option on the login screen.',
            ], 403);
        }

        $code = (string) random_int(100000, 999999); // 6-digit

        Cache::put(self::cacheKey($request->email), [
            'code'     => $code,
            'attempts' => 0,
        ], self::CODE_TTL);

        Mail::raw(
            "Hello".($user->name ? ', '.$user->name : '').",\n\n"
            ."Your ODCAT password reset code is: {$code}\n\n"
            ."Enter this code on the password reset screen to choose a new password. "
            ."It expires in 2 minutes and can only be used once, so enter it promptly.\n\n"
            ."If you did not request a password reset, you can safely ignore this email — your password will not change.\n\n"
            ."— ODCAT",
            function ($m) use ($user) {
                $m->to($user->email)->subject('Your ODCAT password reset code');
            }
        );

        ActivityLogger::logAction($user->id, 'password_reset_requested', 'Password reset code requested', ['email' => $request->email]);

        return response()->json([
            'message' => 'A 6-digit reset code has been sent to your email. Check your inbox (or storage/logs/laravel.log in dev).',
        ], 200);
    }

    /** POST /api/password-reset/verify-code — checks a code is valid WITHOUT consuming it,
     *  so the UI can confirm the code before showing the new-password step. */
    public function verifyCode(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'code'  => ['required', 'string'],
        ]);

        $cacheKey = self::cacheKey($request->email);
        $entry = Cache::get($cacheKey);

        if (!$entry || !isset($entry['code'])) {
            return response()->json(['message' => 'Invalid or expired reset code. Please request a new one.'], 422);
        }
        if (($entry['attempts'] ?? 0) >= self::MAX_VERIFY_ATTEMPTS) {
            Cache::forget($cacheKey);
            return response()->json(['message' => 'Too many incorrect attempts. Please request a new reset code.'], 429);
        }
        if (!hash_equals((string) $entry['code'], trim($request->code))) {
            $entry['attempts'] = ($entry['attempts'] ?? 0) + 1;
            Cache::put($cacheKey, $entry, self::CODE_TTL);
            $remaining = self::MAX_VERIFY_ATTEMPTS - $entry['attempts'];
            return response()->json([
                'message' => 'Incorrect reset code.'.($remaining > 0 ? " {$remaining} attempt(s) left." : ' Please request a new code.'),
            ], 422);
        }

        return response()->json(['message' => 'Code verified. You can now set a new password.'], 200);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token'    => ['required', 'string'], // the 6-digit code (kept as `token` so the frontend contract is unchanged)
            'email'    => ['required', 'email'],
            'password' => ['required', 'confirmed', new StrongPassword],
        ]);

        $cacheKey = self::cacheKey($request->email);
        $entry = Cache::get($cacheKey);

        if (!$entry || !isset($entry['code'])) {
            return response()->json(['message' => 'Invalid or expired reset code. Please request a new one.'], 422);
        }

        if (($entry['attempts'] ?? 0) >= self::MAX_VERIFY_ATTEMPTS) {
            Cache::forget($cacheKey);
            return response()->json(['message' => 'Too many incorrect attempts. Please request a new reset code.'], 429);
        }

        if (!hash_equals((string) $entry['code'], trim($request->token))) {
            $entry['attempts'] = ($entry['attempts'] ?? 0) + 1;
            Cache::put($cacheKey, $entry, self::CODE_TTL);
            return response()->json(['message' => 'Incorrect reset code. Please check the code and try again.'], 422);
        }

        $user = User::where('email', $request->email)->first();
        if (!$user) {
            Cache::forget($cacheKey);
            return response()->json(['message' => 'Account not found.'], 422);
        }

        $user->password = $request->password; // hashed via model cast
        $user->remember_token = \Illuminate\Support\Str::random(60);
        $user->save();
        $user->tokens()->delete(); // invalidate all sessions

        Cache::forget($cacheKey);
        ActivityLogger::logAction($user->id, 'password_reset', 'Password reset successful');

        return response()->json([
            'message' => 'Password reset successful. Please log in with your new password.',
        ], 200);
    }
}
