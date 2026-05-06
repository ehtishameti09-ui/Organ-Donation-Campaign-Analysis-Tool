<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserNotBanned
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->banned) {
            return response()->json([
                'message' => 'Your account has been banned.',
                'banned' => true,
                'ban_details' => $user->ban_details,
            ], 403);
        }

        if ($user && $user->is_deleted && $user->recovery_deadline?->isPast()) {
            return response()->json([
                'message' => 'Your account has been permanently deleted.',
                'deleted' => true,
            ], 403);
        }

        return $next($request);
    }
}
