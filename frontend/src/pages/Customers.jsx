import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

function CustomerEditForm({ customer, onSave, onCancel }) {
  const [name, setName] = useState(customer.name || '');
  const [email, setEmail] = useState(customer.email || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ name, email });
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 py-2">
      <input
        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm min-w-[120px]"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="email"
        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm min-w-[180px]"
        placeholder="Email (for reminders)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Save
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-xs">
        Cancel
      </button>
      {error && <span className="text-xs text-red-600 w-full">{error}</span>}
    </form>
  );
}

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/dashboard/customers');
      setRows(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveCustomer(customerId, payload) {
    const { data } = await api.patch(`/dashboard/customers/${customerId}`, payload);
    setRows((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...data } : c)));
    setEditingId('');
  }

  if (error && !rows.length) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Customers</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          People who messaged your business on WhatsApp. Add an email to enable appointment email reminders.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Visits</th>
              <th className="px-4 py-3 font-semibold">Since</th>
              <th className="px-4 py-3 font-semibold w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                {editingId === c.id ? (
                  <td colSpan={6} className="px-4 py-2">
                    <CustomerEditForm
                      customer={c}
                      onSave={(payload) => saveCustomer(c.id, payload)}
                      onCancel={() => setEditingId('')}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-mono text-xs">{c.phone}</td>
                    <td className="px-4 py-3">{c.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {c.appointmentStats?.totalVisits ? (
                        <span>
                          {c.appointmentStats.totalVisits}
                          {c.appointmentStats.avgRating != null && (
                            <span className="text-xs text-slate-400 ml-1">
                              · {Number(c.appointmentStats.avgRating).toFixed(1)}★
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <Link
                          to={`/conversations?customer=${encodeURIComponent(c.id)}`}
                          className="text-xs font-semibold text-brand-600 hover:underline"
                        >
                          Chat
                        </Link>
                        <Link
                          to={`/scheduling?tab=appointments&customerId=${encodeURIComponent(c.id)}`}
                          className="text-xs font-semibold text-brand-600 hover:underline"
                        >
                          Appointments
                        </Link>
                        <button
                          type="button"
                          className="text-xs font-semibold text-slate-600"
                          onClick={() => setEditingId(c.id)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
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
