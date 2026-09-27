<?php

use App\Models\Duel;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('duel.{duel}', function (User $user, Duel $duel) {
    if (! $duel->hasPlayer($user)) {
        return false;
    }

    return ['id' => $user->id, 'name' => $user->name];
});

// Everyone signed in and verified, for the lobby's online list. Member data is captured on join,
// so the client re-joins when its own status changes (invites toggled, match started or over).
Broadcast::channel('online', function (User $user) {
    return $user->hasVerifiedEmail() ? $user->onlineProfile() : false;
});
