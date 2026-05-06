import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller.js';

const router = Router();

router.get('/', webhookController.verifyWebhook);
router.post('/', webhookController.receiveWebhook);
router.post('/razorpay', webhookController.receiveRazorpayWebhook);

export default router;
