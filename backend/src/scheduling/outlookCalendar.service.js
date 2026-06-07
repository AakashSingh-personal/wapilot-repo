import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { signToken, verifyToken } from '../utils/jwt.js';
import { encryptSecret, decryptSecret } from './tokenCrypto.js';
import { log } from '../utils/logger.js';

const MS_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Calendars.ReadWrite', 'offline_access', 'User.Read'].join(' ');

function outlookConfig() {
  return {
    clientId: process.env.OUTLOOK_CLIENT_ID || process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '',
    redirectUri:
      process.env.OUTLOOK_CALENDAR_REDIRECT_URI ||
      `${process.env.API_PUBLIC_URL || 'http://localhost:3000'}/scheduling/calendar/outlook/callback`,
  };
}

export function isOutlookCalendarConfigured() {
  const { clientId, clientSecret } = outlookConfig();
  return Boolean(clientId && clientSecret);
}

export function buildOutlookAuthUrl({ businessId, staffId, userId }) {
  const { clientId, redirectUri } = outlookConfig();
  if (!clientId) throw new Error('OUTLOOK_CLIENT_ID not configured');

  const state = signToken(
    { type: 'outlook_calendar_oauth', businessId, staffId, userId },
    '15m',
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    response_mode: 'query',
    state,
  });

  return `${MS_AUTH}?${params.toString()}`;
}

