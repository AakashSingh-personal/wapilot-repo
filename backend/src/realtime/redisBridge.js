import Redis from 'ioredis';
import * as hub from './hub.js';
import { log } from '../utils/logger.js';

const CHANNEL = process.env.REDIS_REALTIME_CHANNEL || 'wapilot:realtime';

/**
 * Many env panels paste `redis-cli -u redis://...` or wrap the URI in spaces / quotes.
 * ioredis expects a bare `redis://` or `rediss://` connection string.
 */
export function normalizeRedisUrl(input) {
  if (input == null) return '';
  let s = String(input).trim();
  if (!s) return '';
  s = s.replace(/^["']+|["']+$/g, '');
  try {
    s = decodeURIComponent(s.trim());
  } catch {
    /* keep s */
  }
  s = s.trim();
  s = s.replace(/^(redis-cli\s+)+/i, '');
  s = s.replace(/^-u\s+/i, '');
  s = s.replace(/^["']+|["']+$/g, '');
  s = s.trim();
  const m = s.match(/(rediss?:\/\/[^\s]+)/i);
  if (m) return m[1].trim();
  return s;
}

function redisHostHint(url) {
  try {
    const u = new URL(url);
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${u.hostname}${port}`;
  } catch {
    return 'invalid-uri';
  }
}

/** @type {Redis | null} */
let pub = null;
/** @type {Redis | null} */
let sub = null;

export function isRealtimeClusterEnabled() {
  return Boolean(pub && sub);
}

/**
 * Publish one realtime envelope to Redis; every app instance subscriber fans out to local WebSockets.
 * @param {string} businessId
 * @param {Record<string, unknown>} payload  Same shape as sent to browsers (type, customerId, ts, …)
 * @returns {Promise<boolean>} true if published to Redis
 */
export async function publishToCluster(businessId, payload) {
  if (!pub) return false;
  const wire = JSON.stringify({
    businessId: String(businessId),
    ...payload,
  });
  await pub.publish(CHANNEL, wire);
  return true;
}

/**
 * Start Redis pub + dedicated sub connection. Safe to call with empty URL (no-op).
 * Does not throw — logs and continues without cluster if Redis is unavailable.
 * @param {string | undefined} redisUrl
 * @returns {Promise<boolean>} whether cluster mode is active
 */
export async function initRealtimeRedis(redisUrl) {
  const trimmed = typeof redisUrl === 'string' ? redisUrl.trim() : '';
  const raw = normalizeRedisUrl(redisUrl);
  if (!raw) {
    log('info', 'realtime_redis_skipped', { reason: 'REDIS_URL unset' });
    return false;
  }

  if (trimmed && raw !== trimmed) {
    log('info', 'realtime_redis_url_normalized', {
      hint: redisHostHint(raw),
      note: 'Use a bare redis:// or rediss:// URI in REDIS_URL (not redis-cli -u …)',
    });
  }

  try {
    pub = new Redis(raw, {
      maxRetriesPerRequest: null,
    });
    sub = pub.duplicate();

    pub.on('error', (e) => {
      log('warn', 'realtime_redis_pub_error', { message: e.message });
    });
    sub.on('error', (e) => {
      log('warn', 'realtime_redis_sub_error', { message: e.message });
    });

    sub.on('message', (channel, message) => {
      if (channel !== CHANNEL) return;
      try {
        const obj = JSON.parse(message);
        const bid = obj.businessId;
        if (!bid || typeof bid !== 'string') return;
        const { businessId: _b, ...rest } = obj;
        hub.broadcastToBusiness(bid, rest);
      } catch (e) {
        log('warn', 'realtime_redis_payload_invalid', { message: e.message });
      }
    });

    await sub.subscribe(CHANNEL);
    log('info', 'realtime_redis_ready', { channel: CHANNEL });
    return true;
  } catch (e) {
    log('error', 'realtime_redis_init_failed', { message: e.message });
    try {
      await sub?.quit();
    } catch {
      /* ignore */
    }
    try {
      await pub?.quit();
    } catch {
      /* ignore */
    }
    sub = null;
    pub = null;
    return false;
  }
}
