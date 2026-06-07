import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseUrl } from './src/lib/resolveDatabaseUrl.js';

/** CLI migrations use direct URL when set (recommended for Neon pooler). */
const databaseUrl =
  resolveDatabaseUrl(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL) || '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
