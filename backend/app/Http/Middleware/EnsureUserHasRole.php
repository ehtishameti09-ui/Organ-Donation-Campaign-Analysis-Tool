<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasRole
{
    public function handle(Request $request, Closure $next, ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $allowedRoles = [];
        foreach ($roles as $role) {
            $allowedRoles = array_merge($allowedRoles, explode('|', $role));
        }

        // Multi-role: match either primary role or secondary_role.
        $userRoles = array_filter([$user->role, $user->secondary_role]);
        if (empty(array_intersect($userRoles, $allowedRoles))) {
            return response()->json([
                'message' => 'Access denied. Required role: '.implode(' or ', $allowedRoles),
            ], 403);
        }

        return $next($request);
    }
}
