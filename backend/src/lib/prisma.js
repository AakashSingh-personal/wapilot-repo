import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './resolveDatabaseUrl.js';

const globalForPrisma = globalThis;

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

/** Reuse one client per process (dev HMR + avoids duplicate pools in production). */
globalForPrisma.prisma = prisma;
