import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addOrganEventViaAPI,
  getApprovalsViaAPI,
  getOrganMetricsViaAPI,
  getOrganViaAPI,
  getOrgansViaAPI,
  registerOrganViaAPI,
  updateOrganStatusViaAPI,
} from '../utils/api';
import { ORGANS, formatOrgan } from '../utils/organs';
import { toast } from '../utils/toast';
import HelpPanel from './HelpPanel';
import Pagination, { usePagination } from './Pagination';

const CHAIN_META = {
  ok:       { label: 'Within limits', color: '#0eb07a', icon: '✓' },
  advisory: { label: 'Advisory',      color: '#c9a227', icon: '•' },
  warning:  { label: 'Warning',       color: '#e8900a', icon: '▲' },
  breached: { label: 'Breached',      color: '#c5371f', icon: '⛔' },
};

const STATUS_META = {
  available:    { label: 'Available',    color: '#1a5c9e' },
  allocated:    { label: 'Allocated',    color: '#7c5cbf' },
  in_transit:   { label: 'In Transit',   color: '#e8900a' },
  transplanted: { label: 'Transplanted', color: '#0eb07a' },
  discarded:    { label: 'Discarded',    color: '#8494a8' },
  expired:      { label: 'Expired',      color: '#c5371f' },
};

/** Lifecycle steps a user can move an organ to from a given state. */
const NEXT_STATUSES = {
  available:  ['allocated', 'in_transit', 'discarded', 'expired'],
  allocated:  ['in_transit', 'transplanted', 'discarded', 'expired'],
  in_transit: ['transplanted', 'discarded', 'expired'],
};

