import 'dotenv/config';
import http from 'http';
import { createApp } from './app.js';
import { log } from './utils/logger.js';
import { attachRealtimeWebSocket } from './realtime/websocket.js';
import { initRealtimeRedis } from './realtime/redisBridge.js';

const port = Number(process.env.PORT || 3000);

async function main() {
  await initRealtimeRedis(process.env.REDIS_URL);

  const app = createApp();
  const server = http.createServer(app);

  attachRealtimeWebSocket(server);

  server.listen(port, () => {
    log('info', 'server_listening', { port });
  });
}

main().catch((e) => {
  log('error', 'server_boot_failed', { message: e.message });
  process.exit(1);
});
