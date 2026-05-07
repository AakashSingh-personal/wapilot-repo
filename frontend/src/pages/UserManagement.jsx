import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserManagement({ embedded = false }) {
  const { user } = useAuth();
  const isChiefAdmin = user?.role === 'CHIEF_ADMIN';
  const isOwner = user?.role === 'OWNER';
  const canManageSensitive = isChiefAdmin || isOwner;
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('STAFF');
  const [businessId, setBusinessId] = useState('');
  const [password, setPassword] = useState('');

  async function loadAll() {
    setLoadingUsers(true);
    try {
      const [{ data: usersData }, { data: clientsData }] = await Promise.all([
        api.get('/user-management/users'),
        api.get('/user-management/clients'),
      ]);
      setUsers(Array.isArray(usersData?.rows) ? usersData.rows : []);
      const clientRows = Array.isArray(clientsData?.rows) ? clientsData.rows : [];
      setClients(clientRows);
      if (!businessId && clientRows.length) setBusinessId(clientRows[0].id);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load user management data');
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const payload = {
        email: email.trim(),
        role,
        password: password.trim() || undefined,
        ...(role === 'STAFF' ? { businessId } : {}),
      };
      const { data } = await api.post('/user-management/users', payload);
      setSuccess(`User created: ${data.user?.email} (temp password: ${data.tempPassword})`);
      setEmail('');
      setPassword('');
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  function canManageTarget(target) {
    if (!canManageSensitive) return false;
    if (!target?.id || target.id === user?.id) return false;
    if (isOwner) return target.role === 'STAFF';
    return true;
  }

  async function resetPassword(target) {
    if (!target?.id) return;
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post(`/user-management/users/${target.id}/reset-password`);
      setSuccess(`Password reset for ${target.email}. Temp password: ${data.tempPassword}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to reset password');
    }
  }

  async function removeUser(target) {
    if (!target?.id) return;
    if (!window.confirm(`Delete user ${target.email}?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/user-management/users/${target.id}`);
      setSuccess(`Deleted user: ${target.email}`);
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to delete user');
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm px-3 py-2">
          {success}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm flex items-center justify-between gap-3">
          <span>Users</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAll}
              disabled={loadingUsers}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {loadingUsers ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-xs font-semibold"
            >
              {showCreate ? 'Close' : 'Create User'}
            </button>
          </div>
        </div>

        {showCreate && (
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
            <form onSubmit={createUser} className="grid md:grid-cols-4 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="STAFF">STAFF</option>
                  {isChiefAdmin && <option value="CHIEF_ADMIN">CHIEF_ADMIN</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Password (optional)</label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Auto-generate if empty"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              {role === 'STAFF' && isChiefAdmin && (
                <div className="md:col-span-3">
                  <label className="block text-xs text-slate-500 mb-1">Client</label>
                  <select
                    value={businessId}
                    onChange={(e) => setBusinessId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                    required
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}

        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3">{u.businessName || '-'}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(u.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  {canManageTarget(u) ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => resetPassword(u)}
                        className="text-xs font-semibold text-brand-700"
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        onClick={() => removeUser(u)}
                        className="text-xs font-semibold text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
            {!users.length && !loadingUsers && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No users found.
                </td>
              </tr>
            )}
            {loadingUsers && !users.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading users...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

