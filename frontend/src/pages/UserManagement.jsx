import { useEffect, useState } from 'react';
import { UserPlus, RefreshCw, KeyRound, Trash2, X, ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Modal } from '../components/ui/Modal.jsx';

const roleBadge = {
  OWNER:       { variant: 'brand',   label: 'Owner' },
  STAFF:       { variant: 'default', label: 'Staff' },
  CHIEF_ADMIN: { variant: 'purple',  label: 'Chief Admin' },
};

export default function UserManagement({ embedded = false }) {
  const { user } = useAuth();
  const isChiefAdmin = user?.role === 'CHIEF_ADMIN';
  const isOwner = user?.role === 'OWNER';
  const canManageSensitive = isChiefAdmin || isOwner;

  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('STAFF');
  const [businessId, setBusinessId] = useState('');
  const [password, setPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function loadAll() {
    setLoading(true);
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
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setCreating(true);
    try {
      const payload = {
        email: email.trim(),
        role,
        password: password.trim() || undefined,
        ...(role === 'STAFF' ? { businessId } : {}),
      };
      const { data } = await api.post('/user-management/users', payload);
      setSuccess(`User created: ${data.user?.email}${data.tempPassword ? ` · Temp password: ${data.tempPassword}` : ''}`);
      setEmail(''); setPassword('');
      setShowCreate(false);
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
    setError(''); setSuccess('');
    try {
      const { data } = await api.post(`/user-management/users/${target.id}/reset-password`);
      setSuccess(`Password reset for ${target.email}. Temp password: ${data.tempPassword}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to reset password');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    setError(''); setSuccess('');
    try {
      await api.delete(`/user-management/users/${deleteTarget.id}`);
      setSuccess(`Deleted user: ${deleteTarget.email}`);
      setDeleteTarget(null);
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'email',
      label: 'User',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.email} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{u.email}</p>
            {u.businessName && (
              <p className="text-xs text-neutral-500 truncate">{u.businessName}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      width: 110,
      render: (u) => {
        const rb = roleBadge[u.role] || { variant: 'default', label: u.role };
        return <Badge variant={rb.variant}>{rb.label}</Badge>;
      },
    },
    {
      key: 'createdAt',
      label: 'Joined',
      width: 130,
      render: (u) => (
        <span className="text-xs text-neutral-500">
          {new Date(u.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 160,
      render: (u) =>
        canManageTarget(u) ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost" size="sm"
              iconLeft={<KeyRound className="w-3.5 h-3.5" />}
              onClick={() => resetPassword(u)}
            >
              Reset PW
            </Button>
            <Button
              variant="ghost" size="sm"
              icon={<Trash2 className="w-3.5 h-3.5 text-error-500" />}
              onClick={() => setDeleteTarget(u)}
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      {!embedded && <PageHeader title="User Management" />}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2.5 rounded-lg bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 text-success-700 dark:text-success-400 text-sm px-4 py-3 font-mono text-xs">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success-500" />
          {success}
        </div>
      )}

      {/* Create user panel */}
      {showCreate && canManageSensitive && (
        <Card>
          <Card.Header title="Create new user" action={
            <Button variant="ghost" size="sm" icon={<X className="w-4 h-4" />} onClick={() => setShowCreate(false)} />
          } />
          <Card.Body>
            <form onSubmit={createUser} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="sm:col-span-2"
                containerClassName="sm:col-span-2"
              />
              <Select
                label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="STAFF">Staff</option>
                {isChiefAdmin && <option value="CHIEF_ADMIN">Chief Admin</option>}
              </Select>
              <Input
                label="Password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Auto-generate if empty"
              />
              {role === 'STAFF' && isChiefAdmin && (
                <Select
                  label="Client / Business"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  required
                  containerClassName="sm:col-span-2"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              )}
              <div className="flex justify-end sm:col-span-2 lg:col-span-4">
                <Button type="submit" variant="primary" loading={creating} iconLeft={<UserPlus className="w-4 h-4" />}>
                  Create user
                </Button>
              </div>
            </form>
          </Card.Body>
        </Card>
      )}

      <Card>
        <Card.Header
          title={`${users.length} user${users.length !== 1 ? 's' : ''}`}
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary" size="sm"
                iconLeft={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
                onClick={loadAll}
                disabled={loading}
              >
                Refresh
              </Button>
              {canManageSensitive && !showCreate && (
                <Button
                  variant="primary" size="sm"
                  iconLeft={<UserPlus className="w-3.5 h-3.5" />}
                  onClick={() => setShowCreate(true)}
                >
                  Create user
                </Button>
              )}
            </div>
          }
        />
        <Table
          columns={columns}
          rows={users}
          loading={loading}
          skeletonRows={4}
        />
      </Card>

      {/* Delete confirmation modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete user?"
        size="xs"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Permanently delete{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {deleteTarget?.email}
          </span>
          ? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
