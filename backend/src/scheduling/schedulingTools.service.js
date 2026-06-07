import { prisma } from '../lib/prisma.js';
import { findAvailableSlots } from './slotEngine.service.js';
import {
  createAppointment,
  updateAppointmentStatus,
  rescheduleAppointment,
  ensureSchedulingDefaults,
} from './appointment.service.js';
import { joinWaitlist } from './waitlist.service.js';
import { createAppointmentPaymentIntent } from './appointmentPayment.service.js';
import { sendAppointmentConfirmationWhatsApp } from './reminder.service.js';
import { formatAppointmentWhen } from './appointmentLinks.service.js';

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

function parseToolDate(raw) {
  const t = String(raw || '').toLowerCase().trim();
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (!t || t === 'today') return d.toISOString().slice(0, 10);
  if (t === 'tomorrow') {
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const dm = t.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (dm) {
    const y = d.getUTCFullYear();
    return `${y}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`;
  }
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function resolveService(businessId, serviceName) {
  const services = await prisma.scheduledService.findMany({
    where: { businessId, isActive: true, deletedAt: null },
  });
  if (!services.length) return null;
  if (!serviceName) {
    return services.find((s) => s.code === 'GENERAL') || services[0];
  }
  const needle = String(serviceName).toLowerCase();
  return (
    services.find((s) => s.name.toLowerCase() === needle) ||
    services.find((s) => s.name.toLowerCase().includes(needle)) ||
    services.find((s) => s.code.toLowerCase() === needle) ||
    services[0]
  );
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

function mapOfferedSlots(slots) {
  return slots.slice(0, 8).map((s, i) => ({
    index: i + 1,
    staffId: s.staffId,
    locationId: s.locationId,
    startAt: s.startAt.toISOString(),
    label: s.label,
    staffName: s.staffName,
  }));
}

export const SCHEDULING_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'List bookable services with duration and price',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check available slots for a service on a date',
      parameters: {
        type: 'object',
        properties: {
          service_name: { type: 'string', description: 'Service name (optional)' },
          date: { type: 'string', description: 'YYYY-MM-DD, today, or tomorrow' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'offer_booking_slots',
      description: 'Show numbered slots and prepare booking session for the customer',
      parameters: {
        type: 'object',
        properties: {
          service_name: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_upcoming_appointment',
      description: 'Get the customer next upcoming appointment',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_last_appointment',
      description: 'Get the customer most recent completed appointment',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_upcoming_appointment',
      description: 'Cancel the customer next upcoming appointment',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_reschedule',
      description: 'Show available slots to reschedule the upcoming appointment',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'New date YYYY-MM-DD, today, or tomorrow' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'join_waitlist',
      description: 'Add customer to waitlist when no slots are available',
      parameters: {
        type: 'object',
        properties: {
          service_name: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payment_link',
      description: 'Create Razorpay payment link for upcoming appointment with balance due',
      parameters: { type: 'object', properties: {} },
    },
  },
];

export async function executeSchedulingTool(toolName, args, ctx) {
  const { business, customer } = ctx;
  const businessId = business.id;
  const customerId = customer.id;

  await ensureSchedulingDefaults(businessId);
  const defaults = await ensureSchedulingDefaults(businessId);

  switch (toolName) {
    case 'list_services': {
      const rows = await prisma.scheduledService.findMany({
        where: { businessId, isActive: true, deletedAt: null },
        select: { name: true, durationMin: true, price: true, code: true },
      });
      return {
        ok: true,
        services: rows.map((s) => ({
          name: s.name,
          durationMin: s.durationMin,
          price: Number(s.price),
          code: s.code,
        })),
      };
    }

    case 'check_availability': {
      const service = await resolveService(businessId, args.service_name);
      if (!service) return { ok: false, error: 'No services configured' };
      const date = parseToolDate(args.date);
      const slots = await findAvailableSlots({
        businessId,
        serviceId: service.id,
        locationId: defaults.location.id,
        date,
      });
      return {
        ok: true,
        service: service.name,
        date,
        slotCount: slots.length,
        slots: slots.slice(0, 8).map((s, i) => ({
          index: i + 1,
          startAt: s.startAt.toISOString(),
          staffName: s.staffName,
        })),
        message: slots.length
          ? formatSlotsMessage(slots)
          : `No slots for ${service.name} on ${date}.`,
      };
    }

    case 'offer_booking_slots': {
      const service = await resolveService(businessId, args.service_name);
      if (!service) return { ok: false, error: 'No services configured' };
      const date = parseToolDate(args.date);
      const slots = await findAvailableSlots({
        businessId,
        serviceId: service.id,
        locationId: defaults.location.id,
        date,
      });
      const offeredSlots = mapOfferedSlots(slots);
      const sessionUpdate = {
        intent: 'BOOK',
        state: {
          step: 'AWAITING_SLOT',
          serviceId: service.id,
          date,
          offeredSlots,
        },
      };
      return {
        ok: true,
        service: service.name,
        date,
        sessionUpdate,
        bookingSlotSelectionPending: true,
        message: offeredSlots.length
          ? `Slots for ${service.name} on ${date}:\n${formatSlotsMessage(slots)}\nAsk the customer to reply with a slot number.`
          : `No slots on ${date}. Suggest waitlist.`,
      };
    }

    case 'get_upcoming_appointment': {
      const appt = await findUpcomingAppointment(businessId, customerId);
      if (!appt) return { ok: true, found: false, message: 'No upcoming appointment.' };
      return {
        ok: true,
        found: true,
        appointmentNumber: appt.appointmentNumber,
        service: appt.service.name,
        staff: appt.staff.name,
        location: appt.location.name,
        when: formatAppointmentWhen(appt.startAt, appt.location?.timezone),
        status: appt.status,
      };
    }

    case 'get_last_appointment': {
      const last = await prisma.appointment.findFirst({
        where: { businessId, customerId, status: 'COMPLETED' },
        orderBy: { startAt: 'desc' },
        include: { service: true, staff: true },
      });
      if (!last) return { ok: true, found: false, message: 'No past appointments.' };
      return {
        ok: true,
        found: true,
        service: last.service.name,
        staff: last.staff.name,
        date: new Date(last.startAt).toLocaleDateString('en-IN'),
      };
    }

    case 'cancel_upcoming_appointment': {
      const appt = await findUpcomingAppointment(businessId, customerId);
      if (!appt) return { ok: false, error: 'No upcoming appointment to cancel' };
      await updateAppointmentStatus({
        businessId,
        appointmentId: appt.id,
        toStatus: 'CANCELLED',
        reason: 'Customer cancelled via WhatsApp AI',
      });
      return {
        ok: true,
        cancelled: appt.appointmentNumber,
        sessionClear: true,
        message: `Cancelled ${appt.appointmentNumber}.`,
      };
    }

    case 'start_reschedule': {
      const appt = await findUpcomingAppointment(businessId, customerId);
      if (!appt) return { ok: false, error: 'No upcoming appointment to reschedule' };
      const date = parseToolDate(args.date);
      const slots = await findAvailableSlots({
        businessId,
        serviceId: appt.serviceId,
        locationId: appt.locationId,
        staffId: appt.staffId,
        date,
      });
      const offeredSlots = mapOfferedSlots(slots);
      const sessionUpdate = {
        intent: 'RESCHEDULE',
        state: {
          step: 'RESCHEDULE_AWAITING_SLOT',
          appointmentId: appt.id,
          rescheduleDate: date,
          offeredSlots,
        },
      };
      return {
        ok: true,
        appointmentNumber: appt.appointmentNumber,
        date,
        sessionUpdate,
        message: offeredSlots.length
          ? `Reschedule ${appt.appointmentNumber} — pick a slot for ${date}:\n${formatSlotsMessage(slots)}`
          : `No slots on ${date} for reschedule.`,
      };
    }

    case 'join_waitlist': {
      const service = await resolveService(businessId, args.service_name);
      await joinWaitlist({
        businessId,
        customerId,
        serviceId: service?.id || defaults.service.id,
        locationId: defaults.location.id,
      });
      return { ok: true, message: 'Customer added to waitlist.' };
    }

    case 'create_payment_link': {
      const appt = await prisma.appointment.findFirst({
        where: {
          businessId,
          customerId,
          status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
          amountDue: { gt: 0 },
        },
        orderBy: { startAt: 'asc' },
      });
      if (!appt) return { ok: false, error: 'No appointment with balance due' };
      try {
        const paymentIntent = await createAppointmentPaymentIntent({
          businessId,
          appointmentId: appt.id,
          mode: 'advance',
        });
        return {
          ok: true,
          appointmentNumber: appt.appointmentNumber,
          amount: paymentIntent.amount,
          paymentLinkUrl: paymentIntent.paymentLinkUrl,
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    default:
      return { ok: false, error: `Unknown tool: ${toolName}` };
  }
}

export async function bookSlotFromSession({ businessId, customerId, sessionState }) {
  const offered = sessionState?.offeredSlots;
  const serviceId = sessionState?.serviceId;
  const slotNumber = sessionState?.slotNumber;
  if (!offered?.length || !serviceId || !slotNumber) {
    return { ok: false, error: 'Invalid slot selection state' };
  }
  const pick = offered[slotNumber - 1];
  if (!pick) return { ok: false, error: 'Slot number out of range' };

  const { appointment } = await createAppointment({
    businessId,
    customerId,
    staffId: pick.staffId,
    serviceId,
    locationId: pick.locationId,
    startAt: pick.startAt,
    source: 'WHATSAPP',
    status: 'CONFIRMED',
  });
  void sendAppointmentConfirmationWhatsApp(appointment);
  const full = await prisma.appointment.findUnique({
    where: { id: appointment.id },
    include: { service: true, location: true },
  });
  return {
    ok: true,
    appointment: full,
    message: `Booked ${full.service.name} — ${formatAppointmentWhen(full.startAt, full.location?.timezone)}. Ref ${full.appointmentNumber}`,
    sessionClear: true,
  };
}

export async function rescheduleSlotFromSession({ businessId, customerId, sessionState }) {
  const { appointmentId, offeredSlots, slotNumber } = sessionState || {};
  const pick = offeredSlots?.[slotNumber - 1];
  if (!appointmentId || !pick) return { ok: false, error: 'Invalid reschedule selection' };

  const result = await rescheduleAppointment({
    businessId,
    appointmentId,
    newStartAt: pick.startAt,
    reason: 'Customer rescheduled via WhatsApp AI',
  });
  void sendAppointmentConfirmationWhatsApp(result.appointment);
  return {
    ok: true,
    appointment: result.appointment,
    message: `Rescheduled to ${formatAppointmentWhen(result.appointment.startAt, result.appointment.location?.timezone)}. Ref ${result.appointment.appointmentNumber}`,
    sessionClear: true,
  };
}
