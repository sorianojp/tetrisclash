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
