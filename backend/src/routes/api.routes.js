import { Router } from 'express';
import { authMiddleware, requireOwner } from '../middlewares/auth.js';
import * as messageController from '../controllers/message.controller.js';
import * as paymentLinkController from '../controllers/paymentLink.controller.js';
import * as configController from '../controllers/config.controller.js';
import * as billingController from '../controllers/billing.controller.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.post('/send-message', authMiddleware, messageController.sendMessage);
router.post('/create-payment-link', authMiddleware, paymentLinkController.createPaymentLink);

router.get('/config', authMiddleware, configController.getConfig);
router.put('/config', authMiddleware, configController.updateConfig);

router.get('/billing/status', authMiddleware, billingController.subscriptionStatus);
router.get('/billing/pro-qr', authMiddleware, billingController.subscriptionQr);
router.post('/billing/mark-paid', authMiddleware, billingController.markSubscriptionPaid);
router.patch(
  '/billing/payments/:id/verify',
  authMiddleware,
  requireOwner,
  billingController.verifySubscriptionPayment,
);

router.patch('/customer-payments/:id/mark-paid', authMiddleware, requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;
    const cp = await prisma.customerPayment.findFirst({
      where: { id, businessId: req.user.businessId },
    });
    if (!cp) return res.status(404).json({ error: 'Not found' });
    await prisma.customerPayment.update({
      where: { id: cp.id },
      data: { status: 'PAID' },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
