import crypto from 'crypto';
import { getRedisClient } from '../realtime/redisBridge.js';
import { log } from '../utils/logger.js';

const LOCK_PREFIX = 'wapilot:slot:';
const DEFAULT_TTL_SEC = Number(process.env.SLOT_LOCK_TTL_SEC || 30);

function lockKey({ businessId, staffId, startAt }) {
  const iso = new Date(startAt).toISOString();
  return `${LOCK_PREFIX}${businessId}:${staffId}:${iso}`;
}

/**
 * Try to acquire a short-lived Redis lock for a staff slot.
 * @returns {Promise<string|null>} lock token if acquired, null if Redis unavailable or lock held
 */
export async function acquireSlotLock({ businessId, staffId, startAt, ttlSec = DEFAULT_TTL_SEC }) {
  const redis = getRedisClient();
  if (!redis) return `local-${Date.now()}`;

  const key = lockKey({ businessId, staffId, startAt });
  const token = crypto.randomBytes(16).toString('hex');
  try {
    const ok = await redis.set(key, token, 'EX', ttlSec, 'NX');
    return ok === 'OK' ? token : null;
  } catch (e) {
    log('warn', 'slot_lock_acquire_failed', { message: e.message });
    return `local-${Date.now()}`;
  }
}

export async function releaseSlotLock({ businessId, staffId, startAt, token }) {
  if (!token || String(token).startsWith('local-')) return;
  const redis = getRedisClient();
  if (!redis) return;

  const key = lockKey({ businessId, staffId, startAt });
  try {
    const current = await redis.get(key);
    if (current === token) await redis.del(key);
  } catch (e) {
    log('warn', 'slot_lock_release_failed', { message: e.message });
  }
}
