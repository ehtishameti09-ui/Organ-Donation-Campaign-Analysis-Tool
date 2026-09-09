<?php

namespace App\Http\Controllers;

use App\Models\CaseApproval;
use App\Models\Organ;
use App\Models\OrganEvent;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\ColdChainMonitor;
use App\Services\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Module 8 — Organ Lifecycle & Cold Chain Monitoring.
 *
 * 8.1 Cold ischemia alerting is derived on read (see Organ::coldChain) and the
 *     one-off breach alert is raised by sweepBreaches() on any list/detail read.
 *     There is no queue worker in this deployment, so anything depending on a
 *     background daemon would silently never fire; this design has no such
 *     failure mode — if anyone is looking at the system, the alert is current.
 * 8.2 Utilization metrics.
 * 8.3 Per-organ lifecycle timeline.
 */
class OrganController extends Controller
{
    public function __construct(private ColdChainMonitor $coldChain) {}

    /** Same scoping contract as the approval board: null means read-only oversight. */
    private function scope(Request $request, bool $forWrite): ?int
    {
        $u = $request->user();

        if (in_array($u->role, ['super_admin', 'auditor'], true)) {
            if ($forWrite) abort(403, 'Oversight roles can view the organ registry but cannot modify it.');
            return null;
        }

        if ($u->role === 'hospital') return (int) $u->id;

        if (in_array($u->role, ['admin', 'doctor'], true)) {
            if (empty($u->linked_hospital_id)) {
                abort(403, 'Your account is not linked to a hospital, so it has no organ registry.');
            }
            return (int) $u->linked_hospital_id;
        }

        abort(403, 'Organ registry access denied.');
    }

    private function findScoped(Request $request, int $id, bool $forWrite): Organ
    {
        $scope = $this->scope($request, $forWrite);
        $organ = Organ::with(['donor:id,name,unique_id', 'recipient:id,name,unique_id', 'hospital:id,name'])->findOrFail($id);

        if ($scope !== null && (int) $organ->hospital_id !== $scope) {
            abort(403, 'That organ belongs to another hospital.');
        }
        return $organ;
    }

    /**
     * 8.1 — raise any outstanding warning/breach alerts for these organs.
     *
     * The actual logic lives in ColdChainMonitor, shared with the scheduled
     * organs:check-cold-chain command. Doing it on read keeps the UI correct the
     * instant anyone looks, without depending on the scheduler having run;
     * doing it on a schedule makes the email arrive even when nobody is looking.
     * Both routes are idempotent, so whichever gets there first sends the one
     * alert and the other stays quiet.
     */
    private function sweepBreaches($organs): array
    {
        return array_column($this->coldChain->sweep($organs), 'reference');
    }

    /** GET /api/organs — registry with live cold-chain state. */
    public function index(Request $request): JsonResponse
    {
        $scope = $this->scope($request, false);

        $data = $request->validate([
            'status' => 'sometimes|string|max:20',
            'alert'  => 'sometimes|in:all,at_risk',
        ]);

        $organs = Organ::with(['donor:id,name,unique_id', 'recipient:id,name,unique_id', 'hospital:id,name'])
            ->when($scope !== null, fn ($q) => $q->where('hospital_id', $scope))
            ->when(!empty($data['status']) && $data['status'] !== 'all', fn ($q) => $q->where('status', $data['status']))
            ->orderByRaw("FIELD(status,'in_transit','allocated','available','transplanted','discarded','expired')")
            ->orderByDesc('recovered_at')
            ->get();

        // Alerts are raised on read — see sweepBreaches().
        $raised = $this->sweepBreaches($organs);

        $rows = $organs->map(fn ($o) => $this->present($o));

        if (($data['alert'] ?? null) === 'at_risk') {
            $rows = $rows->filter(fn ($r) => in_array($r['cold_chain']['state'], ['advisory', 'warning', 'breached'], true))
                         ->values();
        }

        return response()->json([
            'data'           => $rows,
            'counts'         => $organs->countBy('status'),
            'alerts_raised'  => $raised,
            'read_only'      => $scope === null,
        ]);
    }

