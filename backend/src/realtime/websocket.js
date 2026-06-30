import { WebSocketServer } from 'ws';
import { isAllowedOrigin } from '../utils/originAllowlist.js';
import { verifySocketAuthToken } from './auth.js';
import { EventType } from './events.js';
import * as hub from './hub.js';
import { log } from '../utils/logger.js';

export const REALTIME_WS_PATH = '/realtime/inbox';

const AUTH_TIMEOUT_MS = 15_000;
const PING_INTERVAL_MS = 25_000;

/**
 * Attach WebSocket server to an existing HTTP server (manual upgrade routing).
 * @param {import('http').Server} httpServer
 * @returns {import('ws').WebSocketServer}
 */
export function attachRealtimeWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const url = new URL(request.url || '/', `http://${host}`);
      if (url.pathname !== REALTIME_WS_PATH) {
        return;
      }
      const origin = request.headers.origin || '';
      if (!isAllowedOrigin(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (e) {
      log('warn', 'realtime_upgrade_failed', { message: e.message });
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    }
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.vartalapDead) return;
      if (ws.vartalapAuthenticated && ws.isAlive === false) {
        ws.vartalapDead = true;
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        return;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    });
  }, PING_INTERVAL_MS);

  httpServer.on('close', () => clearInterval(interval));

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.vartalapAuthenticated = false;
    ws.vartalapDead = false;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const authTimer = setTimeout(() => {
      if (!ws.vartalapAuthenticated && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ type: EventType.AUTH_ERROR, error: 'auth_timeout' }));
        } catch {
          /* ignore */
        }
        ws.close(4401, 'auth_timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (!ws.vartalapAuthenticated) {
        if (msg.type !== 'auth' || !msg.token) {
          try {
            ws.send(JSON.stringify({ type: EventType.AUTH_ERROR, error: 'expected_auth' }));
          } catch {
            /* ignore */
          }
          ws.close(4401, 'expected_auth');
          return;
        }
        try {
          const auth = verifySocketAuthToken(msg.token);
          ws.vartalapAuthenticated = true;
          hub.registerClient(ws, auth);
          clearTimeout(authTimer);
          ws.send(JSON.stringify({ type: EventType.AUTH_OK, businessId: auth.businessId }));
        } catch {
          try {
            ws.send(JSON.stringify({ type: EventType.AUTH_ERROR, error: 'invalid_token' }));
          } catch {
            /* ignore */
          }
          ws.close(4401, 'invalid_token');
        }
        return;
      }

      const meta = hub.getSocketMeta(ws);
      if (!meta) return;

      if (msg.type === EventType.AGENT_TYPING) {
        const customerId = String(msg.customerId || '');
        if (!customerId) return;
        hub.broadcastPresenceToOthers(ws, meta.businessId, {
          type: EventType.AGENT_TYPING,
          customerId,
          conversationId: customerId,
          userId: meta.userId,
          agentName: typeof msg.agentName === 'string' ? msg.agentName : meta.email || 'Agent',
          typing: Boolean(msg.typing),
        });
        return;
      }

      if (msg.type === EventType.AGENT_VIEWING) {
        const customerId = String(msg.customerId || '');
        if (!customerId) return;
        hub.broadcastPresenceToOthers(ws, meta.businessId, {
          type: EventType.AGENT_VIEWING,
          customerId,
          conversationId: customerId,
          userId: meta.userId,
          agentName: typeof msg.agentName === 'string' ? msg.agentName : meta.email || 'Agent',
          viewing: Boolean(msg.viewing),
        });
        return;
      }

      if (msg.type === EventType.PONG || msg.type === 'pong') {
        ws.isAlive = true;
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      hub.unregisterClient(ws);
    });

    ws.on('error', () => {
      clearTimeout(authTimer);
      hub.unregisterClient(ws);
    });
  });

  return wss;
}
