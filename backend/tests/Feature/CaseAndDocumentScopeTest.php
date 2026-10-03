<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\DonorProfile;
use App\Models\RecipientProfile;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Clinical review and patient-document access.
 *
 * The worst defect in this file was real and verified before it was fixed:
 * POST /api/donors/{id}/verify sat behind `auth` alone - no role middleware and
 * no check in the controller - so ANY authenticated account could approve ANY
 * donor. It was demonstrated by approving a donor from a RECIPIENT's token, and
 * approval is what makes a donor eligible for allocation.
 *
 * The rest are the same shape: a role was checked, ownership never was.
 */
class CaseAndDocumentScopeTest extends TestCase
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
            'name'              => ucfirst($role).' '.fake()->unique()->randomNumber(5),
            'email'             => $role.fake()->unique()->randomNumber(6).'@test.local',
            'password'          => 'Password@123',
            'role'              => $role,
            'status'            => 'registered',
            'email_verified_at' => now(),
        ], $attrs));
        $u->syncRoles([$role]);
        return $u;
    }

    private function doc(User $owner): Document
    {
        return Document::create([
            'user_id'       => $owner->id,
            'document_type' => 'cnic_front',
            'original_name' => 'cnic.jpg',
            'file_path'     => 'documents/'.$owner->id.'/cnic.jpg',
            'mime_type'     => 'image/jpeg',
            'size'          => 1024,
            'status'        => 'pending',
        ]);
    }

    // ------------------------------------------------- clinical approval gate

    public function test_a_recipient_cannot_approve_a_donor(): void
    {
        $hospital = $this->makeUser('hospital', ['status' => 'approved']);
        $donor    = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        DonorProfile::create(['user_id' => $donor->id]);
        $outsider = $this->makeUser('recipient', ['preferred_hospital_id' => $hospital->id]);

        $this->actingAs($outsider, 'sanctum')
            ->postJson("/api/donors/{$donor->id}/verify", ['action' => 'approve'])
            ->assertStatus(403);

        $this->assertNotSame('approved', $donor->fresh()->status);
    }

    public function test_a_donor_cannot_approve_themselves(): void
    {
        $hospital = $this->makeUser('hospital', ['status' => 'approved']);
        $donor    = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        DonorProfile::create(['user_id' => $donor->id]);

        $this->actingAs($donor, 'sanctum')
            ->postJson("/api/donors/{$donor->id}/verify", ['action' => 'approve'])
            ->assertStatus(403);

        $this->assertNotSame('approved', $donor->fresh()->status);
    }

    public function test_a_hospital_cannot_approve_another_hospitals_donor(): void
    {
        $mine   = $this->makeUser('hospital', ['status' => 'approved']);
        $theirs = $this->makeUser('hospital', ['status' => 'approved']);
        $donor  = $this->makeUser('donor', ['preferred_hospital_id' => $theirs->id]);
        DonorProfile::create(['user_id' => $donor->id]);

        $this->actingAs($mine, 'sanctum')
            ->postJson("/api/donors/{$donor->id}/verify", ['action' => 'approve'])
            ->assertStatus(403);

        $this->assertNotSame('approved', $donor->fresh()->status);
    }

    public function test_the_treating_hospital_can_approve_its_own_donor(): void
    {
        $hospital = $this->makeUser('hospital', ['status' => 'approved']);
        $donor    = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        DonorProfile::create(['user_id' => $donor->id]);

        $this->actingAs($hospital, 'sanctum')
            ->postJson("/api/donors/{$donor->id}/verify", ['action' => 'approve'])
            ->assertStatus(200);

        $this->assertSame('approved', $donor->fresh()->status);
    }

    public function test_a_recipient_case_cannot_be_approved_by_an_outsider(): void
    {
        $mine      = $this->makeUser('hospital', ['status' => 'approved']);
        $theirs    = $this->makeUser('hospital', ['status' => 'approved']);
        $recipient = $this->makeUser('recipient', ['preferred_hospital_id' => $theirs->id]);
        RecipientProfile::create(['user_id' => $recipient->id]);

        $this->actingAs($mine, 'sanctum')
            ->postJson("/api/recipients/{$recipient->id}/verify", ['action' => 'approve'])
            ->assertStatus(403);
    }

    /**
     * Supervision is deliberately excluded from clinical decisions, matching the
     * allocation engine, which already refuses super admins to prevent bias.
     */
    public function test_a_super_admin_cannot_make_clinical_decisions(): void
    {
        $hospital   = $this->makeUser('hospital', ['status' => 'approved']);
        $donor      = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        DonorProfile::create(['user_id' => $donor->id]);
        $superAdmin = $this->makeUser('super_admin', ['status' => 'approved']);

        $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/donors/{$donor->id}/verify", ['action' => 'approve'])
            ->assertStatus(403);
    }

    // ---------------------------------------------------- document access

    public function test_a_hospital_admin_cannot_download_another_hospitals_patient_documents(): void
    {
        $mine    = $this->makeUser('hospital', ['status' => 'approved']);
        $theirs  = $this->makeUser('hospital', ['status' => 'approved']);
        $admin   = $this->makeUser('admin', ['linked_hospital_id' => $mine->id, 'status' => 'approved']);
        $patient = $this->makeUser('donor', ['preferred_hospital_id' => $theirs->id]);
        $doc     = $this->doc($patient);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/documents/{$doc->id}/download")
            ->assertStatus(403);
    }

    public function test_a_patient_can_still_read_their_own_documents(): void
    {
        $hospital = $this->makeUser('hospital', ['status' => 'approved']);
        $patient  = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        $this->doc($patient);

        $this->actingAs($patient, 'sanctum')
            ->getJson('/api/documents')
            ->assertStatus(200)
            ->assertJsonFragment(['document_type' => 'cnic_front']);
    }

    public function test_a_hospital_cannot_list_another_hospitals_patient_documents(): void
    {
        $mine    = $this->makeUser('hospital', ['status' => 'approved']);
        $theirs  = $this->makeUser('hospital', ['status' => 'approved']);
        $patient = $this->makeUser('donor', ['preferred_hospital_id' => $theirs->id]);
        $this->doc($patient);

        $this->actingAs($mine, 'sanctum')
            ->getJson("/api/documents?user_id={$patient->id}")
            ->assertStatus(403);
    }

    public function test_a_hospital_cannot_review_another_hospitals_patient_documents(): void
    {
        $mine    = $this->makeUser('hospital', ['status' => 'approved']);
        $theirs  = $this->makeUser('hospital', ['status' => 'approved']);
        $patient = $this->makeUser('donor', ['preferred_hospital_id' => $theirs->id]);
        $doc     = $this->doc($patient);

        $this->actingAs($mine, 'sanctum')
            ->postJson("/api/documents/{$doc->id}/review", ['status' => 'approved'])
            ->assertStatus(403);

        $this->assertSame('pending', $doc->fresh()->status);
    }

    public function test_the_treating_hospital_can_review_its_own_patients_documents(): void
    {
        $hospital = $this->makeUser('hospital', ['status' => 'approved']);
        $patient  = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        $doc      = $this->doc($patient);

        $this->actingAs($hospital, 'sanctum')
            ->postJson("/api/documents/{$doc->id}/review", ['status' => 'approved'])
            ->assertStatus(200);

        $this->assertSame('approved', $doc->fresh()->status);
    }

    public function test_a_patient_cannot_review_their_own_documents(): void
    {
        $hospital = $this->makeUser('hospital', ['status' => 'approved']);
        $patient  = $this->makeUser('donor', ['preferred_hospital_id' => $hospital->id]);
        $doc      = $this->doc($patient);

        $this->actingAs($patient, 'sanctum')
            ->postJson("/api/documents/{$doc->id}/review", ['status' => 'approved'])
            ->assertStatus(403);

        $this->assertSame('pending', $doc->fresh()->status);
    }

    public function test_an_unaffiliated_patient_is_in_nobodys_caseload(): void
    {
        $hospital = $this->makeUser('hospital', ['status' => 'approved']);
        $orphan   = $this->makeUser('donor');            // no preferred_hospital_id
        $doc      = $this->doc($orphan);

        $this->actingAs($hospital, 'sanctum')
            ->getJson("/api/documents/{$doc->id}/download")
            ->assertStatus(403);
    }
}
