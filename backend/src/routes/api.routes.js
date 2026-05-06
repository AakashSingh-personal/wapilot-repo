import { Router } from 'express';
import { authMiddleware, requireOwner } from '../middlewares/auth.js';
import * as messageController from '../controllers/message.controller.js';
import * as paymentLinkController from '../controllers/paymentLink.controller.js';
import * as configController from '../controllers/config.controller.js';
import * as billingController from '../controllers/billing.controller.js';
import * as communicationController from '../controllers/communication.controller.js';
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

router.get('/wallet', authMiddleware, communicationController.getWallet);
router.get('/wallet/transactions', authMiddleware, communicationController.listWalletTransactions);
router.post('/wallet/add-money', authMiddleware, requireOwner, communicationController.addMoneyToWallet);
router.patch('/wallet/add-money/:id/verify', authMiddleware, requireOwner, communicationController.verifyWalletTopup);

router.get('/contacts', authMiddleware, communicationController.listContacts);
router.post('/contacts/upload', authMiddleware, communicationController.uploadContacts);
router.post('/media/upload', authMiddleware, communicationController.uploadMedia);

router.get('/templates', authMiddleware, communicationController.listTemplates);
router.get('/templates/meta-options', authMiddleware, communicationController.metaTemplateOptions);
router.post('/templates', authMiddleware, communicationController.createTemplate);
router.patch('/templates/:id/status', authMiddleware, communicationController.updateTemplateStatus);

router.post('/communications/send', authMiddleware, communicationController.sendTemplateCommunication);

export default router;
