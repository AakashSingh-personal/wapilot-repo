import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Payments() {
  const { user } = useAuth();
  const [data, setData] = useState({ subscriptionPayments: [], customerPayments: [] });
  const [customers, setCustomers] = useState([]);
  const [pickCustomer, setPickCustomer] = useState('');
  const [pickAmount, setPickAmount] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  async function load() {
    const { data: d } = await api.get('/dashboard/payments');
    setData(d);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [payRes, custRes] = await Promise.all([
          api.get('/dashboard/payments'),
          api.get('/dashboard/customers'),
        ]);
        if (cancelled) return;
        setData(payRes.data);
        setCustomers(custRes.data);
        setPickCustomer((prev) => prev || custRes.data[0]?.id || '');
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function markPaid(id) {
    setError('');
    try {
      await api.patch(`/customer-payments/${id}/mark-paid`);
      await load();
      setModal(null);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not update');
    }
  }

  async function generateLink() {
    const customerId = pickCustomer;
    const amount = pickAmount;
    if (!customerId || !amount) {
      setError('Pick customer and amount');
      return;
    }
    setError('');
    try {
      const { data: res } = await api.post('/create-payment-link', {
        customerId,
        amount,
      });
      setModal({ type: 'link', ...res });
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create link');
    }
  }

  const ownersOnly = user?.role === 'OWNER';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payments</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Subscription records + customer payment collections.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-900 dark:text-white">Create payment request</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Customer</label>
            <select
              value={pickCustomer}
              onChange={(e) => setPickCustomer(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm min-w-[220px]"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.phone} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Amount (INR)</label>
            <input
              type="number"
              value={pickAmount}
              onChange={(e) => setPickAmount(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm w-32"
            />
          </div>
          <button
            type="button"
            onClick={generateLink}
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold"
          >
            Create Razorpay link
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm">
          Customer payments
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              {ownersOnly && <th className="px-4 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.customerPayments?.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div>{p.customer?.name || '—'}</div>
                  <div className="text-xs font-mono text-slate-500">{p.customer?.phone}</div>
                </td>
                <td className="px-4 py-3">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(p.createdAt).toLocaleString()}</td>
                {ownersOnly && (
                  <td className="px-4 py-3">
                    {p.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => markPaid(p.id)}
                        className="text-xs font-semibold text-brand-700 dark:text-brand-400"
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!data.customerPayments?.length && (
              <tr>
                <td colSpan={ownersOnly ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                  No customer payments logged.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm">
          Subscription payments (WAPilot billing)
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.subscriptionPayments?.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(p.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!data.subscriptionPayments?.length && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No SaaS subscription attempts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'link' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="font-semibold text-lg mb-2">Razorpay Payment Link</div>
            <a
              href={modal.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-sm text-brand-700 underline break-all"
            >
              {modal.shortUrl}
            </a>
            <p className="text-xs text-slate-500 mt-3">
              Share this link with customer. Status updates automatically on webhook capture.
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2 font-semibold"
              onClick={() => setModal(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
