import rrulePkg from 'rrule';
import { parseTimeToMinutes } from './timeUtils.js';

const { RRule } = rrulePkg;

const DOW_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Expand RRULE occurrences between fromDate and toDate (inclusive days).
 * @returns {Array<{ date: Date, startMin: number, endMin: number, ruleType: string }>}
 */
export function expandAvailabilityRules(rules, fromDate, toDate) {
  const from = new Date(fromDate);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(toDate);
  to.setUTCHours(23, 59, 59, 999);
  const out = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.validFrom && new Date(rule.validFrom) > to) continue;
    if (rule.validUntil && new Date(rule.validUntil) < from) continue;

    const startMin = parseTimeToMinutes(rule.startTime || '09:00') ?? 540;
    const endMin = parseTimeToMinutes(rule.endTime || '18:00') ?? 1080;
    if (endMin <= startMin) continue;

    let rrule;
    try {
      rrule = RRule.fromString(normalizeRrule(rule.rrule));
    } catch {
      continue;
    }

    const rangeStart = rule.validFrom && new Date(rule.validFrom) > from ? new Date(rule.validFrom) : from;
    const rangeEnd = rule.validUntil && new Date(rule.validUntil) < to ? new Date(rule.validUntil) : to;

    const dates = rrule.between(rangeStart, rangeEnd, true);
    for (const dt of dates) {
      const day = new Date(dt);
      day.setUTCHours(0, 0, 0, 0);
      out.push({
        date: day,
        startMin,
        endMin,
        ruleType: rule.ruleType || 'AVAILABLE',
        locationId: rule.locationId || null,
      });
    }
  }

  return out;
}

function normalizeRrule(raw) {
  let s = String(raw || '').trim();
  if (!s) return 'FREQ=WEEKLY;BYDAY=MO';
  if (!/^RRULE:/i.test(s)) s = `RRULE:${s.replace(/^RRULE:/i, '')}`;
  return s;
}

/** Presets for common scheduling patterns */
export function presetToRrule(preset) {
  const p = String(preset || '').toLowerCase();
  if (p === 'every_monday') return 'FREQ=WEEKLY;BYDAY=MO';
  if (p === 'alternate_saturday') return 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA';
  if (p === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (p === 'first_sunday') return 'FREQ=MONTHLY;BYDAY=1SU';
  return preset;
}

export { DOW_MAP };
