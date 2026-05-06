import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const nav = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/customers', label: 'Customers' },
  { to: '/conversations', label: 'Chats' },
  { to: '/bookings', label: 'Bookings' },
  { to: '/payments', label: 'Payments' },
  { to: '/communications', label: 'Communications' },
  { to: '/billing', label: 'Billing' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { logout, business, user } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="text-lg font-bold text-brand-700 dark:text-brand-500">WAPilot</div>
          <div className="text-xs text-slate-500 mt-1 truncate">{business?.name}</div>
          <div className="text-xs text-slate-400 truncate">{user?.email}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
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
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
