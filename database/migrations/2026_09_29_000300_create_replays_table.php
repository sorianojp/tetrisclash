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
        Schema::create('replays', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // One of these: a player's side of a duel, or a practice run.
            $table->foreignId('duel_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('practice_run_id')->nullable()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('duration_ms');
            // Board frames as gzipped JSON, base64-encoded (see App\Support\ReplayData).
            $table->longText('data');
            $table->timestamps();

            $table->unique(['duel_id', 'user_id']);
            $table->unique('practice_run_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('replays');
    }
};
