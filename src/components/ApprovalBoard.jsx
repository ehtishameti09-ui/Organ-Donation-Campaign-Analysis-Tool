import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminConfirmCaseViaAPI,
  doctorApproveCaseViaAPI,
  getApprovalMetricsViaAPI,
  getApprovalViaAPI,
  getApprovalsViaAPI,
  rejectCaseViaAPI,
  setApprovalChecklistItemViaAPI,
  setApprovalModeViaAPI,
} from '../utils/api';
import { toast } from '../utils/toast';
import HelpPanel from './HelpPanel';
import Pagination, { usePagination } from './Pagination';

const STAGE_META = {
  checklist: { label: 'Verification',   color: '#e8900a', hint: 'Checklist in progress' },
  doctor:    { label: 'Doctor Review',  color: '#7c5cbf', hint: 'Awaiting clinical sign-off' },
  admin:     { label: 'Final Sign-off', color: '#1a5c9e', hint: 'Awaiting admin confirmation' },
  approved:  { label: 'Approved',       color: '#0eb07a', hint: 'Cleared for transplant' },
  rejected:  { label: 'Rejected',       color: '#c5371f', hint: 'Closed — not cleared' },
};

const FILTERS = [
  { id: 'open',      label: 'Needs Action' },
  { id: 'checklist', label: 'Verification' },
  { id: 'doctor',    label: 'Doctor Review' },
  { id: 'admin',     label: 'Final Sign-off' },
  { id: 'approved',  label: 'Approved' },
  { id: 'rejected',  label: 'Rejected' },
];

