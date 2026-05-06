<?php

namespace App\Services;

use App\Models\Activity;
use App\Models\ActionLog;
use Illuminate\Http\Request;

class ActivityLogger
{
    public static function logActivity(string $type, string $title, ?string $description = null, array $extra = []): Activity
    {
        return Activity::create(array_merge([
            'type' => $type,
            'title' => $title,
            'description' => $description,
            'icon' => self::iconFor($type),
        ], $extra));
    }

    public static function logAction(int $userId, string $actionType, ?string $reason = null, array $details = [], ?int $adminId = null): ActionLog
    {
        $request = request();
        return ActionLog::create([
            'user_id' => $userId,
            'admin_id' => $adminId ?? optional($request->user())->id,
            'action_type' => $actionType,
            'reason' => $reason,
            'action_details' => $details,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);
    }

    private static function iconFor(string $type): string
    {
        return match (true) {
            str_contains($type, 'hospital') => '🏥',
            str_contains($type, 'donor') => '🩸',
            str_contains($type, 'recipient') => '🫀',
            str_contains($type, 'admin') => '👤',
            str_contains($type, 'employee') => '👥',
            str_contains($type, 'approve') => '✅',
            str_contains($type, 'reject') => '❌',
            str_contains($type, 'ban') => '🚫',
            str_contains($type, 'login') => '🔑',
            str_contains($type, 'register') => '📝',
            default => 'ℹ️',
        };
    }
}
