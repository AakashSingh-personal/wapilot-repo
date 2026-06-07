import { prisma } from '../lib/prisma.js';
import { findAvailableSlots } from './slotEngine.service.js';
import {
  createAppointment,
  updateAppointmentStatus,
  rescheduleAppointment,
  ensureSchedulingDefaults,
} from './appointment.service.js';
import { joinWaitlist, acceptWaitlistOffer } from './waitlist.service.js';
import { createAppointmentPaymentIntent } from './appointmentPayment.service.js';
import { refreshCustomerAppointmentStats } from './customerStats.service.js';
import { sendAppointmentConfirmationWhatsApp } from './reminder.service.js';
import { formatAppointmentWhen } from './appointmentLinks.service.js';
import { runSchedulingLlmTurn } from './aiBookingLlm.service.js';

const SESSION_TTL_MS = 30 * 60 * 1000;

function formatSlotsMessage(slots) {
  if (!slots.length) return 'No slots available for that date. Reply WAITLIST to join the waitlist.';
  const lines = slots.slice(0, 8).map((s, i) => {
    const when = new Date(s.startAt).toLocaleString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
      timeZone: s.timezone || 'Asia/Kolkata',
    });
    return `${i + 1}. ${when} — ${s.staffName}`;
  });
  return `Available slots:\n\n${lines.join('\n')}\n\nReply with the slot number (e.g. 1).`;
}

async function clearBookingSession(customerId) {
  await prisma.aiBookingSession.deleteMany({ where: { customerId } });
  await prisma.customer.update({
    where: { id: customerId },
    data: { bookingSlotSelectionPending: false },
  });
}

