import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bookSurgeryViaAPI,
  createSurgicalResourceViaAPI,
  getApprovalsViaAPI,
  getOrgansViaAPI,
  getSurgeryCalendarViaAPI,
  getSurgeryUtilizationViaAPI,
  getSurgicalResourcesViaAPI,
  updateSurgeryBookingViaAPI,
  updateSurgicalResourceViaAPI,
} from '../utils/api';
import { formatOrgan } from '../utils/organs';
import { toast } from '../utils/toast';
import HelpPanel from './HelpPanel';

const BOOKING_META = {
  scheduled:   { label: 'Scheduled',   color: '#1a5c9e' },
  in_progress: { label: 'In Progress', color: '#e8900a' },
  completed:   { label: 'Completed',   color: '#0eb07a' },
  cancelled:   { label: 'Cancelled',   color: '#8494a8' },
};

const RESOURCE_META = {
  theatre: { label: 'Theatre',  plural: 'Theatres',  icon: '🏥', color: '#1a5c9e' },
  surgeon: { label: 'Surgeon',  plural: 'Surgeons',  icon: '👨‍⚕️', color: '#7c5cbf' },
  icu_bed: { label: 'ICU Bed',  plural: 'ICU Beds',  icon: '🛏', color: '#0d7d8f' },
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const humanMins = (m) => {
  if (m === null || m === undefined) return '—';
  const h = Math.floor(m / 60);
  return h < 1 ? `${m}m` : h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};

const SummaryCard = ({ label, value, sub, accent }) => (
  <div className="card" style={{ padding: '12px 14px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
    <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '4px', color: accent || 'var(--text1)' }}>{value}</div>
    {sub && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{sub}</div>}
  </div>
);

/**
 * Module 9 — Surgery Scheduling & Resource Allocation.
 *
 * Booking conflicts are decided entirely by the API, which serialises competing
 * requests with row locks before checking for overlaps. This page never tries to
 * predict availability from cached data — it submits and renders whatever
 * conflict comes back, because only the server can answer that question safely.
 */
const SurgerySchedule = ({ currentUser }) => {
  const [tab, setTab] = useState('calendar');
  const [month, setMonth] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [resources, setResources] = useState([]);
  const [utilization, setUtilization] = useState(null);
  const [utilDays, setUtilDays] = useState(30);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [booking, setBooking] = useState(null);       // booking detail panel
  const [showBook, setShowBook] = useState(null);     // prefill date for the modal
  const [showResources, setShowResources] = useState(false);
  const [busy, setBusy] = useState(false);

  const canWrite = ['hospital', 'admin'].includes(currentUser?.role) && !readOnly;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cal, res] = await Promise.all([
        getSurgeryCalendarViaAPI(month),
        getSurgicalResourcesViaAPI(),
      ]);
      setCalendar(cal);
      setResources(res.data || []);
      setReadOnly(!!cal.read_only);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'analytics') return;
    getSurgeryUtilizationViaAPI(utilDays).then(setUtilization).catch(e => toast(e.message, 'error'));
  }, [tab, utilDays]);

  const byType = useMemo(() => ({
    theatre: resources.filter(r => r.type === 'theatre'),
    surgeon: resources.filter(r => r.type === 'surgeon'),
    icu_bed: resources.filter(r => r.type === 'icu_bed'),
  }), [resources]);

  const hasCapacity = byType.theatre.some(r => r.is_active) && byType.surgeon.some(r => r.is_active);

  const changeStatus = async (id, status, reason = null) => {
    setBusy(true);
    try {
      const r = await updateSurgeryBookingViaAPI(id, status, reason);
      setBooking(r.data);
      toast(`Booking ${BOOKING_META[status].label.toLowerCase()}`, 'success');
      load();
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #6b4bb0 0%, #8a68d4 100%)',
        color: 'white', padding: '16px 20px', borderRadius: 'var(--radius)', marginBottom: '16px',
      }}>
        <div style={{ fontSize: '16px', fontWeight: '700' }}>🗓 Surgery Scheduling & Resources</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '3px' }}>
          Conflict-free booking · monthly calendar · theatre, ICU and surgeon utilization
        </div>
      </div>

      <HelpPanel title="How scheduling works">
        <p><strong>What a booking reserves:</strong> an operating theatre and a surgeon for the surgical window, and optionally an ICU bed for a recovery window that begins when surgery ends. The ICU bed is held for far longer than the theatre, which is why a bed can be the thing that blocks an otherwise free slot.</p>

        <p style={{ marginTop: '8px' }}><strong>Why double-booking cannot happen:</strong> the obvious way to write this — check whether the slot is free, then insert — is unsafe. Two coordinators booking the same theatre at the same instant would both see a free slot and both write, and the database would end up with two surgeries in one room. Instead, every booking takes an exclusive database lock on the specific resources it wants <em>before</em> checking availability. A second request for the same theatre waits until the first finishes, then correctly sees it as taken. The lock is per-resource, so bookings for different theatres never wait on each other.</p>

        <p style={{ marginTop: '8px' }}><strong>Back-to-back slots are allowed.</strong> A theatre freed at 13:00 can be booked from 13:00. Only genuinely overlapping windows conflict.</p>

        <p style={{ marginTop: '8px' }}><strong>Cancelling frees the resources immediately</strong> — a cancelled booking stops blocking its slot. Completing a surgery that is linked to an organ also closes that organ's cold chain automatically, so the two modules cannot drift out of step.</p>

        <p style={{ marginTop: '8px' }}><strong>Utilization</strong> is booked time ÷ available time. Available time is an assumption, not a measurement: 12h/day per theatre, 8h/day per surgeon, 24h/day per ICU bed. Those are configurable, and the figures below state which were used.</p>
      </HelpPanel>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'calendar', label: '🗓 Calendar' },
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
            {loading ? '⏳ Loading…' : readOnly ? '👁 Read-only' : `${resources.filter(r => r.is_active).length} active resources`}
          </span>
          {canWrite && (
            <>
              <button className="btn btn-outline" style={{ fontSize: '12px', padding: '5px 11px' }}
                onClick={() => setShowResources(true)}>⚙ Resources</button>
              <button className="btn btn-primary" style={{ fontSize: '12px', padding: '5px 11px' }}
                disabled={!hasCapacity}
                title={hasCapacity ? '' : 'Add at least one active theatre and one surgeon first'}
                onClick={() => setShowBook(new Date().toISOString().slice(0, 10))}>+ Schedule surgery</button>
            </>
          )}
        </div>
      </div>

      {canWrite && !hasCapacity && (
        <div style={{
          padding: '11px 15px', borderRadius: '8px', marginBottom: '14px',
          background: '#fff8ec', border: '1px solid #f0d9a8', color: '#8a6100', fontSize: '13px',
        }}>
          <strong>No bookable capacity yet.</strong> Add at least one active theatre and one surgeon under
          {' '}<button onClick={() => setShowResources(true)} style={{
            background: 'none', border: 'none', padding: 0, color: '#1a5c9e', textDecoration: 'underline',
            cursor: 'pointer', fontSize: '13px',
          }}>⚙ Resources</button> before scheduling.
        </div>
      )}

      {tab === 'calendar' && calendar && (
        <>
          <div className="card" style={{ marginBottom: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={() => setMonth(calendar.prev)}>← Prev</button>
            <div style={{ fontSize: '14px', fontWeight: '700', minWidth: '150px', textAlign: 'center' }}>{calendar.label}</div>
            <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={() => setMonth(calendar.next)}>Next →</button>
            <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={() => setMonth(null)}>Today</button>
            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text3)' }}>
              {calendar.total} booking{calendar.total === 1 ? '' : 's'} this view
            </div>
          </div>

          <div className="card" style={{ padding: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
              {WEEKDAYS.map(d => (
                <div key={d} style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textAlign: 'center', padding: '4px' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {calendar.days.map(day => (
                <div
                  key={day.date}
                  onClick={() => setSelectedDay(day)}
                  style={{
                    minHeight: '92px', padding: '5px 6px', borderRadius: '6px', cursor: 'pointer',
                    border: `1px solid ${day.is_today ? 'var(--accent)' : 'var(--border)'}`,
                    background: !day.in_month ? 'var(--surface2)' : selectedDay?.date === day.date ? 'var(--accent-light)' : 'transparent',
                    opacity: day.in_month ? 1 : 0.5,
                  }}
                >
                  <div style={{
                    fontSize: '11px', fontWeight: day.is_today ? '700' : '500',
                    color: day.is_today ? 'var(--accent)' : 'var(--text2)', marginBottom: '3px',
                  }}>
                    {new Date(day.date + 'T00:00:00').getDate()}
                  </div>
                  {day.bookings.slice(0, 3).map(b => (
                    <div
                      key={b.id}
                      onClick={e => { e.stopPropagation(); setBooking(b); }}
                      title={`${hhmm(b.scheduled_start)} · ${b.theatre?.name} · ${b.surgeon?.name}`}
                      style={{
                        fontSize: '10px', padding: '1px 4px', borderRadius: '3px', marginBottom: '2px',
                        background: `${BOOKING_META[b.status].color}22`,
                        color: BOOKING_META[b.status].color,
                        borderLeft: `2px solid ${BOOKING_META[b.status].color}`,
                        textDecoration: b.status === 'cancelled' ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {hhmm(b.scheduled_start)} {b.theatre?.code || ''}
                    </div>
                  ))}
                  {day.bookings.length > 3 && (
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>+{day.bookings.length - 3} more</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedDay && (
            <div className="card" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700' }}>
                  {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  {canWrite && hasCapacity && (
                    <button className="btn btn-primary" style={{ fontSize: '12px', padding: '4px 10px' }}
                      onClick={() => setShowBook(selectedDay.date)}>+ Book this day</button>
                  )}
                  <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => setSelectedDay(null)}>✕</button>
                </div>
              </div>
              {selectedDay.bookings.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text3)' }}>Nothing scheduled.</div>
              ) : (
                <div className="table-wrap">
                  <table style={{ fontSize: '12.5px' }}>
                    <thead><tr><th>Time</th><th>Theatre</th><th>Surgeon</th><th>ICU bed</th><th>Recipient</th><th>Organ</th><th>Status</th></tr></thead>
                    <tbody>
                      {selectedDay.bookings.map(b => (
                        <tr key={b.id} onClick={() => setBooking(b)} style={{ cursor: 'pointer' }}>
                          <td>{hhmm(b.scheduled_start)}–{hhmm(b.scheduled_end)}</td>
                          <td>{b.theatre?.name || '—'}</td>
                          <td>{b.surgeon?.name || '—'}</td>
                          <td>{b.icu_bed?.name || <span style={{ color: 'var(--text3)' }}>none</span>}</td>
                          <td>{b.recipient?.name || '—'}</td>
                          <td>{b.organ ? `${b.organ.reference}` : '—'}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                              background: `${BOOKING_META[b.status].color}1e`, color: BOOKING_META[b.status].color,
                            }}>{BOOKING_META[b.status].label}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {booking && (
            <BookingDetail
              b={booking} busy={busy} canWrite={canWrite}
              onClose={() => setBooking(null)}
              onStatus={changeStatus}
            />
          )}
        </>
      )}

      {tab === 'analytics' && (
        <UtilizationTab utilization={utilization} days={utilDays} setDays={setUtilDays} />
      )}

      {showBook && (
        <BookSurgeryModal
          date={showBook}
          resources={byType}
          onClose={() => setShowBook(null)}
          onDone={() => { setShowBook(null); load(); }}
        />
      )}

      {showResources && (
        <ResourcesModal
          resources={resources}
          canWrite={canWrite}
          onClose={() => setShowResources(false)}
          onChanged={load}
        />
      )}
    </div>
  );
};

const BookingDetail = ({ b, busy, canWrite, onClose, onStatus }) => {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const meta = BOOKING_META[b.status];
  const terminal = b.status === 'completed' || b.status === 'cancelled';

  return (
    <div className="card" style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '700' }}>
            Booking #{b.id}{' '}
            <span style={{
              padding: '2px 9px', borderRadius: '10px', fontSize: '11px',
              background: `${meta.color}1e`, color: meta.color,
            }}>{meta.label}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '3px' }}>
            {new Date(b.scheduled_start).toLocaleString()} – {hhmm(b.scheduled_end)} ({humanMins(b.duration_minutes)})
          </div>
        </div>
        <button className="btn btn-outline" onClick={onClose} style={{ padding: '4px 10px', fontSize: '12px' }}>✕ Close</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        {[
          ['Theatre', b.theatre?.name],
          ['Surgeon', b.surgeon?.name],
          ['ICU bed', b.icu_bed ? `${b.icu_bed.name} · until ${b.icu_until ? new Date(b.icu_until).toLocaleString() : '—'}` : 'Not reserved'],
          ['Recipient', b.recipient?.name],
          ['Organ', b.organ ? `${b.organ.reference} (${formatOrgan(b.organ.organ_type)})` : null],
          ['Approval case', b.case_approval_id ? `#${b.case_approval_id}` : null],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase' }}>{k}</div>
            <div style={{ fontSize: '12.5px', fontWeight: '500' }}>{v}</div>
          </div>
        ))}
      </div>

      {b.notes && (
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
          <strong>Notes:</strong> {b.notes}
        </div>
      )}

      {b.cancel_reason && (
        <div style={{
          padding: '9px 12px', borderRadius: '6px', fontSize: '12.5px', marginBottom: '12px',
          background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
        }}>
          <strong>Cancelled:</strong> {b.cancel_reason}
        </div>
      )}

      {canWrite && !terminal && (
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          {b.status === 'scheduled' && (
            <button className="btn btn-outline" style={{ fontSize: '12.5px' }} disabled={busy}
              onClick={() => onStatus(b.id, 'in_progress')}>▶ Mark in progress</button>
          )}
          <button className="btn btn-primary" style={{ fontSize: '12.5px' }} disabled={busy}
            onClick={() => onStatus(b.id, 'completed')}>✓ Mark completed</button>
          <button className="btn btn-outline" style={{ fontSize: '12.5px', color: '#c5371f', borderColor: '#e8b5ab' }}
            disabled={busy} onClick={() => setCancelOpen(o => !o)}>✕ Cancel</button>
        </div>
      )}

      {b.organ && !terminal && (
        <div style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '8px' }}>
          Marking this completed also records {b.organ.reference} as transplanted and stops its cold-ischemia clock.
        </div>
      )}

      {cancelOpen && (
        <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #e8b5ab', borderRadius: '6px', background: '#fdf7f6' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8f2716' }}>Reason for cancellation</div>
          <textarea className="form-input" rows={2} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Why is this surgery being cancelled? The theatre, surgeon and ICU bed are freed immediately."
            style={{ width: '100%', fontSize: '12px', resize: 'vertical' }} disabled={busy} />
          <button className="btn btn-primary" style={{ fontSize: '12.5px', marginTop: '7px', background: '#c5371f', borderColor: '#c5371f' }}
            disabled={busy || reason.trim().length < 5}
            onClick={async () => {
              const ok = await onStatus(b.id, 'cancelled', reason);
              if (ok) { setCancelOpen(false); setReason(''); }
            }}>
            {busy ? '…' : 'Confirm cancellation'}
          </button>
        </div>
      )}
    </div>
  );
};

/** 9.3 — resource utilization analytics. */
const UtilizationTab = ({ utilization, days, setDays }) => {
  if (!utilization) return <div className="card" style={{ padding: '28px', textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>;

  const { by_type: byType, resources, bookings, assumptions, window } = utilization;

  const colorFor = (pct) => pct === null ? 'var(--text3)' : pct >= 85 ? '#c5371f' : pct >= 60 ? '#e8900a' : '#0eb07a';

  return (
    <>
      <div className="card" style={{ marginBottom: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Window:</span>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '4px 12px', borderRadius: '14px', fontSize: '12px', cursor: 'pointer',
            border: `1px solid ${days === d ? 'var(--accent)' : 'var(--border)'}`,
            background: days === d ? 'var(--accent)' : 'transparent',
            color: days === d ? 'white' : 'var(--text2)',
          }}>{d} days</button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '11.5px', color: 'var(--text3)' }}>
          {window.from} → {window.to} · {bookings.total} booking{bookings.total === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
        {Object.entries(RESOURCE_META).map(([type, meta]) => {
          const t = byType[type];
          return (
            <SummaryCard
              key={type}
              label={`${meta.icon} ${meta.plural} Utilization`}
              value={t.utilization === null ? '—' : `${t.utilization}%`}
              sub={t.count === 0
                ? 'none registered'
                : `${humanMins(t.used_minutes)} booked of ${humanMins(t.capacity_minutes)} · ${t.count} ${t.count === 1 ? meta.label.toLowerCase() : meta.plural.toLowerCase()}`}
              accent={colorFor(t.utilization)}
            />
          );
        })}
      </div>

      <HelpPanel title="What these percentages assume">
        <p>Utilization is <strong>booked minutes ÷ available minutes</strong> over the selected window. "Available" is an assumption about how much each resource could realistically be used, not a measurement:</p>
        <ul style={{ marginTop: '6px', paddingLeft: '20px' }}>
          <li><strong>Theatre</strong> — {assumptions.theatre_minutes_per_day} minutes/day ({Math.round(assumptions.theatre_minutes_per_day / 60)}h operating day)</li>
          <li><strong>Surgeon</strong> — {assumptions.surgeon_minutes_per_day} minutes/day ({Math.round(assumptions.surgeon_minutes_per_day / 60)}h shift)</li>
          <li><strong>ICU bed</strong> — {assumptions.icu_bed_minutes_per_day} minutes/day (beds are occupied around the clock)</li>
        </ul>
        <p style={{ marginTop: '8px' }}>Change these in <code>config/governance.php</code> under <code>capacity_minutes_per_day</code> to match how your hospital actually runs.</p>
        <p style={{ marginTop: '8px' }}><strong>High is not automatically good.</strong> A theatre above 85% has no slack for an emergency retrieval — which, in transplant work, is most of them. Read a red bar as "no room to absorb an urgent case", not as "efficient".</p>
      </HelpPanel>

      <div className="card">
        <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>Per-resource breakdown</div>
        {resources.length === 0 ? (
          <div style={{ fontSize: '12.5px', color: 'var(--text3)' }}>No active resources registered.</div>
        ) : (
          resources.map(r => (
            <div key={r.id} style={{ marginBottom: '9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span>{RESOURCE_META[r.type].icon} <strong>{r.name}</strong> <span style={{ color: 'var(--text3)' }}>({r.code})</span></span>
                <span style={{ color: 'var(--text3)' }}>
                  {humanMins(r.used_minutes)} of {humanMins(r.capacity_minutes)} · {r.utilization ?? 0}%
                </span>
              </div>
              <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, r.utilization ?? 0)}%`, height: '100%', background: colorFor(r.utilization) }} />
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
};

/** Booking form. Conflicts come back from the API and are rendered verbatim. */
const BookSurgeryModal = ({ date, resources, onClose, onDone }) => {
  const [theatreId, setTheatreId] = useState('');
  const [surgeonId, setSurgeonId] = useState('');
  const [icuBedId, setIcuBedId] = useState('');
  const [icuHours, setIcuHours] = useState(24);
  const [start, setStart] = useState(`${date}T09:00`);
  const [end, setEnd] = useState(`${date}T13:00`);
  const [organId, setOrganId] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [notes, setNotes] = useState('');
  const [organs, setOrgans] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [busy, setBusy] = useState(false);

  const active = (list) => list.filter(r => r.is_active);

  useEffect(() => {
    getOrgansViaAPI().then(r => setOrgans((r.data || []).filter(o => !o.is_terminal))).catch(() => {});
    getApprovalsViaAPI({ stage: 'approved', limit: 100 }).then(r => setApprovals(r.data || [])).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setConflicts([]);
    try {
      await bookSurgeryViaAPI({
        theatre_id: Number(theatreId),
        surgeon_id: Number(surgeonId),
        icu_bed_id: icuBedId ? Number(icuBedId) : null,
        icu_hours: icuBedId ? Number(icuHours) : null,
        scheduled_start: start.replace('T', ' ') + ':00',
        scheduled_end: end.replace('T', ' ') + ':00',
        organ_id: organId ? Number(organId) : null,
        case_approval_id: approvalId ? Number(approvalId) : null,
        notes: notes || null,
      });
      toast('Surgery scheduled', 'success');
      onDone();
    } catch (e) {
      // The API returns exactly which resource clashed and when — show that
      // rather than a generic failure, so the coordinator can pick another slot.
      if (e.conflicts) setConflicts(e.conflicts);
      toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  const valid = theatreId && surgeonId && start && end && new Date(end) > new Date(start);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto',
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '14px' }}>Schedule surgery</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label className="form-label">Start</label>
            <input type="datetime-local" className="form-input" value={start} onChange={e => setStart(e.target.value)}
              style={{ width: '100%' }} disabled={busy} />
          </div>
          <div>
            <label className="form-label">End</label>
            <input type="datetime-local" className="form-input" value={end} onChange={e => setEnd(e.target.value)}
              style={{ width: '100%' }} disabled={busy} />
          </div>
        </div>

        <label className="form-label">Theatre</label>
        <select className="form-input" value={theatreId} onChange={e => setTheatreId(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }} disabled={busy}>
          <option value="">Select a theatre…</option>
          {active(resources.theatre).map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
        </select>

        <label className="form-label">Surgeon</label>
        <select className="form-input" value={surgeonId} onChange={e => setSurgeonId(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }} disabled={busy}>
          <option value="">Select a surgeon…</option>
          {active(resources.surgeon).map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label className="form-label">ICU bed (optional)</label>
            <select className="form-input" value={icuBedId} onChange={e => setIcuBedId(e.target.value)}
              style={{ width: '100%' }} disabled={busy}>
              <option value="">— not reserved —</option>
              {active(resources.icu_bed).map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">ICU hours</label>
            <input type="number" min="1" max="720" className="form-input" value={icuHours}
              onChange={e => setIcuHours(e.target.value)} style={{ width: '100%' }} disabled={busy || !icuBedId} />
          </div>
        </div>
        {icuBedId && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '-4px', marginBottom: '10px' }}>
            The bed is held from the end of surgery for {icuHours}h, so it can block a later slot even when the theatre is free.
          </div>
        )}

        <label className="form-label">Approved case (optional)</label>
        <select className="form-input" value={approvalId} onChange={e => setApprovalId(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }} disabled={busy}>
          <option value="">— not linked —</option>
          {approvals.map(a => (
            <option key={a.id} value={a.id}>Case #{a.id} · {formatOrgan(a.organ)} · {a.recipient?.name || 'unknown'}</option>
          ))}
        </select>

        <label className="form-label">Organ (optional)</label>
        <select className="form-input" value={organId} onChange={e => setOrganId(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }} disabled={busy}>
          <option value="">— not linked —</option>
          {organs.map(o => (
            <option key={o.id} value={o.id}>{o.reference} · {formatOrgan(o.organ_type)} · {o.cold_chain.percent_used}% ischemia used</option>
          ))}
        </select>

        <label className="form-label">Notes</label>
        <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
          style={{ width: '100%', marginBottom: '12px', fontSize: '12px', resize: 'vertical' }} disabled={busy} />

        {conflicts.length > 0 && (
          <div style={{
            padding: '10px 12px', borderRadius: '6px', marginBottom: '12px',
            background: '#fdf3f1', border: '1px solid #e8b5ab', color: '#8f2716', fontSize: '12.5px',
          }}>
            <strong>That slot is not available:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {conflicts.map((c, i) => <li key={i}>{c.reason}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={busy} style={{ fontSize: '12.5px' }}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid} style={{ fontSize: '12.5px' }}>
            {busy ? 'Booking…' : 'Book slot'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Manage the hospital's theatres, ICU beds and surgeons. */
const ResourcesModal = ({ resources, canWrite, onClose, onChanged }) => {
  const [type, setType] = useState('theatre');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await createSurgicalResourceViaAPI({ type, name, code });
      toast(`${RESOURCE_META[type].label} added`, 'success');
      setName(''); setCode('');
      onChanged();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const toggle = async (r) => {
    setBusy(true);
    try {
      await updateSurgicalResourceViaAPI(r.id, { is_active: !r.is_active });
      onChanged();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '620px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700' }}>Surgical resources</div>
          <button className="btn btn-outline" onClick={onClose} style={{ padding: '3px 9px', fontSize: '12px' }}>✕</button>
        </div>

        {canWrite && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 0.9fr auto', gap: '8px', alignItems: 'end', marginBottom: '16px' }}>
            <div>
              <label className="form-label">Type</label>
              <select className="form-input" value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }} disabled={busy}>
                {Object.entries(RESOURCE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                placeholder={type === 'surgeon' ? 'Dr Sana Malik' : type === 'theatre' ? 'Theatre 1' : 'ICU Bed 1'}
                style={{ width: '100%' }} disabled={busy} />
            </div>
            <div>
              <label className="form-label">Code</label>
              <input className="form-input" value={code} onChange={e => setCode(e.target.value)}
                placeholder={type === 'surgeon' ? 'S1' : type === 'theatre' ? 'T1' : 'B1'}
                style={{ width: '100%' }} disabled={busy} />
            </div>
            <button className="btn btn-primary" onClick={add} disabled={busy || !name.trim() || !code.trim()}
              style={{ fontSize: '12.5px' }}>+ Add</button>
          </div>
        )}

        {Object.entries(RESOURCE_META).map(([t, meta]) => {
          const list = resources.filter(r => r.type === t);
          return (
            <div key={t} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: '700', marginBottom: '6px', color: meta.color }}>
                {meta.icon} {meta.plural} ({list.length})
              </div>
              {list.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>None registered.</div>
              ) : list.map(r => (
                <div key={r.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px',
                  marginBottom: '4px', fontSize: '12.5px', opacity: r.is_active ? 1 : 0.55,
                }}>
                  <span>
                    <strong>{r.name}</strong> <span style={{ color: 'var(--text3)' }}>({r.code})</span>
                    {!r.is_active && <span style={{ color: 'var(--text3)', fontSize: '11px' }}> · inactive</span>}
                  </span>
                  {canWrite && (
                    <button className="btn btn-outline" style={{ fontSize: '11px', padding: '2px 9px' }}
                      disabled={busy} onClick={() => toggle(r)}>
                      {r.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        <div style={{ fontSize: '11.5px', color: 'var(--text3)' }}>
          A resource with upcoming bookings cannot be deactivated — cancel or reschedule those first.
        </div>
      </div>
    </div>
  );
};

export default SurgerySchedule;
