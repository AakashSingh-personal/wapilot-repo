import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { resolveDatabaseUrl } from './resolveDatabaseUrl.js';

const globalForPrisma = globalThis;

function poolOptions(connectionString) {
  const opts = {
    connectionString,
    // ── Free-tier tuning (Render 512 MB + Neon serverless) ──────────────────
    // Neon suspends compute after ~5 min inactivity; keep pool small so
    // cold-start reconnects happen fast and RAM usage stays low.
    max: Number(process.env.DB_POOL_MAX || 3),
    min: Number(process.env.DB_POOL_MIN || 0),
    idleTimeoutMillis:  Number(process.env.DB_IDLE_TIMEOUT_MS  || 10_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 8_000),
  };
  if (/sslmode=require|neon\.tech|amazonaws\.com/i.test(connectionString || '')) {
    // Validate the server certificate by default (protects against MITM).
    // Neon uses Let's Encrypt; AWS RDS uses Amazon root CAs — both trusted by Node's
    // built-in CA bundle.  Set POSTGRES_SSL_REJECT_UNAUTHORIZED=0 only as a last resort
    // (e.g. self-signed cert in a private network) and document the trade-off.
    const rejectUnauthorized = process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== '0';
    opts.ssl = { rejectUnauthorized };
  }
  return opts;
}

function createPrismaClient() {
  const connectionString = resolveDatabaseUrl(process.env.DATABASE_URL);
  const pool = new pg.Pool(poolOptions(connectionString));
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

/** Reuse one client per process (dev HMR + avoids duplicate pools in production). */
globalForPrisma.prisma = prisma;
