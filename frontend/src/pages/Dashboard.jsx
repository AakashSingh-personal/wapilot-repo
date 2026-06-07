import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, MessageSquare, IndianRupee, CalendarDays,
  ArrowRight, Bot, User, Clock,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { api } from '../services/api.js';
import { previewText } from '../utils/whatsappMessagePreview.js';
import { SessionBadge, MessageBadge } from '../components/ChatStatusBadges.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Badge, AppointmentStatusBadge } from '../components/ui/Badge.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { buildChartTheme } from '../design-system/chartTheme.js';
import { useTheme } from '../context/ThemeContext.jsx';

function formatINR(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Dashboard() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const chartTheme = buildChartTheme(isDark);

  const [stats, setStats] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
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
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-error-600 dark:text-error-400">{error}</p>
      </div>
    );
  }

  const statCards = stats ? [
    {
      title: 'Total Leads',
      value: stats.leads?.toLocaleString() ?? '—',
      icon: Users,
      iconColor: 'brand',
      subtitle: 'All time',
      sparklineData: stats.leadsOverTime?.slice(-7).map(d => ({ v: d.count })),
      trend: stats.leadsGrowth != null ? { value: stats.leadsGrowth, label: 'vs last week' } : undefined,
    },
    {
      title: 'Bookings',
      value: stats.bookings?.toLocaleString() ?? '—',
      icon: CalendarDays,
      iconColor: 'info',
      subtitle: 'Confirmed slots',
    },
    {
      title: 'Revenue',
      value: formatINR(stats.revenue),
      icon: IndianRupee,
      iconColor: 'success',
      subtitle: 'Paid (marked)',
    },
    {
      title: 'Active Chats',
      value: recentChats.length?.toString() ?? '—',
      icon: MessageSquare,
      iconColor: 'purple',
      subtitle: 'Recent threads',
    },
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your WhatsApp business"
      />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton.StatCard key={i} />
            ))
          : statCards.map((s) => (
              <StatCard key={s.title} {...s} />
            ))
        }
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Today's Schedule — 3 cols */}
        <div className="lg:col-span-3">
          <Card>
            <Card.Header
              title="Today's schedule"
              subtitle={
                scheduling
                  ? `${scheduling.todayCount ?? 0} today · ${scheduling.weekCount ?? 0} this week`
                  : undefined
              }
              action={
                <Link
                  to="/scheduling?tab=appointments"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              }
            />
            <Card.Body className="p-0">
              {loading ? (
                <div className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="px-5 py-4 flex items-center gap-3">
                      <Skeleton.Avatar size="sm" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-28 rounded" />
                        <Skeleton className="h-3 w-20 rounded" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : scheduling?.upcoming?.length ? (
                <ul className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                  {scheduling.upcoming.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={`/scheduling?tab=appointments&appt=${encodeURIComponent(a.id)}`}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <Avatar name={a.customer?.name || a.customer?.phone} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {a.customer?.name || a.customer?.phone}
                          </p>
                          <p className="text-xs text-neutral-500 truncate">
                            {a.service?.name}{a.staff?.name ? ` · ${a.staff.name}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <AppointmentStatusBadge status={a.status} size="sm" />
                          <span className="text-2xs text-neutral-400">
                            {new Date(a.startAt).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                  <CalendarDays className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mb-2" />
                  <p className="text-sm text-neutral-500">No upcoming appointments today</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </div>

        {/* Recent Chats — 2 cols */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <Card.Header
              title="Recent chats"
              action={
                <Link
                  to="/conversations"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
                >
                  Inbox <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              }
            />
            <Card.Body className="p-0">
              {loading ? (
                <div className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-4 py-3.5 flex items-start gap-3">
                      <Skeleton.Avatar size="sm" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-24 rounded" />
                        <Skeleton className="h-3 w-full rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentChats.length ? (
                <ul className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                  {recentChats.map((t) => (
                    <li key={t.id}>
                      <Link
                        to={`/conversations?customer=${encodeURIComponent(t.id)}`}
                        className="flex items-start gap-3 px-4 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <div className="relative shrink-0 mt-0.5">
                          <Avatar name={t.name || 'User'} size="sm" />
                          {t.inboxUnreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-500 ring-2 ring-white dark:ring-neutral-900" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`text-sm font-medium truncate ${t.inboxUnreadCount > 0 ? 'text-neutral-900 dark:text-neutral-50' : 'text-neutral-700 dark:text-neutral-300'}`}>
                              {t.name || 'Unknown'}
                            </span>
                            <span className="text-2xs text-neutral-400 shrink-0">
                              {formatRelativeTime(t.lastMessage?.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 truncate mt-0.5">
                            {t.lastMessage?.type === 'BOT' && (
                              <Bot className="w-3 h-3 inline mr-1 text-purple-400" />
                            )}
                            {t.lastMessage?.type === 'STAFF' && (
                              <User className="w-3 h-3 inline mr-1 text-brand-400" />
                            )}
                            {previewText(t.lastMessage?.content || '', 60)}
                          </p>
                          {t.inboxUnreadCount > 0 && (
                            <span className="inline-flex min-w-[18px] justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold px-1.5 py-0.5 mt-1">
                              {t.inboxUnreadCount > 99 ? '99+' : t.inboxUnreadCount}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <MessageSquare className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mb-2" />
                  <p className="text-sm text-neutral-500">No recent conversations</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>

      {/* Leads chart */}
      <Card>
        <Card.Header title="New leads (last 30 days)" />
        <Card.Body>
          {loading ? (
            <div className="h-60 flex items-center justify-center">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.leadsOverTime || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartTheme.grid} />
                  <XAxis
                    dataKey="date"
                    tick={chartTheme.axisTick}
                    axisLine={chartTheme.axisLine}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={chartTheme.axisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltip.contentStyle}
                    labelStyle={chartTheme.tooltip.labelStyle}
                    cursor={chartTheme.tooltip.cursor}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#leadFill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#059669' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
