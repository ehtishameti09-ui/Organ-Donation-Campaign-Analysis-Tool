<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AllocationDecision extends Model
{
    use HasFactory;

    protected $fillable = [
        'allocation_run_id', 'selected_recipient_id', 'selected_rank',
        'was_override', 'was_rejected', 'override_reason', 'decided_by', 'hospital_id',
        'status', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'was_override' => 'boolean',
            'was_rejected' => 'boolean',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(AllocationRun::class, 'allocation_run_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'selected_recipient_id');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
