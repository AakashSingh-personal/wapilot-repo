import { prisma } from '../lib/prisma.js';
import { sendWhatsAppText, sendWhatsAppTemplate } from '../services/whatsapp.service.js';
import { log } from '../utils/logger.js';
import { sessionAllowsFreeForm } from '../utils/conversationStatus.js';
import {
  appointmentSelfServiceFooter,
  formatAppointmentWhen,
} from './appointmentLinks.service.js';
import {
  configuredReminderChannels,
  deliverReminder,
  isEmailConfigured,
  isSmsConfigured,
  sendEmail,
} from './notificationDelivery.service.js';
import { getWhatsAppTemplatesForBusiness, getSchedulingSettings } from './schedulingSettings.service.js';

const REMINDER_OFFSETS = [
  { offsetMinutes: 1440, label: '24 hours' },
  { offsetMinutes: 120, label: '2 hours' },
  { offsetMinutes: 30, label: '30 minutes' },
];

function templateLang() {
  return process.env.WHATSAPP_SCHEDULING_TEMPLATE_LANG || 'en_US';
}

function appointmentTemplateParams(appointment, extraLabel = '') {
  const tz = appointment.location?.timezone || 'Asia/Kolkata';
  const when = formatAppointmentWhen(appointment.startAt, tz);
  return [
    appointment.service?.name || 'Appointment',
    when,
    appointment.appointmentNumber,
    extraLabel || appointment.staff?.name || appointment.location?.name || '—',
  ];
}

async function sendSchedulingWhatsApp({
  phoneNumberId,
  customer,
  body,
  templateName,
  bodyParameters,
  languageCode,
}) {
  const useTemplate =
    templateName && !sessionAllowsFreeForm(customer?.lastInboundCustomerMessageAt);

  if (useTemplate) {
    const res = await sendWhatsAppTemplate({
      phoneNumberId,
      toPhoneE164: customer.phone,
      templateName,
      languageCode: languageCode || templateLang(),
      bodyParameters,
    });
    if (!res?.skipped) return res;
  }

  return sendWhatsAppText({
    phoneNumberId,
    toPhoneE164: customer.phone,
    body,
  });
}

function buildReminderMessage(appointment, offsetLabel) {
  const tz = appointment.location?.timezone || 'Asia/Kolkata';
  const when = formatAppointmentWhen(appointment.startAt, tz);
  return (
    `Reminder (${offsetLabel}): Your appointment is scheduled.\n` +
    `Service: ${appointment.service?.name || 'Appointment'}\n` +
    `Staff: ${appointment.staff?.name || '—'}\n` +
    `When: ${when}\n` +
    `Location: ${appointment.location?.name || '—'}\n` +
    `Ref: ${appointment.appointmentNumber}\n` +
    `Reply RESCHEDULE or CANCEL to manage via WhatsApp.` +
    appointmentSelfServiceFooter(appointment)
  );
}

function buildReminderSubject(appointment) {
  return `Appointment reminder — ${appointment.appointmentNumber}`;
}

function channelEnabled(channel, activeChannels) {
  const configured = activeChannels?.length ? activeChannels : configuredReminderChannels();
  if (!configured.includes(channel)) return false;
  if (channel === 'WHATSAPP') return true;
  if (channel === 'EMAIL') return isEmailConfigured();
  if (channel === 'SMS') return isSmsConfigured();
  return false;
}

function channelRecipientReady(channel, customer) {
  if (channel === 'WHATSAPP') return Boolean(customer?.phone);
  if (channel === 'EMAIL') return Boolean(customer?.email);
  if (channel === 'SMS') return Boolean(customer?.phone);
  return false;
}

export function buildConfirmationMessage(appointment) {
  const tz = appointment.location?.timezone || 'Asia/Kolkata';
  const when = formatAppointmentWhen(appointment.startAt, tz);
  return (
    `Booking confirmed!\n` +
    `Service: ${appointment.service?.name || 'Appointment'}\n` +
    `Staff: ${appointment.staff?.name || '—'}\n` +
    `When: ${when}\n` +
    `Ref: ${appointment.appointmentNumber}` +
    appointmentSelfServiceFooter(appointment)
  );
}

