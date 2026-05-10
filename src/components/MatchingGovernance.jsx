import { useEffect, useState } from 'react';
import {
  getCompatibilityMatrixViaAPI,
  getHospitalDistancesViaAPI,
  getOverrideStatsViaAPI,
  getAllocationDecisionsViaAPI,
} from '../utils/api';
import { toast } from '../utils/toast';
import Pagination, { usePagination } from './Pagination';

const TABS = [
  { id: 'compat',     label: '🩸 Blood Compatibility' },
  { id: 'distances',  label: '📍 Hospital Distances' },
  { id: 'overrides',  label: '🛡 Override Analytics' },
];

const MatchingGovernance = ({ currentUser }) => {
  const [tab, setTab] = useState('compat');

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #7c5cbf 0%, #9d7be0 100%)',
        color: 'white', padding: '16px 20px', borderRadius: 'var(--radius)', marginBottom: '20px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: '700' }}>🩸 Matching & Override Governance</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
          DB-backed compatibility rules, Haversine distance map, and override accountability analytics
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: '-2px', cursor: 'pointer', fontSize: '13px',
              fontWeight: tab === t.id ? '600' : '500',
              color: tab === t.id ? 'var(--primary)' : 'var(--text2)',
              whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'compat'    && <CompatibilityPanel />}
      {tab === 'distances' && <HospitalDistancesPanel />}
      {tab === 'overrides' && <OverrideAnalyticsPanel />}
    </div>
  );
};

