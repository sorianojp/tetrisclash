<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Granted only from the console (php artisan user:make-admin).
            $table->boolean('is_admin')->default(false);
            $table->timestamp('banned_at')->nullable()->index();
            $table->string('ban_reason')->nullable();
            // A paused bot stops coming online and taking new matches (see App\Support\Bots).
            $table->timestamp('bot_paused_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['banned_at']);
            $table->dropColumn(['is_admin', 'banned_at', 'ban_reason', 'bot_paused_at']);
        });
    }
};
