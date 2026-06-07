import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { signToken, verifyToken } from '../utils/jwt.js';
import { encryptSecret, decryptSecret } from './tokenCrypto.js';
import { log } from '../utils/logger.js';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
      `${process.env.API_PUBLIC_URL || 'http://localhost:3000'}/scheduling/calendar/google/callback`,
  };
}

export function isGoogleCalendarConfigured() {
  const { clientId, clientSecret } = googleConfig();
  return Boolean(clientId && clientSecret);
}

export function buildGoogleAuthUrl({ businessId, staffId, userId }) {
  const { clientId, redirectUri } = googleConfig();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');

  const state = signToken(
    { type: 'google_calendar_oauth', businessId, staffId, userId },
    '15m',
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function handleGoogleOAuthCallback(code, state) {
  const payload = verifyToken(state);
  if (payload.type !== 'google_calendar_oauth') {
    throw new Error('Invalid OAuth state');
  }

  const { clientId, clientSecret, redirectUri } = googleConfig();
  const tokenRes = await axios.post(
    GOOGLE_TOKEN,
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const { access_token, refresh_token, expires_in } = tokenRes.data;
  const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);

  const existing = await prisma.calendarConnection.findFirst({
    where: {
      businessId: payload.businessId,
      staffId: payload.staffId || null,
      provider: 'GOOGLE',
    },
  });

  const data = {
    accessToken: encryptSecret(access_token),
    refreshToken: encryptSecret(refresh_token || access_token),
    tokenExpiresAt,
    calendarId: 'primary',
    syncDirection: 'BIDIRECTIONAL',
    isActive: true,
  };

  const conn = existing
    ? await prisma.calendarConnection.update({ where: { id: existing.id }, data })
    : await prisma.calendarConnection.create({
        data: {
          businessId: payload.businessId,
          staffId: payload.staffId || null,
          provider: 'GOOGLE',
          ...data,
        },
      });

  void pullGoogleCalendarBlocks(conn.id);
  void registerGoogleCalendarWatch(conn.id).catch(() => {});
  return { connection: conn, businessId: payload.businessId };
}

async function getValidAccessToken(connectionId) {
  const conn = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
  if (!conn || !conn.isActive) throw new Error('Calendar not connected');

  if (conn.tokenExpiresAt && conn.tokenExpiresAt > new Date(Date.now() + 60000)) {
    return { conn, accessToken: decryptSecret(conn.accessToken) };
  }

  const refresh = decryptSecret(conn.refreshToken);
  if (!refresh) throw new Error('No refresh token');

  const { clientId, clientSecret } = googleConfig();
  const tokenRes = await axios.post(
    GOOGLE_TOKEN,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const accessToken = tokenRes.data.access_token;
  const expiresIn = tokenRes.data.expires_in || 3600;
  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: encryptSecret(accessToken),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    },
  });

  return { conn, accessToken };
}

