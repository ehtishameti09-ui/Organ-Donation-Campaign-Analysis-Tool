import { useEffect, useMemo, useState } from 'react';
import {
  getFairnessOverviewViaAPI,
  getFairnessReportViaAPI,
  getSensitivityReportViaAPI,
  downloadAllocationCsv,
} from '../utils/api';
import { toast } from '../utils/toast';
import HelpPanel from './HelpPanel';
import Pagination, { usePagination } from './Pagination';

const SCORE_COLORS = { age: '#7c5cbf', gender: '#e8900a', urgency: '#0eb07a' };

const FairnessLab = ({ currentUser }) => {
  const [k, setK] = useState(5);
  const [threshold, setThreshold] = useState(15);
  const [overview, setOverview] = useState({ summary: null, runs: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    setLoading(true);
    getFairnessOverviewViaAPI(k, threshold)
      .then(r => setOverview(r))
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  };

  // Auto-runs on mount + every time k or threshold changes
  useEffect(() => { load(); }, [k, threshold]);

  const filteredRuns = useMemo(() => {
    if (!overview.runs) return [];
    if (filter === 'flagged')      return overview.runs.filter(r => r.flagged);
    if (filter === 'clean')        return overview.runs.filter(r => !r.flagged);
    return overview.runs;
  }, [overview.runs, filter]);

  const { page, setPage, totalPages, total, pageSize, slice } = usePagination(filteredRuns, 15);

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #0eb07a 0%, #15c98c 100%)',
        color: 'white', padding: '16px 20px', borderRadius: 'var(--radius)', marginBottom: '16px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: '700' }}>⚖ Fairness & Sensitivity Lab</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
          Compares top-K selections against the candidate pool · auto-flags distributional bias on every live run
        </div>
      </div>

      <HelpPanel title="How the Fairness Lab works">
        <p><strong>The core question:</strong> "Is the engine's top-K selection demographically representative of the candidate pool, or is it skewed toward (or away from) certain groups?"</p>
        <p style={{ marginTop: '8px' }}><strong>What it compares for every live run:</strong></p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong>Candidate Pool</strong> — every recipient the engine considered (after blood/organ filtering)</li>
          <li><strong>Top-K Selected</strong> — the K highest-scoring recipients the engine recommended (default K = 5)</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>Three demographic axes are monitored, broken into buckets:</strong></p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li><strong>Age groups</strong> — &lt; 18, 18–40, 41–60, 60+, unknown</li>
          <li><strong>Gender</strong> — Male, Female, Other, unknown</li>
          <li><strong>Urgency band</strong> — low (&lt; 4), moderate (4–6.99), high (≥ 7)</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>How bias is flagged:</strong> For each bucket, the Lab computes <code>Δ pp = Top-K % − Pool %</code>. If any bucket exceeds your threshold (default ±15pp), that axis is flagged 🚩. Example: a pool of 50% female / 50% male, but a top-5 of 100% male = +50pp deviation → <strong>flagged</strong>.</p>
        <p style={{ marginTop: '8px' }}><strong>Auto-running:</strong> The page hits one batch endpoint on load — no submit button. Adjusting <em>K</em> or <em>Threshold</em> recomputes immediately.</p>
        <p style={{ marginTop: '8px' }}><strong>The drill-down:</strong> Click any run row to see:</p>
        <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
          <li>Per-bucket breakdown — actual pool % vs top-K % numbers</li>
          <li><strong>Sensitivity analysis</strong> — for any simulations run against this allocation, see mean rank shift, survival Δ%, age shift, top-K churn</li>
          <li>Export buttons — CSV (raw ranking) + PDF (formatted bias report)</li>
        </ul>
        <p style={{ marginTop: '8px' }}><strong>What it is not:</strong> The Lab is a <em>monitoring</em> tool, not a gate. It does not block allocations — it surfaces patterns for human review. Acting on flags happens through Override / Reject decisions in the <strong>🤖 Auto-Match</strong> tab.</p>
        <p style={{ marginTop: '8px', color: 'var(--text3)', fontSize: '12px' }}>Tip: To enrich a run's sensitivity profile, re-run it in <strong>🔬 Simulation</strong> with different weight combinations. Each simulation becomes a permanent data point feeding the sensitivity table.</p>
      </HelpPanel>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label className="form-label">Top K</label>
            <input type="number" min="1" max="50" className="form-input" style={{ width: '90px' }}
              value={k} onChange={e => setK(Math.max(1, parseInt(e.target.value || 1)))} />
          </div>
          <div>
            <label className="form-label">Flag Threshold (pp)</label>
            <input type="number" min="1" max="100" className="form-input" style={{ width: '120px' }}
              value={threshold} onChange={e => setThreshold(Math.max(1, parseInt(e.target.value || 15)))} />
          </div>
          <button className="btn btn-outline" onClick={load} disabled={loading}>↻ Refresh</button>
          <div style={{ fontSize: '11px', color: 'var(--text3)', alignSelf: 'center' }}>
            Re-runs automatically when K or Threshold changes.
          </div>
          <div style={{ alignSelf: 'center', fontSize: '12px', color: loading ? 'var(--accent)' : 'var(--success)' }}>
            {loading ? '⏳ Computing…' : `✓ ${overview.runs?.length || 0} runs analyzed`}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {overview.summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
          <SummaryCard label="Runs Analyzed" value={overview.summary.total_runs} />
          <SummaryCard
            label="Flagged Runs"
            value={overview.summary.flagged_runs}
            sub={`${overview.summary.flagged_pct}% of all runs`}
            accent={overview.summary.flagged_pct > 30 ? '#c5371f' : overview.summary.flagged_pct > 10 ? '#e8900a' : '#0eb07a'}
          />
          <SummaryCard
            label="Most Common Bias"
            value={overview.summary.top_bias_category ? overview.summary.top_bias_category.toUpperCase() : '— None —'}
            sub={overview.summary.top_bias_category ? `${overview.summary.category_counts[overview.summary.top_bias_category]} runs` : 'no bias detected'}
            accent={overview.summary.top_bias_category ? SCORE_COLORS[overview.summary.top_bias_category] : '#0eb07a'}
          />
          <SummaryCard
            label="Bias Categories Hit"
            value={
              <div style={{ fontSize: '13px', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                {Object.entries(overview.summary.category_counts || {}).map(([cat, n]) => (
                  <span key={cat} style={{
                    padding: '2px 8px', borderRadius: '10px', background: SCORE_COLORS[cat] + '22', color: SCORE_COLORS[cat],
                    fontWeight: '600', fontSize: '11px',
                  }}>
                    {cat}: {n}
                  </span>
                ))}
              </div>
            }
          />
        </div>
      )}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {['all', 'flagged', 'clean'].map(f => {
          const count = f === 'all' ? overview.runs.length :
                        f === 'flagged' ? overview.runs.filter(r => r.flagged).length :
                        overview.runs.filter(r => !r.flagged).length;
          return (
            <button key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline'}
              style={{ textTransform: 'capitalize' }}>
              {f} ({count})
            </button>
          );
        })}
      </div>

      {/* Runs table — auto-loaded fairness per run */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Per-Run Fairness Status</div>
          <div className="card-sub">Click any row to see the breakdown · 🚩 = bias detected for at least one demographic axis</div>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Computing fairness for all runs…</div>
        ) : filteredRuns.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)' }}>
            {filter === 'all' ? 'No live allocation runs yet. Run an allocation first.' : `No ${filter} runs.`}
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '520px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Run #</th>
                  <th>Organ</th>
                  <th>Donor</th>
                  <th>Policy</th>
                  <th style={{ textAlign: 'right' }}>Pool / K</th>
                  <th style={{ textAlign: 'right' }} title="Largest age-bucket deviation">Age Δ</th>
                  <th style={{ textAlign: 'right' }} title="Largest gender deviation">Gender Δ</th>
                  <th style={{ textAlign: 'right' }} title="Largest urgency-band deviation">Urgency Δ</th>
                  <th style={{ width: '90px' }}></th>
                </tr>
              </thead>
              <tbody>
                {slice.map(r => (
                  <RunRow
                    key={r.id}
                    row={r}
                    threshold={threshold}
                    expanded={expanded === r.id}
                    onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                    k={k}
                  />
                ))}
              </tbody>
            </table>
            <div style={{ padding: '0 12px 12px' }}>
              <Pagination page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={pageSize} label="runs" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Run row + lazy detail loader
// ============================================================
const RunRow = ({ row, threshold, expanded, onToggle, k }) => {
  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={onToggle}>
        <td>
          <span style={{
            display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%',
            background: row.flagged ? '#c5371f' : '#0eb07a',
          }} />
          <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text2)' }}>
            {row.flagged ? '🚩 Flagged' : '✓ Clean'}
          </span>
        </td>
        <td><strong>#{row.id}</strong></td>
        <td style={{ textTransform: 'capitalize' }}>{row.organ}</td>
        <td>{row.donor_name}</td>
        <td><span className="badge badge-blue">{row.policy}</span></td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>
          {row.pool_size} / {row.k}
        </td>
        <DevCell value={row.age_max_dev}     threshold={threshold} flagged={row.flagged_categories.includes('age')} />
        <DevCell value={row.gender_max_dev}  threshold={threshold} flagged={row.flagged_categories.includes('gender')} />
        <DevCell value={row.urgency_max_dev} threshold={threshold} flagged={row.flagged_categories.includes('urgency')} />
        <td style={{ textAlign: 'right' }}>
          <button className="btn btn-xs btn-outline">{expanded ? 'Hide' : 'Inspect'}</button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan="10" style={{ background: 'var(--surface2)', padding: '14px' }}>
            <RunDetail runId={row.id} k={k} threshold={threshold} />
          </td>
        </tr>
      )}
    </>
  );
};

