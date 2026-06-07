import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import apiRoutes from './routes/api.routes.js';
import schedulingRoutes from './routes/scheduling.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { log } from './utils/logger.js';
import { isAllowedOrigin } from './utils/originAllowlist.js';

export function createApp() {
  const app = express();

  // Security headers: X-Content-Type-Options, X-Frame-Options, HSTS, etc.
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow media proxy to serve to browser
    contentSecurityPolicy: false, // CSP managed by frontend (Vite/React)
  }));

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser requests (curl, server-to-server) without an Origin header.
        if (!origin) return callback(null, true);
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/webhook', express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }), webhookRoutes);

  // Route-aware JSON body parser:
  //   • Staff photo upload (base64 payload)  → 25 MB
  //   • Everything else                       →  1 MB (prevents unauthenticated memory exhaustion
  //                                              on public booking / rating endpoints)
  const bigBodyJson  = express.json({ limit: process.env.STAFF_PHOTO_JSON_LIMIT || '25mb' });
  const defaultJson  = express.json({ limit: process.env.JSON_BODY_LIMIT       ||  '1mb' });
  app.use((req, res, next) => {
    const isPhotoUpload =
      req.method === 'POST' && /\/profile-picture\/upload$/.test(req.path);
    return isPhotoUpload ? bigBodyJson(req, res, next) : defaultJson(req, res, next);
  });

  app.use('/auth', authRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/', schedulingRoutes);
  app.use('/', apiRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(errorHandler);

  log('info', 'app_initialized');

  return app;
}