export async function pushAppointmentToGoogle(appointment) {
  if (!appointment?.staffId) return null;
  const conn = await prisma.calendarConnection.findFirst({
    where: {
      businessId: appointment.businessId,
      staffId: appointment.staffId,
      provider: 'GOOGLE',
      isActive: true,
    },
  });
  if (!conn) return null;

  try {
    const { accessToken } = await getValidAccessToken(conn.id);
    const calendarId = conn.calendarId || 'primary';
    const summary = `${appointment.service?.name || 'Appointment'} — ${appointment.customer?.name || 'Customer'}`;
    const description = [
      `Ref: ${appointment.appointmentNumber}`,
      `Status: ${appointment.status}`,
      `Payment: ${appointment.paymentStatus}`,
      appointment.notes ? `Notes: ${appointment.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const eventBody = {
      summary,
      description,
      location: appointment.location?.name || undefined,
      start: { dateTime: new Date(appointment.startAt).toISOString() },
      end: { dateTime: new Date(appointment.endAt).toISOString() },
    };

    if (appointment.calendarEventId) {
      const res = await axios.patch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(appointment.calendarEventId)}`,
        eventBody,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return res.data?.id;
    }

    const res = await axios.post(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      eventBody,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return res.data?.id ?? null;
  } catch (e) {
    log('warn', 'google_calendar_push_failed', {
      appointmentId: appointment.id,
      message: e.response?.data ? JSON.stringify(e.response.data) : e.message,
    });
    return null;
  }
}

export async function deleteGoogleCalendarEvent(appointment) {
  if (!appointment?.calendarEventId || !appointment?.calendarConnectionId) return;
  try {
    const { conn, accessToken } = await getValidAccessToken(appointment.calendarConnectionId);
    const calendarId = conn.calendarId || 'primary';
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(appointment.calendarEventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (e) {
    log('warn', 'google_calendar_delete_failed', { message: e.message });
  }
}

export async function pullGoogleCalendarBlocks(connectionId) {
  const { conn, accessToken } = await getValidAccessToken(connectionId);
  if (!conn.staffId) return { synced: 0 };

  const calendarId = conn.calendarId || 'primary';
  const timeMin = new Date(Date.now() - 86400000).toISOString();
  const timeMax = new Date(Date.now() + 30 * 86400000).toISOString();

  const res = await axios.get(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      },
    },
  );

  const events = Array.isArray(res.data?.items) ? res.data.items : [];
  let synced = 0;

  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const start = ev.start?.dateTime || ev.start?.date;
    const end = ev.end?.dateTime || ev.end?.date;
    if (!start || !end) continue;

    const linked = await prisma.appointmentCalendarEvent.findFirst({
      where: { businessId: conn.businessId, connectionId: conn.id, externalEventId: ev.id },
    });
    if (linked) continue;
    const legacyAppt = await prisma.appointment.findFirst({
      where: { businessId: conn.businessId, calendarEventId: ev.id, calendarConnectionId: conn.id },
    });
    if (legacyAppt) continue;

    await prisma.calendarBlockedSlot.upsert({
      where: {
        connectionId_externalEventId: {
          connectionId: conn.id,
          externalEventId: ev.id,
        },
      },
      create: {
        businessId: conn.businessId,
        staffId: conn.staffId,
        connectionId: conn.id,
        externalEventId: ev.id,
        startAt: new Date(start),
        endAt: new Date(end),
        title: ev.summary || 'Busy',
        source: 'GOOGLE',
      },
      update: {
        startAt: new Date(start),
        endAt: new Date(end),
        title: ev.summary || 'Busy',
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

export async function listCalendarConnections(businessId) {
  return prisma.calendarConnection.findMany({
    where: { businessId, isActive: true },
    select: {
      id: true,
      staffId: true,
      provider: true,
      externalEmail: true,
      lastSyncAt: true,
      syncDirection: true,
      createdAt: true,
      webhookExpiresAt: true,
      webhookChannelId: true,
    },
  });
}

export async function syncAllGoogleCalendars() {
  const connections = await prisma.calendarConnection.findMany({
    where: { provider: 'GOOGLE', isActive: true },
    take: 50,
  });
  for (const c of connections) {
    try {
      await pullGoogleCalendarBlocks(c.id);
    } catch (e) {
      log('warn', 'calendar_sync_failed', { connectionId: c.id, message: e.message });
    }
  }
}

export async function registerGoogleCalendarWatch(connectionId) {
  const webhookBase = process.env.API_PUBLIC_URL || 'http://localhost:3000';
  const address = `${webhookBase}/scheduling/calendar/google/webhook`;
  const { conn, accessToken } = await getValidAccessToken(connectionId);
  const calendarId = conn.calendarId || 'primary';
  const channelId = crypto.randomUUID();

  const res = await axios.post(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    { id: channelId, type: 'web_hook', address },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: {
      webhookChannelId: res.data?.id || channelId,
      webhookResourceId: res.data?.resourceId || null,
      webhookExpiresAt: res.data?.expiration ? new Date(Number(res.data.expiration)) : null,
    },
  });

  return res.data;
}

export async function handleGoogleCalendarWebhook(headers) {
  const channelId = headers['x-goog-channel-id'] || headers['X-Goog-Channel-Id'];
  const resourceId = headers['x-goog-resource-id'] || headers['X-Goog-Resource-Id'];
  if (!channelId && !resourceId) return { ok: false };

  const where = { isActive: true };
  if (channelId) {
    const conn = await prisma.calendarConnection.findFirst({
      where: { ...where, webhookChannelId: String(channelId) },
    });
    if (conn) {
      const result = await pullGoogleCalendarBlocks(conn.id);
      return { ok: true, synced: result.synced };
    }
  }
  if (resourceId) {
    const conn = await prisma.calendarConnection.findFirst({
      where: { ...where, webhookResourceId: String(resourceId) },
    });
    if (conn) {
      const result = await pullGoogleCalendarBlocks(conn.id);
      return { ok: true, synced: result.synced };
    }
  }
  return { ok: false, reason: 'unknown_channel' };
}
