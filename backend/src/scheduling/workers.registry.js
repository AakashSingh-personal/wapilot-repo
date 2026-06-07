import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { registerSchedulingWorkers } from './queue.service.js';
import { processDueReminders } from './reminder.service.js';
import { expireWaitlistOffers } from './waitlist.service.js';
import { syncAllCalendars } from './calendarSync.service.js';
import { runRebookingCampaignTick } from './rebooking.service.js';
import { purgeExpiredIdempotencyKeys } from './idempotency.service.js';

export async function startSchedulingWorkers() {
  await registerSchedulingWorkers({
    reminders: {
      handler: processDueReminders,
      intervalMs: Number(process.env.REMINDER_POLL_MS || 60000),
    },
    waitlist: {
      handler: expireWaitlistOffers,
      intervalMs: Number(process.env.WAITLIST_POLL_MS || 5 * 60000),
    },
    calendar: {
      handler: syncAllCalendars,
      intervalMs: Number(process.env.CALENDAR_SYNC_MS || 15 * 60000),
    },
    rebooking: {
      handler: runRebookingCampaignTick,
      intervalMs: Number(process.env.REBOOKING_CAMPAIGN_MS || 24 * 3600000),
    },
    idempotency: {
      handler: purgeExpiredIdempotencyKeys,
      intervalMs: Number(process.env.IDEMPOTENCY_PURGE_MS || 24 * 3600000),
    },
  });
  log('info', 'scheduling_workers_registered');
}
