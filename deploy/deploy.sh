#!/usr/bin/env bash
# Pull the latest code and rebuild. Run on the droplet as root:
#   cd /var/www/tetrisclash && bash deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
export COMPOSER_ALLOW_SUPERUSER=1

php artisan down --retry=15 || true

git pull --ff-only

composer install --no-dev --optimize-autoloader --no-interaction

# The build bakes the VITE_REVERB_* values from .env into the JavaScript, and runs
# Wayfinder (php artisan) to generate the typed routes, so it has to happen here.
npm ci
npm run build

php artisan migrate --force
php artisan optimize

# Files created above belong to root; PHP-FPM, Reverb and the queue run as www-data.
chown -R www-data:www-data storage bootstrap/cache

# Pick up new code in the long-running processes.
php artisan reverb:restart
php artisan queue:restart

php artisan up
