const buckets = new Map();

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function pruneHits(hits, now, windowMs) {
  while (hits.length && hits[0] <= now - windowMs) {
    hits.shift();
  }
}

/**
 * Lightweight in-memory rate limiter for public scheduling endpoints.
 * For multi-instance production, use Redis-backed limiter or edge WAF.
 */
export function createPublicRateLimiter({ windowMs = 60000, max = 60, message = 'Too many requests' } = {}) {
  return (req, res, next) => {
    const key = `${req.path}:${clientKey(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { windowMs, hits: [] };
      buckets.set(key, bucket);
    }
    pruneHits(bucket.hits, now, windowMs);
    if (bucket.hits.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message });
    }
    bucket.hits.push(now);
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
