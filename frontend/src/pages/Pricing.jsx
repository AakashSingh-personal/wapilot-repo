import { Link } from 'react-router-dom';

export default function Pricing() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <p className="text-slate-600 dark:text-slate-300">
        Clear, pay-as-you-go communication pricing for every business.
      </p>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Communication Wallet</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          ₹2 per contact per message for template communication sends.
        </p>
        <ul className="mt-4 text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1">
          <li>Single send: charged per successful contact send</li>
          <li>Bulk send: charged per successful recipient</li>
          <li>Pre-check for balance before each send</li>
          <li>Unused wallet balance refund requests can be raised within 7 days (see Refund Policy)</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Subscription</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Dashboard subscription and communication wallet are managed separately.
        </p>
      </div>

      <Link to="/contact" className="inline-block rounded-lg bg-brand-600 text-white px-4 py-2 font-semibold">
        Contact sales
      </Link>
    </div>
  );
}
