import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as meController from '../controllers/me.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authMiddleware, meController.me);

export default router;
