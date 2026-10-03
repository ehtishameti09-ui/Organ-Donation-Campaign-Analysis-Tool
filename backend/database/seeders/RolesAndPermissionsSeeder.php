<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Roles and permissions.
 *
 * IMPORTANT, so nobody mistakes this for a security control:
 *
 * ROLES are enforced. The `role:` middleware in routes/api.php and the explicit
 * role checks in the controllers are what actually authorize every request.
 *
 * PERMISSIONS are NOT currently enforced anywhere. Nothing in the codebase calls
 * can(), hasPermissionTo(), or the `permission:` middleware. The grants below are
 * a declarative map of intent - useful documentation, and the groundwork if this
 * ever moves to permission-based gates - but granting a permission here changes
 * no behaviour on its own. If you add a capability, enforce it in the route or
 * controller; editing only this file will give you a false sense of security.
 *
 * Note too that several grants are hospital-SCOPED in practice even though the
 * permission name is global: an admin holding 'delete-users' can only delete
 * users at its own hospital, enforced by
 * UserController::checkUserActionPermission(). See UserAuthorizationTest.
 */
class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // Permissions
        $permissions = [
            // User management
            'view-users', 'create-users', 'edit-users', 'delete-users',
            'ban-users', 'unban-users',
            // Hospital
            'view-hospitals', 'approve-hospitals', 'reject-hospitals',
            // Donor / Recipient cases
            'view-cases', 'review-cases', 'approve-cases', 'reject-cases', 'edit-cases',
            // Documents
            'view-documents', 'upload-documents', 'review-documents',
            // Appeals
            'view-appeals', 'review-appeals',
            // Audit / Activity
            'view-audit-logs', 'view-activity-feed',
            // Admin operations
            'manage-system', 'view-dashboard', 'manage-employees',
        ];

        foreach ($permissions as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'web']);
        }

        // Roles
        $superAdmin = Role::firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        $admin      = Role::firstOrCreate(['name' => 'admin',       'guard_name' => 'web']);
        $hospital   = Role::firstOrCreate(['name' => 'hospital',    'guard_name' => 'web']);
        $doctor     = Role::firstOrCreate(['name' => 'doctor',      'guard_name' => 'web']);
        $dataEntry  = Role::firstOrCreate(['name' => 'data_entry',  'guard_name' => 'web']);
        $auditor    = Role::firstOrCreate(['name' => 'auditor',     'guard_name' => 'web']);
        $donor      = Role::firstOrCreate(['name' => 'donor',       'guard_name' => 'web']);
        $recipient  = Role::firstOrCreate(['name' => 'recipient',   'guard_name' => 'web']);

        // Super Admin: everything
        $superAdmin->syncPermissions(Permission::all());

        // Admin: most things except super-admin-only.
        // User-management grants are scoped to the admin's own hospital at the
        // controller level; an unlinked admin has no scope and so cannot act on
        // users at all. Hospital approve/reject is deliberately absent - vetting
        // a competing hospital is a conflict of interest (HospitalController).
        $admin->syncPermissions([
            'view-users', 'create-users', 'edit-users', 'delete-users',
            'ban-users', 'unban-users',
            'view-hospitals',
            'view-cases', 'review-cases', 'approve-cases', 'reject-cases', 'edit-cases',
            'view-documents', 'review-documents',
            'view-appeals', 'review-appeals',
            'view-audit-logs', 'view-activity-feed',
            'view-dashboard', 'manage-employees',
        ]);

        // Hospital: scoped management
        $hospital->syncPermissions([
            'view-cases', 'review-cases', 'approve-cases', 'reject-cases',
            'view-documents', 'review-documents', 'upload-documents',
            'view-activity-feed', 'view-dashboard',
            'manage-employees',
        ]);

        // Doctor: case review
        $doctor->syncPermissions([
            'view-cases', 'review-cases', 'approve-cases', 'reject-cases',
            'view-documents', 'view-dashboard',
        ]);

        // Data Entry: create donor/recipient records
        $dataEntry->syncPermissions([
            'view-cases', 'edit-cases',
            'view-documents', 'upload-documents',
            'view-dashboard',
        ]);

        // Auditor: read-only
        $auditor->syncPermissions([
            'view-users', 'view-hospitals', 'view-cases', 'view-documents',
            'view-audit-logs', 'view-activity-feed', 'view-dashboard',
        ]);

        // Donor / Recipient: only their own records
        $donor->syncPermissions(['upload-documents', 'view-dashboard']);
        $recipient->syncPermissions(['upload-documents', 'view-dashboard']);

        $this->command->info('Roles & permissions created.');
    }
}
