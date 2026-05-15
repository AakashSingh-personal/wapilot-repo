/** In-memory Meta template list cache (per process) — avoids Meta API on every GET /templates. */
const CACHE_TTL_MS = Number(process.env.META_TEMPLATES_CACHE_TTL_MS || 5 * 60 * 1000);

let cachedAt = 0;
/** @type {unknown[] | null} */
let cachedTemplates = null;

export function getCachedMetaTemplates() {
  if (!cachedTemplates || Date.now() - cachedAt > CACHE_TTL_MS) return null;
  return cachedTemplates;
}

export function setCachedMetaTemplates(templates) {
  cachedTemplates = templates;
  cachedAt = Date.now();
}
