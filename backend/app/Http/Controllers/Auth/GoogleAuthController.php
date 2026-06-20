<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
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
            // Log the real cause — otherwise it vanishes into a redirect URL and the
            // failure is impossible to diagnose from the server side.
            \Illuminate\Support\Facades\Log::error('Google OAuth callback failed', [
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);
            $err = urlencode($e->getMessage());
            return redirect(config('services.frontend_url').'/?error='.$err);
        }

        $user = User::where('google_id', $googleUser->getId())
            ->orWhere('email', $googleUser->getEmail())
            ->first();

        // === NEW USER: Google is login-only — no account, no entry. ===
        // We don't auto-register via Google; the user must create an account first.
        if (!$user) {
            $err = urlencode('You do not have an account with this email. Please create an account first, then sign in with Google.');
            // `register=1` tells the frontend to drop the user straight on the Create-account screen.
            return redirect(config('services.frontend_url').'/?error='.$err.'&register=1');
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
}
