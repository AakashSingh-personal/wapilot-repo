import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Billing() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function refresh() {
    const { data } = await api.get('/billing/status');
    setStatus(data);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed billing status');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openUpgrade() {
    setError('');
    setMsg('');
    try {
      const { data } = await api.get('/billing/pro-qr');
      setModal({ ...data, step: 'pay' });
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load billing QR');
    }
  }

  async function iPaid() {
    setError('');
    setMsg('');
    try {
      await api.post('/billing/mark-paid');
      setModal((m) => (m ? { ...m, step: 'verify' } : m));
      await refresh();
      setMsg('Recorded as pending. Owner can verify payment below.');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not record payment');
    }
  }

  async function verifyPayment(id) {
    setError('');
    try {
      await api.patch(`/billing/payments/${id}/verify`);
      setModal(null);
      await refresh();
      setMsg('Subscription upgraded to PRO.');
    } catch (e) {
      setError(e.response?.data?.error || 'Verify failed');
    }
  }

  const ownersOnly = user?.role === 'OWNER';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Billing</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your WAPilot SaaS plan.</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 text-sm px-3 py-2">
          {msg}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-slate-500">Current plan</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {status?.subscription?.plan || '—'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Status: {status?.subscription?.status}
              {status?.subscription?.expiresAt &&
                ` · Renews / expires ${new Date(status.subscription.expiresAt).toLocaleDateString()}`}
            </div>
          </div>
          <button
            type="button"
            onClick={openUpgrade}
            className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm"
          >
            Upgrade plan
          </button>
        </div>

        {status?.pendingPayment && ownersOnly && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Pending subscription payment
              </div>
              <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
                After UPI settles in your bank, mark verified to activate PRO.
              </div>
            </div>
            <button
              type="button"
              onClick={() => verifyPayment(status.pendingPayment.id)}
              className="rounded-lg bg-amber-700 text-white px-4 py-2 text-sm font-semibold"
            >
              Verify payment
            </button>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-start gap-4">
              <div>
                <div className="text-lg font-bold">Upgrade to PRO</div>
                <div className="text-sm text-slate-500">
                  Pay ₹{modal.amount} via UPI. Platform receives funds at the UPI ID configured for WAPilot on the server.
                </div>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>

            {modal.qrImage && (
              <img
                src={modal.qrImage}
                alt="UPI QR"
                className="mt-4 w-full rounded-xl border border-slate-100 dark:border-slate-800"
              />
            )}
            <p className="text-xs text-slate-500 mt-3 break-all">{modal.upiLink}</p>

            <div className="mt-6 flex flex-col gap-2">
              {modal.step === 'pay' && (
                <button
                  type="button"
                  onClick={iPaid}
                  className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 font-semibold text-sm"
                >
                  I paid
                </button>
              )}
              {modal.step === 'verify' && ownersOnly && status?.pendingPayment && (
                <button
                  type="button"
                  onClick={() => verifyPayment(status.pendingPayment.id)}
                  className="w-full rounded-lg bg-brand-600 text-white py-2.5 font-semibold text-sm"
                >
                  Verify & activate PRO
                </button>
              )}
              <button
                type="button"
                onClick={() => setModal(null)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
