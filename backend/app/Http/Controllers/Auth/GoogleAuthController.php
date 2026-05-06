<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\DonorProfile;
use App\Models\ClinicalProfile;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    /**
     * Redirect to Google OAuth consent screen.
     * Frontend should redirect the browser to this URL.
     */
    public function redirect()
    {
        if (!config('services.google.client_id')) {
            return response()->json([
                'message' => 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.',
            ], 503);
        }
        return Socialite::driver('google')
            ->stateless()
            ->scopes(['openid', 'profile', 'email'])
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

        if (!$user) {
            // First-time Google user — create as donor by default
            $user = User::create([
                'name' => $googleUser->getName() ?: 'Google User',
                'email' => $googleUser->getEmail(),
                'google_id' => $googleUser->getId(),
                'avatar' => $googleUser->getAvatar(),
                'role' => 'donor',
                'status' => 'registered',
                'registration_type' => 'user_self',
                'email_verified_at' => now(), // Google verifies email
                'password' => null,
            ]);
            $user->assignRole('donor');
            DonorProfile::create(['user_id' => $user->id]);
            ClinicalProfile::create(['user_id' => $user->id]);

            ActivityLogger::logActivity('donor_registered', 'Donor registered via Google', $user->name.' signed up using Google OAuth', [
                'user_id' => $user->id, 'actor_id' => $user->id,
            ]);
        } else {
            // Link Google ID if missing
            if (!$user->google_id) {
                $user->google_id = $googleUser->getId();
            }
            if (!$user->email_verified_at) {
                $user->email_verified_at = now();
            }
            if (!$user->avatar) {
                $user->avatar = $googleUser->getAvatar();
            }
            $user->last_login_at = now();
            $user->last_login_ip = $request->ip();
            $user->save();
        }

        // Banned check
        if ($user->banned) {
            $err = urlencode('Account banned. Please contact support.');
            return redirect(config('services.frontend_url').'/login?error='.$err);
        }

        $token = $user->createToken('google_auth_token')->plainTextToken;
        ActivityLogger::logAction($user->id, 'login_google', 'User logged in via Google');

        $frontendUrl = config('services.frontend_url').'/login?token='.urlencode($token).'&user_id='.$user->id;
        return redirect($frontendUrl);
    }
}
