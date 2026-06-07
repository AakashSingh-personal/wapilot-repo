import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

export default function Billing() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loadingPay, setLoadingPay] = useState(false);
  const pollRef = useRef(null);

  async function refresh() {
    const { data } = await api.get('/billing/status');
    setStatus(data);
    return data;
  }

  async function syncPendingPayment() {
    try {
      const { data } = await api.post('/billing/sync-payment');
      if (data?.synced) {
        await refresh();
        setMsg('Payment successful. PRO activated.');
        setError('');
        return true;
      }
    } catch {
      // status poll will retry
    }
    return false;
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
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPaymentPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        await api.post('/billing/sync-payment').catch(() => {});
        const data = await refresh();
        if (data?.subscription?.status === 'ACTIVE' || !data?.pendingPayment) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (data?.subscription?.status === 'ACTIVE') {
            setMsg('Payment successful. PRO activated.');
            setError('');
          }
        }
      } catch {
        // keep polling
      }
    }, 3000);
  }

  async function ensureRazorpayScript() {
    if (window.Razorpay) return true;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function openCheckout(data) {
    const loaded = await ensureRazorpayScript();
    if (!loaded) {
      setError('Could not load Razorpay checkout script');
      return;
    }
    const options = {
      key: data.keyId,
      currency: data.currency || 'INR',
      name: 'WAPilot',
      description: `Upgrade to ${data.plan}`,
      order_id: data.orderId,
      handler: async (resp) => {
        if (!data.paymentId) {
          const synced = await syncPendingPayment();
          if (!synced) {
            setError('Payment received but checkout session was stale — click Upgrade again or wait for auto-sync.');
          }
          return;
        }
        try {
          await api.patch(`/billing/payments/${data.paymentId}/verify`, {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          await refresh();
          setMsg('Payment successful. PRO activated.');
        } catch (e) {
          const synced = await syncPendingPayment();
          if (!synced) {
            setError(e.response?.data?.error || 'Payment verification failed');
          }
        }
      },
      modal: {
        ondismiss: async () => {
          await refresh();
        },
      },
      theme: { color: '#4f46e5' },
    };
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', async (resp) => {
      await refresh();
      const desc = resp?.error?.description || resp?.error?.reason || '';
      setError(
        /token/i.test(desc)
          ? 'Saved card rejected by Razorpay. Use UPI or enter a new card (do not pick a saved card).'
          : desc || 'Payment failed or was cancelled.',
      );
    });
    rzp.open();
  }

  async function openUpgrade() {
    setError('');
    setMsg('');
    setLoadingPay(true);
    try {
      const { data } = await api.get('/billing/pro-qr');

      if (data.paymentLinkUrl) {
        window.open(data.paymentLinkUrl, '_blank', 'noopener,noreferrer');
        setMsg('Complete payment in the Razorpay tab. This page updates when payment is captured.');
        startPaymentPolling();
        return;
      }

      if (data.mode === 'checkout' && data.orderId) {
        await openCheckout(data);
        return;
      }

      setError('Could not start payment — invalid server response');
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.detail || 'Could not start Razorpay payment');
    } finally {
      setLoadingPay(false);
    }
  }

  function reopenPendingLink() {
    const url = status?.pendingPaymentLinkUrl;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    setMsg('Complete payment in the Razorpay tab.');
    startPaymentPolling();
  }

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
            {status?.razorpayKeyId && (
              <div className="text-xs text-slate-400 mt-1 font-mono">Razorpay: {status.razorpayKeyId}</div>
            )}
          </div>
          <button
            type="button"
            onClick={openUpgrade}
            disabled={loadingPay}
            className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm"
          >
            {loadingPay ? 'Starting...' : 'Upgrade plan'}
          </button>
        </div>

        {status?.pendingPayment && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Pending subscription payment
              </div>
              <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
                Complete payment on Razorpay. Avoid saved cards if you see &quot;Invalid Token&quot; — use UPI or a new card.
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-xs font-mono text-amber-800/80">
                {status.pendingPayment.providerOrderId || status.pendingPayment.id}
              </div>
              {status.pendingPaymentLinkUrl && (
                <button
                  type="button"
                  onClick={reopenPendingLink}
                  className="text-xs font-semibold text-brand-700 dark:text-brand-300"
                >
                  Open payment link
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
