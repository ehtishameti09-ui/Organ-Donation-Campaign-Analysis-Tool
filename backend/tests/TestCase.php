<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Refuse to run against anything but a dedicated *_test database.
     *
     * This is a safety interlock, not a style check. RefreshDatabase and
     * DatabaseMigrations DROP EVERY TABLE in whatever database they are pointed
     * at. phpunit.xml points them at odcat_backend_test — but `<env>` entries in
     * phpunit.xml are silently ignored once `php artisan config:cache` has been
     * run, because cached config never consults the environment again. In that
     * state the suite would happily destroy the working odcat_backend database.
     *
     * So: check the database we are actually connected to, and stop hard if it
     * is not a test one. Cheap to run, and it turns a catastrophic, silent data
     * loss into an obvious error message.
     */
    /**
     * The check MUST run here, not in setUp().
     *
     * Illuminate\Foundation\Testing\TestCase::setUp() calls refreshApplication()
     * and then setUpTraits() — and setUpTraits() is what fires RefreshDatabase /
     * DatabaseMigrations, which drop every table. A guard placed in setUp() after
     * parent::setUp() therefore runs AFTER the database has already been wiped,
     * which is worse than useless: it reports the danger once the damage is done.
     * (Learned the hard way — that exact mistake emptied the working database.)
     *
     * setUpTraits() runs after the application exists (so config is readable) but
     * before any trait touches the database, which is the only correct place.
     */
    protected function setUpTraits()
    {
        $this->guardAgainstNonTestDatabase();

        return parent::setUpTraits();
    }

    private function guardAgainstNonTestDatabase(): void
    {
        $connection = config('database.default');
        $database   = (string) config("database.connections.{$connection}.database");

        if (!str_ends_with($database, '_test') && $database !== ':memory:') {
            $hint = file_exists(base_path('bootstrap/cache/config.php'))
                ? "\n\nCached config was detected (bootstrap/cache/config.php). It overrides phpunit.xml."
                  . "\nRun:  php artisan config:clear     (then re-run the tests)"
                  . "\nAfterwards, restore it with:  php artisan config:cache"
                : "\n\nCheck the DB_DATABASE entry in phpunit.xml.";

            throw new \RuntimeException(
                "SAFETY STOP: the test suite is connected to '{$database}', which is not a *_test database. "
                . "Running it would drop every table in that database.{$hint}"
            );
        }
    }
}
