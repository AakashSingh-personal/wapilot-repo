import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../services/api.js';

function buildNav(role) {
  if (role === 'CHIEF_ADMIN') {
    return [
      { to: '/chiefadmin', label: 'ChiefAdmin', end: true, icon: '🛡️' },
      { to: '/user-management', label: 'User Management', icon: '👤' },
    ];
  }
  const items = [
    { to: '/dashboard', label: 'Dashboard', end: true, icon: '🏠' },
    { to: '/customers', label: 'Customers', icon: '👥' },
    { to: '/conversations', label: 'Chats', icon: '💬' },
    { to: '/bookings', label: 'Bookings', icon: '📅' },
    { to: '/scheduling', label: 'Scheduling', icon: '🗓️' },
    { to: '/staff-schedule', label: 'Staff day', icon: '📋' },
    { to: '/payments', label: 'Payments', icon: '💳' },
    { to: '/communications/wallet', label: 'Wallet', icon: '💰' },
    { to: '/communications/send', label: 'Send Communication', icon: '📤' },
    { to: '/communications/templates', label: 'Templates', icon: '🧩' },
    { to: '/communications/fields', label: 'Personalization fields', icon: '✨' },
    { to: '/communications/contacts', label: 'Upload Contacts', icon: '📇' },
    { to: '/communications/contact-book', label: 'Contact Book', icon: '📒' },
    { to: '/billing', label: 'Billing', icon: '🧾' },
    { to: '/user-management', label: 'User Management', icon: '👤' },
    { to: '/settings', label: 'Settings', icon: '⚙️' },
  ];
  return items;
}

export default function Layout() {
  const { logout, business, user, loginState } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [returningToChief, setReturningToChief] = useState(false);
  const navigate = useNavigate();
  const nav = buildNav(user?.role);
  const hasReturnToken =
    user?.role !== 'CHIEF_ADMIN' && Boolean(sessionStorage.getItem('wapilot_chiefadmin_return_token'));

  async function backToChiefAdmin() {
    const returnToken = sessionStorage.getItem('wapilot_chiefadmin_return_token');
    if (!returnToken || returningToChief) return;
    setReturningToChief(true);
    try {
      const { data } = await api.post('/admin/return-session', { returnToken });
      sessionStorage.removeItem('wapilot_chiefadmin_return_token');
      loginState(data);
      navigate('/chiefadmin');
    } catch {
      sessionStorage.removeItem('wapilot_chiefadmin_return_token');
    } finally {
      setReturningToChief(false);
    }
  }

  const navLinkClass = ({ isActive }) =>
    [
      'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300'
        : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
    ].join(' ');

  const renderNav = (compact = false) =>
    nav.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={() => setMobileOpen(false)}
        className={navLinkClass}
        title={compact ? item.label : undefined}
      >
        {compact ? (
          <span className="text-base leading-none" aria-hidden="true">
            {item.icon || '•'}
          </span>
        ) : (
          item.label
        )}
      </NavLink>
    ));

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}

      <aside
        className={[
          'fixed left-0 top-0 z-50 h-full w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col transition-transform md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="text-lg font-bold text-brand-700 dark:text-brand-500">WAPilot</div>
          <div className="text-xs text-slate-500 mt-1 truncate">{business?.name}</div>
          <div className="text-xs text-slate-400 truncate">{user?.email}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {renderNav(false)}
        </nav>
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          {hasReturnToken && (
            <button
              type="button"
              onClick={backToChiefAdmin}
              disabled={returningToChief}
              className="w-full rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300 disabled:opacity-60"
            >
              {returningToChief ? 'Switching...' : 'Back to ChiefAdmin'}
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-2 text-sm font-semibold"
          >
            Log out
          </button>
        </div>
      </aside>

      <aside
        className={[
          'hidden md:flex shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col transition-all',
          sidebarCollapsed ? 'w-20' : 'w-64',
        ].join(' ')}
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-lg font-bold text-brand-700 dark:text-brand-500">{sidebarCollapsed ? 'WA' : 'WAPilot'}</div>
              {!sidebarCollapsed && <div className="text-xs text-slate-500 mt-1 truncate">{business?.name}</div>}
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '>>' : '<<'}
            </button>
          </div>
          {!sidebarCollapsed && <div className="text-xs text-slate-400 truncate">{user?.email}</div>}
          {!sidebarCollapsed && (
            <div className="text-[10px] text-slate-400 mt-1">App v{import.meta.env.VITE_APP_VERSION || '1.1.0'}</div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">{renderNav(sidebarCollapsed)}</nav>
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          {hasReturnToken && (
            <button
              type="button"
              onClick={backToChiefAdmin}
              disabled={returningToChief}
              className="w-full rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300 disabled:opacity-60"
              title="Return to ChiefAdmin"
            >
              {sidebarCollapsed ? (returningToChief ? '...' : 'Chief') : returningToChief ? 'Switching...' : 'Back to ChiefAdmin'}
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {sidebarCollapsed ? 'Theme' : theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-2 text-sm font-semibold"
          >
            {sidebarCollapsed ? 'Exit' : 'Log out'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="md:hidden sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200"
            aria-label="Open sidebar"
          >
            Menu
          </button>
          <div className="font-semibold text-slate-900 dark:text-white">WAPilot</div>
        </div>
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          {!import.meta.env.VITE_API_URL &&
            typeof window !== 'undefined' &&
            !window.location.hostname.includes('localhost') && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 px-3 py-2 text-sm">
                API URL is not configured for this build. Set{' '}
                <code className="font-mono text-xs">VITE_API_URL=https://wapilot-repo.onrender.com</code>{' '}
                in Cloudflare Pages → Settings → Environment variables, then redeploy.
              </div>
            )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
