import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowRight, Clock, Bot, Globe, MessageSquare } from 'lucide-react';
import { api } from '../services/api.js';
import { subscribeRealtime, onReconnect } from '../realtime/socket.js';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { AppointmentStatusBadge, Badge } from '../components/ui/Badge.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { FilterChip } from '../components/ui/FilterChip.jsx';
import { EmptyAppointments } from '../components/ui/EmptyState.jsx';

function formatSourceLabel(source) {
  const labels = {
    DASHBOARD:    'Dashboard',
    PUBLIC_BOOKING: 'Public web',
    WHATSAPP:     'WhatsApp AI',
    WHATSAPP_AI:  'WhatsApp AI',
    WAITLIST:     'Waitlist',
  };
  return labels[source] || String(source || 'Unknown').replace(/_/g, ' ');
}

const sourceIcon = {
  WHATSAPP:     <MessageSquare className="w-3 h-3" />,
  WHATSAPP_AI:  <Bot className="w-3 h-3" />,
  PUBLIC_BOOKING: <Globe className="w-3 h-3" />,
  DASHBOARD:    <CalendarDays className="w-3 h-3" />,
};

const APPT_STATUSES = ['CONFIRMED', 'PENDING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export default function Bookings() {
  const [legacy, setLegacy] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // UI filters (no API change)
  const [apptSearch, setApptSearch] = useState('');
  const [apptStatus, setApptStatus] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/dashboard/bookings');
      if (Array.isArray(data)) {
        setLegacy(data);
        setAppointments([]);
      } else {
        setLegacy(Array.isArray(data?.legacyBookings) ? data.legacyBookings : []);
        setAppointments(Array.isArray(data?.appointments) ? data.appointments : []);
      }
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const unsub = subscribeRealtime((evt) => {
      if (evt?.type?.startsWith('appointment_')) void load();
    });
    const unsubRc = onReconnect(() => void load());
    return () => { unsub(); unsubRc(); };
  }, []);

  // Client-side filter (does NOT touch API)
  const filteredAppts = useMemo(() => {
    let list = appointments;
    if (apptStatus) list = list.filter(a => a.status === apptStatus);
    if (apptSearch) {
      const q = apptSearch.toLowerCase();
      list = list.filter(a =>
        (a.customer?.name || '').toLowerCase().includes(q) ||
        (a.customer?.phone || '').includes(q) ||
        (a.service?.name || '').toLowerCase().includes(q) ||
        (a.staff?.name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [appointments, apptSearch, apptStatus]);

  if (error) {
    return (
      <div className="rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
        {error}
      </div>
    );
  }

  const apptColumns = [
    {
      key: 'customer',
      label: 'Customer',
      render: (a) => (
        <Link
          to={`/scheduling?tab=appointments&appt=${encodeURIComponent(a.id)}`}
          className="flex items-center gap-3 hover:text-brand-600 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar name={a.customer?.name || a.customer?.phone} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {a.customer?.name || '—'}
            </p>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 truncate">{a.customer?.phone}</p>
          </div>
        </Link>
      ),
    },
    {
      key: 'service',
      label: 'Service',
      render: (a) => (
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {a.service?.name || '—'}
        </span>
      ),
    },
    {
      key: 'staff',
      label: 'Staff',
      width: 130,
      render: (a) => (
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{a.staff?.name || '—'}</span>
      ),
    },
    {
      key: 'startAt',
      label: 'When',
      width: 160,
      render: (a) => (
        <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
          <Clock className="w-3 h-3 shrink-0 text-neutral-400" />
          {new Date(a.startAt).toLocaleString('en-IN', {
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
          })}
        </div>
      ),
    },
    {
      key: 'source',
      label: 'Source',
      width: 130,
      render: (a) => (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {sourceIcon[a.source] || null}
          {formatSourceLabel(a.source)}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 130,
      render: (a) => (
        <Link
          to={`/scheduling?tab=appointments&appt=${encodeURIComponent(a.id)}`}
          onClick={(e) => e.stopPropagation()}
        >
          <AppointmentStatusBadge status={a.status} />
        </Link>
      ),
    },
  ];

  const legacyColumns = [
    {
      key: 'customer',
      label: 'Customer',
      render: (b) => (
        <div className="flex items-center gap-3">
          <Avatar name={b.customer?.name || b.customer?.phone} size="sm" />
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{b.customer?.name || '—'}</p>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{b.customer?.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'service',
      label: 'Service',
      render: (b) => (
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{b.service}</span>
      ),
    },
    {
      key: 'slot',
      label: 'Slot',
      render: (b) => (
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{b.slot}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (b) => <Badge variant="brand">{b.status}</Badge>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: 130,
      render: (b) => (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {new Date(b.createdAt).toLocaleString('en-IN', {
            month: 'short', day: 'numeric',
          })}
        </span>
      ),
    },
  ];

  // Status filter chips for appointments
  const statusCounts = useMemo(() => {
    const counts = {};
    for (const a of appointments) counts[a.status] = (counts[a.status] || 0) + 1;
    return counts;
  }, [appointments]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookings"
        subtitle="Appointments from WhatsApp AI, dashboard, and legacy slot bookings"
        actions={
          <Button
            variant="primary"
            size="sm"
            iconLeft={<CalendarDays className="w-4 h-4" />}
            iconRight={<ArrowRight className="w-4 h-4" />}
            onClick={() => window.location.href = '/scheduling'}
          >
            Open Scheduling
          </Button>
        }
      />

      {/* ── Appointments table ── */}
      {(loading || appointments.length > 0) && (
        <Card>
          <Card.Header
            title="Appointments"
            subtitle={loading ? undefined : `${appointments.length} total`}
            action={
              !loading && appointments.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Quick status filter pills */}
                  {APPT_STATUSES.filter(s => statusCounts[s] > 0).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setApptStatus(prev => prev === s ? '' : s)}
                      className={[
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                        apptStatus === s
                          ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:border-brand-500'
                          : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-brand-400 dark:hover:border-brand-600',
                      ].join(' ')}
                    >
                      {s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}
                      <span className={[
                        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
                        apptStatus === s ? 'bg-white/20 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300',
                      ].join(' ')}>{statusCounts[s]}</span>
                    </button>
                  ))}
                </div>
              )
            }
          />
          <DataTable
            columns={apptColumns}
            rows={filteredAppts}
            loading={loading}
            skeletonRows={5}
            totalRows={filteredAppts.length}
            searchValue={apptSearch}
            onSearchChange={setApptSearch}
            searchPlaceholder="Search customer, service, staff…"
            filterChips={
              apptStatus ? (
                <FilterChip
                  value={apptStatus.replace(/_/g, ' ')}
                  label="Status"
                  onRemove={() => setApptStatus('')}
                />
              ) : null
            }
            onClearFilters={apptSearch || apptStatus ? () => { setApptSearch(''); setApptStatus(''); } : undefined}
            striped
            emptyState={<EmptyAppointments />}
          />
        </Card>
      )}

      {/* ── Legacy bookings table ── */}
      <Card>
        <Card.Header
          title="Legacy WhatsApp slot bookings"
          subtitle="Older bookings from AI slot selection"
        />
        <DataTable
          columns={legacyColumns}
          rows={legacy}
          loading={loading && !appointments.length}
          skeletonRows={3}
          totalRows={legacy.length}
          striped
          showRowCount={false}
          emptyState={
            !appointments.length ? <EmptyAppointments /> : undefined
          }
        />
      </Card>
    </div>
  );
}
