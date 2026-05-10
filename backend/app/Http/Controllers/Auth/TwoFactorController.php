<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class TwoFactorController extends Controller
{
    private const SETUP_TTL = 600;        // 10 min — for setup flow only
    private const LOGIN_TTL = 600;        // 10 min — challenge token stays alive long enough to resend several times
    private const LOGIN_CODE_TTL = 40;    // 40s — individual OTP code lifespan
    private const RESEND_COOLDOWN = 40;   // matches LOGIN_CODE_TTL so resend stays gated until current code expires

    /** POST /api/2fa/email/request-setup — auth required. Sends OTP to user's email to confirm 2FA setup. */
    public function requestSetupCode(Request $request): JsonResponse
    {
        $user = $request->user();

        $rlKey = '2fa-setup-send:'.$user->id;
        if (RateLimiter::tooManyAttempts($rlKey, 1)) {
            return response()->json([
                'message' => 'Please wait before requesting another code.',
                'retry_after' => RateLimiter::availableIn($rlKey),
            ], 429);
        }
        RateLimiter::hit($rlKey, self::RESEND_COOLDOWN);

        $code = (string) random_int(100000, 999999);
        Cache::put('2fa:setup:'.$user->id, $code, self::SETUP_TTL);

        $this->sendCode($user->email, $user->name, $code, 'Enable two-factor authentication');

        ActivityLogger::logAction($user->id, '2fa_setup_code_sent', '2FA setup code sent to '.$user->email);

        return response()->json(['message' => 'Verification code sent to your email.']);
    }

    /** POST /api/2fa/email/confirm-setup — auth required. Verifies setup code and enables 2FA. */
    public function confirmSetup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        $user = $request->user();
        $expected = Cache::get('2fa:setup:'.$user->id);

        if (!$expected || !hash_equals($expected, $data['code'])) {
            return response()->json(['message' => 'Invalid or expired code.'], 422);
        }

        Cache::forget('2fa:setup:'.$user->id);
        $user->update(['two_factor_enabled' => true]);

        ActivityLogger::logAction($user->id, '2fa_enabled', 'Two-factor authentication enabled');

        return response()->json([
            'message' => 'Two-factor authentication enabled.',
            'two_factor_enabled' => true,
        ]);
    }

    /** POST /api/2fa/email/disable — auth required. Requires password to disable. */
    public function disable(Request $request): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();
        if (!$user->password || !Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Incorrect password.'], 422);
        }

        $user->update(['two_factor_enabled' => false]);
        Cache::forget('2fa:setup:'.$user->id);

        ActivityLogger::logAction($user->id, '2fa_disabled', 'Two-factor authentication disabled');

        return response()->json([
            'message' => 'Two-factor authentication disabled.',
            'two_factor_enabled' => false,
        ]);
    }

    /** POST /api/2fa/email/resend — public. Resends the login OTP for an existing challenge. */
    public function resendLoginCode(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_token' => ['required', 'string'],
        ]);

        $payload = Cache::get('2fa:login:'.$data['challenge_token']);
        if (!$payload) {
            return response()->json(['message' => 'Challenge expired. Please log in again.'], 410);
        }

        $rlKey = '2fa-login-resend:'.$data['challenge_token'];
        if (RateLimiter::tooManyAttempts($rlKey, 1)) {
            return response()->json([
                'message' => 'Please wait before requesting another code.',
                'retry_after' => RateLimiter::availableIn($rlKey),
            ], 429);
        }
        RateLimiter::hit($rlKey, self::RESEND_COOLDOWN);

        $user = User::find($payload['user_id']);
        if (!$user) {
            return response()->json(['message' => 'User not found.'], 404);
        }

        $code = (string) random_int(100000, 999999);
        Cache::put('2fa:login:'.$data['challenge_token'], [
            'user_id' => $user->id,
            'code' => $code,
            'code_expires_at' => now()->addSeconds(self::LOGIN_CODE_TTL)->timestamp,
        ], self::LOGIN_TTL);

        Mail::raw(
            "Hello {$user->name},\n\nYour ODCAT sign-in verification code is: {$code}\n\nThis code expires in 40 seconds. If you did not attempt to sign in, please ignore this email.\n\n— ODCAT",
            function ($m) use ($user) {
                $m->to($user->email)->subject('Sign-in verification code');
            }
        );

        return response()->json(['message' => 'Verification code resent.']);
    }

    /** POST /api/2fa/email/verify — public. Verifies login OTP and issues a Sanctum token. */
    public function verifyLoginCode(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_token' => ['required', 'string'],
            'code' => ['required', 'string', 'size:6'],
        ]);

        $rlKey = '2fa-login-verify:'.$data['challenge_token'];
        if (RateLimiter::tooManyAttempts($rlKey, 5)) {
            return response()->json([
                'message' => 'Too many attempts. Request a new code.',
            ], 429);
        }

        $payload = Cache::get('2fa:login:'.$data['challenge_token']);
        if (!$payload || !isset($payload['code'], $payload['code_expires_at'])) {
            RateLimiter::hit($rlKey, self::LOGIN_TTL);
            return response()->json(['message' => 'Invalid or expired code.'], 422);
        }
        if (now()->timestamp > $payload['code_expires_at']) {
            return response()->json(['message' => 'Code expired. Please request a new one.'], 422);
        }
        if (!hash_equals($payload['code'], $data['code'])) {
            RateLimiter::hit($rlKey, self::LOGIN_TTL);
            return response()->json(['message' => 'Invalid code.'], 422);
        }

        Cache::forget('2fa:login:'.$data['challenge_token']);
        RateLimiter::clear($rlKey);

        $user = User::find($payload['user_id']);
        if (!$user) {
            return response()->json(['message' => 'User not found.'], 404);
        }

        $user->update([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        ActivityLogger::logAction($user->id, 'login_success_2fa', 'User logged in with 2FA');

        $auth = app(AuthController::class);
        return response()->json([
            'user' => $auth->userResource($user->load(['hospitalProfile', 'donorProfile', 'recipientProfile', 'clinicalProfile'])),
            'token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    /** Issue a login challenge (called from AuthController::login when 2FA is enabled). */
    public static function issueLoginChallenge(User $user): array
    {
        $challengeToken = Str::random(48);
        $code = (string) random_int(100000, 999999);

        Cache::put('2fa:login:'.$challengeToken, [
            'user_id' => $user->id,
            'code' => $code,
            'code_expires_at' => now()->addSeconds(self::LOGIN_CODE_TTL)->timestamp,
        ], self::LOGIN_TTL);

        Mail::raw(
            "Hello {$user->name},\n\nYour ODCAT sign-in verification code is: {$code}\n\nThis code expires in 40 seconds. If you did not attempt to sign in, please ignore this email.\n\n— ODCAT",
            function ($m) use ($user) {
                $m->to($user->email)->subject('Sign-in verification code');
            }
        );

        return [
            'requires_2fa' => true,
            'challenge_token' => $challengeToken,
            'masked_email' => self::maskEmail($user->email),
            'expires_in' => self::LOGIN_CODE_TTL,
        ];
    }

    private function sendCode(string $email, string $name, string $code, string $subject): void
    {
        Mail::raw(
            "Hello {$name},\n\nYour ODCAT verification code is: {$code}\n\nThis code expires in 10 minutes. If you did not request it, please ignore this email.\n\n— ODCAT",
            function ($m) use ($email, $subject) {
                $m->to($email)->subject($subject);
            }
        );
    }

    private static function maskEmail(string $email): string
    {
        [$local, $domain] = explode('@', $email, 2);
        $visible = mb_substr($local, 0, min(2, mb_strlen($local)));
        return $visible.str_repeat('*', max(2, mb_strlen($local) - 2)).'@'.$domain;
    }
}
