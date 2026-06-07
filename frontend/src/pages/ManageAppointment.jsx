import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarCheck, Clock, MapPin, User, CreditCard, Star,
  CalendarDays, ExternalLink, ArrowLeft, CheckCircle2,
  XCircle, AlertCircle, Loader2,
} from 'lucide-react';
import axios from 'axios';
import { Button } from '../components/ui/Button.jsx';
import { Textarea } from '../components/ui/Textarea.jsx';
import { AppointmentStatusBadge, ApptPaymentStatusBadge } from '../components/ui/Badge.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { cn } from '../utils/cn.js';

const baseURL = import.meta.env.VITE_API_URL ?? '';

function InfoRow({ icon: Icon, label, value, className }) {
  if (!value) return null;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      {Icon && <Icon className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function ManageAppointment() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [appointment, setAppointment] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [paymentQr, setPaymentQr] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  function loadAppointment() {
    return axios
      .get(`${baseURL}/public/appointments/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setAppointment(data);
        setRescheduleDate(new Date().toISOString().slice(0, 10));
        if (data.rating?.rating) setRatingScore(data.rating.rating);
        if (data.rating?.feedback) setRatingFeedback(data.rating.feedback);
      });
  }

  useEffect(() => {
    if (!token) { setError('Invalid or missing link.'); setLoading(false); return; }
    loadAppointment()
      .catch((e) => setError(e.response?.data?.error || 'Could not load appointment'))
      .finally(() => setLoading(false));
  }, [token]);

  async function act(action, extra = {}) {
    setBusy(true); setError(''); setInfo('');
    try {
      const { data } = await axios.post(
        `${baseURL}/public/appointments/${encodeURIComponent(token)}`,
        { action, ...extra }
      );
      setAppointment(data);
      setRescheduleMode(false); setSlots([]);
      setCancelConfirmOpen(false); setCancelReason('');
      if (action === 'confirm') setInfo('Appointment confirmed.');
      else if (action === 'cancel') setInfo('Appointment cancelled.');
      else if (action === 'reschedule') setInfo('Appointment rescheduled.');
    } catch (e) {
      setError(e.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitRating(e) {
    e.preventDefault();
    if (!ratingScore) return setError('Please select a star rating');
    setBusy(true); setError('');
    try {
      await axios.post(
        `${baseURL}/public/appointments/${encodeURIComponent(token)}/rating`,
        { rating: ratingScore, feedback: ratingFeedback || undefined }
      );
      await loadAppointment();
      setInfo('Thank you for your feedback!');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit rating');
    } finally {
      setBusy(false);
    }
  }

  async function loadPayment() {
    setBusy(true); setError('');
    try {
      const { data } = await axios.post(
        `${baseURL}/public/appointments/${encodeURIComponent(token)}/pay`,
        { mode: 'advance' }
      );
      setPaymentUrl(data.paymentLinkUrl || '');
      setPaymentQr(data.qrDataUrl || '');
      setInfo('Payment link ready — scan QR or open link below.');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create payment link');
    } finally {
      setBusy(false);
    }
  }

  async function loadRescheduleSlots() {
    if (!rescheduleDate) return;
    setLoadingSlots(true); setError('');
    try {
      const { data } = await axios.get(
        `${baseURL}/public/appointments/${encodeURIComponent(token)}/slots`,
        { params: { date: rescheduleDate } }
      );
      setSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load slots');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-neutral-500">Loading appointment…</p>
        </div>
      </div>
    );
  }

  /* ── Hard error (no appointment loaded) ── */
  if (error && !appointment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="w-full max-w-sm text-center space-y-3">
          <XCircle className="w-12 h-12 text-error-400 mx-auto" />
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Invalid link</h1>
          <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
        </div>
      </div>
    );
  }

  const tz = appointment?.location?.timezone || 'Asia/Kolkata';
  const when = appointment?.startAt
    ? new Date(appointment.startAt).toLocaleString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: 'numeric', minute: '2-digit', timeZone: tz,
      })
    : '—';

  const canManage = ['PENDING', 'CONFIRMED'].includes(appointment?.status);
  const canRate   = appointment?.status === 'COMPLETED';
  const hasDue    = Number(appointment?.amountDue) > 0;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">

        {/* Header */}
        <div className="text-center space-y-1 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-3">
            <CalendarCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Your appointment
          </h1>
          <p className="text-sm text-neutral-500">#{appointment?.appointmentNumber}</p>
        </div>

        {/* Feedback messages */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
          </div>
        )}
        {info && (
          <div className="flex items-center gap-2.5 rounded-xl bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 text-success-700 dark:text-success-400 text-sm px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />{info}
          </div>
        )}

        {/* Appointment details */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5 space-y-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <AppointmentStatusBadge status={appointment?.status} />
            <ApptPaymentStatusBadge status={appointment?.paymentStatus} />
          </div>
          <div className="grid gap-4">
            <InfoRow icon={CalendarDays} label="Service" value={appointment?.service?.name} />
            <InfoRow icon={Clock} label="Date & time" value={when} />
            <InfoRow icon={User} label="Staff" value={appointment?.staff?.name} />
            <InfoRow icon={MapPin} label="Location" value={appointment?.location?.name} />
            {hasDue && (
              <InfoRow
                icon={CreditCard}
                label="Payment due"
                value={`₹${Number(appointment.amountDue).toLocaleString('en-IN')}`}
              />
            )}
          </div>
          <a
            href={`${baseURL}/public/appointments/${encodeURIComponent(token)}/calendar.ics`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
          >
            <CalendarDays className="w-4 h-4" /> Add to calendar (.ics)
          </a>
        </div>

        {/* Payment */}
        {hasDue && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Pay online</h2>
            <Button variant="primary" className="w-full" size="lg" loading={busy} onClick={loadPayment}>
              Get payment link / QR
            </Button>
            {paymentQr && (
              <div className="text-center space-y-3">
                <img src={paymentQr} alt="Payment QR" className="mx-auto w-48 h-48 rounded-xl border border-neutral-200 dark:border-neutral-700" />
                {paymentUrl && (
                  <a
                    href={paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" /> Open payment page
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rating */}
        {canRate && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              {appointment.rating ? 'Your rating' : 'Rate your visit'}
            </h2>
            <form onSubmit={submitRating} className="space-y-4">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRatingScore(n)}
                    className="text-3xl transition-transform hover:scale-110"
                  >
                    <span className={n <= ratingScore ? 'text-warning-400' : 'text-neutral-200 dark:text-neutral-700'}>
                      ★
                    </span>
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Optional feedback"
                value={ratingFeedback}
                onChange={(e) => setRatingFeedback(e.target.value)}
                rows={3}
              />
              <Button type="submit" variant="secondary" className="w-full" disabled={busy || !ratingScore}>
                {appointment.rating ? 'Update rating' : 'Submit rating'}
              </Button>
            </form>
          </div>
        )}

        {/* Manage actions */}
        {canManage && !rescheduleMode && !cancelConfirmOpen && (
          <div className="flex flex-col gap-3">
            {appointment.status === 'PENDING' && (
              <Button
                variant="primary" size="lg" className="w-full"
                iconLeft={<CheckCircle2 className="w-5 h-5" />}
                loading={busy} onClick={() => act('confirm')}
              >
                Confirm appointment
              </Button>
            )}
            <Button
              variant="secondary" size="lg" className="w-full"
              iconLeft={<CalendarDays className="w-5 h-5" />}
              disabled={busy} onClick={() => setRescheduleMode(true)}
            >
              Reschedule
            </Button>
            <Button
              variant="ghost" size="lg" className="w-full text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950/30"
              iconLeft={<XCircle className="w-5 h-5" />}
              disabled={busy} onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel appointment
            </Button>
          </div>
        )}

        {/* Cancel confirmation */}
        {canManage && cancelConfirmOpen && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-error-200 dark:border-error-800 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-error-500 shrink-0" />
              <h2 className="text-sm font-semibold text-error-800 dark:text-error-300">
                Cancel this appointment?
              </h2>
            </div>
            <Textarea
              placeholder="Reason (optional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
            />
            <div className="flex gap-3">
              <Button
                variant="danger" className="flex-1" loading={busy}
                onClick={() => act('cancel', { reason: cancelReason || undefined })}
              >
                Yes, cancel
              </Button>
              <Button
                variant="secondary" className="flex-1" disabled={busy}
                onClick={() => { setCancelConfirmOpen(false); setCancelReason(''); }}
              >
                Keep booking
              </Button>
            </div>
          </div>
        )}

        {/* Reschedule */}
        {canManage && rescheduleMode && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Pick a new time</h2>
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500"
                value={rescheduleDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
              <Button
                variant="primary" size="md" loading={loadingSlots}
                onClick={loadRescheduleSlots}
              >
                Find slots
              </Button>
            </div>
            {slots.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.startAt}
                    type="button"
                    disabled={busy}
                    onClick={() => act('reschedule', { newStartAt: s.startAt })}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-2.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:border-brand-300 hover:text-brand-700 transition-colors disabled:opacity-50"
                  >
                    {new Date(s.startAt).toLocaleTimeString('en-IN', {
                      timeZone: s.timezone || tz,
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </button>
                ))}
              </div>
            ) : (
              !loadingSlots && (
                <p className="text-xs text-neutral-400 text-center py-2">
                  Choose a date and tap Find slots.
                </p>
              )
            )}
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              onClick={() => { setRescheduleMode(false); setSlots([]); }}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