    /** GET /api/organs/{id} — detail plus the lifecycle timeline (8.3). */
    public function show(Request $request, int $id): JsonResponse
    {
        $organ = $this->findScoped($request, $id, false);
        $this->sweepBreaches([$organ]);

        $organ->load('events.actor:id,name');

        $out = $this->present($organ);
        $out['timeline'] = $organ->events->map(fn ($e) => [
            'id'          => $e->id,
            'type'        => $e->event_type,
            'title'       => $e->title,
            'description' => $e->description,
            'actor'       => optional($e->actor)->name,
            'occurred_at' => $e->occurred_at->toIso8601String(),
            'meta'        => $e->meta,
        ]);

        return response()->json(['data' => $out]);
    }

    /**
     * POST /api/organs — register a recovered organ, starting its cold chain.
     *
     * Optionally links to an approved case, which is the normal path: the board
     * clears a match, then the organ is recovered against it.
     */
    public function store(Request $request): JsonResponse
    {
        $scope = $this->scope($request, true);

        $data = $request->validate([
            'organ_type'       => 'required|string|max:30',
            'donor_user_id'    => 'nullable|integer|exists:users,id',
            'case_approval_id' => 'nullable|integer|exists:case_approvals,id',
            'recovered_at'     => 'nullable|date|before_or_equal:now',
            'limit_minutes'    => 'nullable|integer|min:15|max:43200',
        ]);

        $approval = null;
        if (!empty($data['case_approval_id'])) {
            $approval = CaseApproval::findOrFail($data['case_approval_id']);
            if ((int) $approval->hospital_id !== $scope) {
                return response()->json(['message' => 'That approval case belongs to another hospital.'], 403);
            }
            if ($approval->stage !== 'approved') {
                return response()->json(['message' => 'Only an approved case can have an organ recovered against it.'], 422);
            }
            if (Organ::where('case_approval_id', $approval->id)->exists()) {
                return response()->json(['message' => 'An organ is already registered against that case.'], 422);
            }
        }

        $organType = strtolower(trim($data['organ_type']));
        $recovered = !empty($data['recovered_at']) ? \Carbon\Carbon::parse($data['recovered_at']) : now();

        $organ = DB::transaction(function () use ($data, $approval, $organType, $recovered, $scope, $request) {
            $organ = Organ::create([
                'allocation_decision_id' => $approval?->allocation_decision_id,
                'case_approval_id'       => $approval?->id,
                'donor_user_id'          => $data['donor_user_id'] ?? $approval?->donor_user_id,
                'recipient_user_id'      => $approval?->recipient_user_id,
                'hospital_id'            => $scope,
                'organ_type'             => $organType,
                'reference'              => Organ::nextReference(),
                'status'                 => $approval ? 'allocated' : 'available',
                'recovered_at'           => $recovered,
                'cold_ischemia_limit_minutes' => $data['limit_minutes'] ?? Organ::limitFor($organType),
            ]);

            OrganEvent::record($organ->id, 'recovered', 'Organ recovered',
                "Cold chain started. Limit {$organ->cold_ischemia_limit_minutes} minutes.",
                $request->user()->id, [], $recovered);

            if ($approval) {
                OrganEvent::record($organ->id, 'allocated', 'Linked to approved case',
                    "Case #{$approval->id} — cleared by the approval board.", $request->user()->id);
            }

            return $organ;
        });

        ActivityLogger::logActivity('organ_recovered', 'Organ registered',
            "{$organ->reference} ({$organType}) entered the cold chain", ['actor_id' => $request->user()->id]);

        Cache::flush();

        return response()->json(['data' => $this->present($organ->fresh(['donor', 'recipient', 'hospital']))], 201);
    }

