import { getReconnectDelayMs } from './reconnect.js';
import { ClientEventType } from './events.js';

const REALTIME_PATH = '/realtime/inbox';

/** @typedef {(data: Record<string, unknown>) => void} RealtimeListener */
/** @typedef {(connected: boolean) => void} ConnectionListener */

/** @type {Set<RealtimeListener>} */
const listeners = new Set();
/** @type {Set<ConnectionListener>} */
const connectionListeners = new Set();
/** @type {Set<() => void>} */
const reconnectListeners = new Set();

let ws = null;
let started = false;
let getTokenFn = () => null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let manuallyStopped = false;
/** @type {'idle' | 'connecting' | 'open' | 'await_auth'} */
let phase = 'idle';

function buildWsUrl() {
  const envBase = import.meta.env.VITE_API_URL?.trim?.() || '';
  const pageOrigin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  // Prefer explicit API origin; otherwise same page origin (Vite proxy / same-host API).
  const base = envBase || pageOrigin;
  if (!base) return '';
  try {
    const u = new URL(base, pageOrigin || undefined);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    // Realtime upgrade is served on the API host at this path (not under arbitrary REST path prefixes).
    u.pathname = REALTIME_PATH;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

function setConnected(connected) {
  for (const fn of connectionListeners) {
    try {
      fn(connected);
    } catch {
      /* ignore */
    }
  }
}

function emitEvent(data) {
  for (const fn of listeners) {
    try {
      fn(data);
    } catch {
      /* ignore */
    }
  }
}

function notifyReconnect() {
  for (const fn of reconnectListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!started || manuallyStopped) return;
  clearReconnectTimer();
  const delay = getReconnectDelayMs(reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNow();
  }, delay);
}

function connectNow() {
  if (!started || manuallyStopped) return;
  const url = buildWsUrl();
  const token = getTokenFn?.();
  if (!url || !token) {
    setConnected(false);
    scheduleReconnect();
    return;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  phase = 'connecting';
  setConnected(false);

  try {
    ws = new WebSocket(url);
  } catch {
    ws = null;
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    phase = 'await_auth';
    try {
      ws?.send(JSON.stringify({ type: ClientEventType.AUTH, token }));
    } catch {
      ws?.close();
    }
  });

  ws.addEventListener('message', (ev) => {
    let data;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;

    if (data.type === 'auth_ok') {
      phase = 'open';
      reconnectAttempt = 0;
      setConnected(true);
      notifyReconnect();
      return;
    }

    if (data.type === 'auth_error') {
      setConnected(false);
      emitEvent({ type: 'auth_error', error: data.error || 'auth_failed' });
      return;
    }

    emitEvent(data);
  });

  ws.addEventListener('close', () => {
    ws = null;
    phase = 'idle';
    setConnected(false);
    if (started && !manuallyStopped) scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    /* close event handles reconnect */
  });
}

/**
 * @param {{ getToken: () => string | null }} options
 */
export function startRealtime({ getToken }) {
  manuallyStopped = false;
  started = true;
  getTokenFn = getToken;
  reconnectAttempt = 0;
  clearReconnectTimer();
  connectNow();
}

export function stopRealtime() {
  manuallyStopped = true;
  started = false;
  clearReconnectTimer();
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  phase = 'idle';
  setConnected(false);
}

/** @returns {boolean} */
export function isRealtimeConnected() {
  return phase === 'open' && ws?.readyState === WebSocket.OPEN;
}

/** @param {RealtimeListener} fn */
export function subscribeRealtime(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** @param {ConnectionListener} fn */
export function subscribeConnectionState(fn) {
  connectionListeners.add(fn);
  fn(isRealtimeConnected());
  return () => connectionListeners.delete(fn);
}

/** Fired after successful auth on each (re)connection — resync from REST. */
export function onReconnect(fn) {
  reconnectListeners.add(fn);
  return () => reconnectListeners.delete(fn);
}

/**
 * @param {Record<string, unknown>} body
 */
function sendJson(body) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(body));
  } catch {
    /* ignore */
  }
}

export function sendAgentTyping({ customerId, typing, agentName }) {
  if (!customerId) return;
  sendJson({
    type: ClientEventType.AGENT_TYPING,
    customerId,
    typing: Boolean(typing),
    agentName: agentName || '',
  });
}

export function sendAgentViewing({ customerId, viewing, agentName }) {
  if (!customerId) return;
  sendJson({
    type: ClientEventType.AGENT_VIEWING,
    customerId,
    viewing: Boolean(viewing),
    agentName: agentName || '',
  });
}
