<?php

namespace App\Services;

use App\Models\ActionLog;
use App\Models\Activity;
use App\Models\Notification;
use App\Models\User;
use App\Support\UserAgentParser;
use Illuminate\Http\Request;

/**
 * Records a successful login and flags it as suspicious when it does not match
 * the account's established IP / device pattern. Suspicious logins raise a
 * real-time security alert (notification to the user + an Activity row that
 * admins/auditors see in the security feed).
 */
class SecurityLogger
{
    /**
     * @param  string  $via  '' for password login, '_2fa' for a 2FA login.
     */
    public static function recordLogin(User $user, Request $request, string $via = ''): array
    {
        $ip = $request->ip();
        $ua = substr((string) $request->userAgent(), 0, 255);
        $deviceSignature = UserAgentParser::browser($ua).'|'.UserAgentParser::platform($ua);
        $deviceLabel = UserAgentParser::describe($ua);

        // Prior successful logins for this account (exclude the row we just may
        // write — we query before logging). No history => first login, trusted.
        $history = ActionLog::where('user_id', $user->id)
            ->whereIn('action_type', ['login_success', 'login_success_2fa'])
            ->latest('id')
            ->limit(200)
            ->get(['ip_address', 'user_agent']);

        $reasons = [];
        if ($history->isNotEmpty()) {
            $knownIps = $history->pluck('ip_address')->filter()->unique();
            if ($ip && !$knownIps->contains($ip)) {
                $reasons[] = 'New IP address ('.$ip.')';
            }

            $knownDevices = $history->map(fn ($h) => UserAgentParser::browser($h->user_agent).'|'.UserAgentParser::platform($h->user_agent))->unique();
            if (!$knownDevices->contains($deviceSignature)) {
                $reasons[] = 'New device / browser ('.$deviceLabel.')';
            }
        }

        $suspicious = count($reasons) > 0;

        ActionLog::create([
            'user_id' => $user->id,
            'admin_id' => $user->id,
            'action_type' => 'login_success'.$via,
            'reason' => $suspicious ? 'Suspicious login: '.implode('; ', $reasons) : 'User logged in'.($via ? ' with 2FA' : ''),
            'action_details' => [
                'ip' => $ip,
                'device' => $deviceLabel,
                'suspicious' => $suspicious,
                'reasons' => $reasons,
            ],
            'ip_address' => $ip,
            'user_agent' => $ua,
        ]);

        if ($suspicious) {
            // Permanent suspicious-login marker in the audit trail.
            ActionLog::create([
                'user_id' => $user->id,
                'admin_id' => $user->id,
                'action_type' => 'login_suspicious',
                'reason' => implode('; ', $reasons),
                'action_details' => ['ip' => $ip, 'device' => $deviceLabel, 'reasons' => $reasons],
                'ip_address' => $ip,
                'user_agent' => $ua,
            ]);

            // Real-time alert to the account owner.
            Notification::create([
                'user_id' => $user->id,
                'type' => 'warning',
                'title' => 'Security alert: unrecognised sign-in',
                'message' => 'A login to your account looked unusual — '.implode('; ', $reasons).'. If this was not you, change your password immediately.',
                'data' => ['ip' => $ip, 'device' => $deviceLabel],
            ]);

            // Surface in the security/activity feed for admins & auditors.
            $scopeHospitalId = $user->role === 'hospital'
                ? $user->id
                : ($user->preferred_hospital_id ?? $user->linked_hospital_id);

            Activity::create([
                'type' => 'security_alert',
                'icon' => '🚨',
                'title' => 'Suspicious login detected',
                'description' => $user->name.' ('.$user->email.') — '.implode('; ', $reasons),
                'user_id' => $user->id,
                'actor_id' => $user->id,
                'scope_hospital_id' => $scopeHospitalId,
                'metadata' => ['ip' => $ip, 'device' => $deviceLabel, 'reasons' => $reasons],
            ]);
        }

        return ['suspicious' => $suspicious, 'reasons' => $reasons, 'device' => $deviceLabel, 'ip' => $ip];
    }
}
