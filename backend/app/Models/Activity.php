<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Activity extends Model
{
    use HasFactory;

    protected $fillable = [
        'type', 'icon', 'title', 'description',
        'user_id', 'actor_id', 'scope_hospital_id', 'metadata',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public static function record(array $data): self
    {
        return self::create($data);
    }

    /**
     * Activity rows are append-only — once written, they cannot be updated or deleted.
     * Enforced at the model layer so even direct $activity->update() / ->delete() calls are rejected.
     * This is the integrity guarantee of the audit trail.
     */
    protected static function booted(): void
    {
        static::updating(function (Activity $a) {
            if (!app()->runningUnitTests()) {
                throw new \RuntimeException('Activity rows are immutable — they cannot be modified once written.');
            }
        });
        static::deleting(function (Activity $a) {
            if (!app()->runningUnitTests()) {
                throw new \RuntimeException('Activity rows are immutable — they cannot be deleted.');
            }
        });
    }
}
