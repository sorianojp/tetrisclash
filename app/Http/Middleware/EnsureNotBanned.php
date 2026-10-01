<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Signs out a player an admin has banned, whichever way they signed in (password, passkey
 * or remember-me cookie), and sends them to the login page with the reason.
 */
class EnsureNotBanned
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null || ! $user->isBanned()) {
            return $next($request);
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($request->expectsJson()) {
            abort(403, __('This account has been suspended.'));
        }

        $message = $user->ban_reason
            ? __('This account has been suspended: :reason', ['reason' => $user->ban_reason])
            : __('This account has been suspended.');

        return redirect()->route('login')->with('status', $message);
    }
}