export async function sendRatingRequestWhatsApp(appointment) {
  const full = appointment.customer
    ? appointment
    : await prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: { customer: true, service: true, staff: true },
      });
  if (!full?.customer?.phone) return;

  const business = await prisma.business.findUnique({
    where: { id: full.businessId },
    select: { phoneNumberId: true },
  });
  if (!business?.phoneNumberId) return;

  try {
    await sendWhatsAppText({
      phoneNumberId: business.phoneNumberId,
      toPhoneE164: full.customer.phone,
      body:
        `How was your visit for ${full.service?.name || 'your appointment'} with ${full.staff?.name || 'our team'}?\n` +
        `Reply with a rating from 1 to 5.`,
    });
  } catch (e) {
    log('warn', 'rating_request_whatsapp_failed', { message: e.message });
  }
}

export async function sendAppointmentConfirmationWhatsApp(appointment) {
  const full = appointment.customer
    ? appointment
    : await prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: {
          customer: true,
          service: true,
          staff: true,
          location: true,
        },
      });
  if (!full?.customer?.phone) return;

  const business = await prisma.business.findUnique({
    where: { id: full.businessId },
    select: { phoneNumberId: true },
  });
  if (!business?.phoneNumberId) return;

  try {
    const templates = await getWhatsAppTemplatesForBusiness(full.businessId);
    await sendSchedulingWhatsApp({
      phoneNumberId: business.phoneNumberId,
      customer: full.customer,
      body: buildConfirmationMessage(full),
      templateName: templates.confirmation,
      bodyParameters: appointmentTemplateParams(full, 'confirmed'),
      languageCode: templates.lang,
    });
  } catch (e) {
    log('warn', 'appointment_confirmation_whatsapp_failed', { message: e.message });
  }
}

export async function sendAppointmentConfirmationEmail(appointment) {
  if (!isEmailConfigured()) return;

  const full = appointment.customer?.email
    ? appointment
    : await prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: {
          customer: true,
          service: true,
          staff: true,
          location: true,
        },
      });
  if (!full?.customer?.email) return;

  const business = await prisma.business.findUnique({
    where: { id: full.businessId },
    select: { name: true },
  });

  try {
    await sendEmail({
      to: full.customer.email,
      subject: `Booking confirmed — ${full.service?.name || 'Appointment'} (${full.appointmentNumber})`,
      text: `Hi${full.customer.name ? ` ${full.customer.name}` : ''},\n\n${buildConfirmationMessage(full)}\n\n— ${business?.name || 'WAPilot'}`,
    });
  } catch (e) {
    log('warn', 'appointment_confirmation_email_failed', { message: e.message });
  }
}

export async function scheduleRemindersForAppointment(appointment) {
  if (!['PENDING', 'CONFIRMED'].includes(appointment.status)) return;

  const full = appointment.service
    ? appointment
    : await prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: { service: true, staff: true, location: true, customer: true },
      });
  if (!full) return;

  const settings = await getSchedulingSettings(full.businessId);
  const activeChannels =
    Array.isArray(settings.reminderChannels) && settings.reminderChannels.length
      ? settings.reminderChannels.map((c) => String(c).toUpperCase())
      : null;

  await cancelRemindersForAppointment(full.id);

  const rows = [];
  for (const { offsetMinutes, label } of REMINDER_OFFSETS) {
    const scheduledAt = new Date(full.startAt.getTime() - offsetMinutes * 60000);
    if (scheduledAt <= new Date()) continue;

    const message = buildReminderMessage(full, label);
    const subject = buildReminderSubject(full);

    for (const channel of ['WHATSAPP', 'EMAIL', 'SMS']) {
      if (!channelEnabled(channel, activeChannels)) continue;
      if (!channelRecipientReady(channel, full.customer)) continue;
      rows.push({
        businessId: full.businessId,
        appointmentId: full.id,
        channel,
        scheduledAt,
        offsetMinutes,
        payload: { label, message, subject },
      });
    }
  }
  if (rows.length) {
    await prisma.reminderSchedule.createMany({ data: rows });
  }
}

