<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DonorProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'blood_type', 'pledged_organs', 'donation_type',
        'family_informed', 'next_of_kin', 'verification_status', 'case_status',
        'consent_signed', 'consent_date', 'submission_date',
        'donation_consent', 'donation_willingness', 'family_notified',
        'contact_preference', 'available_for_urgent',
        'document_statuses', 'documents_resubmitted', 'resubmission_date',
    ];

    protected function casts(): array
    {
        return [
            'pledged_organs' => 'array',
            'document_statuses' => 'array',
            'family_informed' => 'boolean',
            'consent_signed' => 'boolean',
            'donation_consent' => 'boolean',
            'family_notified' => 'boolean',
            'available_for_urgent' => 'boolean',
            'documents_resubmitted' => 'boolean',
            'consent_date' => 'datetime',
            'submission_date' => 'datetime',
            'resubmission_date' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
