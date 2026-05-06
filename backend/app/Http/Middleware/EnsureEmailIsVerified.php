<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmailIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Google OAuth users are auto-verified; check email_verified_at
        if (!$user->email_verified_at) {
            return response()->json([
                'message' => 'Email verification required. Please check your inbox.',
                'email_verified' => false,
            ], 403);
        }

        return $next($request);
    }
}
