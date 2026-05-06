<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Appeal extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'explanation', 'evidence', 'submitted_date',
        'status', 'original_action', 'original_category', 'original_reason',
        'original_admin_id', 'admin_response_deadline',
        'review_date', 'review_admin_id', 'review_notes', 'decision',
    ];

    protected function casts(): array
    {
        return [
            'evidence' => 'array',
            'submitted_date' => 'datetime',
            'admin_response_deadline' => 'datetime',
            'review_date' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function originalAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'original_admin_id');
    }

    public function reviewAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'review_admin_id');
    }
}
