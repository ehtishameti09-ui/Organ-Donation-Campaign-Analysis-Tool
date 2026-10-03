<?php

namespace App\Support;

use App\Models\User;

/**
 * One place that answers: may this actor act on this patient's case?
 *
 * Every controller that touches a donor, recipient or their documents had its
 * own version of this question, and several simply never asked it - a recipient
 * could approve a donor into the allocation pool, and any hospital-linked admin
 * could download every patient's CNIC in the country. Scattered `if` statements
 * are how that happens: each one looks reasonable on its own, and nobody notices
 * the one that was never written.
 *
 * The rules, in one place:
 *
 *   super_admin  - network supervision. May read, may NOT review clinical cases
 *                  (the allocation engine already bars them for the same reason).
 *   hospital     - its own patients: anyone whose preferred_hospital_id is it.
 *   admin/doctor - the patients of the hospital they are linked to. An admin
 *                  with no hospital has no scope, so no access.
 *   data_entry   - same hospital scope, for data work.
 *   auditor      - read-only, own hospital.
 *   donor/recip. - themselves and nobody else.
 */
class CaseScope
{
    /** Roles that may make a clinical review decision (approve / reject / request info). */
    private const REVIEWERS = ['hospital', 'admin', 'doctor'];

    /** Roles whose reach is their linked hospital rather than their own id. */
    private const HOSPITAL_STAFF = ['admin', 'doctor', 'data_entry', 'auditor'];

    /**
     * The hospital this actor acts for, or null if it has none.
     */
    public static function hospitalIdFor(User $actor): ?int
    {
        if ($actor->role === 'hospital') return (int) $actor->id;

        if (in_array($actor->role, self::HOSPITAL_STAFF, true) && $actor->linked_hospital_id) {
            return (int) $actor->linked_hospital_id;
        }

        return null;
    }

    /**
     * May $actor READ $patient's case and documents?
     * Returns null when allowed, or the reason to show when not.
     */
    public static function denyRead(User $actor, User $patient): ?string
    {
        if ($actor->id === $patient->id) return null;

        // Supervision may look across the network but not at identifiable
        // clinical records; where that applies the controller blocks it first.
        if ($actor->role === 'super_admin') return null;

        $scope = self::hospitalIdFor($actor);
        if (!$scope) {
            return 'Your account is not linked to a hospital, so it cannot access patient records.';
        }

        $patientHospital = $patient->preferred_hospital_id ?? $patient->linked_hospital_id;

        // A patient attached to no hospital is in nobody's caseload. Treating
        // "no hospital" as "anyone may" is the exact mistake that let any
        // hospital act on every unaffiliated account in the system.
        if (!$patientHospital) {
            return 'That person is not registered with your hospital.';
        }

        return (int) $patientHospital === $scope
            ? null
            : 'That person is registered with a different hospital.';
    }

    /**
     * May $actor make a clinical decision about $patient - approve, reject,
     * request more information, or review their documents?
     */
    public static function denyReview(User $actor, User $patient): ?string
    {
        if ($actor->id === $patient->id) {
            return 'You cannot review your own case.';
        }

        if (!in_array($actor->role, self::REVIEWERS, true)) {
            return 'Your role cannot review patient cases.';
        }

        return self::denyRead($actor, $patient);
    }
}
