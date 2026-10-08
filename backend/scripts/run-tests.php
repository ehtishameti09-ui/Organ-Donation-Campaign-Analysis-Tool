<?php

/**
 * Test runner wrapper: clear the cached config, run the suite, ALWAYS put the
 * cached config back.
 *
 * Why this exists rather than a three-line composer script.
 *
 * The suite must run with config:clear, because a cached config overrides the
 * <env> entries in phpunit.xml and would point the tests at the real database.
 * There is a hard interlock in tests/TestCase.php that refuses to run in that
 * situation - it exists because the suite once did drop the live database - but
 * the interlock only prevents damage, it does not make the workflow pleasant.
 *
 * The composer script that did this was:
 *
 *     "test": ["@php artisan config:clear", "@php artisan test", "@php artisan config:cache"]
 *
 * Two defects in it, both of which cost real debugging time:
 *
 *   1. Composer stops a script chain at the first command that exits non-zero.
 *      So any FAILING test run never reached config:cache, and left the config
 *      cleared. The app is served by Apache, whose threaded MPM then races while
 *      reading .env and intermittently falls back to the default SQLite
 *      connection - producing 500s on endpoints that were never touched. The
 *      symptom appears after a failing test run and looks exactly like a code
 *      regression somewhere else entirely.
 *
 *   2. Composer appends trailing arguments to the FIRST command, so
 *      `composer run test -- --filter=Foo` passed --filter to config:clear,
 *      which failed with "The --filter option does not exist" before a single
 *      test ran.
 *
 * This fixes both: the restore happens in a finally block, and arguments are
 * forwarded to `artisan test` where they belong. The suite's exit code is
 * propagated so CI and shell && chains still behave correctly.
 *
 *   composer run test
 *   composer run test -- --filter=CrossHospitalApprovalTest
 *   composer run test -- --stop-on-failure
 */

$root = dirname(__DIR__);
chdir($root);

// Everything after the script name is for artisan test, not for us.
$forward = array_slice($argv, 1);

/** Run an artisan command inline and return its exit code. */
$artisan = function (array $args): int {
    $cmd = array_merge([PHP_BINARY, 'artisan'], $args);
    $quoted = implode(' ', array_map(
        fn ($a) => preg_match('/[\s"]/', $a) ? escapeshellarg($a) : $a,
        $cmd
    ));

    passthru($quoted, $code);

    return $code;
};

echo "> clearing cached config so phpunit.xml is honoured\n";
$artisan(['config:clear']);

$exit = $artisan(array_merge(['test'], $forward));

// The whole point of the wrapper. Runs whether the suite passed, failed, or the
// interlock refused to start.
echo "\n> restoring cached config\n";
$restore = $artisan(['config:cache']);

if ($restore !== 0) {
    echo "\n!! config:cache FAILED. Apache will serve intermittent 500s until this succeeds.\n";
    echo "!! Fix it by hand:  php artisan config:cache\n";

    // A broken cache state is worse than a failing test, so it wins the exit code.
    exit($restore);
}

exit($exit);
