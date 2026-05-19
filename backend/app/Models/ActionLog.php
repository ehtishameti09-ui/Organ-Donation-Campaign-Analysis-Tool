<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActionLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'admin_id', 'review_admin_id',
        'action_type', 'reason', 'action_details',
        'ip_address', 'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'action_details' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    /**
     * Action logs are an immutable audit trail — once written they can never be
     * edited or deleted, by anyone, through the application. Enforced at the
     * model layer so even a direct ActionLog::find()->delete() is rejected.
     * The daily feed purge deliberately never touches this table.
     */
    protected static function booted(): void
    {
        static::updating(function () {
            if (!app()->runningUnitTests()) {
                throw new \RuntimeException('Action logs are immutable — they cannot be modified once written.');
            }
        });
        static::deleting(function () {
            if (!app()->runningUnitTests()) {
                throw new \RuntimeException('Action logs are immutable — they cannot be deleted.');
            }
        });
    }
}
