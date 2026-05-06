<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('unique_id', 20)->nullable()->unique()->after('id');
        });

        // Back-fill unique IDs for users that already exist
        $prefixMap = [
            'donor'       => 'DON',
            'recipient'   => 'REC',
            'hospital'    => 'HOS',
            'admin'       => 'ADM',
            'super_admin' => 'ADM',
            'doctor'      => 'DOC',
            'data_entry'  => 'DAT',
            'auditor'     => 'AUD',
        ];
        $year  = date('Y');
        $users = DB::table('users')->orderBy('id')->get(['id', 'role']);
        foreach ($users as $user) {
            $prefix = $prefixMap[$user->role] ?? 'USR';
            DB::table('users')->where('id', $user->id)->update([
                'unique_id' => "{$prefix}-{$year}-" . str_pad($user->id, 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('unique_id');
        });
    }
};
