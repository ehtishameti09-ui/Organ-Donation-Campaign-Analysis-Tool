<?php

namespace App\Support;

/**
 * Email-domain policy.
 *
 *   - ALLOWED is the list of recognized providers (gmail / yahoo / outlook / etc.).
 *   - looksLikeTypo() flags domains that are very close to a recognized one
 *     (Levenshtein ≤ 2) or end with one (e.g. 1234gmail.com).
 *   - isAcceptable() accepts a domain unless it looks like a typo, so real
 *     hospital / educational / company emails (@aku.edu, @cmh.com.pk,
 *     @mycompany.com) work normally while @ggmail.com etc. are rejected.
 *
 * Mirrors the frontend's suggestEmailFix logic so the two layers always agree.
 */
class EmailDomainPolicy
{
    public const ALLOWED = [
        'gmail.com', 'googlemail.com',
        'yahoo.com', 'yahoo.co.uk', 'yahoo.in', 'yahoo.fr', 'ymail.com', 'rocketmail.com',
        'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
        'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk', 'msn.com',
        'icloud.com', 'me.com', 'mac.com',
        'aol.com',
        'protonmail.com', 'proton.me',
        'zoho.com', 'yandex.com', 'mail.com', 'gmx.com',
        'btinternet.com', 'comcast.net', 'verizon.net', 'att.net',
    ];

    /** True if the email is fine to accept (recognized provider OR not close to one). */
    public static function isAcceptable(?string $email): bool
    {
        $domain = self::domainOf($email);
        if ($domain === null) return false;
        if (in_array($domain, self::ALLOWED, true)) return true;
        return !self::looksLikeTypo($domain);
    }

    /** True if the domain looks like a typo of a recognized provider. */
    public static function looksLikeTypo(string $domain): bool
    {
        $domain = strtolower($domain);
        if (in_array($domain, self::ALLOWED, true)) return false;

        // Levenshtein-close (gmial.com → gmail.com)
        foreach (self::ALLOWED as $d) {
            $dist = levenshtein($domain, $d);
            if ($dist === 1) return true;
            if ($dist === 2 && max(strlen($domain), strlen($d)) >= 8) return true;
        }
        // Garbage-stuffed (1234342gmail.com ends with gmail.com)
        foreach (self::ALLOWED as $d) {
            if ($domain !== $d && strlen($domain) > strlen($d) && str_ends_with($domain, $d)) return true;
        }
        return false;
    }

    private static function domainOf(?string $email): ?string
    {
        if (!$email) return null;
        $at = strrpos($email, '@');
        if ($at === false) return null;
        return strtolower(substr($email, $at + 1));
    }
}
