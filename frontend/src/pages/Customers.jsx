import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/dashboard/customers');
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Customers</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">People who messaged your business on WhatsApp.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3">{c.name || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                  No customers yet — connect WhatsApp webhook to start capturing chats.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
