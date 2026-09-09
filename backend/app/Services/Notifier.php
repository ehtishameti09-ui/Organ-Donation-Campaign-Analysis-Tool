<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Governance notifications (Modules 7 & 8).
 *
 * Two deliberate choices here:
 *
 * 1. Rows are written with is_persistent = true so activity:purge-daily leaves
 *    them alone. An approval outcome or a cold-chain breach is a record, not
 *    feed chatter.
 *
 * 2. Email is sent via dispatch()->afterResponse() rather than the queue. The
 *    app is configured with QUEUE_CONNECTION=database but runs no worker, so a
 *    queued mail would sit in the jobs table forever and the alert would
 *    silently never arrive. afterResponse runs in the same PHP process once the
 *    response has been flushed: the user never waits on SMTP, and there is no
 *    extra daemon to keep alive. Failures are logged, never thrown — a dead SMTP
 *    host must not turn an approval into a 500.
 */
class Notifier
{
    /** Write an in-app notification that survives the daily purge. */
    public static function persistent(?int $userId, string $type, string $title, string $message, array $data = []): ?Notification
    {
        if (!$userId) return null;

        return Notification::create([
            'user_id'       => $userId,
            'type'          => $type,
            'title'         => $title,
            'message'       => $message,
            'data'          => $data,
            'is_persistent' => true,
        ]);
    }

    /** In-app notification + best-effort email, for the same audience. */
    public static function notifyAndEmail(?User $user, string $type, string $title, string $message, array $data = []): void
    {
        if (!$user) return;

        self::persistent($user->id, $type, $title, $message, $data);
        self::email($user->email, $title, $message);
    }

    /** Best-effort email, sent after the response is flushed. Never throws. */
    public static function email(?string $to, string $subject, string $body): void
    {
        if (!$to) return;

        dispatch(function () use ($to, $subject, $body) {
            try {
                Mail::raw($body, function ($m) use ($to, $subject) {
                    $m->to($to)->subject($subject);
                });
            } catch (\Throwable $e) {
                Log::warning('Governance email failed', ['to' => $to, 'subject' => $subject, 'error' => $e->getMessage()]);
            }
        })->afterResponse();
    }
}
