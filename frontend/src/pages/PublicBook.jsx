import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Calendar, Clock, User, Phone, Mail, MapPin, FileText,
  AlertCircle, CheckCircle2, Loader2, Users, ClipboardList, Star,
  ChevronDown, ChevronUp,
} from 'lucide-react';

const baseURL = import.meta.env.VITE_API_URL ?? '';

// ── Helpers ───────────────────────────────────────────────────────────────
function isVideoUrl(url) {
  return /\.(mp4|mov|webm|ogg|qt)(\?.*)?$/i.test(url || '');
}

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

// ── Star rating display ───────────────────────────────────────────────────
function StarRating({ value, max = 5, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`${sz} ${i < Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 dark:text-neutral-600'}`}
        />
      ))}
    </span>
  );
}

// ── Reviews panel ─────────────────────────────────────────────────────────
function ReviewsPanel({ reviews, avgRating, title }) {
  const [expanded, setExpanded] = useState(false);
  if (!reviews || reviews.length === 0) return null;
  const shown = expanded ? reviews : reviews.slice(0, 2);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{title}</span>
        {avgRating && (
          <span className="flex items-center gap-1.5">
            <StarRating value={avgRating} />
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{avgRating}</span>
          </span>
        )}
      </div>
      <div className="space-y-2">
        {shown.map((r, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <StarRating value={r.rating} />
              {r.customerName && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">{r.customerName}</span>
              )}
            </div>
            {r.feedback && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed pl-0.5">&ldquo;{r.feedback}&rdquo;</p>
            )}
          </div>
        ))}
      </div>
      {reviews.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
        >
          {expanded ? (
            <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" /> Show {reviews.length - 2} more review{reviews.length - 2 !== 1 ? 's' : ''}</>
          )}
        </button>
      )}
    </div>
  );
}

// ── Location media strip + info ───────────────────────────────────────────
function LocationPreview({ location }) {
  const [activeIdx, setActiveIdx] = useState(0);
  // Resolve media list: prefer mediaUrls array, fall back to imageUrl
  const mediaList = (() => {
    const arr = Array.isArray(location.mediaUrls) ? location.mediaUrls.filter(Boolean) : [];
    if (arr.length > 0) return arr;
    if (location.imageUrl) return [location.imageUrl];
    return [];
  })();

  const hasMedia = mediaList.length > 0;
  const activeUrl = mediaList[activeIdx] || null;

  return (
    <div className="rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 overflow-hidden -mt-1">
      {/* Main viewer */}
      {hasMedia && activeUrl && (
        <div className="relative w-full h-40 bg-neutral-900">
          {isVideoUrl(activeUrl) ? (
            <video
              key={activeUrl}
              src={activeUrl}
              className="w-full h-full object-cover"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              key={activeUrl}
              src={activeUrl}
              alt={location.name}
              className="w-full h-full object-cover"
            />
          )}
          {mediaList.length > 1 && (
            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
              {activeIdx + 1} / {mediaList.length}
            </span>
          )}
        </div>
      )}

      {/* Thumbnail strip (only when 2+ items) */}
      {mediaList.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 scrollbar-hide">
          {mediaList.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className={[
                'shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                idx === activeIdx
                  ? 'border-brand-500 shadow'
                  : 'border-transparent opacity-60 hover:opacity-100',
              ].join(' ')}
            >
              {isVideoUrl(url) ? (
                <video
                  src={url}
                  className="w-14 h-14 object-cover"
                  muted playsInline preload="metadata"
                />
              ) : (
                <img src={url} alt={`${location.name} ${idx + 1}`} className="w-14 h-14 object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Info row */}
      <div className="px-3 py-2 space-y-0.5">
        {location.addressLine1 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            📍 {[location.addressLine1, location.city].filter(Boolean).join(', ')}
          </p>
        )}
        {location.phone && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">📞 {location.phone}</p>
        )}
      </div>

      {/* Reviews */}
      {location.reviews?.length > 0 && (
        <div className="px-3 pb-3">
          <ReviewsPanel
            reviews={location.reviews}
            avgRating={location.avgRating}
            title="Branch reviews"
          />
        </div>
      )}
    </div>
  );
}

// ── Staff profile card ────────────────────────────────────────────────────
function StaffCard({ staff, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? '' : staff.id)}
      className={[
        'flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center w-full',
        selected
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 shadow-md'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-brand-300 dark:hover:border-brand-700',
      ].join(' ')}
    >
      {/* Avatar */}
      {staff.profilePicture ? (
        <img
          src={staff.profilePicture}
          alt={staff.name}
          className="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-neutral-800 shadow"
        />
      ) : (
        <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shadow border-2 border-white dark:border-neutral-800">
          <User className="w-7 h-7 text-brand-500 dark:text-brand-400" />
        </div>
      )}
      <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 leading-tight">{staff.name}</span>
      {staff.designation && (
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">{staff.designation}</span>
      )}
      {staff.avgRating && (
        <span className="flex items-center gap-1 mt-0.5">
          <StarRating value={staff.avgRating} size="sm" />
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{staff.avgRating}</span>
        </span>
      )}
    </button>
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
  const selectedStaff = catalog?.staff?.find((s) => s.id === form.staffId);
  const selectedLocation = catalog?.locations?.find((l) => l.id === form.locationId);

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

          {/* Location picker */}
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

          {/* Selected location preview */}
          {selectedLocation && (
            <LocationPreview location={selectedLocation} />
          )}

          {/* Staff profile cards */}
          {(catalog?.staff || []).length > 0 && (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5" />
                Staff preference
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {/* "Any" option */}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, staffId: '' }))}
                  className={[
                    'flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center',
                    !form.staffId
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 shadow-md'
                      : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-brand-300 dark:hover:border-brand-700',
                  ].join(' ')}
                >
                  <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border-2 border-white dark:border-neutral-700 shadow">
                    <Users className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
                  </div>
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">Any</span>
                </button>
                {(catalog?.staff || []).map((s) => (
                  <StaffCard
                    key={s.id}
                    staff={s}
                    selected={form.staffId === s.id}
                    onSelect={(id) => setForm((f) => ({ ...f, staffId: id }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Selected staff reviews */}
          {selectedStaff?.reviews?.length > 0 && (
            <ReviewsPanel
              reviews={selectedStaff.reviews}
              avgRating={selectedStaff.avgRating}
              title={`Reviews for ${selectedStaff.name}`}
            />
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
