<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'hospital_id', 'requested_admin_name', 'requested_admin_email',
        'justification', 'status', 'reviewed_by', 'reviewed_at',
        'review_notes', 'created_admin_id',
    ];

    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
        ];
    }

    public function hospital(): BelongsTo
    {
        return $this->belongsTo(User::class, 'hospital_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function createdAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_admin_id');
    }
}
