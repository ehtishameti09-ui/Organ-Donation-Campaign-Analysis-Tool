<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class Document extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'document_type', 'original_name', 'file_path',
        'mime_type', 'size', 'status', 'reviewed_by', 'reviewed_at', 'review_notes',
    ];

    protected $appends = ['url'];

    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
            'size' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getUrlAttribute(): string
    {
        // Returns API URL for secure download (auth-checked) — not direct storage URL
        return url('/api/documents/'.$this->id.'/download');
    }
}