const DevCell = ({ value, threshold, flagged }) => {
  const color = flagged ? '#c5371f' : (value > threshold * 0.7 ? '#a65a00' : 'var(--text2)');
  return (
    <td style={{ textAlign: 'right', color, fontWeight: flagged ? '700' : '500', fontFamily: 'monospace', fontSize: '12px' }}>
      {value > 0 ? `${value.toFixed(1)} pp` : '0'}
    </td>
  );
};

// ============================================================
// Run drill-down (per-bucket breakdown + sensitivity)
// ============================================================
const RunDetail = ({ runId, k, threshold }) => {
  const [report, setReport] = useState(null);
  const [sensitivity, setSensitivity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getFairnessReportViaAPI(runId, k, threshold),
      getSensitivityReportViaAPI(runId, k),
    ])
      .then(([f, s]) => { setReport(f.data); setSensitivity(s); })
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [runId, k, threshold]);

  if (loading) return <div style={{ color: 'var(--text2)', fontSize: '12px' }}>Loading detail…</div>;
  if (!report) return null;

  const printPdf = () => {
    const w = window.open('', '_blank');
    if (!w) { toast('Allow popups to export PDF', 'warning'); return; }
    w.document.write(renderReportHtml({ runId, k, threshold, report, sensitivity }));
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
          {report.flagged
            ? <strong style={{ color: '#c5371f' }}>🚩 Bias detected — at least one axis exceeds ±{report.threshold_pct}pp</strong>
            : <strong style={{ color: '#0a8043' }}>✓ All axes within ±{report.threshold_pct}pp threshold</strong>
          }
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-xs btn-outline" onClick={() => downloadAllocationCsv(runId)}>⬇ CSV ranking</button>
          <button className="btn btn-xs btn-outline" onClick={printPdf}>📄 PDF report</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <FairnessGroup title="Age" data={report.age_groups} color={SCORE_COLORS.age} />
        <FairnessGroup title="Gender" data={report.gender} color={SCORE_COLORS.gender} />
        <FairnessGroup title="Urgency Band" data={report.urgency_band} color={SCORE_COLORS.urgency} />
      </div>

      {sensitivity && (
        <div className="card" style={{ background: 'var(--surface)' }}>
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '13px' }}>
              Sensitivity Analysis — {sensitivity.comparisons.length} simulation{sensitivity.comparisons.length !== 1 ? 's' : ''} against this run
            </div>
            {sensitivity.comparisons.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                Re-run this allocation in 🔬 Simulation tab with different weights to populate sensitivity data.
              </div>
            )}
          </div>
          {sensitivity.comparisons.length > 0 && (
            <table className="table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>Sim #</th>
                  <th>Weights Tried</th>
                  <th style={{ textAlign: 'right' }}>Mean Rank Δ</th>
                  <th style={{ textAlign: 'right' }}>Survival Δ%</th>
                  <th style={{ textAlign: 'right' }}>Age Δ yrs</th>
                  <th style={{ textAlign: 'right' }}>Top-K Churn</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.comparisons.map(c => (
                  <tr key={c.simulation_run_id}>
                    <td>#{c.simulation_run_id}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text2)' }}>
                      {Object.entries(c.simulation_weights || {}).map(([k, v]) => `${k}=${v}`).join(' · ')}
                    </td>
                    <td style={{ textAlign: 'right' }}>{c.mean_rank_shift}</td>
                    <td style={{ textAlign: 'right', color: c.survival_change_pct > 0 ? 'var(--success)' : c.survival_change_pct < 0 ? 'var(--danger)' : 'inherit' }}>
                      {c.survival_change_pct > 0 ? '+' : ''}{c.survival_change_pct}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {c.age_shift_years > 0 ? '+' : ''}{c.age_shift_years}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: c.top_k_churn_pct > 50 ? '700' : '400' }}>
                      {c.top_k_churn_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

const FairnessGroup = ({ title, data, color }) => (
  <div style={{
    padding: '10px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: data.flagged ? '#fff5f5' : 'var(--surface)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <strong style={{ fontSize: '12px', color }}>{title}</strong>
      <span style={{
        padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
        background: data.flagged ? '#ffe6e6' : '#e6f7ed',
        color: data.flagged ? '#c5371f' : '#0a8043',
      }}>
        max Δ {data.max_dev_pp}pp {data.flagged ? '🚩' : '✓'}
      </span>
    </div>
    <table style={{ width: '100%', fontSize: '11px' }}>
      <thead>
        <tr style={{ color: 'var(--text3)' }}>
          <th style={{ textAlign: 'left' }}>Bucket</th>
          <th style={{ textAlign: 'right' }}>Pool</th>
          <th style={{ textAlign: 'right' }}>Top-K</th>
          <th style={{ textAlign: 'right' }}>Δ pp</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map(r => (
          <tr key={r.bucket}>
            <td>{r.bucket}</td>
            <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{r.pool_pct}%</td>
            <td style={{ textAlign: 'right', fontWeight: '600' }}>{r.top_pct}%</td>
            <td style={{
              textAlign: 'right',
              color: Math.abs(r.deviation_pp) > 15 ? '#c5371f' : Math.abs(r.deviation_pp) > 5 ? '#a65a00' : 'var(--text3)',
              fontWeight: Math.abs(r.deviation_pp) > 5 ? '700' : '500',
              fontFamily: 'monospace',
            }}>
              {r.deviation_pp > 0 ? '+' : ''}{r.deviation_pp}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SummaryCard = ({ label, value, sub, accent }) => (
  <div className="card" style={{ borderTop: accent ? `3px solid ${accent}` : '3px solid transparent', padding: '12px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: accent || 'var(--text)' }}>{value}</div>
    {sub && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{sub}</div>}
  </div>
);

// PDF export
const renderReportHtml = ({ runId, k, threshold, report, sensitivity }) => {
  const groupHtml = (title, g) => `
    <h3 style="margin-bottom:6px">${title} ${g.flagged ? '🚩' : '✓'} <small style="font-weight:normal;color:#666">max Δ ${g.max_dev_pp}pp</small></h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px">
      <thead><tr style="background:#f0f0f0"><th>Bucket</th><th>Pool count</th><th>Pool %</th><th>Top-K count</th><th>Top-K %</th><th>Deviation (pp)</th></tr></thead>
      <tbody>
        ${g.rows.map(r => `<tr><td>${r.bucket}</td><td>${r.pool_count}</td><td>${r.pool_pct}%</td><td>${r.top_count}</td><td>${r.top_pct}%</td><td>${r.deviation_pp}</td></tr>`).join('')}
      </tbody>
    </table>`;

  const sensHtml = (sensitivity?.comparisons?.length ?? 0) > 0
    ? `<h2>Sensitivity Analysis</h2>
       <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px">
         <thead><tr style="background:#f0f0f0"><th>Sim #</th><th>Weights</th><th>Mean rank Δ</th><th>Max rank Δ</th><th>Survival Δ%</th><th>Age Δ yrs</th><th>Top-K churn %</th></tr></thead>
         <tbody>
           ${sensitivity.comparisons.map(c => `<tr>
             <td>#${c.simulation_run_id}</td>
             <td>${Object.entries(c.simulation_weights || {}).map(([k,v]) => `${k}=${v}`).join(', ')}</td>
             <td>${c.mean_rank_shift}</td><td>${c.max_rank_shift}</td>
             <td>${c.survival_change_pct}</td><td>${c.age_shift_years}</td><td>${c.top_k_churn_pct}%</td>
           </tr>`).join('')}
         </tbody>
       </table>` : '<p style="color:#666;font-style:italic">No simulations against this run.</p>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fairness Report — Run #${runId}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #222; }
  h1 { border-bottom: 2px solid #1a5c9e; padding-bottom: 8px; }
  h2 { color: #1a5c9e; margin-top: 24px; }
  .meta { background:#f5f5f5; padding:12px; border-radius:4px; margin-bottom:18px; font-size:12px }
  .flagged { background:#ffe6e6; padding:10px; border-left:4px solid #c5371f; margin-bottom:18px }
  .ok { background:#e6f7ed; padding:10px; border-left:4px solid #0eb07a; margin-bottom:18px }
</style></head><body>
  <h1>ODCAT — Fairness & Sensitivity Report</h1>
  <div class="meta">
    <strong>Run:</strong> #${runId} ·
    <strong>Top-K:</strong> ${k} ·
    <strong>Threshold:</strong> ±${threshold}pp ·
    <strong>Pool size:</strong> ${report.pool_size} ·
    <strong>Generated:</strong> ${new Date().toLocaleString()}
  </div>
  <div class="${report.flagged ? 'flagged' : 'ok'}">
    <strong>${report.flagged ? '🚩 Bias detected — at least one distribution exceeds the threshold' : '✓ No significant bias detected'}</strong>
  </div>
  <h2>Fairness Index</h2>
  ${groupHtml('Age Distribution', report.age_groups)}
  ${groupHtml('Gender Distribution', report.gender)}
  ${groupHtml('Urgency Bands', report.urgency_band)}
  ${sensHtml}
</body></html>`;
};

export default FairnessLab;
