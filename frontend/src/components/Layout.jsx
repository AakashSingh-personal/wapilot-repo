import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, MessageSquare, CalendarDays, Calendar,
  ClipboardList, CreditCard, Wallet, Send, LayoutTemplate, Sparkles,
  BookUser, BookOpen, Receipt, UserCog, Settings, ShieldCheck,
  ChevronLeft, ChevronRight, LogOut, Sun, Moon, Menu, X,
  ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../services/api.js';
import { cn } from '../utils/cn.js';
import { Avatar } from './ui/Avatar.jsx';
import { Spinner } from './ui/Spinner.jsx';

/* ─── Nav structure ─────────────────────────────────────────────────────── */
function buildNav(role) {
  if (role === 'CHIEF_ADMIN') {
    return [
      {
        group: 'Administration',
        items: [
          { to: '/chiefadmin',      label: 'Chief Admin',      icon: ShieldCheck, end: true },
          { to: '/user-management', label: 'User Management',  icon: UserCog },
        ],
      },
    ];
  }

  return [
    {
      group: 'Overview',
      items: [
        { to: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard, end: true },
      ],
    },
    {
      group: 'CRM',
      items: [
        { to: '/customers',      label: 'Customers',      icon: Users },
        { to: '/conversations',  label: 'Conversations',  icon: MessageSquare },
      ],
    },
    {
      group: 'Scheduling',
      items: [
        { to: '/bookings',       label: 'Bookings',       icon: CalendarDays },
        { to: '/scheduling',     label: 'Scheduling',     icon: Calendar },
        { to: '/staff-schedule', label: 'Staff Day',      icon: ClipboardList },
      ],
    },
    {
      group: 'Finance',
      items: [
        { to: '/payments',                  label: 'Payments',   icon: CreditCard },
        { to: '/communications/wallet',     label: 'Wallet',     icon: Wallet },
        { to: '/billing',                   label: 'Billing',    icon: Receipt },
      ],
    },
    {
      group: 'Communications',
      items: [
        { to: '/communications/send',         label: 'Send Campaign',      icon: Send },
        { to: '/communications/templates',    label: 'Templates',          icon: LayoutTemplate },
        { to: '/communications/fields',       label: 'Custom Fields',      icon: Sparkles },
        { to: '/communications/contacts',     label: 'Upload Contacts',    icon: BookUser },
        { to: '/communications/contact-book', label: 'Contact Book',       icon: BookOpen },
      ],
    },
    {
      group: 'Account',
      items: [
        { to: '/user-management', label: 'Team',     icon: UserCog },
        { to: '/settings',        label: 'Settings', icon: Settings },
      ],
    },
  ];
}

/* ─── Single nav item ────────────────────────────────────────────────────── */
function NavItem({ item, collapsed, onClick }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors duration-[150ms]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
          isActive
            ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100'
        )
      }
    >
      {Icon && (
        <Icon className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
      )}
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

