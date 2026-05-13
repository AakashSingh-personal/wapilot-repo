export const MESSAGE_PREFIX = 'WA_MSG:';

export function structuredContent(payload) {
  return `${MESSAGE_PREFIX}${JSON.stringify(payload)}`;
}

export function parseStructuredContent(raw) {
  if (typeof raw !== 'string' || !raw.startsWith(MESSAGE_PREFIX)) return null;
  try {
    return JSON.parse(raw.slice(MESSAGE_PREFIX.length));
  } catch {
    return null;
  }
}
