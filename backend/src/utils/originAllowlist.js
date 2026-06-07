/**
 * Shared browser Origin allowlist for HTTP CORS and WebSocket connections.
 */
function configuredOrigins() {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const fallbackOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://wapilot.pages.dev',
]);

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (fallbackOrigins.has(origin)) return true;
  if (configuredOrigins().includes(origin)) return true;
  // The former *.pages.dev wildcard has been removed — it allowed any Cloudflare Pages
  // project to make credentialed cross-origin requests.  Add your specific deployment
  // domain to CORS_ORIGIN instead.
  return false;
}
