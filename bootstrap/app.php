<?php

use App\Http\Middleware\EnsureNotBanned;
use App\Http\Middleware\EnsureUserIsAdmin;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);
        // The bot runner authenticates with a token, not a session.
        $middleware->validateCsrfTokens(except: ['internal/bots/*']);

        $middleware->alias(['admin' => EnsureUserIsAdmin::class]);

        $middleware->web(append: [
            EnsureNotBanned::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            // Capped: every preloaded asset adds to the `Link` header, and past nginx's
            // header buffer the page fails with a 502 ("upstream sent too big header").
            AddLinkHeadersForPreloadedAssets::using(12),
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