// ============================================================
// 1. Blood Compatibility Matrix
// ============================================================
const CompatibilityPanel = () => {
  const [matrix, setMatrix] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCompatibilityMatrixViaAPI()
      .then(r => setMatrix(r.data || []))
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '20px', color: 'var(--text2)' }}>Loading compatibility matrix…</div>;

  const types = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
  const map = {};
  matrix.forEach(m => { map[`${m.donor_blood_type}|${m.recipient_blood_type}`] = m.compatible; });

  const compatibleCount = matrix.filter(m => m.compatible).length;
  const totalCount      = matrix.length;

  return (
    <div>
      <div className="card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Stat label="Total Pairs" value={totalCount} />
          <Stat label="Compatible Pairs" value={compatibleCount} accent="#0eb07a" />
          <Stat label="Incompatible Pairs" value={totalCount - compatibleCount} accent="#c5371f" />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">ABO Compatibility Matrix</div>
          <div className="card-sub">Single source of truth — all allocation runs read from this table</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: '500px' }}>
            <thead>
              <tr>
                <th style={{ background: 'var(--surface2)' }}>Donor ↓ / Recipient →</th>
                {types.map(t => (
                  <th key={t} style={{ textAlign: 'center', background: 'var(--surface2)' }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map(donor => (
                <tr key={donor}>
                  <td style={{ fontWeight: '700', background: 'var(--surface2)' }}>{donor}</td>
                  {types.map(rec => {
                    const compatible = map[`${donor}|${rec}`];
                    return (
                      <td key={rec} style={{
                        textAlign: 'center', fontSize: '14px',
                        background: compatible ? '#d1f5e0' : '#ffe6e6',
                        color: compatible ? '#0a8043' : '#c5371f',
                        fontWeight: '600',
                      }}>
                        {compatible ? '✓' : '✕'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
          ✓ = compatible donor → recipient · ✕ = incompatible · O− is universal donor · AB+ is universal recipient
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 2. Hospital Distance Map (Haversine, local computation, no API)
// ============================================================
const HospitalDistancesPanel = () => {
  const [data, setData] = useState({ hospitals: [], distances: [] });
  const [loading, setLoading] = useState(true);
  const distPg = usePagination(data.distances || [], 20);

  useEffect(() => {
    getHospitalDistancesViaAPI()
      .then(r => setData(r || { hospitals: [], distances: [] }))
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '20px', color: 'var(--text2)' }}>Loading distance map…</div>;

  const urban = data.hospitals.filter(h => h.city_type === 'urban').length;
  const rural = data.hospitals.filter(h => h.city_type === 'rural').length;

  return (
    <div>
      <div className="card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Stat label="Hospitals on Map" value={data.hospitals.length} />
          <Stat label="Urban" value={urban} accent="#1a5c9e" />
          <Stat label="Rural" value={rural} accent="#0eb07a" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="card-header">
          <div className="card-title">Registered Hospital Coordinates</div>
          <div className="card-sub">Manually stored lat/lng · used by the Haversine formula (no external geo API)</div>
        </div>
        {data.hospitals.length === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text3)', textAlign: 'center' }}>
            No hospital coordinates stored yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
            {data.hospitals.map(h => (
              <div key={h.id} style={{ padding: '12px', background: 'var(--surface2)', borderRadius: '6px' }}>
                <strong style={{ fontSize: '13px' }}>{h.name}</strong>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
                  📍 {h.city} ({h.city_type})<br/>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                    {h.latitude}°, {h.longitude}°
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Pairwise Distance Matrix (Haversine)</div>
          <div className="card-sub">Computed locally — used to inform override decisions where geography matters</div>
        </div>
        {data.distances.length === 0 ? (
          <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic' }}>
            Need at least 2 hospitals with coordinates to compute pairwise distances. Currently {data.hospitals.length} on map.
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '420px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th style={{ textAlign: 'right' }}>Distance (km)</th>
                </tr>
              </thead>
              <tbody>
                {distPg.slice.map((d, i) => (
                  <tr key={i}>
                    <td>
                      {d.from}<br/>
                      <span style={{ color: 'var(--text3)', fontSize: '11px' }}>{d.from_city}</span>
                    </td>
                    <td>
                      {d.to}<br/>
                      <span style={{ color: 'var(--text3)', fontSize: '11px' }}>{d.to_city}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '700', fontFamily: 'monospace' }}>
                      {d.km?.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={distPg.page} setPage={distPg.setPage} totalPages={distPg.totalPages} total={distPg.total} pageSize={distPg.pageSize} label="pairs" />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// 3. Override Analytics
// ============================================================
const OverrideAnalyticsPanel = () => {
  const [stats, setStats] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getOverrideStatsViaAPI(), getAllocationDecisionsViaAPI()])
      .then(([s, d]) => { setStats(s); setDecisions(d.data || []); })
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const recentForPg = stats?.recent || [];
  const recentPg = usePagination(recentForPg, 10);

  if (loading) return <div style={{ padding: '20px', color: 'var(--text2)' }}>Loading override analytics…</div>;
  if (!stats) return null;

  const { summary, top_users, by_organ, recent } = stats;
  const overrideColor = summary.override_pct > 30 ? '#c5371f' : summary.override_pct > 15 ? '#a65a00' : '#0a8043';
  const overrideLabel = summary.override_pct > 30 ? 'Elevated' : summary.override_pct > 15 ? 'Moderate' : 'Low';

  return (
    <div>
      <div className="card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <Stat label="Total Decisions" value={summary.total_decisions} />
          <Stat label="Confirmed Rank-1" value={summary.total_decisions - summary.overrides} accent="#0eb07a" />
          <Stat label="Overrides" value={summary.overrides} accent="#e8900a" />
          <Stat label={`Override % · ${overrideLabel}`} value={`${summary.override_pct}%`} accent={overrideColor} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Top Overriding Users</div>
            <div className="card-sub">Users ranked by override count for this hospital</div>
          </div>
          {top_users.length === 0 ? (
            <div style={{ padding: '12px', color: 'var(--text3)' }}>No overrides recorded.</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>User</th><th>Role</th><th style={{ textAlign: 'right' }}>Overrides</th></tr>
              </thead>
              <tbody>
                {top_users.map(u => (
                  <tr key={u.decided_by}>
                    <td>{u.decider?.name || '—'}</td>
                    <td><span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{u.decider?.role}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: '700' }}>{u.override_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Override Trend by Organ</div>
            <div className="card-sub">Breakdown of overrides per organ type</div>
          </div>
          {by_organ.length === 0 ? (
            <div style={{ padding: '12px', color: 'var(--text3)' }}>No decisions yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Organ</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Overrides</th>
                  <th style={{ textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {by_organ.map(o => (
                  <tr key={o.organ}>
                    <td style={{ textTransform: 'capitalize' }}>{o.organ}</td>
                    <td style={{ textAlign: 'right' }}>{o.total}</td>
                    <td style={{ textAlign: 'right' }}>{o.overrides}</td>
                    <td style={{ textAlign: 'right', fontWeight: '600',
                      color: o.override_pct > 30 ? '#c5371f' : o.override_pct > 15 ? '#a65a00' : 'var(--text2)' }}>
                      {o.override_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Overrides — full justifications</div>
          <div className="card-sub">Permanent audit trail. Every override reason ≥ 20 chars, immutable.</div>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: '12px', color: 'var(--text3)' }}>No overrides yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {recentPg.slice.map(d => (
              <div key={d.id} style={{
                padding: '12px',
                background: 'var(--surface2)',
                borderRadius: '6px',
                borderLeft: '3px solid #e8900a',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', flexWrap: 'wrap', gap: '6px' }}>
                  <span>
                    <strong>{d.decider?.name}</strong> overrode → picked <strong>rank #{d.selected_rank}</strong> ({d.recipient?.name}) for {d.run?.organ}
                  </span>
                  <span style={{ color: 'var(--text3)' }}>{new Date(d.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--text2)', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                  "{d.override_reason}"
                </div>
              </div>
            ))}
            <Pagination page={recentPg.page} setPage={recentPg.setPage} totalPages={recentPg.totalPages} total={recentPg.total} pageSize={recentPg.pageSize} label="overrides" />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Stat card
// ============================================================
const Stat = ({ label, value, accent }) => (
  <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: '6px', borderLeft: accent ? `3px solid ${accent}` : 'none' }}>
    <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: accent || 'var(--text)' }}>{value}</div>
  </div>
);

export default MatchingGovernance;
