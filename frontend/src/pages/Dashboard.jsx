import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { previewText } from '../utils/whatsappMessagePreview.js';
import { SessionBadge, MessageBadge } from '../components/ChatStatusBadges.jsx';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/dashboard/stats');
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Could not load stats');
      }
      try {
        const { data } = await api.get('/scheduling/dashboard/summary');
        if (!cancelled) setScheduling(data);
      } catch {
        if (!cancelled) setScheduling(null);
      }
      try {
        const { data } = await api.get('/dashboard/conversations?limit=6');
        if (!cancelled) setRecentChats(data?.filter((c) => c.lastMessage) || []);
      } catch {
        if (!cancelled) setRecentChats([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div className="text-red-600 dark:text-red-400">{error}</div>;
  }
  if (!stats) {
    return <div className="text-slate-500">Loading dashboard…</div>;
  }

  const cards = [
    { label: 'Leads', value: stats.leads, hint: 'All time' },
    { label: 'Bookings', value: stats.bookings, hint: 'Confirmed slots' },
    {
      label: 'Revenue',
      value: `₹${stats.revenue.toLocaleString('en-IN')}`,
      hint: 'Paid customer UPI (marked)',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Overview for your WhatsApp assistant.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm"
          >
            <div className="text-sm font-medium text-slate-500">{c.label}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{c.value}</div>
            <div className="mt-1 text-xs text-slate-400">{c.hint}</div>
          </div>
        ))}
      </div>

      {scheduling && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Today&apos;s schedule</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {scheduling.todayCount} today · {scheduling.weekCount} this week
              </p>
            </div>
            <Link
              to="/scheduling?tab=appointments"
              className="text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline"
            >
              Open scheduling →
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {(scheduling.upcoming || []).map((a) => (
              <li key={a.id} className="py-3 flex flex-wrap justify-between gap-2 text-sm">
                <div>
                  <Link
                    to={`/scheduling?tab=appointments&appt=${encodeURIComponent(a.id)}`}
                    className="font-medium text-slate-900 dark:text-white hover:text-brand-600"
                  >
                    {a.customer?.name || a.customer?.phone}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {a.service?.name} · {a.staff?.name}
                  </div>
                </div>
                <div className="text-right text-slate-600 dark:text-slate-300">
                  <div>{a.status}</div>
                  <div className="text-xs">
                    {new Date(a.startAt).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </li>
            ))}
            {!scheduling.upcoming?.length && (
              <li className="py-6 text-center text-slate-500 text-sm">No upcoming appointments.</li>
            )}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent chats</h2>
          <Link
            to="/conversations"
            className="text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline"
          >
            Open inbox →
          </Link>
        </div>
        <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {recentChats.map((t) => (
            <li key={t.id}>
              <Link
                to={`/conversations?customer=${encodeURIComponent(t.id)}`}
                className={[
                  'flex gap-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-xl transition-colors',
                  t.inboxUnreadCount > 0 ? 'border-l-4 border-l-sky-500 pl-1.5' : '',
                ].join(' ')}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 dark:text-white truncate">
                    {t.name || 'Unknown'}
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">{t.phone}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 truncate mt-0.5">
                    {t.lastMessage?.type === 'USER'
                      ? ''
                      : t.lastMessage?.type === 'STAFF'
                        ? 'You: '
                        : 'Bot: '}
                    {previewText(t.lastMessage?.content || '', 80)}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <SessionBadge status={t.sessionStatus} />
                    <MessageBadge status={t.messageStatus} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                  <div className="text-xs text-slate-400">
                    {t.lastMessage?.createdAt
                      ? new Date(t.lastMessage.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : ''}
                  </div>
                  {t.inboxUnreadCount > 0 ? (
                    <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-sky-600 text-white text-[10px] font-bold px-1.5 py-0.5">
                      {t.inboxUnreadCount > 99 ? '99+' : t.inboxUnreadCount}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
          {!recentChats.length && (
            <li className="py-8 text-center text-sm text-slate-500">
              No WhatsApp threads yet. When customers message you, open{' '}
              <Link className="font-semibold text-brand-700 dark:text-brand-400" to="/conversations">
                Chats
              </Link>{' '}
              to reply from the web.
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Leads (last 30 days)</h2>
        <div className="h-72 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.leadsOverTime}>
              <defs>
                <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#33415522" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748b" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  borderColor: '#e2e8f0',
                  background: 'rgba(255,255,255,0.95)',
                }}
              />
              <Area type="monotone" dataKey="count" stroke="#059669" fill="url(#leadFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
