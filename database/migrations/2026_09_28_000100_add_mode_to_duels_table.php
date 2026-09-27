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
        Schema::table('duels', function (Blueprint $table) {
            $table->string('mode')->default('battle');
            $table->boolean('ranked')->default(true);
            $table->unsignedInteger('player_one_lines')->default(0);
            $table->unsignedInteger('player_two_lines')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('duels', function (Blueprint $table) {
            $table->dropColumn(['mode', 'ranked', 'player_one_lines', 'player_two_lines']);
        });
    }
};
