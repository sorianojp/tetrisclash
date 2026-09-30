<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets the bot runner in with its shared secret (BOT_RUNNER_TOKEN). Without a token set,
 * the internal bot API doesn't exist.
 */
class AuthenticateBotRunner
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = (string) config('game.bots.runner_token');

        abort_if($token === '' || ! hash_equals($token, (string) $request->bearerToken()), 404);

        return $next($request);
    }
}
