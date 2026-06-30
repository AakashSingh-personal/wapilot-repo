import { useEffect, useRef, useState } from 'react';
import { Zap, CreditCard, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../services/api.js';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';

export default function Billing() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
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
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load billing status');
      } finally {
        if (!cancelled) setLoading(false);
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
      name: 'Vartalap',
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
      modal: { ondismiss: async () => { await refresh(); } },
      theme: { color: '#059669' },
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
    setError(''); setMsg('');
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

  const isActive = status?.subscription?.status === 'ACTIVE';
  const plan = status?.subscription?.plan || 'FREE';

  const planVariant = {
    PRO: 'brand',
    ENTERPRISE: 'purple',
    FREE: 'default',
  }[plan] || 'default';

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Billing" subtitle="Manage your Vartalap subscription" />

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2.5 rounded-lg bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 text-success-700 dark:text-success-400 text-sm px-4 py-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {msg}
        </div>
      )}

      {/* Current plan card */}
      <Card>
        <Card.Body>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm text-neutral-500">Current plan</p>
                <Badge variant={planVariant}>{plan}</Badge>
                {isActive && <Badge variant="success" dot>Active</Badge>}
              </div>
              <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{plan}</p>
              {status?.subscription?.status && (
                <p className="text-xs text-neutral-500">
                  Status: <span className="font-medium">{status.subscription.status}</span>
                  {status.subscription.expiresAt &&
                    ` · Renews ${new Date(status.subscription.expiresAt).toLocaleDateString()}`}
                </p>
              )}
              {status?.razorpayKeyId && (
                <p className="text-2xs font-mono text-neutral-400">
                  Razorpay: {status.razorpayKeyId}
                </p>
              )}
            </div>

            <div className="shrink-0">
              {loading ? (
                <div className="w-8 h-8 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-brand-600 dark:text-brand-400" />
                </div>
              )}
            </div>
          </div>

          {!isActive && (
            <div className="mt-5 pt-5 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    Upgrade to PRO
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Unlock unlimited messages, campaigns, and AI replies
                  </p>
                </div>
                <Button
                  variant="primary"
                  iconLeft={<Zap className="w-4 h-4" />}
                  loading={loadingPay}
                  onClick={openUpgrade}
                >
                  Upgrade plan
                </Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Pending payment */}
      {status?.pendingPayment && (
        <div className="rounded-xl border border-warning-200 dark:border-warning-800/60 bg-warning-50 dark:bg-warning-950/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0" />
                <p className="text-sm font-semibold text-warning-900 dark:text-warning-100">
                  Pending payment
                </p>
              </div>
              <p className="text-xs text-warning-700 dark:text-warning-300">
                Complete payment on Razorpay. If you see "Invalid Token", avoid saved cards — use UPI or enter a new card.
              </p>
              <p className="text-2xs font-mono text-warning-600 dark:text-warning-400">
                {status.pendingPayment.providerOrderId || status.pendingPayment.id}
              </p>
            </div>
            {status.pendingPaymentLinkUrl && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={reopenPendingLink}
              >
                Open link
              </Button>
            )}
          </div>
        </div>
      )}

      {/* PRO features list */}
      {!isActive && (
        <Card>
          <Card.Header title="What's included in PRO" />
          <Card.Body>
            <div className="space-y-3">
              {[
                'Unlimited WhatsApp messages per month',
                'AI-powered auto-replies with GPT-4o-mini',
                'WhatsApp broadcast campaigns',
                'Appointment scheduling + reminders',
                'Customer payment collection via Razorpay',
                'Priority support',
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-brand-500 shrink-0" />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">{feat}</span>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
