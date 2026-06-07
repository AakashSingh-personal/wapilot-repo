import { prisma } from '../lib/prisma.js';
import { runWithTenantContext } from '../lib/tenantContext.js';

export function tenantContextMiddleware(req, _res, next) {
  runWithTenantContext(req.user?.businessId || null, () => next());
}

export async function tenantRlsMiddleware(req, res, next) {
  const businessId = req.user?.businessId;
  runWithTenantContext(businessId || null, () => {
    if (process.env.SCHEDULING_RLS_ENABLED !== '1' || !businessId) {
      return next();
    }
    prisma
      .$executeRaw`SELECT set_config('app.business_id', ${businessId}, false)`
      .then(() => next())
      .catch(next);

    res.on('finish', () => {
      void prisma.$executeRaw`SELECT set_config('app.business_id', '', false)`.catch(() => {});
    });
  });
}