/** Human-readable duration. Seconds are only useful under a minute. */
const humanDuration = (secs) => {
  if (secs === null || secs === undefined) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

const StageBadge = ({ stage }) => {
  const m = STAGE_META[stage] || { label: stage, color: 'var(--text3)' };
  return (
    <span style={{
      padding: '2px 9px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
      background: `${m.color}1e`, color: m.color, whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  );
};

const SummaryCard = ({ label, value, sub, accent }) => (
  <div className="card" style={{ padding: '12px 14px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
    <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '4px', color: accent || 'var(--text1)' }}>{value}</div>
    {sub && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{sub}</div>}
  </div>
);

/**
 * Module 7 — Hospital Approval Board.
 *
 * The gate between "the engine picked someone" and "we are going to transplant".
 * Every rule shown here (checklist completeness, doctor-then-admin ordering, the
 * conflict-of-interest block) is enforced by the API; the UI mirrors it so the
 * reason an action is unavailable is visible before you click, not after.
 */
const ApprovalBoard = ({ currentUser }) => {
  const [filter, setFilter] = useState('open');
  const [board, setBoard] = useState({ data: [], counts: {}, read_only: false });
  const [metrics, setMetrics] = useState(null);
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // full case detail
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // Super admins supervise the network and are served aggregate figures only -
  // the case list carries named patients and clinical detail they have no
  // purpose for. The API enforces this; the UI just avoids asking.
  const supervisorOnly = currentUser?.role === 'super_admin';
  const [tab, setTab] = useState(supervisorOnly ? 'performance' : 'board');

  const role = currentUser?.role;
  const isDoctor = role === 'doctor';
  const isAdminSide = role === 'hospital' || role === 'admin';
  const readOnly = board.read_only || (!isDoctor && !isAdminSide);

  const load = useCallback(async () => {
    if (supervisorOnly) { setLoading(false); return; }
    setLoading(true);
    try {
      setBoard(await getApprovalsViaAPI({ stage: filter, limit: 100 }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, supervisorOnly]);

  useEffect(() => { load(); }, [load]);

  // Metrics power the Performance tab only, so they are fetched when that tab is
  // first opened rather than on every board load. The backend runs on PHP's
  // single-threaded dev server, where one avoidable request delays every other
  // one on the page — so not asking for data nobody is looking at is the single
  // cheapest speed-up available here.
  useEffect(() => {
    if (tab !== 'performance' || metricsLoaded) return;
    let cancelled = false;
    getApprovalMetricsViaAPI()
      .then(m => { if (!cancelled) { setMetrics(m); setMetricsLoaded(true); } })
      .catch(e => toast(e.message, 'error'));
    return () => { cancelled = true; };
  }, [tab, metricsLoaded]);

  // A completed approval changes the timings, so let the next visit refetch.
  const invalidateMetrics = () => setMetricsLoaded(false);

  const openCase = async (id) => {
    try {
      const r = await getApprovalViaAPI(id);
      setSelected(r.data);
      setNotes('');
      setRejectOpen(false);
      setRejectReason('');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  /**
   * Ticking a checklist item applies immediately, then reconciles with the server.
   *
   * These are controlled checkboxes, so without an optimistic update the box does
   * not move until the round trip completes — which reads as a broken control and
   * invites repeat clicking. The local edit recomputes the same gate the server
   * enforces (all required items ticked), so the approve button enables at the
   * same instant the box does. Any failure rolls the whole panel back.
   *
   * Deliberately does not set `busy`: the checkboxes stay live so several items
   * can be ticked in a row without waiting on each other.
   */
  const toggleChecklistItem = async (key, checked) => {
    const previous = selected;

    setSelected(s => {
      const checklist = s.checklist.map(i => i.key === key ? {
        ...i,
        checked,
        checked_by: checked ? (currentUser?.name ?? null) : null,
        checked_at: checked ? new Date().toISOString() : null,
      } : i);
      const required = checklist.filter(i => i.required);
      return {
        ...s,
        checklist,
        checklist_done: required.filter(i => i.checked).length,
        checklist_complete: required.every(i => i.checked),
      };
    });

    try {
      const r = await setApprovalChecklistItemViaAPI(previous.id, key, checked);
      setSelected(r.data);
      load();
    } catch (e) {
      setSelected(previous);
      toast(e.message, 'error');
    }
  };

  /** Every mutation returns the refreshed case, so the panel updates without a refetch. */
  const act = async (fn, successMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      setSelected(r.data);
      if (successMsg) toast(successMsg, 'success');
      load();
      invalidateMetrics();
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const { page, setPage, totalPages, total, pageSize, slice } = usePagination(board.data || [], 12);

  const counts = board.counts || {};
  const openCount = (counts.checklist || 0) + (counts.doctor || 0) + (counts.admin || 0);

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #1a5c9e 0%, #2f7fd1 100%)',
        color: 'white', padding: '16px 20px', borderRadius: 'var(--radius)', marginBottom: '16px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: '700' }}>🩺 Hospital Approval Board</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
          Structured governance between allocation and transplant · checklist-gated, sequential sign-off, timed
        </div>
      </div>

      <HelpPanel title="How the Approval Board works">
        <p><strong>What this page is for:</strong> the Allocation Engine decides <em>who</em> an organ should go to. This board decides whether that match is actually cleared to proceed. A confirmed allocation is a recommendation; an approved case is a commitment.</p>

        <p style={{ marginTop: '8px' }}><strong>The four rules it enforces:</strong></p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong>Checklist gate</strong> — every required verification item must be ticked before any approve button becomes usable. The server refuses the action too, so this cannot be bypassed by the UI.</li>
          <li><strong>Sequential sign-off</strong> — a doctor records the clinical sign-off first, then the hospital admin gives final confirmation. An admin cannot confirm a case the doctor has not signed. The same person cannot supply both signatures.</li>
          <li><strong>Notification</strong> — the moment a case is approved or rejected, both the recipient and the donor are notified in-app and by email. These notices are marked persistent, so the nightly feed cleanup leaves them alone.</li>
          <li><strong>Timing</strong> — the clock starts at allocation and stops at approval. Those durations feed the hospital comparison in the Performance tab.</li>
        </ul>

        <p style={{ marginTop: '8px' }}><strong>Single vs. dual approval:</strong> dual (doctor + admin) is the default. A hospital or hospital admin can switch an individual case to single sign-off using the <em>Approval mode</em> toggle — useful where no doctor account is attached to the hospital. The toggle locks once a doctor has signed.</p>

        <p style={{ marginTop: '8px' }}><strong>Unticking matters:</strong> removing a required item from a case that already reached a sign-off stage walks the case back to Verification and clears the doctor's signature. An approval cannot rest on evidence that has since been withdrawn.</p>

        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>Super admins and auditors see every hospital's board read-only — oversight without the ability to approve, which is what keeps the cross-hospital comparison honest.</p>
      </HelpPanel>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        {[
          ...(supervisorOnly ? [] : [{ id: 'board', label: `📋 Board${openCount ? ` (${openCount})` : ''}` }]),
          { id: 'performance', label: '⏱ Performance' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '13px', fontWeight: tab === t.id ? '700' : '500',
              color: tab === t.id ? 'var(--accent)' : 'var(--text2)',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '12px', color: loading ? 'var(--accent)' : 'var(--text3)' }}>
          {supervisorOnly ? '👁 All hospitals' : loading ? '⏳ Loading…' : readOnly ? '👁 Read-only oversight view' : `✓ ${total} case${total === 1 ? '' : 's'}`}
        </div>
      </div>

      {supervisorOnly && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '12.5px',
          background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
        }}>
          👁 <strong>Network supervision view.</strong> You see aggregate performance across hospitals.
          Individual cases — patient names, verification checklists and clinical notes — stay with the
          treating hospital.
        </div>
      )}

      {tab === 'board' && !supervisorOnly && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {FILTERS.map(f => {
              const n = f.id === 'open' ? openCount : (counts[f.id] || 0);
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setFilter(f.id); setPage(1); }}
                  style={{
                    padding: '5px 12px', borderRadius: '14px', fontSize: '12px', cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? 'white' : 'var(--text2)',
                    fontWeight: active ? '600' : '500',
                  }}
                >
                  {f.label} ({n})
                </button>
              );
            })}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table style={{ fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Organ</th>
                    <th>Recipient</th>
                    <th>Donor</th>
                    {board.read_only && <th>Hospital</th>}
                    <th>Checklist</th>
                    <th>Stage</th>
                    <th>Elapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.length === 0 && (
                    <tr>
                      <td colSpan={board.read_only ? 8 : 7} style={{ textAlign: 'center', padding: '28px', color: 'var(--text3)', fontSize: '13px' }}>
                        {loading ? 'Loading…' : 'No cases in this view.'}
                      </td>
                    </tr>
                  )}
                  {slice.map(c => {
                    const done = c.checklist_done, tot = c.checklist_total;
                    const pct = tot ? Math.round((done / tot) * 100) : 0;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => openCase(c.id)}
                        style={{ cursor: 'pointer', background: selected?.id === c.id ? 'var(--surface2)' : undefined }}
                      >
                        <td style={{ fontWeight: '600' }}>#{c.id}</td>
                        <td style={{ textTransform: 'capitalize' }}>{c.organ || '—'}</td>
                        <td>{c.recipient?.name || '—'}</td>
                        <td>{c.donor?.name || '—'}</td>
                        {board.read_only && <td>{c.hospital_name || '—'}</td>}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '54px', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#0eb07a' : '#e8900a' }} />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{done}/{tot}</span>
                          </div>
                        </td>
                        <td><StageBadge stage={c.stage} /></td>
                        <td style={{ fontSize: '12px', color: 'var(--text2)' }}>{humanDuration(c.elapsed_seconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <Pagination page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={pageSize} label="cases" />
          )}

          {selected && (
            <CaseDetail
              c={selected}
              busy={busy}
              readOnly={readOnly}
              isDoctor={isDoctor}
              isAdminSide={isAdminSide}
              notes={notes}
              setNotes={setNotes}
              rejectOpen={rejectOpen}
              setRejectOpen={setRejectOpen}
              rejectReason={rejectReason}
              setRejectReason={setRejectReason}
              onClose={() => setSelected(null)}
              onToggleItem={toggleChecklistItem}
              onSetMode={(v) => act(() => setApprovalModeViaAPI(selected.id, v), v ? 'Dual sign-off required' : 'Switched to single sign-off')}
              onDoctorApprove={() => act(() => doctorApproveCaseViaAPI(selected.id, notes), 'Clinical sign-off recorded')}
              onAdminConfirm={() => act(() => adminConfirmCaseViaAPI(selected.id, notes), 'Case approved — donor and recipient notified')}
              onReject={async () => {
                const ok = await act(() => rejectCaseViaAPI(selected.id, rejectReason), 'Case rejected — donor and recipient notified');
                if (ok) { setRejectOpen(false); setRejectReason(''); }
              }}
            />
          )}
        </>
      )}

      {tab === 'performance' && <PerformanceTab metrics={metrics} loading={loading} />}
    </div>
  );
};

/** Detail panel: checklist, stage trail, and whichever action this role may take. */
const CaseDetail = ({
  c, busy, readOnly, isDoctor, isAdminSide, notes, setNotes,
  rejectOpen, setRejectOpen, rejectReason, setRejectReason,
  onClose, onToggleItem, onSetMode, onDoctorApprove, onAdminConfirm, onReject,
}) => {
  const outstanding = (c.checklist || []).filter(i => i.required && !i.checked).length;
  const gateOpen = c.checklist_complete;
  const terminal = c.stage === 'approved' || c.stage === 'rejected';

  // Which button, if any, this user could press right now — and if not, why not.
  const doctorTurn = c.requires_multi_user && c.stage === 'doctor';
  const adminTurn  = c.stage === 'admin' || (!c.requires_multi_user && c.stage === 'checklist' && gateOpen);

  const blockedReason = () => {
    if (terminal) return null;
    if (!gateOpen) return `${outstanding} required checklist item${outstanding === 1 ? '' : 's'} still outstanding.`;
    if (isDoctor && !doctorTurn) return 'This case is waiting on the hospital admin, not clinical review.';
    if (isAdminSide && !adminTurn) return 'This case is waiting on clinical sign-off from a doctor.';
    if (!isDoctor && !isAdminSide) return 'Your role can view this case but not act on it.';
    return null;
  };
  const blocked = blockedReason();

  const minReason = 20;

  return (
    <div className="card" style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '700' }}>
            Case #{c.id} · <span style={{ textTransform: 'capitalize' }}>{c.organ || 'organ'}</span> <StageBadge stage={c.stage} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '3px' }}>
            {c.recipient?.name || '—'} (recipient) ← {c.donor?.name || '—'} (donor)
            {c.decision?.was_override && (
              <span style={{ marginLeft: '8px', color: '#e8900a', fontWeight: '600' }}>
                ⚠ rank-{c.decision.selected_rank} override
              </span>
            )}
          </div>
        </div>
        <button className="btn btn-outline" onClick={onClose} style={{ padding: '4px 10px', fontSize: '12px' }}>✕ Close</button>
      </div>

      {c.decision?.was_override && c.decision.override_reason && (
        <div style={{
          padding: '8px 12px', background: '#fff8ec', border: '1px solid #f0d9a8',
          borderRadius: '6px', fontSize: '12px', marginBottom: '12px', color: '#7a5610',
        }}>
          <strong>Override justification from allocation:</strong> {c.decision.override_reason}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px' }}>
        {/* Checklist */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700' }}>Verification checklist</div>
            <div style={{ fontSize: '12px', color: gateOpen ? '#0eb07a' : '#e8900a', fontWeight: '600' }}>
              {gateOpen ? '✓ Complete' : `${outstanding} required outstanding`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {(c.checklist || []).map(item => (
              <label
                key={item.key}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '7px 10px',
                  border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px',
                  cursor: readOnly || terminal ? 'default' : 'pointer',
                  background: item.checked ? '#f2fbf7' : 'transparent',
                  opacity: readOnly || terminal ? 0.85 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!item.checked}
                  disabled={readOnly || terminal}
                  onChange={e => onToggleItem(item.key, e.target.checked)}
                  style={{ marginTop: '2px' }}
                />
                <span style={{ flex: 1 }}>
                  {item.label}
                  {!item.required && <span style={{ color: 'var(--text3)', fontSize: '11px' }}> (optional)</span>}
                  {item.checked && item.checked_by && (
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>
                      ✓ {item.checked_by}
                      {item.checked_at ? ` · ${new Date(item.checked_at).toLocaleString()}` : ''}
                    </div>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Stage trail + actions */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px' }}>Sign-off trail</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
            <TrailStep
              n="1" title="Verification"
              done={gateOpen}
              detail={gateOpen ? 'All required items confirmed' : `${outstanding} outstanding`}
            />
            {c.requires_multi_user && (
              <TrailStep
                n="2" title="Doctor sign-off"
                done={!!c.doctor_approved_at}
                detail={c.doctor_approved_at ? `${c.doctor} · ${new Date(c.doctor_approved_at).toLocaleString()}` : 'Pending'}
              />
            )}
            <TrailStep
              n={c.requires_multi_user ? '3' : '2'} title="Final confirmation"
              done={!!c.admin_confirmed_at}
              detail={c.admin_confirmed_at ? `${c.admin} · ${new Date(c.admin_confirmed_at).toLocaleString()}` : 'Pending'}
            />
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
            Allocated {c.allocated_at ? new Date(c.allocated_at).toLocaleString() : '—'}
            <br />
            {c.approved_at
              ? <>Approved in <strong style={{ color: 'var(--text1)' }}>{humanDuration(c.approval_seconds)}</strong></>
              : <>Open for <strong style={{ color: 'var(--text1)' }}>{humanDuration(c.elapsed_seconds)}</strong></>}
          </div>

          {/* Approval mode */}
          {!terminal && !readOnly && (isAdminSide) && (
            <div style={{
              padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px',
              marginBottom: '12px', fontSize: '12px',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: c.doctor_approved_at ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={c.requires_multi_user}
                  disabled={busy || !!c.doctor_approved_at}
                  onChange={e => onSetMode(e.target.checked)}
                />
                <span>
                  Require dual sign-off (doctor + admin)
                  {c.doctor_approved_at && <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Locked — doctor has signed</div>}
                </span>
              </label>
            </div>
          )}

          {terminal ? (
            <div style={{
              padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px',
              background: c.stage === 'approved' ? '#f2fbf7' : '#fdf3f1',
              border: `1px solid ${c.stage === 'approved' ? '#b8e6d2' : '#f0c4bb'}`,
              color: c.stage === 'approved' ? '#0a6e4d' : '#8f2716',
            }}>
              {c.stage === 'approved'
                ? <>✓ Approved. Donor and recipient have been notified.</>
                : <>✕ Rejected by {c.rejected_by || '—'}.<div style={{ marginTop: '4px' }}><strong>Reason:</strong> {c.rejection_reason}</div></>}
            </div>
          ) : readOnly ? (
            <div style={{ fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic' }}>
              👁 Oversight view — approval actions are disabled for your role.
            </div>
          ) : (
            <>
              <textarea
                className="form-input"
                placeholder="Notes (optional) — recorded against your signature"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                style={{ width: '100%', marginBottom: '8px', fontSize: '12px', resize: 'vertical' }}
                disabled={busy}
              />

              {blocked && (
                <div style={{
                  fontSize: '11.5px', color: '#8a6100', background: '#fff8ec',
                  border: '1px solid #f0d9a8', borderRadius: '5px', padding: '7px 9px', marginBottom: '8px',
                }}>
                  ⚠ {blocked}
                </div>
              )}

              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                {isDoctor && (
                  <button
                    className="btn btn-primary"
                    disabled={busy || !!blocked || !doctorTurn}
                    onClick={onDoctorApprove}
                    style={{ fontSize: '12.5px' }}
                  >
                    {busy ? '…' : '✓ Record clinical sign-off'}
                  </button>
                )}
                {isAdminSide && (
                  <button
                    className="btn btn-primary"
                    disabled={busy || !!blocked || !adminTurn}
                    onClick={onAdminConfirm}
                    style={{ fontSize: '12.5px' }}
                  >
                    {busy ? '…' : '✓ Confirm & approve'}
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => setRejectOpen(o => !o)}
                  style={{ fontSize: '12.5px', color: '#c5371f', borderColor: '#e8b5ab' }}
                >
                  ✕ Reject case
                </button>
              </div>

              {rejectOpen && (
                <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #e8b5ab', borderRadius: '6px', background: '#fdf7f6' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8f2716' }}>
                    Rejection justification (minimum {minReason} characters)
                  </div>
                  <textarea
                    className="form-input"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="Explain why this match is not being cleared. This is recorded permanently and sent to the donor and recipient."
                    style={{ width: '100%', fontSize: '12px', resize: 'vertical' }}
                    disabled={busy}
                  />
                  <div style={{ display: 'flex', gap: '7px', alignItems: 'center', marginTop: '7px' }}>
                    <button
                      className="btn btn-primary"
                      disabled={busy || rejectReason.trim().length < minReason}
                      onClick={onReject}
                      style={{ fontSize: '12.5px', background: '#c5371f', borderColor: '#c5371f' }}
                    >
                      {busy ? '…' : 'Confirm rejection'}
                    </button>
                    <span style={{ fontSize: '11px', color: rejectReason.trim().length < minReason ? '#c5371f' : 'var(--text3)' }}>
                      {rejectReason.trim().length}/{minReason}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const TrailStep = ({ n, title, done, detail }) => (
  <div style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
    <div style={{
      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', fontWeight: '700',
      background: done ? '#0eb07a' : 'var(--border)',
      color: done ? 'white' : 'var(--text3)',
    }}>
      {done ? '✓' : n}
    </div>
    <div style={{ fontSize: '12px' }}>
      <div style={{ fontWeight: '600' }}>{title}</div>
      <div style={{ color: 'var(--text3)', fontSize: '11px' }}>{detail}</div>
    </div>
  </div>
);

/** 7.4 — approval time tracking and hospital performance comparison. */
const PerformanceTab = ({ metrics, loading }) => {
  const bars = useMemo(() => {
    if (!metrics?.hospitals?.length) return [];
    const max = Math.max(...metrics.hospitals.map(h => h.avg_seconds), 1);
    return metrics.hospitals.map(h => ({ ...h, pct: Math.round((h.avg_seconds / max) * 100) }));
  }, [metrics]);

  if (loading) return <div className="card" style={{ padding: '28px', textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>;
  if (!metrics) return null;

  const n = metrics.network;
  const mine = metrics.mine;

  if (!n.approved) {
    return (
      <div className="card" style={{ padding: '28px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
        No cases have been approved yet — timing data appears here once the first case clears the board.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
        <SummaryCard label="Cases Approved" value={n.approved} sub={`across ${n.hospitals} hospital${n.hospitals === 1 ? '' : 's'}`} />
        <SummaryCard label="Network Median" value={humanDuration(n.median_seconds)} sub="allocation → approval" />
        <SummaryCard label="Network Average" value={humanDuration(n.avg_seconds)} sub="allocation → approval" />
        {mine
          ? <SummaryCard
              label="Your Average"
              value={humanDuration(mine.avg_seconds)}
              sub={`rank ${mine.rank} of ${n.hospitals} · ${mine.approved} approved`}
              accent={mine.avg_seconds <= n.avg_seconds ? '#0eb07a' : '#e8900a'}
            />
          : <SummaryCard label="Scope" value="All hospitals" sub="oversight view" />}
      </div>

      <HelpPanel title="Reading these numbers">
        <p><strong>What is measured:</strong> wall-clock time from the moment the allocation decision was recorded to the moment the case received its final confirmation. It is a measure of how fast a hospital's governance process moves, not of clinical quality.</p>
        <p style={{ marginTop: '8px' }}><strong>Median vs. average:</strong> the median is the more honest headline — one case left open over a weekend drags the average badly, while the median tells you what a typical case looks like. Compare your median against the network median first.</p>
        <p style={{ marginTop: '8px' }}><strong>Faster is not automatically better.</strong> A very low average alongside a high rejection rate can mean cases are being waved through. Read this next to the pipeline breakdown below.</p>
      </HelpPanel>

      <div className="card" style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>Hospital comparison — average time to approval</div>
        {bars.map(h => (
          <div key={h.hospital_id} style={{ marginBottom: '9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
              <span style={{ fontWeight: h.is_you ? '700' : '500' }}>
                #{h.rank} {h.hospital_name}{h.is_you && <span style={{ color: 'var(--accent)' }}> (you)</span>}
              </span>
              <span style={{ color: 'var(--text3)' }}>
                avg {humanDuration(h.avg_seconds)} · median {humanDuration(h.median_seconds)} · {h.approved} case{h.approved === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${h.pct}%`, height: '100%',
                background: h.is_you ? '#1a5c9e' : '#9db8d4',
              }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>Pipeline breakdown</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {Object.entries(STAGE_META).map(([stage, meta]) => (
            <div key={stage} style={{
              padding: '8px 14px', borderRadius: '6px', minWidth: '110px',
              background: `${meta.color}14`, border: `1px solid ${meta.color}33`,
            }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: meta.color }}>{metrics.pipeline?.[stage] || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{meta.label}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{meta.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default ApprovalBoard;
