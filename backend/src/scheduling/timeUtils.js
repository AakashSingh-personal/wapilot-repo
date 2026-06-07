/** @param {string} time "HH:mm" or "H:mm AM" */
export function parseTimeToMinutes(time) {
  const raw = String(time || '').trim();
  const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[3].toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return h * 60 + min;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  return null;
}

export function formatMinutesToLabel(minutes, use24h = false) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

/** @param {Date} date @param {number} minutesFromMidnight @param {string} timezone */
export function dateAtMinutes(date, minutesFromMidnight, timezone = 'Asia/Kolkata') {
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  const h = Math.floor(minutesFromMidnight / 60);
  const min = minutesFromMidnight % 60;
  const local = new Date(Date.UTC(y, mo, d, h, min, 0, 0));
  return local;
}

export function startOfDayUtc(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function subtractInterval(windows, blockStart, blockEnd) {
  const out = [];
  for (const w of windows) {
    if (!rangesOverlap(w.start, w.end, blockStart, blockEnd)) {
      out.push(w);
      continue;
    }
    if (blockStart > w.start) out.push({ start: w.start, end: blockStart });
    if (blockEnd < w.end) out.push({ start: blockEnd, end: w.end });
  }
  return out.filter((x) => x.end > x.start);
}
