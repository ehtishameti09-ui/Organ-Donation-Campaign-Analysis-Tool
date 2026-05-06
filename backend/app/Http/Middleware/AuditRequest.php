<?php

namespace App\Http\Middleware;

use App\Models\ActionLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuditRequest
{
    public function handle(Request $request, Closure $next, string $actionType = 'request'): Response
    {
        $response = $next($request);

        $user = $request->user();
        if ($user && in_array($request->method(), ['POST', 'PATCH', 'PUT', 'DELETE'], true)) {
            ActionLog::create([
                'user_id' => $user->id,
                'admin_id' => $user->id,
                'action_type' => $actionType,
                'reason' => $request->method().' '.$request->path(),
                'action_details' => [
                    'status_code' => $response->getStatusCode(),
                    'endpoint' => $request->fullUrl(),
                ],
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 255),
            ]);
        }

        return $response;
    }
}
