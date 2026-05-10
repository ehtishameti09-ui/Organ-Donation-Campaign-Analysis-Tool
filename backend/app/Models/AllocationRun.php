<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AllocationRun extends Model
{
    use HasFactory;

    protected $fillable = [
        'policy_id', 'donor_user_id', 'organ', 'weights_snapshot',
        'dataset_snapshot', 'results', 'candidate_count', 'run_by',
        'mode', 'parent_run_id',
    ];

    protected function casts(): array
    {
        return [
            'weights_snapshot' => 'array',
            'dataset_snapshot' => 'array',
            'results'          => 'array',
        ];
    }

    public function policy(): BelongsTo
    {
        return $this->belongsTo(AllocationPolicy::class, 'policy_id');
    }

    public function donor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'donor_user_id');
    }

    public function runner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'run_by');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(AllocationRun::class, 'parent_run_id');
    }
}
