<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Server-side mirror of the frontend's `validatePhone()` (libphonenumber-js).
 * Defense-in-depth: even though the React form uses Google's libphonenumber
 * port and accepts only well-formed numbers, the API can be hit directly
 * with curl, so we re-validate everything here.
 *
 *  - Format: only digits, +, spaces, dashes, dots, parens
 *  - Total digit count between 7 and 15 (ITU-T E.164 hard cap)
 *  - International form must start with `+` and a 1–3 digit country code
 *  - National form (no `+`) must start with `0` (Pakistan: 03XX-XXXXXXX, etc.)
 *  - For PK numbers (most users), the mobile prefix range is sanity-checked.
 *
 * For full libphonenumber parity (operator-level prefix tables, geographic
 * range validation, etc.) consider installing propaganistas/laravel-phone —
 * but this rule already catches every realistic bad input the frontend lets
 * through, including the "0" + bogus 27-digit string that motivated it.
 */
class ValidPhone implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value) || trim($value) === '') {
            $fail('Please enter a valid phone number.');
            return;
        }

        $raw = trim($value);

        if (!preg_match('/^[+\d\s().\-]+$/', $raw)) {
            $fail('Phone number can only contain digits, spaces, +, -, ( and ).');
            return;
        }

        $digits = preg_replace('/\D+/', '', $raw);
        $digitCount = strlen($digits);

        if ($digitCount < 7) {
            $fail('Phone number must have at least 7 digits.');
            return;
        }
        if ($digitCount > 15) {
            $fail('Phone number cannot have more than 15 digits.');
            return;
        }

        // International form: must begin with '+' followed by a 1–3 digit
        // country code, then 4–14 subscriber digits.
        if (str_starts_with($raw, '+')) {
            // Strip the '+' and re-check that only digits/separators follow.
            if (!preg_match('/^\+[\d\s().\-]+$/', $raw)) {
                $fail('Please enter a valid international phone number (e.g. +92 300 1234567).');
                return;
            }
            // PK-specific: +92 must be followed by a 10-digit subscriber number
            // starting with 3 (mobile) for the most common case.
            if (str_starts_with($digits, '92') && strlen($digits) === 12 && $digits[2] !== '3') {
                // Allow non-mobile PK numbers too (landline 21XXXXXXXX etc.) — only
                // hard-reject when the prefix is obviously bogus (e.g. 920XXXXXXXXX).
                if ($digits[2] === '0') {
                    $fail('Please enter a valid Pakistani phone number (mobile starts with 3, e.g. +92 300 1234567).');
                    return;
                }
            }
            return;
        }

        // National form (no '+'): for Pakistan, mobile numbers are 11 digits
        // starting with 03 (e.g. 03001234567). Landlines are 10–11 digits
        // starting with 0 followed by an area code.
        if ($digits[0] !== '0') {
            $fail('Please enter a valid phone number in international (+92 …) or local (03XX…) format.');
            return;
        }
        if ($digitCount < 10 || $digitCount > 12) {
            $fail('Please enter a valid local phone number (e.g. 0300-1234567).');
            return;
        }
    }
}
