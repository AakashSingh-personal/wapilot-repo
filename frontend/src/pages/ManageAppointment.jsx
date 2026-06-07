import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? '';

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
    if (!token) {
      setError('Invalid or missing link.');
      setLoading(false);
      return;
    }
    loadAppointment()
      .catch((e) => setError(e.response?.data?.error || 'Could not load appointment'))
      .finally(() => setLoading(false));
  }, [token]);

  async function act(action, extra = {}) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const { data } = await axios.post(`${baseURL}/public/appointments/${encodeURIComponent(token)}`, {
        action,
        ...extra,
      });
      setAppointment(data);
      setRescheduleMode(false);
      setSlots([]);
      setCancelConfirmOpen(false);
      setCancelReason('');
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
    setBusy(true);
    setError('');
    try {
      await axios.post(`${baseURL}/public/appointments/${encodeURIComponent(token)}/rating`, {
        rating: ratingScore,
        feedback: ratingFeedback || undefined,
      });
      await loadAppointment();
      setInfo('Thank you for your feedback!');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit rating');
    } finally {
      setBusy(false);
    }
  }

  async function loadPayment() {
    setBusy(true);
    setError('');
    try {
      const { data } = await axios.post(`${baseURL}/public/appointments/${encodeURIComponent(token)}/pay`, {
        mode: 'advance',
      });
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
    setLoadingSlots(true);
    setError('');
    try {
      const { data } = await axios.get(
        `${baseURL}/public/appointments/${encodeURIComponent(token)}/slots`,
        { params: { date: rescheduleDate } },
      );
      setSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load slots');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600">
        Loading appointment…
      </div>
    );
  }

  if (error && !appointment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="rounded-2xl border border-red-200 bg-white dark:bg-slate-900 p-6 max-w-md text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const tz = appointment?.location?.timezone || 'Asia/Kolkata';
  const when = appointment?.startAt
    ? new Date(appointment.startAt).toLocaleString('en-IN', { timeZone: tz })
    : '—';

  const canManage = ['PENDING', 'CONFIRMED'].includes(appointment?.status);
  const canRate = appointment?.status === 'COMPLETED';
  const hasDue = Number(appointment?.amountDue) > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Your appointment</h1>
          <p className="text-slate-500 text-sm mt-1">Ref {appointment?.appointmentNumber}</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
        {info && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2">{info}</div>}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 text-sm">
          <Row label="Service" value={appointment?.service?.name} />
          <Row label="Staff" value={appointment?.staff?.name} />
          <Row label="When" value={when} />
          <Row label="Location" value={appointment?.location?.name} />
          <Row label="Status" value={appointment?.status} />
          <Row label="Payment" value={`${appointment?.paymentStatus} · Due ₹${Number(appointment?.amountDue || 0).toLocaleString('en-IN')}`} />
          <a
            href={`${baseURL}/public/appointments/${encodeURIComponent(token)}/calendar.ics`}
            className="inline-block text-sm font-semibold text-brand-600 hover:underline"
          >
            Add to calendar (.ics)
          </a>
        </div>

        {hasDue && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="font-semibold">Pay online</div>
            <button
              type="button"
              disabled={busy}
              onClick={loadPayment}
              className="w-full rounded-xl bg-brand-600 text-white py-3 font-semibold disabled:opacity-50"
            >
              Get payment link / QR
            </button>
            {paymentQr && (
              <div className="text-center space-y-2">
                <img src={paymentQr} alt="Payment QR" className="mx-auto w-48 h-48 rounded-lg border" />
                {paymentUrl && (
                  <a href={paymentUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-600 font-semibold break-all">
                    Open payment page
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {canRate && (
          <form onSubmit={submitRating} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="font-semibold">
              {appointment.rating ? 'Your rating' : 'Rate your visit'}
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRatingScore(n)}
                  className={[
                    'text-2xl',
                    n <= ratingScore ? 'text-amber-400' : 'text-slate-300',
                  ].join(' ')}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              placeholder="Optional feedback"
              className="w-full rounded-xl border px-3 py-2 text-sm min-h-[80px]"
              value={ratingFeedback}
              onChange={(e) => setRatingFeedback(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy || !ratingScore}
              className="w-full rounded-xl border border-slate-300 py-2.5 font-semibold disabled:opacity-50"
            >
              {appointment.rating ? 'Update rating' : 'Submit rating'}
            </button>
          </form>
        )}

        {canManage && !rescheduleMode && !cancelConfirmOpen && (
          <div className="flex flex-wrap gap-3">
            {appointment.status === 'PENDING' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act('confirm')}
                className="flex-1 rounded-xl bg-brand-600 text-white py-3 font-semibold disabled:opacity-50"
              >
                Confirm
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setRescheduleMode(true)}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 py-3 font-semibold disabled:opacity-50"
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCancelConfirmOpen(true)}
              className="flex-1 rounded-xl border border-red-300 text-red-700 py-3 font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        {canManage && cancelConfirmOpen && (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 space-y-3">
            <div className="font-semibold text-red-800 dark:text-red-300">Cancel appointment?</div>
            <textarea
              placeholder="Reason (optional)"
              className="w-full rounded-xl border px-3 py-2 text-sm min-h-[72px]"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => act('cancel', { reason: cancelReason || undefined })}
                className="flex-1 rounded-xl bg-red-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Yes, cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCancelConfirmOpen(false);
                  setCancelReason('');
                }}
                className="flex-1 rounded-xl border py-2.5 text-sm font-semibold"
              >
                Keep booking
              </button>
            </div>
          </div>
        )}

        {canManage && rescheduleMode && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="font-semibold">Pick a new time</div>
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                value={rescheduleDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
              <button
                type="button"
                disabled={loadingSlots}
                onClick={loadRescheduleSlots}
                className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {loadingSlots ? '…' : 'Find slots'}
              </button>
            </div>
            {slots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s.startAt}
                    type="button"
                    disabled={busy}
                    onClick={() => act('reschedule', { newStartAt: s.startAt })}
                    className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {new Date(s.startAt).toLocaleString('en-IN', {
                      timeZone: s.timezone || tz,
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </button>
                ))}
              </div>
            )}
            {slots.length === 0 && !loadingSlots && (
              <p className="text-xs text-slate-500">Choose a date and tap Find slots.</p>
            )}
            <button
              type="button"
              className="text-sm text-slate-500 underline"
              onClick={() => {
                setRescheduleMode(false);
                setSlots([]);
              }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900 dark:text-white text-right">{value || '—'}</span>
    </div>
  );
}
