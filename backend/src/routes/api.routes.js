import { Router } from 'express';
import { authMiddleware, requireChiefAdmin, requireOwner } from '../middlewares/auth.js';
import * as messageController from '../controllers/message.controller.js';
import * as paymentLinkController from '../controllers/paymentLink.controller.js';
import * as configController from '../controllers/config.controller.js';
import * as billingController from '../controllers/billing.controller.js';
import * as communicationController from '../controllers/communication.controller.js';
import * as variablesController from '../controllers/variables.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import * as userManagementController from '../controllers/userManagement.controller.js';
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
router.post('/billing/sync-payment', authMiddleware, billingController.syncSubscriptionPayment);

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
router.get('/contacts/book', authMiddleware, communicationController.contactBook);
router.post('/contacts/upload', authMiddleware, communicationController.uploadContacts);
router.delete('/contacts/:id', authMiddleware, communicationController.deleteContact);
router.post('/media/upload', authMiddleware, communicationController.uploadMedia);

router.post('/admin/onboard', authMiddleware, requireChiefAdmin, adminController.onboardClient);
router.post('/admin/chiefadmins', authMiddleware, requireChiefAdmin, adminController.createChiefAdmin);
router.get('/admin/clients', authMiddleware, requireChiefAdmin, adminController.listClients);
router.post('/admin/impersonate', authMiddleware, requireChiefAdmin, adminController.impersonateClient);
router.post('/admin/return-session', authMiddleware, adminController.returnSession);
router.post('/admin/ensure-chiefadmin', adminController.ensureChiefAdmin);

router.get('/user-management/users', authMiddleware, userManagementController.listUsers);
router.get('/user-management/clients', authMiddleware, userManagementController.listClients);
router.post('/user-management/users', authMiddleware, userManagementController.createUser);
router.post('/user-management/users/:id/reset-password', authMiddleware, userManagementController.resetUserPassword);
router.delete('/user-management/users/:id', authMiddleware, userManagementController.deleteUser);

router.get('/templates', authMiddleware, communicationController.listTemplates);
router.get('/templates/meta-options', authMiddleware, communicationController.metaTemplateOptions);
router.post('/templates', authMiddleware, communicationController.createTemplate);
router.get('/templates/:id', authMiddleware, communicationController.getTemplate);
router.patch('/templates/:id', authMiddleware, communicationController.patchTemplate);
router.post('/templates/:id/clone', authMiddleware, communicationController.cloneTemplate);
router.get('/templates/:id/placeholders', authMiddleware, variablesController.getTemplatePlaceholders);
router.get('/templates/:id/variable-mappings', authMiddleware, variablesController.getVariableMappings);
router.put('/templates/:id/variable-mappings', authMiddleware, variablesController.putVariableMappings);
router.post('/templates/:id/preview', authMiddleware, variablesController.previewTemplate);
router.patch('/templates/:id/status', authMiddleware, communicationController.updateTemplateStatus);

router.get('/variables/catalog', authMiddleware, variablesController.getCatalog);
router.get('/variables/definitions', authMiddleware, variablesController.listDefinitions);
router.post('/variables/definitions', authMiddleware, variablesController.createDefinition);
router.patch('/variables/definitions/:id', authMiddleware, variablesController.updateDefinition);
router.delete('/variables/definitions/:id', authMiddleware, variablesController.deleteDefinition);
router.get('/variables/customers/:customerId', authMiddleware, variablesController.getCustomerValues);
router.patch('/variables/customers/:customerId', authMiddleware, variablesController.patchCustomerValues);
router.post('/variables/import-csv', authMiddleware, variablesController.importCustomerVariablesCsv);

router.post('/communications/send', authMiddleware, communicationController.sendTemplateCommunication);

export default router;
