import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ChiefAdmin() {
  const navigate = useNavigate();
  const { loginState, setReturnToken } = useAuth();
  const [tab, setTab] = useState('CLIENTS');
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [chiefEmail, setChiefEmail] = useState('');
  const [chiefPassword, setChiefPassword] = useState('');
  const [chiefLoading, setChiefLoading] = useState(false);
  const [chiefResult, setChiefResult] = useState(null);
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

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
        // Store only in React state (memory) — never persisted to storage.
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
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const { data } = await api.post('/admin/onboard', {
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
      });
      setResult(data);
      setBusinessName('');
      setOwnerName('');
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  }

  async function createChief(e) {
    e.preventDefault();
    setError('');
    setChiefResult(null);
    setChiefLoading(true);
    try {
      const { data } = await api.post('/admin/chiefadmins', {
        email: chiefEmail.trim(),
        password: chiefPassword.trim() || undefined,
      });
      setChiefResult(data);
      setChiefEmail('');
      setChiefPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ChiefAdmin');
    } finally {
      setChiefLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'CLIENTS' && !clients.length) loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ChiefAdmin Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage clients and onboard new clients (Sales-led).</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('CLIENTS')}
          className={[
            'rounded-lg px-3 py-1.5 text-sm font-semibold border',
            tab === 'CLIENTS'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800',
          ].join(' ')}
        >
          Clients
        </button>
        <button
          type="button"
          onClick={() => setTab('ONBOARD')}
          className={[
            'rounded-lg px-3 py-1.5 text-sm font-semibold border',
            tab === 'ONBOARD'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800',
          ].join(' ')}
        >
          Onboard New Client
        </button>
      </div>

      {tab === 'CLIENTS' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm flex items-center justify-between gap-3">
            <span>Clients</span>
            <button
              type="button"
              onClick={loadClients}
              disabled={loadingClients}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {loadingClients ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Owner Email</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-semibold">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.ownerEmail || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{c.createdAt ? new Date(c.createdAt).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => accessClient(c.id)}
                      className="text-xs font-semibold text-brand-700"
                    >
                      Access
                    </button>
                  </td>
                </tr>
              ))}
              {!clients.length && !loadingClients && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No clients found.
                  </td>
                </tr>
              )}
              {loadingClients && !clients.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Loading clients...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ONBOARD' && (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
            <div className="font-semibold">Onboard new client</div>
            <form className="space-y-3" onSubmit={onboard}>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Business name</label>
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Owner name (optional)</label>
                  <input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Owner email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Onboarding…' : 'Create client'}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
            <div className="font-semibold">Create ChiefAdmin</div>
            <form className="space-y-3" onSubmit={createChief}>
              <div>
                <label className="block text-xs text-slate-500 mb-1">ChiefAdmin email</label>
                <input
                  type="email"
                  value={chiefEmail}
                  onChange={(e) => setChiefEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Password (optional)</label>
                <input
                  type="text"
                  value={chiefPassword}
                  onChange={(e) => setChiefPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  placeholder="Leave blank to auto-generate"
                />
              </div>
              <button
                type="submit"
                disabled={chiefLoading}
                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {chiefLoading ? 'Creating…' : 'Create ChiefAdmin'}
              </button>
            </form>
            {chiefResult?.user && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-sm px-3 py-2">
                Created: <span className="font-semibold">{chiefResult.user.email}</span>{' '}
                (temp password: <span className="font-mono">{chiefResult.tempPassword}</span>)
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-2">
          <div className="font-semibold">Client created</div>
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
            <div>
              <span className="font-semibold">Business:</span> {result.business?.name} ({result.business?.id})
            </div>
            <div>
              <span className="font-semibold">Owner email:</span> {result.owner?.email}
            </div>
            <div>
              <span className="font-semibold">Temporary password:</span>{' '}
              <span className="font-mono">{result.tempPassword}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Share these credentials with the client. (You can later add a “reset password” flow if needed.)
          </div>
        </div>
      )}
    </div>
  );
}

