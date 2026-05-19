<?php

namespace App\Support;

/**
 * Lightweight, dependency-free User-Agent parser. Good enough to surface the
 * browser + OS/device in the audit trail without pulling in a heavy library.
 */
class UserAgentParser
{
    public static function browser(?string $ua): string
    {
        $ua = (string) $ua;
        return match (true) {
            $ua === '' => 'Unknown',
            str_contains($ua, 'Edg/') || str_contains($ua, 'Edge') => 'Edge',
            str_contains($ua, 'OPR/') || str_contains($ua, 'Opera') => 'Opera',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Chrome/') && !str_contains($ua, 'Chromium') => 'Chrome',
            str_contains($ua, 'Chromium') => 'Chromium',
            str_contains($ua, 'Safari/') && str_contains($ua, 'Version/') => 'Safari',
            str_contains($ua, 'curl/') => 'curl',
            str_contains($ua, 'PostmanRuntime') => 'Postman',
            default => 'Other',
        };
    }

    public static function platform(?string $ua): string
    {
        $ua = (string) $ua;
        return match (true) {
            $ua === '' => 'Unknown',
            str_contains($ua, 'Windows NT 10') => 'Windows 10/11',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'iPhone') => 'iPhone',
            str_contains($ua, 'iPad') => 'iPad',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'Mac OS X') || str_contains($ua, 'Macintosh') => 'macOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => 'Other',
        };
    }

    public static function deviceType(?string $ua): string
    {
        $ua = (string) $ua;
        if ($ua === '') return 'Unknown';
        if (str_contains($ua, 'Mobi') || str_contains($ua, 'iPhone') || str_contains($ua, 'Android')) {
            return 'Mobile';
        }
        if (str_contains($ua, 'iPad') || str_contains($ua, 'Tablet')) {
            return 'Tablet';
        }
        return 'Desktop';
    }

    /** "Chrome on Windows 10/11 (Desktop)" — a single human-readable label. */
    public static function describe(?string $ua): string
    {
        return self::browser($ua).' on '.self::platform($ua).' ('.self::deviceType($ua).')';
    }
}
