import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowRight, Clock, Bot, Globe, MessageSquare } from 'lucide-react';
import { api } from '../services/api.js';
import { subscribeRealtime, onReconnect } from '../realtime/socket.js';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Button } from '../components/ui/Button.jsx';
import { AppointmentStatusBadge, Badge } from '../components/ui/Badge.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
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

export default function Bookings() {
  const [legacy, setLegacy] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        >
          <Avatar name={a.customer?.name || a.customer?.phone} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {a.customer?.name || '—'}
            </p>
            <p className="text-xs font-mono text-neutral-500 truncate">{a.customer?.phone}</p>
          </div>
        </Link>
      ),
    },
    {
      key: 'service',
      label: 'Service',
      render: (a) => <span className="text-sm text-neutral-700 dark:text-neutral-300">{a.service?.name || '—'}</span>,
    },
    {
      key: 'staff',
      label: 'Staff',
      render: (a) => <span className="text-sm text-neutral-600 dark:text-neutral-400">{a.staff?.name || '—'}</span>,
    },
    {
      key: 'startAt',
      label: 'When',
      render: (a) => (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Clock className="w-3 h-3 shrink-0" />
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
      width: 120,
      render: (a) => (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          {sourceIcon[a.source] || null}
          {formatSourceLabel(a.source)}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (a) => (
        <Link to={`/scheduling?tab=appointments&appt=${encodeURIComponent(a.id)}`}>
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
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{b.customer?.name || '—'}</p>
            <p className="text-xs font-mono text-neutral-500">{b.customer?.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'service',
      label: 'Service',
      render: (b) => <span className="text-sm">{b.service}</span>,
    },
    {
      key: 'slot',
      label: 'Slot',
      render: (b) => <span className="text-sm text-neutral-600 dark:text-neutral-400">{b.slot}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: 100,
      render: (b) => <Badge variant="brand">{b.status}</Badge>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: 130,
      render: (b) => (
        <span className="text-xs text-neutral-500">
          {new Date(b.createdAt).toLocaleString('en-IN', {
            month: 'short', day: 'numeric',
          })}
        </span>
      ),
    },
  ];

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

      {appointments.length > 0 && (
        <Card>
          <Card.Header
            title="Appointments"
            subtitle={`${appointments.length} booking${appointments.length !== 1 ? 's' : ''}`}
          />
          <Table
            columns={apptColumns}
            rows={appointments}
            loading={loading}
            skeletonRows={5}
            emptyState={<EmptyAppointments />}
          />
        </Card>
      )}

      <Card>
        <Card.Header
          title="Legacy WhatsApp slot bookings"
          subtitle="Older bookings from AI slot selection"
        />
        <Table
          columns={legacyColumns}
          rows={legacy}
          loading={loading && !appointments.length}
          skeletonRows={3}
          emptyState={
            !appointments.length ? <EmptyAppointments /> : undefined
          }
        />
      </Card>
    </div>
  );
}
