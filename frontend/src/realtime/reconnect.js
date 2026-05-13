/** Exponential-ish backoff caps at 30s (per product spec). */
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];

/**
 * @param {number} attemptIndex 0-based attempt after a failure
 */
export function getReconnectDelayMs(attemptIndex) {
  const i = Math.min(Math.max(attemptIndex, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[i];
}
