import { prisma } from '../lib/prisma.js';
import { sendAndRecordSchedulingMessage } from '../services/outboundMessage.service.js';
import { log } from '../utils/logger.js';
import { sessionAllowsFreeForm } from '../utils/conversationStatus.js';
import { getWhatsAppTemplatesForBusiness } from './schedulingSettings.service.js';

/**
 * Find customers due for rebooking based on service.rebookingIntervalDays since last COMPLETED visit.
 */
export async function findDueRebookingCustomers(businessId, { limit = 20 } = {}) {
  const services = await prisma.scheduledService.findMany({
    where: {
      businessId,
      isActive: true,
      deletedAt: null,
      rebookingIntervalDays: { not: null, gt: 0 },
    },
    select: { id: true, name: true, rebookingIntervalDays: true },
  });
  if (!services.length) return [];

  const due = [];
  for (const svc of services) {
    const cutoff = new Date(Date.now() - svc.rebookingIntervalDays * 86400000);
    const lastVisits = await prisma.appointment.findMany({
      where: {
        businessId,
        serviceId: svc.id,
        status: 'COMPLETED',
        startAt: { lte: cutoff },
      },
      include: { customer: true },
      orderBy: { startAt: 'desc' },
      distinct: ['customerId'],
      take: limit,
    });

    for (const appt of lastVisits) {
      const hasFuture = await prisma.appointment.count({
        where: {
          businessId,
          customerId: appt.customerId,
          serviceId: svc.id,
          status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
          startAt: { gte: new Date() },
        },
      });
      if (hasFuture) continue;
      due.push({
        customer: appt.customer,
        service: svc,
        lastVisitAt: appt.startAt,
      });
    }
  }
  return due.slice(0, limit);
}

async function sendRebookingMessage({ businessId, business, customer, service, templates }) {
  const body =
    `Hi ${customer.name || 'there'}! It's been a while since your last ${service.name} at ${business.name}.\n` +
    `We recommend booking every ${service.rebookingIntervalDays} days. Reply BOOK to schedule your next appointment.`;

  const useTemplate =
    templates.rebooking && !sessionAllowsFreeForm(customer.lastInboundCustomerMessageAt);

  return sendAndRecordSchedulingMessage({
    businessId,
    customerId: customer.id,
    phoneNumberId: business.phoneNumberId,
    toPhoneE164: customer.phone,
    body,
    templateName: templates.rebooking,
    bodyParameters: [service.name, business.name],
    languageCode: templates.lang,
    useTemplate,
  });
}

export async function sendRebookingCampaign(businessId, { limit = 10 } = {}) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { phoneNumberId: true, name: true },
  });
  if (!business?.phoneNumberId) return { sent: 0 };

  const templates = await getWhatsAppTemplatesForBusiness(businessId);
  const candidates = await findDueRebookingCustomers(businessId, { limit });
  let sent = 0;

  for (const row of candidates) {
    if (!row.customer?.phone) continue;
    try {
      await sendRebookingMessage({
        businessId,
        business,
        customer: row.customer,
        service: row.service,
        templates,
      });
      sent += 1;
    } catch (e) {
      log('warn', 'rebooking_campaign_send_failed', { customerId: row.customer.id, message: e.message });
    }
  }

  return { sent, candidates: candidates.length };
}

export async function runRebookingCampaignTick() {
  const intervalMs = Number(process.env.REBOOKING_CAMPAIGN_MS || 24 * 3600000);
  if (!intervalMs || intervalMs <= 0) return;
  const businesses = await prisma.business.findMany({
    where: { phoneNumberId: { not: null } },
    select: { id: true },
    take: 50,
  });
  for (const b of businesses) {
    await sendRebookingCampaign(b.id, { limit: 5 });
  }
}

export function startRebookingWorker() {
  const intervalMs = Number(process.env.REBOOKING_CAMPAIGN_MS || 24 * 3600000);
  if (!intervalMs || intervalMs <= 0) return;
  setInterval(async () => {
    try {
      await runRebookingCampaignTick();
    } catch (e) {
      log('warn', 'rebooking_worker_failed', { message: e.message });
    }
  }, intervalMs);
  log('info', 'rebooking_worker_started', { intervalMs, deprecated: 'use workers.registry' });
}
