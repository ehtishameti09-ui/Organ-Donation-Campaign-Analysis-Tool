<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Module 7 — a governed approval for one allocation decision.
 *
 * TWO-SIDED, because allocation is cross-hospital. `hospital_id` is the donor
 * (procuring) side; `recipient_hospital_id` is the transplanting side. They are
 * frequently different hospitals, and the recipient's own hospital must accept the
 * offer before the donor side can complete its sign-off — it holds the chart and
 * obtains consent.
 *
 * Stage machine (sequential, no skipping):
 *   checklist --(required items ticked)--> offer --> doctor --> admin --> approved
 *                                          ^
 *                        skipped entirely when both sides are the same hospital,
 *                        because then there is no counterparty to ask.
 *
 * Terminal: `approved`, `rejected` (donor side refused) and `declined` (recipient
 * side refused the offer). A decline is not a rejection of the patient — it sends
 * the organ to the next-ranked candidate, so the two are recorded separately.
 *
 * When requires_multi_user is false the doctor stage is bypassed: the case moves
 * checklist -> [offer] -> admin -> approved on a single confirmation.
 */
class CaseApproval extends Model
{
    use HasFactory;

    protected $fillable = [
        'allocation_decision_id', 'hospital_id', 'recipient_hospital_id',
        'donor_user_id', 'recipient_user_id', 'organ',
        'stage', 'requires_multi_user', 'checklist',
        'offer_sent_at', 'offer_responded_at', 'offer_response_by', 'offer_notes', 'offer_seconds',
        'reoffered_from_id',
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
            'offer_sent_at'       => 'datetime',
            'offer_responded_at'  => 'datetime',
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

    /** Stages from which no further action is possible. */
    public const TERMINAL = ['approved', 'rejected', 'declined'];

    public function isTerminal(): bool
    {
        return in_array($this->stage, self::TERMINAL, true);
    }

    /**
     * True when the organ and the patient sit at different hospitals.
     *
     * A null recipient_hospital_id means the recipient is attached to no hospital,
     * which is NOT the same as "same hospital" - there is simply nobody to ask, so
     * it is treated as same-side rather than stranding the case at an offer stage
     * that no account could ever action. (The inverse reading is the inversion that
     * CaseScope had to fix: absent scope must never widen access.)
     */
    public function isCrossHospital(): bool
    {
        return $this->recipient_hospital_id !== null
            && (int) $this->recipient_hospital_id !== (int) $this->hospital_id;
    }

    public function offerAccepted(): bool
    {
        return $this->offer_responded_at !== null && $this->stage !== 'declined';
    }

    /** True while this case is still waiting on the counterparty's answer. */
    public function awaitingOffer(): bool
    {
        return $this->isCrossHospital() && !$this->offerAccepted();
    }

    /**
     * The stage that follows a completed checklist.
     *
     * The counterparty is asked BEFORE the donor side spends its clinical sign-off:
     * there is no point signing off an organ the receiving centre will not take, and
     * the cold-chain clock is running the whole time.
     */
    public function firstApprovalStage(): string
    {
        if ($this->awaitingOffer()) return 'offer';

        return $this->requires_multi_user ? 'doctor' : 'admin';
    }

    public function decision(): BelongsTo   { return $this->belongsTo(AllocationDecision::class, 'allocation_decision_id'); }
    public function donor(): BelongsTo      { return $this->belongsTo(User::class, 'donor_user_id'); }
    public function recipient(): BelongsTo  { return $this->belongsTo(User::class, 'recipient_user_id'); }
    public function doctor(): BelongsTo     { return $this->belongsTo(User::class, 'doctor_id'); }
    public function admin(): BelongsTo      { return $this->belongsTo(User::class, 'admin_id'); }
    public function rejecter(): BelongsTo   { return $this->belongsTo(User::class, 'rejected_by'); }
    public function hospital(): BelongsTo   { return $this->belongsTo(User::class, 'hospital_id'); }
    public function recipientHospital(): BelongsTo { return $this->belongsTo(User::class, 'recipient_hospital_id'); }
    public function offerResponder(): BelongsTo    { return $this->belongsTo(User::class, 'offer_response_by'); }
    public function reofferedFrom(): BelongsTo     { return $this->belongsTo(self::class, 'reoffered_from_id'); }
}