export async function cancelRemindersForAppointment(appointmentId) {
  await prisma.reminderSchedule.updateMany({
    where: { appointmentId, status: 'SCHEDULED' },
    data: { status: 'CANCELLED' },
  });
}

async function dispatchReminderRow(row) {
  const business = await prisma.business.findUnique({
    where: { id: row.businessId },
    select: { phoneNumberId: true },
  });
  const customer = row.appointment?.customer;
  const body = row.payload?.message || buildReminderMessage(row.appointment, 'soon');
  const subject = row.payload?.subject || buildReminderSubject(row.appointment);

  if (row.channel === 'WHATSAPP') {
    if (customer?.phone && business?.phoneNumberId) {
      const templates = await getWhatsAppTemplatesForBusiness(row.businessId);
      const label = row.payload?.label || 'soon';
      await sendSchedulingWhatsApp({
        phoneNumberId: business.phoneNumberId,
        customer,
        body,
        templateName: templates.reminder,
        bodyParameters: appointmentTemplateParams(row.appointment, label),
        languageCode: templates.lang,
      });
      return;
    }
    throw new Error('WhatsApp not configured or customer has no phone');
  }

  await deliverReminder({
    channel: row.channel,
    toEmail: customer?.email,
    toPhoneE164: customer?.phone,
    subject,
    body,
  });
}

export async function sendTestNotificationsForAppointment(appointmentId, businessId) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include: { customer: true, service: true, staff: true, location: true },
  });
  if (!appointment) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }

  const settings = await getSchedulingSettings(businessId);
  const activeChannels =
    Array.isArray(settings.reminderChannels) && settings.reminderChannels.length
      ? settings.reminderChannels.map((c) => String(c).toUpperCase())
      : null;

  const sent = { confirmation: [], reminder: [] };

  await sendAppointmentConfirmationWhatsApp(appointment);
  if (appointment.customer?.phone) sent.confirmation.push('WHATSAPP');
  await sendAppointmentConfirmationEmail(appointment);
  if (appointment.customer?.email && isEmailConfigured()) sent.confirmation.push('EMAIL');

  const message = buildReminderMessage(appointment, 'test');
  const subject = buildReminderSubject(appointment);
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { phoneNumberId: true },
  });

  for (const channel of ['WHATSAPP', 'EMAIL', 'SMS']) {
    if (!channelEnabled(channel, activeChannels)) continue;
    if (!channelRecipientReady(channel, appointment.customer)) continue;
    try {
      if (channel === 'WHATSAPP') {
        if (!business?.phoneNumberId) continue;
        const templates = await getWhatsAppTemplatesForBusiness(businessId);
        await sendSchedulingWhatsApp({
          phoneNumberId: business.phoneNumberId,
          customer: appointment.customer,
          body: message,
          templateName: templates.reminder,
          bodyParameters: appointmentTemplateParams(appointment, 'test'),
          languageCode: templates.lang,
        });
      } else {
        await deliverReminder({
          channel,
          toEmail: appointment.customer?.email,
          toPhoneE164: appointment.customer?.phone,
          subject,
          body: message,
        });
      }
      sent.reminder.push(channel);
    } catch (e) {
      log('warn', 'test_reminder_send_failed', { channel, message: e.message });
    }
  }

  return sent;
}

export async function processDueReminders() {
  const due = await prisma.reminderSchedule.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
    take: 50,
    include: {
      appointment: {
        include: {
          customer: true,
          service: true,
          staff: true,
          location: true,
        },
      },
    },
  });

  for (const row of due) {
    try {
      await dispatchReminderRow(row);
      await prisma.reminderSchedule.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (e) {
      log('warn', 'reminder_send_failed', { id: row.id, channel: row.channel, message: e.message });
      await prisma.reminderSchedule.update({
        where: { id: row.id },
        data: { status: 'FAILED', failureReason: e.message },
      });
    }
  }
}

export function startReminderWorker() {
  const intervalMs = Number(process.env.REMINDER_POLL_MS || 60000);
  setInterval(() => {
    void processDueReminders();
  }, intervalMs);
  log('info', 'reminder_worker_started', { intervalMs, deprecated: 'use workers.registry' });
}
