/**
 * Prisma reads `connection_limit` from DATABASE_URL. A value of `1` is correct for
 * PgBouncer *transaction* mode (`pgbouncer=true`), but for a normal Node server it
 * serializes every query — concurrent requests wait and hit "Timed out fetching a new
 * connection from the connection pool".
 */
export function resolveDatabaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  if (raw.startsWith('prisma+')) return raw;

  let u;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }

  const sp = u.searchParams;
  const pgbouncer = sp.get('pgbouncer') === 'true';
  const poolerish =
    pgbouncer ||
    u.port === '6543' ||
    /pooler\.(supabase|neon)\./i.test(u.hostname || '') ||
    /\.pooler\.neon\.tech/i.test(u.hostname || '');

  const poolTimeout = process.env.PRISMA_POOL_TIMEOUT || '30';
  if (!sp.has('pool_timeout')) {
    sp.set('pool_timeout', poolTimeout);
  }

  if (poolerish) {
    return u.toString();
  }

  const rawLimit = sp.get('connection_limit');
  const envLimit = Number(process.env.DATABASE_CONNECTION_LIMIT);
  const defaultLimit = 10;
  const clamped = Math.min(50, Math.max(2, Number.isFinite(envLimit) ? envLimit : defaultLimit));

  // Only override the common misconfig that caps the pool at a single connection.
  if (rawLimit === '1') {
    sp.set('connection_limit', String(clamped));
  }

  return u.toString();
}
