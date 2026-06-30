function formatIcsUtc(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildAppointmentIcs(appointment) {
  const uid = `${appointment.id}@vartalap.app`;
  const summary = `${appointment.service?.name || 'Appointment'} — ${appointment.customer?.name || 'Customer'}`;
  const description = [
    `Ref: ${appointment.appointmentNumber}`,
    `Staff: ${appointment.staff?.name || '—'}`,
    `Status: ${appointment.status}`,
    appointment.notes ? `Notes: ${appointment.notes}` : '',
  ]
    .filter(Boolean)
    .join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vartalap//Scheduling//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(appointment.startAt)}`,
    `DTEND:${formatIcsUtc(appointment.endAt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    appointment.location?.name ? `LOCATION:${escapeIcsText(appointment.location.name)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
