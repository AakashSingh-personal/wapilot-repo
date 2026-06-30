import { Link } from 'react-router-dom';

export function LegalSection({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="space-y-3 text-slate-600 dark:text-slate-300 leading-relaxed">{children}</div>
    </section>
  );
}

export default function LegalPage({ title, lastUpdated, intro, children }) {
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {lastUpdated && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: {lastUpdated}</p>
        )}
        {intro && <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{intro}</p>}
      </header>

      <div className="space-y-8">{children}</div>

      <footer className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <p className="font-semibold text-slate-900 dark:text-slate-100">Questions?</p>
        <p>
          Email us at{' '}
          <a href="mailto:support@wapilot.in" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            support@wapilot.in
          </a>{' '}
          or visit our{' '}
          <Link to="/contact" className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
            contact page
          </Link>
          .
        </p>
      </footer>
    </article>
  );
}
