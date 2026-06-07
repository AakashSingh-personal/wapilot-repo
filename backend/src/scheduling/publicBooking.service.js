import { prisma } from '../lib/prisma.js';
import { signToken, verifyToken } from '../utils/jwt.js';
import { frontendBaseUrl } from './appointmentLinks.service.js';
import { findAvailableSlots } from './slotEngine.service.js';
import { createAppointment, ensureSchedulingDefaults } from './appointment.service.js';
import { getSchedulingSettings } from './schedulingSettings.service.js';
import { buildManageAppointmentUrl } from './appointmentLinks.service.js';
import { joinWaitlist } from './waitlist.service.js';
import { findOrCreateCustomer } from './customer.service.js';

export function signPublicBookingToken(businessId) {
  return signToken({ type: 'public_booking', businessId }, '365d');
}

export function buildPublicBookingUrl(businessId) {
  const token = signPublicBookingToken(businessId);
  return `${frontendBaseUrl()}/book?token=${encodeURIComponent(token)}`;
}

export function resolvePublicBookingBusinessId(token) {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    const err = new Error('Invalid or expired booking link');
    err.statusCode = 401;
    throw err;
  }
  if (payload.type !== 'public_booking' || !payload.businessId) {
    const err = new Error('Invalid booking link');
    err.statusCode = 400;
    throw err;
  }
  return payload.businessId;
}

async function assertPublicBookingEnabled(businessId) {
  const settings = await getSchedulingSettings(businessId);
  if (!settings.publicBookingEnabled) {
    const err = new Error('Online booking is not enabled');
    err.statusCode = 403;
    throw err;
  }
}

export async function getPublicBookingCatalog(businessId) {
  await assertPublicBookingEnabled(businessId);
  await ensureSchedulingDefaults(businessId);

  const [business, services, locations, categories, staffMembers] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true } }),
    prisma.scheduledService.findMany({
      where: { businessId, deletedAt: null, isActive: true },
      include: { category: true },
      orderBy: { name: 'asc' },
    }),
    prisma.location.findMany({
      where: { businessId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.serviceCategory.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.staffMember.findMany({
      where: { businessId, deletedAt: null, activeStatus: 'ACTIVE' },
      select: { id: true, name: true, designation: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const settings = await getSchedulingSettings(businessId);

  return {
    business,
    services,
    locations,
    categories,
    staff: staffMembers,
    collectAdvance: settings.publicBookingCollectAdvance,
  };
}

export async function getPublicBookingSlots(businessId, query) {
  await assertPublicBookingEnabled(businessId);
  const { serviceId, locationId, staffId, date } = query;
  if (!serviceId || !date) {
    const err = new Error('serviceId and date required');
    err.statusCode = 400;
    throw err;
  }
  return findAvailableSlots({
    businessId,
    serviceId,
    locationId: locationId || undefined,
    staffId: staffId || undefined,
    date: String(date),
  });
}

export async function createPublicBooking(businessId, body = {}) {
  await assertPublicBookingEnabled(businessId);
  const { phone, name, email, serviceId, locationId, staffId, startAt, notes } = body;
  if (!phone || !serviceId || !locationId || !startAt) {
    const err = new Error('phone, serviceId, locationId, startAt required');
    err.statusCode = 400;
    throw err;
  }

  const customer = await findOrCreateCustomer({ businessId, phone, name, email });
  const { appointment, paymentIntent } = await createAppointment({
    businessId,
    customerId: customer.id,
    serviceId,
    locationId,
    staffId: staffId || undefined,
    startAt,
    notes,
    source: 'PUBLIC_BOOKING',
    status: 'CONFIRMED',
    collectAdvance: Boolean(body.collectAdvance),
  });

  return {
    appointment,
    paymentIntent,
    manageUrl: buildManageAppointmentUrl(appointment.id, businessId),
  };
}

export async function joinPublicWaitlist(businessId, body = {}) {
  await assertPublicBookingEnabled(businessId);
  const { phone, name, email, serviceId, locationId, staffId, preferredDate } = body;
  if (!phone || !serviceId || !locationId) {
    const err = new Error('phone, serviceId, locationId required');
    err.statusCode = 400;
    throw err;
  }

  const customer = await findOrCreateCustomer({ businessId, phone, name, email });
  return joinWaitlist({
    businessId,
    customerId: customer.id,
    serviceId,
    locationId,
    staffId: staffId || null,
    preferredDate: preferredDate || null,
  });
}