/* ─── Sidebar content ───────────────────────────────────────────────────── */
function SidebarContent({ collapsed, onNavClick, user, business, theme, toggle, logout, hasReturnToken, returningToChief, backToChiefAdmin, setSidebarCollapsed }) {
  const nav = buildNav(user?.role);

  return (
    <>
      {/* Brand + collapse button */}
      <div className={cn(
        'shrink-0 flex items-center border-b border-neutral-100 dark:border-neutral-800',
        collapsed ? 'justify-center h-14 px-2' : 'justify-between px-4 h-14'
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-neutral-900 dark:text-neutral-50 text-sm">WaPilot</span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
        )}
        {setSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(v => !v)}
            className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <ChevronRight className="w-3.5 h-3.5" />
              : <ChevronLeft className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-hide py-2 px-2 space-y-4">
        {nav.map((group) => (
          <div key={group.group}>
            {!collapsed && (
              <p className="px-2.5 mb-1 text-2xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-600">
                {group.group}
              </p>
            )}
            {collapsed && group !== nav[0] && (
              <div className="mx-auto mb-1 w-4 border-t border-neutral-100 dark:border-neutral-800" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onClick={onNavClick}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User area */}
      <div className="shrink-0 border-t border-neutral-100 dark:border-neutral-800 p-2 space-y-1">
        {/* Back to ChiefAdmin */}
        {hasReturnToken && (
          <button
            type="button"
            onClick={backToChiefAdmin}
            disabled={returningToChief}
            title="Return to Chief Admin"
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
              'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40',
              'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
          >
            {returningToChief
              ? <Spinner size="xs" />
              : <ArrowLeftRight className="w-4 h-4 shrink-0" />
            }
            {!collapsed && <span className="truncate">{returningToChief ? 'Switching…' : 'Back to ChiefAdmin'}</span>}
          </button>
        )}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />
          }
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        {/* User row */}
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-default">
            <Avatar name={user?.email || 'User'} size="sm" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                {business?.name || 'My Business'}
              </p>
              <p className="text-2xs text-neutral-400 truncate">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Log out"
              className="shrink-0 p-1 rounded text-neutral-400 hover:text-error-600 dark:hover:text-error-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="w-full flex items-center justify-center px-2.5 py-2 rounded-lg text-neutral-400 hover:text-error-600 dark:hover:text-error-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </>
  );
}

/* ─── Layout root ────────────────────────────────────────────────────────── */
export default function Layout() {
  const { logout, business, user, loginState, returnToken, setReturnToken } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [returningToChief, setReturningToChief] = useState(false);
  const navigate = useNavigate();

  const hasReturnToken = user?.role !== 'CHIEF_ADMIN' && Boolean(returnToken);

  async function backToChiefAdmin() {
    if (!returnToken || returningToChief) return;
    setReturningToChief(true);
    try {
      const { data } = await api.post('/admin/return-session', { returnToken });
      setReturnToken(null);
      loginState(data);
      navigate('/chiefadmin');
    } catch {
      setReturnToken(null);
    } finally {
      setReturningToChief(false);
    }
  }

  const sharedProps = {
    user, business, theme, toggle, logout,
    hasReturnToken, returningToChief, backToChiefAdmin,
  };

  return (
    <div className="min-h-screen flex bg-neutral-50 dark:bg-neutral-950">

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-neutral-950/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-64 flex flex-col',
          'bg-white dark:bg-neutral-900',
          'border-r border-neutral-200 dark:border-neutral-800',
          'transition-transform duration-300 ease-out-expo md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent
          collapsed={false}
          onNavClick={() => setMobileOpen(false)}
          setSidebarCollapsed={null}
          {...sharedProps}
        />
      </aside>

      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 h-screen sticky top-0',
          'bg-white dark:bg-neutral-900',
          'border-r border-neutral-200 dark:border-neutral-800',
          'transition-[width] duration-200 ease-snappy',
          sidebarCollapsed ? 'w-[60px]' : 'w-60'
        )}
      >
        <SidebarContent
          collapsed={sidebarCollapsed}
          onNavClick={null}
          setSidebarCollapsed={setSidebarCollapsed}
          {...sharedProps}
        />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Mobile topbar */}
        <header className="md:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Open navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-neutral-900 dark:text-neutral-50">WaPilot</span>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {/* Build warning */}
          {!import.meta.env.VITE_API_URL &&
            typeof window !== 'undefined' &&
            !window.location.hostname.includes('localhost') && (
              <div className="px-6 pt-4">
                <div className="rounded-lg border border-warning-300 bg-warning-50 dark:bg-warning-950/40 text-warning-900 dark:text-warning-200 px-4 py-3 text-sm">
                  <strong>API URL not configured.</strong> Set{' '}
                  <code className="font-mono text-xs bg-warning-100 dark:bg-warning-900/60 px-1 rounded">
                    VITE_API_URL=https://your-api.onrender.com
                  </code>{' '}
                  in Cloudflare Pages → Settings → Environment variables, then redeploy.
                </div>
              </div>
          )}
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
