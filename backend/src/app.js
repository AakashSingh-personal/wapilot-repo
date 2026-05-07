import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import apiRoutes from './routes/api.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { log } from './utils/logger.js';

export function createApp() {
  const app = express();
  const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const fallbackOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allowedExactOrigins = new Set([...fallbackOrigins, ...configuredOrigins]);

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser requests (curl, server-to-server) without an Origin header.
        if (!origin) return callback(null, true);
        if (allowedExactOrigins.has(origin)) return callback(null, true);
        if (/^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/webhook', express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }), webhookRoutes);
  // Media uploads can send base64 payloads in JSON, which exceed Express default 100kb limit.
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));

  app.use('/auth', authRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/', apiRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(errorHandler);

  log('info', 'app_initialized');

  return app;
}
