<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Make the approval board two-sided.
 *
 * The allocation engine has always matched across hospitals - loadRecipientPayloads()
 * draws from every approved recipient in the network - but Module 7 was built as
 * though it did not. A case was stamped with the DONOR's hospital only, and the
 * board filtered on that single column, so the hospital that holds the recipient's
 * chart, must obtain their consent and will perform the transplant had no stage in
 * the workflow and could not even see the case. On the seeded data that was 8 of
 * 10 cases, three of them already approved or rejected by a hospital that has never
 * seen the patient.
 *
 * This adds the recipient's side: who they are, a stage where they accept or
 * decline the offer, and the clock for how long that took. `hospital_id` keeps its
 * name and meaning (the donor/procuring side) because it is load-bearing in
 * metrics(), several indexes and the existing decision queries - renaming it would
 * be churn for no gain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_approvals', function (Blueprint $table) {
            // The transplanting hospital. Nullable because a recipient can be
            // detached from a hospital after the fact (nullOnDelete elsewhere does
            // the same), and a case must survive that rather than vanish.
            $table->unsignedBigInteger('recipient_hospital_id')->nullable()->after('hospital_id');

            $table->timestamp('offer_sent_at')->nullable()->after('requires_multi_user');
            $table->timestamp('offer_responded_at')->nullable()->after('offer_sent_at');
            $table->foreignId('offer_response_by')->nullable()->after('offer_responded_at')
                  ->constrained('users')->nullOnDelete();
            $table->text('offer_notes')->nullable()->after('offer_response_by');

            // Materialised like approval_seconds, for the same reason: metrics()
            // reads it as one grouped query instead of diffing timestamps per row.
            // Kept separate so a slow counterparty does not show up as the donor
            // hospital being slow in the 7.4 comparison.
            $table->unsignedInteger('offer_seconds')->nullable()->after('offer_notes');

            // When a decline causes the organ to fall to the next-ranked candidate,
            // the new case points back at the one that was declined. That makes the
            // re-offer chain walkable in both directions.
            $table->unsignedBigInteger('reoffered_from_id')->nullable()->after('offer_seconds');

            $table->index(['recipient_hospital_id', 'stage']);
            $table->index('reoffered_from_id');
        });

        // Self-referencing FK added separately: the column must exist first.
        Schema::table('case_approvals', function (Blueprint $table) {
            $table->foreign('reoffered_from_id')->references('id')->on('case_approvals')->nullOnDelete();
        });

        // Two new stages. Raw DDL rather than ->change(): enum modification through
        // the Blueprint is inconsistent across MySQL/MariaDB versions, and this is
        // unambiguous.
        DB::statement(
            "ALTER TABLE case_approvals MODIFY COLUMN stage
             ENUM('checklist','offer','doctor','admin','approved','rejected','declined')
             NOT NULL DEFAULT 'checklist'"
        );

        // Backfill from the recipient's current hospital. Existing cases predate the
        // column, so without this every one of them would read as having no
        // counterparty and the recipient side would stay locked out.
        DB::statement(
            'UPDATE case_approvals ca
             JOIN users u ON u.id = ca.recipient_user_id
             SET ca.recipient_hospital_id = u.preferred_hospital_id
             WHERE ca.recipient_user_id IS NOT NULL'
        );

        // Open cross-hospital cases that have already cleared their checklist are
        // sitting at doctor/admin without the counterparty ever having been asked.
        // Walk them back to the offer stage - that consent gap is exactly the defect
        // being fixed, and silently approving them would bake it in. Terminal cases
        // are left alone: rewriting a closed decision would falsify the record.
        DB::statement(
            "UPDATE case_approvals
             SET stage = 'offer', offer_sent_at = COALESCE(offer_sent_at, NOW())
             WHERE stage IN ('doctor','admin')
               AND recipient_hospital_id IS NOT NULL
               AND recipient_hospital_id <> hospital_id"
        );
    }

    public function down(): void
    {
        // Nothing can sit at a stage that is about to stop existing.
        DB::statement("UPDATE case_approvals SET stage = 'checklist' WHERE stage = 'offer'");
        DB::statement("UPDATE case_approvals SET stage = 'rejected' WHERE stage = 'declined'");

        DB::statement(
            "ALTER TABLE case_approvals MODIFY COLUMN stage
             ENUM('checklist','doctor','admin','approved','rejected')
             NOT NULL DEFAULT 'checklist'"
        );

        Schema::table('case_approvals', function (Blueprint $table) {
            $table->dropForeign(['reoffered_from_id']);
            $table->dropForeign(['offer_response_by']);
            $table->dropIndex(['reoffered_from_id']);
            $table->dropIndex(['recipient_hospital_id', 'stage']);
            $table->dropColumn([
                'recipient_hospital_id', 'offer_sent_at', 'offer_responded_at',
                'offer_response_by', 'offer_notes', 'offer_seconds', 'reoffered_from_id',
            ]);
        });
    }
};
