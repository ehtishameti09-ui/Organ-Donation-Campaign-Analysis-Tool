<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Validation\ValidationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpFoundation\Exception\BadRequestException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // CORS first
        $middleware->prepend(HandleCors::class);

        // Custom middleware aliases
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureUserHasRole::class,
            'permission' => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'role.spatie' => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'role_or_permission' => \Spatie\Permission\Middleware\RoleOrPermissionMiddleware::class,
            'verified.email' => \App\Http\Middleware\EnsureEmailIsVerified::class,
            'not.banned' => \App\Http\Middleware\EnsureUserNotBanned::class,
            'audit' => \App\Http\Middleware\AuditRequest::class,
        ]);

        // Increased throttle: dashboards make 8+ simultaneous calls per page load
        $middleware->throttleApi(300);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Always return JSON for API errors
        $exceptions->render(function (\Throwable $e, $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            if ($e instanceof ValidationException) {
                return response()->json([
                    'message' => 'The given data was invalid.',
                    'errors' => $e->errors(),
                ], 422);
            }

            if ($e instanceof AuthenticationException) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }

            if ($e instanceof AccessDeniedHttpException) {
                return response()->json(['message' => $e->getMessage() ?: 'Forbidden.'], 403);
            }

            if ($e instanceof ModelNotFoundException) {
                return response()->json(['message' => 'Resource not found.'], 404);
            }

            if ($e instanceof NotFoundHttpException) {
                return response()->json(['message' => 'Endpoint not found.'], 404);
            }

            $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
            $payload = ['message' => $e->getMessage() ?: 'Server error.'];
            if (config('app.debug')) {
                $payload['exception'] = class_basename($e);
                $payload['file'] = $e->getFile().':'.$e->getLine();
            }
            return response()->json($payload, $status >= 400 && $status < 600 ? $status : 500);
        });
    })->create();
