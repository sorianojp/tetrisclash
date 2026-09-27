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
            $table->boolean('accepts_invites')->default(true);
        });

        Schema::table('challenges', function (Blueprint $table) {
            $table->foreignId('invitee_id')->nullable()->after('challenger_id')->constrained('users')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('challenges', function (Blueprint $table) {
            $table->dropConstrainedForeignId('invitee_id');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('accepts_invites');
        });
    }
};
