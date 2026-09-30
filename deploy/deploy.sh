#!/usr/bin/env bash
# Pull the latest code and rebuild. Run on the droplet as root:
#   cd /var/www/tetrisclash && bash deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
export COMPOSER_ALLOW_SUPERUSER=1

# See what's coming before going down: reinstalling node_modules is the slowest step, so it
# only happens when the JavaScript dependencies changed.
git fetch --quiet
DEPS_CHANGED=$(git diff --name-only HEAD origin/main -- package.json package-lock.json | wc -l)

php artisan down --retry=15 || true

git merge --ff-only origin/main

composer install --no-dev --optimize-autoloader --no-interaction

# Drop the previous deploy's cached routes/config first: the build below asks Laravel for its
# routes (Wayfinder), and a stale route cache would hide any routes added since.
php artisan optimize:clear

# The build bakes the VITE_REVERB_* values from .env into the JavaScript, and runs
# Wayfinder (php artisan) to generate the typed routes, so it has to happen here.
if [ "$DEPS_CHANGED" -gt 0 ] || [ ! -d node_modules ]; then
    npm ci
fi
npm run build

php artisan migrate --force
php artisan bots:install
php artisan optimize

# Files created above belong to root; PHP-FPM, Reverb and the queue run as www-data.
chown -R www-data:www-data storage bootstrap/cache

# Pick up new code in the long-running processes.
php artisan reverb:restart
php artisan queue:restart
# The bot runner holds the game engine in memory; restart it too (if it's set up).
supervisorctl restart tetrisclash-bots >/dev/null 2>&1 || true
# PHP-FPM keeps compiled code in OPcache; with opcache.validate_timestamps=0 it only sees new
# code after a reload (graceful: requests in flight finish first).
systemctl reload "php$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')-fpm" || true

php artisan up
