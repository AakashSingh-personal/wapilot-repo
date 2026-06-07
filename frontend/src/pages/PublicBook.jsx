import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Calendar, Clock, User, Phone, Mail, MapPin, FileText,
  AlertCircle, CheckCircle2, Loader2, Users, ClipboardList,
} from 'lucide-react';

const baseURL = import.meta.env.VITE_API_URL ?? '';

// ── Shared styles ─────────────────────────────────────────────────────────
const inputCls =
  'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors';
const selectCls =
  'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors';

function Field({ icon: Icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </label>
      {children}
    </div>
  );
}

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
    if (!form.phone) { setError('Phone number is required'); return; }
    if (!form.serviceId || !form.locationId) { setError('Select service and location'); return; }
    setBusy(true); setError(''); setInfo('');
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
    if (!form.phone) { setError('Phone number is required'); return; }
    setBusy(true); setError(''); setInfo('');
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-sm text-neutral-500">Loading booking page…</p>
        </div>
      </div>
    );
  }

  // ── Fatal error ───────────────────────────────────────────────────────────
  if (error && !catalog) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="max-w-md w-full rounded-2xl border border-red-200 dark:border-red-800 bg-white dark:bg-neutral-900 p-6 text-center space-y-3 shadow-md">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  const businessName = catalog?.business?.name || 'Book appointment';
  const selectedService = catalog?.services?.find((s) => s.id === form.serviceId);

  // ── Booking confirmed ─────────────────────────────────────────────────────
  if (booked?.appointment) {
    const appt = booked.appointment;
    const tz = appt.location?.timezone || 'Asia/Kolkata';
    const when = new Date(appt.startAt).toLocaleString('en-IN', { timeZone: tz });
    let manageToken = '';
    try {
      manageToken = booked.manageUrl ? new URL(booked.manageUrl).searchParams.get('token') || '' : '';
    } catch { manageToken = ''; }

    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-12 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 mb-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">You&apos;re booked!</h1>
            <p className="text-sm text-neutral-500">
              Ref{' '}
              <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                {appt.appointmentNumber}
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-neutral-800 shadow-sm">
            {[
              { icon: ClipboardList, label: 'Service', value: appt.service?.name },
              { icon: Clock, label: 'When', value: when },
              { icon: User, label: 'Staff', value: appt.staff?.name },
              { icon: MapPin, label: 'Location', value: appt.location?.name },
            ].map(({ icon: Icon, label, value }) =>
              value ? (
                <div key={label} className="flex items-center gap-3 px-5 py-3.5">
                  <Icon className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 w-16 shrink-0">{label}</span>
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{value}</span>
                </div>
              ) : null,
            )}
          </div>

          <div className="space-y-2">
            {booked.paymentIntent?.paymentLinkUrl && (
              <a
                href={booked.paymentIntent.paymentLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-3 text-sm font-semibold transition-colors"
              >
                Pay advance now
              </a>
            )}
            {booked.manageUrl && (
              <a
                href={booked.manageUrl}
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-5 py-3 text-sm font-semibold transition-colors"
              >
                Manage your booking
              </a>
            )}
            {manageToken && (
              <a
                href={`${baseURL}/public/appointments/${encodeURIComponent(manageToken)}/calendar.ics`}
                className="flex items-center justify-center gap-1.5 w-full text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline py-2"
              >
                <Calendar className="w-4 h-4" />
                Add to calendar (.ics)
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main booking form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Business header */}
        <div className="text-center space-y-1 pb-1">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{businessName}</h1>
          <p className="text-sm text-neutral-500">Book an appointment online</p>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {info && (
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm px-4 py-3">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            {info}
          </div>
        )}

        {/* Form card */}
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field icon={User} label="Your name">
              <input
                className={inputCls}
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field icon={Phone} label="Phone *">
              <input
                className={inputCls}
                placeholder="+91 99999 99999"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
          </div>

          <Field icon={Mail} label="Email (optional)">
            <input
              type="email"
              className={inputCls}
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>

          <Field icon={ClipboardList} label="Service">
            <select
              className={selectCls}
              value={form.serviceId}
              onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}
            >
              <option value="">Select service</option>
              {(catalog?.services || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.category?.name ? `${s.category.name} — ` : ''}
                  {s.name} ({s.durationMin}m)
                </option>
              ))}
            </select>
          </Field>

          {selectedService && (
            <p className="text-xs text-neutral-500 -mt-2 pl-0.5">
              {selectedService.name} · ₹{Number(selectedService.price || 0).toLocaleString('en-IN')} ·{' '}
              {selectedService.durationMin} min
            </p>
          )}

          <Field icon={MapPin} label="Location">
            <select
              className={selectCls}
              value={form.locationId}
              onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
            >
              <option value="">Select location</option>
              {(catalog?.locations || []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>

          {(catalog?.staff || []).length > 0 && (
            <Field icon={Users} label="Staff preference">
              <select
                className={selectCls}
                value={form.staffId}
                onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
              >
                <option value="">Any available staff</option>
                {(catalog?.staff || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.designation ? ` · ${s.designation}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field icon={Calendar} label="Preferred date">
            <input
              type="date"
              className={inputCls}
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>

          <Field icon={FileText} label="Notes (optional)">
            <textarea
              className={`${inputCls} min-h-[72px] resize-none`}
              placeholder="Any notes for the team…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>

          {collectAdvance && (
            <p className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800 rounded-lg px-3 py-2">
              Advance payment may be requested after booking via Razorpay.
            </p>
          )}

          <button
            type="button"
            disabled={!form.serviceId || !form.locationId}
            onClick={loadSlots}
            className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-200 dark:disabled:bg-neutral-800 text-white disabled:text-neutral-400 px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
          >
            Find available slots
          </button>
        </div>

        {/* Slot search loading */}
        {loadingSlots && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking availability…
          </div>
        )}

        {/* Available slots grid */}
        {!loadingSlots && slots.length > 0 && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-500" />
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Available slots</h2>
              <span className="ml-auto text-xs text-neutral-400">
                {slots.length} slot{slots.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={`${s.staffId}-${s.startAt}`}
                  type="button"
                  disabled={busy || !form.phone}
                  onClick={() => bookSlot(s)}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 hover:text-brand-700 dark:hover:text-brand-300 px-3.5 py-2 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-sm font-semibold">
                    {new Date(s.startAt).toLocaleString('en-IN', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">{s.staffName}</div>
                </button>
              ))}
            </div>
            {!form.phone && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Fill in your phone number above to book a slot.
              </p>
            )}
          </div>
        )}

        {/* No slots / waitlist */}
        {slotsSearched && !loadingSlots && slots.length === 0 && form.serviceId && form.locationId && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">No slots available</h2>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              No openings for {form.date}. Join the waitlist — we&apos;ll notify you when something opens up.
            </p>
            {!waitlistJoined ? (
              <button
                type="button"
                disabled={busy || !form.phone}
                onClick={joinWaitlist}
                className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                {busy ? 'Joining…' : 'Join waitlist'}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                You&apos;re on the waitlist!
              </div>
            )}
          </div>
        )}

        {/* Hint before first search */}
        {!loadingSlots && !slotsSearched && form.serviceId && (
          <p className="text-sm text-neutral-500 text-center">
            Pick a date and tap &ldquo;Find available slots&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
