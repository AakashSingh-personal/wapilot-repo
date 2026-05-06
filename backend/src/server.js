import 'dotenv/config';
import { createApp } from './app.js';
import { log } from './utils/logger.js';

const port = Number(process.env.PORT || 3000);

const app = createApp();

app.listen(port, () => {
  log('info', 'server_listening', { port });
});
