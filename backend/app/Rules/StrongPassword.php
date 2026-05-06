<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class StrongPassword implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value)) {
            $fail('The :attribute must be a string.');
            return;
        }
        if (strlen($value) < 8) {
            $fail('Password must be at least 8 characters long.');
            return;
        }
        if (!preg_match('/[A-Z]/', $value)) {
            $fail('Password must contain at least one uppercase letter.');
            return;
        }
        if (!preg_match('/[a-z]/', $value)) {
            $fail('Password must contain at least one lowercase letter.');
            return;
        }
        if (!preg_match('/[0-9]/', $value)) {
            $fail('Password must contain at least one digit.');
            return;
        }
        if (!preg_match('/[^A-Za-z0-9]/', $value)) {
            $fail('Password must contain at least one special character.');
            return;
        }
    }
}
