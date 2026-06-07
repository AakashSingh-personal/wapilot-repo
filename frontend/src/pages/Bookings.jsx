import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { subscribeRealtime, onReconnect } from '../realtime/socket.js';

function formatSourceLabel(source) {
  const labels = {
    DASHBOARD: 'Dashboard',
    PUBLIC_BOOKING: 'Public web',
    WHATSAPP: 'WhatsApp AI',
    WHATSAPP_AI: 'WhatsApp AI',
    WAITLIST: 'Waitlist',
  };
  return labels[source] || String(source || 'Unknown').replace(/_/g, ' ');
}

export default function Bookings() {
  const [legacy, setLegacy] = useState([]);
  const [appointments, setAppointments] = useState([]);
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
    }
  }

  useEffect(() => {
    void load();
    const unsub = subscribeRealtime((evt) => {
      if (evt?.type?.startsWith('appointment_')) void load();
    });
    const unsubRc = onReconnect(() => void load());
    return () => {
      unsub();
      unsubRc();
    };
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bookings</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Appointments from WhatsApp AI, dashboard, and legacy slot bookings.
          </p>
        </div>
        <Link
          to="/scheduling"
          className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
        >
          Open Scheduling
        </Link>
      </div>

      {appointments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold">Appointments</div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Service</th>
                <th className="px-4 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <Link
                      to={`/scheduling?tab=appointments&appt=${encodeURIComponent(a.id)}`}
                      className="block hover:text-brand-700 dark:hover:text-brand-400"
                    >
                      <div className="font-medium">{a.customer?.name || '—'}</div>
                      <div className="text-xs text-slate-500 font-mono">{a.customer?.phone}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">{a.service?.name}</td>
                  <td className="px-4 py-3">{a.staff?.name}</td>
                  <td className="px-4 py-3">{new Date(a.startAt).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatSourceLabel(a.source)}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/scheduling?tab=appointments&appt=${encodeURIComponent(a.id)}`}
                      className="inline-flex rounded-full bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200 px-2 py-0.5 text-xs font-semibold hover:bg-brand-100"
                    >
                      {a.status}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold">Legacy WhatsApp slot bookings</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Slot</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {legacy.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{b.customer?.name || '—'}</div>
                  <div className="text-xs text-slate-500 font-mono">{b.customer?.phone}</div>
                </td>
                <td className="px-4 py-3">{b.service}</td>
                <td className="px-4 py-3">{b.slot}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200 px-2 py-0.5 text-xs font-semibold">
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(b.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!legacy.length && !appointments.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No bookings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
