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

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/webhook', express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }), webhookRoutes);
  app.use(express.json());

  app.use('/auth', authRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/', apiRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(errorHandler);

  log('info', 'app_initialized');

  return app;
}
