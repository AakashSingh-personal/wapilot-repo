import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, Play, UserX, ExternalLink, Copy, Check,
  Calendar, Clock, MapPin, Hash, Phone, AlertCircle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { subscribeRealtime, onReconnect } from '../realtime/socket.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Select.jsx';
import { AppointmentStatusBadge } from '../components/ui/Badge.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';

function formatWhen(iso, tz = 'Asia/Kolkata') {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', timeZone: tz,
  });
}

function ScheduleCard({ row, onStatus, busy }) {
  const tz = row.location?.timezone || 'Asia/Kolkata';
  const canCheckIn  = row.status === 'CONFIRMED';
  const canStart    = row.status === 'CHECKED_IN';
  const canComplete = ['CHECKED_IN', 'IN_PROGRESS'].includes(row.status);
  const canNoShow   = ['CONFIRMED', 'CHECKED_IN'].includes(row.status);

  const [manageLink, setManageLink] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied]   = useState(false);

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
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={row.customer?.name || row.customer?.phone} size="md" />
        <div className="flex-1 min-w-0">
          {/* Time + status */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              {formatWhen(row.startAt, tz)}
            </div>
            <AppointmentStatusBadge status={row.status} />
          </div>

          {/* Service */}
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-1">
            {row.service?.name || 'Appointment'}
          </p>

          {/* Customer details */}
          <div className="mt-2 space-y-0.5">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {row.customer?.name || 'Customer'}
            </p>
            {row.customer?.phone && (
              <a
                href={`tel:${row.customer.phone}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
              >
                <Phone className="w-3 h-3" />
                {row.customer.phone}
              </a>
            )}
            {row.location?.name && (
              <p className="flex items-center gap-1 text-xs text-neutral-500">
                <MapPin className="w-3 h-3 shrink-0" />
                {row.location.name}
              </p>
            )}
            {row.appointmentNumber && (
              <p className="flex items-center gap-1 text-xs font-mono text-neutral-400">
                <Hash className="w-3 h-3 shrink-0" />
                {row.appointmentNumber}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={`/scheduling?tab=appointments&appt=${encodeURIComponent(row.id)}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 dark:border-neutral-700 text-brand-600 dark:text-brand-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Full details
        </Link>
        <Button
          variant="secondary" size="xs"
          loading={linkBusy}
          iconLeft={copied ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
          onClick={copyManageLink}
        >
          {copied ? 'Copied!' : 'Customer link'}
        </Button>
      </div>

      {(canCheckIn || canStart || canComplete || canNoShow) && (
        <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
          {canCheckIn && (
            <Button
              variant="secondary" size="xs"
              iconLeft={<CheckCircle2 className="w-3.5 h-3.5 text-brand-500" />}
              disabled={busy}
              onClick={() => onStatus(row.id, 'CHECKED_IN')}
            >
              Check in
            </Button>
          )}
          {canStart && (
            <Button
              variant="secondary" size="xs"
              iconLeft={<Play className="w-3.5 h-3.5 text-purple-500" />}
              disabled={busy}
              onClick={() => onStatus(row.id, 'IN_PROGRESS')}
            >
              Start
            </Button>
          )}
          {canComplete && (
            <Button
              variant="primary" size="xs"
              iconLeft={<CheckCircle2 className="w-3.5 h-3.5" />}
              disabled={busy}
              onClick={() => onStatus(row.id, 'COMPLETED')}
            >
              Complete
            </Button>
          )}
          {canNoShow && (
            <Button
              variant="ghost" size="xs"
              iconLeft={<UserX className="w-3.5 h-3.5 text-error-500" />}
              disabled={busy}
              onClick={() => onStatus(row.id, 'NO_SHOW')}
              className="text-error-600 dark:text-error-400"
            >
              No-show
            </Button>
          )}
        </div>
      )}
    </Card>
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
      if (mine) { setLinkedProfile(mine); setStaffId(mine.id); }
      else setStaffId((prev) => prev || rows[0]?.id || '');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load staff');
    }
  }, [user?.id]);

  const loadSchedule = useCallback(async (id, isLinked) => {
    if (!id) { setToday([]); setUpcoming([]); return; }
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

  useEffect(() => { void loadStaff(); }, [loadStaff]);
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
      if (evt?.type?.startsWith('appointment_') && staffId)
        void loadSchedule(staffId, linkedProfile?.id === staffId);
    });
    const unsubRc = onReconnect(() => {
      if (staffId) void loadSchedule(staffId, linkedProfile?.id === staffId);
    });
    return () => { unsub(); unsubRc(); };
  }, [staffId, linkedProfile?.id, loadSchedule]);

  async function updateStatus(appointmentId, status) {
    setBusy(true); setError('');
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
      <PageHeader
        title="My schedule"
        subtitle={
          linkedProfile && staffId === linkedProfile.id
            ? 'Showing your linked staff profile'
            : 'Today and upcoming appointments'
        }
      />

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {staff.length > 1 && (
        <Select
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.user?.email ? ` (${s.user.email})` : ''}
            </option>
          ))}
        </Select>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton.Avatar size="md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-3.5 w-28 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-500" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                Today · {today.length} appointment{today.length !== 1 ? 's' : ''}
              </h2>
            </div>
            {today.length ? (
              today.map((row) => (
                <ScheduleCard key={row.id} row={row} onStatus={updateStatus} busy={busy} />
              ))
            ) : (
              <Card className="p-5 text-center">
                <p className="text-sm text-neutral-500">No appointments today — enjoy the day!</p>
              </Card>
            )}
          </section>

          <section className="space-y-3 mt-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-neutral-400" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                Next 7 days · {upcomingOnly.length} appointment{upcomingOnly.length !== 1 ? 's' : ''}
              </h2>
            </div>
            {upcomingOnly.length ? (
              upcomingOnly.map((row) => (
                <ScheduleCard key={row.id} row={row} onStatus={updateStatus} busy={busy} />
              ))
            ) : (
              <Card className="p-5 text-center">
                <p className="text-sm text-neutral-500">Nothing else scheduled this week.</p>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
