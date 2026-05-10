<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BloodCompatibility extends Model
{
    use HasFactory;

    protected $table = 'blood_compatibility';

    protected $fillable = ['donor_blood_type', 'recipient_blood_type', 'compatible', 'notes'];

    protected function casts(): array
    {
        return [
            'compatible' => 'boolean',
        ];
    }

    /** Returns matrix as ['O-' => ['O-', 'O+', ...], ...] */
    public static function asMatrix(): array
    {
        $rows = self::where('compatible', true)->get();
        $m = [];
        foreach ($rows as $r) {
            $m[$r->donor_blood_type][] = $r->recipient_blood_type;
        }
        return $m;
    }
}
