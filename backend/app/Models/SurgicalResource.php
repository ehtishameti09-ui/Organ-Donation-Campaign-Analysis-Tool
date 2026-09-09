<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Module 9 — a bookable theatre, ICU bed, or surgeon. */
class SurgicalResource extends Model
{
    use HasFactory;

    public const TYPES = ['theatre', 'icu_bed', 'surgeon'];

    protected $fillable = ['hospital_id', 'type', 'name', 'code', 'user_id', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function label(): string
    {
        return match ($this->type) {
            'theatre' => 'Theatre',
            'icu_bed' => 'ICU bed',
            'surgeon' => 'Surgeon',
            default   => $this->type,
        };
    }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }

    public function scopeOfType($q, string $type) { return $q->where('type', $type); }
    public function scopeActive($q) { return $q->where('is_active', true); }
}