const humanMins = (m) => {
  if (m === null || m === undefined) return '—';
  const neg = m < 0;
  const a = Math.abs(m);
  const h = Math.floor(a / 60);
  const out = h < 1 ? `${a}m` : h < 48 ? `${h}h ${a % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
  return neg ? `−${out}` : out;
};

const Badge = ({ meta, children }) => (
  <span style={{
    padding: '2px 9px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
    background: `${meta.color}1e`, color: meta.color, whiteSpace: 'nowrap',
  }}>
    {children}
  </span>
);

const SummaryCard = ({ label, value, sub, accent }) => (
  <div className="card" style={{ padding: '12px 14px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
    <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '4px', color: accent || 'var(--text1)' }}>{value}</div>
    {sub && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{sub}</div>}
  </div>
);

/**
 * Cold-chain progress bar. Shows consumption of the ischemia window, with the
 * advisory (60%) and warning (85%) thresholds marked so a number in isolation
 * ("62%") is readable as a position on a scale.
 */
const ChainBar = ({ chain, height = 7 }) => {
  const meta = CHAIN_META[chain.state];
  const pct = Math.min(100, chain.percent_used);
  return (
    <div style={{ position: 'relative', height: `${height}px`, background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: meta.color, transition: 'width .3s' }} />
      {[60, 85].map(t => (
        <div key={t} style={{
          position: 'absolute', left: `${t}%`, top: 0, bottom: 0,
          width: '1px', background: 'rgba(255,255,255,.75)',
        }} />
      ))}
    </div>
  );
};

/**
 * Module 8 — Organ Lifecycle & Cold Chain Monitoring.
 *
 * Cold-chain state is computed by the API on every read from the recovery
 * timestamp and the organ's limit, so what this page shows is correct at the
 * moment it loads — it does not depend on a background job having run. The
 * page also polls while mounted so a ticking clock stays honest on screen.
 */
const OrganLifecycle = ({ currentUser }) => {
  // Supervision sees utilisation and wastage rates, not the per-organ registry -
  // that carries donor and recipient names and discard reasons.
  const supervisorOnly = currentUser?.role === 'super_admin';
  const [tab, setTab] = useState(supervisorOnly ? 'analytics' : 'registry');
  const [organs, setOrgans] = useState([]);
  const [counts, setCounts] = useState({});
  const [metrics, setMetrics] = useState(null);
  const [metricsStale, setMetricsStale] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskOnly, setRiskOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  // Used to tell whether this page is the one actually on screen (see the poll below).
  const rootRef = useRef(null);

  const canWrite = ['hospital', 'admin', 'doctor'].includes(currentUser?.role) && !readOnly;

  const load = useCallback(async (quiet = false) => {
    if (supervisorOnly) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    try {
      const reg = await getOrgansViaAPI({
        status: statusFilter === 'all' ? null : statusFilter,
        alert: riskOnly ? 'at_risk' : null,
      });
      setOrgans(reg.data || []);
      setCounts(reg.counts || {});
      setReadOnly(!!reg.read_only);
      setMetricsStale(true);
      if (reg.alerts_raised?.length) {
        toast(`Cold ischemia breach: ${reg.alerts_raised.join(', ')}`, 'error');
      }
    } catch (e) {
      if (!quiet) toast(e.message, 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [statusFilter, riskOnly, supervisorOnly]);

  useEffect(() => { load(); }, [load]);

  // Utilization figures are only shown on the Utilization tab, so they are
  // fetched when that tab is opened rather than alongside every registry load
  // (including the 60s poll). The dev server serves one request at a time, so
  // every request avoided is latency removed from the whole page.
  useEffect(() => {
    if (tab !== 'analytics' || !metricsStale) return;
    let cancelled = false;
    getOrganMetricsViaAPI()
      .then(m => { if (!cancelled) { setMetrics(m); setMetricsStale(false); } })
      .catch(e => toast(e.message, 'error'));
    return () => { cancelled = true; };
  }, [tab, metricsStale]);

  // The cold chain is a live clock. Refresh quietly every 60s so an organ that
  // crosses a threshold while the page sits open surfaces without a manual reload.
  //
  // The visibility guard matters more than it looks. App.jsx keeps every visited
  // page mounted and merely hides it with display:none, so without this check the
  // timer keeps firing forever after you navigate away — polling a page nobody is
  // looking at, and stealing request slots from the page they ARE looking at. The
  // backend runs on PHP's single-threaded dev server, so a stolen slot is not
  // just wasted work, it is latency added to somebody's visible page.
  useEffect(() => {
    const t = setInterval(() => {
      // offsetParent is null when an ancestor has display:none.
      if (!rootRef.current?.offsetParent) return;
      if (document.hidden) return;          // browser tab in the background
      load(true);
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const openOrgan = async (id) => {
    try {
      const r = await getOrganViaAPI(id);
      setSelected(r.data);
    } catch (e) { toast(e.message, 'error'); }
  };

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r?.data) setSelected(r.data);
      if (msg) toast(msg, 'success');
      load(true);
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    } finally { setBusy(false); }
  };

  const atRisk = useMemo(
    () => organs.filter(o => !o.is_terminal && o.cold_chain.state !== 'ok'),
    [organs]
  );

  const { page, setPage, totalPages, total, pageSize, slice } = usePagination(organs, 12);

  return (
    <div ref={rootRef}>
      <div style={{
        background: 'linear-gradient(135deg, #0d7d8f 0%, #16a8bd 100%)',
        color: 'white', padding: '16px 20px', borderRadius: 'var(--radius)', marginBottom: '16px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: '700' }}>🧊 Organ Lifecycle & Cold Chain</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
          Live ischemia monitoring · utilization analytics · per-organ timeline
        </div>
      </div>

      {/* Live breach banner — the dashboard warning half of 8.1 */}
      {atRisk.some(o => o.cold_chain.state === 'breached') && (
        <div style={{
          padding: '11px 15px', borderRadius: '8px', marginBottom: '14px',
          background: '#fdf3f1', border: '1px solid #e8b5ab', color: '#8f2716', fontSize: '13px',
        }}>
          <strong>⛔ Cold ischemia limit exceeded</strong> — {atRisk.filter(o => o.cold_chain.state === 'breached').map(o => o.reference).join(', ')}.
          {' '}Viability may be compromised. These organs require immediate review.
        </div>
      )}
      {!atRisk.some(o => o.cold_chain.state === 'breached') && atRisk.some(o => o.cold_chain.state === 'warning') && (
        <div style={{
          padding: '11px 15px', borderRadius: '8px', marginBottom: '14px',
          background: '#fff8ec', border: '1px solid #f0d9a8', color: '#8a6100', fontSize: '13px',
        }}>
          <strong>▲ Approaching cold ischemia limit</strong> — {atRisk.filter(o => o.cold_chain.state === 'warning').map(o => o.reference).join(', ')}.
        </div>
      )}

      <HelpPanel title="How cold chain monitoring works">
        <p><strong>Cold ischemia time</strong> is how long an organ has been outside a body, preserved but not yet transplanted. Past a certain window the organ is no longer viable. That window differs sharply by organ — a heart has about 4 hours, a kidney about 24.</p>

        <p style={{ marginTop: '8px' }}><strong>How the clock works here:</strong> it starts at the recorded recovery time and stops at transplant or discard. The status you see is <em>calculated at the moment you load the page</em> from those timestamps — it is not a value written earlier by a background job that might not have run. That is a deliberate design choice: it means the reading is always current and cannot go stale.</p>

        <p style={{ marginTop: '8px' }}><strong>Four states, as a fraction of that organ's limit:</strong></p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong style={{ color: '#0eb07a' }}>Within limits</strong> — under 60% consumed</li>
          <li><strong style={{ color: '#c9a227' }}>Advisory</strong> — 60% or more: begin planning the transplant window</li>
          <li><strong style={{ color: '#e8900a' }}>Warning</strong> — 85% or more: act now</li>
          <li><strong style={{ color: '#c5371f' }}>Breached</strong> — past the limit; viability is in question</li>
        </ul>

        <p style={{ marginTop: '8px' }}><strong>What happens on a breach:</strong> three things at once — the organ is flagged in the registry, a banner appears at the top of this page, and the owning hospital receives an in-app notification plus an email. The alert fires exactly once per organ no matter how many people have the page open.</p>

        <p style={{ marginTop: '8px' }}><strong>Utilization</strong> is measured over <em>closed</em> organs only — transplanted, discarded, or expired. Organs still in play are excluded, because counting them as "not transplanted yet" would drag the rate down simply because new organs were registered.</p>

        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>This page refreshes itself every 60 seconds so an organ crossing a threshold surfaces without a manual reload.</p>
      </HelpPanel>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        {[
          ...(supervisorOnly ? [] : [{ id: 'registry', label: `🧊 Registry${atRisk.length ? ` (${atRisk.length} at risk)` : ''}` }]),
          { id: 'analytics', label: '📊 Utilization' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: '13px', fontWeight: tab === t.id ? '700' : '500',
            color: tab === t.id ? 'var(--accent)' : 'var(--text2)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
        <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: loading ? 'var(--accent)' : 'var(--text3)' }}>
            {supervisorOnly ? '👁 All hospitals' : loading ? '⏳ Loading…' : readOnly ? '👁 Read-only' : `${total} organ${total === 1 ? '' : 's'}`}
          </span>
          {canWrite && (
            <button className="btn btn-primary" style={{ fontSize: '12px', padding: '5px 11px' }}
              onClick={() => setShowRegister(true)}>+ Register organ</button>
          )}
        </div>
      </div>

      {supervisorOnly && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '12.5px',
          background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
        }}>
          👁 <strong>Network supervision view.</strong> Utilisation, wastage and cold-ischemia
          performance across hospitals. The organ registry itself — donors, recipients and clinical
          discard reasons — stays with the treating hospital.
        </div>
      )}

      {tab === 'registry' && !supervisorOnly && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['all', ...Object.keys(STATUS_META)].map(s => {
              const active = statusFilter === s;
              const n = s === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[s] || 0);
              return (
                <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} style={{
                  padding: '5px 12px', borderRadius: '14px', fontSize: '12px', cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'white' : 'var(--text2)', fontWeight: active ? '600' : '500',
                }}>
                  {s === 'all' ? 'All' : STATUS_META[s].label} ({n})
                </button>
              );
            })}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginLeft: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={riskOnly} onChange={e => { setRiskOnly(e.target.checked); setPage(1); }} />
              At-risk only
            </label>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table style={{ fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Organ</th>
                    <th>Status</th>
                    {readOnly && <th>Hospital</th>}
                    <th>Recipient</th>
                    <th style={{ minWidth: '170px' }}>Cold chain</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.length === 0 && (
                    <tr><td colSpan={readOnly ? 7 : 6} style={{ textAlign: 'center', padding: '28px', color: 'var(--text3)' }}>
                      {loading ? 'Loading…' : 'No organs in this view.'}
                    </td></tr>
                  )}
                  {slice.map(o => {
                    const cm = CHAIN_META[o.cold_chain.state];
                    return (
                      <tr key={o.id} onClick={() => openOrgan(o.id)} style={{
                        cursor: 'pointer',
                        background: selected?.id === o.id ? 'var(--surface2)' : undefined,
                      }}>
                        <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>{o.reference}</td>
                        <td>{formatOrgan(o.organ_type)}</td>
                        <td><Badge meta={STATUS_META[o.status]}>{STATUS_META[o.status].label}</Badge></td>
                        {readOnly && <td>{o.hospital_name || '—'}</td>}
                        <td>{o.recipient?.name || <span style={{ color: 'var(--text3)' }}>unassigned</span>}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <div style={{ flex: 1, minWidth: '70px' }}><ChainBar chain={o.cold_chain} height={6} /></div>
                            <span style={{ fontSize: '11px', color: cm.color, fontWeight: '600', whiteSpace: 'nowrap' }}>
                              {cm.icon} {o.cold_chain.percent_used}%
                            </span>
                          </div>
                        </td>
                        <td style={{ fontSize: '12px', color: o.cold_chain.remaining_minutes < 0 ? '#c5371f' : 'var(--text2)' }}>
                          {o.cold_chain.is_live
                            ? (o.cold_chain.remaining_minutes < 0
                                ? `over by ${humanMins(-o.cold_chain.remaining_minutes)}`
                                : humanMins(o.cold_chain.remaining_minutes))
                            : <span style={{ color: 'var(--text3)' }}>clock stopped</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <Pagination page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={pageSize} label="organs" />
          )}

          {selected && (
            <OrganDetail
              o={selected} busy={busy} canWrite={canWrite}
              onClose={() => setSelected(null)}
              onStatus={(status, reason, note) =>
                act(() => updateOrganStatusViaAPI(selected.id, status, { reason, note }), `Recorded as ${STATUS_META[status].label.toLowerCase()}`)}
              onNote={(title, desc) => act(() => addOrganEventViaAPI(selected.id, title, desc), 'Timeline entry added')}
            />
          )}
        </>
      )}

      {tab === 'analytics' && <UtilizationTab metrics={metrics} loading={loading} />}

      {showRegister && (
        <RegisterOrganModal
          onClose={() => setShowRegister(false)}
          onDone={() => { setShowRegister(false); load(); }}
        />
      )}
    </div>
  );
};

/** Detail panel with the lifecycle timeline (8.3) and stage transitions. */
const OrganDetail = ({ o, busy, canWrite, onClose, onStatus, onNote }) => {
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDesc, setNoteDesc] = useState('');

  const cm = CHAIN_META[o.cold_chain.state];
  const options = NEXT_STATUSES[o.status] || [];
  const needsReason = target === 'discarded' || target === 'expired';

  return (
    <div className="card" style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '700', fontFamily: 'monospace' }}>
            {o.reference} <span style={{ fontFamily: 'inherit' }}>· {formatOrgan(o.organ_type)}</span>{' '}
            <Badge meta={STATUS_META[o.status]}>{STATUS_META[o.status].label}</Badge>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '3px' }}>
            {o.donor?.name ? `Donor ${o.donor.name}` : 'Donor not linked'} → {o.recipient?.name ? `Recipient ${o.recipient.name}` : 'Recipient unassigned'}
            {o.case_approval_id && <> · approval case #{o.case_approval_id}</>}
          </div>
        </div>
        <button className="btn btn-outline" onClick={onClose} style={{ padding: '4px 10px', fontSize: '12px' }}>✕ Close</button>
      </div>

      {/* Cold chain readout */}
      <div style={{
        padding: '12px 14px', borderRadius: '8px', marginBottom: '14px',
        background: `${cm.color}0f`, border: `1px solid ${cm.color}44`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px', fontSize: '12.5px' }}>
          <strong style={{ color: cm.color }}>{cm.icon} Cold ischemia — {cm.label}</strong>
          <span style={{ color: 'var(--text2)' }}>
            {humanMins(o.cold_chain.elapsed_minutes)} of {humanMins(o.cold_chain.limit_minutes)} ({o.cold_chain.percent_used}%)
          </span>
        </div>
        <ChainBar chain={o.cold_chain} height={9} />
        <div style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '6px' }}>
          Recovered {o.recovered_at ? new Date(o.recovered_at).toLocaleString() : '—'}
          {o.cold_chain.is_live
            ? <> · <strong style={{ color: o.cold_chain.remaining_minutes < 0 ? '#c5371f' : 'var(--text2)' }}>
                {o.cold_chain.remaining_minutes < 0
                  ? `over limit by ${humanMins(-o.cold_chain.remaining_minutes)}`
                  : `${humanMins(o.cold_chain.remaining_minutes)} remaining`}
              </strong></>
            : <> · clock stopped at {o.transplanted_at ? 'transplant' : 'discard'}</>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '18px' }}>
        {/* Timeline (8.3) */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>Lifecycle timeline</div>
          <div style={{ position: 'relative', paddingLeft: '18px' }}>
            <div style={{ position: 'absolute', left: '5px', top: '5px', bottom: '5px', width: '2px', background: 'var(--border)' }} />
            {(o.timeline || []).map(e => {
              const isBreach = e.type === 'cold_chain_breach';
              const dot = isBreach ? '#c5371f' : STATUS_META[e.type]?.color || 'var(--accent)';
              return (
                <div key={e.id} style={{ position: 'relative', marginBottom: '13px' }}>
                  <div style={{
                    position: 'absolute', left: '-17px', top: '3px', width: '10px', height: '10px',
                    borderRadius: '50%', background: dot, border: '2px solid var(--surface)',
                  }} />
                  <div style={{ fontSize: '12.5px', fontWeight: '600', color: isBreach ? '#c5371f' : 'var(--text1)' }}>
                    {e.title}
                  </div>
                  {e.description && (
                    <div style={{ fontSize: '11.5px', color: 'var(--text2)', marginTop: '1px' }}>{e.description}</div>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    {new Date(e.occurred_at).toLocaleString()}{e.actor ? ` · ${e.actor}` : ''}
                  </div>
                </div>
              );
            })}
            {(!o.timeline || o.timeline.length === 0) && (
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No events recorded.</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div>
          {o.is_terminal ? (
            <div style={{
              padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px',
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
            }}>
              Lifecycle closed — recorded as <strong>{STATUS_META[o.status].label.toLowerCase()}</strong>.
              {o.discard_reason && <div style={{ marginTop: '5px' }}><strong>Reason:</strong> {o.discard_reason}</div>}
            </div>
          ) : !canWrite ? (
            <div style={{ fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic' }}>
              👁 Oversight view — lifecycle changes are disabled for your role.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px' }}>Advance lifecycle</div>
              <select className="form-input" value={target} onChange={e => { setTarget(e.target.value); setReason(''); }}
                style={{ width: '100%', fontSize: '12.5px', marginBottom: '8px' }} disabled={busy}>
                <option value="">Select next state…</option>
                {options.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>

              {needsReason && (
                <textarea className="form-input" rows={2} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Reason (required) — why is this organ not being transplanted?"
                  style={{ width: '100%', fontSize: '12px', marginBottom: '8px', resize: 'vertical' }} disabled={busy} />
              )}

              <button className="btn btn-primary" style={{ fontSize: '12.5px', width: '100%' }}
                disabled={busy || !target || (needsReason && reason.trim().length < 5)}
                onClick={async () => {
                  const ok = await onStatus(target, needsReason ? reason : null, null);
                  if (ok) { setTarget(''); setReason(''); }
                }}>
                {busy ? '…' : 'Record transition'}
              </button>

              <div style={{ fontSize: '13px', fontWeight: '700', margin: '18px 0 8px' }}>Add timeline note</div>
              <input className="form-input" value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
                placeholder="Title, e.g. Perfusion check" style={{ width: '100%', fontSize: '12.5px', marginBottom: '6px' }} disabled={busy} />
              <textarea className="form-input" rows={2} value={noteDesc} onChange={e => setNoteDesc(e.target.value)}
                placeholder="Detail (optional)" style={{ width: '100%', fontSize: '12px', marginBottom: '7px', resize: 'vertical' }} disabled={busy} />
              <button className="btn btn-outline" style={{ fontSize: '12.5px', width: '100%' }}
                disabled={busy || noteTitle.trim().length < 3}
                onClick={async () => {
                  const ok = await onNote(noteTitle, noteDesc);
                  if (ok) { setNoteTitle(''); setNoteDesc(''); }
                }}>
                {busy ? '…' : '+ Add to timeline'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** 8.2 — organ utilization rate metrics. */
const UtilizationTab = ({ metrics, loading }) => {
  if (loading) return <div className="card" style={{ padding: '28px', textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>;
  if (!metrics) return null;

  const { totals, rates, cold_chain: cc, ischemia, by_organ_type: byType } = metrics;

  if (!totals.total) {
    return (
      <div className="card" style={{ padding: '28px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
        No organs registered yet — utilization figures appear once the first organ enters the cold chain.
      </div>
    );
  }

  const util = rates.utilization_pct;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
        <SummaryCard
          label="Utilization Rate" value={util === null ? '—' : `${util}%`}
          sub={`${totals.transplanted} of ${rates.closed_cases} closed`}
          accent={util === null ? undefined : util >= 80 ? '#0eb07a' : util >= 60 ? '#e8900a' : '#c5371f'}
        />
        <SummaryCard
          label="Wastage Rate" value={rates.wastage_pct === null ? '—' : `${rates.wastage_pct}%`}
          sub={`${totals.discarded} discarded · ${totals.expired} expired`}
          accent={rates.wastage_pct === null ? undefined : rates.wastage_pct <= 10 ? '#0eb07a' : rates.wastage_pct <= 25 ? '#e8900a' : '#c5371f'}
        />
        <SummaryCard label="Currently In Play" value={totals.in_play}
          sub={`${totals.available} available · ${totals.allocated} allocated · ${totals.in_transit} in transit`} />
        <SummaryCard label="At Risk Now" value={cc.at_risk}
          sub={`of ${cc.live_organs} live organ${cc.live_organs === 1 ? '' : 's'}`}
          accent={cc.at_risk === 0 ? '#0eb07a' : cc.states.breached > 0 ? '#c5371f' : '#e8900a'} />
      </div>

      <HelpPanel title="Reading the utilization figures">
        <p><strong>Utilization rate = transplanted ÷ closed.</strong> "Closed" means every organ whose story has ended — transplanted, discarded, or expired. Organs still in play are excluded on purpose: including them would make the rate fall every time a new organ was registered, which tells you nothing about how well organs are being used.</p>
        <p style={{ marginTop: '8px' }}><strong>Expired vs. discarded.</strong> Expired means the cold chain ran out — a logistics and timing failure, and the number this module exists to drive down. Discarded means the organ was judged unsuitable on clinical grounds, which is a legitimate outcome. They are counted separately for that reason, and only combined into the wastage rate.</p>
        <p style={{ marginTop: '8px' }}><strong>Mean cold ischemia</strong> is measured across completed transplants only, and is the best single indicator of whether the cold chain is being run tightly.</p>
      </HelpPanel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div className="card">
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>Live cold-chain risk</div>
          {Object.entries(CHAIN_META).map(([state, meta]) => {
            const n = cc.states[state] || 0;
            const pct = cc.live_organs ? Math.round((n / cc.live_organs) * 100) : 0;
            return (
              <div key={state} style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span style={{ color: meta.color, fontWeight: '600' }}>{meta.icon} {meta.label}</span>
                  <span style={{ color: 'var(--text3)' }}>{n} organ{n === 1 ? '' : 's'}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: meta.color }} />
                </div>
              </div>
            );
          })}
          {cc.live_organs === 0 && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No organs currently in the cold chain.</div>}
        </div>

        <div className="card">
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>Cold ischemia achieved</div>
          {ischemia.samples ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
              {[['Mean', ischemia.mean_minutes], ['Median', ischemia.median_minutes], ['Worst', ischemia.max_minutes]].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase' }}>{l}</div>
                  <div style={{ fontSize: '17px', fontWeight: '700' }}>{humanMins(v)}</div>
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                Across {ischemia.samples} completed transplant{ischemia.samples === 1 ? '' : 's'}.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No completed transplants yet.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>Utilization by organ type</div>
        <div className="table-wrap">
          <table style={{ fontSize: '12.5px' }}>
            <thead><tr><th>Organ</th><th>Total</th><th>Transplanted</th><th>Wasted</th><th style={{ minWidth: '150px' }}>Utilization</th></tr></thead>
            <tbody>
              {byType.map(t => (
                <tr key={t.organ_type}>
                  <td>{formatOrgan(t.organ_type)}</td>
                  <td>{t.total}</td>
                  <td>{t.transplanted}</td>
                  <td>{t.wasted}</td>
                  <td>
                    {t.utilization === null ? <span style={{ color: 'var(--text3)' }}>none closed</span> : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${t.utilization}%`, height: '100%', background: t.utilization >= 80 ? '#0eb07a' : t.utilization >= 60 ? '#e8900a' : '#c5371f' }} />
                        </div>
                        <span style={{ fontSize: '11px', width: '34px' }}>{t.utilization}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

