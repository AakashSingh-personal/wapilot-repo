import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BadgeDollarSign, CheckCircle2, ChevronDown,
  CreditCard, ListChecks, Plus, RefreshCw, Trash2, TrendingUp,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';

const COMMISSION_TYPES = [
  { value: 'PERCENTAGE', label: 'Percentage (% of service value)' },
  { value: 'FIXED', label: 'Fixed amount per appointment' },
  { value: 'TIER', label: 'Tier-based (by monthly count)' },
  { value: 'PRODUCT', label: 'Product / service flat rate' },
  { value: 'TEAM', label: 'Team commission (manager cut)' },
];

const STATUS_COLORS = {
  PENDING:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PAID:     'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const CHART_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

function fmt(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function SummaryCard({ label, amount, count, color = 'text-slate-900 dark:text-white' }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{fmt(amount)}</p>
      {count != null && <p className="text-xs text-slate-400 mt-0.5">{count} records</p>}
    </div>
  );
}

const EMPTY_RULE = { type: 'PERCENTAGE', value: '', staffId: '', serviceId: '', teamManagerId: '', priority: 0, tierSlabs: [{ from: 0, to: 50, rate: 5 }, { from: 51, to: 100, rate: 10 }, { from: 101, to: null, rate: 15 }] };

export default function Commission() {
  const [tab, setTab] = useState('dashboard');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Shared data
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);

  // Dashboard
  const [summary, setSummary] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [summaryPeriod, setSummaryPeriod] = useState('monthly');

  // Rules
  const [rules, setRules] = useState([]);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [editingRuleId, setEditingRuleId] = useState('');
  const [ruleBusy, setRuleBusy] = useState(false);

  // Records
  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStaff, setFilterStaff] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    api.get('/scheduling/staff').then(r => setStaff(r.data || [])).catch(() => {});
    api.get('/scheduling/services').then(r => setServices(r.data || [])).catch(() => {});
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [s, lb] = await Promise.all([
        api.get(`/scheduling/commissions/summary?period=${summaryPeriod}`).then(r => r.data),
        api.get('/scheduling/commissions/leaderboard').then(r => r.data),
      ]);
      setSummary(s);
      setLeaderboard(lb);
    } catch { setError('Failed to load dashboard.'); }
    finally { setLoading(false); }
  }, [summaryPeriod]);

  const loadRules = useCallback(async () => {
    const data = await api.get('/scheduling/commission-rules').then(r => r.data).catch(() => []);
    setRules(data);
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterStaff) params.set('staffId', filterStaff);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      const data = await api.get(`/scheduling/commissions?${params}`).then(r => r.data);
      setRecords(data.records || []);
      setRecordsTotal(data.total || 0);
      setSelectedIds(new Set());
    } catch { setError('Failed to load records.'); }
    finally { setLoading(false); }
  }, [filterStatus, filterStaff, filterFrom, filterTo]);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'rules') loadRules();
    else if (tab === 'records') loadRecords();
  }, [tab, loadDashboard, loadRules, loadRecords]);

  async function handleSaveRule(e) {
    e.preventDefault();
    setRuleBusy(true); setError('');
    try {
      const body = {
        type: ruleForm.type,
        value: parseFloat(ruleForm.value) || 0,
        staffId: ruleForm.staffId || undefined,
        serviceId: ruleForm.serviceId || undefined,
        teamManagerId: ruleForm.teamManagerId || undefined,
        priority: parseInt(ruleForm.priority, 10) || 0,
        tierSlabs: ruleForm.type === 'TIER' ? ruleForm.tierSlabs : [],
      };
      if (editingRuleId) {
        await api.patch(`/scheduling/commission-rules/${editingRuleId}`, body);
        setInfo('Rule updated.');
      } else {
        await api.post('/scheduling/commission-rules', body);
        setInfo('Rule created.');
      }
      setEditingRuleId(''); setRuleForm(EMPTY_RULE); loadRules();
    } catch (err) { setError(err.response?.data?.error || 'Failed to save rule.'); }
    finally { setRuleBusy(false); }
  }

  async function handleDeleteRule(id) {
    if (!window.confirm('Archive this rule?')) return;
    try { await api.delete(`/scheduling/commission-rules/${id}`); loadRules(); }
    catch { setError('Failed to delete rule.'); }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  }

  async function handleBulkApprove() {
    if (!selectedIds.size) return;
    setBulkBusy(true); setError('');
    try {
      const res = await api.post('/scheduling/commissions/approve', { ids: [...selectedIds] });
      setInfo(`${res.data.updated} commission(s) approved.`);
      loadRecords(); loadDashboard();
    } catch (err) { setError(err.response?.data?.error || 'Approval failed.'); }
    finally { setBulkBusy(false); }
  }

  async function handleBulkMarkPaid() {
    if (!selectedIds.size) return;
    setBulkBusy(true); setError('');
    try {
      const res = await api.post('/scheduling/commissions/mark-paid', { ids: [...selectedIds] });
      setInfo(`${res.data.updated} commission(s) marked paid. Batch: ${res.data.paymentBatchId}`);
      loadRecords(); loadDashboard();
    } catch (err) { setError(err.response?.data?.error || 'Mark paid failed.'); }
    finally { setBulkBusy(false); }
  }

  function updateTierSlab(idx, field, val) {
    setRuleForm(f => {
      const slabs = [...(f.tierSlabs || [])];
      slabs[idx] = { ...slabs[idx], [field]: val === '' ? null : Number(val) };
      return { ...f, tierSlabs: slabs };
    });
  }

  const TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'rules', label: 'Rules' },
    { id: 'records', label: 'Records' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Commissions" subtitle="Configure rules and track staff earnings" />

      <div className="flex gap-1 px-6 pt-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setError(''); setInfo(''); }}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}
        {info && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />{info}
          </div>
        )}

        {/* ── Dashboard ── */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm text-slate-500">Period:</span>
              {['daily', 'weekly', 'monthly'].map(p => (
                <button key={p} onClick={() => setSummaryPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${summaryPeriod === p ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
              <button onClick={loadDashboard} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : summary && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryCard label="Total Earned" amount={summary.total?.amount} color="text-slate-900 dark:text-white" />
                  <SummaryCard label="Pending" amount={summary.pending?.amount} count={summary.pending?.count} color="text-yellow-600 dark:text-yellow-400" />
                  <SummaryCard label="Approved" amount={summary.approved?.amount} count={summary.approved?.count} color="text-blue-600 dark:text-blue-400" />
                  <SummaryCard label="Paid Out" amount={summary.paid?.amount} count={summary.paid?.count} color="text-green-600 dark:text-green-400" />
                </div>

                {leaderboard.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" /> Commission Leaderboard — This Month
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={leaderboard} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <XAxis dataKey="staff.name" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={v => `₹${v}`} tick={{ fontSize: 11 }} width={60} />
                        <Tooltip formatter={v => fmt(v)} />
                        <Bar dataKey="totalAmount" radius={[4, 4, 0, 0]}>
                          {leaderboard.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-slate-500 uppercase border-b border-slate-100 dark:border-slate-700">
                          <tr>
                            <th className="py-2 text-left">#</th>
                            <th className="py-2 text-left">Staff</th>
                            <th className="py-2 text-right">Appointments</th>
                            <th className="py-2 text-right">Total Earned</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {leaderboard.map((row, i) => (
                            <tr key={row.staff.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                              <td className="py-2.5 text-slate-400 text-xs">{i + 1}</td>
                              <td className="py-2.5 font-medium">{row.staff.name}</td>
                              <td className="py-2.5 text-right text-slate-500">{row.appointmentCount}</td>
                              <td className="py-2.5 text-right font-semibold text-green-600 dark:text-green-400">{fmt(row.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Rules ── */}
        {tab === 'rules' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Rule builder */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <BadgeDollarSign className="w-4 h-4" />
                {editingRuleId ? 'Edit Rule' : 'New Commission Rule'}
              </h3>
              <form onSubmit={handleSaveRule} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Commission Type *</label>
                  <select value={ruleForm.type} onChange={e => setRuleForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" required>
                    {COMMISSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {ruleForm.type !== 'TIER' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      {ruleForm.type === 'PERCENTAGE' || ruleForm.type === 'TEAM' ? 'Rate (%)' : 'Amount (₹)'}
                    </label>
                    <input type="number" step="0.01" min="0" placeholder="0"
                      value={ruleForm.value} onChange={e => setRuleForm(f => ({ ...f, value: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" required />
                  </div>
                )}

                {/* Tier slabs */}
                {ruleForm.type === 'TIER' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-500">Tier Slabs (monthly appointment count → rate %)</label>
                    {(ruleForm.tierSlabs || []).map((slab, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input type="number" placeholder="From" value={slab.from ?? ''} onChange={e => updateTierSlab(idx, 'from', e.target.value)}
                          className="w-20 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1.5 text-xs" />
                        <span className="text-slate-400 text-xs">–</span>
                        <input type="number" placeholder="To (blank=∞)" value={slab.to ?? ''} onChange={e => updateTierSlab(idx, 'to', e.target.value)}
                          className="w-20 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1.5 text-xs" />
                        <span className="text-slate-400 text-xs">@</span>
                        <input type="number" step="0.01" placeholder="Rate %" value={slab.rate ?? ''} onChange={e => updateTierSlab(idx, 'rate', e.target.value)}
                          className="w-20 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1.5 text-xs" />
                        <span className="text-slate-400 text-xs">%</span>
                        <button type="button" onClick={() => setRuleForm(f => ({ ...f, tierSlabs: f.tierSlabs.filter((_, i) => i !== idx) }))}
                          className="text-red-400 hover:text-red-600">✕</button>
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => setRuleForm(f => ({ ...f, tierSlabs: [...(f.tierSlabs || []), { from: 0, to: null, rate: 0 }] }))}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add slab
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Staff (blank = all)</label>
                    <select value={ruleForm.staffId} onChange={e => setRuleForm(f => ({ ...f, staffId: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                      <option value="">All staff</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Service (blank = all)</label>
                    <select value={ruleForm.serviceId} onChange={e => setRuleForm(f => ({ ...f, serviceId: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                      <option value="">All services</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                {ruleForm.type === 'TEAM' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Team Manager</label>
                    <select value={ruleForm.teamManagerId} onChange={e => setRuleForm(f => ({ ...f, teamManagerId: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                      <option value="">Select manager…</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Priority (higher = wins)</label>
                  <input type="number" min={0} value={ruleForm.priority} onChange={e => setRuleForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-24 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                </div>

                <div className="flex gap-2">
                  <button type="submit" disabled={ruleBusy}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                    {ruleBusy ? <Spinner size={14} /> : <Plus className="w-4 h-4" />}
                    {editingRuleId ? 'Save Changes' : 'Create Rule'}
                  </button>
                  {editingRuleId && (
                    <button type="button" onClick={() => { setEditingRuleId(''); setRuleForm(EMPTY_RULE); }}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm">Cancel</button>
                  )}
                </div>
              </form>
            </div>

            {/* Rules list */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm">
                Active Rules ({rules.length})
              </div>
              {rules.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">No commission rules yet.<br />Create your first rule to start tracking earnings.</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {rules.map(r => {
                    const staffName = staff.find(s => s.id === r.staffId)?.name;
                    const serviceName = services.find(s => s.id === r.serviceId)?.name;
                    const valueLabel = r.type === 'TIER' ? `${(r.tierSlabs || []).length} slabs` : r.type === 'PERCENTAGE' || r.type === 'TEAM' ? `${Number(r.value)}%` : fmt(r.value);
                    return (
                      <li key={r.id} className="flex items-start justify-between px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-slate-900 dark:text-white">
                            {r.type} · {valueLabel}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {staffName ? `Staff: ${staffName}` : 'All staff'} · {serviceName ? `Service: ${serviceName}` : 'All services'} · Priority: {r.priority}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => { setEditingRuleId(r.id); setRuleForm({ type: r.type, value: String(r.value), staffId: r.staffId || '', serviceId: r.serviceId || '', teamManagerId: r.teamManagerId || '', priority: r.priority, tierSlabs: Array.isArray(r.tierSlabs) ? r.tierSlabs : [] }); }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 text-xs">Edit</button>
                          <button onClick={() => handleDeleteRule(r.id)} className="p-1.5 text-slate-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ── Records ── */}
        {tab === 'records' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                  <option value="">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PAID">Paid</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Staff</label>
                <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                  <option value="">All Staff</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={loadRecords}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <RefreshCw className="w-3.5 h-3.5" /> Search
              </button>
            </div>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{selectedIds.size} selected</span>
                <button onClick={handleBulkApprove} disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                  {bulkBusy ? <Spinner size={12} /> : <ListChecks className="w-3.5 h-3.5" />} Approve
                </button>
                <button onClick={handleBulkMarkPaid} disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                  {bulkBusy ? <Spinner size={12} /> : <CreditCard className="w-3.5 h-3.5" />} Mark Paid
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="font-semibold text-sm">Commission Records</span>
                  <span className="text-xs text-slate-400">{recordsTotal} total</span>
                </div>
                {records.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">No records found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 uppercase">
                        <tr>
                          <th className="px-4 py-2">
                            <input type="checkbox" checked={selectedIds.size === records.length && records.length > 0}
                              onChange={toggleSelectAll} className="rounded" />
                          </th>
                          <th className="px-4 py-2 text-left">Staff</th>
                          <th className="px-4 py-2 text-left">Appointment</th>
                          <th className="px-4 py-2 text-left">Service</th>
                          <th className="px-4 py-2 text-left">Rule</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-right">Appt. Value</th>
                          <th className="px-4 py-2 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {records.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" checked={selectedIds.has(r.id)}
                                onChange={() => toggleSelect(r.id)} className="rounded" />
                            </td>
                            <td className="px-4 py-3 font-medium">{r.staff?.name}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {r.appointment?.appointmentNumber}<br />
                              {r.appointment?.startAt ? new Date(r.appointment.startAt).toLocaleDateString('en-IN') : ''}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{r.appointment?.service?.name || '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">
                              {r.rule ? `${r.rule.type} · ${r.rule.type === 'PERCENTAGE' ? `${Number(r.rule.value)}%` : fmt(r.rule.value)}` : '—'}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmt(r.appointment?.amount)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">{fmt(r.calculatedAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
