import { prisma } from '../lib/prisma.js';
import { sendAndRecordWhatsAppText } from '../services/outboundMessage.service.js';
import { createAppointment } from './appointment.service.js';
import { formatAppointmentWhen } from './appointmentLinks.service.js';

const OFFER_TTL_MIN = 15;

export async function cancelWaitlistEntry({ businessId, entryId }) {
  const row = await prisma.waitlistEntry.findFirst({
    where: { id: entryId, businessId },
  });
  if (!row) {
    const err = new Error('Waitlist entry not found');
    err.statusCode = 404;
    throw err;
  }
  return prisma.waitlistEntry.update({
    where: { id: entryId },
    data: { status: 'CANCELLED' },
    include: { customer: true, service: true, location: true, staff: true },
  });
}

export async function joinWaitlist({
  businessId,
  customerId,
  serviceId,
  locationId,
  staffId = null,
  preferredDate = null,
  priorityScore = 100,
}) {
  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      businessId,
      customerId,
      serviceId,
      locationId,
      status: { in: ['ACTIVE', 'NOTIFIED'] },
      ...(staffId ? { staffId } : {}),
    },
    include: { customer: true, service: true, location: true, staff: true },
  });
  if (existing) return existing;

  return prisma.waitlistEntry.create({
    data: {
      businessId,
      customerId,
      serviceId,
      locationId,
      staffId,
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      priorityScore,
      status: 'ACTIVE',
    },
    include: { customer: true, service: true, location: true, staff: true },
  });
}

export async function processWaitlistForSlot({
  businessId,
  serviceId,
  locationId,
  staffId,
  freedStartAt,
}) {
  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      businessId,
      serviceId,
      locationId,
      status: 'ACTIVE',
      OR: [{ staffId: null }, { staffId }],
    },
    orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
    take: 5,
    include: { customer: true, service: true, location: true },
  });

  if (!candidates.length) return null;

  const entry = candidates[0];
  const expiresAt = new Date(Date.now() + OFFER_TTL_MIN * 60000);
  const offerStaffId = staffId || entry.staffId;

  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: 'NOTIFIED',
      notifiedAt: new Date(),
      expiresAt,
      preferredStart: new Date(freedStartAt).toISOString(),
      staffId: offerStaffId,
    },
  });

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { phoneNumberId: true },
  });

  const tz = entry.location?.timezone || 'Asia/Kolkata';
  const when = formatAppointmentWhen(freedStartAt, tz);
  const body =
    `Good news! A slot opened for ${entry.service.name} at ${when}.\n` +
    `Reply YES within ${OFFER_TTL_MIN} minutes to book, or NO to skip.`;

  if (business?.phoneNumberId && entry.customer?.phone) {
    await sendAndRecordWhatsAppText({
      businessId,
      customerId: entry.customer.id,
      phoneNumberId: business.phoneNumberId,
      toPhoneE164: entry.customer.phone,
      body,
    });
  }

  return entry;
}

export async function acceptWaitlistOffer({ businessId, customerId, textBody }) {
  const normalized = String(textBody || '').trim();
  const yes = /\b(yes|y|book|confirm|ok)\b/i.test(normalized);
  const no = /\b(no|n|skip|pass)\b/i.test(normalized);

  const entry = await prisma.waitlistEntry.findFirst({
    where: {
      businessId,
      customerId,
      status: 'NOTIFIED',
      expiresAt: { gt: new Date() },
    },
    orderBy: { notifiedAt: 'desc' },
    include: { location: true },
  });

  if (!entry) return null;

  if (no) {
    const offerStart = entry.preferredStart ? new Date(entry.preferredStart) : null;
    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'EXPIRED' },
    });
    if (offerStart && entry.staffId) {
      await processWaitlistForSlot({
        businessId,
        serviceId: entry.serviceId,
        locationId: entry.locationId,
        staffId: entry.staffId,
        freedStartAt: offerStart,
      });
    }
    return { declined: true };
  }

  if (!yes) return null;

  const staffId =
    entry.staffId ||
    (
      await prisma.staffService.findFirst({
        where: { serviceId: entry.serviceId },
      })
    )?.staffId;

  if (!staffId) return null;

  const startAt = entry.preferredStart
    ? new Date(entry.preferredStart)
    : entry.preferredDate || new Date(Date.now() + 86400000);

  const { appointment } = await createAppointment({
    businessId,
    customerId,
    staffId,
    serviceId: entry.serviceId,
    locationId: entry.locationId,
    startAt,
    source: 'WAITLIST',
    status: 'CONFIRMED',
  });

  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: 'BOOKED' },
  });

  return appointment;
}

export async function expireWaitlistOffers() {
  const expired = await prisma.waitlistEntry.findMany({
    where: { status: 'NOTIFIED', expiresAt: { lt: new Date() } },
    take: 20,
  });
  for (const row of expired) {
    const offerStart = row.preferredStart ? new Date(row.preferredStart) : null;
    await prisma.waitlistEntry.update({
      where: { id: row.id },
      data: { status: 'EXPIRED' },
    });
    if (offerStart && row.staffId) {
      await processWaitlistForSlot({
        businessId: row.businessId,
        serviceId: row.serviceId,
        locationId: row.locationId,
        staffId: row.staffId,
        freedStartAt: offerStart,
      });
    }
  }
}

export function startWaitlistWorker() {
  setInterval(() => void expireWaitlistOffers(), 5 * 60000);
}
