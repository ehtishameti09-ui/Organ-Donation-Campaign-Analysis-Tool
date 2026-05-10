<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\DonorProfile;
use App\Models\RecipientProfile;
use App\Models\HospitalProfile;
use App\Models\ClinicalProfile;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    /** GET /api/oauth/google/status — frontend checks this before showing the Google button */
    public function status(): JsonResponse
    {
        return response()->json([
            'configured' => !empty(config('services.google.client_id')) && !empty(config('services.google.client_secret')),
        ]);
    }

    /**
     * Redirect to Google OAuth consent screen.
     * Frontend should redirect the browser to this URL.
     */
    public function redirect(Request $request)
    {
        if (!config('services.google.client_id')) {
            // If the browser is the navigator (not an XHR), bounce them back to login with a friendly toast
            if (!$request->wantsJson()) {
                $err = urlencode('Google sign-in is not yet configured on this server. Use email/password instead, or contact the administrator.');
                return redirect(config('services.frontend_url').'/?error='.$err);
            }
            return response()->json([
                'message'    => 'Google OAuth is not configured on this server.',
                'configured' => false,
            ], 503);
        }
        return Socialite::driver('google')
            ->stateless()
            ->scopes(['openid', 'profile', 'email'])
            // `prompt=select_account` forces Google to show the account chooser every time,
            // even if the user is already signed into Google — so they can switch accounts.
            ->with(['prompt' => 'select_account'])
            ->redirect();
    }

    /**
     * Handle Google OAuth callback. Creates or finds the user, issues a Sanctum token,
     * and redirects back to frontend with the token in the URL fragment.
     */
    public function callback(Request $request)
    {
        try {
            $googleUser = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable $e) {
            $err = urlencode($e->getMessage());
            return redirect(config('services.frontend_url').'/login?error='.$err);
        }

        $user = User::where('google_id', $googleUser->getId())
            ->orWhere('email', $googleUser->getEmail())
            ->first();

        // === NEW USER: stash pending Google profile and let frontend pick role ===
        if (!$user) {
            $pendingToken = Str::random(40);
            Cache::put("google_pending:{$pendingToken}", [
                'google_id' => $googleUser->getId(),
                'email'     => $googleUser->getEmail(),
                'name'      => $googleUser->getName() ?: 'Google User',
                'avatar'    => $googleUser->getAvatar(),
            ], now()->addMinutes(30));

            $params = http_build_query([
                'google_pending' => $pendingToken,
                'name'           => $googleUser->getName(),
                'email'          => $googleUser->getEmail(),
            ]);
            return redirect(config('services.frontend_url').'/?'.$params);
        }

        // === EXISTING USER: link Google ID if missing, then sign in ===
        if (!$user->google_id) $user->google_id = $googleUser->getId();
        if (!$user->email_verified_at) $user->email_verified_at = now();
        if (!$user->avatar) $user->avatar = $googleUser->getAvatar();
        $user->last_login_at = now();
        $user->last_login_ip = $request->ip();
        $user->save();

        if ($user->banned) {
            $err = urlencode('Account banned. Please contact support.');
            return redirect(config('services.frontend_url').'/?error='.$err);
        }

        // 2FA gate — same as the email/password login path.
        // Don't issue a token; mail an OTP and redirect with a challenge token.
        if ($user->two_factor_enabled) {
            $challenge = TwoFactorController::issueLoginChallenge($user);
            ActivityLogger::logAction($user->id, '2fa_challenge_issued', '2FA challenge issued (Google)');
            $params = http_build_query([
                'google_2fa'    => $challenge['challenge_token'],
                'masked_email'  => $challenge['masked_email'],
            ]);
            return redirect(config('services.frontend_url').'/?'.$params);
        }

        $token = $user->createToken('google_auth_token')->plainTextToken;
        ActivityLogger::logAction($user->id, 'login_google', 'User logged in via Google');

        return redirect(config('services.frontend_url').'/?token='.urlencode($token).'&user_id='.$user->id);
    }

    /** POST /api/oauth/google/complete-registration — finalize new Google account with chosen role */
    public function completeRegistration(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pending_token'    => ['required', 'string', 'size:40'],
            'role'             => ['required', 'in:donor,recipient,hospital'],
            'hospital_name'    => ['nullable', 'string', 'max:120'],   // only when role=hospital
        ]);

        // Use Cache::get (not pull) so a transient failure doesn't burn the token and let user retry
        $cacheKey = "google_pending:{$data['pending_token']}";
        $pending = Cache::get($cacheKey);
        if (!$pending) {
            return response()->json(['message' => 'Registration session expired. Please sign in with Google again.'], 422);
        }
        if (User::where('email', $pending['email'])->exists()) {
            Cache::forget($cacheKey); // dead session, clear it
            return response()->json(['message' => 'An account with this email already exists. Please sign in instead.'], 422);
        }

        // Hospitals go through approval, donors/recipients are immediately registered
        $isHospital = $data['role'] === 'hospital';
        $user = User::create([
            'name'                  => $pending['name'],
            'email'                 => $pending['email'],
            'google_id'             => $pending['google_id'],
            'avatar'                => $pending['avatar'],
            'role'                  => $data['role'],
            'status'                => $isHospital ? 'pending' : 'registered',
            'registration_type'     => $isHospital ? 'hospital_request' : 'user_self',
            'email_verified_at'     => now(),
            'password'              => null,
            'registration_complete' => false,
        ]);
        $user->assignRole($data['role']);

        // Create role-specific profile
        if ($data['role'] === 'donor') {
            DonorProfile::create(['user_id' => $user->id]);
            ClinicalProfile::create(['user_id' => $user->id]);
        } elseif ($data['role'] === 'recipient') {
            RecipientProfile::create(['user_id' => $user->id]);
            ClinicalProfile::create(['user_id' => $user->id]);
        } elseif ($data['role'] === 'hospital') {
            HospitalProfile::create([
                'user_id'       => $user->id,
                'hospital_name' => $data['hospital_name'] ?: $pending['name'],
            ]);
        }

        ActivityLogger::logActivity(
            $data['role'].'_registered',
            ucfirst($data['role']).' registered via Google',
            "{$user->name} signed up as {$data['role']} using Google OAuth",
            ['user_id' => $user->id, 'actor_id' => $user->id]
        );
        ActivityLogger::logAction($user->id, 'register_google', "Self-registered as {$data['role']} via Google");

        $token = $user->createToken('google_auth_token')->plainTextToken;
        Cache::forget($cacheKey); // success — burn the token so it can't be reused
        return response()->json([
            'token' => $token,
            'user'  => app(\App\Http\Controllers\Auth\AuthController::class)->userResource($user),
        ]);
    }
}
