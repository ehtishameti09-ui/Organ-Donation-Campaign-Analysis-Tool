<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One entry on an organ's lifecycle timeline (Module 8.3). */
class OrganEvent extends Model
{
    use HasFactory;

    protected $fillable = ['organ_id', 'event_type', 'title', 'description', 'actor_id', 'meta', 'occurred_at'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'occurred_at' => 'datetime'];
    }

    /**
     * Record a timeline entry. occurred_at defaults to now.
     *
     * The actor falls back to the logged-in user, but only in a web request —
     * the scheduled cold-chain command writes events too, and there is no
     * authenticated user to resolve there.
     */
    public static function record(int $organId, string $type, string $title, ?string $description = null, ?int $actorId = null, array $meta = [], $occurredAt = null): self
    {
        return self::create([
            'organ_id'    => $organId,
            'event_type'  => $type,
            'title'       => $title,
            'description' => $description,
            'actor_id'    => $actorId ?? (app()->runningInConsole() ? null : optional(request()->user())->id),
            'meta'        => $meta ?: null,
            'occurred_at' => $occurredAt ?? now(),
        ]);
    }

    public function organ(): BelongsTo { return $this->belongsTo(Organ::class); }
    public function actor(): BelongsTo { return $this->belongsTo(User::class, 'actor_id'); }
}
