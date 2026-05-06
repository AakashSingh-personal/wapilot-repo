import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white p-10">
        <h1 className="text-4xl font-bold">Automate WhatsApp for your business</h1>
        <p className="mt-3 text-white/90 max-w-2xl">
          WAPilot helps you manage conversations, templates, contacts, bookings, and billing in one dashboard.
        </p>
        <div className="mt-6 flex gap-3">
          <Link to="/register" className="rounded-lg bg-white text-brand-700 px-4 py-2 font-semibold">
            Start free
          </Link>
          <Link to="/pricing" className="rounded-lg border border-white/60 px-4 py-2 font-semibold">
            View pricing
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {[
          'Send bulk and single communications',
          'Wallet-based communication billing',
          'Live chats, templates, and contact uploads',
        ].map((point) => (
          <div key={point} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="font-medium">{point}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
