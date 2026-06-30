import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, LogIn, RefreshCw, UserPlus, ShieldCheck,
  AlertCircle, CheckCircle2, Copy,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import LegalPagesAdmin from '../components/LegalPagesAdmin.jsx';

function ResultBox({ data, label }) {
  const [copied, setCopied] = useState('');
  if (!data) return null;

  function copy(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-success-200 dark:border-success-800 bg-success-50 dark:bg-success-950/30 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-success-500" />
        <p className="text-sm font-semibold text-success-800 dark:text-success-200">{label} created!</p>
      </div>
      {data.business && (
        <p className="text-xs text-success-700 dark:text-success-300">
          <span className="font-medium">Business:</span> {data.business.name}
          <span className="text-success-500 ml-2 font-mono text-[11px]">{data.business.id}</span>
        </p>
      )}
      {(data.owner?.email || data.user?.email) && (
        <p className="text-xs text-success-700 dark:text-success-300">
          <span className="font-medium">Email:</span> {data.owner?.email || data.user?.email}
        </p>
      )}
      {data.tempPassword && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-success-700 dark:text-success-300">
            <span className="font-medium">Temp password:</span>{' '}
            <code className="font-mono bg-success-100 dark:bg-success-900/40 px-1.5 py-0.5 rounded">
              {data.tempPassword}
            </code>
          </p>
          <button
            type="button"
            onClick={() => copy(data.tempPassword, 'pw')}
            className="text-success-600 hover:text-success-800 transition-colors"
            title="Copy password"
          >
            {copied === 'pw'
              ? <CheckCircle2 className="w-3.5 h-3.5" />
              : <Copy className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      )}
      <p className="text-xs text-success-600 dark:text-success-400">
        Share credentials with the client and ask them to change the password on first login.
      </p>
    </div>
  );
}

export default function ChiefAdmin() {
  const navigate = useNavigate();
  const { loginState, setReturnToken } = useAuth();
  const [tab, setTab] = useState('clients');

  // Clients
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // Onboard
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Chief admin
  const [chiefEmail, setChiefEmail] = useState('');
  const [chiefPassword, setChiefPassword] = useState('');
  const [chiefLoading, setChiefLoading] = useState(false);
  const [chiefResult, setChiefResult] = useState(null);

  const [error, setError] = useState('');

  async function loadClients() {
    setLoadingClients(true);
    setError('');
    try {
      const { data } = await api.get('/admin/clients');
      setClients(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load clients');
    } finally {
      setLoadingClients(false);
    }
  }

  async function accessClient(businessId) {
    if (!businessId) return;
    setError('');
    try {
      const { data } = await api.post('/admin/impersonate', { businessId });
      if (data?.returnToken) {
        setReturnToken(data.returnToken);
      }
      loginState(data);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to access client');
    }
  }

  async function onboard(e) {
    e.preventDefault();
    setError(''); setResult(null);
    setLoading(true);
    try {
      const { data } = await api.post('/admin/onboard', {
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
      });
      setResult(data);
      setBusinessName(''); setOwnerName(''); setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  }

  async function createChief(e) {
    e.preventDefault();
    setError(''); setChiefResult(null);
    setChiefLoading(true);
    try {
      const { data } = await api.post('/admin/chiefadmins', {
        email: chiefEmail.trim(),
        password: chiefPassword.trim() || undefined,
      });
      setChiefResult(data);
      setChiefEmail(''); setChiefPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ChiefAdmin');
    } finally {
      setChiefLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'clients') loadClients();
  }, [tab]);

  const tabs = [
    { value: 'clients',  label: 'Clients' },
    { value: 'onboard',  label: 'Onboard Client' },
    { value: 'admins',   label: 'Admins' },
    { value: 'legal',    label: 'Legal Pages' },
  ];

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.ownerEmail || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const clientColumns = [
    {
      key: 'name',
      label: 'Business',
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{c.name}</p>
            <p className="text-xs text-neutral-500 font-mono truncate">{c.id}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'ownerEmail',
      label: 'Owner',
      render: (c) => (
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{c.ownerEmail || '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      width: 130,
      render: (c) => (
        <span className="text-xs text-neutral-500">
          {c.createdAt ? new Date(c.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          }) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 100,
      render: (c) => (
        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost" size="sm"
            iconLeft={<LogIn className="w-3.5 h-3.5" />}
            onClick={() => accessClient(c.id)}
          >
            Access
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Chief Admin"
        subtitle="Manage clients, onboard new businesses, and create admin accounts"
      />

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <Tabs value={tab} onChange={setTab} items={tabs} />

      {/* Clients tab */}
      {tab === 'clients' && (
        <Card>
          <Card.Header
            title="All clients"
            subtitle={loadingClients ? undefined : `${clients.length} business${clients.length !== 1 ? 'es' : ''}`}
          />
          <DataTable
            columns={clientColumns}
            rows={filteredClients}
            loading={loadingClients}
            skeletonRows={4}
            totalRows={filteredClients.length}
            searchValue={clientSearch}
            onSearchChange={setClientSearch}
            searchPlaceholder="Search by name, email, ID…"
            onRefresh={loadClients}
            striped
          />
        </Card>
      )}

      {/* Onboard tab */}
      {tab === 'onboard' && (
        <div className="space-y-4 max-w-lg">
          <Card>
            <Card.Header title="Onboard new client" subtitle="Creates a business workspace and owner account" />
            <Card.Body>
              <form onSubmit={onboard} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Business name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    prefix={<Building2 className="w-4 h-4" />}
                  />
                  <Input
                    label="Owner name (optional)"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                  />
                </div>
                <Input
                  label="Owner email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" loading={loading} iconLeft={<Building2 className="w-4 h-4" />}>
                  Create client
                </Button>
              </form>
            </Card.Body>
          </Card>
          {result && <ResultBox data={result} label="Client" />}
        </div>
      )}

      {/* Admins tab */}
      {tab === 'admins' && (
        <div className="space-y-4 max-w-lg">
          <Card>
            <Card.Header title="Create ChiefAdmin" subtitle="Admin accounts with full platform access" />
            <Card.Body>
              <form onSubmit={createChief} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  value={chiefEmail}
                  onChange={(e) => setChiefEmail(e.target.value)}
                  required
                />
                <Input
                  label="Password (optional)"
                  type="text"
                  value={chiefPassword}
                  onChange={(e) => setChiefPassword(e.target.value)}
                  placeholder="Auto-generate if empty"
                />
                <Button
                  type="submit"
                  variant="primary"
                  loading={chiefLoading}
                  iconLeft={<ShieldCheck className="w-4 h-4" />}
                >
                  Create ChiefAdmin
                </Button>
              </form>
            </Card.Body>
          </Card>
          {chiefResult && <ResultBox data={chiefResult} label="ChiefAdmin" />}
        </div>
      )}

      {tab === 'legal' && <LegalPagesAdmin />}
    </div>
  );
}
