import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage();

export function runWithTenantContext(businessId, fn) {
  return storage.run({ businessId: businessId || null }, fn);
}

export function getTenantContext() {
  return storage.getStore()?.businessId || null;
}

export function tenantContextMiddleware(req, _res, next) {
  const businessId = req.user?.businessId || null;
  runWithTenantContext(businessId, () => next());
}