async function fetchOutlookProfile(accessToken) {
  try {
    const res = await axios.get(`${GRAPH}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { $select: 'mail,userPrincipalName' },
    });
    return res.data?.mail || res.data?.userPrincipalName || null;
  } catch {
    return null;
  }
}

export async function handleOutlookOAuthCallback(code, state) {
  const payload = verifyToken(state);
  if (payload.type !== 'outlook_calendar_oauth') {
    throw new Error('Invalid OAuth state');
  }

  const { clientId, clientSecret, redirectUri } = outlookConfig();
  const tokenRes = await axios.post(
    MS_TOKEN,
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: SCOPES,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const { access_token, refresh_token, expires_in } = tokenRes.data;
  const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);
  const externalEmail = await fetchOutlookProfile(access_token);

  const existing = await prisma.calendarConnection.findFirst({
    where: {
      businessId: payload.businessId,
      staffId: payload.staffId || null,
      provider: 'OUTLOOK',
    },
  });

  const data = {
    accessToken: encryptSecret(access_token),
    refreshToken: encryptSecret(refresh_token || access_token),
    tokenExpiresAt,
    calendarId: null,
    externalEmail,
    syncDirection: 'BIDIRECTIONAL',
    isActive: true,
  };

  const conn = existing
    ? await prisma.calendarConnection.update({ where: { id: existing.id }, data })
    : await prisma.calendarConnection.create({
        data: {
          businessId: payload.businessId,
          staffId: payload.staffId || null,
          provider: 'OUTLOOK',
          ...data,
        },
      });

  void pullOutlookCalendarBlocks(conn.id);
  void registerOutlookCalendarSubscription(conn.id).catch(() => {});
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

  const { clientId, clientSecret } = outlookConfig();
  const tokenRes = await axios.post(
    MS_TOKEN,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
      scope: SCOPES,
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

export async function pushAppointmentToOutlook(appointment) {
  if (!appointment?.staffId) return null;
  const conn = await prisma.calendarConnection.findFirst({
    where: {
      businessId: appointment.businessId,
      staffId: appointment.staffId,
      provider: 'OUTLOOK',
      isActive: true,
    },
  });
  if (!conn) return null;

  try {
    const { accessToken } = await getValidAccessToken(conn.id);
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
      subject: summary,
      body: { contentType: 'text', content: description },
      location: appointment.location?.name
        ? { displayName: appointment.location.name }
        : undefined,
      start: {
        dateTime: new Date(appointment.startAt).toISOString(),
        timeZone: appointment.location?.timezone || 'UTC',
      },
      end: {
        dateTime: new Date(appointment.endAt).toISOString(),
        timeZone: appointment.location?.timezone || 'UTC',
      },
    };

    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    if (appointment.calendarEventId) {
      const res = await axios.patch(
        `${GRAPH}/me/calendar/events/${encodeURIComponent(appointment.calendarEventId)}`,
        eventBody,
        { headers },
      );
      return res.data?.id;
    }

    const res = await axios.post(`${GRAPH}/me/calendar/events`, eventBody, { headers });
    return res.data?.id ?? null;
  } catch (e) {
    log('warn', 'outlook_calendar_push_failed', {
      appointmentId: appointment.id,
      message: e.response?.data ? JSON.stringify(e.response.data) : e.message,
    });
    return null;
  }
}

export async function deleteOutlookCalendarEvent(appointment) {
  if (!appointment?.calendarEventId || !appointment?.calendarConnectionId) return;
  const conn = await prisma.calendarConnection.findUnique({
    where: { id: appointment.calendarConnectionId },
  });
  if (!conn || conn.provider !== 'OUTLOOK') return;

  try {
    const { accessToken } = await getValidAccessToken(conn.id);
    await axios.delete(
      `${GRAPH}/me/calendar/events/${encodeURIComponent(appointment.calendarEventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (e) {
    log('warn', 'outlook_calendar_delete_failed', { message: e.message });
  }
}

export async function pullOutlookCalendarBlocks(connectionId) {
  const { conn, accessToken } = await getValidAccessToken(connectionId);
  if (!conn.staffId) return { synced: 0 };

  const timeMin = new Date(Date.now() - 86400000).toISOString();
  const timeMax = new Date(Date.now() + 30 * 86400000).toISOString();

  const res = await axios.get(`${GRAPH}/me/calendar/calendarView`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      startDateTime: timeMin,
      endDateTime: timeMax,
      $top: 250,
      $select: 'id,subject,start,end,isCancelled',
    },
  });

  const events = Array.isArray(res.data?.value) ? res.data.value : [];
  let synced = 0;

  for (const ev of events) {
    if (ev.isCancelled) continue;
    const start = ev.start?.dateTime;
    const end = ev.end?.dateTime;
    if (!start || !end) continue;

    const appt = await prisma.appointment.findFirst({
      where: {
        OR: [
          { calendarEventId: ev.id, businessId: conn.businessId, calendarConnectionId: conn.id },
          {
            calendarEvents: {
              some: { businessId: conn.businessId, connectionId: conn.id, externalEventId: ev.id },
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
        title: ev.subject || 'Busy',
        source: 'OUTLOOK',
      },
      update: {
        startAt: new Date(start),
        endAt: new Date(end),
        title: ev.subject || 'Busy',
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

export async function syncAllOutlookCalendars() {
  await renewOutlookSubscriptionsIfNeeded();
  const connections = await prisma.calendarConnection.findMany({
    where: { provider: 'OUTLOOK', isActive: true },
    take: 50,
  });
  for (const c of connections) {
    try {
      await pullOutlookCalendarBlocks(c.id);
    } catch (e) {
      log('warn', 'outlook_calendar_sync_failed', { connectionId: c.id, message: e.message });
    }
  }
}

function outlookWebhookClientState(connectionId) {
  const secret =
    process.env.OUTLOOK_WEBHOOK_SECRET ||
    process.env.CALENDAR_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    'wapilot';
  return crypto.createHmac('sha256', secret).update(connectionId).digest('hex').slice(0, 32);
}

function subscriptionExpirationIso() {
  const minutes = Number(process.env.OUTLOOK_SUBSCRIPTION_MINUTES || 4200);
  return new Date(Date.now() + minutes * 60000).toISOString();
}

export async function registerOutlookCalendarSubscription(connectionId) {
  const webhookBase = process.env.API_PUBLIC_URL || 'http://localhost:3000';
  const notificationUrl = `${webhookBase}/scheduling/calendar/outlook/webhook`;
  const { conn, accessToken } = await getValidAccessToken(connectionId);
  const clientState = outlookWebhookClientState(conn.id);

  const res = await axios.post(
    `${GRAPH}/subscriptions`,
    {
      changeType: 'created,updated,deleted',
      notificationUrl,
      resource: '/me/events',
      expirationDateTime: subscriptionExpirationIso(),
      clientState,
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
  );

  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: {
      webhookChannelId: res.data?.id || null,
      webhookResourceId: clientState,
      webhookExpiresAt: res.data?.expirationDateTime
        ? new Date(res.data.expirationDateTime)
        : null,
    },
  });

  return res.data;
}

export async function renewOutlookSubscription(connectionId) {
  const conn = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
  if (!conn?.webhookChannelId) {
    return registerOutlookCalendarSubscription(connectionId);
  }

  const { accessToken } = await getValidAccessToken(connectionId);
  const res = await axios.patch(
    `${GRAPH}/subscriptions/${encodeURIComponent(conn.webhookChannelId)}`,
    { expirationDateTime: subscriptionExpirationIso() },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
  );

  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: {
      webhookExpiresAt: res.data?.expirationDateTime
        ? new Date(res.data.expirationDateTime)
        : null,
    },
  });

  return res.data;
}

export async function renewOutlookSubscriptionsIfNeeded() {
  const renewBefore = new Date(Date.now() + 24 * 3600000);
  const connections = await prisma.calendarConnection.findMany({
    where: {
      provider: 'OUTLOOK',
      isActive: true,
      OR: [{ webhookExpiresAt: null }, { webhookExpiresAt: { lte: renewBefore } }],
    },
    take: 20,
  });

  for (const conn of connections) {
    try {
      if (conn.webhookChannelId) {
        await renewOutlookSubscription(conn.id);
      } else {
        await registerOutlookCalendarSubscription(conn.id);
      }
    } catch (e) {
      log('warn', 'outlook_subscription_renew_failed', {
        connectionId: conn.id,
        message: e.response?.data ? JSON.stringify(e.response.data) : e.message,
      });
      try {
        await registerOutlookCalendarSubscription(conn.id);
      } catch (e2) {
        log('warn', 'outlook_subscription_register_failed', {
          connectionId: conn.id,
          message: e2.response?.data ? JSON.stringify(e2.response.data) : e2.message,
        });
      }
    }
  }
}

export async function handleOutlookCalendarWebhook(req) {
  const validationToken = req.query?.validationToken;
  if (validationToken) {
    return { validation: String(validationToken) };
  }

  const notifications = Array.isArray(req.body?.value) ? req.body.value : [];
  let synced = 0;

  for (const note of notifications) {
    const subscriptionId = note.subscriptionId;
    const clientState = note.clientState;
    if (!subscriptionId) continue;

    const conn = await prisma.calendarConnection.findFirst({
      where: {
        provider: 'OUTLOOK',
        isActive: true,
        webhookChannelId: String(subscriptionId),
      },
    });
    if (!conn) continue;
    if (clientState && conn.webhookResourceId && clientState !== conn.webhookResourceId) continue;

    try {
      const result = await pullOutlookCalendarBlocks(conn.id);
      synced += result.synced || 0;
    } catch (e) {
      log('warn', 'outlook_webhook_pull_failed', { connectionId: conn.id, message: e.message });
    }
  }

  return { ok: true, synced };
}
