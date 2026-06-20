<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Hardened password rule (server-side guardrail — the client also enforces this
 * with a live strength meter and checklist).
 *
 *  - >= 12 characters
 *  - at least one upper, lower, digit, special char
 *  - must not contain the user's name, email local-part, or phone digits
 *  - rejects a small list of common/guessable passwords
 *
 * Uses DataAwareRule so we can read sibling fields (name/email/phone) from the
 * same validator without having to thread them through manually.
 */
class StrongPassword implements ValidationRule, DataAwareRule
{
    /** Top ~60 hopeless passwords; complete lists exist but this covers the obvious abuse. */
    private const COMMON = [
        'password','password1','password123','passw0rd','qwerty','qwertyuiop','qwerty123','qwerty1',
        '123456','1234567','12345678','123456789','1234567890','111111','12345','000000',
        'abc123','abcd1234','letmein','welcome','welcome1','iloveyou','admin','administrator',
        'login','master','dragon','monkey','football','baseball','superman','batman',
        'starwars','trustno1','sunshine','princess','hello','hello123','test','test123',
        'changeme','default','password!','password@','password#','p@ssword','p@ssw0rd',
        'asdf1234','zxcvbnm','qazwsx','q1w2e3r4','q1w2e3r4t5','1q2w3e4r','1qaz2wsx',
        'odcat','odcat123','organ','donor','recipient','hospital',
    ];

    protected array $data = [];

    public function setData(array $data): static
    {
        $this->data = $data;
        return $this;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value)) { $fail('The :attribute must be a string.'); return; }

        if (strlen($value) < 12) {
            $fail('Password must be at least 12 characters long.');
            return;
        }
        if (!preg_match('/[A-Z]/', $value))        { $fail('Password must contain at least one uppercase letter.'); return; }
        if (!preg_match('/[a-z]/', $value))        { $fail('Password must contain at least one lowercase letter.'); return; }
        if (!preg_match('/[0-9]/', $value))        { $fail('Password must contain at least one number.'); return; }
        if (!preg_match('/[^A-Za-z0-9]/', $value)) { $fail('Password must contain at least one special character.'); return; }

        $lower = strtolower($value);
        if (in_array($lower, self::COMMON, true)) {
            $fail('Password is too common — please choose a less guessable one.');
            return;
        }

        // Personal-info containment checks. Use a 4-char minimum so a 2-char
        // name doesn't make every password fail spuriously.
        $needles = [];
        if (!empty($this->data['name']))  $needles[] = $this->data['name'];
        if (!empty($this->data['email'])) {
            $needles[] = $this->data['email'];
            $local = strstr($this->data['email'], '@', true);
            if ($local) $needles[] = $local;
        }
        if (!empty($this->data['phone'])) {
            // Compare digit-only forms so "+92 300-1234567" still catches "3001234567".
            $digits = preg_replace('/\D+/', '', (string) $this->data['phone']);
            if (strlen($digits) >= 4) $needles[] = $digits;
        }
        $valueDigits = preg_replace('/\D+/', '', $value);

        foreach ($needles as $n) {
            $n = trim((string) $n);
            if ($n === '' || strlen($n) < 4) continue;
            if (str_contains($lower, strtolower($n))) {
                $fail('Password must not contain your name, email, or phone number.');
                return;
            }
            if (ctype_digit($n) && $valueDigits !== '' && str_contains($valueDigits, $n)) {
                $fail('Password must not contain your phone number.');
                return;
            }
        }
    }
}
