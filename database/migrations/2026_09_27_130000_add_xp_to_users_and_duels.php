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
            $table->unsignedInteger('xp')->default(0);
        });

        Schema::table('duels', function (Blueprint $table) {
            $table->unsignedSmallInteger('player_one_xp')->nullable();
            $table->unsignedSmallInteger('player_two_xp')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('duels', function (Blueprint $table) {
            $table->dropColumn(['player_one_xp', 'player_two_xp']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('xp');
        });
    }
};
