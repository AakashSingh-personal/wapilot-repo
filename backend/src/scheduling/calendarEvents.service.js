import { prisma } from '../lib/prisma.js';
import { pushAppointmentToGoogle, deleteGoogleCalendarEvent } from './googleCalendar.service.js';
import { pushAppointmentToOutlook, deleteOutlookCalendarEvent } from './outlookCalendar.service.js';
import { pushAppointmentToApple, deleteAppleCalendarEvent } from './appleCalendar.service.js';

const PUSHERS = {
  GOOGLE: pushAppointmentToGoogle,
  OUTLOOK: pushAppointmentToOutlook,
  APPLE: pushAppointmentToApple,
};

const DELETERS = {
  GOOGLE: deleteGoogleCalendarEvent,
  OUTLOOK: deleteOutlookCalendarEvent,
  APPLE: deleteAppleCalendarEvent,
};

async function enrichWithCalendarEvent(appointment, connectionId) {
  const row = await prisma.appointmentCalendarEvent.findUnique({
    where: { appointmentId_connectionId: { appointmentId: appointment.id, connectionId } },
  });
  return {
    ...appointment,
    calendarEventId: row?.externalEventId ?? null,
    calendarConnectionId: connectionId,
  };
}

async function saveCalendarEvent({ businessId, appointmentId, connectionId, provider, externalEventId }) {
  await prisma.appointmentCalendarEvent.upsert({
    where: { appointmentId_connectionId: { appointmentId, connectionId } },
    create: { businessId, appointmentId, connectionId, provider, externalEventId },
    update: { externalEventId, provider },
  });

  const first = await prisma.appointmentCalendarEvent.findFirst({
    where: { appointmentId },
    orderBy: { createdAt: 'asc' },
  });
  if (first) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { calendarEventId: first.externalEventId, calendarConnectionId: first.connectionId },
    });
  }
}

export async function pushAppointmentToAllCalendars(appointment) {
  if (!appointment?.staffId) return;
  const connections = await prisma.calendarConnection.findMany({
    where: {
      businessId: appointment.businessId,
      staffId: appointment.staffId,
      isActive: true,
      provider: { in: ['GOOGLE', 'OUTLOOK', 'APPLE'] },
    },
  });

  for (const conn of connections) {
    const push = PUSHERS[conn.provider];
    if (!push) continue;
    const payload = await enrichWithCalendarEvent(appointment, conn.id);
    const eventId = await push(payload);
    if (eventId) {
      await saveCalendarEvent({
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        connectionId: conn.id,
        provider: conn.provider,
        externalEventId: eventId,
      });
    }
  }
}

export async function deleteAppointmentFromAllCalendars(appointment) {
  const events = await prisma.appointmentCalendarEvent.findMany({
    where: { appointmentId: appointment.id },
  });

  if (events.length) {
    for (const ev of events) {
      const deleter = DELETERS[ev.provider];
      if (!deleter) continue;
      await deleter({
        ...appointment,
        calendarEventId: ev.externalEventId,
        calendarConnectionId: ev.connectionId,
      });
    }
    await prisma.appointmentCalendarEvent.deleteMany({ where: { appointmentId: appointment.id } });
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { calendarEventId: null, calendarConnectionId: null },
    });
    return;
  }

  await deleteGoogleCalendarEvent(appointment);
  await deleteOutlookCalendarEvent(appointment);
  await deleteAppleCalendarEvent(appointment);
}

export async function findAppointmentByExternalEventId(businessId, connectionId, externalEventId) {
  const row = await prisma.appointmentCalendarEvent.findFirst({
    where: { businessId, connectionId, externalEventId },
    select: { appointmentId: true },
  });
  if (row) return row.appointmentId;

  const legacy = await prisma.appointment.findFirst({
    where: { businessId, calendarEventId: externalEventId, calendarConnectionId: connectionId },
    select: { id: true },
  });
  return legacy?.id ?? null;
}
