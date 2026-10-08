<?php

namespace App\Console\Commands;

use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

/**
 * Bring a freshly started container to a serving state.
 *
 * Runs on every boot, so everything here must be safe to repeat. The container
 * filesystem is rebuilt on each deploy but the database is not, which is exactly
 * why this cannot be a plain `migrate --force && db:seed`: re-seeding a database
 * that already has data would advance the demo approval cases another step on
 * every restart, and the platform restarts a sleeping free-tier service whenever
 * someone visits it.
 *
 * So seeding is gated on the database being genuinely empty. Migrations are not -
 * they are idempotent by design and must run on every deploy to pick up new ones.
 *
 *   php artisan deploy:prepare
 *   php artisan deploy:prepare --force-seed   # re-seed deliberately
 */
class DeployPrepare extends Command
{
    protected $signature = 'deploy:prepare
                            {--force-seed : Seed even if the database already has users}
                            {--skip-seed : Migrate and cache only}';

    protected $description = 'Migrate, seed a fresh database, link storage and warm the caches';

    public function handle(): int
    {
        $this->info('Preparing deployment...');

        // ---- schema -------------------------------------------------------
        $this->line('  migrating');
        if (Artisan::call('migrate', ['--force' => true], $this->getOutput()) !== 0) {
            $this->error('Migrations failed. Refusing to continue - serving against a half-migrated schema would be worse than failing the deploy.');
            return self::FAILURE;
        }

        // ---- demo data ----------------------------------------------------
        if ($this->option('skip-seed')) {
            $this->line('  seeding skipped (--skip-seed)');
        } else {
            $existing = Schema::hasTable('users') ? User::count() : 0;

            if ($existing > 0 && !$this->option('force-seed')) {
                $this->line("  seeding skipped - database already has {$existing} user(s)");
            } else {
                $this->line('  seeding roles and permissions');
                Artisan::call('db:seed', [
                    '--class' => RolesAndPermissionsSeeder::class,
                    '--force' => true,
                ], $this->getOutput());

                $this->line('  seeding demo data');
                Artisan::call('db:seed', [
                    '--class' => DemoDataSeeder::class,
                    '--force' => true,
                ], $this->getOutput());

                // The seeders generate dates relative to the day they run, but a
                // container can be rebuilt weeks later from the same image. This
                // slides bookings and organ clocks back onto today so the calendar
                // and the cold-chain bands are not all empty or all breached.
                $this->line('  realigning demo dates onto today');
                Artisan::call('demo:refresh-dates', [], $this->getOutput());
            }
        }

        // ---- uploads ------------------------------------------------------
        // Uploaded documents are served through this symlink. It lives in the
        // container, so it must be recreated every boot.
        $this->line('  linking storage');
        try {
            Artisan::call('storage:link', [], $this->getOutput());
        } catch (\Throwable $e) {
            // Already linked, or the link exists as a real directory. Neither is
            // fatal and neither should fail a deploy.
            $this->line('  storage link already present');
        }

        // ---- caches -------------------------------------------------------
        // Config caching is not just a speed win here: without it, a threaded
        // server can race while reading .env and fall back to the default SQLite
        // connection, producing intermittent 500s on endpoints that are otherwise
        // fine. Caching removes the race entirely.
        $this->line('  caching config, routes and views');
        foreach (['config:cache', 'route:cache', 'view:cache'] as $cmd) {
            Artisan::call($cmd, [], $this->getOutput());
        }

        $this->newLine();
        $this->info('Ready.');

        return self::SUCCESS;
    }
}
