<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * Pre-account email verification. The verification state is held entirely in
 * the cache (no DB row is created until the user submits the final
 * registration form). The cache token doubles as proof for the eventual
 * /api/register call.
 */
class EmailVerificationController extends Controller
{
    private const TTL_SECONDS          = 120;  // 2 minutes — unverified link auto-expires
    private const VERIFIED_TTL_SECONDS = 1800; // 30 minutes once verified, so the user has time to finish the form
    private const KEY_PREFIX   = 'ev:';
    private const CUR_PREFIX   = 'ev-cur:'; // per-email index of the currently active token

    // Per-(email+ip) attempt policy:
    //   - first 3 attempts allowed back-to-back
    //   - after the 3rd attempt, a 30s cooldown must pass before the next
    //   - hard cap of 5 attempts in a rolling 10-minute window
    private const ATT_KEY_PREFIX   = 'ev-att:';
    private const ATT_MAX          = 5;
    private const ATT_COOLDOWN_AFTER_NTH = 3;
    private const ATT_COOLDOWN_SEC = 30;
    private const ATT_WINDOW_SEC   = 600; // 10 min

    /** POST /api/auth/email/start  { email } -> { token } */
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc,strict', 'max:191', 'regex:/^[A-Za-z0-9._%+\-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,24}$/'],
        ]);
        $email = strtolower(trim($data['email']));

        // Reject domains that look like typos of recognized providers
        // (@ggmail.com, @yaho.com, @1234gmail.com…) while accepting any other
        // domain (hospital / educational / company emails work normally).
        if (!\App\Support\EmailDomainPolicy::isAcceptable($email)) {
            return response()->json([
                'message' => 'That email domain looks like a typo of a recognized provider. Please check and try again.',
            ], 422);
        }

        // Reject emails that already belong to a real account — clearer UX
        // and avoids the user thinking the account was created here.
        if (User::where('email', $email)->exists()) {
            return response()->json([
                'message' => 'An account with this email already exists. Please sign in instead.',
            ], 409);
        }

        // ---- attempt-policy gate ----
        $attKey = self::ATT_KEY_PREFIX.$email.'|'.$request->ip();
        $now = now()->timestamp;
        $state = Cache::get($attKey) ?: ['count' => 0, 'first_at' => $now, 'last_at' => 0];

        // Rolling window reset.
        if ($now - $state['first_at'] >= self::ATT_WINDOW_SEC) {
            $state = ['count' => 0, 'first_at' => $now, 'last_at' => 0];
        }

        if ($state['count'] >= self::ATT_MAX) {
            $waitSec = max(0, self::ATT_WINDOW_SEC - ($now - $state['first_at']));
            return response()->json([
                'message'    => "Too many verification attempts. Please try again in ".max(1, (int) ceil($waitSec / 60))." minute(s).",
                'locked_for' => $waitSec,
            ], 429);
        }
        if ($state['count'] >= self::ATT_COOLDOWN_AFTER_NTH) {
            $sinceLast = $now - $state['last_at'];
            if ($sinceLast < self::ATT_COOLDOWN_SEC) {
                $wait = self::ATT_COOLDOWN_SEC - $sinceLast;
                return response()->json([
                    'message'        => "Please wait {$wait} seconds before requesting another verification email.",
                    'cooldown_for'   => $wait,
                    'attempts_used'  => $state['count'],
                    'attempts_left'  => self::ATT_MAX - $state['count'],
                ], 429);
            }
        }

        // Record this attempt before the (possibly slow) email send.
        $state['count']++;
        $state['last_at'] = $now;
        Cache::put($attKey, $state, self::ATT_WINDOW_SEC);

        // Supersede (don't delete) any previously-issued token for this email.
        // Keeping the row — with status='superseded' — lets a user who later
        // clicks the OLD email's Yes/No button still affect the right account
        // (the controller routes their intent to the CURRENT token).
        $curKey  = self::CUR_PREFIX.$email;
        $oldToken = Cache::get($curKey);
        if ($oldToken) {
            $oldEntry = Cache::get(self::KEY_PREFIX.$oldToken);
            if ($oldEntry && ($oldEntry['status'] ?? null) === 'pending') {
                $oldEntry['status']        = 'superseded';
                $oldEntry['superseded_at'] = now()->toIso8601String();
                Cache::put(self::KEY_PREFIX.$oldToken, $oldEntry, 60);
            } else {
                Cache::forget(self::KEY_PREFIX.$oldToken);
            }
        }

        $token = Str::random(64);
        Cache::put(self::KEY_PREFIX.$token, [
            'email'       => $email,
            'status'      => 'pending', // 'pending' | 'verified' | 'cancelled'
            'ip'          => $request->ip(),
            'created_at'  => now()->toIso8601String(),
        ], self::TTL_SECONDS);
        Cache::put($curKey, $token, self::TTL_SECONDS);

        // Send the email and bubble failures up — silent success on SMTP
        // throttling is worse than an explicit error the user can react to.
        $sendError = $this->sendVerificationEmail($email, $token);
        if ($sendError !== null) {
            // Roll back this attempt so the user can retry without burning their quota.
            $state['count'] = max(0, $state['count'] - 1);
            Cache::put($attKey, $state, self::ATT_WINDOW_SEC);
            Cache::forget(self::KEY_PREFIX.$token);
            Cache::forget($curKey);
            return response()->json([
                'message' => 'We could not send the verification email right now. Please try again in a moment.',
                'detail'  => $sendError,
            ], 502);
        }

        Log::info('Email verification started', ['email' => $email, 'ip' => $request->ip(), 'invalidated_previous' => (bool) $oldToken]);

        return response()->json([
            'message'        => 'Verification email sent. Please check your inbox. Older links are no longer valid.',
            'token'          => $token,
            'expires_in'     => self::TTL_SECONDS,
            'attempts_used'  => $state['count'],
            'attempts_left'  => self::ATT_MAX - $state['count'],
            // The next attempt will be rate-limited if we've already hit the
            // cooldown threshold — the frontend uses this to start its timer.
            'next_cooldown'  => $state['count'] >= self::ATT_COOLDOWN_AFTER_NTH ? self::ATT_COOLDOWN_SEC : 0,
        ]);
    }

    /** POST /api/auth/email/confirm  { token, action: 'yes'|'no' } */
    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token'  => ['required', 'string', 'size:64'],
            'action' => ['required', Rule::in(['yes', 'no'])],
        ]);

        $key = self::KEY_PREFIX.$data['token'];
        $entry = Cache::get($key);
        if (!$entry) {
            return response()->json(['message' => 'This verification link has expired or is invalid.'], 410);
        }

        $emailKey  = $entry['email'];
        $curToken  = Cache::get(self::CUR_PREFIX.$emailKey);
        // Tokens to act on: the one the user clicked + the currently-active
        // one for this email (if different). This is what makes "clicked the
        // old email's button after a resend" do the right thing — the
        // registration tab is polling the current token.
        $tokensToAct = array_unique(array_filter([$data['token'], $curToken]));

        if ($data['action'] === 'no') {
            foreach ($tokensToAct as $tok) {
                $tokEntry = Cache::get(self::KEY_PREFIX.$tok);
                if ($tokEntry && ($tokEntry['status'] ?? null) !== 'verified') {
                    $tokEntry['status']       = 'cancelled';
                    $tokEntry['cancelled_at'] = now()->toIso8601String();
                    Cache::put(self::KEY_PREFIX.$tok, $tokEntry, 60);
                }
            }
            Cache::forget(self::CUR_PREFIX.$emailKey);
            Log::warning('Email verification cancelled by user', ['email' => $emailKey]);
            return response()->json(['message' => 'Verification cancelled.', 'status' => 'cancelled']);
        }

        // Yes — verify the current token (if any) so the registration tab
        // notices, plus the one the user clicked. Both reflect the same intent.
        // Use the longer "verified" TTL so the cached proof outlives the
        // 2-minute link window (the user still needs time to type their
        // password and submit the form).
        foreach ($tokensToAct as $tok) {
            $tokEntry = Cache::get(self::KEY_PREFIX.$tok);
            if ($tokEntry && ($tokEntry['status'] ?? null) !== 'cancelled') {
                $tokEntry['status']      = 'verified';
                $tokEntry['verified_at'] = now()->toIso8601String();
                Cache::put(self::KEY_PREFIX.$tok, $tokEntry, self::VERIFIED_TTL_SECONDS);
            }
        }
        // Keep the per-email cur index alive for the same window so a late
        // resend doesn't accidentally invalidate the verified proof.
        Cache::put(self::CUR_PREFIX.$emailKey, $curToken ?: $data['token'], self::VERIFIED_TTL_SECONDS);

        Log::info('Email verification confirmed', ['email' => $emailKey]);

        return response()->json(['message' => 'Email verified.', 'status' => 'verified', 'email' => $emailKey]);
    }

    /** GET /api/auth/email/status?token=...  (used by the registration tab to poll) */
    public function status(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'size:64']]);
        $entry = Cache::get(self::KEY_PREFIX.$data['token']);
        if (!$entry) {
            return response()->json(['status' => 'expired']);
        }
        return response()->json(['status' => $entry['status'], 'email' => $entry['email']]);
    }

    // ------------------------------------------------------------------

    /**
     * Send the verification email. Returns null on success, or a short error
     * string when SMTP rejected the message — the caller surfaces this to the
     * user so they don't see a misleading "sent" toast.
     */
    private function sendVerificationEmail(string $email, string $token): ?string
    {
        $base = rtrim(env('FRONTEND_URL', 'http://localhost:3000'), '/');
        $yesUrl = $base.'/verify-email?token='.$token.'&action=yes';
        $noUrl  = $base.'/verify-email?token='.$token.'&action=no';
        $appName = config('app.name', 'Organ Donation Campaign Analysis Tool');

        $html = <<<HTML
<!doctype html>
<html><body style="font-family: Arial, sans-serif; background:#f4f6fa; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:10px; padding:28px; box-shadow:0 2px 8px rgba(0,0,0,.05);">
    <h2 style="color:#1a5c9e; margin:0 0 12px;">Confirm your email</h2>
    <p style="color:#333; line-height:1.55;">
      Someone (hopefully you) is using <strong>{$email}</strong> to create an account on <strong>{$appName}</strong>.
      Please confirm this is your email so we can continue.
    </p>
    <div style="margin:24px 0; text-align:center;">
      <a href="{$yesUrl}" style="display:inline-block; background:#0eb07a; color:#fff; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:600; margin:4px;">✓ Yes, this is my email</a>
      <a href="{$noUrl}"  style="display:inline-block; background:#d63e3e; color:#fff; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:600; margin:4px;">✗ No, this wasn&#39;t me</a>
    </div>
    <p style="color:#666; font-size:12px;">If you didn&#39;t request this, click <strong>No, this wasn&#39;t me</strong> or simply ignore this email — no account will be created. <strong>This link expires in 2 minutes</strong>; requesting another one invalidates this one immediately.</p>
    <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
    <p style="color:#999; font-size:11px;">If the buttons don&#39;t work, copy and paste this link into your browser:<br><span style="color:#1a5c9e;">{$yesUrl}</span></p>
  </div>
</body></html>
HTML;

        try {
            Mail::html($html, function ($msg) use ($email, $appName) {
                $msg->to($email)->subject("Confirm your email — {$appName}");
            });
            return null;
        } catch (\Throwable $e) {
            Log::error('Email verification send failed', ['email' => $email, 'error' => $e->getMessage()]);
            return $e->getMessage();
        }
    }
}
