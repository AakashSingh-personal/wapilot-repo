import { useEffect, useState } from 'react';
import { IndianRupee, Link2, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Badge, ApptPaymentStatusBadge } from '../components/ui/Badge.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';

function formatINR(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function Payments() {
  const { user } = useAuth();
  const [data, setData] = useState({ subscriptionPayments: [], customerPayments: [] });
  const [customers, setCustomers] = useState([]);
  const [pickCustomer, setPickCustomer] = useState('');
  const [pickAmount, setPickAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
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
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
    if (!pickCustomer || !pickAmount) {
      setError('Select a customer and enter an amount');
      return;
    }
    setError('');
    setGenerating(true);
    try {
      const { data: res } = await api.post('/create-payment-link', {
        customerId: pickCustomer,
        amount: pickAmount,
      });
      setModal({ type: 'link', ...res });
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create link');
    } finally {
      setGenerating(false);
    }
  }

  const ownersOnly = user?.role === 'OWNER';

  const totalCollected = data.customerPayments
    ?.filter(p => p.status === 'PAID')
    .reduce((s, p) => s + Number(p.amount || 0), 0) ?? 0;

  const totalPending = data.customerPayments
    ?.filter(p => p.status === 'PENDING')
    .reduce((s, p) => s + Number(p.amount || 0), 0) ?? 0;

  const customerColumns = [
    {
      key: 'customer',
      label: 'Customer',
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={p.customer?.name || p.customer?.phone} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {p.customer?.name || '—'}
            </p>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 truncate">{p.customer?.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      width: 120,
      align: 'right',
      render: (p) => (
        <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
          {formatINR(p.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (p) => <ApptPaymentStatusBadge status={p.status} />,
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: 140,
      render: (p) => (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <Clock className="w-3 h-3 shrink-0" />
          {new Date(p.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </div>
      ),
    },
    ...(ownersOnly ? [{
      key: 'actions',
      label: '',
      width: 120,
      render: (p) => p.status === 'PENDING' ? (
        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<CheckCircle2 className="w-3.5 h-3.5 text-success-500" />}
            onClick={() => setModal({ type: 'confirm', id: p.id, amount: p.amount, name: p.customer?.name || p.customer?.phone })}
          >
            Mark paid
          </Button>
        </div>
      ) : null,
    }] : []),
  ];

  const subColumns = [
    {
      key: 'amount',
      label: 'Amount',
      render: (p) => (
        <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
          {formatINR(p.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (p) => <ApptPaymentStatusBadge status={p.status} />,
    },
    {
      key: 'createdAt',
      label: 'Date',
      width: 140,
      render: (p) => (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <Clock className="w-3 h-3 shrink-0" />
          {new Date(p.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Payments" subtitle="Customer collections and WaPilot subscription" />

      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* ── Summary stats ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Collected"
          value={formatINR(totalCollected)}
          icon={CheckCircle2}
          iconColor="success"
          loading={loading}
        />
        <StatCard
          title="Pending"
          value={formatINR(totalPending)}
          icon={IndianRupee}
          iconColor="warning"
          loading={loading}
        />
        <StatCard
          title="Total requests"
          value={(data.customerPayments?.length ?? 0).toString()}
          icon={Link2}
          iconColor="info"
          loading={loading}
        />
      </div>

      {/* ── Create payment request ── */}
      <Card>
        <Card.Header
          title="Create payment request"
          subtitle="Generate a Razorpay link to send to a customer"
        />
        <Card.Body>
          <div className="flex flex-wrap gap-3 items-end">
            <Select
              label="Customer"
              value={pickCustomer}
              onChange={(e) => setPickCustomer(e.target.value)}
              containerClassName="flex-1 min-w-[200px]"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.phone} ({c.phone})
                </option>
              ))}
            </Select>
            <Input
              label="Amount (INR)"
              type="number"
              min="1"
              value={pickAmount}
              onChange={(e) => setPickAmount(e.target.value)}
              placeholder="1000"
              containerClassName="w-32"
            />
            <Button
              variant="primary"
              iconLeft={<Link2 className="w-4 h-4" />}
              loading={generating}
              onClick={generateLink}
            >
              Create Razorpay link
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ── Customer payments table ── */}
      <Card>
        <Card.Header
          title="Customer payments"
          subtitle={`${data.customerPayments?.length ?? 0} payment request${(data.customerPayments?.length ?? 0) !== 1 ? 's' : ''}`}
        />
        <DataTable
          columns={customerColumns}
          rows={data.customerPayments || []}
          loading={loading}
          skeletonRows={4}
          striped
          showRowCount={false}
        />
      </Card>

      {/* ── Subscription payments table ── */}
      <Card>
        <Card.Header
          title="WaPilot subscription"
          subtitle="Your SaaS billing history"
        />
        <DataTable
          columns={subColumns}
          rows={data.subscriptionPayments || []}
          loading={loading}
          skeletonRows={2}
          striped
          showRowCount={false}
        />
      </Card>

      {/* ── Confirm mark-paid modal ── */}
      <Modal
        open={modal?.type === 'confirm'}
        onClose={() => setModal(null)}
        title="Mark as paid?"
        size="xs"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => markPaid(modal.id)}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Mark{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {formatINR(modal?.amount)}
          </span>{' '}
          from{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {modal?.name}
          </span>{' '}
          as paid? This action cannot be undone.
        </p>
      </Modal>

      {/* ── Payment link modal ── */}
      <Modal
        open={modal?.type === 'link'}
        onClose={() => setModal(null)}
        title="Razorpay payment link created"
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
        }
      >
        <div className="space-y-3">
          <a
            href={modal?.shortUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 underline underline-offset-2 break-all hover:text-brand-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            {modal?.shortUrl}
          </a>
          <p className="text-xs text-neutral-500">
            Share this link with the customer. Payment status updates automatically via webhook.
          </p>
        </div>
      </Modal>
    </div>
  );
}
