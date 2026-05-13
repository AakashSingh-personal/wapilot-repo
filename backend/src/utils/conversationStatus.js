import { parseStructuredContent } from './waStructuredMessage.js';

/** @typedef {'active'|'expiring'|'expired'} SessionStatus */
/** @typedef {'sent'|'unread'|'read'|'replied'} MessageStatus */

/**
 * WhatsApp 24h session from last inbound customer message (PRD).
 * @param {Date|string|null|undefined} lastInboundCustomerMessageAt
 * @param {Date} [now]
 * @returns {SessionStatus}
 */
export function computeSessionStatus(lastInboundCustomerMessageAt, now = new Date()) {
  if (!lastInboundCustomerMessageAt) return 'expired';
  const ms = now.getTime() - new Date(lastInboundCustomerMessageAt).getTime();
  const hours = ms / 3600000;
  if (hours < 23) return 'active';
  if (hours < 24) return 'expiring';
  return 'expired';
}

/**
 * Free-form messaging allowed when session not expired (< 24h since last customer msg).
 */
export function sessionAllowsFreeForm(lastInboundCustomerMessageAt, now = new Date()) {
  return computeSessionStatus(lastInboundCustomerMessageAt, now) !== 'expired';
}

/**
 * @param {string} content
 * @returns {'sent'|'delivered'|'read'|null}
 */
export function outboundDeliveryTierFromContent(content) {
  const parsed = parseStructuredContent(content);
  if (parsed?.direction === 'outbound' && parsed.status) {
    const s = String(parsed.status).toLowerCase();
    if (s === 'read') return 'read';
    if (s === 'delivered') return 'delivered';
    if (s === 'sent' || s === 'pending') return 'sent';
  }
  return 'sent';
}

/**
 * @param {{ latestOutboundContent: string, latestOutboundAt: Date, hasUserReplyAfter: boolean }} args
 * @returns {MessageStatus|null}
 */
export function computeMessageStatus({ latestOutboundContent, latestOutboundAt, hasUserReplyAfter }) {
  if (!latestOutboundAt) return null;
  if (hasUserReplyAfter) return 'replied';
  const tier = outboundDeliveryTierFromContent(latestOutboundContent);
  if (tier === 'read') return 'read';
  if (tier === 'delivered') return 'unread';
  return 'sent';
}
