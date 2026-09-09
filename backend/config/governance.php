<?php

/**
 * Module 7 — Hospital Approval Board governance rules.
 *
 * The checklist below is the template. It is snapshotted into each
 * case_approvals row at creation, so editing this file changes what NEW cases
 * must satisfy without rewriting what past approvers actually attested to.
 */
return [

    /*
     * Every item with 'required' => true must be checked before any approval
     * action is permitted. Enforced server-side in CaseApprovalController; the
     * UI mirrors the same rule so the button is visibly disabled.
     */
    'approval_checklist' => [
        ['key' => 'donor_consent_verified',      'label' => 'Donor consent form signed and on file',            'required' => true],
        ['key' => 'recipient_consent_verified',  'label' => 'Recipient informed consent obtained',              'required' => true],
        ['key' => 'blood_group_confirmed',       'label' => 'ABO compatibility re-confirmed against source records', 'required' => true],
        ['key' => 'crossmatch_negative',         'label' => 'Final crossmatch result negative',                 'required' => true],
        ['key' => 'serology_cleared',            'label' => 'Donor serology (HIV / HBV / HCV) cleared',         'required' => true],
        ['key' => 'organ_viability_confirmed',   'label' => 'Organ viability assessed and acceptable',          'required' => true],
        ['key' => 'recipient_fitness_confirmed', 'label' => 'Recipient fit for surgery (anaesthesia clearance)', 'required' => true],
        ['key' => 'documentation_complete',      'label' => 'Statutory documentation complete',                 'required' => true],
        ['key' => 'family_briefed',              'label' => 'Family briefed on procedure and risks',            'required' => false],
        ['key' => 'transport_arranged',          'label' => 'Retrieval / transport logistics arranged',         'required' => false],
    ],

    /*
     * Minimum characters for a rejection justification. Mirrors the existing
     * override-reason rule in AllocationController so governance text is
     * consistently substantive across the system.
     */
    'rejection_reason_min' => 20,

    /*
     |--------------------------------------------------------------------------
     | Module 8 — Cold ischemia limits (minutes)
     |--------------------------------------------------------------------------
     |
     | Maximum tolerable cold ischemia time per organ, keyed by the lowercase
     | organ value the rest of the app stores (see src/utils/organs.js). These
     | are the accepted clinical windows: the thoracic organs are the tightest,
     | kidneys tolerate the longest, and preserved tissues are measured in days.
     |
     | Copied onto each organ row at creation, so revising a limit here never
     | retroactively changes whether a past organ was recorded as breached.
     */
    'cold_ischemia_minutes' => [
        'heart'         => 240,     // 4h
        'lung'          => 360,     // 6h
        'liver'         => 720,     // 12h
        'pancreas'      => 720,     // 12h
        'intestine'     => 480,     // 8h
        'kidney'        => 1440,    // 24h
        'bone marrow'   => 2880,    // 48h
        'cornea'        => 10080,   // 7d in storage medium
        'heart valve'   => 20160,   // 14d, cryopreserved
        'bone'          => 20160,
        'skin'          => 20160,
        'tendon'        => 20160,
        'blood vessel'  => 20160,
    ],

    'cold_ischemia_default_minutes' => 1440,

    /*
     | Fractions of the limit at which an organ changes alert state. Advisory is
     | "start planning", warning is "act now", breach is past the limit.
     */
    'cold_ischemia_thresholds' => [
        'advisory' => 0.60,
        'warning'  => 0.85,
    ],

    /*
     |--------------------------------------------------------------------------
     | Module 9 — Surgery scheduling
     |--------------------------------------------------------------------------
     |
     | Denominators for the utilization percentages. A theatre is not available
     | 24h a day, so measuring booked hours against 24 would make every hospital
     | look idle. These are the assumed available minutes per resource per day.
     */
    'capacity_minutes_per_day' => [
        'theatre' => 720,   // 12h operating day
        'surgeon' => 480,   // 8h shift
        'icu_bed' => 1440,  // beds are occupied around the clock
    ],

    // Guard rails on a single booking window.
    'surgery_min_minutes' => 30,
    'surgery_max_minutes' => 1440,

];
