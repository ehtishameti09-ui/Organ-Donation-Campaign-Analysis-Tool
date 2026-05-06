<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClinicalProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'cnic', 'dob', 'gender', 'age',
        'medical_history', 'current_medications', 'address',
        'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    ];

    protected function casts(): array
    {
        return [
            'dob' => 'date',
            'age' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
