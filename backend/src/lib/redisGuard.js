/**
 * Redis command guard for Upstash free tier (10,000 commands / day).
 *
 * Tracks commands issued in the current UTC day using an in-memory counter.
 * If the soft limit is approached, non-critical Redis calls should be skipped.
 *
 * Usage:
 *   import { redisGuard, countRedisCommand } from './redisGuard.js';
 *
 *   if (redisGuard.ok()) {
 *     await redis.set(key, value);
 *     redisGuard.track(1);   // 1 command used
 *   }
 */

const DAILY_LIMIT  = Number(process.env.REDIS_DAILY_LIMIT  || 10_000);
const SOFT_WARN    = Number(process.env.REDIS_SOFT_WARN_PCT || 80) / 100; // warn at 80%
const SOFT_BLOCK   = Number(process.env.REDIS_SOFT_BLOCK_PCT|| 95) / 100; // block non-critical at 95%

let todayUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
let commandCount = 0;
let warned = false;

function resetIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== todayUTC) {
    todayUTC = today;
    commandCount = 0;
    warned = false;
  }
}

export const redisGuard = {
  /** Returns true if it is safe to issue a Redis command (below soft block threshold). */
  ok() {
    resetIfNewDay();
    return commandCount < DAILY_LIMIT * SOFT_BLOCK;
  },

  /** Call after issuing `n` Redis commands to keep the counter accurate. */
  track(n = 1) {
    resetIfNewDay();
    commandCount += n;
    if (!warned && commandCount >= DAILY_LIMIT * SOFT_WARN) {
      warned = true;
      console.warn(
        `[redisGuard] Redis command usage at ${Math.round((commandCount / DAILY_LIMIT) * 100)}% ` +
        `(${commandCount}/${DAILY_LIMIT}) — approaching daily limit.`
      );
    }
  },

  /** Returns current usage statistics. */
  stats() {
    resetIfNewDay();
    return { commandCount, dailyLimit: DAILY_LIMIT, date: todayUTC };
  },
};

export default redisGuard;
