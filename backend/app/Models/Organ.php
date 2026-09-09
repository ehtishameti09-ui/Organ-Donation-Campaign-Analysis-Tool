<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Module 8 — a physical organ moving through its lifecycle.
 *
 * The cold-chain state is computed, never stored. See coldChain() for why.
 */
class Organ extends Model
{
    use HasFactory;

    public const TERMINAL = ['transplanted', 'discarded', 'expired'];

    protected $fillable = [
        'allocation_decision_id', 'case_approval_id', 'donor_user_id', 'recipient_user_id',
        'hospital_id', 'organ_type', 'reference', 'status',
        'recovered_at', 'cold_ischemia_limit_minutes',
        'transplanted_at', 'discarded_at', 'discard_reason',
        'breach_notified_at', 'warning_notified_at',
    ];

    protected function casts(): array
    {
        return [
            'recovered_at'       => 'datetime',
            'transplanted_at'    => 'datetime',
            'discarded_at'       => 'datetime',
            'breach_notified_at'  => 'datetime',
            'warning_notified_at' => 'datetime',
        ];
    }

    /** The configured cold ischemia window for an organ type, in minutes. */
    public static function limitFor(?string $organType): int
    {
        $key = strtolower(trim((string) $organType));
        return (int) (config("governance.cold_ischemia_minutes.{$key}")
            ?? config('governance.cold_ischemia_default_minutes', 1440));
    }

    /** Next sequential human-facing reference, e.g. ORG-2026-0042. */
    public static function nextReference(): string
    {
        $year = now()->year;
        $n = static::where('reference', 'like', "ORG-{$year}-%")->count() + 1;

        // Collisions are possible under concurrency; step forward until free.
        do {
            $ref = sprintf('ORG-%d-%04d', $year, $n);
            $n++;
        } while (static::where('reference', $ref)->exists());

        return $ref;
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, self::TERMINAL, true);
    }

    /**
     * Derived cold-chain state — the heart of Module 8.1.
     *
     * Computed from recovered_at and the stored limit on every read rather than
     * written by a background job. That choice is what makes the alert reliable
     * here: there is no worker in this deployment, so a stored flag would go
     * stale the moment nothing was running to update it. Two subtractions are
     * cheaper than a daemon and can never be out of date.
     *
     * The clock stops at transplant or discard — a transplanted organ is judged
     * on the ischemia time it actually experienced, not on time since elapsed.
     */
    public function coldChain(): array
    {
        $limit = max(1, (int) $this->cold_ischemia_limit_minutes);
        $stop  = $this->transplanted_at ?? $this->discarded_at;
        $end   = $stop ?: now();

        $elapsed = $this->recovered_at ? max(0, $this->recovered_at->diffInMinutes($end)) : 0;
        $ratio   = $elapsed / $limit;

        $t = config('governance.cold_ischemia_thresholds', ['advisory' => 0.6, 'warning' => 0.85]);

        if ($ratio >= 1.0)              $state = 'breached';
        elseif ($ratio >= $t['warning'])  $state = 'warning';
        elseif ($ratio >= $t['advisory']) $state = 'advisory';
        else                              $state = 'ok';

        return [
            'state'             => $state,
            'elapsed_minutes'   => (int) $elapsed,
            'limit_minutes'     => $limit,
            'remaining_minutes' => (int) round($limit - $elapsed),
            'percent_used'      => (int) round($ratio * 100),
            // A stopped clock is history, not a live alarm — the dashboard uses
            // this to show a breach on a completed organ differently from one
            // ticking down right now.
            'is_live'           => !$stop,
        ];
    }

    public function events(): HasMany       { return $this->hasMany(OrganEvent::class)->orderBy('occurred_at'); }
    public function donor(): BelongsTo      { return $this->belongsTo(User::class, 'donor_user_id'); }
    public function recipient(): BelongsTo  { return $this->belongsTo(User::class, 'recipient_user_id'); }
    public function hospital(): BelongsTo   { return $this->belongsTo(User::class, 'hospital_id'); }
    public function approval(): BelongsTo   { return $this->belongsTo(CaseApproval::class, 'case_approval_id'); }
    public function decision(): BelongsTo   { return $this->belongsTo(AllocationDecision::class, 'allocation_decision_id'); }
}
