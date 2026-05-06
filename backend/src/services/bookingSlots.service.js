export function parseSlotsFromConfig(workingHoursRaw) {
  try {
    const j = JSON.parse(workingHoursRaw || '{}');
    if (Array.isArray(j.slots) && j.slots.length) return j.slots.map(String);
  } catch {
    /* fallthrough */
  }
  return ['3 PM', '5 PM'];
}

export function formatSlotsMessage(slots) {
  const lines = slots.map((s, i) => `${i + 1}. ${s}`);
  return `Available slots:\n\n${lines.join('\n')}\n\nReply with the number (e.g. 1 or 2).`;
}

function normalizeSlotText(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\./g, '');
}

function numberWordToIndex(raw) {
  const t = String(raw || '').toLowerCase();
  const map = {
    one: 1,
    first: 1,
    two: 2,
    second: 2,
    three: 3,
    third: 3,
    four: 4,
    fourth: 4,
    five: 5,
    fifth: 5,
  };
  return map[t] || null;
}

/**
 * @param {string} text
 * @param {string[]} slots
 */
export function matchSlotSelection(text, slots) {
  const raw = (text || '').trim();
  const numberLike = parseInt(raw, 10);
  const wordLike = numberWordToIndex(raw);
  const n = Number.isNaN(numberLike) ? wordLike : numberLike;
  if (!Number.isNaN(n) && n >= 1 && n <= slots.length) {
    return { slot: slots[n - 1], service: 'General' };
  }
  const lower = raw.toLowerCase();
  const normalizedInput = normalizeSlotText(raw);
  const hit = slots.find((s) => {
    const a = s.toLowerCase();
    const b = normalizeSlotText(s);
    return a === lower || lower.includes(a) || normalizedInput.includes(b);
  });
  if (hit) return { slot: hit, service: 'General' };
  const timeMatch = lower.match(/\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/);
  if (timeMatch) {
    const token = `${timeMatch[1]}${timeMatch[3]}`;
    const byTime = slots.find((s) => normalizeSlotText(s).includes(token));
    if (byTime) return { slot: byTime, service: 'General' };
  }
  return null;
}
