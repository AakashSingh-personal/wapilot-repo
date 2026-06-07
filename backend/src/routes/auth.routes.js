import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as meController from '../controllers/me.controller.js';
import { authMiddleware } from '../middlewares/auth.js';
import { createPublicRateLimiter } from '../middlewares/publicRateLimit.js';

const loginRateLimit = createPublicRateLimiter({
  windowMs: Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000), // 15 minutes
  max: Number(process.env.LOGIN_RATE_MAX || 10),
  message: 'Too many login attempts — please try again in 15 minutes',
});

const router = Router();

router.post('/register', loginRateLimit, authController.register);
router.post('/login', loginRateLimit, authController.login);
router.get('/me', authMiddleware, meController.me);
router.post('/change-password', authMiddleware, authController.changePassword);

export default router;
