<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;
use Mockery;
use Tests\TestCase;

/**
 * Google sign-in and sign-up.
 *
 * The important case here is the LINKING guard. Matching an incoming Google
 * identity to an existing row purely on email address is only safe if that
 * address was proven when the row was created. It was not: registration ran with
 * REQUIRE_EMAIL_VERIFICATION off and stamped email_verified_at unconditionally,
 * so anyone could register under someone else's address. Linking on email alone
 * would then sign the real mailbox owner into the stranger's account - while the
 * stranger's password kept working.
 */
class GoogleAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** Pretend Google handed us back this profile. */
    private function fakeGoogleUser(string $id, string $email, string $name = 'Google User'): void
    {
        $socialiteUser = Mockery::mock(\Laravel\Socialite\Two\User::class);
        $socialiteUser->shouldReceive('getId')->andReturn($id);
        $socialiteUser->shouldReceive('getEmail')->andReturn($email);
        $socialiteUser->shouldReceive('getName')->andReturn($name);
        $socialiteUser->shouldReceive('getNickname')->andReturn(null);
        $socialiteUser->shouldReceive('getAvatar')->andReturn('https://example.test/a.png');

        $provider = Mockery::mock(GoogleProvider::class);
        $provider->shouldReceive('stateless')->andReturnSelf();
        $provider->shouldReceive('user')->andReturn($socialiteUser);

        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
    }

    private function state(string $intent, ?string $role): string
    {
        return Crypt::encryptString(json_encode([
            'intent' => $intent, 'role' => $role, 'iat' => now()->timestamp,
        ]));
    }

    private function hitCallback(string $intent = 'login', ?string $role = null)
    {
        return $this->get('/api/oauth/google/callback?code=fake&state='.urlencode($this->state($intent, $role)));
    }

    private function makeUser(string $role, array $attrs = []): User
    {
        $u = User::create(array_merge([
            'name' => 'Existing', 'email' => 'existing@test.local', 'password' => 'Password@123',
            'role' => $role, 'status' => 'approved', 'email_verified_at' => now(),
        ], $attrs));
        $u->syncRoles([$role]);
        return $u;
    }

    // ------------------------------------------------------------------ sign-up

    public function test_google_signup_creates_a_donor_with_a_verified_email(): void
    {
        $this->fakeGoogleUser('g-1', 'newdonor@gmail.com', 'New Donor');

        $this->hitCallback('signup', 'donor')->assertRedirect();

        $user = User::where('email', 'newdonor@gmail.com')->first();
        $this->assertNotNull($user);
        $this->assertSame('donor', $user->role);
        $this->assertSame('registered', $user->status);
        $this->assertSame('g-1', $user->google_id);
        // Google proved the mailbox; no emailed code is needed to confirm it again.
        $this->assertNotNull($user->email_verified_at);
        $this->assertNull($user->password);
        $this->assertFalse((bool) $user->registration_complete);
        $this->assertDatabaseHas('donor_profiles', ['user_id' => $user->id]);
        $this->assertDatabaseHas('clinical_profiles', ['user_id' => $user->id]);
        $this->assertStringContainsString('DON-', $user->unique_id);
    }

    public function test_google_signup_creates_a_recipient(): void
    {
        $this->fakeGoogleUser('g-2', 'newrecipient@gmail.com');

        $this->hitCallback('signup', 'recipient')->assertRedirect();

        $user = User::where('email', 'newrecipient@gmail.com')->first();
        $this->assertSame('recipient', $user->role);
        $this->assertDatabaseHas('recipient_profiles', ['user_id' => $user->id]);
    }

    /**
     * A Google account proves an email address. It says nothing about whether
     * someone may run a transplant centre, so the approval gate must survive.
     */
    public function test_a_google_hospital_signup_still_needs_super_admin_approval(): void
    {
        $this->fakeGoogleUser('g-3', 'newhospital@gmail.com');

        $this->hitCallback('signup', 'hospital')->assertRedirect();

        $user = User::where('email', 'newhospital@gmail.com')->first();
        $this->assertSame('hospital', $user->role);
        $this->assertSame('pending', $user->status);
        $this->assertFalse((bool) $user->registration_complete);
        // No profile yet - the registration form collects the licence details
        // that the super admin then reviews.
        $this->assertDatabaseMissing('hospital_profiles', ['user_id' => $user->id]);
    }

    public function test_a_new_account_is_sent_to_finish_its_profile(): void
    {
        $this->fakeGoogleUser('g-4', 'setupflag@gmail.com');

        $this->hitCallback('signup', 'donor')
            ->assertRedirectContains('setup=1');
    }

    // -------------------------------------------------------------------- login

    public function test_an_unknown_email_on_a_login_attempt_is_sent_to_register(): void
    {
        $this->fakeGoogleUser('g-5', 'nobody@gmail.com');

        $this->hitCallback('login')->assertRedirectContains('register=1');

        $this->assertDatabaseMissing('users', ['email' => 'nobody@gmail.com']);
    }

    public function test_an_existing_verified_account_is_linked_and_signed_in(): void
    {
        $user = $this->makeUser('donor', ['email' => 'known@gmail.com', 'email_verified_at' => now()]);
        $this->fakeGoogleUser('g-6', 'known@gmail.com');

        $this->hitCallback('login')->assertRedirectContains('token=');

        $this->assertSame('g-6', $user->fresh()->google_id);
    }

    // --------------------------------------------------------- the linking guard

    /**
     * THE PRE-REGISTRATION TAKEOVER.
     *
     * An account exists for this address but nobody ever proved they own it.
     * Linking Google to it would sign the genuine mailbox owner into a stranger's
     * account, leaving the stranger's password working. Refuse, and make them
     * claim it with the password first.
     */
    public function test_google_will_not_link_to_an_unverified_account(): void
    {
        $squatter = $this->makeUser('donor', [
            'email' => 'victim@gmail.com', 'email_verified_at' => null,
        ]);
        $this->fakeGoogleUser('g-7', 'victim@gmail.com');

        $response = $this->hitCallback('login');

        $response->assertRedirect();
        $this->assertStringNotContainsString('token=', $response->headers->get('Location'));
        $this->assertNull($squatter->fresh()->google_id);
    }

    public function test_google_will_not_take_over_an_account_linked_to_a_different_google_id(): void
    {
        $owner = $this->makeUser('donor', [
            'email' => 'taken@gmail.com', 'google_id' => 'g-original', 'email_verified_at' => now(),
        ]);
        $this->fakeGoogleUser('g-attacker', 'taken@gmail.com');

        $response = $this->hitCallback('login');

        $this->assertStringNotContainsString('token=', $response->headers->get('Location'));
        $this->assertSame('g-original', $owner->fresh()->google_id);
    }

    /**
     * The role decides what kind of account is created, so it must not be
     * forgeable. A tampered state is treated as a plain login, which for an
     * unknown email means no account is created at all.
     */
    public function test_a_tampered_state_cannot_force_an_account_to_be_created(): void
    {
        $this->fakeGoogleUser('g-8', 'tampered@gmail.com');

        $this->get('/api/oauth/google/callback?code=fake&state='.urlencode('{"intent":"signup","role":"hospital"}'))
            ->assertRedirectContains('register=1');

        $this->assertDatabaseMissing('users', ['email' => 'tampered@gmail.com']);
    }

    public function test_signup_without_a_role_is_refused_before_leaving_for_google(): void
    {
        $this->get('/api/oauth/google/redirect?intent=signup')
            ->assertRedirectContains('register=1');
    }

    public function test_a_banned_user_cannot_sign_in_with_google(): void
    {
        $this->makeUser('donor', [
            'email' => 'banned@gmail.com', 'banned' => true, 'email_verified_at' => now(),
        ]);
        $this->fakeGoogleUser('g-9', 'banned@gmail.com');

        $response = $this->hitCallback('login');

        $this->assertStringNotContainsString('token=', $response->headers->get('Location'));
    }
}
