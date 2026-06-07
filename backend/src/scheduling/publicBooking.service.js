import { prisma } from '../lib/prisma.js';
import { signToken, verifyToken } from '../utils/jwt.js';
import { frontendBaseUrl } from './appointmentLinks.service.js';
import { findAvailableSlots } from './slotEngine.service.js';
import { createAppointment, ensureSchedulingDefaults } from './appointment.service.js';
import { getSchedulingSettings } from './schedulingSettings.service.js';
import { buildManageAppointmentUrl } from './appointmentLinks.service.js';
import { joinWaitlist } from './waitlist.service.js';
import { findOrCreateCustomer } from './customer.service.js';
import { withBookingIdempotency } from './idempotency.service.js';

const PUBLIC_BOOKING_TOKEN_DAYS = Math.max(
  1,
  Math.min(365, Number(process.env.PUBLIC_BOOKING_TOKEN_DAYS || 30)),
);

export function signPublicBookingToken(businessId) {
  return signToken({ type: 'public_booking', businessId }, `${PUBLIC_BOOKING_TOKEN_DAYS}d`);
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

  const [business, services, locations, categories, staffMembers, settings] = await Promise.all([
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
      select: { id: true, name: true, designation: true, profilePicture: true },
      orderBy: { name: 'asc' },
    }),
    getSchedulingSettings(businessId),
  ]);

  // Fetch recent ratings per staff (up to 5 most recent, with customer name + feedback)
  const staffIds = staffMembers.map((s) => s.id);
  const locationIds = locations.map((l) => l.id);

  const [staffRatings, locationRatings] = await Promise.all([
    staffIds.length
      ? prisma.appointmentRating.findMany({
          where: { businessId, staffId: { in: staffIds } },
          select: {
            staffId: true,
            rating: true,
            feedback: true,
            createdAt: true,
            customer: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: staffIds.length * 10,
        })
      : [],
    locationIds.length
      ? prisma.appointmentRating.findMany({
          where: {
            businessId,
            appointment: { locationId: { in: locationIds } },
          },
          select: {
            rating: true,
            feedback: true,
            createdAt: true,
            customer: { select: { name: true } },
            appointment: { select: { locationId: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: locationIds.length * 10,
        })
      : [],
  ]);

  // Group ratings by staffId
  const ratingsByStaff = {};
  for (const r of staffRatings) {
    if (!ratingsByStaff[r.staffId]) ratingsByStaff[r.staffId] = [];
    if (ratingsByStaff[r.staffId].length < 5) {
      ratingsByStaff[r.staffId].push({
        rating: r.rating,
        feedback: r.feedback || null,
        customerName: r.customer?.name || null,
        createdAt: r.createdAt,
      });
    }
  }

  // Group ratings by locationId
  const ratingsByLocation = {};
  for (const r of locationRatings) {
    const locId = r.appointment?.locationId;
    if (!locId) continue;
    if (!ratingsByLocation[locId]) ratingsByLocation[locId] = [];
    if (ratingsByLocation[locId].length < 5) {
      ratingsByLocation[locId].push({
        rating: r.rating,
        feedback: r.feedback || null,
        customerName: r.customer?.name || null,
        createdAt: r.createdAt,
      });
    }
  }

  // Compute average rating per staff
  const avgByStaff = {};
  for (const [staffId, reviews] of Object.entries(ratingsByStaff)) {
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    avgByStaff[staffId] = reviews.length ? +(sum / reviews.length).toFixed(1) : null;
  }

  // Compute average rating per location
  const avgByLocation = {};
  for (const [locId, reviews] of Object.entries(ratingsByLocation)) {
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    avgByLocation[locId] = reviews.length ? +(sum / reviews.length).toFixed(1) : null;
  }

  const staffWithRatings = staffMembers.map((s) => ({
    ...s,
    reviews: ratingsByStaff[s.id] || [],
    avgRating: avgByStaff[s.id] || null,
  }));

  const locationsWithRatings = locations.map((l) => ({
    ...l,
    reviews: ratingsByLocation[l.id] || [],
    avgRating: avgByLocation[l.id] || null,
  }));

  return {
    business,
    services,
    locations: locationsWithRatings,
    categories,
    staff: staffWithRatings,
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
  const { phone, name, email, serviceId, locationId, staffId, startAt, notes, idempotencyKey } = body;
  if (!phone || !serviceId || !locationId || !startAt) {
    const err = new Error('phone, serviceId, locationId, startAt required');
    err.statusCode = 400;
    throw err;
  }

  // Derive an idempotency key from the booking fingerprint when none is supplied,
  // so network retries don't create duplicate appointments.
  const normalizedPhone = String(phone).trim().replace(/[^\d+]/g, '');
  const derivedKey = idempotencyKey
    || `pb:${businessId}:${normalizedPhone}:${serviceId}:${locationId}:${String(startAt)}`;

  const customer = await findOrCreateCustomer({ businessId, phone, name, email });

  const { appointment, paymentIntent } = await withBookingIdempotency({
    businessId,
    idempotencyKey: derivedKey,
    run: () => createAppointment({
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
    }),
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
