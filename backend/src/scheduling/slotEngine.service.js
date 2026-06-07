import { prisma } from '../lib/prisma.js';
import { getAvailableWindows } from './availabilityEngine.service.js';
import { parseLocalDate } from './appointmentLinks.service.js';

const ACTIVE_APPT = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'];

/**
 * @returns {Promise<Array<{ startAt: Date, endAt: Date, staffId: string, staffName: string, locationId: string, capacityRemaining: number, timezone: string }>>}
 */
export async function findAvailableSlots({
  businessId,
  serviceId,
  locationId,
  staffId = null,
  date,
  appointmentType = 'IN_PERSON',
}) {
  const service = await prisma.scheduledService.findFirst({
    where: { id: serviceId, businessId, isActive: true, deletedAt: null },
  });
  if (!service) return [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return [];

  let locationTimezone = 'Asia/Kolkata';
  if (locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, businessId },
      select: { timezone: true },
    });
    locationTimezone = loc?.timezone || locationTimezone;
  }

  const dayStart = parseLocalDate(date, locationTimezone);

  let staffList;
  if (staffId) {
    staffList = await prisma.staffMember.findMany({
      where: {
        id: staffId,
        businessId,
        activeStatus: 'ACTIVE',
        deletedAt: null,
        services: { some: { serviceId } },
        locations: locationId ? { some: { locationId } } : undefined,
      },
      select: { id: true, name: true },
    });
  } else {
    staffList = await prisma.staffMember.findMany({
      where: {
        businessId,
        activeStatus: 'ACTIVE',
        deletedAt: null,
        services: { some: { serviceId } },
        locations: locationId ? { some: { locationId } } : undefined,
      },
      select: { id: true, name: true },
    });
  }

  const durationMs = service.durationMin * 60000;
  const bufferBefore = service.bufferBefore * 60000;
  const bufferAfter = service.bufferAfter * 60000;
  const slotStepMs = Math.max(15, service.durationMin) * 60000;
  const slots = [];

  for (const staff of staffList) {
    const locRow =
      locationId
        ? { locationId }
        : await prisma.staffLocation.findFirst({
            where: { staffId: staff.id },
            orderBy: { isPrimary: 'desc' },
            include: { location: { select: { id: true, timezone: true } } },
          });
    const locId = locationId || locRow?.locationId || locRow?.location?.id;
    if (!locId) continue;

    const tz =
      locationId && locationTimezone
        ? locationTimezone
        : locRow?.location?.timezone || locationTimezone;

    const windows = await getAvailableWindows({
      businessId,
      staffId: staff.id,
      locationId: locId,
      fromDate: dayStart,
      toDate: dayStart,
      timezone: tz,
    });

    for (const window of windows) {
      let cursor = new Date(window.start.getTime() + bufferBefore);
      const windowEnd = new Date(window.end.getTime() - bufferAfter);

      while (cursor.getTime() + durationMs <= windowEnd.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor.getTime() + durationMs);

        const overlapping = await prisma.appointment.count({
          where: {
            businessId,
            staffId: staff.id,
            status: { in: ACTIVE_APPT },
            startAt: { lt: slotEnd },
            endAt: { gt: slotStart },
          },
        });

        const capacity = service.maxCapacity || 1;
        if (overlapping < capacity) {
          const localMinutes =
            slotStart.getUTCHours() * 60 + slotStart.getUTCMinutes();
          slots.push({
            startAt: slotStart,
            endAt: slotEnd,
            staffId: staff.id,
            staffName: staff.name,
            locationId: locId,
            capacityRemaining: capacity - overlapping,
            label: new Date(slotStart).toLocaleTimeString('en-IN', {
              timeZone: tz,
              hour: 'numeric',
              minute: '2-digit',
            }),
            timezone: tz,
            appointmentType,
          });
        }

        cursor = new Date(cursor.getTime() + slotStepMs);
      }
    }
  }

  slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return slots;
}
