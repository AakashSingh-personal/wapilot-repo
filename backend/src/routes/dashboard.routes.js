import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/stats', dashboardController.stats);
router.get('/conversations', dashboardController.listConversations);
router.patch(
  '/conversations/:customerId/ai-control',
  dashboardController.patchConversationAiControl,
);
router.get('/customers', dashboardController.listCustomers);
router.patch('/customers/:customerId', dashboardController.patchCustomer);
router.get('/leads', dashboardController.listLeads);
router.get('/messages/:customerId', dashboardController.messagesForCustomer);
router.get('/messages/media/:mediaId', dashboardController.whatsappMedia);
router.get('/bookings', dashboardController.listBookings);
router.get('/payments', dashboardController.listPayments);

export default router;
