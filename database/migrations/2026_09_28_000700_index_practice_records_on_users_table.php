<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Practice-best columns the leaderboards sort by. */
    private const COLUMNS = ['best_sprint_ms', 'best_ultra_score', 'best_dig_ms', 'best_survival_ms', 'best_zen_score'];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            foreach (self::COLUMNS as $column) {
                $table->index($column);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            foreach (self::COLUMNS as $column) {
                $table->dropIndex([$column]);
            }
        });
    }
};