    /** PATCH /api/organs/{id}/status — advance the lifecycle. */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => 'required|in:available,allocated,in_transit,transplanted,discarded,expired',
            'reason' => 'nullable|string|max:500',
            'note'   => 'nullable|string|max:500',
        ]);

        $organ = $this->findScoped($request, $id, true);

        if ($organ->isTerminal()) {
            return response()->json(['message' => "This organ is already recorded as {$organ->status} — its lifecycle is closed."], 422);
        }

        $new = $data['status'];

        if (in_array($new, ['discarded', 'expired'], true) && empty($data['reason'])) {
            return response()->json([
                'message' => 'A reason is required when an organ is discarded or recorded as expired.',
                'errors'  => ['reason' => ['Please state why this organ is not being transplanted.']],
            ], 422);
        }

        $chain = $organ->coldChain();
        $now   = now();

        $organ->status = $new;
        if ($new === 'transplanted') $organ->transplanted_at = $now;
        if (in_array($new, ['discarded', 'expired'], true)) {
            $organ->discarded_at   = $now;
            $organ->discard_reason = $data['reason'];
        }
        $organ->save();

        OrganEvent::record($organ->id, $new, self::statusTitle($new), $data['note'] ?? $data['reason'] ?? null,
            $request->user()->id, ['cold_chain_at_transition' => $chain]);

        // The recipient hears about the outcome that actually affects them.
        if ($new === 'transplanted' && $organ->recipient_user_id) {
            Notifier::notifyAndEmail(User::find($organ->recipient_user_id), 'transplant_complete',
                'Your transplant has been recorded',
                "Your {$organ->organ_type} transplant has been recorded as complete. Your care team will follow up with you on recovery and aftercare.",
                ['organ_id' => $organ->id, 'reference' => $organ->reference]);
        }

        ActivityLogger::logActivity('organ_' . $new, self::statusTitle($new),
            "{$organ->reference} → {$new}", ['actor_id' => $request->user()->id]);
        ActivityLogger::logAction($request->user()->id, 'organ_status_changed',
            $data['reason'] ?? $data['note'], ['organ_id' => $organ->id, 'status' => $new]);

        Cache::flush();

        return response()->json(['data' => $this->present($organ->fresh(['donor', 'recipient', 'hospital']))]);
    }

    /** POST /api/organs/{id}/events — add a manual timeline note (8.3). */
    public function addEvent(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'title'       => 'required|string|max:160',
            'description' => 'nullable|string|max:1000',
        ]);

        $organ = $this->findScoped($request, $id, true);

        OrganEvent::record($organ->id, 'note', $data['title'], $data['description'] ?? null, $request->user()->id);

        return $this->show($request, $id);
    }

    /**
     * GET /api/organs/metrics — utilization rates (8.2).
     *
     * One grouped count plus one pass over the at-risk set. Everything derived
     * (cold-chain state, expiry risk) is computed here rather than stored, so
     * the numbers can never disagree with what the registry page shows.
     */
    public function metrics(Request $request): JsonResponse
    {
        $scope = $this->scope($request, false);

        $base = fn () => Organ::when($scope !== null, fn ($q) => $q->where('hospital_id', $scope));

        $byStatus = $base()->groupBy('status')->selectRaw('status, COUNT(*) as n')->pluck('n', 'status');

        $total        = (int) array_sum($byStatus->all());
        $transplanted = (int) ($byStatus['transplanted'] ?? 0);
        $discarded    = (int) ($byStatus['discarded'] ?? 0);
        $expired      = (int) ($byStatus['expired'] ?? 0);
        $available    = (int) ($byStatus['available'] ?? 0);
        $allocated    = (int) ($byStatus['allocated'] ?? 0);
        $inTransit    = (int) ($byStatus['in_transit'] ?? 0);

        $closed = $transplanted + $discarded + $expired;
        $inPlay = $available + $allocated + $inTransit;

        $pct = fn ($n, $d) => $d > 0 ? round(($n / $d) * 100, 1) : null;

        // Live organs, for the cold-chain risk breakdown.
        $live = $base()->whereNotIn('status', Organ::TERMINAL)->get();
        $states = ['ok' => 0, 'advisory' => 0, 'warning' => 0, 'breached' => 0];
        foreach ($live as $o) $states[$o->coldChain()['state']]++;

        // Mean cold ischemia actually achieved on completed transplants — the
        // number that says whether the cold chain is being run well.
        $done = $base()->where('status', 'transplanted')->whereNotNull('transplanted_at')->get();
        $ischemia = $done->map(fn ($o) => $o->coldChain()['elapsed_minutes'])->all();
        sort($ischemia);

        $byOrganType = $base()->groupBy('organ_type')
            ->selectRaw("organ_type,
                         COUNT(*) as total,
                         SUM(status = 'transplanted') as transplanted,
                         SUM(status IN ('discarded','expired')) as wasted")
            ->get()
            ->map(fn ($r) => [
                'organ_type'   => $r->organ_type,
                'total'        => (int) $r->total,
                'transplanted' => (int) $r->transplanted,
                'wasted'       => (int) $r->wasted,
                'utilization'  => $pct((int) $r->transplanted, (int) $r->transplanted + (int) $r->wasted),
            ]);

        return response()->json([
            'totals' => [
                'total'        => $total,
                'in_play'      => $inPlay,
                'available'    => $available,
                'allocated'    => $allocated,
                'in_transit'   => $inTransit,
                'transplanted' => $transplanted,
                'discarded'    => $discarded,
                'expired'      => $expired,
            ],
            'rates' => [
                // Utilization is measured over CLOSED organs only. Counting organs
                // still in play as "not transplanted yet" would understate the rate
                // and make the number drift purely because new organs were added.
                'utilization_pct'  => $pct($transplanted, $closed),
                'expired_pct'      => $pct($expired, $closed),
                'discarded_pct'    => $pct($discarded, $closed),
                'wastage_pct'      => $pct($discarded + $expired, $closed),
                'closed_cases'     => $closed,
            ],
            'cold_chain' => [
                'live_organs' => $live->count(),
                'states'      => $states,
                'at_risk'     => $states['advisory'] + $states['warning'] + $states['breached'],
            ],
            'ischemia' => [
                'samples'        => count($ischemia),
                'mean_minutes'   => $ischemia ? (int) round(array_sum($ischemia) / count($ischemia)) : null,
                'median_minutes' => $ischemia ? $ischemia[intdiv(count($ischemia), 2)] : null,
                'max_minutes'    => $ischemia ? end($ischemia) : null,
            ],
            'by_organ_type' => $byOrganType,
            'read_only'     => $scope === null,
        ]);
    }

    private static function statusTitle(string $s): string
    {
        return [
            'available'    => 'Marked available',
            'allocated'    => 'Allocated to recipient',
            'in_transit'   => 'In transit',
            'transplanted' => 'Transplanted',
            'discarded'    => 'Discarded',
            'expired'      => 'Recorded as expired',
        ][$s] ?? $s;
    }

    private function present(Organ $o): array
    {
        return [
            'id'             => $o->id,
            'reference'      => $o->reference,
            'organ_type'     => $o->organ_type,
            'status'         => $o->status,
            'hospital_id'    => (int) $o->hospital_id,
            'hospital_name'  => $o->relationLoaded('hospital') ? optional($o->hospital)->name : null,
            'donor'          => $o->donor ? ['id' => $o->donor->id, 'name' => $o->donor->name] : null,
            'recipient'      => $o->recipient ? ['id' => $o->recipient->id, 'name' => $o->recipient->name] : null,
            'case_approval_id' => $o->case_approval_id,
            'recovered_at'   => optional($o->recovered_at)?->toIso8601String(),
            'transplanted_at'=> optional($o->transplanted_at)?->toIso8601String(),
            'discarded_at'   => optional($o->discarded_at)?->toIso8601String(),
            'discard_reason' => $o->discard_reason,
            'cold_chain'     => $o->coldChain(),
            'is_terminal'    => $o->isTerminal(),
        ];
    }
}
