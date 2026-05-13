import * as hub from './hub.js';
import { log } from '../utils/logger.js';
import { isRealtimeClusterEnabled, publishToCluster } from './redisBridge.js';

/**
 * Optional adapter for custom fan-out (runs first when set). Prefer `REDIS_URL` + built-in bridge.
 * @type {null | ((event: Record<string, unknown>) => void | Promise<void>)}
 */
let remotePublishAdapter = null;

export function setRemotePublishAdapter(fn) {
  remotePublishAdapter = typeof fn === 'function' ? fn : null;
}

/**
 * Publish a realtime notification for a business.
 * With `REDIS_URL`, events go through Redis Pub/Sub so every app instance delivers to its local sockets.
 * Without Redis, broadcasts only on this process (single-instance).
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

  const bid = String(businessId);

  if (isRealtimeClusterEnabled()) {
    try {
      await publishToCluster(bid, payload);
      return;
    } catch (e) {
      log('warn', 'realtime_cluster_publish_failed', { message: e.message, businessId: bid });
    }
  }

  hub.broadcastToBusiness(bid, payload);
}
