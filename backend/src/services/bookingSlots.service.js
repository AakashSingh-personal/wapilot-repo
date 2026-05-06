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

/**
 * @param {string} text
 * @param {string[]} slots
 */
export function matchSlotSelection(text, slots) {
  const raw = (text || '').trim();
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= slots.length) {
    return { slot: slots[n - 1], service: 'General' };
  }
  const lower = raw.toLowerCase();
  const hit = slots.find((s) => s.toLowerCase() === lower || lower.includes(s.toLowerCase()));
  if (hit) return { slot: hit, service: 'General' };
  return null;
}
