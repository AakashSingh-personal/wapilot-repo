import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
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
                className="flex gap-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-2 px-2 rounded-xl transition-colors"
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
                    {(t.lastMessage?.content || '').replace(/\s+/g, ' ').slice(0, 80)}
                    {(t.lastMessage?.content?.length || 0) > 80 ? '…' : ''}
                  </div>
                </div>
                <div className="text-xs text-slate-400 shrink-0 pt-1">
                  {t.lastMessage?.createdAt
                    ? new Date(t.lastMessage.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : ''}
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
