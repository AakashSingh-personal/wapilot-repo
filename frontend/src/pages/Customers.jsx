import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, CalendarDays, Pencil, X, Check, Star } from 'lucide-react';
import { api } from '../services/api.js';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { SearchBar } from '../components/ui/SearchBar.jsx';
import { EmptyCustomers } from '../components/ui/EmptyState.jsx';

/* ─── Inline edit form (no change to API calls) ─────────────────────────── */
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
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-36"
        containerClassName="flex-none"
      />
      <Input
        type="email"
        placeholder="Email for reminders"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-48"
        containerClassName="flex-none"
      />
      <Button type="submit" size="sm" loading={saving}>Save</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}
        icon={<X className="w-4 h-4" />}
      />
      {error && <span className="text-xs text-error-600 w-full">{error}</span>}
    </form>
  );
}

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/dashboard/customers');
      setRows(data);
      setFiltered(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) { setFiltered(rows); return; }
    setFiltered(rows.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    ));
  }, [search, rows]);

  async function saveCustomer(customerId, payload) {
    const { data } = await api.patch(`/dashboard/customers/${customerId}`, payload);
    setRows((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...data } : c)));
    setEditingId('');
  }

  const columns = [
    {
      key: 'name',
      label: 'Customer',
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.name || c.phone} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {c.name || <span className="text-neutral-400 italic">No name</span>}
            </p>
            <p className="text-xs font-mono text-neutral-500 truncate">{c.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (c) =>
        editingId === c.id ? (
          <CustomerEditForm
            customer={c}
            onSave={(payload) => saveCustomer(c.id, payload)}
            onCancel={() => setEditingId('')}
          />
        ) : (
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {c.email || <span className="text-neutral-300 dark:text-neutral-600">—</span>}
          </span>
        ),
    },
    {
      key: 'visits',
      label: 'Visits',
      width: 100,
      render: (c) =>
        c.appointmentStats?.totalVisits ? (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {c.appointmentStats.totalVisits}
            </span>
            {c.appointmentStats.avgRating != null && (
              <span className="flex items-center gap-0.5 text-xs text-warning-500">
                <Star className="w-3 h-3 fill-warning-500" />
                {Number(c.appointmentStats.avgRating).toFixed(1)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-neutral-300 dark:text-neutral-600">—</span>
        ),
    },
    {
      key: 'createdAt',
      label: 'Since',
      width: 130,
      render: (c) => (
        <span className="text-xs text-neutral-500">
          {new Date(c.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 120,
      render: (c) =>
        editingId === c.id ? null : (
          <div className="flex items-center gap-2">
            <Link
              to={`/conversations?customer=${encodeURIComponent(c.id)}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Chat
            </Link>
            <Link
              to={`/scheduling?tab=appointments&customerId=${encodeURIComponent(c.id)}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => setEditingId(c.id)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        subtitle="WhatsApp contacts who have messaged your business"
      />

      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
          {error}
        </div>
      )}

      <Card>
        <Card.Header
          title={`${filtered.length} customer${filtered.length !== 1 ? 's' : ''}`}
          action={
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by name, phone…"
              className="w-56"
            />
          }
        />
        <Table
          columns={columns}
          rows={filtered}
          loading={loading}
          skeletonRows={6}
          emptyState={
            search ? undefined : (
              <EmptyCustomers
                actionLabel="Learn about WhatsApp webhooks"
                onAction={() => window.open('https://developers.facebook.com/docs/whatsapp', '_blank')}
              />
            )
          }
        />
      </Card>
    </div>
  );
}
