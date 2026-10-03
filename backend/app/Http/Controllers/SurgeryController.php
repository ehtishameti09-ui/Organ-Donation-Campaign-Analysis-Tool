<?php

namespace App\Http\Controllers;

use App\Models\CaseApproval;
use App\Models\Organ;
use App\Models\SurgeryBooking;
use App\Models\SurgicalResource;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\Notifier;
use App\Services\SurgeryScheduler;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Module 9 — Surgery Scheduling & Resource Allocation.
 *
 * 9.1 Transaction-safe booking lives in SurgeryScheduler (row locks + overlap
 *     check inside one transaction). This controller only validates and reports.
 * 9.2 The calendar view is served by month(), shaped for a monthly grid.
 * 9.3 Resource utilization analytics in utilization().
 */
class SurgeryController extends Controller
{
    public function __construct(private SurgeryScheduler $scheduler) {}

    /**
     * Resolve which hospital's surgery schedule the caller may act on.
     *
     * Three tiers, drawn on data-minimisation lines:
     *
     *  - Hospital, its linked admins and doctors: full access to their OWN
     *    hospital. They are delivering the care, so they need the patient.
     *  - Auditor: read-only, and ONLY their own hospital. Auditors are hospital
     *    employees (see UserController::createEmployee) - they were previously
     *    grouped with super_admin here and could read every other hospital's
     *    patients, which was a cross-tenant leak.
     *  - Super admin: network supervision. Gets null (all hospitals) so the
     *    cross-hospital aggregates in metrics() work, but every case-level read
     *    rejects it via denyIdentifiableToSupervisor(). Supervising the registry
     *    does not require knowing which named patient had which crossmatch.
     */
    private function scope(Request $request, bool $forWrite): ?int
    {
        $u = $request->user();

        if ($u->role === 'super_admin') {
            if ($forWrite) abort(403, 'Super admins supervise the network; they do not book or modify surgeries.');
            return null;
        }

        if ($u->role === 'hospital') return (int) $u->id;

        if (in_array($u->role, ['admin', 'doctor', 'auditor'], true)) {
            if (empty($u->linked_hospital_id)) {
                abort(403, 'Your account is not linked to a hospital, so it has no surgery schedule.');
            }
            if ($forWrite && $u->role === 'auditor') {
                abort(403, 'Auditors have read-only access.');
            }
            return (int) $u->linked_hospital_id;
        }

        abort(403, 'Surgery schedule access denied.');
    }

    /**
     * Block the supervisor role from anything that identifies a patient.
     *
     * Aggregate performance and utilisation figures are the registry's own
     * supervision data and carry no patient. Case lists, detail panels and
     * timelines carry names, clinical checklists (serology, crossmatch),
     * doctors' notes and discard reasons - none of which supervision needs.
     */
    private function denyIdentifiableToSupervisor(Request $request): void
    {
        if ($request->user()->role === 'super_admin') {
            abort(403, 'Super admins see network-level metrics only. Case-level records belong to the treating hospital.');
        }
    }

    // ---------------------------------------------------------------- resources

