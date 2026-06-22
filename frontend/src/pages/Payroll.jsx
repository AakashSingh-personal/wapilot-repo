import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import {
  DollarSign, Settings, Users, Play, CheckCircle, CreditCard,
  Download, ChevronDown, ChevronUp, AlertCircle, RefreshCw,
  Plus, Edit2, FileText,
} from 'lucide-react';

const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusColor = {
  DRAFT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  FINALIZED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'runs', label: 'Payroll Runs', icon: DollarSign },
  { id: 'staff-config', label: 'Staff Salaries', icon: Users },
  { id: 'config', label: 'Settings', icon: Settings },
];

export default function Payroll() {
  const [tab, setTab] = useState('runs');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Payroll</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-brand-600 text-brand-700 dark:text-brand-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'runs' && <RunsTab />}
      {tab === 'staff-config' && <StaffConfigTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  );
}

// ─── Payroll Runs Tab ─────────────────────────────────────────────────────────
function RunsTab() {
  const [runs, setRuns] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRun, setExpandedRun] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [runSummary, setRunSummary] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/scheduling/payroll/runs');
      setRuns(data.runs ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load payroll runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRunDetail = async (runId) => {
    if (expandedRun === runId) { setExpandedRun(null); return; }
    setExpandedRun(runId);
    try {
      const [detail, summary] = await Promise.all([
        api.get(`/scheduling/payroll/runs/${runId}`),
        api.get(`/scheduling/payroll/runs/${runId}/summary`),
      ]);
      setRunDetail(detail.data);
      setRunSummary(summary.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load run detail');
    }
  };

  const finalize = async (runId) => {
    try {
      await api.post(`/scheduling/payroll/runs/${runId}/finalize`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to finalize');
    }
  };

  const markPaid = async (runId) => {
    try {
      await api.post(`/scheduling/payroll/runs/${runId}/mark-paid`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to mark paid');
    }
  };

  const downloadSlip = (runId, staffId) => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || '';
    const url = `${base}/scheduling/payroll/runs/${runId}/slip/${staffId}`;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `salary-slip-${staffId}.pdf`);
    // Add auth header via fetch
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const burl = URL.createObjectURL(blob);
        a.href = burl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(burl);
      });
  };

  const exportBank = async (runId) => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const base = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${base}/scheduling/payroll/runs/${runId}/export-bank`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-transfer-${runId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-neutral-500">{total} payroll run{total !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => setShowGenerateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generate Payroll
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-neutral-400">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No payroll runs yet. Click "Generate Payroll" to start.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
              <button
                type="button"
                onClick={() => loadRunDetail(run.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[run.status]}`}>
                    {run.status}
                  </span>
                  <div className="text-left">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {new Date(run.periodStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' – '}
                      {new Date(run.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-neutral-500">{run._count?.entries ?? 0} employees</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {run.status === 'DRAFT' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); finalize(run.id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Finalize
                    </button>
                  )}
                  {run.status === 'FINALIZED' && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); exportBank(run.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); markPaid(run.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Mark Paid
                      </button>
                    </>
                  )}
                  {expandedRun === run.id
                    ? <ChevronUp className="w-4 h-4 text-neutral-400" />
                    : <ChevronDown className="w-4 h-4 text-neutral-400" />
                  }
                </div>
              </button>

              {expandedRun === run.id && runDetail?.id === run.id && (
                <div className="border-t border-neutral-200 dark:border-neutral-700 px-5 py-4 space-y-4">
                  {/* Summary row */}
                  {runSummary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Gross Earnings', value: fmt(runSummary.totalGross) },
                        { label: 'Total Deductions', value: fmt(runSummary.totalDeductions) },
                        { label: 'Net Payable', value: fmt(runSummary.totalNetPay) },
                        { label: 'Headcount', value: runSummary.headcount },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg bg-neutral-50 dark:bg-neutral-750 p-3">
                          <p className="text-xs text-neutral-500 mb-1">{s.label}</p>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Entries table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 uppercase tracking-wide">
                          <th className="py-2 text-left font-medium">Staff</th>
                          <th className="py-2 text-right font-medium">Gross</th>
                          <th className="py-2 text-right font-medium">Deductions</th>
                          <th className="py-2 text-right font-medium">Net Pay</th>
                          <th className="py-2 text-center font-medium">Days</th>
                          <th className="py-2 text-center font-medium">Slip</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                        {runDetail.entries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-750">
                            <td className="py-2.5">
                              <p className="font-medium text-neutral-900 dark:text-neutral-100">{entry.staff.name}</p>
                              <p className="text-xs text-neutral-400">{entry.staff.staffCode}</p>
                            </td>
                            <td className="py-2.5 text-right text-neutral-700 dark:text-neutral-300">{fmt(entry.grossEarnings)}</td>
                            <td className="py-2.5 text-right text-red-600 dark:text-red-400">{fmt(entry.totalDeductions)}</td>
                            <td className="py-2.5 text-right font-semibold text-green-700 dark:text-green-400">{fmt(entry.netPay)}</td>
                            <td className="py-2.5 text-center text-neutral-500 text-xs">
                              P:{entry.presentDays} A:{entry.absentDays} H:{entry.halfDays}
                            </td>
                            <td className="py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => downloadSlip(run.id, entry.staffId)}
                                className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 hover:text-brand-600 transition-colors"
                                title="Download salary slip"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showGenerateModal && (
        <GeneratePayrollModal
          onClose={() => setShowGenerateModal(false)}
          onCreated={() => { setShowGenerateModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Generate Modal ───────────────────────────────────────────────────────────
function GeneratePayrollModal({ onClose, onCreated }) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [periodStart, setPeriodStart] = useState(firstOfMonth);
  const [periodEnd, setPeriodEnd] = useState(lastOfMonth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/scheduling/payroll/runs', { periodStart, periodEnd });
      onCreated();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to generate payroll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Generate Payroll Run</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-neutral-500">
          This will calculate salaries, deductions, and commissions for all active staff in the selected period.
        </p>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Staff Config Tab ─────────────────────────────────────────────────────────
function StaffConfigTab() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/scheduling/payroll/staff-configs');
      setConfigs(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (cfg) => {
    setEditingId(cfg.staffId);
    setForm({
      basicSalary: cfg.basicSalary ?? 0,
      travelAllowance: cfg.travelAllowance ?? 0,
      pfEnabled: cfg.pfEnabled ?? false,
      pfRate: cfg.pfRate ?? 12,
      esiEnabled: cfg.esiEnabled ?? false,
      esiRate: cfg.esiRate ?? 0.75,
      taxRate: cfg.taxRate ?? 0,
      lateDeductionPerMinute: cfg.lateDeductionPerMinute ?? 0,
      leaveDayDeductionRate: cfg.leaveDayDeductionRate ?? 1,
      bankAccountNumber: cfg.bankAccountNumber ?? '',
      bankIfsc: cfg.bankIfsc ?? '',
      bankAccountName: cfg.bankAccountName ?? '',
    });
  };

  const save = async (staffId) => {
    setSaving(true);
    try {
      await api.put(`/scheduling/payroll/staff-configs/${staffId}`, form);
      setEditingId(null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const numField = (key, label, step = '1') => (
    <div>
      <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );

  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-neutral-400" /></div>;

  if (configs.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-400">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>No active staff found. Add staff members first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-red-600 p-3 bg-red-50 rounded-lg">{error}</div>}
      {configs.map((cfg) => (
        <div key={cfg.staffId} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-100">{cfg.staff.name}</p>
              <p className="text-xs text-neutral-500">{cfg.staff.staffCode}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-neutral-500">Basic</p>
                <p className="font-semibold text-neutral-800 dark:text-neutral-200">{fmt(cfg.basicSalary)}</p>
              </div>
              <button
                type="button"
                onClick={() => editingId === cfg.staffId ? setEditingId(null) : startEdit(cfg)}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 hover:text-brand-600 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {editingId === cfg.staffId && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {numField('basicSalary', 'Basic Salary (₹)')}
                {numField('travelAllowance', 'Travel Allowance (₹)')}
                {numField('taxRate', 'Tax Rate (%)', '0.01')}
                {numField('lateDeductionPerMinute', 'Late Deduction/min (₹)', '0.01')}
                {numField('leaveDayDeductionRate', 'Leave Day Rate (×salary/day)', '0.1')}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pfEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, pfEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">PF Enabled</span>
                  {form.pfEnabled && (
                    <input
                      type="number"
                      step="0.01"
                      value={form.pfRate}
                      onChange={(e) => setForm((f) => ({ ...f, pfRate: e.target.value }))}
                      placeholder="Rate %"
                      className="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-xs"
                    />
                  )}
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.esiEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, esiEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">ESI Enabled</span>
                  {form.esiEnabled && (
                    <input
                      type="number"
                      step="0.01"
                      value={form.esiRate}
                      onChange={(e) => setForm((f) => ({ ...f, esiRate: e.target.value }))}
                      placeholder="Rate %"
                      className="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-xs"
                    />
                  )}
                </label>
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Bank Details</p>
                <div className="grid grid-cols-3 gap-3">
                  {['bankAccountNumber', 'bankIfsc', 'bankAccountName'].map((k) => (
                    <div key={k}>
                      <label className="block text-xs text-neutral-500 mb-1 capitalize">{k.replace('bank', '').replace(/([A-Z])/g, ' $1').trim()}</label>
                      <input
                        type="text"
                        value={form[k]}
                        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => save(cfg.staffId)}
                  disabled={saving}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Business Config Tab ──────────────────────────────────────────────────────
function ConfigTab() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/scheduling/payroll/config')
      .then(({ data }) => {
        setConfig(data);
        setForm({
          frequency: data.frequency,
          payDay: data.payDay,
          cutoffDay: data.cutoffDay,
          overtimeRatePerHour: data.overtimeRatePerHour,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/scheduling/payroll/config', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-neutral-400" /></div>;
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Payroll Frequency</label>
        <select
          value={form.frequency}
          onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="MONTHLY">Monthly</option>
          <option value="WEEKLY">Weekly</option>
          <option value="BIWEEKLY">Bi-weekly</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Pay Day (day of month)</label>
          <input
            type="number"
            min="1"
            max="31"
            value={form.payDay}
            onChange={(e) => setForm((f) => ({ ...f, payDay: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Cutoff Day (day of month)</label>
          <input
            type="number"
            min="1"
            max="31"
            value={form.cutoffDay}
            onChange={(e) => setForm((f) => ({ ...f, cutoffDay: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Overtime Rate per Hour (₹)</label>
        <input
          type="number"
          step="0.5"
          min="0"
          value={form.overtimeRatePerHour}
          onChange={(e) => setForm((f) => ({ ...f, overtimeRatePerHour: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saved ? <CheckCircle className="w-4 h-4" /> : saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
