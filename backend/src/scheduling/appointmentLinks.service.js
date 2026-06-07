import { signToken } from '../utils/jwt.js';

const TZ_OFFSETS = {
  'Asia/Kolkata': '+05:30',
  UTC: '+00:00',
};

export function frontendBaseUrl() {
  return (process.env.CORS_ORIGIN || '').split(',')[0]?.trim() || 'http://localhost:5173';
}

export function signAppointmentActionToken(appointmentId, businessId) {
  return signToken({ type: 'appointment_action', appointmentId, businessId }, '14d');
}

export function buildManageAppointmentUrl(appointmentId, businessId) {
  const token = signAppointmentActionToken(appointmentId, businessId);
  return `${frontendBaseUrl()}/appointments/manage?token=${encodeURIComponent(token)}`;
}

export function appointmentSelfServiceFooter(appointment) {
  const url = buildManageAppointmentUrl(appointment.id, appointment.businessId);
  return `\nManage your booking: ${url}`;
}

export function parseLocalDate(dateStr, timezone = 'Asia/Kolkata') {
  const offset = TZ_OFFSETS[timezone] || TZ_OFFSETS['Asia/Kolkata'];
  return new Date(`${dateStr}T00:00:00${offset}`);
}

export function parseLocalDateTime(dateStr, timeStr, timezone = 'Asia/Kolkata') {
  const offset = TZ_OFFSETS[timezone] || TZ_OFFSETS['Asia/Kolkata'];
  const [h, m] = String(timeStr || '00:00').split(':');
  return new Date(`${dateStr}T${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}:00${offset}`);
}

export function localDateKey(date, timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

export function formatAppointmentWhen(startAt, timezone = 'Asia/Kolkata') {
  return new Date(startAt).toLocaleString('en-IN', { timeZone: timezone });
}
