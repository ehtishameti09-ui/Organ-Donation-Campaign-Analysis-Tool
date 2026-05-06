<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HospitalProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'hospital_name', 'registration_number', 'license_number',
        'hospital_address', 'contact_person',
        'admin_feedback', 'rejection_reason', 'admin_message',
        'approved_by', 'approved_at', 'rejected_by', 'rejected_at',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
