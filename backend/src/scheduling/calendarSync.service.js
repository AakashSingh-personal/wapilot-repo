import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { pullGoogleCalendarBlocks, syncAllGoogleCalendars } from './googleCalendar.service.js';
import { pullOutlookCalendarBlocks, syncAllOutlookCalendars } from './outlookCalendar.service.js';
import { pullAppleCalendarBlocks, syncAllAppleCalendars } from './appleCalendar.service.js';

export async function pullCalendarBlocks(connectionId) {
  const conn = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error('Connection not found');
  if (conn.provider === 'OUTLOOK') return pullOutlookCalendarBlocks(connectionId);
  if (conn.provider === 'APPLE') return pullAppleCalendarBlocks(connectionId);
  return pullGoogleCalendarBlocks(connectionId);
}

let lastAppleSync = 0;

export async function syncAllCalendars() {
  await syncAllGoogleCalendars();
  await syncAllOutlookCalendars();
  const defaultMs = Number(process.env.CALENDAR_SYNC_MS || 15 * 60000);
  const appleMs = Number(process.env.APPLE_CALENDAR_SYNC_MS || defaultMs);
  const now = Date.now();
  if (now - lastAppleSync >= appleMs) {
    lastAppleSync = now;
    await syncAllAppleCalendars();
  }
}

export function startCalendarSyncWorker() {
  const intervalMs = Number(process.env.CALENDAR_SYNC_MS || 15 * 60000);
  setInterval(() => void syncAllCalendars().catch((e) => {
    log('warn', 'calendar_sync_failed', { message: e.message });
  }), intervalMs);
  log('info', 'calendar_sync_worker_started', { intervalMs, deprecated: 'use workers.registry' });
}
