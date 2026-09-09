<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Module 7 — a governed approval for one allocation decision.
 *
 * Stage machine (sequential, no skipping):
 *   checklist --(all required items ticked)--> doctor --> admin --> approved
 * with `rejected` reachable from any non-terminal stage.
 *
 * When requires_multi_user is false the doctor stage is bypassed: the case moves
 * checklist -> admin -> approved on a single confirmation.
 */
class CaseApproval extends Model
{
    use HasFactory;

    protected $fillable = [
        'allocation_decision_id', 'hospital_id', 'donor_user_id', 'recipient_user_id', 'organ',
        'stage', 'requires_multi_user', 'checklist',
        'doctor_id', 'doctor_approved_at', 'doctor_notes',
        'admin_id', 'admin_confirmed_at', 'admin_notes',
        'rejected_by', 'rejected_at', 'rejection_reason',
        'allocated_at', 'approved_at', 'approval_seconds',
    ];

    protected function casts(): array
    {
        return [
            'checklist'           => 'array',
            'requires_multi_user' => 'boolean',
            'doctor_approved_at'  => 'datetime',
            'admin_confirmed_at'  => 'datetime',
            'rejected_at'         => 'datetime',
            'allocated_at'        => 'datetime',
            'approved_at'         => 'datetime',
        ];
    }

    /** Build a fresh checklist snapshot from the config template. */
    public static function freshChecklist(): array
    {
        return array_map(fn ($item) => $item + [
            'checked'    => false,
            'checked_by' => null,
            'checked_at' => null,
        ], config('governance.approval_checklist', []));
    }

    /** True once every item marked required in the snapshot is ticked. */
    public function checklistComplete(): bool
    {
        foreach ($this->checklist ?? [] as $item) {
            if (($item['required'] ?? false) && !($item['checked'] ?? false)) return false;
        }
        return true;
    }

    public function requiredOutstanding(): int
    {
        return count(array_filter(
            $this->checklist ?? [],
            fn ($i) => ($i['required'] ?? false) && !($i['checked'] ?? false)
        ));
    }

    /** The stage that follows a completed checklist for this case's mode. */
    public function firstApprovalStage(): string
    {
        return $this->requires_multi_user ? 'doctor' : 'admin';
    }

    public function isTerminal(): bool
    {
        return in_array($this->stage, ['approved', 'rejected'], true);
    }

    public function decision(): BelongsTo   { return $this->belongsTo(AllocationDecision::class, 'allocation_decision_id'); }
    public function donor(): BelongsTo      { return $this->belongsTo(User::class, 'donor_user_id'); }
    public function recipient(): BelongsTo  { return $this->belongsTo(User::class, 'recipient_user_id'); }
    public function doctor(): BelongsTo     { return $this->belongsTo(User::class, 'doctor_id'); }
    public function admin(): BelongsTo      { return $this->belongsTo(User::class, 'admin_id'); }
    public function rejecter(): BelongsTo   { return $this->belongsTo(User::class, 'rejected_by'); }
    public function hospital(): BelongsTo   { return $this->belongsTo(User::class, 'hospital_id'); }
}
