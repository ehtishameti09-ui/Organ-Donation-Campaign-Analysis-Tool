<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecipientProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'blood_type', 'organ_needed', 'diagnosis',
        'urgency_score', 'comorbidity', 'survival_estimate',
        'treating_doctor', 'current_hospital', 'days_on_waitlist',
        'verification_status', 'case_status', 'consent_signed',
        'consent_date', 'submission_date',
        'blood_compatibility', 'urgency_self', 'waiting_list_visibility',
        'travel_ready', 'notify_on_match', 'preferred_hospital_notes',
        'document_statuses', 'documents_resubmitted', 'resubmission_date',
    ];

    protected function casts(): array
    {
        return [
            'urgency_score' => 'float',
            'comorbidity' => 'float',
            'consent_signed' => 'boolean',
            'waiting_list_visibility' => 'boolean',
            'travel_ready' => 'boolean',
            'notify_on_match' => 'boolean',
            'documents_resubmitted' => 'boolean',
            'document_statuses' => 'array',
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
