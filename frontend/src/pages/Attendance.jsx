import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2, Clock, LogIn, LogOut, MapPin, QrCode,
  RefreshCw, UserCheck, AlertTriangle, ClipboardEdit,
  CalendarDays, BarChart3, Plus, Trash2, PencilLine,
} from 'lucide-react';
import { api } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';

const STATUS_COLORS = {
  PRESENT:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  HALF_DAY:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ABSENT:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  LEAVE:      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  HOLIDAY:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  WFH:        'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  FIELD_DUTY: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WFH', 'FIELD_DUTY'];

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {(status || '').replace('_', ' ')}
    </span>
  );
}

function SummaryCard({ label, value, color = 'text-slate-900 dark:text-white' }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function Attendance() {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [staff, setStaff] = useState([]);
  const [locations, setLocations] = useState([]);

  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterStaff, setFilterStaff] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  // Check-In form state
  const [ciStaff, setCiStaff] = useState('');
  const [ciLocation, setCiLocation] = useState('');
  const [ciSource, setCiSource] = useState('GEO');
  const [ciLat, setCiLat] = useState('');
  const [ciLng, setCiLng] = useState('');
  const [ciSubmitting, setCiSubmitting] = useState(false);

  // Check-Out form state
  const [coStaff, setCoStaff] = useState('');
  const [coLat, setCoLat] = useState('');
  const [coLng, setCoLng] = useState('');
  const [coSubmitting, setCoSubmitting] = useState(false);

  // Manual entry form state
  const [mStaff, setMStaff] = useState('');
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mStatus, setMStatus] = useState('PRESENT');
  const [mNotes, setMNotes] = useState('');
  const [mSubmitting, setMSubmitting] = useState(false);

  // QR token modal
  const [qrStaff, setQrStaff] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set('date', filterDate);
      const res = await api.get(`/scheduling/attendance/dashboard?${params}`);
      setSummary(res.data);
    } catch {
      setError('Failed to load attendance dashboard.');
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set('date', filterDate);
      if (filterStaff) params.set('staffId', filterStaff);
      if (filterLocation) params.set('locationId', filterLocation);
      const res = await api.get(`/scheduling/attendance?${params}`);
      setRecords(res.data.records || []);
      setTotalRecords(res.data.total || 0);
    } catch {
      setError('Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterStaff, filterLocation]);

  useEffect(() => {
    api.get('/scheduling/staff').then(r => setStaff(r.data || [])).catch(() => {});
    api.get('/scheduling/locations').then(r => setLocations(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'records') loadRecords();
  }, [tab, loadDashboard, loadRecords]);

  async function handleCheckIn(e) {
    e.preventDefault();
    if (!ciStaff) return setError('Select a staff member.');
    setCiSubmitting(true);
    setError('');
    setInfo('');
    try {
      const body = {
        staffId: ciStaff,
        locationId: ciLocation || undefined,
        source: ciSource,
        lat: ciLat ? parseFloat(ciLat) : undefined,
        lng: ciLng ? parseFloat(ciLng) : undefined,
      };
      const res = await api.post('/scheduling/attendance/checkin', body);
      const d = res.data;
      if (d.requiresApproval) {
        setInfo(`Check-in recorded but requires manager approval (${d.distanceM}m from location).`);
      } else if (d.warning) {
        setInfo(`Check-in recorded with warning: ${d.distanceM}m from location.`);
      } else {
        setInfo('Check-in successful.');
      }
      if (tab === 'dashboard') loadDashboard();
    } catch (err) {
      setError(err.response?.data?.error || 'Check-in failed.');
    } finally {
      setCiSubmitting(false);
    }
  }

  async function handleCheckOut(e) {
    e.preventDefault();
    if (!coStaff) return setError('Select a staff member.');
    setCoSubmitting(true);
    setError('');
    setInfo('');
    try {
      const body = {
        staffId: coStaff,
        lat: coLat ? parseFloat(coLat) : undefined,
        lng: coLng ? parseFloat(coLng) : undefined,
      };
      await api.post('/scheduling/attendance/checkout', body);
      setInfo('Check-out successful.');
      if (tab === 'dashboard') loadDashboard();
    } catch (err) {
      setError(err.response?.data?.error || 'Check-out failed.');
    } finally {
      setCoSubmitting(false);
    }
  }

  async function handleManualEntry(e) {
    e.preventDefault();
    if (!mStaff || !mDate || !mStatus) return setError('Staff, date, and status are required.');
    setMSubmitting(true);
    setError('');
    setInfo('');
    try {
      await api.post('/scheduling/attendance/manual', {
        staffId: mStaff,
        date: mDate,
        status: mStatus,
        notes: mNotes || undefined,
      });
      setInfo('Attendance recorded.');
      setMNotes('');
      if (tab === 'records') loadRecords();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save attendance.');
    } finally {
      setMSubmitting(false);
    }
  }

  async function handleApprove(id) {
    try {
      await api.patch(`/scheduling/attendance/${id}/approve`);
      loadDashboard();
      loadRecords();
    } catch {
      setError('Approval failed.');
    }
  }

  async function handleGenerateQr() {
    if (!qrStaff) return;
    setQrLoading(true);
    setQrToken('');
    try {
      const res = await api.post(`/scheduling/staff/${qrStaff}/qr-token`);
      setQrToken(res.data.qrToken);
    } catch {
      setError('Failed to generate QR token.');
    } finally {
      setQrLoading(false);
    }
  }

  // ── Shift state ──────────────────────────────────────────────────────────
  const [shifts, setShifts] = useState([]);
  const [shiftAssignments, setShiftAssignments] = useState([]);
  const [shiftForm, setShiftForm] = useState({ name: '', type: 'FIXED', startTime: '09:00', endTime: '18:00', splitStartTime2: '', splitEndTime2: '', breakMinutes: 60, graceLateMinutes: 10 });
  const [editingShiftId, setEditingShiftId] = useState('');
  const [shiftAssignForm, setShiftAssignForm] = useState({ staffId: '', shiftId: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '' });
  const [shiftBusy, setShiftBusy] = useState(false);

  const loadShifts = useCallback(async () => {
    const [s, a] = await Promise.all([
      api.get('/scheduling/shifts').then(r => r.data).catch(() => []),
      api.get('/scheduling/shift-assignments').then(r => r.data).catch(() => []),
    ]);
    setShifts(s);
    setShiftAssignments(a);
  }, []);

  useEffect(() => { if (tab === 'shifts') loadShifts(); }, [tab, loadShifts]);

  async function handleSaveShift(e) {
    e.preventDefault();
    setShiftBusy(true);
    setError('');
    try {
      const body = {
        name: shiftForm.name,
        type: shiftForm.type,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        splitStartTime2: shiftForm.splitStartTime2 || undefined,
        splitEndTime2: shiftForm.splitEndTime2 || undefined,
        breakMinutes: parseInt(shiftForm.breakMinutes, 10) || 0,
        graceLateMinutes: parseInt(shiftForm.graceLateMinutes, 10) || 0,
      };
      if (editingShiftId) {
        await api.patch(`/scheduling/shifts/${editingShiftId}`, body);
        setInfo('Shift updated.');
      } else {
        await api.post('/scheduling/shifts', body);
        setInfo('Shift created.');
      }
      setEditingShiftId('');
      setShiftForm({ name: '', type: 'FIXED', startTime: '09:00', endTime: '18:00', splitStartTime2: '', splitEndTime2: '', breakMinutes: 60, graceLateMinutes: 10 });
      loadShifts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save shift.');
    } finally {
      setShiftBusy(false);
    }
  }

  async function handleDeleteShift(id) {
    if (!window.confirm('Archive this shift?')) return;
    try { await api.delete(`/scheduling/shifts/${id}`); loadShifts(); } catch { setError('Failed to delete shift.'); }
  }

  async function handleAssignShift(e) {
    e.preventDefault();
    setShiftBusy(true);
    setError('');
    try {
      await api.post('/scheduling/shift-assignments', {
        staffId: shiftAssignForm.staffId,
        shiftId: shiftAssignForm.shiftId,
        effectiveFrom: shiftAssignForm.effectiveFrom,
        effectiveTo: shiftAssignForm.effectiveTo || undefined,
      });
      setInfo('Shift assigned.');
      setShiftAssignForm({ staffId: '', shiftId: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '' });
      loadShifts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign shift.');
    } finally {
      setShiftBusy(false);
    }
  }

  async function handleDeleteAssignment(id) {
    try { await api.delete(`/scheduling/shift-assignments/${id}`); loadShifts(); } catch { setError('Failed to remove assignment.'); }
  }

  // ── Reports state ─────────────────────────────────────────────────────────
  const [reportType, setReportType] = useState('monthly');
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportFrom, setReportFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [reportStaff, setReportStaff] = useState('');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  async function loadReport() {
    setReportLoading(true);
    setError('');
    try {
      let res;
      if (reportType === 'monthly') {
        res = await api.get(`/scheduling/reports/attendance/monthly?year=${reportYear}&month=${reportMonth}${reportStaff ? `&staffId=${reportStaff}` : ''}`);
      } else if (reportType === 'daily') {
        res = await api.get(`/scheduling/reports/attendance/daily?date=${reportFrom}`);
      } else if (reportType === 'late') {
        res = await api.get(`/scheduling/reports/attendance/late-arrivals?from=${reportFrom}&to=${reportTo}`);
      } else if (reportType === 'overtime') {
        res = await api.get(`/scheduling/reports/attendance/overtime?from=${reportFrom}&to=${reportTo}`);
      }
      setReportData(res.data);
    } catch {
      setError('Failed to load report.');
    } finally {
      setReportLoading(false);
    }
  }

  function useCurrentLocation(setLat, setLng) {
    if (!navigator.geolocation) return setError('Geolocation not supported by this browser.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
      },
      () => setError('Could not get location. Please enter manually.'),
    );
  }

  const TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'records', label: 'Records' },
    { id: 'checkin', label: 'Check-In' },
    { id: 'checkout', label: 'Check-Out' },
    { id: 'manual', label: 'Manual Entry' },
    { id: 'qr', label: 'QR Code' },
    { id: 'shifts', label: 'Shifts' },
    { id: 'reports', label: 'Reports' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Attendance" subtitle="Geo check-in, check-out, and attendance tracking" />

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(''); setInfo(''); }}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {info && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {info}
          </div>
        )}

        {/* Dashboard tab */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button onClick={loadDashboard} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : summary ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <SummaryCard label="Total Staff" value={summary.totalStaff} />
                  <SummaryCard label="Present" value={summary.present} color="text-green-600 dark:text-green-400" />
                  <SummaryCard label="Absent" value={summary.absent} color="text-red-600 dark:text-red-400" />
                  <SummaryCard label="Half Day" value={summary.halfDay} color="text-yellow-600 dark:text-yellow-400" />
                  <SummaryCard label="On Leave" value={summary.onLeave} color="text-blue-600 dark:text-blue-400" />
                  <SummaryCard label="WFH" value={summary.wfh} color="text-sky-600 dark:text-sky-400" />
                  <SummaryCard label="Field Duty" value={summary.fieldDuty} color="text-orange-600 dark:text-orange-400" />
                  <SummaryCard label="Pending Approval" value={summary.pendingApproval} color="text-amber-600 dark:text-amber-400" />
                </div>

                {summary.records.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Today&apos;s Records</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase">
                          <tr>
                            <th className="px-4 py-2 text-left">Staff</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Check-In</th>
                            <th className="px-4 py-2 text-left">Check-Out</th>
                            <th className="px-4 py-2 text-left">Duration</th>
                            <th className="px-4 py-2 text-left">Source</th>
                            <th className="px-4 py-2 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {summary.records.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                {r.staff?.name || '—'}
                              </td>
                              <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtTime(r.checkInTime)}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtTime(r.checkOutTime)}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtDuration(r.workingMinutes)}</td>
                              <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{r.checkInSource || '—'}</td>
                              <td className="px-4 py-3">
                                {r.outsideRadius && !r.approvedAt && (
                                  <button
                                    onClick={() => handleApprove(r.id)}
                                    className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                                  >
                                    <UserCheck className="w-3 h-3" /> Approve
                                  </button>
                                )}
                                {r.outsideRadius && r.approvedAt && (
                                  <span className="text-xs text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Approved
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Records tab */}
        {tab === 'records' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Staff</label>
                <select
                  value={filterStaff}
                  onChange={e => setFilterStaff(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">All Staff</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                <select
                  value={filterLocation}
                  onChange={e => setFilterLocation(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">All Locations</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <button onClick={loadRecords} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <RefreshCw className="w-4 h-4" /> Search
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Attendance Records</h3>
                  <span className="text-xs text-slate-500">{totalRecords} records</span>
                </div>
                {records.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">No records found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Staff</th>
                          <th className="px-4 py-2 text-left">Location</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Check-In</th>
                          <th className="px-4 py-2 text-left">Check-Out</th>
                          <th className="px-4 py-2 text-left">Duration</th>
                          <th className="px-4 py-2 text-left">Geo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {records.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {new Date(r.date).toLocaleDateString('en-IN')}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{r.staff?.name}</td>
                            <td className="px-4 py-3 text-slate-500">{r.location?.name || '—'}</td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtTime(r.checkInTime)}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtTime(r.checkOutTime)}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtDuration(r.workingMinutes)}</td>
                            <td className="px-4 py-3">
                              {r.outsideRadius ? (
                                <span className="flex items-center gap-1 text-xs text-amber-600">
                                  <MapPin className="w-3 h-3" />
                                  {r.checkInDistanceM ? `${r.checkInDistanceM}m` : 'Outside'}
                                </span>
                              ) : r.checkInLat ? (
                                <span className="flex items-center gap-1 text-xs text-green-600">
                                  <MapPin className="w-3 h-3" /> In-range
                                </span>
                              ) : '—'}
                            </td>
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

        {/* Check-In tab */}
        {tab === 'checkin' && (
          <div className="max-w-lg">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <LogIn className="w-5 h-5" />
                <h3 className="font-semibold">Staff Check-In</h3>
              </div>
              <form onSubmit={handleCheckIn} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Staff Member *</label>
                  <select
                    value={ciStaff}
                    onChange={e => setCiStaff(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select staff…</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Location</label>
                  <select
                    value={ciLocation}
                    onChange={e => setCiLocation(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">No specific location</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Source</label>
                  <select
                    value={ciSource}
                    onChange={e => setCiSource(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="GEO">Geo (GPS)</option>
                    <option value="MANUAL">Manual</option>
                    <option value="BIOMETRIC">Biometric</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    GPS Coordinates
                    <button
                      type="button"
                      onClick={() => useCurrentLocation(setCiLat, setCiLng)}
                      className="ml-2 text-xs text-blue-600 hover:underline"
                    >
                      Use my location
                    </button>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="Latitude"
                      value={ciLat}
                      onChange={e => setCiLat(e.target.value)}
                      className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Longitude"
                      value={ciLng}
                      onChange={e => setCiLng(e.target.value)}
                      className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={ciSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                >
                  {ciSubmitting ? <Spinner size={16} /> : <LogIn className="w-4 h-4" />}
                  Check In
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Check-Out tab */}
        {tab === 'checkout' && (
          <div className="max-w-lg">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              <div className="flex items-center gap-2 text-red-600">
                <LogOut className="w-5 h-5" />
                <h3 className="font-semibold">Staff Check-Out</h3>
              </div>
              <form onSubmit={handleCheckOut} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Staff Member *</label>
                  <select
                    value={coStaff}
                    onChange={e => setCoStaff(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select staff…</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    GPS Coordinates (optional)
                    <button
                      type="button"
                      onClick={() => useCurrentLocation(setCoLat, setCoLng)}
                      className="ml-2 text-xs text-blue-600 hover:underline"
                    >
                      Use my location
                    </button>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="Latitude"
                      value={coLat}
                      onChange={e => setCoLat(e.target.value)}
                      className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Longitude"
                      value={coLng}
                      onChange={e => setCoLng(e.target.value)}
                      className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={coSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
                >
                  {coSubmitting ? <Spinner size={16} /> : <LogOut className="w-4 h-4" />}
                  Check Out
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Manual Entry tab */}
        {tab === 'manual' && (
          <div className="max-w-lg">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <ClipboardEdit className="w-5 h-5" />
                <h3 className="font-semibold">Manual Attendance Entry</h3>
              </div>
              <form onSubmit={handleManualEntry} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Staff Member *</label>
                  <select
                    value={mStaff}
                    onChange={e => setMStaff(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select staff…</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                  <input
                    type="date"
                    value={mDate}
                    onChange={e => setMDate(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status *</label>
                  <select
                    value={mStatus}
                    onChange={e => setMStatus(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    {ATTENDANCE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                  <textarea
                    value={mNotes}
                    onChange={e => setMNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes…"
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={mSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {mSubmitting ? <Spinner size={16} /> : <ClipboardEdit className="w-4 h-4" />}
                  Save Attendance
                </button>
              </form>
            </div>
          </div>
        )}

        {/* QR Code tab */}
        {tab === 'qr' && (
          <div className="max-w-lg">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              <div className="flex items-center gap-2 text-purple-600">
                <QrCode className="w-5 h-5" />
                <h3 className="font-semibold">Generate QR Check-In Token</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Generate a unique QR token for a staff member. Display the QR code at the location for contactless check-in.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Staff Member</label>
                <select
                  value={qrStaff}
                  onChange={e => { setQrStaff(e.target.value); setQrToken(''); }}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select staff…</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button
                onClick={handleGenerateQr}
                disabled={!qrStaff || qrLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
              >
                {qrLoading ? <Spinner size={16} /> : <QrCode className="w-4 h-4" />}
                Generate / Regenerate Token
              </button>
              {qrToken && (
                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg space-y-2">
                  <p className="text-xs font-medium text-slate-500 uppercase">QR Token</p>
                  <p className="font-mono text-sm break-all text-slate-900 dark:text-white">{qrToken}</p>
                  <p className="text-xs text-slate-400">
                    Use this token in a QR code pointing to your check-in kiosk. Staff scan this to check in without GPS.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Shifts tab */}
        {tab === 'shifts' && (
          <div className="space-y-6">
            {/* Shift builder */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {editingShiftId ? 'Edit Shift' : 'New Shift Template'}
                </h3>
                <form onSubmit={handleSaveShift} className="space-y-3">
                  <input
                    placeholder="Shift name (e.g. Morning, Night)"
                    value={shiftForm.name}
                    onChange={e => setShiftForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                  />
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Shift Type</label>
                    <select
                      value={shiftForm.type}
                      onChange={e => setShiftForm(f => ({ ...f, type: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="FIXED">Fixed</option>
                      <option value="ROTATIONAL">Rotational</option>
                      <option value="SPLIT">Split</option>
                      <option value="FLEXIBLE">Flexible</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Start Time</label>
                      <input type="time" value={shiftForm.startTime} onChange={e => setShiftForm(f => ({ ...f, startTime: e.target.value }))} required className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">End Time</label>
                      <input type="time" value={shiftForm.endTime} onChange={e => setShiftForm(f => ({ ...f, endTime: e.target.value }))} required className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  {shiftForm.type === 'SPLIT' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Split Start 2</label>
                        <input type="time" value={shiftForm.splitStartTime2} onChange={e => setShiftForm(f => ({ ...f, splitStartTime2: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Split End 2</label>
                        <input type="time" value={shiftForm.splitEndTime2} onChange={e => setShiftForm(f => ({ ...f, splitEndTime2: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Break (mins)</label>
                      <input type="number" min={0} value={shiftForm.breakMinutes} onChange={e => setShiftForm(f => ({ ...f, breakMinutes: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Late grace (mins)</label>
                      <input type="number" min={0} value={shiftForm.graceLateMinutes} onChange={e => setShiftForm(f => ({ ...f, graceLateMinutes: e.target.value }))} className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={shiftBusy} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                      {shiftBusy ? <Spinner size={14} /> : <Plus className="w-4 h-4" />}
                      {editingShiftId ? 'Save Changes' : 'Create Shift'}
                    </button>
                    {editingShiftId && (
                      <button type="button" onClick={() => { setEditingShiftId(''); setShiftForm({ name: '', type: 'FIXED', startTime: '09:00', endTime: '18:00', splitStartTime2: '', splitEndTime2: '', breakMinutes: 60, graceLateMinutes: 10 }); }} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm">Cancel</button>
                    )}
                  </div>
                </form>
              </div>

              {/* Shift list */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm text-slate-900 dark:text-white">
                  Shift Templates ({shifts.length})
                </div>
                {shifts.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">No shifts yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {shifts.map(s => (
                      <li key={s.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="font-medium text-sm text-slate-900 dark:text-white">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.type} · {s.startTime}–{s.endTime} · {s.breakMinutes}m break · {s.graceLateMinutes}m grace</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingShiftId(s.id); setShiftForm({ name: s.name, type: s.type, startTime: s.startTime, endTime: s.endTime, splitStartTime2: s.splitStartTime2 || '', splitEndTime2: s.splitEndTime2 || '', breakMinutes: s.breakMinutes, graceLateMinutes: s.graceLateMinutes }); }} className="p-1.5 text-slate-400 hover:text-blue-600">
                            <PencilLine className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteShift(s.id)} className="p-1.5 text-slate-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Assign shift to staff */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">Assign Shift to Staff</h3>
              <form onSubmit={handleAssignShift} className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Staff</label>
                  <select value={shiftAssignForm.staffId} onChange={e => setShiftAssignForm(f => ({ ...f, staffId: e.target.value }))} required className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select staff…</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Shift</label>
                  <select value={shiftAssignForm.shiftId} onChange={e => setShiftAssignForm(f => ({ ...f, shiftId: e.target.value }))} required className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select shift…</option>
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Effective From</label>
                  <input type="date" value={shiftAssignForm.effectiveFrom} onChange={e => setShiftAssignForm(f => ({ ...f, effectiveFrom: e.target.value }))} required className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Effective To (optional)</label>
                  <input type="date" value={shiftAssignForm.effectiveTo} onChange={e => setShiftAssignForm(f => ({ ...f, effectiveTo: e.target.value }))} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                </div>
                <button type="submit" disabled={shiftBusy} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                  {shiftBusy ? <Spinner size={14} /> : <Plus className="w-4 h-4" />} Assign
                </button>
              </form>
            </div>

            {/* Assignments list */}
            {shiftAssignments.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm">Current Assignments</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Staff</th>
                        <th className="px-4 py-2 text-left">Shift</th>
                        <th className="px-4 py-2 text-left">From</th>
                        <th className="px-4 py-2 text-left">To</th>
                        <th className="px-4 py-2 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {shiftAssignments.map(a => (
                        <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3 font-medium">{a.staff?.name}</td>
                          <td className="px-4 py-3">{a.shift?.name} <span className="text-xs text-slate-400">({a.shift?.startTime}–{a.shift?.endTime})</span></td>
                          <td className="px-4 py-3 text-slate-500">{new Date(a.effectiveFrom).toLocaleDateString('en-IN')}</td>
                          <td className="px-4 py-3 text-slate-500">{a.effectiveTo ? new Date(a.effectiveTo).toLocaleDateString('en-IN') : 'Ongoing'}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleDeleteAssignment(a.id)} className="text-slate-400 hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
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
        )}

        {/* Reports tab */}
        {tab === 'reports' && (
          <div className="space-y-5">
            {/* Report controls */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Attendance Reports
              </h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Report Type</label>
                  <select value={reportType} onChange={e => { setReportType(e.target.value); setReportData(null); }} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                    <option value="monthly">Monthly Attendance</option>
                    <option value="daily">Daily Attendance</option>
                    <option value="late">Late Arrivals</option>
                    <option value="overtime">Overtime</option>
                  </select>
                </div>

                {reportType === 'monthly' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
                      <input type="number" value={reportYear} onChange={e => setReportYear(e.target.value)} min={2020} max={2099} className="w-24 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
                      <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                        {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Staff (optional)</label>
                      <select value={reportStaff} onChange={e => setReportStaff(e.target.value)} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm">
                        <option value="">All Staff</option>
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {(reportType === 'daily') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                    <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}

                {(reportType === 'late' || reportType === 'overtime') && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                      <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                      <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </>
                )}

                <button onClick={loadReport} disabled={reportLoading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                  {reportLoading ? <Spinner size={14} /> : <BarChart3 className="w-4 h-4" />} Generate Report
                </button>
              </div>
            </div>

            {/* Monthly report: heatmap grid */}
            {reportType === 'monthly' && Array.isArray(reportData) && reportData.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-auto">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm">
                  Monthly Attendance — {['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][reportMonth]} {reportYear}
                </div>
                <table className="text-xs min-w-max">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="px-3 py-2 text-left sticky left-0 bg-slate-50 dark:bg-slate-700/50">Staff</th>
                      {reportData[0]?.grid.map(g => (
                        <th key={g.date} className="px-1 py-2 text-center w-8">{new Date(g.date).getDate()}</th>
                      ))}
                      <th className="px-3 py-2 text-center">P</th>
                      <th className="px-3 py-2 text-center">A</th>
                      <th className="px-3 py-2 text-center">H</th>
                      <th className="px-3 py-2 text-center">L</th>
                      <th className="px-3 py-2 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {reportData.map(row => (
                      <tr key={row.staff.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-3 py-2 font-medium sticky left-0 bg-white dark:bg-slate-800 whitespace-nowrap">{row.staff.name}</td>
                        {row.grid.map(g => {
                          const bg = {
                            PRESENT: 'bg-green-400', HALF_DAY: 'bg-yellow-400',
                            ABSENT: 'bg-red-200 dark:bg-red-900/40', LEAVE: 'bg-blue-300',
                            HOLIDAY: 'bg-purple-300', WFH: 'bg-sky-300', FIELD_DUTY: 'bg-orange-300',
                          }[g.status] || 'bg-slate-100';
                          return (
                            <td key={g.date} className="px-1 py-2 text-center">
                              <span className={`inline-block w-6 h-6 rounded text-center leading-6 text-[10px] font-bold ${bg}`} title={g.status}>
                                {g.status === 'ABSENT' ? '–' : g.status?.[0]}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-medium text-green-700 dark:text-green-400">{row.summary.present}</td>
                        <td className="px-3 py-2 text-center font-medium text-red-600 dark:text-red-400">{row.summary.absent}</td>
                        <td className="px-3 py-2 text-center font-medium text-yellow-600">{row.summary.halfDay}</td>
                        <td className="px-3 py-2 text-center font-medium text-blue-600">{row.summary.leave}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{(row.summary.totalWorkingMinutes / 60).toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Daily report */}
            {reportType === 'daily' && Array.isArray(reportData) && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm">Daily Report — {reportFrom}</div>
                {reportData.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm">No records for this date.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Staff</th>
                        <th className="px-4 py-2 text-left">Shift</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Check-In</th>
                        <th className="px-4 py-2 text-left">Check-Out</th>
                        <th className="px-4 py-2 text-left">Duration</th>
                        <th className="px-4 py-2 text-left">Late?</th>
                        <th className="px-4 py-2 text-right">Overtime</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {reportData.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3 font-medium">{r.staff?.name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{r.shiftName || '—'}</td>
                          <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                          <td className="px-4 py-3">{fmtTime(r.checkInTime)}</td>
                          <td className="px-4 py-3">{fmtTime(r.checkOutTime)}</td>
                          <td className="px-4 py-3">{fmtDuration(r.workingMinutes)}</td>
                          <td className="px-4 py-3">
                            {r.isLate ? <span className="text-xs text-red-600 font-medium">Late</span> : <span className="text-xs text-green-600">On time</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.overtimeMinutes > 0 ? <span className="text-xs text-orange-600 font-medium">+{fmtDuration(r.overtimeMinutes)}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Late arrivals report */}
            {reportType === 'late' && Array.isArray(reportData) && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm">Late Arrivals — {reportFrom} to {reportTo} ({reportData.length} records)</div>
                {reportData.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm">No late arrivals in this period.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Staff</th>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Shift Start</th>
                        <th className="px-4 py-2 text-left">Check-In</th>
                        <th className="px-4 py-2 text-right">Late By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {reportData.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3 font-medium">{r.staffName}</td>
                          <td className="px-4 py-3 text-slate-500">{r.date}</td>
                          <td className="px-4 py-3 text-slate-500">{r.shiftStartTime}</td>
                          <td className="px-4 py-3">{fmtTime(r.checkInTime)}</td>
                          <td className="px-4 py-3 text-right font-medium text-red-600">+{fmtDuration(r.lateByMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Overtime report */}
            {reportType === 'overtime' && Array.isArray(reportData) && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm">Overtime — {reportFrom} to {reportTo} ({reportData.length} records)</div>
                {reportData.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm">No overtime in this period.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Staff</th>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Duration</th>
                        <th className="px-4 py-2 text-left">Shift Duration</th>
                        <th className="px-4 py-2 text-right">Overtime</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {reportData.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3 font-medium">{r.staff?.name}</td>
                          <td className="px-4 py-3 text-slate-500">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                          <td className="px-4 py-3">{fmtDuration(r.workingMinutes)}</td>
                          <td className="px-4 py-3 text-slate-500">{fmtDuration(r.shiftMins)}</td>
                          <td className="px-4 py-3 text-right font-medium text-orange-600">+{fmtDuration(r.overtimeMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