/** Register a newly recovered organ, optionally against an approved case. */
const RegisterOrganModal = ({ onClose, onDone }) => {
  const [organType, setOrganType] = useState('Kidney');
  const [approvals, setApprovals] = useState([]);
  const [approvalId, setApprovalId] = useState('');
  // Defaults to now, in the browser's local time (datetime-local has no zone).
  const [recoveredAt, setRecoveredAt] = useState(
    () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [busy, setBusy] = useState(false);

  // Approved cases with no organ yet are the normal starting point.
  useEffect(() => {
    getApprovalsViaAPI({ stage: 'approved', limit: 100 })
      .then(r => setApprovals(r.data || []))
      .catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await registerOrganViaAPI({
        organ_type: organType.toLowerCase(),
        case_approval_id: approvalId ? Number(approvalId) : null,
        recovered_at: recoveredAt ? recoveredAt.replace('T', ' ') + ':00' : null,
      });
      toast('Organ registered — cold chain started', 'success');
      onDone();
    } catch (e) {
      toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '460px', width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>Register recovered organ</div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '14px' }}>
          The cold ischemia clock starts from the recovery time you enter here.
        </div>

        <label className="form-label">Organ type</label>
        <select className="form-input" value={organType} onChange={e => setOrganType(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }} disabled={busy}>
          {ORGANS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        <label className="form-label">Recovery time</label>
        <input type="datetime-local" className="form-input" value={recoveredAt}
          onChange={e => setRecoveredAt(e.target.value)} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
          style={{ width: '100%', marginBottom: '10px' }} disabled={busy} />

        <label className="form-label">Link to approved case (optional)</label>
        <select className="form-input" value={approvalId} onChange={e => setApprovalId(e.target.value)}
          style={{ width: '100%', marginBottom: '6px' }} disabled={busy}>
          <option value="">— not linked —</option>
          {approvals.map(a => (
            <option key={a.id} value={a.id}>
              Case #{a.id} · {formatOrgan(a.organ)} · {a.recipient?.name || 'unknown recipient'}
            </option>
          ))}
        </select>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '16px' }}>
          Only cases already cleared by the approval board appear here. Linking one carries the donor and recipient across automatically.
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={busy} style={{ fontSize: '12.5px' }}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !organType} style={{ fontSize: '12.5px' }}>
            {busy ? 'Registering…' : 'Start cold chain'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrganLifecycle;
