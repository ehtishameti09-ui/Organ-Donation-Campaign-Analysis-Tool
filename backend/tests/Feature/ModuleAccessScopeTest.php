<?php

namespace Tests\Feature;

use App\Models\CaseApproval;
use App\Models\Organ;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Who may read patient-identifying data in Modules 7, 8 and 9.
 *
 * Two boundaries, both on data-minimisation grounds:
 *
 *  - AUDITORS are hospital employees (UserController::createEmployee assigns
 *    them a linked_hospital_id). They were grouped with super_admin in each
 *    controller's scope(), which gave one hospital's auditor read access to
 *    every other hospital's patients. That was a cross-tenant leak.
 *
 *  - SUPER ADMIN supervises the network. It keeps the cross-hospital aggregates
 *    that Modules 7.4 and 8.2 are built on, and loses every case-level read:
 *    those carry names, verification checklists (serology, crossmatch), doctors'
 *    notes, discard reasons and surgery times, none of which supervision needs.
 */
class ModuleAccessScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function makeUser(string $role, array $attrs = []): User
    {
        $u = User::create(array_merge([
            'name'                  => ucfirst($role) . ' ' . fake()->unique()->randomNumber(5),
            'email'                 => $role . fake()->unique()->randomNumber(6) . '@test.local',
            'password'              => 'Password@123',
            'role'                  => $role,
            'status'                => 'approved',
            'email_verified_at'     => now(),
            'registration_complete' => true,
        ], $attrs));
        $u->syncRoles([$role]);
        return $u;
    }

    /** A hospital with one organ on its registry, so there is something to leak. */
    private function hospitalWithData(): array
    {
        $hospital = $this->makeUser('hospital');

        $organ = Organ::create([
            'hospital_id'                 => $hospital->id,
            'organ_type'                  => 'kidney',
            'reference'                   => Organ::nextReference(),
            'status'                      => 'available',
            'recovered_at'                => now()->subHours(2),
            'cold_ischemia_limit_minutes' => Organ::limitFor('kidney'),
        ]);

        return [$hospital, $organ];
    }

    // ------------------------------------------------------------- auditor scope

    public function test_an_auditor_can_read_its_own_hospitals_organ_registry(): void
    {
        [$hospital, $organ] = $this->hospitalWithData();
        $auditor = $this->makeUser('auditor', ['linked_hospital_id' => $hospital->id]);

        $this->actingAs($auditor, 'sanctum')
            ->getJson('/api/organs')
            ->assertStatus(200)
            ->assertJsonFragment(['reference' => $organ->reference]);
    }

    public function test_an_auditor_cannot_read_another_hospitals_organ_registry(): void
    {
        [$theirs, $organ] = $this->hospitalWithData();
        $mine    = $this->makeUser('hospital');
        $auditor = $this->makeUser('auditor', ['linked_hospital_id' => $mine->id]);

        // Scoped to its own (empty) hospital - the other hospital's organ must not appear.
        $this->actingAs($auditor, 'sanctum')
            ->getJson('/api/organs')
            ->assertStatus(200)
            ->assertJsonMissing(['reference' => $organ->reference]);
    }

    public function test_an_auditor_cannot_modify_anything(): void
    {
        [$hospital, $organ] = $this->hospitalWithData();
        $auditor = $this->makeUser('auditor', ['linked_hospital_id' => $hospital->id]);

        $this->actingAs($auditor, 'sanctum')
            ->patchJson("/api/organs/{$organ->id}/status", ['status' => 'discarded', 'reason' => 'auditor write attempt'])
            ->assertStatus(403);

        $this->assertSame('available', $organ->fresh()->status);
    }

    public function test_an_auditor_with_no_hospital_has_no_access(): void
    {
        $auditor = $this->makeUser('auditor');   // no linked_hospital_id

        $this->actingAs($auditor, 'sanctum')->getJson('/api/organs')->assertStatus(403);
    }

    // -------------------------------------------------- super admin supervision

    public function test_a_super_admin_cannot_read_case_level_records(): void
    {
        [$hospital, $organ] = $this->hospitalWithData();
        $superAdmin = $this->makeUser('super_admin');

        foreach (['/api/approvals', '/api/organs', '/api/surgery/bookings',
                  '/api/surgery/calendar', '/api/surgery/resources'] as $endpoint) {
            $this->actingAs($superAdmin, 'sanctum')
                ->getJson($endpoint)
                ->assertStatus(403);
        }

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson("/api/organs/{$organ->id}")
            ->assertStatus(403);
    }

    /**
     * The other half: supervision must keep working, or Modules 7.4 and 8.2 lose
     * their only possible viewer and the governance features become decorative.
     */
    public function test_a_super_admin_keeps_the_cross_hospital_aggregates(): void
    {
        $this->hospitalWithData();
        $superAdmin = $this->makeUser('super_admin');

        foreach (['/api/approvals/metrics', '/api/organs/metrics', '/api/surgery/utilization'] as $endpoint) {
            $this->actingAs($superAdmin, 'sanctum')
                ->getJson($endpoint)
                ->assertStatus(200);
        }
    }

    public function test_the_super_admin_aggregate_carries_no_patient_identifiers(): void
    {
        [$hospital, $organ] = $this->hospitalWithData();
        $donor = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        $organ->update(['donor_user_id' => $donor->id]);

        $superAdmin = $this->makeUser('super_admin');

        $body = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/organs/metrics')
            ->assertStatus(200)
            ->getContent();

        // Neither the patient's name nor the organ's own reference should appear
        // in a figure meant to describe hospital performance.
        $this->assertStringNotContainsString($donor->name, $body);
        $this->assertStringNotContainsString($organ->reference, $body);
    }

    public function test_a_super_admin_cannot_write_to_these_modules(): void
    {
        [$hospital, $organ] = $this->hospitalWithData();
        $superAdmin = $this->makeUser('super_admin');

        $this->actingAs($superAdmin, 'sanctum')
            ->patchJson("/api/organs/{$organ->id}/status", ['status' => 'discarded', 'reason' => 'supervisor write attempt'])
            ->assertStatus(403);

        $this->assertSame('available', $organ->fresh()->status);
    }

    // ------------------------------------------------------ treating hospital

    public function test_the_treating_hospital_still_sees_its_own_patients(): void
    {
        [$hospital, $organ] = $this->hospitalWithData();

        $this->actingAs($hospital, 'sanctum')
            ->getJson('/api/organs')
            ->assertStatus(200)
            ->assertJsonFragment(['reference' => $organ->reference]);

        $this->actingAs($hospital, 'sanctum')
            ->getJson("/api/organs/{$organ->id}")
            ->assertStatus(200);
    }

    public function test_a_hospital_cannot_see_another_hospitals_organs(): void
    {
        [$theirs, $organ] = $this->hospitalWithData();
        $mine = $this->makeUser('hospital');

        $this->actingAs($mine, 'sanctum')
            ->getJson("/api/organs/{$organ->id}")
            ->assertStatus(403);
    }
}
