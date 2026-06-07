import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? '';

export default function PublicBook() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsSearched, setSlotsSearched] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [booked, setBooked] = useState(null);
  const [collectAdvance, setCollectAdvance] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    serviceId: '',
    locationId: '',
    staffId: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing booking link.');
      setLoading(false);
      return;
    }
    axios
      .get(`${baseURL}/public/booking/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setCatalog(data);
        setCollectAdvance(Boolean(data.collectAdvance));
        setForm((f) => ({
          ...f,
          serviceId: data.services?.[0]?.id || '',
          locationId: data.locations?.[0]?.id || '',
        }));
      })
      .catch((e) => setError(e.response?.data?.error || 'Could not load booking page'))
      .finally(() => setLoading(false));
  }, [token]);

  async function loadSlots() {
    if (!form.serviceId || !form.date) return;
    setLoadingSlots(true);
    setError('');
    setSlotsSearched(false);
    setWaitlistJoined(false);
    try {
      const { data } = await axios.get(
        `${baseURL}/public/booking/${encodeURIComponent(token)}/slots`,
        {
          params: {
            serviceId: form.serviceId,
            locationId: form.locationId || undefined,
            staffId: form.staffId || undefined,
            date: form.date,
          },
        },
      );
      setSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load slots');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
      setSlotsSearched(true);
    }
  }

  async function joinWaitlist() {
    if (!form.phone) {
      setError('Phone number is required');
      return;
    }
    if (!form.serviceId || !form.locationId) {
      setError('Select service and location');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await axios.post(`${baseURL}/public/booking/${encodeURIComponent(token)}/waitlist`, {
        phone: form.phone,
        name: form.name || undefined,
        email: form.email || undefined,
        serviceId: form.serviceId,
        locationId: form.locationId,
        staffId: form.staffId || undefined,
        preferredDate: form.date,
      });
      setWaitlistJoined(true);
      setInfo('You are on the waitlist. We will contact you when a slot opens.');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not join waitlist');
    } finally {
      setBusy(false);
    }
  }

  async function bookSlot(slot) {
    if (!form.phone) {
      setError('Phone number is required');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const { data } = await axios.post(`${baseURL}/public/booking/${encodeURIComponent(token)}`, {
        phone: form.phone,
        name: form.name || undefined,
        email: form.email || undefined,
        serviceId: form.serviceId,
        locationId: slot.locationId || form.locationId,
        staffId: slot.staffId,
        startAt: slot.startAt,
        collectAdvance,
        notes: form.notes || undefined,
      });
      setBooked(data);
      setInfo('Appointment booked successfully!');
      setSlots([]);
    } catch (e) {
      setError(e.response?.data?.error || 'Booking failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600">
        Loading…
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="rounded-2xl border border-red-200 bg-white dark:bg-slate-900 p-6 max-w-md text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const businessName = catalog?.business?.name || 'Book appointment';
  const selectedService = catalog?.services?.find((s) => s.id === form.serviceId);

  if (booked?.appointment) {
    const appt = booked.appointment;
    const tz = appt.location?.timezone || 'Asia/Kolkata';
    const when = new Date(appt.startAt).toLocaleString('en-IN', { timeZone: tz });
    let manageToken = '';
    try {
      manageToken = booked.manageUrl ? new URL(booked.manageUrl).searchParams.get('token') || '' : '';
    } catch {
      manageToken = '';
    }
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
        <div className="max-w-lg mx-auto space-y-4 text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">You&apos;re booked!</h1>
          <p className="text-slate-500 text-sm">Ref {appt.appointmentNumber}</p>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-sm text-left space-y-2">
            <div><span className="text-slate-500">Service:</span> {appt.service?.name}</div>
            <div><span className="text-slate-500">When:</span> {when}</div>
            <div><span className="text-slate-500">Staff:</span> {appt.staff?.name}</div>
            <div><span className="text-slate-500">Location:</span> {appt.location?.name}</div>
          </div>
          {booked.paymentIntent?.paymentLinkUrl && (
            <a
              href={booked.paymentIntent.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-xl bg-brand-600 text-white px-5 py-2.5 text-sm font-semibold"
            >
              Pay advance now
            </a>
          )}
          {booked.manageUrl && (
            <a
              href={booked.manageUrl}
              className="inline-block rounded-xl border px-5 py-2.5 text-sm font-semibold"
            >
              Manage your booking
            </a>
          )}
          {manageToken && (
            <a
              href={`${baseURL}/public/appointments/${encodeURIComponent(manageToken)}/calendar.ics`}
              className="inline-block text-sm font-semibold text-brand-600 hover:underline"
            >
              Add to calendar (.ics)
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{businessName}</h1>
          <p className="text-slate-500 text-sm mt-1">Book an appointment online</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
        {info && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2">{info}</div>}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <input
            placeholder="Your name"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            placeholder="Phone (10 digits)"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <input
            type="email"
            placeholder="Email (optional)"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <select
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={form.serviceId}
            onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}
          >
            <option value="">Select service</option>
            {(catalog?.services || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.category?.name ? `${s.category.name} — ` : ''}{s.name} ({s.durationMin}m)
              </option>
            ))}
          </select>
          <select
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={form.locationId}
            onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
          >
            <option value="">Select location</option>
            {(catalog?.locations || []).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {(catalog?.staff || []).length > 0 && (
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={form.staffId}
              onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
            >
              <option value="">Any available staff</option>
              {(catalog?.staff || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.designation ? ` · ${s.designation}` : ''}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <textarea
            placeholder="Notes for the business (optional)"
            className="w-full rounded-xl border px-3 py-2 text-sm min-h-[72px]"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          {collectAdvance && (
            <p className="text-xs text-slate-500">Advance payment may be requested after booking (Razorpay).</p>
          )}
          <button
            type="button"
            disabled={!form.serviceId || !form.locationId}
            onClick={loadSlots}
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Find available slots
          </button>
        </div>

        {selectedService && (
          <p className="text-xs text-slate-500 text-center">
            {selectedService.name} · ₹{Number(selectedService.price || 0).toLocaleString('en-IN')}
          </p>
        )}

        {loadingSlots && <p className="text-sm text-slate-500 text-center">Loading slots…</p>}

        {!loadingSlots && slots.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
            <div className="font-semibold text-sm">Available slots</div>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={`${s.staffId}-${s.startAt}`}
                  type="button"
                  disabled={busy || !form.phone}
                  onClick={() => bookSlot(s)}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {new Date(s.startAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  {' · '}{s.staffName}
                </button>
              ))}
            </div>
          </div>
        )}
        {slotsSearched && !loadingSlots && slots.length === 0 && form.serviceId && form.locationId && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="font-semibold text-sm text-amber-900 dark:text-amber-200">No slots available</div>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Join the waitlist and we will notify you when a slot opens for {form.date}.
            </p>
            {!waitlistJoined ? (
              <button
                type="button"
                disabled={busy || !form.phone}
                onClick={joinWaitlist}
                className="w-full rounded-xl bg-amber-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Join waitlist
              </button>
            ) : (
              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">You are on the waitlist.</p>
            )}
          </div>
        )}
        {!loadingSlots && !slotsSearched && form.serviceId && (
          <p className="text-sm text-slate-500 text-center">Pick a date and tap Find available slots.</p>
        )}
      </div>
    </div>
  );
}
