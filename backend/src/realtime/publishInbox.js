import { publish } from './publisher.js';
import { buildInboxRowForCustomer } from './inboxPayload.js';
import { log } from '../utils/logger.js';

/**
 * Publish a realtime inbox event with optional `inboxRow` + `message` snapshots so
 * clients can update UI without calling REST again (after initial load).
 *
 * @param {{
 *   businessId: string,
 *   type: string,
 *   customerId?: string | null,
 *   conversationId?: string | null,
 *   reason?: string | null,
 *   message?: Record<string, unknown> | null,
 *   [key: string]: unknown
 * }} args
 */
export async function publishInboxLive(args) {
  const {
    businessId,
    type,
    customerId,
    conversationId,
    reason,
    message,
    messages,
    inboxRow: inboxRowArg,
    ...extra
  } = args;
  if (!businessId || !type) return;

  let inboxRow = inboxRowArg ?? null;
  if (!inboxRow && customerId) {
    try {
      inboxRow = await buildInboxRowForCustomer(businessId, customerId);
    } catch (e) {
      log('warn', 'publish_inbox_row_failed', {
        businessId,
        customerId,
        message: e.message,
      });
    }
  }

  const payload = {
    businessId,
    type,
    customerId: customerId ?? null,
    conversationId: conversationId ?? customerId ?? null,
    reason: reason ?? null,
    inboxRow,
    ...extra,
  };

  if (Array.isArray(messages) && messages.length) {
    payload.messages = messages;
  } else if (message !== undefined && message !== null) {
    payload.message = message;
  }

  await publish(payload);
}
