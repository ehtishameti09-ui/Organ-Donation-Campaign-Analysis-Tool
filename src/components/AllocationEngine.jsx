import { useEffect, useState } from 'react';
import {
  getAllocationPoliciesViaAPI,
  createAllocationPolicyViaAPI,
  activateAllocationPolicyViaAPI,
  getEligibleDonorsViaAPI,
  runAllocationViaAPI,
  simulateAllocationViaAPI,
  getAllocationRunsViaAPI,
  getAllocationRunViaAPI,
  createAllocationDecisionViaAPI,
  downloadAllocationCsv,
  getPendingAllocationsViaAPI,
} from '../utils/api';
import { toast } from '../utils/toast';
import { ORGAN_GROUPS, formatOrgan } from '../utils/organs';
import HelpPanel from './HelpPanel';
import Pagination, { usePagination } from './Pagination';

const SCORE_COLORS = {
  urgency:  '#d63e3e',
  waiting:  '#e8900a',
  survival: '#0eb07a',
  age:      '#7c5cbf',
  distance: '#1a5c9e',
};


// ============================================================
// Score Transparency Bar
// ============================================================
const ScoreBreakdown = ({ breakdown, max = 100 }) => {
  if (!breakdown) return null;
  const parts = [
    { key: 'urgency',  label: 'Urgency',  value: breakdown.urgency  || 0 },
    { key: 'waiting',  label: 'Waiting',  value: breakdown.waiting  || 0 },
    { key: 'survival', label: 'Survival', value: breakdown.survival || 0 },
    { key: 'age',      label: 'Age',      value: breakdown.age      || 0 },
    { key: 'distance', label: 'Distance', value: breakdown.distance || 0 },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '220px' }}>
      <div style={{ display: 'flex', height: '12px', borderRadius: '4px', overflow: 'hidden', background: 'var(--surface2)' }}>
        {parts.map(p => (
          <div key={p.key} title={`${p.label}: ${p.value}`}
            style={{ width: `${(p.value / max) * 100}%`, background: SCORE_COLORS[p.key] }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: 'var(--text2)', flexWrap: 'wrap' }}>
        {parts.map(p => (
          <span key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: SCORE_COLORS[p.key], borderRadius: '2px' }} />
            {p.label} {p.value}
          </span>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// MAIN
// ============================================================
const AllocationEngine = ({ currentUser }) => {
  const [tab, setTab] = useState('auto');
  const [policies, setPolicies] = useState([]);
  const [donors, setDonors] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, d, r] = await Promise.all([
        getAllocationPoliciesViaAPI(),
        getEligibleDonorsViaAPI(),
        getAllocationRunsViaAPI(),
      ]);
      setPolicies(p.data || []);
      setDonors(d.data || []);
      setRuns(r.data || []);
    } catch (e) {
      toast(e.message || 'Failed to load allocation data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const activePolicy = policies.find(p => p.is_active);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)' }}>Loading allocation engine…</div>;
  }

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #1a5c9e 0%, #2871be 100%)',
        color: 'white', padding: '16px 20px', borderRadius: 'var(--radius)', marginBottom: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '700' }}>🧠 Explainable Allocation Engine</div>
          <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
            Version-controlled · Score-transparent · Reproducible
          </div>
        </div>
        {activePolicy && (
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px' }}>
            Active: <strong>{activePolicy.version}</strong> · {activePolicy.name}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {[
          { id: 'auto',      label: '🤖 Auto-Match' },
          { id: 'run',       label: '▶ Manual Run' },
          { id: 'policies',  label: '⚙ Policy Versions' },
          { id: 'simulate',  label: '🔬 Simulation' },
          { id: 'history',   label: '📜 Run History' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: '-2px', cursor: 'pointer', fontSize: '13px',
              fontWeight: tab === t.id ? '600' : '500',
              color: tab === t.id ? 'var(--primary)' : 'var(--text2)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'auto'     && <AutoMatchTab onAction={loadAll} />}
      {tab === 'run'      && <RunTab donors={donors} policies={policies} onRunComplete={loadAll} />}
      {tab === 'policies' && <PoliciesTab policies={policies} onChange={loadAll} />}
      {tab === 'simulate' && <SimulationTab runs={runs} />}
      {tab === 'history'  && <HistoryTab runs={runs} />}
    </div>
  );
};

// ============================================================
// RUN TAB
// ============================================================
const RunTab = ({ donors, policies, onRunComplete }) => {
  const [selectedDonor, setSelectedDonor] = useState('');
  const [selectedOrgan, setSelectedOrgan] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [decideTarget, setDecideTarget] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const donor = donors.find(d => String(d.id) === String(selectedDonor));
  const pledgedOrgans = donor?.donor_profile?.pledged_organs || [];

  const handleRun = async () => {
    if (!selectedDonor || !selectedOrgan) {
      toast('Select a donor and an organ', 'warning');
      return;
    }
    setRunning(true);
    try {
      const payload = { donor_user_id: parseInt(selectedDonor), organ: selectedOrgan };
      if (selectedPolicy) payload.policy_id = parseInt(selectedPolicy);
      const res = await runAllocationViaAPI(payload);
      setResults(res);
      toast(`Allocation completed: ${res.data.length} candidates ranked`, 'success');
      onRunComplete();
    } catch (e) {
      toast(e.message || 'Allocation run failed', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <HelpPanel title="How Manual Run works">
        <p><strong>What it does:</strong> Run the allocation engine on demand for a specific donor + organ. Useful for ad-hoc checks, testing a non-active policy, or reviewing edge cases.</p>
        <p style={{ marginTop: '8px' }}><strong>How to use:</strong></p>
        <ol style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li>Pick a donor from the dropdown — only your hospital's approved donors appear.</li>
          <li>Pick an organ. If the donor has pledged specific organs, the list narrows to those.</li>
          <li>Optionally pick a non-active policy to test what its weights would produce.</li>
          <li>Click <strong>Run</strong>. The engine ranks every compatible recipient and stores the run in history.</li>
        </ol>
        <p style={{ marginTop: '8px' }}><strong>What you'll see:</strong> A ranked candidate table with each recipient's score breakdown bar (urgency / waiting / survival / age contributions) and final score. You can <em>Confirm</em> rank #1, <em>Override</em> to a lower-ranked recipient (≥ 20-char reason required), or <em>Export CSV</em> for offline review.</p>
        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>Tip: Manual Run is for one-off checks. For day-to-day work, use the <strong>🤖 Auto-Match</strong> tab — it runs the engine for every pending donor automatically.</p>
      </HelpPanel>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          <div className="card-title">Run Allocation</div>
          <div className="card-sub">Select donor + organ → engine applies active policy weights</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'start' }}>
          <div>
            <label className="form-label">Donor</label>
            <select className="form-input" value={selectedDonor} onChange={e => { setSelectedDonor(e.target.value); setSelectedOrgan(''); }}>
              <option value="">— Select donor —</option>
              {donors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.donor_profile?.blood_type || '?'}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', minHeight: '15px' }}>
              {donor && pledgedOrgans.length > 0 ? `Pledged: ${pledgedOrgans.map(formatOrgan).join(', ')}` : ''}
            </div>
          </div>
          <div>
            <label className="form-label">Organ</label>
            <select className="form-input" value={selectedOrgan} onChange={e => setSelectedOrgan(e.target.value)}>
              <option value="">— Select organ —</option>
              {Object.entries(ORGAN_GROUPS).map(([groupName, organs]) => (
                <optgroup key={groupName} label={groupName}>
                  {organs.map(o => {
                    const lower = o.toLowerCase();
                    const isPledged = pledgedOrgans.map(p => String(p).toLowerCase()).includes(lower);
                    return (
                      <option key={o} value={lower}>
                        {isPledged ? `✓ ${o} (pledged)` : o}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', minHeight: '15px' }}>
              {pledgedOrgans.length > 0
                ? `Donor pledged: ${pledgedOrgans.map(formatOrgan).join(', ')}. Other organs allowed for testing.`
                : 'Per Pakistan THOTA Act 2010 — all donatable organs & tissues'}
            </div>
          </div>
          <div>
            <label className="form-label">Policy (optional)</label>
            <select className="form-input" value={selectedPolicy} onChange={e => setSelectedPolicy(e.target.value)}>
              <option value="">Use Active Policy</option>
              {policies.map(p => (
                <option key={p.id} value={p.id}>{p.version} — {p.name}</option>
              ))}
            </select>
            <div style={{ marginTop: '4px', minHeight: '15px' }} />
          </div>
          <div>
            <div className="form-label" style={{ visibility: 'hidden' }}>x</div>
            <button className="btn btn-primary" onClick={handleRun} disabled={running} style={{ width: '100%' }}>
              {running ? 'Running…' : '▶ Run'}
            </button>
          </div>
        </div>
      </div>

      {results && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div className="card-title">Ranked Candidates ({results.data.length})</div>
              <div className="card-sub">
                Run #{results.run_id} · Policy {results.policy.version} · Weights stored for reproducibility
              </div>
            </div>
            {results.data.length > 0 && (
              <button className="btn btn-sm btn-outline" onClick={() => downloadAllocationCsv(results.run_id)}>
                ⬇ Export CSV
              </button>
            )}
          </div>
          {results.data.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>
              No compatible recipients found (blood type / organ mismatch).
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: '500px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>Rank</th>
                    <th>Recipient</th>
                    <th>Blood</th>
                    <th>Diagnosis</th>
                    <th>Score Breakdown</th>
                    <th style={{ textAlign: 'right' }}>Final</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.map(r => (
                    <tr key={r.user_id}>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: r.rank === 1 ? '#ffd700' : r.rank <= 3 ? '#e6e6e6' : 'var(--surface2)',
                          fontWeight: '700', fontSize: '12px',
                        }}>{r.rank}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {r.name}
                          {r.is_cross_hospital && (
                            <span style={{
                              fontSize: '9px', fontWeight: '700',
                              background: '#fff3cd', color: '#7a5a00',
                              padding: '1px 5px', borderRadius: '8px',
                              border: '1px solid #f0c14b',
                            }}>
                              🌐 CROSS
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                          Age {r.age ?? '—'} · {r.days_on_waitlist}d waitlist
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text2)' }}>
                          🏥 {r.hospital_name || '—'}
                          {r.distance_km != null && <span style={{ color: 'var(--text3)' }}> · {r.distance_km.toFixed(1)} km</span>}
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{r.blood_type}</span></td>
                      <td style={{ fontSize: '12px', maxWidth: '200px' }}>{r.diagnosis || '—'}</td>
                      <td><ScoreBreakdown breakdown={r.score_breakdown} /></td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--primary)' }}>
                        {r.final_score}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className={`btn btn-xs ${r.rank === 1 ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => { setDecideTarget(r); setOverrideReason(''); }}
                          title={r.rank === 1 ? 'Confirm engine recommendation' : 'Override — reason required (≥20 chars)'}
                        >
                          {r.rank === 1 ? '✓ Confirm' : '⚠ Override'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {decideTarget && (
        <DecisionModal
          target={decideTarget}
          runId={results.run_id}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          submitting={submittingDecision}
          onClose={() => setDecideTarget(null)}
          onConfirm={async () => {
            setSubmittingDecision(true);
            try {
              await createAllocationDecisionViaAPI({
                allocation_run_id: results.run_id,
                selected_recipient_id: decideTarget.user_id,
                selected_rank: decideTarget.rank,
                override_reason: decideTarget.rank > 1 ? overrideReason : null,
              });
              toast(decideTarget.rank > 1 ? 'Override recorded with justification' : 'Allocation confirmed', 'success');
              setDecideTarget(null);
              setOverrideReason('');
            } catch (e) {
              toast(e.message, 'error');
            } finally {
              setSubmittingDecision(false);
            }
          }}
        />
      )}
    </div>
  );
};

// ============================================================
// DECISION MODAL (override governance)
// ============================================================
const DecisionModal = ({ target, runId, overrideReason, setOverrideReason, submitting, onClose, onConfirm }) => {
  const isOverride = target.rank > 1;
  const reasonLen = (overrideReason || '').trim().length;
  const ok = !isOverride || reasonLen >= 20;

  return (
    <div className="modal-overlay show" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '560px', width: '95%' }} onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h3>{isOverride ? '⚠ Override Engine Recommendation' : '✓ Confirm Allocation Decision'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '6px', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Selecting</div>
            <strong style={{ fontSize: '15px' }}>{target.name}</strong>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>
              Rank #{target.rank} · Final score {target.final_score} · {target.blood_type} · {target.organ_needed}
            </div>
          </div>

          {isOverride && (
            <>
              <div style={{
                padding: '10px 12px', background: '#fff8e6', border: '1px solid #f0c14b',
                borderRadius: '6px', marginBottom: '12px', fontSize: '13px', color: '#7a5a00',
              }}>
                <strong>Override Justification Required.</strong> You're selecting rank #{target.rank} instead of the engine's #1 recommendation. Reason will be permanently logged and counted in bias-detection analytics.
              </div>
              <label className="form-label">Justification (minimum 20 characters)</label>
              <textarea
                className="form-input"
                rows="4"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="e.g. Patient already pre-matched in OR; surgeon team availability; family-directed donation per consent…"
              />
              <div style={{
                fontSize: '11px',
                color: reasonLen >= 20 ? 'var(--success)' : reasonLen > 0 ? '#a65a00' : 'var(--text3)',
                marginTop: '4px',
              }}>
                {reasonLen}/20 characters {reasonLen >= 20 ? '✓' : `(${20 - reasonLen} more needed)`}
              </div>
            </>
          )}
        </div>
        <footer className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className={isOverride ? 'btn btn-warning' : 'btn btn-primary'}
            onClick={onConfirm}
            disabled={!ok || submitting}
          >
            {submitting ? 'Recording…' : (isOverride ? 'Override & Record' : 'Confirm Decision')}
          </button>
        </footer>
      </div>
    </div>
  );
};

// ============================================================
// POLICIES TAB
// ============================================================
const PoliciesTab = ({ policies, onChange }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    version: '', name: '', description: '',
    weights: { urgency: 35, waiting: 20, survival: 20, age: 10, distance: 15 },
    activate: false,
  });

  const weightSum = Object.values(newPolicy.weights).reduce((a, b) => a + Number(b), 0);

  const handleCreate = async () => {
    if (!newPolicy.version || !newPolicy.name) {
      toast('Version and name required', 'warning');
      return;
    }
    if (Math.abs(weightSum - 100) > 0.01) {
      toast(`Weights must sum to 100 (got ${weightSum})`, 'error');
      return;
    }
    try {
      await createAllocationPolicyViaAPI({
        ...newPolicy,
        weights: {
          urgency: Number(newPolicy.weights.urgency),
          waiting: Number(newPolicy.weights.waiting),
          survival: Number(newPolicy.weights.survival),
          age: Number(newPolicy.weights.age),
        },
      });
      toast('Policy created', 'success');
      setShowCreate(false);
      setNewPolicy({ version: '', name: '', description: '', weights: { urgency: 35, waiting: 20, survival: 20, age: 10, distance: 15 }, activate: false });
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const handleActivate = async (id) => {
    try {
      await activateAllocationPolicyViaAPI(id);
      toast('Policy activated', 'success');
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div>
      <HelpPanel title="How Policy Versions work">
        <p><strong>What a policy is:</strong> A 4-number recipe that tells the engine how to score recipients. The four numbers (weights) must add up to 100:</p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong>Urgency</strong> — clinical severity (urgency_score 0–10)</li>
          <li><strong>Waiting</strong> — days on the waitlist (capped at 365 for full points)</li>
          <li><strong>Survival</strong> — predicted post-transplant survival estimate</li>
          <li><strong>Age</strong> — favours younger productive-life recipients (peaks 18–40)</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>Why versioning matters:</strong> Once a policy is created, it is <em>immutable</em>. Every run permanently snapshots which policy + weights were used. This makes research reproducible and creates a complete audit trail.</p>
        <p style={{ marginTop: '8px' }}><strong>Active policy:</strong> Only one policy is active at a time — the engine uses it as the default for Auto-Match and Manual Run. Click <strong>Activate</strong> on any policy to switch.</p>
        <p style={{ marginTop: '8px' }}><strong>Creating a new version:</strong> Click <em>+ New Policy</em>, set a version label (e.g. <code>2.0-pediatric</code>), name, weights summing to 100, and optionally activate immediately.</p>
        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>Tip: To safely experiment with weight changes, use the <strong>🔬 Simulation</strong> tab against past runs before making a policy active.</p>
      </HelpPanel>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Policy Versions</h3>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
            Each policy is an immutable weight configuration — runs reference these for reproducibility.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '✕ Cancel' : '+ New Policy'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: '16px', borderLeft: '3px solid var(--primary)' }}>
          <div className="card-header"><div className="card-title">New Policy Version</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label className="form-label">Version *</label>
              <input className="form-input" placeholder="e.g. 2.0-pediatric"
                value={newPolicy.version} onChange={e => setNewPolicy({ ...newPolicy, version: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Name *</label>
              <input className="form-input" placeholder="e.g. Pediatric Priority Policy"
                value={newPolicy.name} onChange={e => setNewPolicy({ ...newPolicy, name: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows="2"
              value={newPolicy.description} onChange={e => setNewPolicy({ ...newPolicy, description: e.target.value })} />
          </div>
          <label className="form-label">Weights (must total 100)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '8px' }}>
            {['urgency', 'waiting', 'survival', 'age', 'distance'].map(k => (
              <div key={k}>
                <div style={{ fontSize: '11px', color: 'var(--text2)', textTransform: 'capitalize', marginBottom: '4px' }}>{k}</div>
                <input type="number" min="0" max="100" className="form-input"
                  value={newPolicy.weights[k]}
                  onChange={e => setNewPolicy({ ...newPolicy, weights: { ...newPolicy.weights, [k]: e.target.value } })} />
              </div>
            ))}
          </div>
          <div style={{
            fontSize: '12px', padding: '6px 10px', borderRadius: '4px',
            background: Math.abs(weightSum - 100) < 0.01 ? '#e6f7ed' : '#fff3e0',
            color: Math.abs(weightSum - 100) < 0.01 ? '#0a8043' : '#a65a00',
            marginBottom: '12px',
          }}>
            Sum: {weightSum} {Math.abs(weightSum - 100) < 0.01 ? '✓' : `(must be 100, off by ${100 - weightSum})`}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <input type="checkbox" checked={newPolicy.activate}
              onChange={e => setNewPolicy({ ...newPolicy, activate: e.target.checked })} />
            <span style={{ fontSize: '13px' }}>Activate immediately (deactivates current active policy)</span>
          </label>
          <button className="btn btn-primary" onClick={handleCreate}>Create Policy</button>
        </div>
      )}

      <div style={{ display: 'grid', gap: '10px' }}>
        {policies.map(p => (
          <div key={p.id} className="card" style={{
            borderLeft: p.is_active ? '4px solid #0eb07a' : '4px solid transparent',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <strong>{p.version}</strong>
                  <span style={{ fontSize: '14px' }}>{p.name}</span>
                  {p.is_active && <span className="badge badge-green">ACTIVE</span>}
                </div>
                {p.description && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>{p.description}</div>
                )}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {Object.entries(p.weights).map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: '11px', padding: '3px 8px',
                      background: SCORE_COLORS[k] + '22',
                      color: SCORE_COLORS[k], borderRadius: '4px', fontWeight: '600',
                    }}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
              {!p.is_active && (
                <button className="btn btn-sm btn-outline" onClick={() => handleActivate(p.id)}>
                  Activate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// SIMULATION TAB
// ============================================================
const SimulationTab = ({ runs }) => {
  const liveRuns = runs.filter(r => r.mode === 'live');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [weights, setWeights] = useState({ urgency: 35, waiting: 20, survival: 20, age: 10, distance: 15 });
  const [comparison, setComparison] = useState(null);
  const [running, setRunning] = useState(false);

  const sum = Object.values(weights).reduce((a, b) => a + Number(b), 0);
  const selectedRun = liveRuns.find(r => String(r.id) === String(selectedRunId));

  const handleSimulate = async () => {
    if (!selectedRunId) {
      toast('Pick a historical run first', 'warning');
      return;
    }
    if (Math.abs(sum - 100) > 0.01) {
      toast(`Weights must sum to 100`, 'error');
      return;
    }
    setRunning(true);
    try {
      const res = await simulateAllocationViaAPI({
        run_id: parseInt(selectedRunId),
        weights: {
          urgency: Number(weights.urgency),
          waiting: Number(weights.waiting),
          survival: Number(weights.survival),
          age: Number(weights.age),
          distance: Number(weights.distance ?? 0),
        },
      });
      setComparison(res);
      toast('Simulation complete', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <HelpPanel title="How Simulation works">
        <p><strong>What it does:</strong> Re-runs a past allocation with <em>different policy weights</em> and shows you exactly how the ranking would have changed. It is a "what-if?" sandbox — no real allocation is changed.</p>
        <p style={{ marginTop: '8px' }}><strong>How to use:</strong></p>
        <ol style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li>Pick a historical <em>live</em> run from the dropdown.</li>
          <li>Type new weights — must sum to 100.</li>
          <li>Click <strong>Compare</strong>. The engine re-ranks the same recipient pool with the same data, but using your new weights.</li>
          <li>The comparison table shows old rank vs new rank for every recipient: <strong style={{ color: '#0a8043' }}>▲ +N</strong> moved up, <strong style={{ color: '#c5371f' }}>▼ −N</strong> moved down, <strong>= 0</strong> unchanged.</li>
        </ol>
        <p style={{ marginTop: '8px' }}><strong>Why it's useful:</strong></p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong>Policy review</strong> — preview how a proposed weight change would have affected past decisions before activating it.</li>
          <li><strong>Sensitivity testing</strong> — if small weight changes cause big rank shifts, the policy is fragile.</li>
          <li><strong>Bias research</strong> — combined with the Fairness Lab, simulations reveal whether bias patterns shift under different weight regimes.</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>Reproducibility:</strong> The simulation uses the original run's <em>frozen dataset snapshot</em>, so the only variable changing is the weights. Anyone can replay the exact same simulation and get identical results.</p>
        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>Note: Simulations are saved with <code>mode = simulation</code> and feed the <strong>⚖ Fairness Lab</strong>'s sensitivity analysis. They never affect override stats or live decisions.</p>
      </HelpPanel>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          <div className="card-title">🔬 Allocation Simulation Mode</div>
          <div className="card-sub">Pick a historical run, override weights, see how rankings shift</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label className="form-label">Historical Run</label>
            <select className="form-input" value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)}>
              <option value="">— Pick run —</option>
              {liveRuns.map(r => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {r.organ} · {r.donor?.name} · {new Date(r.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
          {['urgency', 'waiting', 'survival', 'age', 'distance'].map(k => (
            <div key={k}>
              <label className="form-label" style={{ textTransform: 'capitalize' }}>{k}</label>
              <input type="number" min="0" max="100" className="form-input"
                value={weights[k]} onChange={e => setWeights({ ...weights, [k]: e.target.value })} />
            </div>
          ))}
          <button className="btn btn-primary" onClick={handleSimulate} disabled={running}>
            {running ? '…' : '🔬 Compare'}
          </button>
        </div>
        <div style={{
          marginTop: '8px', fontSize: '12px',
          color: Math.abs(sum - 100) < 0.01 ? '#0a8043' : '#a65a00',
        }}>
          Sum: {sum} {Math.abs(sum - 100) < 0.01 ? '✓' : '(must be 100)'}
        </div>
        {selectedRun && (
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--surface2)', borderRadius: '6px', fontSize: '12px' }}>
            <strong>Original weights:</strong>{' '}
            {Object.entries(selectedRun.weights_snapshot).map(([k, v]) => `${k}=${v}`).join(' · ')}
          </div>
        )}
      </div>

      {comparison && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Ranking Comparison</div>
            <div className="card-sub">↑ moved up · ↓ moved down · = unchanged</div>
          </div>
          <div className="table-wrap" style={{ maxHeight: '500px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th style={{ textAlign: 'center' }}>Old Rank</th>
                  <th style={{ textAlign: 'center' }}>New Rank</th>
                  <th style={{ textAlign: 'center' }}>Change</th>
                  <th style={{ textAlign: 'right' }}>Old Score</th>
                  <th style={{ textAlign: 'right' }}>New Score</th>
                </tr>
              </thead>
              <tbody>
                {comparison.comparison.map(c => {
                  const ch = c.rank_change;
                  const chColor = ch > 0 ? '#0a8043' : ch < 0 ? '#c5371f' : 'var(--text3)';
                  const chSym = ch > 0 ? `▲ +${ch}` : ch < 0 ? `▼ ${ch}` : '= 0';
                  return (
                    <tr key={c.user_id}>
                      <td><strong>{c.name}</strong></td>
                      <td style={{ textAlign: 'center' }}>#{c.old_rank ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>#{c.new_rank}</td>
                      <td style={{ textAlign: 'center', color: chColor, fontWeight: '600' }}>{chSym}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{c.old_score ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700' }}>{c.new_score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// HISTORY TAB
// ============================================================
const HistoryTab = ({ runs }) => {
  const [selectedRun, setSelectedRun] = useState(null);
  const { page, setPage, totalPages, total, pageSize, slice } = usePagination(runs, 15);

  const openRun = async (id) => {
    try {
      const res = await getAllocationRunViaAPI(id);
      setSelectedRun(res.data);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div>
      <HelpPanel title="How Run History works">
        <p><strong>What it does:</strong> A complete, immutable audit log of every allocation that has ever been run by your hospital — both live runs and simulations.</p>
        <p style={{ marginTop: '8px' }}><strong>What you'll see in each row:</strong></p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong>Run #</strong> — unique permanent identifier</li>
          <li><strong>Mode</strong> — <span className="badge badge-blue">live</span> (real allocation work) or <span className="badge badge-amber">simulation</span> (what-if analysis)</li>
          <li><strong>Donor + Organ</strong> — what the run was for</li>
          <li><strong>Policy</strong> — which version's weights were used</li>
          <li><strong>Run by</strong> + <strong>Date</strong> — full attribution</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>Click any row → "View"</strong> to inspect the full snapshot:</p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li>The exact policy + weights used (frozen at run time)</li>
          <li>The full ranked list of recipients with their score breakdowns</li>
          <li>The dataset snapshot — donor info + recipient pool size + timestamp</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>Why it matters:</strong> Reproducibility and accountability. If a question is ever raised about why a particular recipient was selected, the full context — policy, weights, data, decision-maker — can be reconstructed exactly.</p>
        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>Tip: For bias analysis across all runs, use the <strong>⚖ Fairness Lab</strong>. For per-run CSV/PDF export, click into the run detail.</p>
      </HelpPanel>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Run History</div>
          <div className="card-sub">{runs.length} total runs · click to inspect snapshot</div>
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>
            No runs yet. Run an allocation to populate history.
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '500px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Run #</th>
                  <th>Mode</th>
                  <th>Donor</th>
                  <th>Organ</th>
                  <th>Policy</th>
                  <th>Candidates</th>
                  <th>Run By</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {slice.map(r => (
                  <tr key={r.id}>
                    <td><strong>#{r.id}</strong></td>
                    <td>
                      <span className={`badge ${r.mode === 'live' ? 'badge-blue' : 'badge-amber'}`}>
                        {r.mode}
                      </span>
                    </td>
                    <td>{r.donor?.name || '—'}</td>
                    <td>{r.organ}</td>
                    <td>{r.policy?.version}</td>
                    <td>{r.candidate_count}</td>
                    <td>{r.runner?.name || '—'}</td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>
                      <button className="btn btn-xs btn-outline" onClick={() => openRun(r.id)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '0 12px 12px' }}>
              <Pagination page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={pageSize} label="runs" />
            </div>
          </div>
        )}
      </div>

      {selectedRun && (
        <div className="modal-overlay show" onClick={() => setSelectedRun(null)}>
          <div className="modal" style={{ maxWidth: '900px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <h3>Run #{selectedRun.id} — {selectedRun.mode === 'simulation' ? '🔬 Simulation' : '▶ Live Run'}</h3>
              <button className="modal-close" onClick={() => setSelectedRun(null)}>×</button>
            </header>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ padding: '10px', background: 'var(--surface2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Policy Snapshot</div>
                  <strong>{selectedRun.policy?.version} — {selectedRun.policy?.name}</strong>
                  <div style={{ fontSize: '11px', marginTop: '6px' }}>
                    {Object.entries(selectedRun.weights_snapshot).map(([k, v]) => `${k}=${v}`).join(' · ')}
                  </div>
                </div>
                <div style={{ padding: '10px', background: 'var(--surface2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Dataset Snapshot</div>
                  <div style={{ fontSize: '12px' }}>
                    Donor: <strong>{selectedRun.dataset_snapshot?.donor?.name}</strong><br/>
                    Recipients in pool: <strong>{selectedRun.dataset_snapshot?.recipient_count}</strong><br/>
                    Taken: {selectedRun.dataset_snapshot?.snapshot_taken_at}
                  </div>
                </div>
              </div>
              <h4>Ranked Results</h4>
              <div className="table-wrap" style={{ maxHeight: '400px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Recipient</th>
                      <th>Breakdown</th>
                      <th style={{ textAlign: 'right' }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRun.results || []).map(r => (
                      <tr key={r.user_id}>
                        <td>#{r.rank}</td>
                        <td>{r.name}</td>
                        <td><ScoreBreakdown breakdown={r.score_breakdown} /></td>
                        <td style={{ textAlign: 'right', fontWeight: '700' }}>{r.final_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ============================================================
// AUTO-MATCH TAB — Engine-recommended matches with Confirm / Override / Reject
// ============================================================
const AutoMatchTab = ({ onAction }) => {
  const [data, setData] = useState({ data: [], policy: null, pagination: null });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [decisionTarget, setDecisionTarget] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const PAGE_SIZE = 10;

  const load = (pg = page) => {
    setLoading(true);
    getPendingAllocationsViaAPI(pg, PAGE_SIZE)
      .then(d => setData(d))
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  const handleConfirm = async (donorUserId, organ, recipient) => {
    setSubmitting(true);
    try {
      await createAllocationDecisionViaAPI({
        donor_user_id: donorUserId,
        organ,
        selected_recipient_id: recipient.user_id,
        selected_rank: recipient.rank,
        decision_type: 'confirmed',
      });
      toast(`Confirmed match — ${recipient.name}`, 'success');
      load();
      onAction?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDecision = async () => {
    if (!decisionTarget) return;
    const { mode, donorUserId, organ, recipient } = decisionTarget;
    if (mode === 'reject' && overrideReason.trim().length < 20) {
      toast('Rejection reason must be at least 20 characters.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createAllocationDecisionViaAPI({
        donor_user_id: donorUserId,
        organ,
        selected_recipient_id: recipient.user_id,
        selected_rank: recipient.rank,
        decision_type: mode === 'reject' ? 'rejected' : 'overridden',
        override_reason: overrideReason,
      });
      toast(mode === 'reject' ? 'Match rejected with reason recorded' : 'Override recorded', 'success');
      setDecisionTarget(null);
      setOverrideReason('');
      load();
      onAction?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pag = data.pagination || { total: 0, total_pages: 1 };
  const totalDonors = pag.total;
  const totalMatches = (data.data || []).reduce((acc, d) => acc + d.organ_matches.filter(m => m.top_match).length, 0);
  const slice = data.data || [];

  return (
    <div>
      <HelpPanel title="How Auto-Match works" defaultOpen={false}>
        <p><strong>What it does:</strong> Automatically finds the best recipient for every approved donor at your hospital, for each organ they have pledged. The engine ranks; <em>you</em> make the final call.</p>
        <p style={{ marginTop: '8px' }}><strong>How matching is computed:</strong></p>
        <ol style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li>For each donor + each pledged organ, the engine filters recipients by <strong>blood compatibility</strong> (ABO matrix) and <strong>organ needed</strong>.</li>
          <li>Each compatible recipient gets a score from the active policy: weighted urgency + waiting time + survival estimate + age.</li>
          <li>The recipient with the highest score is shown as the recommended match.</li>
        </ol>
        <p style={{ marginTop: '8px' }}><strong>Your three options for each match:</strong></p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong style={{ color: '#0a8043' }}>✓ Confirm Match</strong> — accept the engine's #1 pick. Recorded instantly, no reason needed.</li>
          <li><strong style={{ color: '#a65a00' }}>⚠ Override → Pick Runner-up</strong> — choose rank #2 instead. Requires a justification of <strong>at least 20 characters</strong>.</li>
          <li><strong style={{ color: '#c5371f' }}>✕ Reject Match</strong> — rejects the engine's recommendation entirely (e.g. recipient unreachable, organ unsuitable post-harvest). Also requires a ≥ 20-character reason.</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>Why reasons are required:</strong> Every override and rejection is permanently logged and feeds into the bias-detection analytics in the <strong>⚖ Fairness Lab</strong>. This protects against unconscious bias in human decisions.</p>
        <p style={{ marginTop: '8px' }}><strong>What disappears from this list:</strong> Once a match is confirmed (or all available recipients are rejected for a donor), that donor leaves the pending list. Rejected matches stay pending so you can revisit them.</p>
        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>Tip: Click <strong>↻ Refresh</strong> after new donors are approved to pull them into the queue.</p>
      </HelpPanel>
      <div style={{
        background: 'linear-gradient(135deg, #0eb07a 0%, #15c98c 100%)',
        color: 'white', padding: '14px 18px', borderRadius: 'var(--radius)', marginBottom: '14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '700' }}>🤖 Engine-Recommended Matches</div>
        </div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div style={{ fontSize: '12px' }}>
            {totalDonors} donor{totalDonors !== 1 && 's'} · {totalMatches} match{totalMatches !== 1 && 'es'}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={load} style={{ background: 'rgba(255,255,255,.15)', color: 'white' }}>↻ Refresh</button>
        </div>
      </div>

      {data.policy && (
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' }}>
          Active policy: <strong>{data.policy.version}</strong> — {data.policy.name} · weights{' '}
          {Object.entries(data.policy.weights).map(([k,v]) => `${k}=${v}`).join(' · ')}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Computing best matches…</div>
      ) : data.data?.length === 0 ? (
        <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text3)' }}>
          ✓ No donors awaiting matching — every approved donor has a confirmed allocation decision.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {slice.map(group => (
            <div key={group.donor.id} className="card" style={{ borderLeft: '3px solid #0eb07a', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '700' }}>❤️ {group.donor.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    Blood {group.donor.blood_type || '?'} · Donation: {group.donor.donation_type || 'unspecified'} · Pledged: {(group.donor.pledged_organs || []).map(formatOrgan).join(', ')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '6px' }}>
                {group.organ_matches.map((m, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    background: 'var(--surface2)',
                    borderRadius: '6px',
                    borderLeft: m.top_match ? '3px solid var(--primary)' : '3px solid #c5371f',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <strong style={{ fontSize: '12px' }}>🩺 {formatOrgan(m.organ)}</strong>
                      <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        {m.candidate_count} compatible candidate{m.candidate_count !== 1 && 's'}
                      </span>
                    </div>

                    {!m.top_match ? (
                      <div style={{ fontSize: '11px', color: '#c5371f' }}>
                        ⚠ {m.message || 'No compatible recipient found at this hospital.'}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '12.5px', fontWeight: '600', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px' }}>
                              👤 {m.top_match.name}
                              <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--text3)' }}>
                                ({m.top_match.blood_type} · age {m.top_match.age ?? '—'} · {m.top_match.gender || '—'})
                              </span>
                              {m.top_match.is_cross_hospital && (
                                <span style={{
                                  fontSize: '9px', fontWeight: '700',
                                  background: '#fff3cd', color: '#7a5a00',
                                  padding: '1px 6px', borderRadius: '8px',
                                  border: '1px solid #f0c14b',
                                }}>
                                  🌐 CROSS-HOSPITAL
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--text2)', marginTop: '1px' }}>
                              {m.top_match.diagnosis} · urgency {m.top_match.urgency_score} · {m.top_match.days_on_waitlist}d on waitlist
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--text2)', marginTop: '1px' }}>
                              🏥 <strong>{m.top_match.hospital_name || '—'}</strong>
                              {m.top_match.hospital_city && <span style={{ color: 'var(--text3)' }}> · {m.top_match.hospital_city}</span>}
                              {m.top_match.distance_km != null && (
                                <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>· 📍 {m.top_match.distance_km.toFixed(1)} km from your hospital</span>
                              )}
                            </div>
                            <div style={{ marginTop: '4px' }}>
                              <ScoreBreakdown breakdown={m.top_match.score_breakdown} />
                            </div>
                          </div>
                          <div style={{
                            padding: '6px 10px', background: 'var(--primary)', color: 'white',
                            borderRadius: '5px', textAlign: 'center', minWidth: '64px',
                          }}>
                            <div style={{ fontSize: '9px', opacity: 0.85 }}>SCORE</div>
                            <div style={{ fontSize: '17px', fontWeight: '700', lineHeight: '1.1' }}>{m.top_match.final_score}</div>
                          </div>
                        </div>

                        {m.runner_up && (
                          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '5px', paddingLeft: '2px' }}>
                            Runner-up: {m.runner_up.name} (score {m.runner_up.final_score})
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '5px', marginTop: '7px', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-xs btn-primary"
                            disabled={submitting}
                            onClick={() => handleConfirm(group.donor.id, m.organ, m.top_match)}
                          >
                            ✓ Confirm
                          </button>
                          {m.runner_up && (
                            <button
                              className="btn btn-xs btn-outline"
                              onClick={() => {
                                setDecisionTarget({ donorUserId: group.donor.id, organ: m.organ, recipient: m.runner_up, mode: 'override', donor: group.donor });
                                setOverrideReason('');
                              }}
                            >
                              ⚠ Override → Runner-up
                            </button>
                          )}
                          <button
                            className="btn btn-xs btn-warning"
                            onClick={() => {
                              setDecisionTarget({ donorUserId: group.donor.id, organ: m.organ, recipient: m.top_match, mode: 'reject', donor: group.donor });
                              setOverrideReason('');
                            }}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Pagination page={page} setPage={setPage} totalPages={pag.total_pages} total={pag.total} pageSize={PAGE_SIZE} label="donors" />
        </div>
      )}

      {decisionTarget && (
        <div className="modal-overlay show" onClick={() => setDecisionTarget(null)}>
          <div className="modal" style={{ maxWidth: '560px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <h3>
                {decisionTarget.mode === 'reject' ? '✕ Reject Engine Match' : '⚠ Override → Pick Runner-up'}
              </h3>
              <button className="modal-close" onClick={() => setDecisionTarget(null)}>×</button>
            </header>
            <div className="modal-body">
              <div style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '6px', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                  <strong>Donor:</strong> {decisionTarget.donor.name} · <strong>Organ:</strong> {formatOrgan(decisionTarget.organ)}
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  <strong>{decisionTarget.mode === 'reject' ? 'Rejecting recommendation:' : 'Selecting:'}</strong> {decisionTarget.recipient.name}
                  <span style={{ color: 'var(--text3)' }}> · score {decisionTarget.recipient.final_score} · rank #{decisionTarget.recipient.rank}</span>
                </div>
              </div>

              <div style={{
                padding: '10px 12px', background: '#fff8e6', border: '1px solid #f0c14b',
                borderRadius: '6px', marginBottom: '12px', fontSize: '13px', color: '#7a5a00',
              }}>
                <strong>Justification required (≥ 20 characters).</strong>{' '}
                {decisionTarget.mode === 'reject'
                  ? 'This rejects the engine recommendation entirely. Reason will be permanently logged and counted in bias detection.'
                  : 'You are picking someone other than the engine\'s top match. Reason will be permanently logged.'}
              </div>

              <label className="form-label">Reason</label>
              <textarea
                className="form-input"
                rows="4"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder={
                  decisionTarget.mode === 'reject'
                    ? 'e.g. Recipient unreachable, organ unsuitable post-harvest, family withdrew consent, surgical team unavailable…'
                    : 'e.g. Pre-existing surgical pre-match, family-directed donation, logistical priority…'
                }
              />
              <div style={{ fontSize: '11px', marginTop: '4px',
                color: overrideReason.trim().length >= 20 ? 'var(--success)' : 'var(--text3)' }}>
                {overrideReason.trim().length}/20 characters
                {overrideReason.trim().length >= 20 ? ' ✓' : ` (${20 - overrideReason.trim().length} more needed)`}
              </div>
            </div>
            <footer className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDecisionTarget(null)}>Cancel</button>
              <button
                className={decisionTarget.mode === 'reject' ? 'btn btn-warning' : 'btn btn-primary'}
                onClick={handleSubmitDecision}
                disabled={overrideReason.trim().length < 20 || submitting}
              >
                {submitting ? 'Recording…' : (decisionTarget.mode === 'reject' ? 'Reject & Record' : 'Override & Record')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllocationEngine;
