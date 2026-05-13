/**
 * Shared browser Origin allowlist for HTTP CORS and WebSocket connections.
 */
function configuredOrigins() {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const fallbackOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (fallbackOrigins.has(origin)) return true;
  if (configuredOrigins().includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin)) return true;
  return false;
}
