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
        Schema::create('duels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_one_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('player_two_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('seed');
            $table->unsignedTinyInteger('player_one_kos')->default(0);
            $table->unsignedTinyInteger('player_two_kos')->default(0);
            $table->unsignedInteger('player_one_lines_sent')->default(0);
            $table->unsignedInteger('player_two_lines_sent')->default(0);
            $table->timestamp('player_one_seen_at')->nullable();
            $table->timestamp('player_two_seen_at')->nullable();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->foreignId('winner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('finish_reason')->nullable();
            $table->smallInteger('rating_change')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('duels');
    }
};
