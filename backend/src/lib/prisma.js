import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { resolveDatabaseUrl } from './resolveDatabaseUrl.js';

const globalForPrisma = globalThis;

function poolOptions(connectionString) {
  const opts = { connectionString };
  if (/sslmode=require|neon\.tech|amazonaws\.com/i.test(connectionString || '')) {
    opts.ssl = { rejectUnauthorized: false };
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
