import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import {
  publicAppointmentRateLimit,
  publicBookingRateLimit,
} from '../middlewares/publicRateLimit.js';
import { tenantRlsMiddleware } from '../middlewares/tenantRls.js';
import * as scheduling from '../controllers/scheduling.controller.js';

const router = Router();

router.post('/public/appointments/:token', publicAppointmentRateLimit, scheduling.publicAppointmentAction);
router.get('/public/appointments/:token', publicAppointmentRateLimit, scheduling.getPublicAppointment);
router.get('/public/appointments/:token/calendar.ics', publicAppointmentRateLimit, scheduling.downloadPublicAppointmentIcs);
router.get('/public/appointments/:token/slots', publicAppointmentRateLimit, scheduling.getPublicAppointmentSlots);
router.post('/public/appointments/:token/rating', publicAppointmentRateLimit, scheduling.publicRateAppointment);
router.post('/public/appointments/:token/pay', publicAppointmentRateLimit, scheduling.publicAppointmentPayment);
router.get('/public/booking/:token', publicBookingRateLimit, scheduling.getPublicBookingCatalogHandler);
router.get('/public/booking/:token/slots', publicBookingRateLimit, scheduling.getPublicBookingSlotsHandler);
router.post('/public/booking/:token', publicBookingRateLimit, scheduling.createPublicBookingHandler);
router.post('/public/booking/:token/waitlist', publicBookingRateLimit, scheduling.joinPublicWaitlistHandler);
router.get('/scheduling/calendar/google/callback', scheduling.googleCalendarCallback);
router.post('/scheduling/calendar/google/webhook', scheduling.googleCalendarWebhook);
router.get('/scheduling/calendar/outlook/callback', scheduling.outlookCalendarCallback);
router.post('/scheduling/calendar/outlook/webhook', scheduling.outlookCalendarWebhook);

router.use(authMiddleware);
router.use(tenantRlsMiddleware);

router.post('/scheduling/seed-defaults', scheduling.seedDefaults);

router.get('/scheduling/locations', scheduling.listLocations);
router.post('/scheduling/locations', scheduling.createLocation);
router.patch('/scheduling/locations/:id', scheduling.updateLocation);

router.get('/scheduling/staff', scheduling.listStaff);
router.get('/scheduling/staff/storage-capabilities', scheduling.getStaffStorageCapabilities);
router.get('/scheduling/staff/linkable-users', scheduling.listLinkableUsers);
router.post('/scheduling/staff', scheduling.createStaff);
router.patch('/scheduling/staff/:id', scheduling.updateStaff);
router.delete('/scheduling/staff/:id', scheduling.deleteStaff);
router.post('/scheduling/staff/:id/profile-picture/presign', scheduling.presignStaffProfilePicture);
router.post('/scheduling/staff/:id/profile-picture/upload', scheduling.uploadStaffProfilePicture);
router.post('/scheduling/staff/:id/profile-picture/confirm', scheduling.confirmStaffProfilePicture);
router.get('/scheduling/staff/:staffId/working-hours', scheduling.getWorkingHours);
router.put('/scheduling/staff/:staffId/working-hours', scheduling.putWorkingHours);
router.post('/scheduling/staff/:staffId/leaves', scheduling.createLeave);
router.get('/scheduling/staff/:staffId/leaves', scheduling.listStaffLeaves);
router.delete('/scheduling/staff/:staffId/leaves/:leaveId', scheduling.deleteStaffLeave);
router.get('/scheduling/staff/:staffId/breaks', scheduling.listBreaks);
router.post('/scheduling/staff/:staffId/breaks', scheduling.createBreak);
router.delete('/scheduling/staff/:staffId/breaks/:breakId', scheduling.deleteBreak);
router.get('/scheduling/staff/:staffId/schedule/today', scheduling.staffScheduleToday);
router.get('/scheduling/staff/:staffId/schedule/upcoming', scheduling.staffScheduleUpcoming);

router.get('/scheduling/services', scheduling.listServices);
router.post('/scheduling/services', scheduling.createService);
router.patch('/scheduling/services/:id', scheduling.updateService);
router.get('/scheduling/service-categories', scheduling.listServiceCategories);
router.post('/scheduling/service-categories', scheduling.createServiceCategory);
router.patch('/scheduling/service-categories/:id', scheduling.updateServiceCategory);
router.delete('/scheduling/service-categories/:id', scheduling.deleteServiceCategory);

