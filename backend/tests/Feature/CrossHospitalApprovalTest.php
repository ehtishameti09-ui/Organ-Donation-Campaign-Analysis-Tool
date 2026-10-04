<?php

namespace Tests\Feature;

use App\Models\AllocationDecision;
use App\Models\AllocationPolicy;
use App\Models\AllocationRun;
use App\Models\CaseApproval;
use App\Models\RecipientProfile;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The approval board is two-sided, because allocation is cross-hospital.
 *
 * AllocationController::loadRecipientPayloads() has always drawn candidates from
 * every approved recipient in the network, but Module 7 keyed each case on the
 * DONOR's hospital alone and filtered the board on that one column. The result was
 * that a hospital could approve - or reject - a transplant for a patient belonging
 * to a hospital that had never seen the case, and the receiving hospital could not
 * even see that its patient had been matched. On the seeded data that was 8 of 10
 * cases, three of them already closed.
 *
 * Every test below asserts BOTH directions: that the wrong side is refused, and
 * that the right side still works. A guard that denies everything is not a fix.
 */
class CrossHospitalApprovalTest extends TestCase
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

    /**
     * A confirmed allocation whose donor sits at one hospital and recipient at
     * another, with a ranked candidate list behind it so a decline has somewhere
     * to fall to.
     *
     * @return array{0: CaseApproval, 1: User, 2: User, 3: User, 4: User}
     *         case, donor hospital, recipient hospital, donor, recipient
     */
    private function crossHospitalCase(int $extraCandidates = 2): array
    {
        $donorHospital     = $this->makeUser('hospital');
        $recipientHospital = $this->makeUser('hospital');

        $donor     = $this->makeUser('donor',     ['preferred_hospital_id' => $donorHospital->id]);
        $recipient = $this->makeUser('recipient', ['preferred_hospital_id' => $recipientHospital->id]);

        RecipientProfile::create([
            'user_id' => $recipient->id, 'blood_type' => 'O+', 'organ_needed' => 'kidney',
            'diagnosis' => 'ESRD', 'urgency_score' => 9.0, 'days_on_waitlist' => 400,
        ]);

        // The ranked pool. Rank 1 is the matched recipient; the rest are the
        // fallbacks a decline should walk down.
        $results = [[
            'user_id' => $recipient->id, 'rank' => 1, 'final_score' => 90.0,
            'hospital_id' => $recipientHospital->id, 'blood_type' => 'O+',
            'organ_needed' => 'kidney', 'urgency_score' => 9.0,
        ]];

        $fallbacks = [];
        for ($i = 0; $i < $extraCandidates; $i++) {
            $other = $this->makeUser('recipient', ['preferred_hospital_id' => $recipientHospital->id]);
            RecipientProfile::create([
                'user_id' => $other->id, 'blood_type' => 'O+', 'organ_needed' => 'kidney',
                'urgency_score' => 8.0 - $i, 'days_on_waitlist' => 300,
            ]);
            $fallbacks[] = $other;
            $results[] = [
                'user_id' => $other->id, 'rank' => $i + 2, 'final_score' => 80.0 - $i,
                'hospital_id' => $recipientHospital->id, 'blood_type' => 'O+',
                'organ_needed' => 'kidney', 'urgency_score' => 8.0 - $i,
            ];
        }

        $policy = AllocationPolicy::create([
            'version' => 'test-1', 'name' => 'Test policy', 'weights' => ['urgency' => 1], 'is_active' => true,
        ]);

        $run = AllocationRun::create([
            'policy_id' => $policy->id, 'donor_user_id' => $donor->id, 'organ' => 'kidney',
            'weights_snapshot' => ['urgency' => 1],
            'dataset_snapshot' => ['donor' => ['user_id' => $donor->id, 'blood_type' => 'O+']],
            'results' => $results, 'candidate_count' => count($results), 'mode' => 'live',
        ]);

        $decision = AllocationDecision::create([
            'allocation_run_id' => $run->id, 'selected_recipient_id' => $recipient->id,
            'selected_rank' => 1, 'was_override' => false, 'decided_by' => $donorHospital->id,
            'hospital_id' => $donorHospital->id, 'status' => 'confirmed',
        ]);

        $case = CaseApproval::create([
            'allocation_decision_id' => $decision->id,
            'hospital_id'            => $donorHospital->id,
            'recipient_hospital_id'  => $recipientHospital->id,
            'donor_user_id'          => $donor->id,
            'recipient_user_id'      => $recipient->id,
            'organ'                  => 'kidney',
            'stage'                  => 'checklist',
            'requires_multi_user'    => true,
            'checklist'              => CaseApproval::freshChecklist(),
            'allocated_at'           => now()->subHour(),
        ]);

        $this->fallbacks = $fallbacks;

        return [$case, $donorHospital, $recipientHospital, $donor, $recipient];
    }

    /** @var array<User> */
    private array $fallbacks = [];

    /** Tick every required item, as the donor hospital. */
    private function clearChecklist(CaseApproval $case, User $donorHospital): void
    {
        foreach ($case->checklist as $item) {
            if (!($item['required'] ?? false)) continue;
            $this->actingAs($donorHospital)
                 ->postJson("/api/approvals/{$case->id}/checklist", ['key' => $item['key'], 'checked' => true])
                 ->assertOk();
        }
    }

    // ------------------------------------------------------- visibility, both sides

    /** @test */
    public function the_receiving_hospital_can_see_a_case_for_its_own_patient(): void
    {
        [$case, , $recipientHospital] = $this->crossHospitalCase();

        $r = $this->actingAs($recipientHospital)->getJson('/api/approvals?stage=open')->assertOk();

        $ids = collect($r->json('data'))->pluck('id');
        $this->assertContains($case->id, $ids->all(),
            'The hospital that holds the recipient record must see the case it will be asked to accept.');

        $row = collect($r->json('data'))->firstWhere('id', $case->id);
        $this->assertSame('recipient', $row['side']);
        $this->assertTrue($row['is_cross_hospital']);
    }

    /** @test */
    public function the_procuring_hospital_still_sees_its_own_case(): void
    {
        [$case, $donorHospital] = $this->crossHospitalCase();

        $row = collect($this->actingAs($donorHospital)->getJson('/api/approvals?stage=open')->json('data'))
            ->firstWhere('id', $case->id);

        $this->assertNotNull($row);
        $this->assertSame('donor', $row['side']);
    }

    /** @test */
    public function an_unrelated_hospital_sees_nothing_and_cannot_open_the_case(): void
    {
        [$case] = $this->crossHospitalCase();
        $bystander = $this->makeUser('hospital');

        $ids = collect($this->actingAs($bystander)->getJson('/api/approvals')->json('data'))->pluck('id');
        $this->assertNotContains($case->id, $ids->all());

        $this->actingAs($bystander)->getJson("/api/approvals/{$case->id}")->assertStatus(403);
    }

    /** @test */
    public function super_admin_is_still_refused_case_level_reads(): void
    {
        [$case] = $this->crossHospitalCase();
        $super = $this->makeUser('super_admin');

        $this->actingAs($super)->getJson('/api/approvals')->assertStatus(403);
        $this->actingAs($super)->getJson("/api/approvals/{$case->id}")->assertStatus(403);
        // Aggregates remain available - that is the supervision tier's whole job.
        $this->actingAs($super)->getJson('/api/approvals/metrics')->assertOk();
    }

    // -------------------------------------------------------------- write authority

    /** @test */
    public function the_receiving_hospital_cannot_drive_the_donor_sides_workflow(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();

        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/checklist", ['key' => 'crossmatch_negative', 'checked' => true])
             ->assertStatus(403);

        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/reject", ['reason' => 'Not our call to make at all here.'])
             ->assertStatus(403);

        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/admin-confirm", [])
             ->assertStatus(403);

        // ...and the donor side still can.
        $this->actingAs($donorHospital)
             ->postJson("/api/approvals/{$case->id}/checklist", ['key' => 'crossmatch_negative', 'checked' => true])
             ->assertOk();
    }

    /** @test */
    public function the_procuring_hospital_cannot_answer_the_offer_on_the_counterpartys_behalf(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();
        $this->clearChecklist($case, $donorHospital);

        // Push the case to the offer stage.
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);
        $this->assertSame('offer', $case->fresh()->stage);

        $this->actingAs($donorHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])
             ->assertStatus(403);

        // The receiving hospital can.
        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])
             ->assertOk();
    }

    // ------------------------------------------------------------ the offer gate

    /** @test */
    public function sign_off_is_blocked_until_the_receiving_hospital_accepts(): void
    {
        [$case, $donorHospital] = $this->crossHospitalCase();
        $doctor = $this->makeUser('doctor', ['linked_hospital_id' => $donorHospital->id]);

        $this->clearChecklist($case, $donorHospital);

        $r = $this->actingAs($doctor)->postJson("/api/approvals/{$case->id}/doctor-approve", [])
                  ->assertStatus(422);
        $this->assertStringContainsString('accept the offer', $r->json('message'));

        $this->assertSame('offer', $case->fresh()->stage);
    }

    /** @test */
    public function accepting_the_offer_hands_the_case_back_to_the_donor_side(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();
        $doctor = $this->makeUser('doctor', ['linked_hospital_id' => $donorHospital->id]);

        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($doctor)->postJson("/api/approvals/{$case->id}/doctor-approve", [])->assertStatus(422);

        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true, 'notes' => 'Patient fit and consented.'])
             ->assertOk();

        $fresh = $case->fresh();
        $this->assertSame('doctor', $fresh->stage);
        $this->assertNotNull($fresh->offer_responded_at);
        $this->assertNotNull($fresh->offer_seconds);

        // Now the donor side's workflow proceeds normally.
        $this->actingAs($doctor)->postJson("/api/approvals/{$case->id}/doctor-approve", [])->assertOk();
        $this->assertSame('admin', $case->fresh()->stage);

        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertOk();
        $this->assertSame('approved', $case->fresh()->stage);
    }

    /** @test */
    public function a_same_hospital_case_skips_the_offer_stage_entirely(): void
    {
        $hospital  = $this->makeUser('hospital');
        $donor     = $this->makeUser('donor',     ['preferred_hospital_id' => $hospital->id]);
        $recipient = $this->makeUser('recipient', ['preferred_hospital_id' => $hospital->id]);

        $policy = AllocationPolicy::create([
            'version' => 'same-1', 'name' => 'Same', 'weights' => ['urgency' => 1], 'is_active' => true,
        ]);
        $run = AllocationRun::create([
            'policy_id' => $policy->id, 'donor_user_id' => $donor->id, 'organ' => 'kidney',
            'weights_snapshot' => [], 'dataset_snapshot' => [], 'results' => [], 'candidate_count' => 0,
        ]);
        $decision = AllocationDecision::create([
            'allocation_run_id' => $run->id, 'selected_recipient_id' => $recipient->id,
            'selected_rank' => 1, 'decided_by' => $hospital->id, 'hospital_id' => $hospital->id,
            'status' => 'confirmed',
        ]);
        $case = CaseApproval::create([
            'allocation_decision_id' => $decision->id, 'hospital_id' => $hospital->id,
            'recipient_hospital_id' => $hospital->id, 'donor_user_id' => $donor->id,
            'recipient_user_id' => $recipient->id, 'organ' => 'kidney', 'stage' => 'checklist',
            'requires_multi_user' => false, 'checklist' => CaseApproval::freshChecklist(),
            'allocated_at' => now(),
        ]);

        $this->assertFalse($case->isCrossHospital());

        $this->clearChecklist($case, $hospital);

        // Straight to admin confirmation - there is no counterparty to ask.
        $this->actingAs($hospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertOk();
        $this->assertSame('approved', $case->fresh()->stage);
    }

    /** @test */
    public function completing_the_checklist_sends_the_offer_without_a_signoff_attempt(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();

        // Nothing but ticking the checklist - no doctor-approve, no admin-confirm.
        $this->clearChecklist($case, $donorHospital);

        $fresh = $case->fresh();
        $this->assertSame('offer', $fresh->stage,
            'A completed checklist IS the offer; the counterparty must not have to wait for a failed sign-off click.');
        $this->assertNotNull($fresh->offer_sent_at);

        // And it is already actionable on the other side.
        $r = $this->actingAs($recipientHospital)->getJson('/api/approvals?stage=awaiting_us')->assertOk();
        $row = collect($r->json('data'))->firstWhere('id', $case->id);
        $this->assertNotNull($row);
        $this->assertTrue($row['can_answer_offer']);
        $this->assertGreaterThan(0, $r->json('awaiting_us'));
    }

    /** @test */
    public function withdrawing_an_unanswered_offer_resets_the_response_clock(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();

        $this->clearChecklist($case, $donorHospital);
        $this->assertSame('offer', $case->fresh()->stage);

        // Pretend it has been pending a while, then the procuring hospital unticks
        // an item - there is now nothing for the counterparty to answer.
        $case->fresh()->forceFill(['offer_sent_at' => now()->subHours(5)])->save();

        $this->actingAs($donorHospital)
             ->postJson("/api/approvals/{$case->id}/checklist", ['key' => 'crossmatch_negative', 'checked' => false])
             ->assertOk();

        $walked = $case->fresh();
        $this->assertSame('checklist', $walked->stage);
        $this->assertNull($walked->offer_sent_at,
            'A withdrawn offer must drop its clock, or the paused time is billed to the counterparty as slow response.');

        // Re-offering starts the clock fresh.
        $this->actingAs($donorHospital)
             ->postJson("/api/approvals/{$case->id}/checklist", ['key' => 'crossmatch_negative', 'checked' => true])
             ->assertOk();

        $reoffered = $case->fresh();
        $this->assertSame('offer', $reoffered->stage);
        $this->assertNotNull($reoffered->offer_sent_at);
        $this->assertLessThan(60, $reoffered->offer_sent_at->diffInSeconds(now()));

        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])->assertOk();

        $this->assertLessThan(60, (int) $case->fresh()->offer_seconds,
            'Offer response time must measure only the time the offer was actually open.');
    }

    /** @test */
    public function an_accepted_offer_is_not_re_asked_when_the_checklist_is_amended(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();

        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])->assertOk();
        $this->assertSame('doctor', $case->fresh()->stage);

        // The procuring hospital amends its own paperwork afterwards.
        $this->actingAs($donorHospital)
             ->postJson("/api/approvals/{$case->id}/checklist", ['key' => 'crossmatch_negative', 'checked' => false])
             ->assertOk();
        $this->assertSame('checklist', $case->fresh()->stage);

        $this->actingAs($donorHospital)
             ->postJson("/api/approvals/{$case->id}/checklist", ['key' => 'crossmatch_negative', 'checked' => true])
             ->assertOk();

        // Straight back to the donor side - consent already given stands.
        $this->assertSame('doctor', $case->fresh()->stage,
            'Re-asking the counterparty because the other hospital edited its own checklist would be noise.');
    }

    // ------------------------------------------------------------ decline + re-offer

    /** @test */
    public function declining_closes_the_case_and_offers_the_organ_to_the_next_candidate(): void
    {
        [$case, $donorHospital, $recipientHospital, , $recipient] = $this->crossHospitalCase(2);
        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);

        $r = $this->actingAs($recipientHospital)->postJson("/api/approvals/{$case->id}/offer-respond", [
            'accept' => false,
            'reason' => 'Patient currently septic and unfit for surgery this week.',
        ])->assertOk();

        $this->assertSame('declined', $case->fresh()->stage);

        $nextId = $r->json('reoffered.approval_id');
        $this->assertNotNull($nextId, 'A decline must pass the organ to the next-ranked candidate.');

        $next = CaseApproval::find($nextId);
        $this->assertSame($case->id, (int) $next->reoffered_from_id);
        $this->assertSame(2, (int) $next->decision->selected_rank);
        $this->assertNotSame($recipient->id, (int) $next->recipient_user_id);
        $this->assertSame('checklist', $next->stage);
        // Same organ, same procuring hospital.
        $this->assertSame($case->organ, $next->organ);
        $this->assertSame((int) $case->hospital_id, (int) $next->hospital_id);
    }

    /** @test */
    public function a_chain_of_declines_walks_down_the_list_without_repeating_a_candidate(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase(2);

        $offered = [];
        $current = $case;

        for ($i = 0; $i < 3; $i++) {
            $offered[] = (int) $current->recipient_user_id;

            $this->clearChecklist($current, $donorHospital);
            $this->actingAs($donorHospital)->postJson("/api/approvals/{$current->id}/admin-confirm", [])->assertStatus(422);

            $r = $this->actingAs($recipientHospital)->postJson("/api/approvals/{$current->id}/offer-respond", [
                'accept' => false,
                'reason' => 'Declined for clinical reasons recorded in the patient notes.',
            ])->assertOk();

            $nextId = $r->json('reoffered.approval_id');
            if ($nextId === null) break;
            $current = CaseApproval::find($nextId);
        }

        $this->assertSame(count($offered), count(array_unique($offered)),
            'No candidate may be offered the same organ twice.');
        $this->assertCount(3, $offered, 'All three ranked candidates should have been tried.');
    }

    /** @test */
    public function the_last_decline_reports_that_no_candidate_remains(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase(0);
        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);

        $r = $this->actingAs($recipientHospital)->postJson("/api/approvals/{$case->id}/offer-respond", [
            'accept' => false,
            'reason' => 'Recipient declined the organ after counselling and discussion.',
        ])->assertOk();

        $this->assertNull($r->json('reoffered'));
        $this->assertStringContainsString('No further eligible candidate', $r->json('message'));
    }

    /** @test */
    public function a_decline_requires_a_substantive_reason(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();
        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);

        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => false, 'reason' => 'no'])
             ->assertStatus(422);

        $this->assertSame('offer', $case->fresh()->stage);
    }

    /** @test */
    public function an_offer_cannot_be_answered_before_it_is_made_or_twice(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();

        // Checklist not yet complete - no offer exists.
        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])
             ->assertStatus(422);

        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);

        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])->assertOk();

        // Second answer refused.
        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => false, 'reason' => 'Changed our mind entirely.'])
             ->assertStatus(422);
    }

    // ---------------------------------------------------------- field minimisation

    /** @test */
    public function the_procuring_hospital_sees_a_match_code_not_a_name_until_the_offer_is_accepted(): void
    {
        [$case, $donorHospital, $recipientHospital, , $recipient] = $this->crossHospitalCase();

        $row = $this->actingAs($donorHospital)->getJson("/api/approvals/{$case->id}")->json('data');

        $this->assertNull($row['recipient']['name'], 'A counterparty patient must not be named before acceptance.');
        $this->assertTrue($row['recipient']['withheld']);
        $this->assertNotNull($row['recipient']['label']);
        $this->assertStringNotContainsStringIgnoringCase($recipient->name, json_encode($row));

        // After acceptance, identity is released so logistics can be arranged.
        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);
        $this->actingAs($recipientHospital)->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])->assertOk();

        $after = $this->actingAs($donorHospital)->getJson("/api/approvals/{$case->id}")->json('data');
        $this->assertSame($recipient->name, $after['recipient']['name']);
        $this->assertFalse($after['recipient']['withheld']);
    }

    /** @test */
    public function the_receiving_hospital_sees_its_own_patient_but_never_the_donors_identity(): void
    {
        [$case, , $recipientHospital, $donor, $recipient] = $this->crossHospitalCase();

        $row = $this->actingAs($recipientHospital)->getJson("/api/approvals/{$case->id}")->json('data');

        $this->assertSame($recipient->name, $row['recipient']['name'], 'Their own patient is theirs to see.');
        $this->assertNull($row['donor']['name'], 'Donor identity is not needed to accept an offer.');
        $this->assertTrue($row['donor']['withheld']);
        $this->assertStringNotContainsStringIgnoringCase($donor->name, json_encode($row));
    }

    /** @test */
    public function free_text_notes_do_not_cross_the_hospital_boundary(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();
        $doctor = $this->makeUser('doctor', ['linked_hospital_id' => $donorHospital->id]);

        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);
        $this->actingAs($recipientHospital)->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])->assertOk();

        $secret = 'Donor was a road traffic fatality at Mayo Hospital ward 7.';
        $this->actingAs($doctor)->postJson("/api/approvals/{$case->id}/doctor-approve", ['notes' => $secret])->assertOk();

        $seen = $this->actingAs($recipientHospital)->getJson("/api/approvals/{$case->id}")->json('data');
        $this->assertNull($seen['doctor_notes']);
        $this->assertStringNotContainsString('Mayo Hospital ward 7', json_encode($seen));

        // The side that wrote it still reads it back.
        $own = $this->actingAs($donorHospital)->getJson("/api/approvals/{$case->id}")->json('data');
        $this->assertSame($secret, $own['doctor_notes']);
    }

    /** @test */
    public function the_cross_hospital_candidate_pool_withholds_identity_from_other_hospitals(): void
    {
        [, $donorHospital, $recipientHospital, $donor, $recipient] = $this->crossHospitalCase();

        // A candidate at the donor's own hospital, for contrast.
        $local = $this->makeUser('recipient', ['preferred_hospital_id' => $donorHospital->id]);
        RecipientProfile::create([
            'user_id' => $local->id, 'blood_type' => 'O+', 'organ_needed' => 'kidney',
            'diagnosis' => 'Local diagnosis', 'urgency_score' => 7.0,
        ]);

        $payload = $this->invokePayloadLoader($donorHospital->id);

        $theirs = collect($payload)->firstWhere('user_id', $recipient->id);
        $this->assertNotNull($theirs);
        $this->assertNull($theirs['name']);
        $this->assertNull($theirs['email']);
        $this->assertNull($theirs['diagnosis']);
        $this->assertTrue($theirs['identity_withheld']);
        // Scoring inputs survive, or the engine would stop working.
        $this->assertSame('O+', $theirs['blood_type']);
        $this->assertNotNull($theirs['urgency_score']);

        $mine = collect($payload)->firstWhere('user_id', $local->id);
        $this->assertSame($local->name, $mine['name'], 'A hospital still sees its own patients in full.');
        $this->assertSame('Local diagnosis', $mine['diagnosis']);
    }

    /** Reach the private cross-hospital pool loader without going through HTTP. */
    private function invokePayloadLoader(int $donorHospitalId): array
    {
        $controller = app(\App\Http\Controllers\AllocationController::class);
        $method = new \ReflectionMethod($controller, 'loadRecipientPayloads');
        $method->setAccessible(true);

        return $method->invoke($controller, $donorHospitalId);
    }

    // ------------------------------------------------- downstream: surgery (Module 9)

    /**
     * Drive a cross-hospital case all the way to approved, so the downstream
     * modules can be exercised against a realistic record.
     */
    private function approvedCrossHospitalCase(): array
    {
        [$case, $donorHospital, $recipientHospital, $donor, $recipient] = $this->crossHospitalCase();
        $doctor = $this->makeUser('doctor', ['linked_hospital_id' => $donorHospital->id]);

        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])->assertOk();
        $this->actingAs($doctor)->postJson("/api/approvals/{$case->id}/doctor-approve", [])->assertOk();
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertOk();

        $this->assertSame('approved', $case->fresh()->stage);

        return [$case->fresh(), $donorHospital, $recipientHospital, $donor, $recipient];
    }

    /** @test */
    public function the_receiving_hospital_can_schedule_surgery_for_its_own_patient(): void
    {
        [$case, , $recipientHospital] = $this->approvedCrossHospitalCase();

        // The implant happens in the RECEIVING hospital's theatre, with its
        // surgeon - so those are the resources that must be bookable.
        $theatre = \App\Models\SurgicalResource::create([
            'hospital_id' => $recipientHospital->id, 'type' => 'theatre', 'name' => 'Theatre A', 'code' => 'TA',
        ]);
        $surgeon = \App\Models\SurgicalResource::create([
            'hospital_id' => $recipientHospital->id, 'type' => 'surgeon', 'name' => 'Dr Receiving', 'code' => 'SR',
        ]);

        $r = $this->actingAs($recipientHospital)->postJson('/api/surgery/bookings', [
            'case_approval_id' => $case->id,
            'theatre_id'       => $theatre->id,
            'surgeon_id'       => $surgeon->id,
            'scheduled_start'  => now()->addDay()->setTime(9, 0)->toDateTimeString(),
            'scheduled_end'    => now()->addDay()->setTime(13, 0)->toDateTimeString(),
        ]);

        $r->assertSuccessful();

        // Stamped with the hospital that owns the theatre, and carrying the patient.
        $this->assertDatabaseHas('surgery_bookings', [
            'hospital_id'      => $recipientHospital->id,
            'case_approval_id' => $case->id,
            'recipient_user_id' => $case->recipient_user_id,
        ]);
    }

    /** @test */
    public function the_procuring_hospital_can_still_schedule_its_own_side(): void
    {
        [$case, $donorHospital] = $this->approvedCrossHospitalCase();

        $theatre = \App\Models\SurgicalResource::create([
            'hospital_id' => $donorHospital->id, 'type' => 'theatre', 'name' => 'Recovery Theatre', 'code' => 'RT',
        ]);
        $surgeon = \App\Models\SurgicalResource::create([
            'hospital_id' => $donorHospital->id, 'type' => 'surgeon', 'name' => 'Dr Procuring', 'code' => 'SP',
        ]);

        $this->actingAs($donorHospital)->postJson('/api/surgery/bookings', [
            'case_approval_id' => $case->id,
            'theatre_id'       => $theatre->id,
            'surgeon_id'       => $surgeon->id,
            'scheduled_start'  => now()->addDay()->setTime(6, 0)->toDateTimeString(),
            'scheduled_end'    => now()->addDay()->setTime(8, 0)->toDateTimeString(),
        ])->assertSuccessful();
    }

    /** @test */
    public function an_uninvolved_hospital_cannot_schedule_against_someone_elses_case(): void
    {
        [$case] = $this->approvedCrossHospitalCase();
        $bystander = $this->makeUser('hospital');

        $theatre = \App\Models\SurgicalResource::create([
            'hospital_id' => $bystander->id, 'type' => 'theatre', 'name' => 'Theatre X', 'code' => 'TX',
        ]);
        $surgeon = \App\Models\SurgicalResource::create([
            'hospital_id' => $bystander->id, 'type' => 'surgeon', 'name' => 'Dr Nobody', 'code' => 'SN',
        ]);

        $this->actingAs($bystander)->postJson('/api/surgery/bookings', [
            'case_approval_id' => $case->id,
            'theatre_id'       => $theatre->id,
            'surgeon_id'       => $surgeon->id,
            'scheduled_start'  => now()->addDay()->setTime(9, 0)->toDateTimeString(),
            'scheduled_end'    => now()->addDay()->setTime(13, 0)->toDateTimeString(),
        ])->assertStatus(403);
    }

    /** @test */
    public function neither_side_can_book_the_others_theatre(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->approvedCrossHospitalCase();

        // A theatre belonging to the procuring hospital...
        $theirTheatre = \App\Models\SurgicalResource::create([
            'hospital_id' => $donorHospital->id, 'type' => 'theatre', 'name' => 'Theirs', 'code' => 'TH',
        ]);
        $theirSurgeon = \App\Models\SurgicalResource::create([
            'hospital_id' => $donorHospital->id, 'type' => 'surgeon', 'name' => 'Dr Theirs', 'code' => 'ST',
        ]);

        // ...is not bookable by the receiving hospital, even though it is on the case.
        $r = $this->actingAs($recipientHospital)->postJson('/api/surgery/bookings', [
            'case_approval_id' => $case->id,
            'theatre_id'       => $theirTheatre->id,
            'surgeon_id'       => $theirSurgeon->id,
            'scheduled_start'  => now()->addDay()->setTime(9, 0)->toDateTimeString(),
            'scheduled_end'    => now()->addDay()->setTime(13, 0)->toDateTimeString(),
        ]);

        $this->assertContains($r->status(), [403, 422],
            'Being a party to the case must not grant access to resources owned by the other hospital.');
        $this->assertDatabaseMissing('surgery_bookings', ['theatre_id' => $theirTheatre->id]);
    }

    // -------------------------------------------------------- stalled offers

    /** @test */
    public function a_stalled_offer_escalates_once_to_both_hospitals(): void
    {
        [$case, $donorHospital] = $this->crossHospitalCase();
        $this->clearChecklist($case, $donorHospital);
        $this->assertSame('offer', $case->fresh()->stage);

        // Inside the response window: nothing happens.
        $this->artisan('offers:check-stalled')->assertSuccessful();
        $this->assertNull($case->fresh()->offer_escalated_at);

        // Past it.
        $limit     = \App\Models\Organ::limitFor('kidney');
        $threshold = max(
            (int) config('governance.offer_escalation_min_minutes'),
            (int) round($limit * (float) config('governance.offer_escalation_fraction')),
        );
        $case->fresh()->forceFill(['offer_sent_at' => now()->subMinutes($threshold + 5)])->save();

        $this->artisan('offers:check-stalled')->assertSuccessful();

        $escalatedAt = $case->fresh()->offer_escalated_at;
        $this->assertNotNull($escalatedAt, 'An unanswered offer must be chased - the cold-chain clock is running.');

        // Both sides were told.
        foreach ([$case->hospital_id, $case->recipient_hospital_id] as $hospitalId) {
            $this->assertDatabaseHas('notifications', [
                'user_id' => $hospitalId,
                'type'    => 'offer_stalled',
            ]);
        }

        // Idempotent: the sweep runs every five minutes and must not re-notify.
        $before = \DB::table('notifications')->where('type', 'offer_stalled')->count();
        $this->artisan('offers:check-stalled')->assertSuccessful();
        $this->assertSame($before, \DB::table('notifications')->where('type', 'offer_stalled')->count());
        $this->assertEquals($escalatedAt, $case->fresh()->offer_escalated_at);
    }

    /** @test */
    public function a_stalled_offer_is_never_auto_declined(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();
        $this->clearChecklist($case, $donorHospital);

        $case->fresh()->forceFill(['offer_sent_at' => now()->subDays(30)])->save();
        $this->artisan('offers:check-stalled')->assertSuccessful();

        // Still open, still theirs to answer. Auto-declining would record a
        // clinical decision no clinician made.
        $this->assertSame('offer', $case->fresh()->stage);
        $this->actingAs($recipientHospital)
             ->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])
             ->assertOk();
        $this->assertSame('doctor', $case->fresh()->stage);
    }

    /** @test */
    public function the_escalation_window_scales_with_the_organs_cold_ischemia_limit(): void
    {
        // A heart has far less time than a kidney, so it must be chased sooner.
        $heart  = \App\Models\Organ::limitFor('heart');
        $kidney = \App\Models\Organ::limitFor('kidney');

        $this->assertLessThan($kidney, $heart, 'Fixture assumption: heart limit is tighter than kidney.');

        $fraction = (float) config('governance.offer_escalation_fraction');
        $floor    = (int) config('governance.offer_escalation_min_minutes');

        $this->assertLessThan(
            max($floor, (int) round($kidney * $fraction)),
            max($floor, (int) round($heart * $fraction)),
            'A flat timeout would be far too slow for a heart and needlessly noisy for a kidney.',
        );
    }

    // ------------------------------------------------------ the seeded demo data

    /**
     * The demo seeder must not manufacture the very state this module forbids.
     *
     * DemoDataSeeder::advanceApprovals() pushes seeded cases across the pipeline by
     * writing stages directly rather than going through the controller, so it
     * bypasses every guard in it. Before this was fixed it sent cross-hospital
     * cases straight from checklist to doctor, which is a case sitting at clinical
     * sign-off that the receiving hospital was never asked about - exactly the
     * defect the two-sided board exists to prevent. Every fresh install would have
     * shipped with it.
     */
    /** @test */
    public function the_demo_seeder_never_advances_a_cross_hospital_case_past_an_unanswered_offer(): void
    {
        // Enough cases to hit every branch of the seeder's rotation.
        for ($i = 0; $i < 9; $i++) {
            $this->crossHospitalCase(0);
        }
        $this->assertSame(9, CaseApproval::where('stage', 'checklist')->count());

        $this->runSeederAdvance();

        $violations = CaseApproval::whereIn('stage', ['doctor', 'admin', 'approved'])
            ->whereColumn('recipient_hospital_id', '!=', 'hospital_id')
            ->whereNull('offer_responded_at')
            ->get();

        $this->assertCount(0, $violations, sprintf(
            'Seeded cross-hospital case(s) %s reached sign-off with no offer response.',
            $violations->pluck('id')->implode(', ')
        ));

        // And it still produces a spread worth demonstrating.
        $stages = CaseApproval::selectRaw('stage, COUNT(*) n')->groupBy('stage')->pluck('n', 'stage')->toArray();
        foreach (['offer', 'declined'] as $wanted) {
            $this->assertArrayHasKey($wanted, $stages,
                "The demo should show at least one '{$wanted}' case so both are visible without clicking.");
        }
    }

    /** @test */
    public function the_demo_seeder_leaves_same_hospital_cases_off_the_offer_path(): void
    {
        $hospital = $this->makeUser('hospital');

        // Five internal cases: no counterparty exists, so none may sit at 'offer'
        // or be 'declined' - there would be nobody able to answer.
        for ($i = 0; $i < 5; $i++) {
            $donor     = $this->makeUser('donor',     ['preferred_hospital_id' => $hospital->id]);
            $recipient = $this->makeUser('recipient', ['preferred_hospital_id' => $hospital->id]);

            $policy = AllocationPolicy::create([
                'version' => "internal-{$i}", 'name' => 'Internal', 'weights' => ['urgency' => 1],
            ]);
            $run = AllocationRun::create([
                'policy_id' => $policy->id, 'donor_user_id' => $donor->id, 'organ' => 'kidney',
                'weights_snapshot' => [], 'dataset_snapshot' => [], 'results' => [], 'candidate_count' => 0,
            ]);
            $decision = AllocationDecision::create([
                'allocation_run_id' => $run->id, 'selected_recipient_id' => $recipient->id,
                'selected_rank' => 1, 'decided_by' => $hospital->id, 'hospital_id' => $hospital->id,
                'status' => 'confirmed',
            ]);
            CaseApproval::create([
                'allocation_decision_id' => $decision->id, 'hospital_id' => $hospital->id,
                'recipient_hospital_id' => $hospital->id, 'donor_user_id' => $donor->id,
                'recipient_user_id' => $recipient->id, 'organ' => 'kidney', 'stage' => 'checklist',
                'requires_multi_user' => true, 'checklist' => CaseApproval::freshChecklist(),
                'allocated_at' => now()->subHours(6),
            ]);
        }

        $this->runSeederAdvance();

        $stranded = CaseApproval::whereIn('stage', ['offer', 'declined'])
            ->whereColumn('recipient_hospital_id', '=', 'hospital_id')
            ->count();

        $this->assertSame(0, $stranded,
            'A same-hospital case parked at the offer stage could never be answered by anyone.');
    }

    /** Run the seeder's private stage-advancement with a console it can write to. */
    private function runSeederAdvance(): void
    {
        $seeder  = new \Database\Seeders\DemoDataSeeder();
        $command = new \Illuminate\Console\Command();
        $command->setOutput(new \Illuminate\Console\OutputStyle(
            new \Symfony\Component\Console\Input\ArrayInput([]),
            new \Symfony\Component\Console\Output\NullOutput(),
        ));
        $seeder->setCommand($command);

        $m = new \ReflectionMethod($seeder, 'advanceApprovals');
        $m->setAccessible(true);
        $m->invoke($seeder);
    }

    // ------------------------------------------------------------------- metrics

    /** @test */
    public function offer_wait_time_is_reported_separately_from_the_hospitals_own_time(): void
    {
        [$case, $donorHospital, $recipientHospital] = $this->crossHospitalCase();
        $doctor = $this->makeUser('doctor', ['linked_hospital_id' => $donorHospital->id]);

        $this->clearChecklist($case, $donorHospital);
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertStatus(422);

        // Counterparty sits on it for an hour.
        $case->fresh()->forceFill(['offer_sent_at' => now()->subHour()])->save();

        $this->actingAs($recipientHospital)->postJson("/api/approvals/{$case->id}/offer-respond", ['accept' => true])->assertOk();
        $this->actingAs($doctor)->postJson("/api/approvals/{$case->id}/doctor-approve", [])->assertOk();
        $this->actingAs($donorHospital)->postJson("/api/approvals/{$case->id}/admin-confirm", [])->assertOk();

        $mine = $this->actingAs($donorHospital)->getJson('/api/approvals/metrics')->json('mine');

        $this->assertGreaterThanOrEqual(3600, $mine['offer_wait_avg']);
        $this->assertLessThan($mine['avg_seconds'], $mine['own_avg_seconds'],
            'The hospital must not be charged for the counterparty\'s delay.');
    }
}
