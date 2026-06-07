import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { subscribeRealtime, onReconnect } from '../realtime/socket.js';

function formatWhen(iso, tz = 'Asia/Kolkata') {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
}

function ScheduleCard({ row, onStatus, busy }) {
  const tz = row.location?.timezone || 'Asia/Kolkata';
  const canCheckIn = row.status === 'CONFIRMED';
  const canStart = row.status === 'CHECKED_IN';
  const canComplete = ['CHECKED_IN', 'IN_PROGRESS'].includes(row.status);
  const canNoShow = ['CONFIRMED', 'CHECKED_IN'].includes(row.status);
  const [manageLink, setManageLink] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  async function copyManageLink() {
    setLinkBusy(true);
    try {
      let url = manageLink;
      if (!url) {
        const { data } = await api.get(`/scheduling/appointments/${row.id}/manage-link`);
        url = data?.url || '';
        setManageLink(url);
      }
      if (url) {
        await navigator.clipboard.writeText(url);
      }
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="text-lg font-bold text-slate-900 dark:text-white">
        {formatWhen(row.startAt, tz)}
      </div>
      <div className="text-sm font-medium mt-1">{row.service?.name || 'Appointment'}</div>
      <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 space-y-0.5">
        <div>{row.customer?.name || 'Customer'}</div>
        {row.customer?.phone && (
          <a href={`tel:${row.customer.phone}`} className="text-brand-600 text-xs font-semibold">
            {row.customer.phone}
          </a>
        )}
        <div>{row.location?.name || '—'}</div>
        <div className="font-mono text-xs">{row.appointmentNumber}</div>
      </div>
      <div className="mt-3 inline-flex rounded-full bg-brand-50 text-brand-800 dark:bg-brand-900/40 px-2.5 py-0.5 text-xs font-semibold">
        {row.status}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/scheduling?tab=appointments&appt=${encodeURIComponent(row.id)}`}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-brand-600"
        >
          Full details
        </Link>
        <button
          type="button"
          disabled={linkBusy}
          onClick={copyManageLink}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {linkBusy ? '…' : 'Copy customer link'}
        </button>
      </div>
      {(canCheckIn || canStart || canComplete || canNoShow) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canCheckIn && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus(row.id, 'CHECKED_IN')}
              className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Check in
            </button>
          )}
          {canStart && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus(row.id, 'IN_PROGRESS')}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Start
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus(row.id, 'COMPLETED')}
              className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Complete
            </button>
          )}
          {canNoShow && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus(row.id, 'NO_SHOW')}
              className="rounded-lg border border-red-200 text-red-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              No-show
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function StaffSchedule() {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [linkedProfile, setLinkedProfile] = useState(null);
  const [today, setToday] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadStaff = useCallback(async () => {
    try {
      const { data } = await api.get('/scheduling/staff');
      const rows = Array.isArray(data) ? data : [];
      setStaff(rows);
      const mine = rows.find((s) => s.user?.id === user?.id);
      if (mine) {
        setLinkedProfile(mine);
        setStaffId(mine.id);
      } else {
        setStaffId((prev) => prev || rows[0]?.id || '');
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load staff');
    }
  }, [user?.id]);

  const loadSchedule = useCallback(async (id, isLinked) => {
    if (!id) {
      setToday([]);
      setUpcoming([]);
      return;
    }
    setLoading(true);
    try {
      const base = isLinked ? '/scheduling/staff/me' : `/scheduling/staff/${id}`;
      const [todayRes, upcomingRes] = await Promise.all([
        api.get(`${base}/schedule/today`),
        api.get(`${base}/schedule/upcoming`, { params: { days: 7 } }),
      ]);
      setToday(Array.isArray(todayRes.data) ? todayRes.data : []);
      setUpcoming(Array.isArray(upcomingRes.data) ? upcomingRes.data : []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    if (staffId) void loadSchedule(staffId, linkedProfile?.id === staffId);
  }, [staffId, linkedProfile?.id, loadSchedule]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (staffId) void loadSchedule(staffId, linkedProfile?.id === staffId);
    }, 60000);
    return () => clearInterval(interval);
  }, [staffId, linkedProfile?.id, loadSchedule]);

  useEffect(() => {
    const unsub = subscribeRealtime((evt) => {
      if (evt?.type?.startsWith('appointment_') && staffId) {
        void loadSchedule(staffId, linkedProfile?.id === staffId);
      }
    });
    const unsubRc = onReconnect(() => {
      if (staffId) void loadSchedule(staffId, linkedProfile?.id === staffId);
    });
    return () => {
      unsub();
      unsubRc();
    };
  }, [staffId, linkedProfile?.id, loadSchedule]);

  async function updateStatus(appointmentId, status) {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/scheduling/appointments/${appointmentId}/status`, { status });
      await loadSchedule(staffId, linkedProfile?.id === staffId);
    } catch (e) {
      setError(e.response?.data?.error || 'Status update failed');
    } finally {
      setBusy(false);
    }
  }

  const todayIds = new Set(today.map((r) => r.id));
  const upcomingOnly = upcoming.filter((r) => !todayIds.has(r.id));

  return (
    <div className="space-y-5 max-w-lg mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My schedule</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Today and upcoming — check in, complete, or open full appointment details.
        </p>
        {linkedProfile && staffId === linkedProfile.id && (
          <p className="text-xs text-brand-600 mt-1">Showing your linked staff profile</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
      )}

      {staff.length > 1 && (
        <select
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-base font-medium"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.user?.email ? ` (${s.user.email})` : ''}
            </option>
          ))}
        </select>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm">Loading…</div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Today</h2>
            {today.length ? today.map((row) => (
              <ScheduleCard key={row.id} row={row} onStatus={updateStatus} busy={busy} />
            )) : (
              <p className="text-sm text-slate-500">No appointments today.</p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Next 7 days</h2>
            {upcomingOnly.length ? upcomingOnly.map((row) => (
              <ScheduleCard key={row.id} row={row} onStatus={updateStatus} busy={busy} />
            )) : (
              <p className="text-sm text-slate-500">Nothing else this week.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