router.get('/scheduling/holidays', scheduling.listHolidays);
router.post('/scheduling/holidays', scheduling.createHoliday);
router.delete('/scheduling/holidays/:id', scheduling.deleteHoliday);

router.get('/scheduling/slots/available', scheduling.getAvailableSlots);

router.get('/scheduling/schedule/today', scheduling.businessScheduleToday);
router.post('/scheduling/customers/quick', scheduling.quickCreateCustomer);

router.post('/scheduling/appointments/confirm-pending', scheduling.confirmPendingAppointmentsHandler);
router.post('/scheduling/appointments/check-in-today', scheduling.checkInTodayAppointmentsHandler);
router.get('/scheduling/appointments', scheduling.listAppointments);
router.get('/scheduling/appointments/export.csv', scheduling.exportAppointmentsCsv);
router.get('/scheduling/dashboard/summary', scheduling.schedulingDashboardSummary);
router.post('/scheduling/appointments', scheduling.createAppointmentHandler);
router.post('/scheduling/appointments/:id/notifications/send', scheduling.sendAppointmentNotificationsHandler);
router.get('/scheduling/appointments/:id/calendar.ics', scheduling.downloadAppointmentIcs);
router.get('/scheduling/appointments/:id', scheduling.getAppointment);
router.patch('/scheduling/appointments/:id', scheduling.patchAppointment);
router.patch('/scheduling/appointments/:id/status', scheduling.patchAppointmentStatus);
router.post('/scheduling/appointments/:id/reschedule', scheduling.rescheduleAppointmentHandler);
router.post('/scheduling/appointments/:id/payments', scheduling.recordPaymentHandler);
router.post('/scheduling/appointments/:id/payments/intent', scheduling.createPaymentIntentHandler);
router.post('/scheduling/appointments/:id/payments/qr', scheduling.createPaymentQrHandler);
router.get('/scheduling/appointments/:id/payments', scheduling.listAppointmentPayments);
router.get('/scheduling/appointments/:id/manage-link', scheduling.getAppointmentManageLink);
router.post('/scheduling/appointments/:id/rating', scheduling.rateAppointment);

router.get('/scheduling/customers/:customerId/stats', scheduling.getCustomerStatsHandler);
router.post('/scheduling/campaigns/rebooking', scheduling.triggerRebookingCampaign);

router.get('/scheduling/calendar/google/auth-url', scheduling.getGoogleCalendarAuthUrl);
router.get('/scheduling/calendar/outlook/auth-url', scheduling.getOutlookCalendarAuthUrl);
router.get('/scheduling/calendar/connections', scheduling.listCalendarConnectionsHandler);
router.post('/scheduling/calendar/:connectionId/sync', scheduling.syncCalendarConnectionHandler);
router.post('/scheduling/calendar/:connectionId/renew-webhook', scheduling.renewCalendarWebhookHandler);
router.delete('/scheduling/calendar/:connectionId', scheduling.deleteCalendarConnectionHandler);

router.get('/scheduling/staff/:staffId/availability-rules', scheduling.listAvailabilityRules);
router.post('/scheduling/staff/:staffId/availability-rules', scheduling.createAvailabilityRule);
router.delete('/scheduling/staff/:staffId/availability-rules/:ruleId', scheduling.deleteAvailabilityRule);

router.post('/scheduling/waitlist', scheduling.joinWaitlistHandler);
router.get('/scheduling/waitlist/export.csv', scheduling.exportWaitlistCsv);
router.get('/scheduling/waitlist', scheduling.listWaitlist);
router.delete('/scheduling/waitlist/:id', scheduling.cancelWaitlistHandler);

router.get('/scheduling/analytics/summary', scheduling.analyticsSummary);
router.get('/scheduling/ratings', scheduling.listRecentRatings);

router.get('/scheduling/settings', scheduling.getSchedulingSettingsHandler);
router.patch('/scheduling/settings', scheduling.updateSchedulingSettingsHandler);
router.get('/scheduling/public-booking/link', scheduling.getPublicBookingLink);

router.post('/scheduling/calendar/apple/connect', scheduling.connectAppleCalendarHandler);

export default router;
