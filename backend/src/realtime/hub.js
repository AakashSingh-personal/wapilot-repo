import { log } from '../utils/logger.js';

/** @typedef {import('ws').WebSocket} WebSocket */

/** @type {Map<string, Set<WebSocket>>} */
const businessSockets = new Map();

/** @type {WeakMap<WebSocket, { businessId: string, userId: string, email: string }>} */
const socketMeta = new WeakMap();

function setForBusiness(businessId) {
  const key = String(businessId);
  let set = businessSockets.get(key);
  if (!set) {
    set = new Set();
    businessSockets.set(key, set);
  }
  return set;
}

/**
 * @param {WebSocket} ws
 * @param {{ businessId: string, userId: string, email: string }} meta
 */
export function registerClient(ws, meta) {
  const set = setForBusiness(meta.businessId);
  set.add(ws);
  socketMeta.set(ws, meta);
  log('info', 'realtime_client_registered', {
    businessId: meta.businessId,
    clients: set.size,
  });
}

/**
 * @param {WebSocket} ws
 */
export function unregisterClient(ws) {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  const set = businessSockets.get(String(meta.businessId));
  if (set) {
    set.delete(ws);
    if (set.size === 0) businessSockets.delete(String(meta.businessId));
  }
  socketMeta.delete(ws);
  log('info', 'realtime_client_unregistered', { businessId: meta.businessId });
}

/**
 * @param {WebSocket} ws
 */
export function getSocketMeta(ws) {
  return socketMeta.get(ws) || null;
}

/**
 * Broadcast JSON-serializable payload to all authenticated sockets for a business.
 * @param {string} businessId
 * @param {Record<string, unknown>} payload
 */
export function broadcastToBusiness(businessId, payload) {
  const set = businessSockets.get(String(businessId));
  if (!set || set.size === 0) return 0;
  const raw = JSON.stringify(payload);
  let n = 0;
  for (const ws of set) {
    if (ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(raw);
        n += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return n;
}

/**
 * Broadcast presence to other agents (exclude sender socket).
 * @param {WebSocket} senderWs
 * @param {string} businessId
 * @param {Record<string, unknown>} payload
 */
export function broadcastPresenceToOthers(senderWs, businessId, payload) {
  const set = businessSockets.get(String(businessId));
  if (!set || set.size === 0) return 0;
  const raw = JSON.stringify(payload);
  let n = 0;
  for (const ws of set) {
    if (ws === senderWs) continue;
    if (ws.readyState === 1) {
      try {
        ws.send(raw);
        n += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return n;
}

export function clientCountForBusiness(businessId) {
  return businessSockets.get(String(businessId))?.size ?? 0;
}
