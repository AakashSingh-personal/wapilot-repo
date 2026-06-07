import { prisma } from '../lib/prisma.js';
import {
  parseTimeToMinutes,
  rangesOverlap,
  subtractInterval,
  addDays,
} from './timeUtils.js';
import { expandAvailabilityRules } from './rrule.service.js';
import {
  localDateKey,
  parseLocalDate,
  parseLocalDateTime,
} from './appointmentLinks.service.js';

const ACTIVE_APPT = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'];
const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localDayOfWeek(dateKey, timezone) {
  const noon = parseLocalDateTime(dateKey, '12:00', timezone);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(noon);
  return DOW_MAP[name] ?? 0;
}

function windowFromMinutes(dateKey, startMin, endMin, timezone) {
  const sh = Math.floor(startMin / 60);
  const sm = startMin % 60;
  const eh = Math.floor(endMin / 60);
  const em = endMin % 60;
  return {
    start: parseLocalDateTime(dateKey, `${sh}:${String(sm).padStart(2, '0')}`, timezone),
    end: parseLocalDateTime(dateKey, `${eh}:${String(em).padStart(2, '0')}`, timezone),
  };
}

function* iterateDateKeys(fromDate, toDate, timezone) {
  let key = localDateKey(fromDate, timezone);
  const endKey = localDateKey(toDate, timezone);
  while (key <= endKey) {
    yield key;
    const next = parseLocalDate(key, timezone);
    next.setTime(next.getTime() + 86400000);
    key = localDateKey(next, timezone);
  }
}

/**
 * @returns {Promise<Array<{ start: Date, end: Date }>>}
 */
export async function getAvailableWindows({
  businessId,
  staffId,
  locationId,
  fromDate,
  toDate,
  timezone = 'Asia/Kolkata',
}) {
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const to = toDate instanceof Date ? toDate : new Date(toDate);
  const rangeStart = parseLocalDate(localDateKey(from, timezone), timezone);
  const rangeEnd = parseLocalDateTime(localDateKey(to, timezone), '23:59', timezone);
  const windows = [];

  const [workingHours, breaks, leaves, holidays, calendarBlocks, appointments, availRules] =
    await Promise.all([
      prisma.staffWorkingHours.findMany({
        where: { staffId, isActive: true, OR: [{ locationId: null }, { locationId }] },
      }),
      prisma.staffBreak.findMany({ where: { staffId } }),
      prisma.staffLeave.findMany({
        where: {
          businessId,
          staffId,
          startAt: { lte: rangeEnd },
          endAt: { gte: rangeStart },
        },
      }),
      prisma.businessHoliday.findMany({
        where: {
          businessId,
          OR: [{ locationId: null }, { locationId }],
          startAt: { lte: rangeEnd },
          endAt: { gte: rangeStart },
        },
      }),
      prisma.calendarBlockedSlot.findMany({
        where: {
          businessId,
          staffId,
          startAt: { lte: rangeEnd },
          endAt: { gte: rangeStart },
        },
      }),
      prisma.appointment.findMany({
        where: {
          businessId,
          staffId,
          status: { in: ACTIVE_APPT },
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
        },
        select: {
          startAt: true,
          endAt: true,
          bufferBeforeMin: true,
          bufferAfterMin: true,
        },
      }),
      prisma.staffAvailabilityRule.findMany({
        where: {
          businessId,
          staffId,
          isActive: true,
          OR: [{ locationId: null }, { locationId }],
        },
      }),
    ]);

  const rruleOccurrences = expandAvailabilityRules(availRules, rangeStart, rangeEnd);

  for (const dayKey of iterateDateKeys(from, to, timezone)) {
    const dow = localDayOfWeek(dayKey, timezone);
    const dayRrules = rruleOccurrences.filter((o) => localDateKey(o.date, timezone) === dayKey);

    let dayWindows = [];

    if (dayRrules.length) {
      for (const occ of dayRrules) {
        if (occ.ruleType === 'BLOCKED') continue;
        dayWindows.push(windowFromMinutes(dayKey, occ.startMin, occ.endMin, timezone));
      }
    } else {
      const dayHours = workingHours.filter((h) => h.dayOfWeek === dow);
      if (!dayHours.length) continue;
      for (const h of dayHours) {
        const startMin = parseTimeToMinutes(h.startTime);
        const endMin = parseTimeToMinutes(h.endTime);
        if (startMin == null || endMin == null || endMin <= startMin) continue;
        dayWindows.push(windowFromMinutes(dayKey, startMin, endMin, timezone));
      }
    }

    for (const occ of dayRrules) {
      if (occ.ruleType !== 'BLOCKED') continue;
      const blocked = windowFromMinutes(dayKey, occ.startMin, occ.endMin, timezone);
      dayWindows = subtractInterval(dayWindows, blocked.start, blocked.end);
    }

    if (!dayWindows.length) continue;

    const dayStart = parseLocalDate(dayKey, timezone);
    const dayEnd = parseLocalDateTime(dayKey, '23:59', timezone);

    for (const br of breaks) {
      if (br.isRecurring && br.dayOfWeek != null && br.dayOfWeek !== dow) continue;
      if (!br.isRecurring && br.specificDate) {
        if (localDateKey(br.specificDate, timezone) !== dayKey) continue;
      }
      const bs = parseTimeToMinutes(br.startTime);
      const be = parseTimeToMinutes(br.endTime);
      if (bs == null || be == null) continue;
      const blocked = windowFromMinutes(dayKey, bs, be, timezone);
      dayWindows = subtractInterval(dayWindows, blocked.start, blocked.end);
    }

    for (const lv of leaves) {
      if (rangesOverlap(dayStart, dayEnd, lv.startAt, lv.endAt)) {
        dayWindows = subtractInterval(dayWindows, lv.startAt, lv.endAt);
      }
    }

    for (const hol of holidays) {
      if (rangesOverlap(dayStart, dayEnd, hol.startAt, hol.endAt)) {
        dayWindows = [];
      }
    }

    for (const cb of calendarBlocks) {
      dayWindows = subtractInterval(dayWindows, cb.startAt, cb.endAt);
    }

    for (const ap of appointments) {
      const blockStart = new Date(ap.startAt.getTime() - ap.bufferBeforeMin * 60000);
      const blockEnd = new Date(ap.endAt.getTime() + ap.bufferAfterMin * 60000);
      dayWindows = subtractInterval(dayWindows, blockStart, blockEnd);
    }

    windows.push(...dayWindows);
  }

  return windows;
}

export async function isStaffAvailable({
  businessId,
  staffId,
  locationId,
  startAt,
  endAt,
  timezone = 'Asia/Kolkata',
}) {
  const windows = await getAvailableWindows({
    businessId,
    staffId,
    locationId,
    fromDate: startAt,
    toDate: startAt,
    timezone,
  });
  return windows.some((w) => w.start <= startAt && w.end >= endAt);
}
