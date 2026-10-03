<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Authorization boundaries for user management and hospital governance.
 *
 * Every test here corresponds to a hole that was actually open in this codebase,
 * not a hypothetical. The headline one: PATCH /api/users/{user} accepted `role`
 * with no actor-side check at all, so any authenticated account - a donor
 * included - could promote itself to super_admin with a single request. That was
 * verified against the running application before it was fixed.
 *
 * These are pinned as tests because authorization written as scattered `if`
 * statements silently rots: the previous code had a correct scoping helper that
 * ban() and destroy() simply never called.
 */
class UserAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The `role:` route middleware is Spatie's, so it reads model_has_roles -
     * not the users.role column. Without the roles seeded, every guarded route
     * fails with "no role named X" before the authorization under test is even
     * reached.
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function makeUser(string $role, array $attrs = []): User
    {
        $user = User::create(array_merge([
            'name'                  => ucfirst($role) . ' ' . fake()->unique()->randomNumber(5),
            'email'                 => $role . fake()->unique()->randomNumber(6) . '@test.local',
            'password'              => 'Password@123',
            'role'                  => $role,
            'status'                => 'approved',
            'email_verified_at'     => now(),
            'registration_complete' => true,
        ], $attrs));

        $user->syncRoles([$role]);

        return $user;
    }

    // ---------------------------------------------------------------- escalation

    public function test_a_donor_cannot_promote_itself_to_super_admin(): void
    {
        $donor = $this->makeUser('donor');

        $this->actingAs($donor, 'sanctum')
            ->patchJson("/api/users/{$donor->id}", ['role' => 'super_admin'])
            ->assertStatus(403);

        $this->assertSame('donor', $donor->fresh()->role);
    }

    public function test_a_hospital_admin_cannot_change_a_users_role(): void
    {
        $hospital = $this->makeUser('hospital');
        $admin    = $this->makeUser('admin', ['linked_hospital_id' => $hospital->id]);
        $doctor   = $this->makeUser('doctor', ['linked_hospital_id' => $hospital->id]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/users/{$doctor->id}", ['role' => 'admin'])
            ->assertStatus(403);

        $this->assertSame('doctor', $doctor->fresh()->role);
    }

    public function test_nobody_but_a_super_admin_can_reassign_hospital_linkage(): void
    {
        $hospitalA = $this->makeUser('hospital');
        $hospitalB = $this->makeUser('hospital');
        $admin     = $this->makeUser('admin', ['linked_hospital_id' => $hospitalA->id]);

        // Re-pointing yourself at another hospital would hand you its entire caseload.
        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/users/{$admin->id}", ['linked_hospital_id' => $hospitalB->id])
            ->assertStatus(403);

        $this->assertSame($hospitalA->id, $admin->fresh()->linked_hospital_id);
    }

    public function test_a_super_admin_can_still_change_roles(): void
    {
        $superAdmin = $this->makeUser('super_admin');
        $doctor     = $this->makeUser('doctor');

        $this->actingAs($superAdmin, 'sanctum')
            ->patchJson("/api/users/{$doctor->id}", ['role' => 'data_entry'])
            ->assertStatus(200);

        $this->assertSame('data_entry', $doctor->fresh()->role);
    }

    // ------------------------------------------------------------- self vs others

    public function test_a_user_can_still_edit_their_own_profile(): void
    {
        $donor = $this->makeUser('donor');

        $this->actingAs($donor, 'sanctum')
            ->patchJson("/api/users/{$donor->id}", ['name' => 'Renamed Self'])
            ->assertStatus(200);

        $this->assertSame('Renamed Self', $donor->fresh()->name);
    }

    public function test_a_donor_cannot_edit_another_users_profile(): void
    {
        $donor  = $this->makeUser('donor');
        $victim = $this->makeUser('recipient', ['name' => 'Untouched']);

        $this->actingAs($donor, 'sanctum')
            ->patchJson("/api/users/{$victim->id}", ['name' => 'Tampered'])
            ->assertStatus(403);

        $this->assertSame('Untouched', $victim->fresh()->name);
    }

    // ------------------------------------------------------------ hospital scope

    public function test_a_hospital_admin_cannot_ban_a_patient_of_another_hospital(): void
    {
        $mine   = $this->makeUser('hospital');
        $theirs = $this->makeUser('hospital');
        $admin  = $this->makeUser('admin', ['linked_hospital_id' => $mine->id]);
        $victim = $this->makeUser('donor', ['preferred_hospital_id' => $theirs->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$victim->id}/ban", [
                'category' => 'documentation', 'detailed_reason' => 'not my patient at all',
                'ban_type' => 'permanent',
            ])
            ->assertStatus(403);

        $this->assertFalse((bool) $victim->fresh()->banned);
    }

    public function test_a_hospital_admin_cannot_delete_a_patient_of_another_hospital(): void
    {
        $mine   = $this->makeUser('hospital');
        $theirs = $this->makeUser('hospital');
        $admin  = $this->makeUser('admin', ['linked_hospital_id' => $mine->id]);
        $victim = $this->makeUser('recipient', ['preferred_hospital_id' => $theirs->id]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/users/{$victim->id}", [
                'reason' => 'deleting someone elses patient', 'category' => 'other',
            ])
            ->assertStatus(403);

        $this->assertFalse((bool) $victim->fresh()->is_deleted);
    }

    /**
     * The specific hole: the old scope check was skipped entirely when the target
     * had no hospital, so every unaffiliated account in the system - patients who
     * had not yet picked a hospital - was bannable by any hospital admin.
     */
    public function test_a_hospital_admin_cannot_ban_an_unaffiliated_user(): void
    {
        $mine   = $this->makeUser('hospital');
        $admin  = $this->makeUser('admin', ['linked_hospital_id' => $mine->id]);
        $victim = $this->makeUser('donor');   // no preferred_hospital_id at all

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$victim->id}/ban", [
                'category' => 'documentation', 'detailed_reason' => 'unaffiliated user ban attempt',
                'ban_type' => 'permanent',
            ])
            ->assertStatus(403);

        $this->assertFalse((bool) $victim->fresh()->banned);
    }

    /**
     * The mirror hole: the scope check only ran `if ($actor->linked_hospital_id)`,
     * so an admin with NO hospital skipped it and could act on anyone - making
     * unlinked admins strictly more powerful than hospital-linked ones.
     */
    public function test_an_unlinked_admin_cannot_ban_users(): void
    {
        $hospital = $this->makeUser('hospital');
        $admin    = $this->makeUser('admin');   // deliberately unlinked
        $victim   = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$victim->id}/ban", [
                'category' => 'documentation', 'detailed_reason' => 'unlinked admin ban attempt',
                'ban_type' => 'permanent',
            ])
            ->assertStatus(403);

        $this->assertFalse((bool) $victim->fresh()->banned);
    }

    public function test_a_hospital_admin_can_ban_its_own_hospitals_patient(): void
    {
        $mine    = $this->makeUser('hospital');
        $admin   = $this->makeUser('admin', ['linked_hospital_id' => $mine->id]);
        $patient = $this->makeUser('donor', ['preferred_hospital_id' => $mine->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$patient->id}/ban", [
                'category' => 'documentation', 'detailed_reason' => 'documents repeatedly falsified',
                'ban_type' => 'permanent',
            ])
            ->assertStatus(200);

        $this->assertTrue((bool) $patient->fresh()->banned);
    }

    public function test_an_admin_cannot_ban_another_admin(): void
    {
        $hospital = $this->makeUser('hospital');
        $a = $this->makeUser('admin', ['linked_hospital_id' => $hospital->id]);
        $b = $this->makeUser('admin', ['linked_hospital_id' => $hospital->id]);

        $this->actingAs($a, 'sanctum')
            ->postJson("/api/users/{$b->id}/ban", [
                'category' => 'other', 'detailed_reason' => 'admin banning a peer admin',
                'ban_type' => 'permanent',
            ])
            ->assertStatus(403);

        $this->assertFalse((bool) $b->fresh()->banned);
    }

    // -------------------------------------------------------- hospital governance

    public function test_a_hospital_linked_admin_cannot_approve_another_hospital(): void
    {
        $mine      = $this->makeUser('hospital');
        $admin     = $this->makeUser('admin', ['linked_hospital_id' => $mine->id]);
        $applicant = $this->makeUser('hospital', ['status' => 'pending']);

        // Competing hospitals must not vet each other.
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/hospitals/{$applicant->id}/approve")
            ->assertStatus(403);

        $this->assertSame('pending', $applicant->fresh()->status);
    }

    public function test_a_super_admin_can_approve_a_hospital(): void
    {
        $superAdmin = $this->makeUser('super_admin');
        $applicant  = $this->makeUser('hospital', ['status' => 'pending']);

        $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/hospitals/{$applicant->id}/approve")
            ->assertStatus(200);

        $this->assertSame('approved', $applicant->fresh()->status);
    }

    public function test_a_hospital_linked_admin_cannot_create_admin_accounts(): void
    {
        $mine  = $this->makeUser('hospital');
        $admin = $this->makeUser('admin', ['linked_hospital_id' => $mine->id]);

        // Creating admins must go through the AdminRequest -> super admin flow.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/users/create-admin', [
                'name'     => 'Backdoor Admin',
                'email'    => 'backdoor@test.local',
                'password' => 'Str0ng!Passw0rd#2026',
            ])
            ->assertStatus(403);

        $this->assertDatabaseMissing('users', ['email' => 'backdoor@test.local']);
    }

    // --------------------------------------------------------- status workflow

    /**
     * The sharpest consequence in this domain: AllocationController gates donor
     * and recipient eligibility on users.status === 'approved', so a patient who
     * can set their own status can enter the organ allocation pool with no
     * clinical verification whatsoever.
     */
    public function test_a_donor_cannot_approve_their_own_account(): void
    {
        $hospital = $this->makeUser('hospital');
        $donor    = $this->makeUser('donor', [
            'status' => 'pending', 'preferred_hospital_id' => $hospital->id,
        ]);

        $this->actingAs($donor, 'sanctum')
            ->patchJson("/api/users/{$donor->id}", ['status' => 'approved'])
            ->assertStatus(403);

        $this->assertSame('pending', $donor->fresh()->status);
    }

    public function test_a_recipient_cannot_set_an_arbitrary_status_on_themselves(): void
    {
        $recipient = $this->makeUser('recipient', ['status' => 'pending']);

        foreach (['approved', 'registered', 'rejected', 'warned'] as $attempt) {
            $this->actingAs($recipient, 'sanctum')
                ->patchJson("/api/users/{$recipient->id}", ['status' => $attempt])
                ->assertStatus(403);
        }

        $this->assertSame('pending', $recipient->fresh()->status);
    }

    /** The one legitimate self-transition: resubmitting after info_requested. */
    public function test_a_patient_can_resubmit_their_case_after_info_was_requested(): void
    {
        $hospital = $this->makeUser('hospital');
        $donor    = $this->makeUser('donor', [
            'status' => 'info_requested', 'preferred_hospital_id' => $hospital->id,
        ]);

        $this->actingAs($donor, 'sanctum')
            ->patchJson("/api/users/{$donor->id}", ['status' => 'submitted'])
            ->assertStatus(200);

        $this->assertSame('submitted', $donor->fresh()->status);
    }

    public function test_an_approved_patient_cannot_rewind_their_own_status(): void
    {
        $hospital = $this->makeUser('hospital');
        $donor    = $this->makeUser('donor', [
            'status' => 'approved', 'preferred_hospital_id' => $hospital->id,
        ]);

        $this->actingAs($donor, 'sanctum')
            ->patchJson("/api/users/{$donor->id}", ['status' => 'submitted'])
            ->assertStatus(403);

        $this->assertSame('approved', $donor->fresh()->status);
    }

    /** The hospital reviewing its own patient is the whole point of the column. */
    public function test_a_hospital_can_approve_its_own_patient(): void
    {
        $hospital = $this->makeUser('hospital');
        $donor    = $this->makeUser('donor', [
            'status' => 'submitted', 'preferred_hospital_id' => $hospital->id,
        ]);

        $this->actingAs($hospital, 'sanctum')
            ->patchJson("/api/users/{$donor->id}", ['status' => 'approved'])
            ->assertStatus(200);

        $this->assertSame('approved', $donor->fresh()->status);
    }

    public function test_a_hospital_cannot_approve_another_hospitals_patient(): void
    {
        $mine   = $this->makeUser('hospital');
        $theirs = $this->makeUser('hospital');
        $donor  = $this->makeUser('donor', [
            'status' => 'submitted', 'preferred_hospital_id' => $theirs->id,
        ]);

        $this->actingAs($mine, 'sanctum')
            ->patchJson("/api/users/{$donor->id}", ['status' => 'approved'])
            ->assertStatus(403);

        $this->assertSame('submitted', $donor->fresh()->status);
    }
}
