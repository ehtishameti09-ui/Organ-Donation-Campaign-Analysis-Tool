<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Module 9 — a theatre + surgeon (+ optional ICU bed) reservation. */
class SurgeryBooking extends Model
{
    use HasFactory;

    /** Statuses that still hold their resources. A cancelled booking frees them. */
    public const BLOCKING = ['scheduled', 'in_progress', 'completed'];

    protected $fillable = [
        'hospital_id', 'organ_id', 'case_approval_id', 'recipient_user_id',
        'theatre_id', 'surgeon_id', 'icu_bed_id',
        'scheduled_start', 'scheduled_end', 'icu_from', 'icu_until',
        'status', 'notes', 'cancel_reason', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_start' => 'datetime',
            'scheduled_end'   => 'datetime',
            'icu_from'        => 'datetime',
            'icu_until'       => 'datetime',
        ];
    }

    public function durationMinutes(): int
    {
        return (int) $this->scheduled_start->diffInMinutes($this->scheduled_end);
    }

    public function theatre(): BelongsTo   { return $this->belongsTo(SurgicalResource::class, 'theatre_id'); }
    public function surgeon(): BelongsTo   { return $this->belongsTo(SurgicalResource::class, 'surgeon_id'); }
    public function icuBed(): BelongsTo    { return $this->belongsTo(SurgicalResource::class, 'icu_bed_id'); }
    public function organ(): BelongsTo     { return $this->belongsTo(Organ::class); }
    public function approval(): BelongsTo  { return $this->belongsTo(CaseApproval::class, 'case_approval_id'); }
    public function recipient(): BelongsTo { return $this->belongsTo(User::class, 'recipient_user_id'); }
    public function creator(): BelongsTo   { return $this->belongsTo(User::class, 'created_by'); }
}
