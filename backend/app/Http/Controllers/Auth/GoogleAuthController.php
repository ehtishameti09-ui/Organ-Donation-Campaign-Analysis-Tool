<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\ClinicalProfile;
use App\Models\DonorProfile;
use App\Models\RecipientProfile;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rule;
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
        // What the user clicked: "Sign in with Google" or "Sign up with Google
        // as a donor / recipient / hospital". The role is chosen on OUR screen
        // before the redirect — never guessed from the Google profile afterwards.
        $data = $request->validate([
            'intent' => ['sometimes', Rule::in(['login', 'signup'])],
            'role'   => ['sometimes', Rule::in(['donor', 'recipient', 'hospital'])],
        ]);

        $intent = $data['intent'] ?? 'login';
        $role   = $data['role'] ?? null;

        if ($intent === 'signup' && !$role) {
            $err = urlencode('Please choose whether you are registering as a donor, recipient or hospital.');
            return redirect(config('services.frontend_url').'/?error='.$err.'&register=1');
        }

        // Google round-trips `state` verbatim, so it is the only way to carry
        // our own context across the consent screen. It is ENCRYPTED rather than
        // merely encoded: the role decides what kind of account gets created, so
        // a user-editable value there would let someone pick their own role.
        $state = Crypt::encryptString(json_encode([
            'intent' => $intent,
            'role'   => $role,
            'iat'    => now()->timestamp,
        ]));

        return Socialite::driver('google')
            ->stateless()
            ->scopes(['openid', 'profile', 'email'])
            // `prompt=select_account` forces Google to show the account chooser every time,
            // even if the user is already signed into Google — so they can switch accounts.
            ->with(['prompt' => 'select_account', 'state' => $state])
            ->redirect();
    }

    /**
     * Read back the context we set before the consent screen.
     * Anything we cannot decrypt is treated as a plain login attempt.
     */
    private function readState(Request $request): array
    {
        $default = ['intent' => 'login', 'role' => null];

        $raw = $request->get('state');
        if (!$raw) return $default;

        try {
            $payload = json_decode(Crypt::decryptString($raw), true) ?: [];
        } catch (\Throwable) {
            return $default;   // tampered or stale — fall back to login
        }

        // A consent round trip takes seconds; anything older than 15 minutes is
        // a replayed link rather than a live sign-in.
        if (($payload['iat'] ?? 0) < now()->subMinutes(15)->timestamp) {
            return $default;
        }

        return [
            'intent' => in_array($payload['intent'] ?? null, ['login', 'signup'], true) ? $payload['intent'] : 'login',
            'role'   => in_array($payload['role'] ?? null, ['donor', 'recipient', 'hospital'], true) ? $payload['role'] : null,
        ];
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

        $state  = $this->readState($request);
        $email  = strtolower(trim($googleUser->getEmail()));
        $isNew  = false;

        // Matching on google_id is the trustworthy path: that link was
        // established by a previous successful sign-in.
        $user = User::where('google_id', $googleUser->getId())->first();

        if (!$user) {
            $byEmail = User::where('email', $email)->first();

            if ($byEmail) {
                // Someone else's Google account already owns this record.
                if ($byEmail->google_id && $byEmail->google_id !== $googleUser->getId()) {
                    $err = urlencode('This email is already linked to a different Google account. Sign in with that account, or use your password.');
                    return redirect(config('services.frontend_url').'/?error='.$err);
                }

                // PRE-REGISTRATION TAKEOVER GUARD.
                //
                // Auto-linking Google to any account that merely shares the email
                // address assumes that address was proven. If an account was
                // created without proving it, linking here would sign the real
                // mailbox owner into a stranger's account - and the stranger's
                // password would keep working. So an unverified account must be
                // claimed with its password first; linking then happens on the
                // normal login path.
                if (!$byEmail->email_verified_at) {
                    $err = urlencode('An unverified account already exists for this email. Sign in with your password once to confirm it is yours, then Google sign-in will be linked automatically.');
                    return redirect(config('services.frontend_url').'/?error='.$err);
                }

                $user = $byEmail;
            }
        }

        // === NO ACCOUNT YET ===
        if (!$user) {
            if ($state['intent'] !== 'signup' || !$state['role']) {
                $err = urlencode('You do not have an account with this email. Please create an account first, then sign in with Google.');
                // `register=1` tells the frontend to drop the user straight on the Create-account screen.
                return redirect(config('services.frontend_url').'/?error='.$err.'&register=1');
            }

            $user  = $this->createFromGoogle($googleUser, $state['role']);
            $isNew = true;
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

        // A brand-new account still has to finish its profile - the clinical
        // wizard for patients, the registration form for hospitals. `setup=1`
        // sends them straight there instead of to a dashboard they cannot use.
        $params = ['token' => $token, 'user_id' => $user->id];
        if ($isNew) $params['setup'] = '1';

        return redirect(config('services.frontend_url').'/?'.http_build_query($params));
    }

    /**
     * Create an account from a Google profile.
     *
     * Mirrors AuthController::register exactly - same status, same unique_id
     * scheme, same role profiles - so a Google-created account is
     * indistinguishable downstream from an email/password one. The differences
     * are deliberate and limited to two things:
     *
     *   - No password. The account is reachable only through Google until the
     *     user sets one; the column is nullable for exactly this case.
     *   - email_verified_at is set, because Google has already proven the user
     *     controls this mailbox. Mailing them a code to confirm an address
     *     Google just vouched for verifies nothing and only adds friction.
     *
     * What is NOT skipped: hospitals still land on `pending` with no profile, so
     * the licence and registration documents still go to the super admin for
     * review. Google proves an email address; it says nothing about whether
     * someone may operate a transplant centre.
     */
    private function createFromGoogle($googleUser, string $role): User
    {
        $user = User::create([
            'name'                  => $googleUser->getName() ?: ($googleUser->getNickname() ?: 'New User'),
            'email'                 => strtolower(trim($googleUser->getEmail())),
            'password'              => null,
            'role'                  => $role,
            'status'                => $role === 'hospital' ? 'pending' : 'registered',
            'registration_type'     => $role === 'hospital' ? 'hospital_request' : 'user_self',
            // Hospitals signing up through Google have not supplied their
            // registration number or licence yet - HospitalRegistrationForm
            // collects those next - so this is false for every role here.
            'registration_complete' => false,
            'email_verified_at'     => now(),
            'google_id'             => $googleUser->getId(),
            'avatar'                => $googleUser->getAvatar(),
            'two_factor_enabled'    => false,
        ]);

        $prefix = match ($role) {
            'donor'     => 'DON',
            'recipient' => 'REC',
            'hospital'  => 'HOS',
            default     => 'USR',
        };
        $user->update([
            'unique_id' => $prefix.'-'.date('Y').'-'.str_pad($user->id, 4, '0', STR_PAD_LEFT),
        ]);

        $user->assignRole($role);

        if ($role === 'donor') {
            DonorProfile::create(['user_id' => $user->id]);
            ClinicalProfile::create(['user_id' => $user->id]);
        } elseif ($role === 'recipient') {
            RecipientProfile::create(['user_id' => $user->id]);
            ClinicalProfile::create(['user_id' => $user->id]);
        }
        // Hospitals get no HospitalProfile yet - it is created when they submit
        // the registration form, which is what the super admin then reviews.

        ActivityLogger::logActivity(
            type: $role.'_registered',
            title: ucfirst($role).' registered',
            description: $user->name.' ('.$user->email.') signed up with Google as '.$role,
            extra: ['user_id' => $user->id, 'actor_id' => $user->id]
        );
        ActivityLogger::logAction($user->id, 'register_google', 'New '.$role.' registration via Google');

        if ($role === 'hospital') {
            \Illuminate\Support\Facades\Cache::forget('hospitals:overview:v1');
        }

        return $user;
    }
}