    /** GET /api/surgery/resources */
    public function resources(Request $request): JsonResponse
    {
        $this->denyIdentifiableToSupervisor($request);
        $scope = $this->scope($request, false);

        $rows = SurgicalResource::with('user:id,name')
            ->when($scope !== null, fn ($q) => $q->where('hospital_id', $scope))
            ->orderBy('type')->orderBy('name')
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id, 'type' => $r->type, 'name' => $r->name, 'code' => $r->code,
                'is_active' => $r->is_active, 'user' => optional($r->user)->name,
                'hospital_id' => (int) $r->hospital_id,
            ]);

        return response()->json(['data' => $rows, 'read_only' => $scope === null]);
    }

    /** POST /api/surgery/resources */
    public function storeResource(Request $request): JsonResponse
    {
        $scope = $this->scope($request, true);

        $data = $request->validate([
            'type'    => 'required|in:theatre,icu_bed,surgeon',
            'name'    => 'required|string|max:120',
            'code'    => 'required|string|max:30',
            'user_id' => 'nullable|integer|exists:users,id',
        ]);

        $exists = SurgicalResource::where('hospital_id', $scope)
            ->where('type', $data['type'])->where('code', $data['code'])->exists();
        if ($exists) {
            return response()->json([
                'message' => "You already have a {$data['type']} with the code “{$data['code']}”.",
                'errors'  => ['code' => ['This code is already in use for that resource type.']],
            ], 422);
        }

        $r = SurgicalResource::create($data + ['hospital_id' => $scope, 'is_active' => true]);

        ActivityLogger::logActivity('resource_added', 'Surgical resource added',
            "{$r->label()} “{$r->name}” registered", ['actor_id' => $request->user()->id]);

        return response()->json(['data' => $r], 201);
    }

    /** PATCH /api/surgery/resources/{id} — rename or (de)activate. */
    public function updateResource(Request $request, int $id): JsonResponse
    {
        $scope = $this->scope($request, true);
        $data = $request->validate([
            'name'      => 'sometimes|string|max:120',
            'is_active' => 'sometimes|boolean',
        ]);

        $r = SurgicalResource::where('hospital_id', $scope)->findOrFail($id);

        // Deactivating a resource must not silently strand bookings already made.
        if (array_key_exists('is_active', $data) && !$data['is_active']) {
            $upcoming = SurgeryBooking::where('status', 'scheduled')
                ->where('scheduled_end', '>', now())
                ->where(fn ($q) => $q->where('theatre_id', $id)->orWhere('surgeon_id', $id)->orWhere('icu_bed_id', $id))
                ->count();
            if ($upcoming) {
                return response()->json([
                    'message' => "{$r->name} still has {$upcoming} upcoming booking(s). Cancel or reschedule them before deactivating it.",
                ], 422);
            }
        }

        $r->update($data);
        return response()->json(['data' => $r]);
    }

    // ---------------------------------------------------------------- bookings

    /**
     * POST /api/surgery/bookings — 9.1.
     *
     * All the concurrency safety lives in SurgeryScheduler::book. This method's
     * job is to validate the request shape and turn a conflict into a message a
     * coordinator can act on.
     */
    public function book(Request $request): JsonResponse
    {
        $scope = $this->scope($request, true);

        $min = (int) config('governance.surgery_min_minutes', 30);
        $max = (int) config('governance.surgery_max_minutes', 1440);

        $data = $request->validate([
            'theatre_id'       => 'required|integer',
            'surgeon_id'       => 'required|integer',
            'icu_bed_id'       => 'nullable|integer',
            'icu_hours'        => 'nullable|integer|min:1|max:720',
            'scheduled_start'  => 'required|date',
            'scheduled_end'    => 'required|date|after:scheduled_start',
            'organ_id'         => 'nullable|integer|exists:organs,id',
            'case_approval_id' => 'nullable|integer|exists:case_approvals,id',
            'notes'            => 'nullable|string|max:2000',
        ]);

        $start = Carbon::parse($data['scheduled_start']);
        $end   = Carbon::parse($data['scheduled_end']);
        $mins  = $start->diffInMinutes($end);

        if ($mins < $min || $mins > $max) {
            return response()->json([
                'message' => "A surgery slot must be between {$min} minutes and " . round($max / 60) . " hours long.",
            ], 422);
        }

        // Cross-check the linked case/organ actually belongs to this hospital,
        // and carry the recipient across so the booking knows who it is for.
        $recipientId = null;

        if (!empty($data['case_approval_id'])) {
            $a = CaseApproval::find($data['case_approval_id']);
            if (!$a || (int) $a->hospital_id !== $scope) {
                return response()->json(['message' => 'That approval case belongs to another hospital.'], 403);
            }
            if ($a->stage !== 'approved') {
                return response()->json(['message' => 'Surgery can only be scheduled against a case the approval board has cleared.'], 422);
            }
            $recipientId = $a->recipient_user_id;
        }

        if (!empty($data['organ_id'])) {
            $o = Organ::find($data['organ_id']);
            if (!$o || (int) $o->hospital_id !== $scope) {
                return response()->json(['message' => 'That organ belongs to another hospital.'], 403);
            }
            if ($o->isTerminal()) {
                return response()->json(['message' => "That organ is already recorded as {$o->status} and cannot be scheduled."], 422);
            }
            $recipientId = $recipientId ?: $o->recipient_user_id;
        }

        $result = $this->scheduler->book(
            $data + ['recipient_user_id' => $recipientId],
            $scope,
            $request->user()->id
        );

        if (!$result['ok']) {
            return response()->json([
                'message'   => 'That slot is not available: ' . implode(' ', array_column($result['conflicts'], 'reason')),
                'conflicts' => $result['conflicts'],
            ], 422);
        }

        $booking = $result['booking'];

        if ($recipientId) {
            Notifier::notifyAndEmail(User::find($recipientId), 'surgery_scheduled', 'Your transplant surgery has been scheduled',
                "Your transplant surgery has been scheduled for " . $start->format('l, j F Y \a\t H:i') . ".\n\n"
                . "Your care team will contact you with admission instructions and pre-operative preparation.",
                ['booking_id' => $booking->id]);
        }

        ActivityLogger::logActivity('surgery_scheduled', 'Surgery scheduled',
            "Booking #{$booking->id} for " . $start->format('d M H:i'), ['actor_id' => $request->user()->id]);

        Cache::flush();

        return response()->json(['data' => $this->presentBooking($booking->fresh(['theatre', 'surgeon', 'icuBed', 'recipient', 'organ']))], 201);
    }

    /** GET /api/surgery/bookings */
    public function bookings(Request $request): JsonResponse
    {
        $this->denyIdentifiableToSupervisor($request);
        $scope = $this->scope($request, false);

        $data = $request->validate([
            'from'   => 'sometimes|date',
            'to'     => 'sometimes|date',
            'status' => 'sometimes|string|max:20',
        ]);

        $rows = SurgeryBooking::with(['theatre', 'surgeon', 'icuBed', 'recipient:id,name', 'organ:id,reference,organ_type'])
            ->when($scope !== null, fn ($q) => $q->where('hospital_id', $scope))
            ->when(!empty($data['from']), fn ($q) => $q->where('scheduled_end', '>=', Carbon::parse($data['from'])))
            ->when(!empty($data['to']), fn ($q) => $q->where('scheduled_start', '<=', Carbon::parse($data['to'])))
            ->when(!empty($data['status']) && $data['status'] !== 'all', fn ($q) => $q->where('status', $data['status']))
            ->orderBy('scheduled_start')
            ->get();

        return response()->json([
            'data'      => $rows->map(fn ($b) => $this->presentBooking($b)),
            'counts'    => $rows->countBy('status'),
            'read_only' => $scope === null,
        ]);
    }

    /**
     * GET /api/surgery/calendar?month=YYYY-MM — 9.2.
     *
     * Returns bookings grouped by calendar day, plus the leading/trailing days
     * needed to fill a Monday-start grid. Grouping server-side keeps the client
     * from re-bucketing the whole month on every render.
     */
    public function month(Request $request): JsonResponse
    {
        $this->denyIdentifiableToSupervisor($request);
        $scope = $this->scope($request, false);

        $data = $request->validate(['month' => 'sometimes|date_format:Y-m']);
        $anchor = isset($data['month']) ? Carbon::createFromFormat('Y-m', $data['month'])->startOfMonth() : now()->startOfMonth();

        $gridStart = $anchor->copy()->startOfWeek(Carbon::MONDAY);
        $gridEnd   = $anchor->copy()->endOfMonth()->endOfWeek(Carbon::SUNDAY);

        $rows = SurgeryBooking::with(['theatre', 'surgeon', 'icuBed', 'recipient:id,name', 'organ:id,reference,organ_type'])
            ->when($scope !== null, fn ($q) => $q->where('hospital_id', $scope))
            ->where('scheduled_start', '<=', $gridEnd)
            ->where('scheduled_end', '>=', $gridStart)
            ->orderBy('scheduled_start')
            ->get();

        $days = [];
        for ($d = $gridStart->copy(); $d <= $gridEnd; $d->addDay()) {
            $days[$d->toDateString()] = [
                'date'        => $d->toDateString(),
                'in_month'    => $d->month === $anchor->month,
                'is_today'    => $d->isToday(),
                'bookings'    => [],
            ];
        }

        foreach ($rows as $b) {
            $key = $b->scheduled_start->toDateString();
            if (isset($days[$key])) $days[$key]['bookings'][] = $this->presentBooking($b);
        }

        return response()->json([
            'month'      => $anchor->format('Y-m'),
            'label'      => $anchor->format('F Y'),
            'prev'       => $anchor->copy()->subMonth()->format('Y-m'),
            'next'       => $anchor->copy()->addMonth()->format('Y-m'),
            'days'       => array_values($days),
            'total'      => $rows->count(),
            'read_only'  => $scope === null,
        ]);
    }

    /** PATCH /api/surgery/bookings/{id} — advance or cancel. */
    public function updateBooking(Request $request, int $id): JsonResponse
    {
        $scope = $this->scope($request, true);

        $data = $request->validate([
            'status' => 'required|in:scheduled,in_progress,completed,cancelled',
            'reason' => 'nullable|string|max:500',
        ]);

        $b = SurgeryBooking::where('hospital_id', $scope)->findOrFail($id);

        if ($b->status === 'cancelled') {
            return response()->json(['message' => 'This booking is already cancelled.'], 422);
        }
        if ($b->status === 'completed' && $data['status'] !== 'completed') {
            return response()->json(['message' => 'A completed surgery cannot be reopened.'], 422);
        }
        if ($data['status'] === 'cancelled' && empty($data['reason'])) {
            return response()->json([
                'message' => 'A reason is required to cancel a scheduled surgery.',
                'errors'  => ['reason' => ['Please state why this surgery is being cancelled.']],
            ], 422);
        }

        $b->status = $data['status'];
        if ($data['status'] === 'cancelled') $b->cancel_reason = $data['reason'];
        $b->save();

        // Completing the surgery closes the organ's cold chain automatically —
        // the two modules describe the same real event, so recording it twice by
        // hand would only create a way for them to disagree.
        if ($data['status'] === 'completed' && $b->organ_id) {
            $organ = Organ::find($b->organ_id);
            if ($organ && !$organ->isTerminal()) {
                $organ->update(['status' => 'transplanted', 'transplanted_at' => now()]);
                \App\Models\OrganEvent::record($organ->id, 'transplanted', 'Transplanted',
                    "Recorded automatically on completion of surgery booking #{$b->id}.", $request->user()->id);
            }
        }

        ActivityLogger::logActivity('surgery_' . $data['status'], 'Surgery ' . $data['status'],
            "Booking #{$b->id}", ['actor_id' => $request->user()->id]);

        Cache::flush();

        return response()->json(['data' => $this->presentBooking($b->fresh(['theatre', 'surgeon', 'icuBed', 'recipient', 'organ']))]);
    }

    /**
     * GET /api/surgery/utilization?days=30 — 9.3.
     *
     * Utilization is booked minutes ÷ available minutes over the window, where
     * available comes from config('governance.capacity_minutes_per_day'). Booked
     * minutes are clipped to the window so a booking straddling the boundary is
     * not counted twice or overcounted.
     *
     * The window looks FORWARD from today, not backward. This is a scheduling
     * tool: the useful question is "how committed are my theatres over the next
     * month, and where is the slack?", not "how busy were they last month".
     * A backward window would also read 0% on any schedule whose bookings are
     * all still ahead of it, which is every newly planned list.
     */
    public function utilization(Request $request): JsonResponse
    {
        $scope = $this->scope($request, false);

        $data = $request->validate(['days' => 'sometimes|integer|min:1|max:365']);
        $days = (int) ($data['days'] ?? 30);

        $from = now()->startOfDay();
        $to   = now()->copy()->addDays($days - 1)->endOfDay();

        $resources = SurgicalResource::when($scope !== null, fn ($q) => $q->where('hospital_id', $scope))
            ->where('is_active', true)->get();

        $bookings = SurgeryBooking::with(['theatre', 'surgeon', 'icuBed'])
            ->when($scope !== null, fn ($q) => $q->where('hospital_id', $scope))
            ->whereIn('status', SurgeryBooking::BLOCKING)
            ->where('scheduled_start', '<=', $to)
            ->where('scheduled_end', '>=', $from)
            ->get();

        $cap = config('governance.capacity_minutes_per_day');

        // Minutes of the requested window each resource was actually occupied.
        $used = [];   // resource_id => minutes
        $clip = function ($s, $e) use ($from, $to) {
            if (!$s || !$e) return 0;
            $s = $s->greaterThan($from) ? $s : $from;
            $e = $e->lessThan($to) ? $e : $to;
            return $e->greaterThan($s) ? $s->diffInMinutes($e) : 0;
        };

        foreach ($bookings as $b) {
            $m = $clip($b->scheduled_start, $b->scheduled_end);
            $used[$b->theatre_id] = ($used[$b->theatre_id] ?? 0) + $m;
            $used[$b->surgeon_id] = ($used[$b->surgeon_id] ?? 0) + $m;
            if ($b->icu_bed_id) {
                $used[$b->icu_bed_id] = ($used[$b->icu_bed_id] ?? 0) + $clip($b->icu_from, $b->icu_until);
            }
        }

        // Hospital names, so a supervisor looking across the whole network can tell
        // one hospital's "Theatre 1" from another's. Every hospital names its
        // theatres the same way, so without this the merged list is unreadable.
        // A hospital name is not patient data, so it is safe at this tier.
        $hospitalNames = User::whereIn('id', $resources->pluck('hospital_id')->unique())
            ->pluck('name', 'id');

        $byType = [];
        $perResource = [];

        foreach (SurgicalResource::TYPES as $type) {
            $ofType = $resources->where('type', $type);
            $capacityEach = ($cap[$type] ?? 720) * $days;
            $totalCapacity = $capacityEach * $ofType->count();
            $totalUsed = 0;

            foreach ($ofType as $r) {
                $u = (int) ($used[$r->id] ?? 0);
                $totalUsed += $u;
                $perResource[] = [
                    'id'            => $r->id,
                    'type'          => $type,
                    'name'          => $r->name,
                    'code'          => $r->code,
                    'hospital_id'   => (int) $r->hospital_id,
                    'hospital_name' => $hospitalNames[$r->hospital_id] ?? '-',
                    'used_minutes'  => $u,
                    'capacity_minutes' => $capacityEach,
                    'utilization'   => $capacityEach > 0 ? round(($u / $capacityEach) * 100, 1) : null,
                ];
            }

            $byType[$type] = [
                'count'            => $ofType->count(),
                'used_minutes'     => $totalUsed,
                'capacity_minutes' => $totalCapacity,
                'utilization'      => $totalCapacity > 0 ? round(($totalUsed / $totalCapacity) * 100, 1) : null,
            ];
        }

        usort($perResource, fn ($a, $b) => ($b['utilization'] ?? 0) <=> ($a['utilization'] ?? 0));

        // Per-hospital rollup. For a supervisor this is the answer to the actual
        // question - "which hospitals are at capacity?" - which a flat list of 35
        // identically named theatres cannot give.
        $byHospital = [];
        foreach ($perResource as $row) {
            $h = $row['hospital_id'];
            $byHospital[$h] ??= [
                'hospital_id'   => $h,
                'hospital_name' => $row['hospital_name'],
                'resources'     => 0,
                'used_minutes'  => 0,
                'capacity_minutes' => 0,
            ];
            $byHospital[$h]['resources']++;
            $byHospital[$h]['used_minutes']     += $row['used_minutes'];
            $byHospital[$h]['capacity_minutes'] += $row['capacity_minutes'];
        }

        $bookingsByHospital = $bookings->groupBy('hospital_id')->map->count();

        $byHospital = collect($byHospital)->map(function ($h) use ($bookingsByHospital) {
            $h['bookings']    = (int) ($bookingsByHospital[$h['hospital_id']] ?? 0);
            $h['utilization'] = $h['capacity_minutes'] > 0
                ? round(($h['used_minutes'] / $h['capacity_minutes']) * 100, 1)
                : null;
            return $h;
        })->sortByDesc('utilization')->values()->all();

        return response()->json([
            'window'   => ['days' => $days, 'from' => $from->toDateString(), 'to' => $to->toDateString()],
            'by_type'  => $byType,
            'resources'=> $perResource,
            'by_hospital' => $byHospital,
            'bookings' => [
                'total'     => $bookings->count(),
                'scheduled' => $bookings->where('status', 'scheduled')->count(),
                'completed' => $bookings->where('status', 'completed')->count(),
            ],
            'assumptions' => [
                'theatre_minutes_per_day' => $cap['theatre'] ?? null,
                'surgeon_minutes_per_day' => $cap['surgeon'] ?? null,
                'icu_bed_minutes_per_day' => $cap['icu_bed'] ?? null,
            ],
            'read_only' => $scope === null,
        ]);
    }

    private function presentBooking(SurgeryBooking $b): array
    {
        return [
            'id'               => $b->id,
            'status'           => $b->status,
            'scheduled_start'  => $b->scheduled_start->toIso8601String(),
            'scheduled_end'    => $b->scheduled_end->toIso8601String(),
            'duration_minutes' => $b->durationMinutes(),
            'icu_from'         => optional($b->icu_from)?->toIso8601String(),
            'icu_until'        => optional($b->icu_until)?->toIso8601String(),
            'theatre'          => $b->theatre ? ['id' => $b->theatre->id, 'name' => $b->theatre->name, 'code' => $b->theatre->code] : null,
            'surgeon'          => $b->surgeon ? ['id' => $b->surgeon->id, 'name' => $b->surgeon->name, 'code' => $b->surgeon->code] : null,
            'icu_bed'          => $b->icuBed ? ['id' => $b->icuBed->id, 'name' => $b->icuBed->name, 'code' => $b->icuBed->code] : null,
            'recipient'        => $b->recipient ? ['id' => $b->recipient->id, 'name' => $b->recipient->name] : null,
            'organ'            => $b->organ ? ['id' => $b->organ->id, 'reference' => $b->organ->reference, 'organ_type' => $b->organ->organ_type] : null,
            'case_approval_id' => $b->case_approval_id,
            'notes'            => $b->notes,
            'cancel_reason'    => $b->cancel_reason,
        ];
    }
}
