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
            $table->unsignedInteger('best_ultra_score')->nullable();
            $table->unsignedInteger('best_dig_ms')->nullable();
            $table->unsignedInteger('best_survival_ms')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['best_ultra_score', 'best_dig_ms', 'best_survival_ms']);
        });
    }
};
