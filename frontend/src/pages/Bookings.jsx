import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function Bookings() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get('/dashboard/bookings');
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : []);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load');
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bookings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Slots captured via WhatsApp bot.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Slot</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{b.customer?.name || '—'}</div>
                  <div className="text-xs text-slate-500 font-mono">{b.customer?.phone}</div>
                </td>
                <td className="px-4 py-3">{b.service}</td>
                <td className="px-4 py-3">{b.slot}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200 px-2 py-0.5 text-xs font-semibold">
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(b.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No bookings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