async function getOrCreateSession(businessId, customerId) {
  const existing = await prisma.aiBookingSession.findUnique({ where: { customerId } });
  if (existing && existing.expiresAt > new Date()) return existing;
  if (existing) await prisma.aiBookingSession.delete({ where: { customerId } });
  return prisma.aiBookingSession.create({
    data: {
      businessId,
      customerId,
      intent: 'BOOK',
      state: {},
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

async function saveSession(customerId, patch) {
  return prisma.aiBookingSession.update({
    where: { customerId },
    data: {
      state: patch.state,
      intent: patch.intent || undefined,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

function matchServiceByText(text, services) {
  const t = String(text || '').toLowerCase();
  return (
    services.find((s) => t.includes(s.name.toLowerCase())) ||
    services.find((s) => s.code.toLowerCase() === 'general') ||
    services[0]
  );
}

function parseRelativeDate(text) {
  const t = String(text || '').toLowerCase();
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (/\btomorrow\b/.test(t)) return addDaysStr(d, 1);
  if (/\btoday\b/.test(t)) return d.toISOString().slice(0, 10);
  const m = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m) return m[1];
  const dm = t.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  if (dm) {
    const y = d.getUTCFullYear();
    return `${y}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`;
  }
  return addDaysStr(d, 1);
}

function addDaysStr(date, n) {
  const x = new Date(date);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

async function findUpcomingAppointment(businessId, customerId) {
  return prisma.appointment.findFirst({
    where: {
      businessId,
      customerId,
      status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: 'asc' },
    include: { service: true, staff: true, location: true },
  });
}

export async function handleAiBookingMessage({ business, customer, textBody, intent, conversationHistory = [] }) {
  await ensureSchedulingDefaults(business.id);

  const waitlistResult = await acceptWaitlistOffer({
    businessId: business.id,
    customerId: customer.id,
    textBody,
  });
  if (waitlistResult?.declined) {
    return { replyText: 'No problem — we offered the slot to the next person on the waitlist.' };
  }
  if (waitlistResult) {
    void sendAppointmentConfirmationWhatsApp(waitlistResult);
    return {
      replyText: `Waitlist booking confirmed! Ref ${waitlistResult.appointmentNumber}. See you soon.`,
      appointment: waitlistResult,
    };
  }

  if (/\bwaitlist\b/i.test(textBody)) {
    const defaults = await ensureSchedulingDefaults(business.id);
    await joinWaitlist({
      businessId: business.id,
      customerId: customer.id,
      serviceId: defaults.service.id,
      locationId: defaults.location.id,
    });
    return { replyText: 'You are on the waitlist. We will message you when a slot opens.' };
  }

  if (intent === 'PAYMENT' || intent === 'PAYMENT_STATUS') {
    const appt = await prisma.appointment.findFirst({
      where: {
        businessId: business.id,
        customerId: customer.id,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        startAt: { gte: new Date(Date.now() - 86400000) },
        amountDue: { gt: 0 },
      },
      orderBy: { startAt: 'asc' },
    });
    if (!appt) {
      return { replyText: 'No pending payment found for your upcoming appointments.' };
    }
    try {
      const paymentIntent = await createAppointmentPaymentIntent({
        businessId: business.id,
        appointmentId: appt.id,
        mode: 'advance',
      });
      return {
        replyText:
          `Payment link for ${appt.appointmentNumber} (₹${paymentIntent.amount}):\n${paymentIntent.paymentLinkUrl}`,
      };
    } catch (e) {
      return { replyText: `Could not create payment link: ${e.message}` };
    }
  }

  if (intent === 'CHECK_AVAILABILITY' || /\bavailable|free slot|open slot\b/i.test(textBody)) {
    const svcList = await prisma.scheduledService.findMany({
      where: { businessId: business.id, isActive: true, deletedAt: null },
    });
    const defaults = await ensureSchedulingDefaults(business.id);
    const service = matchServiceByText(textBody, svcList);
    const date = parseRelativeDate(textBody);
    const slots = await findAvailableSlots({
      businessId: business.id,
      serviceId: service.id,
      locationId: defaults.location.id,
      date,
    });
    if (!slots.length) {
      return { replyText: `No slots available for ${service.name} on ${date}. Reply WAITLIST to join the waitlist.` };
    }
    return { replyText: `Availability for ${service.name} on ${date}:\n${formatSlotsMessage(slots)}` };
  }

  const services = await prisma.scheduledService.findMany({
    where: { businessId: business.id, isActive: true, deletedAt: null },
  });

  const session = await getOrCreateSession(business.id, customer.id);
  const state = session.state && typeof session.state === 'object' ? session.state : {};

  if (state.step === 'AWAITING_SLOT' && state.offeredSlots?.length) {
    const n = parseInt(String(textBody).trim(), 10);
    const pick = !Number.isNaN(n) ? state.offeredSlots[n - 1] : null;
    if (pick) {
      const { appointment } = await createAppointment({
        businessId: business.id,
        customerId: customer.id,
        staffId: pick.staffId,
        serviceId: state.serviceId,
        locationId: pick.locationId,
        startAt: pick.startAt,
        source: 'WHATSAPP',
        status: 'CONFIRMED',
      });
      await clearBookingSession(customer.id);
      void sendAppointmentConfirmationWhatsApp(appointment);
      return {
        replyText: `Booking confirmed! ${appointment.service?.name || 'Appointment'} on ${formatAppointmentWhen(appointment.startAt, appointment.location?.timezone)}. Ref ${appointment.appointmentNumber}`,
        appointment,
      };
    }
  }

  if (intent === 'RESCHEDULE' || state.step === 'RESCHEDULE_AWAITING_SLOT' || session.intent === 'RESCHEDULE') {
    if (state.step === 'RESCHEDULE_AWAITING_SLOT' && state.offeredSlots?.length) {
      const n = parseInt(String(textBody).trim(), 10);
      const pick = !Number.isNaN(n) ? state.offeredSlots[n - 1] : null;
      if (pick && state.appointmentId) {
        const result = await rescheduleAppointment({
          businessId: business.id,
          appointmentId: state.appointmentId,
          newStartAt: pick.startAt,
          reason: 'Customer rescheduled via WhatsApp',
        });
        await clearBookingSession(customer.id);
        const appt = result.appointment;
        void sendAppointmentConfirmationWhatsApp(appt);
        return {
          replyText: `Rescheduled to ${formatAppointmentWhen(appt.startAt, appt.location?.timezone)}. Ref ${appt.appointmentNumber}`,
          appointment: appt,
        };
      }
    }

    const appt =
      state.appointmentId
        ? await prisma.appointment.findFirst({
            where: { id: state.appointmentId, businessId: business.id, customerId: customer.id },
            include: { service: true, staff: true, location: true },
          })
        : await findUpcomingAppointment(business.id, customer.id);

    if (!appt) {
      await clearBookingSession(customer.id);
      return { replyText: 'No upcoming appointment found to reschedule.' };
    }

    const date = state.rescheduleDate || parseRelativeDate(textBody);
    const slots = await findAvailableSlots({
      businessId: business.id,
      serviceId: appt.serviceId,
      locationId: appt.locationId,
      staffId: appt.staffId,
      date,
    });

    const offeredSlots = slots.slice(0, 8).map((s, i) => ({
      index: i + 1,
      staffId: s.staffId,
      locationId: s.locationId,
      startAt: s.startAt.toISOString(),
      label: s.label,
    }));

    await saveSession(customer.id, {
      intent: 'RESCHEDULE',
      state: {
        step: 'RESCHEDULE_AWAITING_SLOT',
        appointmentId: appt.id,
        rescheduleDate: date,
        offeredSlots,
      },
    });

    if (!offeredSlots.length) {
      return {
        replyText: `No slots on ${date} for ${appt.service.name}. Try another date (e.g. tomorrow or YYYY-MM-DD).`,
      };
    }

    return {
      replyText: `Reschedule ${appt.appointmentNumber} — pick a new slot for ${date}:\n${formatSlotsMessage(slots)}`,
    };
  }

  if (intent === 'CANCEL_BOOKING') {
    const next = await findUpcomingAppointment(business.id, customer.id);
    if (!next) return { replyText: 'No upcoming appointment found to cancel.' };
    await updateAppointmentStatus({
      businessId: business.id,
      appointmentId: next.id,
      toStatus: 'CANCELLED',
      reason: 'Customer cancelled via WhatsApp',
    });
    await clearBookingSession(customer.id);
    return { replyText: `Appointment ${next.appointmentNumber} cancelled.` };
  }

  if (intent === 'NEXT_APPOINTMENT' || /\bnext appointment\b/i.test(textBody)) {
    const next = await findUpcomingAppointment(business.id, customer.id);
    if (!next) return { replyText: 'You have no upcoming appointments.' };
    const when = formatAppointmentWhen(next.startAt, next.location?.timezone);
    return {
      replyText: `Next: ${next.service.name} with ${next.staff.name} on ${when} at ${next.location.name}. Ref ${next.appointmentNumber}`,
    };
  }

  const ratingMatch = String(textBody || '').trim().match(/^([1-5])$/);
  if (ratingMatch) {
    const completed = await prisma.appointment.findFirst({
      where: {
        businessId: business.id,
        customerId: customer.id,
        status: 'COMPLETED',
        completedAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      orderBy: { completedAt: 'desc' },
    });
    if (completed) {
      const existing = await prisma.appointmentRating.findUnique({
        where: { appointmentId: completed.id },
      });
      if (!existing) {
        await prisma.appointmentRating.create({
          data: {
            businessId: business.id,
            appointmentId: completed.id,
            customerId: customer.id,
            staffId: completed.staffId,
            serviceId: completed.serviceId,
            rating: Number(ratingMatch[1]),
          },
        });
        void refreshCustomerAppointmentStats(business.id, customer.id).catch(() => {});
        return { replyText: `Thank you for your ${ratingMatch[1]}-star rating!` };
      }
    }
  }

  if (intent === 'LAST_APPOINTMENT' || /\blast appointment\b/i.test(textBody)) {
    const last = await prisma.appointment.findFirst({
      where: { businessId: business.id, customerId: customer.id, status: 'COMPLETED' },
      orderBy: { startAt: 'desc' },
      include: { service: true, staff: true },
    });
    if (!last) return { replyText: 'No past appointments found.' };
    return {
      replyText: `Last visit: ${last.service.name} with ${last.staff.name} on ${new Date(last.startAt).toLocaleDateString('en-IN')}.`,
    };
  }

  const llmResult = await runSchedulingLlmTurn({
    business,
    customer,
    textBody,
    conversationHistory,
    sessionState: state,
  });
  if (llmResult?.replyText) {
    return {
      replyText: llmResult.replyText,
      appointment: llmResult.appointment,
      usedLlm: llmResult.usedLlm,
    };
  }

  const service = state.serviceId
    ? services.find((s) => s.id === state.serviceId) || matchServiceByText(textBody, services)
    : matchServiceByText(textBody, services);

  const date = state.date || parseRelativeDate(textBody);
  const defaults = await ensureSchedulingDefaults(business.id);

  const slots = await findAvailableSlots({
    businessId: business.id,
    serviceId: service.id,
    locationId: defaults.location.id,
    date,
  });

  const offeredSlots = slots.slice(0, 8).map((s, i) => ({
    index: i + 1,
    staffId: s.staffId,
    locationId: s.locationId,
    startAt: s.startAt.toISOString(),
    label: s.label,
  }));

  await saveSession(customer.id, {
    intent: 'BOOK',
    state: {
      step: 'AWAITING_SLOT',
      serviceId: service.id,
      date,
      offeredSlots,
    },
  });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { bookingSlotSelectionPending: true },
  });

  return {
    replyText: `Great! ${service.name} on ${date}:\n${formatSlotsMessage(slots)}`,
    offeredSlots,
  };
}

export { formatSlotsMessage };
