/**
 * Rate limiter for public scheduling endpoints.
 *
 * Strategy:
 *  - When REDIS_URL is set, uses a Redis sliding-window (sorted-set + Lua) so
 *    limits are shared across all server instances.
 *  - When REDIS_URL is absent, falls back to a lightweight in-process map.
 *    ⚠ In-memory mode is per-process: on multi-instance deployments (≥2 dynos /
 *    replicas) an attacker can exceed the limit by routing requests to different
 *    instances. For production multi-instance, ensure REDIS_URL is set.
 *
 * Configurable env vars:
 *   REDIS_URL                           — Redis connection string (optional)
 *   PUBLIC_BOOKING_RATE_WINDOW_MS       — window length in ms (default 60 000)
 *   PUBLIC_BOOKING_RATE_MAX             — max requests per window (default 30)
 *   PUBLIC_APPOINTMENT_RATE_WINDOW_MS   — (default 60 000)
 *   PUBLIC_APPOINTMENT_RATE_MAX         — (default 40)
 */

import { log } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Redis sliding-window (sorted-set + Lua)
// ---------------------------------------------------------------------------

// Lua script: atomically remove stale entries, reject if over limit, add new.
// Returns -1 when the caller should be rate-limited, otherwise the new count.
const SLIDING_WINDOW_LUA = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max      = tonumber(ARGV[3])
local ttlMs    = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = redis.call('ZCARD', key)
if count >= max then
  return -1
end
-- member must be unique within the same millisecond
redis.call('ZADD', key, now, now .. ':' .. redis.call('INCR', key .. ':seq'))
redis.call('PEXPIRE', key, ttlMs)
return count + 1
`;

let redisClient = null;
let redisAvailable = false;

async function initRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;

  try {
    // Dynamic import so the module loads fine even if ioredis is missing.
    const { default: Redis } = await import('ioredis');
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });

    client.on('error', (err) => {
      if (redisAvailable) {
        log('warn', 'rate_limiter_redis_error_falling_back', { message: err.message });
      }
      redisAvailable = false;
    });

    client.on('ready', () => {
      if (!redisAvailable) {
        log('info', 'rate_limiter_redis_connected');
      }
      redisAvailable = true;
    });

    await client.connect();
    redisClient = client;
  } catch (err) {
    log('warn', 'rate_limiter_redis_init_failed_using_memory', { message: err.message });
  }
}

// Fire-and-forget init; the limiter falls back to memory until ready.
initRedis().catch(() => {});

async function redisAllow(key, windowMs, max) {
  const now = Date.now();
  const result = await redisClient.eval(
    SLIDING_WINDOW_LUA,
    1,
    key,
    String(now),
    String(windowMs),
    String(max),
    String(windowMs + 1000), // TTL: window + small buffer
  );
  return result !== -1;
}

// ---------------------------------------------------------------------------
// In-memory sliding-window (fallback)
// ---------------------------------------------------------------------------

const buckets = new Map();

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function memoryAllow(key, windowMs, max) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  // Prune expired hits
  while (bucket.hits.length && bucket.hits[0] <= now - windowMs) {
    bucket.hits.shift();
  }
  if (bucket.hits.length >= max) return false;
  bucket.hits.push(now);
  return true;
}

// Periodic cleanup to prevent the in-memory map growing unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    while (b.hits.length && b.hits[0] <= now - 3_600_000) b.hits.shift();
    if (!b.hits.length) buckets.delete(k);
  }
}, 60_000).unref();

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPublicRateLimiter({ windowMs = 60000, max = 60, message = 'Too many requests' } = {}) {
  return async (req, res, next) => {
    const ipKey = clientKey(req);
    const bucketKey = `rl:${req.path}:${ipKey}`;

    try {
      let allowed;
      if (redisAvailable && redisClient) {
        allowed = await redisAllow(bucketKey, windowMs, max);
      } else {
        allowed = memoryAllow(bucketKey, windowMs, max);
      }

      if (!allowed) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({ error: message });
      }
    } catch (err) {
      // If Redis call fails mid-request, fall back to memory for this request.
      redisAvailable = false;
      log('warn', 'rate_limiter_redis_eval_error', { message: err.message });
      if (!memoryAllow(bucketKey, windowMs, max)) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({ error: message });
      }
    }

    next();
  };
}

export const publicBookingRateLimit = createPublicRateLimiter({
  windowMs: Number(process.env.PUBLIC_BOOKING_RATE_WINDOW_MS || 60000),
  max: Number(process.env.PUBLIC_BOOKING_RATE_MAX || 30),
  message: 'Too many booking requests — please try again shortly',
});

export const publicAppointmentRateLimit = createPublicRateLimiter({
  windowMs: Number(process.env.PUBLIC_APPOINTMENT_RATE_WINDOW_MS || 60000),
  max: Number(process.env.PUBLIC_APPOINTMENT_RATE_MAX || 40),
  message: 'Too many requests — please try again shortly',
});
