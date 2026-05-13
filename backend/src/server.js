import 'dotenv/config';
import http from 'http';
import { createApp } from './app.js';
import { log } from './utils/logger.js';
import { attachRealtimeWebSocket } from './realtime/websocket.js';

const port = Number(process.env.PORT || 3000);

const app = createApp();
const server = http.createServer(app);

attachRealtimeWebSocket(server);

server.listen(port, () => {
  log('info', 'server_listening', { port });
});
