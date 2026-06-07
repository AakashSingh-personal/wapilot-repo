import 'dotenv/config';
import http from 'http';
import { createApp } from './app.js';
import { log } from './utils/logger.js';
import { attachRealtimeWebSocket } from './realtime/websocket.js';
import { initRealtimeRedis } from './realtime/redisBridge.js';
import { startSchedulingWorkers } from './scheduling/workers.registry.js';
import { shouldStartWorkersInProcess } from './scheduling/queue.service.js';

const port = Number(process.env.PORT || 3000);

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (!process.env.WHATSAPP_APP_SECRET) {
    log('warn', 'env_missing_whatsapp_app_secret', {
      message: 'WHATSAPP_APP_SECRET not set — incoming WhatsApp webhook signatures will not be verified',
    });
  }
}

async function main() {
  validateEnv();
  await initRealtimeRedis(process.env.REDIS_URL);

  const app = createApp();
  const server = http.createServer(app);

  attachRealtimeWebSocket(server);

  server.listen(port, async () => {
    log('info', 'server_listening', { port, workerEnable: shouldStartWorkersInProcess() });
    if (shouldStartWorkersInProcess()) {
      await startSchedulingWorkers();
    }
  });
}

main().catch((e) => {
  log('error', 'server_boot_failed', { message: e.message });
  process.exit(1);
});
