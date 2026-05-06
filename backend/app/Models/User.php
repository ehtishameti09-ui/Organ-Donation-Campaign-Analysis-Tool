<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    protected $guard_name = 'web';

    protected $fillable = [
        'name', 'email', 'phone', 'password', 'google_id', 'avatar',
        'role', 'status', 'registration_type', 'registration_complete',
        'unique_id',
        'linked_hospital_id', 'preferred_hospital_id', 'department', 'specialization',
        'banned', 'ban_details', 'is_deleted', 'deletion_details', 'recovery_deadline',
        'email_notifications', 'app_notifications', 'status_updates', 'opportunity_alerts',
        'last_login_at', 'last_login_ip', 'failed_login_attempts', 'locked_until',
        'profile_changelog', 'email_verified_at',
    ];

    protected $hidden = [
        'password', 'remember_token', 'google_id',
    ];

    protected $appends = ['hospital_id'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'registration_complete' => 'boolean',
            'banned' => 'boolean',
            'is_deleted' => 'boolean',
            'email_notifications' => 'boolean',
            'app_notifications' => 'boolean',
            'status_updates' => 'boolean',
            'opportunity_alerts' => 'boolean',
            'ban_details' => 'array',
            'deletion_details' => 'array',
            'profile_changelog' => 'array',
            'recovery_deadline' => 'datetime',
            'last_login_at' => 'datetime',
            'locked_until' => 'datetime',
        ];
    }

    public function hospitalProfile(): HasOne { return $this->hasOne(HospitalProfile::class); }
    public function donorProfile(): HasOne { return $this->hasOne(DonorProfile::class); }
    public function recipientProfile(): HasOne { return $this->hasOne(RecipientProfile::class); }
    public function clinicalProfile(): HasOne { return $this->hasOne(ClinicalProfile::class); }
    public function documents(): HasMany { return $this->hasMany(Document::class); }
    public function consentForm(): HasOne { return $this->hasOne(ConsentForm::class); }
    public function userNotifications(): HasMany { return $this->hasMany(\App\Models\Notification::class); }
    public function appeals(): HasMany { return $this->hasMany(Appeal::class); }
    public function caseAppeals(): HasMany { return $this->hasMany(CaseAppeal::class); }
    public function actionLogs(): HasMany { return $this->hasMany(ActionLog::class); }
    public function linkedHospital(): BelongsTo { return $this->belongsTo(User::class, 'linked_hospital_id'); }
    public function preferredHospital(): BelongsTo { return $this->belongsTo(User::class, 'preferred_hospital_id'); }

    public function getHospitalIdAttribute(): ?int
    {
        return $this->linked_hospital_id ?? $this->preferred_hospital_id;
    }

    public function isHospital(): bool { return $this->role === 'hospital'; }
    public function isAdmin(): bool { return in_array($this->role, ['admin', 'super_admin'], true); }
    public function isSuperAdmin(): bool { return $this->role === 'super_admin'; }
    public function isDonor(): bool { return $this->role === 'donor'; }
    public function isRecipient(): bool { return $this->role === 'recipient'; }
    public function isApproved(): bool { return $this->status === 'approved'; }
}
