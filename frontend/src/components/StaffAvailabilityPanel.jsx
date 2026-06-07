import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

const DAYS = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];

export default function StaffAvailabilityPanel({ staff, locations, onInfo, onError }) {
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [workingHours, setWorkingHours] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [breakForm, setBreakForm] = useState({
    dayOfWeek: 1,
    startTime: '13:00',
    endTime: '14:00',
    breakType: 'LUNCH',
  });
  const [leaveForm, setLeaveForm] = useState({
    startAt: '',
    endAt: '',
    reason: '',
  });
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    startAt: '',
    endAt: '',
  });

  const loadStaffData = useCallback(async (staffId) => {
    if (!staffId) {
      setWorkingHours([]);
      setBreaks([]);
      setLeaves([]);
      return;
    }
    try {
      const [whRes, brRes, lvRes, holRes] = await Promise.all([
        api.get(`/scheduling/staff/${staffId}/working-hours`),
        api.get(`/scheduling/staff/${staffId}/breaks`),
        api.get(`/scheduling/staff/${staffId}/leaves`),
        api.get('/scheduling/holidays'),
      ]);
      setWorkingHours(Array.isArray(whRes.data) ? whRes.data : []);
      setBreaks(Array.isArray(brRes.data) ? brRes.data : []);
      setLeaves(Array.isArray(lvRes.data) ? lvRes.data : []);
      setHolidays(Array.isArray(holRes.data) ? holRes.data : []);
    } catch (e) {
      onError?.(e.response?.data?.error || 'Could not load availability');
    }
  }, [onError]);

  useEffect(() => {
    void loadStaffData(selectedStaffId);
  }, [selectedStaffId, loadStaffData]);

  function hourRow(dayOfWeek) {
    const existing = workingHours.find((h) => h.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      startTime: existing?.startTime || '09:00',
      endTime: existing?.endTime || '18:00',
      enabled: Boolean(existing),
    };
  }

  const [weekForm, setWeekForm] = useState(DAYS.map((d) => hourRow(d.id)));

  useEffect(() => {
    setWeekForm(DAYS.map((d) => hourRow(d.id)));
  }, [workingHours]);

  async function saveWorkingHours(e) {
    e.preventDefault();
    if (!selectedStaffId) return onError?.('Select a staff member');
    const hours = weekForm
      .filter((d) => d.enabled)
      .map((d) => ({
        dayOfWeek: d.dayOfWeek,
        startTime: d.startTime,
        endTime: d.endTime,
        locationId: locations[0]?.id || null,
      }));
    try {
      await api.put(`/scheduling/staff/${selectedStaffId}/working-hours`, { hours });
      onInfo?.('Working hours saved');
      await loadStaffData(selectedStaffId);
    } catch (err) {
      onError?.(err.response?.data?.error || 'Could not save hours');
    }
  }

  async function addBreak(e) {
    e.preventDefault();
    if (!selectedStaffId) return;
    try {
      await api.post(`/scheduling/staff/${selectedStaffId}/breaks`, breakForm);
      onInfo?.('Break added');
      await loadStaffData(selectedStaffId);
    } catch (err) {
      onError?.(err.response?.data?.error || 'Could not add break');
    }
  }

  async function removeBreak(breakId) {
    try {
      await api.delete(`/scheduling/staff/${selectedStaffId}/breaks/${breakId}`);
      await loadStaffData(selectedStaffId);
    } catch (err) {
      onError?.(err.response?.data?.error || 'Could not remove break');
    }
  }

  async function addLeave(e) {
    e.preventDefault();
    if (!selectedStaffId || !leaveForm.startAt || !leaveForm.endAt) return;
    try {
      await api.post(`/scheduling/staff/${selectedStaffId}/leaves`, leaveForm);
      onInfo?.('Leave recorded');
      setLeaveForm({ startAt: '', endAt: '', reason: '' });
      await loadStaffData(selectedStaffId);
    } catch (err) {
      onError?.(err.response?.data?.error || 'Could not add leave');
    }
  }

  async function removeLeave(leaveId) {
    if (!selectedStaffId) return;
    try {
      await api.delete(`/scheduling/staff/${selectedStaffId}/leaves/${leaveId}`);
      await loadStaffData(selectedStaffId);
    } catch (err) {
      onError?.(err.response?.data?.error || 'Could not remove leave');
    }
  }

  async function reloadHolidays() {
    const holRes = await api.get('/scheduling/holidays');
    setHolidays(Array.isArray(holRes.data) ? holRes.data : []);
  }

  useEffect(() => {
    void reloadHolidays().catch(() => {});
  }, []);

  async function addHoliday(e) {
    e.preventDefault();
    if (!holidayForm.name || !holidayForm.startAt) return;
    try {
      await api.post('/scheduling/holidays', {
        ...holidayForm,
        endAt: holidayForm.endAt || holidayForm.startAt,
      });
      onInfo?.('Holiday added');
      setHolidayForm({ name: '', startAt: '', endAt: '' });
      await reloadHolidays();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Could not add holiday');
    }
  }

  async function removeHoliday(id) {
    try {
      await api.delete(`/scheduling/holidays/${id}`);
      onInfo?.('Holiday removed');
      await reloadHolidays();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Could not remove holiday');
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div className="font-semibold">Staff availability</div>
      <select
        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
        value={selectedStaffId}
        onChange={(e) => setSelectedStaffId(e.target.value)}
      >
        <option value="">Select staff</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {selectedStaffId && (
        <>
          <form onSubmit={saveWorkingHours} className="space-y-2">
            <div className="text-sm font-medium">Weekly working hours</div>
            {weekForm.map((row, idx) => (
              <div key={row.dayOfWeek} className="grid grid-cols-[4rem_1fr_1fr_auto] gap-2 items-center text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => {
                      const next = [...weekForm];
                      next[idx] = { ...row, enabled: e.target.checked };
                      setWeekForm(next);
                    }}
                  />
                  {DAYS.find((d) => d.id === row.dayOfWeek)?.label}
                </label>
                <input
                  type="time"
                  className="rounded-lg border px-2 py-1"
                  value={row.startTime}
                  disabled={!row.enabled}
                  onChange={(e) => {
                    const next = [...weekForm];
                    next[idx] = { ...row, startTime: e.target.value };
                    setWeekForm(next);
                  }}
                />
                <input
                  type="time"
                  className="rounded-lg border px-2 py-1"
                  value={row.endTime}
                  disabled={!row.enabled}
                  onChange={(e) => {
                    const next = [...weekForm];
                    next[idx] = { ...row, endTime: e.target.value };
                    setWeekForm(next);
                  }}
                />
              </div>
            ))}
            <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold">
              Save hours
            </button>
          </form>

          <form onSubmit={addBreak} className="grid sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="sm:col-span-4 text-sm font-medium">Recurring breaks</div>
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={breakForm.dayOfWeek}
              onChange={(e) => setBreakForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}
            >
              {DAYS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            <input type="time" className="rounded-lg border px-2 py-1 text-sm" value={breakForm.startTime} onChange={(e) => setBreakForm((f) => ({ ...f, startTime: e.target.value }))} />
            <input type="time" className="rounded-lg border px-2 py-1 text-sm" value={breakForm.endTime} onChange={(e) => setBreakForm((f) => ({ ...f, endTime: e.target.value }))} />
            <button type="submit" className="rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold px-3">Add</button>
            <ul className="sm:col-span-4 space-y-1 text-sm">
              {breaks.map((b) => (
                <li key={b.id} className="flex justify-between">
                  <span>{DAYS.find((d) => d.id === b.dayOfWeek)?.label} {b.startTime}–{b.endTime}</span>
                  <button type="button" className="text-red-600 text-xs" onClick={() => removeBreak(b.id)}>Remove</button>
                </li>
              ))}
            </ul>
          </form>

          <form onSubmit={addLeave} className="grid sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="sm:col-span-3 text-sm font-medium">Leave</div>
            <input type="datetime-local" className="rounded-lg border px-2 py-1 text-sm" value={leaveForm.startAt} onChange={(e) => setLeaveForm((f) => ({ ...f, startAt: e.target.value }))} />
            <input type="datetime-local" className="rounded-lg border px-2 py-1 text-sm" value={leaveForm.endAt} onChange={(e) => setLeaveForm((f) => ({ ...f, endAt: e.target.value }))} />
            <button type="submit" className="rounded-lg bg-slate-800 text-white text-sm font-semibold">Add leave</button>
            <ul className="sm:col-span-3 space-y-1 text-sm text-slate-600">
              {leaves.map((lv) => (
                <li key={lv.id} className="flex justify-between gap-2 items-center">
                  <span>
                    {new Date(lv.startAt).toLocaleString('en-IN')} – {new Date(lv.endAt).toLocaleString('en-IN')}
                    {lv.reason ? ` · ${lv.reason}` : ''}
                  </span>
                  <button type="button" className="text-xs text-red-600 font-semibold" onClick={() => removeLeave(lv.id)}>
                    Remove
                  </button>
                </li>
              ))}
              {!leaves.length && <li className="text-slate-500">No leave recorded.</li>}
            </ul>
          </form>
        </>
      )}

      <form onSubmit={addHoliday} className="grid sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="sm:col-span-3 text-sm font-medium">Business holidays</div>
        <input placeholder="Holiday name" className="rounded-lg border px-2 py-1 text-sm sm:col-span-3" value={holidayForm.name} onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} />
        <input type="date" className="rounded-lg border px-2 py-1 text-sm" value={holidayForm.startAt} onChange={(e) => setHolidayForm((f) => ({ ...f, startAt: e.target.value }))} />
        <input type="date" className="rounded-lg border px-2 py-1 text-sm" value={holidayForm.endAt} onChange={(e) => setHolidayForm((f) => ({ ...f, endAt: e.target.value }))} />
        <button type="submit" className="rounded-lg bg-slate-800 text-white text-sm font-semibold">Add holiday</button>
        <ul className="sm:col-span-3 space-y-1 text-sm text-slate-600">
          {holidays.map((h) => (
            <li key={h.id} className="flex justify-between gap-2 items-center">
              <span>
                {h.name} · {new Date(h.startAt).toLocaleDateString('en-IN')}
                {h.endAt && h.endAt !== h.startAt
                  ? ` – ${new Date(h.endAt).toLocaleDateString('en-IN')}`
                  : ''}
              </span>
              <button type="button" className="text-xs text-red-600 font-semibold" onClick={() => removeHoliday(h.id)}>
                Remove
              </button>
            </li>
          ))}
          {!holidays.length && <li className="text-slate-500">No holidays yet.</li>}
        </ul>
      </form>
    </div>
  );
}
