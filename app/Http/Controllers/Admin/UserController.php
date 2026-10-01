<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Achievement;
use App\Models\Duel;
use App\Models\PracticeRun;
use App\Models\Tournament;
use App\Models\User;
use App\Support\Achievements;
use App\Support\Energy;
use App\Support\Moderation;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public const PER_PAGE = 25;

    /**
     * Every account, newest first, searchable by name or email.
     */
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'filter' => ['nullable', Rule::in(['players', 'banned', 'admins', 'bots'])],
        ]);
        $search = trim($filters['search'] ?? '');
        $filter = $filters['filter'] ?? 'players';

        $users = User::query()
            ->when($filter === 'players', fn ($query) => $query->whereNull('bot_key'))
            ->when($filter === 'banned', fn ($query) => $query->whereNotNull('banned_at'))
            ->when($filter === 'admins', fn ($query) => $query->where('is_admin', true))
            ->when($filter === 'bots', fn ($query) => $query->bots())
            ->when($search !== '', function ($query) use ($search) {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('email', 'like', $like));
            })
            ->latest('id')
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        return Inertia::render('admin/users/index', [
            'users' => $users->through(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->isBot() ? null : $user->email,
                'rating' => $user->rating,
                'wins' => $user->wins,
                'losses' => $user->losses,
                'rank' => $user->rankProgress(),
                'verified' => $user->email_verified_at !== null,
                'isAdmin' => $user->isAdmin(),
                'isBot' => $user->isBot(),
                'banned' => $user->isBanned(),
                'lastSeen' => $user->last_seen_at?->diffForHumans(),
                'joined' => $user->created_at?->diffForHumans(),
            ]),
            'filters' => ['search' => $search, 'filter' => $filter],
        ]);
    }

    public function show(Request $request, User $user): Response
    {
        /** @var User $admin */
        $admin = $request->user();

        $unlocked = $user->achievements()->pluck('created_at', 'key');

        return Inertia::render('admin/users/show', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->isBot() ? null : $user->email,
                'verified' => $user->email_verified_at !== null,
                'isAdmin' => $user->isAdmin(),
                'isBot' => $user->isBot(),
                'ban' => $user->isBanned() ? [
                    'at' => $user->banned_at?->toDayDateTimeString(),
                    'reason' => $user->ban_reason,
                ] : null,
                'joined' => $user->created_at?->toFormattedDateString(),
                'lastSeen' => $user->last_seen_at?->diffForHumans(),
                'rating' => $user->rating,
                'wins' => $user->wins,
                'losses' => $user->losses,
                'xp' => $user->xp,
                'rank' => $user->rankProgress(),
                'energy' => ['current' => $user->currentEnergy(), 'max' => Energy::max()],
            ],
            'records' => $user->practiceRecords(),
            'runs' => $user->practiceRuns()
                ->withExists('replay')
                ->latest('id')
                ->limit(25)
                ->get()
                ->map(fn (PracticeRun $run) => [
                    'id' => $run->id,
                    'mode' => $run->mode,
                    'value' => $run->value,
                    'hasReplay' => (bool) $run->getAttribute('replay_exists'),
                    'createdAt' => $run->created_at?->diffForHumans(),
                ]),
            'achievements' => collect(Achievements::ALL)->map(fn (array $achievement, string $key) => [
                'key' => $key,
                'title' => $achievement['title'],
                'group' => $achievement['group'],
                'unlocked' => $unlocked->has($key),
            ])->values(),
            'recentDuels' => Duel::recentFor($user, 10),
            'activeDuelId' => Duel::activeFor($user)?->id,
            'tournamentId' => Tournament::activeFor($user)?->id,
            'canBan' => ! $user->is($admin) && ! $user->isAdmin(),
        ]);
    }

    public function ban(Request $request, User $user): RedirectResponse
    {
        /** @var User $admin */
        $admin = $request->user();

        abort_if($user->is($admin) || $user->isAdmin(), 403, 'Admins cannot be banned.');

        $reason = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ])['reason'] ?? null;

        Moderation::ban($user, $reason);

        return $this->done(__(':name has been banned.', ['name' => $user->name]));
    }

    public function unban(User $user): RedirectResponse
    {
        Moderation::unban($user);

        return $this->done(__(':name has been unbanned.', ['name' => $user->name]));
    }

    /**
     * Set rating and XP directly. Themes unlock by rank, so XP is also how to hand those out.
     */
    public function updateStats(Request $request, User $user): RedirectResponse
    {
        $validated = $request->validate([
            'rating' => ['required', 'integer', 'min:0', 'max:5000'],
            'xp' => ['required', 'integer', 'min:0', 'max:100000000'],
        ]);

        $user->forceFill($validated)->save();

        return $this->done(__('Stats updated.'));
    }

    /**
     * Set energy to an amount; the maximum means full, with no refill running.
     */
    public function updateEnergy(Request $request, User $user): RedirectResponse
    {
        $amount = (int) $request->validate([
            'energy' => ['required', 'integer', 'min:0', 'max:'.Energy::max()],
        ])['energy'];

        $user->forceFill($amount >= Energy::max()
            ? ['energy' => null, 'energy_updated_at' => null]
            : ['energy' => $amount, 'energy_updated_at' => now()])->save();

        return $this->done(__('Energy set to :amount.', ['amount' => $amount]));
    }

    public function grantAchievement(Request $request, User $user): RedirectResponse
    {
        $key = $request->validate([
            'key' => ['required', Rule::in(array_keys(Achievements::ALL))],
        ])['key'];

        Achievements::award($user, $key);

        return $this->done(__('Achievement granted.'));
    }

    public function revokeAchievement(User $user, string $key): RedirectResponse
    {
        Achievement::query()->where('user_id', $user->id)->where('key', $key)->delete();

        return $this->done(__('Achievement removed.'));
    }

    /**
     * Wipe one practice record and every run behind it.
     */
    public function resetRecord(User $user, string $mode): RedirectResponse
    {
        abort_unless(array_key_exists($mode, User::PRACTICE_RECORDS), 404);

        Moderation::resetRecord($user, $mode);

        return $this->done(__('Record reset.'));
    }

    private function done(string $message): RedirectResponse
    {
        Inertia::flash('toast', ['type' => 'success', 'message' => $message]);

        return back();
    }
}
