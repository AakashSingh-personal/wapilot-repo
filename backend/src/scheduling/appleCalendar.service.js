import { createDAVClient } from 'tsdav';
import { prisma } from '../lib/prisma.js';
import { encryptSecret, decryptSecret } from './tokenCrypto.js';
import { log } from '../utils/logger.js';

const ICLOUD_CALDAV = process.env.APPLE_CALDAV_URL || 'https://caldav.icloud.com';

function formatIcsUtc(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function createAppleClient(conn) {
  const username = conn.externalEmail;
  const password = decryptSecret(conn.refreshToken);
  if (!username || !password) throw new Error('Apple Calendar credentials missing');

  const client = await createDAVClient({
    serverUrl: ICLOUD_CALDAV,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  return client;
}

async function resolveCalendarHref(conn) {
  if (conn.calendarId) return conn.calendarId;
  const client = await createAppleClient(conn);
  const calendars = await client.fetchCalendars();
  const pick =
    calendars.find((c) => /calendar/i.test(c.displayName || '')) ||
    calendars.find((c) => !c.displayName?.toLowerCase().includes('reminder')) ||
    calendars[0];
  if (!pick?.url) throw new Error('No Apple calendar found');
  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { calendarId: pick.url },
  });
  return pick.url;
}

export function isAppleCalendarAvailable() {
  return true;
}

export async function connectAppleCalendar({ businessId, staffId, appleId, appPassword }) {
  if (!appleId || !appPassword) {
    throw Object.assign(new Error('appleId and appPassword required'), { statusCode: 400 });
  }

  const client = await createDAVClient({
    serverUrl: ICLOUD_CALDAV,
    credentials: { username: String(appleId).trim(), password: String(appPassword).trim() },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  const calendars = await client.fetchCalendars();
  const calendar = calendars[0];
  if (!calendar?.url) {
    throw Object.assign(new Error('Could not find iCloud calendar'), { statusCode: 400 });
  }

  const existing = await prisma.calendarConnection.findFirst({
    where: { businessId, staffId: staffId || null, provider: 'APPLE' },
  });

  const data = {
    accessToken: encryptSecret('caldav'),
    refreshToken: encryptSecret(appPassword),
    externalEmail: String(appleId).trim(),
    calendarId: calendar.url,
    syncDirection: 'BIDIRECTIONAL',
    isActive: true,
    tokenExpiresAt: null,
  };

  const conn = existing
    ? await prisma.calendarConnection.update({ where: { id: existing.id }, data })
    : await prisma.calendarConnection.create({
        data: {
          businessId,
          staffId: staffId || null,
          provider: 'APPLE',
          ...data,
        },
      });

  void pullAppleCalendarBlocks(conn.id);
  return conn;
}

export async function pushAppointmentToApple(appointment) {
  if (!appointment?.staffId) return null;
  const conn = await prisma.calendarConnection.findFirst({
    where: {
      businessId: appointment.businessId,
      staffId: appointment.staffId,
      provider: 'APPLE',
      isActive: true,
    },
  });
  if (!conn) return null;

  try {
    const client = await createAppleClient(conn);
    const calendarUrl = await resolveCalendarHref(conn);
    const uid = appointment.calendarEventId || `${appointment.id}@vartalap.app`;
    const summary = `${appointment.service?.name || 'Appointment'} — ${appointment.customer?.name || 'Customer'}`;
    const description = [
      `Ref: ${appointment.appointmentNumber}`,
      `Status: ${appointment.status}`,
    ].join('\n');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Vartalap//Scheduling//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${formatIcsUtc(appointment.startAt)}`,
      `DTEND:${formatIcsUtc(appointment.endAt)}`,
      `SUMMARY:${summary.replace(/\n/g, '\\n')}`,
      `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    if (appointment.calendarEventId) {
      const objects = await client.fetchCalendarObjects({ calendar: { url: calendarUrl } });
      const match = objects.find((o) => String(o.url || '').includes(appointment.calendarEventId));
      if (match?.url) {
        await client.deleteCalendarObject({ calendarObject: { url: match.url } });
      }
    }

    await client.createCalendarObject({
      calendar: { url: calendarUrl },
      filename: `${uid}.ics`,
      iCalString: ics,
    });

    return uid;
  } catch (e) {
    log('warn', 'apple_calendar_push_failed', {
      appointmentId: appointment.id,
      message: e.message,
    });
    return null;
  }
}

export async function deleteAppleCalendarEvent(appointment) {
  if (!appointment?.calendarEventId || !appointment?.calendarConnectionId) return;
  const conn = await prisma.calendarConnection.findUnique({
    where: { id: appointment.calendarConnectionId },
  });
  if (!conn || conn.provider !== 'APPLE') return;

  try {
    const client = await createAppleClient(conn);
    const calendarUrl = await resolveCalendarHref(conn);
    const objects = await client.fetchCalendarObjects({ calendar: { url: calendarUrl } });
    const match = objects.find((o) =>
      String(o.url || '').includes(appointment.calendarEventId),
    );
    if (match?.url) {
      await client.deleteCalendarObject({ calendarObject: { url: match.url } });
    }
  } catch (e) {
    log('warn', 'apple_calendar_delete_failed', { message: e.message });
  }
}

export async function pullAppleCalendarBlocks(connectionId) {
  const conn = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
  if (!conn || !conn.isActive || !conn.staffId) return { synced: 0 };

  const client = await createAppleClient(conn);
  const calendarUrl = await resolveCalendarHref(conn);
  const timeMin = new Date(Date.now() - 86400000);
  const timeMax = new Date(Date.now() + 30 * 86400000);

  const objects = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl },
    timeRange: { start: timeMin.toISOString(), end: timeMax.toISOString() },
  });

  let synced = 0;
  for (const obj of objects) {
    const raw = obj.data || '';
    const uidMatch = raw.match(/UID:([^\r\n]+)/);
    const startMatch = raw.match(/DTSTART[^:]*:([^\r\n]+)/);
    const endMatch = raw.match(/DTEND[^:]*:([^\r\n]+)/);
    const summaryMatch = raw.match(/SUMMARY:([^\r\n]+)/);
    if (!uidMatch || !startMatch || !endMatch) continue;

    const externalEventId = uidMatch[1].trim();
    const startAt = parseIcsDate(startMatch[1].trim());
    const endAt = parseIcsDate(endMatch[1].trim());
    if (!startAt || !endAt) continue;

    const appt = await prisma.appointment.findFirst({
      where: {
        OR: [
          { calendarEventId: externalEventId, businessId: conn.businessId, calendarConnectionId: conn.id },
          {
            calendarEvents: {
              some: { businessId: conn.businessId, connectionId: conn.id, externalEventId },
            },
          },
        ],
      },
    });
    if (appt) continue;

    await prisma.calendarBlockedSlot.upsert({
      where: {
        connectionId_externalEventId: {
          connectionId: conn.id,
          externalEventId,
        },
      },
      create: {
        businessId: conn.businessId,
        staffId: conn.staffId,
        connectionId: conn.id,
        externalEventId,
        startAt,
        endAt,
        title: summaryMatch?.[1]?.trim() || 'Busy',
        source: 'APPLE',
      },
      update: {
        startAt,
        endAt,
        title: summaryMatch?.[1]?.trim() || 'Busy',
      },
    });
    synced += 1;
  }

  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date() },
  });

  return { synced };
}

function parseIcsDate(value) {
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const hh = value.slice(9, 11);
    const mm = value.slice(11, 13);
    const ss = value.slice(13, 15);
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function syncAllAppleCalendars() {
  const connections = await prisma.calendarConnection.findMany({
    where: { provider: 'APPLE', isActive: true },
    take: 50,
  });
  for (const c of connections) {
    try {
      await pullAppleCalendarBlocks(c.id);
    } catch (e) {
      log('warn', 'apple_calendar_sync_failed', { connectionId: c.id, message: e.message });
    }
  }
}
