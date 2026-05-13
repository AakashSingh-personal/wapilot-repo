import * as hub from './hub.js';

/**
 * Optional adapter for horizontal scaling (e.g. Redis Pub/Sub). When set, `publish`
 * delegates to the adapter instead of the in-process hub.
 * @type {null | ((event: Record<string, unknown>) => void | Promise<void>)}
 */
let remotePublishAdapter = null;

export function setRemotePublishAdapter(fn) {
  remotePublishAdapter = typeof fn === 'function' ? fn : null;
}

/**
 * Publish a realtime notification for a business.
 * Future: swap implementation for Redis Pub/Sub without changing call sites.
 *
 * @param {{
 *   businessId: string,
 *   type: string,
 *   customerId?: string | null,
 *   conversationId?: string | null,
 *   userId?: string | null,
 *   reason?: string | null,
 *   agentName?: string | null,
 *   [key: string]: unknown
 * }} event
 * @returns {Promise<void>}
 */
export async function publish(event) {
  if (remotePublishAdapter) {
    await remotePublishAdapter(event);
    return;
  }
  const { businessId, type, customerId, conversationId, reason, ...rest } = event;
  if (!businessId || !type) return;

  const payload = {
    type,
    customerId: customerId ?? null,
    conversationId: conversationId ?? customerId ?? null,
    reason: reason ?? null,
    ...rest,
    ts: Date.now(),
  };

  hub.broadcastToBusiness(String(businessId), payload);
}
