import { Link, Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-brand-700 dark:text-brand-400">
            WAPilot
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/pricing" className="text-slate-600 dark:text-slate-300 hover:text-brand-600">
              Pricing
            </Link>
            <Link to="/contact" className="text-slate-600 dark:text-slate-300 hover:text-brand-600">
              Contact
            </Link>
            <Link to="/login" className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5">
              Login
            </Link>
            <Link to="/contact" className="rounded-lg bg-brand-600 text-white px-3 py-1.5 font-semibold">
              Contact sales
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-6 text-sm text-slate-500 flex flex-wrap gap-4 justify-between">
          <span>© {new Date().getFullYear()} WAPilot</span>
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="hover:text-brand-600">
              Privacy Policy
            </Link>
            <Link to="/terms-and-conditions" className="hover:text-brand-600">
              Terms & Conditions
            </Link>
            <Link to="/refund-policy" className="hover:text-brand-600">
              Refund Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
