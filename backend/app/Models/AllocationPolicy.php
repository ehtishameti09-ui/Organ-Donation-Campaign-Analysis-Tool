<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AllocationPolicy extends Model
{
    use HasFactory;

    protected $fillable = ['version', 'name', 'description', 'weights', 'is_active', 'created_by'];

    protected function casts(): array
    {
        return [
            'weights'   => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function runs(): HasMany
    {
        return $this->hasMany(AllocationRun::class, 'policy_id');
    }
}
