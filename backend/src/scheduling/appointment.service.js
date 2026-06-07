import { prisma } from '../lib/prisma.js';
import { publish } from '../realtime/publisher.js';
import { EventType } from '../realtime/events.js';
import { isStaffAvailable } from './availabilityEngine.service.js';
import { scheduleRemindersForAppointment, cancelRemindersForAppointment, sendRatingRequestWhatsApp, sendAppointmentConfirmationWhatsApp, sendAppointmentConfirmationEmail } from './reminder.service.js';
import { processWaitlistForSlot } from './waitlist.service.js';
import {
  pushAppointmentToAllCalendars,
  deleteAppointmentFromAllCalendars,
} from './calendarEvents.service.js';
import { createAppointmentPaymentIntent } from './appointmentPayment.service.js';
import { acquireSlotLock, releaseSlotLock } from './slotLock.service.js';
import { refreshCustomerAppointmentStats } from './customerStats.service.js';

const ACTIVE_APPT = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'];

function nextAppointmentNumber(businessId) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `APT-${day}-${suffix}`;
}

function computeAmounts(service) {
  const price = Number(service.price || 0);
  const tax = price * (Number(service.taxPercent || 0) / 100);
  const amount = price + tax;
  return { amount, amountDue: amount, amountPaid: 0 };
}

async function recordStatus(appointmentId, fromStatus, toStatus, changedById, reason) {
  await prisma.appointmentStatusHistory.create({
    data: { appointmentId, fromStatus, toStatus, changedById, reason },
  });
}

async function publishAppointmentEvent(businessId, type, appointment) {
  await publish({
    businessId,
    type,
    appointment,
    customerId: appointment.customerId,
  });
}

async function syncLegacyBooking({ businessId, customerId, serviceName, slotLabel, appointmentId }) {
  try {
    const booking = await prisma.booking.create({
      data: {
        businessId,
        customerId,
        service: serviceName,
        slot: slotLabel,
        status: 'CONFIRMED',
      },
    });
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { legacyBookingId: booking.id },
    });
    return booking;
  } catch {
    return null;
  }
}

export async function createAppointment({
  businessId,
  customerId,
  staffId,
  serviceId,
  locationId,
  startAt,
  appointmentType = 'IN_PERSON',
  notes = null,
  source = 'DASHBOARD',
  createdById = null,
  meetingLink = null,
  address = null,
  status = 'CONFIRMED',
  collectAdvance = false,
  advancePercent,
}) {
  const [service, staff, location, customer] = await Promise.all([
    prisma.scheduledService.findFirst({
      where: { id: serviceId, businessId, isActive: true, deletedAt: null },
    }),
    prisma.staffMember.findFirst({
      where: { id: staffId, businessId, activeStatus: 'ACTIVE', deletedAt: null },
    }),
    prisma.location.findFirst({
      where: { id: locationId, businessId, isActive: true, deletedAt: null },
    }),
    prisma.customer.findFirst({ where: { id: customerId, businessId } }),
  ]);

  if (!service || !staff || !location || !customer) {
    const err = new Error('Invalid customer, staff, service, or location');
    err.statusCode = 400;
    throw err;
  }

  const start = new Date(startAt);
  const end = new Date(start.getTime() + service.durationMin * 60000);
  const { amount, amountDue, amountPaid } = computeAmounts(service);

  const lockToken = await acquireSlotLock({ businessId, staffId, startAt: start });
  if (!lockToken) {
    const err = new Error('Slot is being booked by another customer. Please try again.');
    err.statusCode = 409;
    err.code = 'SLOT_LOCKED';
    throw err;
  }

  try {
  const available = await isStaffAvailable({
    businessId,
    staffId,
    locationId,
    startAt: start,
    endAt: end,
    timezone: location.timezone || 'Asia/Kolkata',
  });
  if (!available) {
    const err = new Error('Selected slot is not available');
    err.statusCode = 409;
    err.code = 'SLOT_UNAVAILABLE';
    throw err;
  }

  const overlap = await prisma.appointment.count({
    where: {
      businessId,
      staffId,
      status: { in: ACTIVE_APPT },
      startAt: { lt: end },
      endAt: { gt: start },
    },
  });
  if (overlap >= (service.maxCapacity || 1)) {
    const err = new Error('Slot is fully booked');
    err.statusCode = 409;
    err.code = 'SLOT_UNAVAILABLE';
    throw err;
  }

  const appointment = await prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.create({
      data: {
        businessId,
        appointmentNumber: nextAppointmentNumber(businessId),
        customerId,
        staffId,
        serviceId,
        locationId,
        appointmentType,
        startAt: start,
        endAt: end,
        bufferBeforeMin: service.bufferBefore,
        bufferAfterMin: service.bufferAfter,
        status,
        notes,
        meetingLink,
        address,
        amount,
        amountDue,
        amountPaid,
        paymentStatus: 'UNPAID',
        source,
        createdById,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        staff: { select: { id: true, name: true, designation: true, mobile: true, email: true } },
        service: true,
        location: true,
      },
    });
    await tx.appointmentStatusHistory.create({
      data: { appointmentId: appt.id, toStatus: status, changedById: createdById },
    });
    await tx.lead.updateMany({
      where: { customerId, businessId },
      data: { status: 'BOOKED' },
    });
    await tx.customer.update({
      where: { id: customerId },
      data: { bookingSlotSelectionPending: false },
    });
    return appt;
  });

  const slotLabel = start.toLocaleString('en-IN', { timeZone: location.timezone || 'Asia/Kolkata' });
  await syncLegacyBooking({
    businessId,
    customerId,
    serviceName: service.name,
    slotLabel,
    appointmentId: appointment.id,
  });

  await scheduleRemindersForAppointment(appointment);
  if (status === 'CONFIRMED') {
    void sendAppointmentConfirmationWhatsApp(appointment).catch(() => {});
    void sendAppointmentConfirmationEmail(appointment).catch(() => {});
  }
  await publishAppointmentEvent(businessId, EventType.APPOINTMENT_CREATED, appointment);

  void pushAppointmentToAllCalendars(appointment).catch(() => {});

  let paymentIntent = null;
  if (collectAdvance && Number(appointment.amountDue) > 0) {
    try {
      paymentIntent = await createAppointmentPaymentIntent({
        businessId,
        appointmentId: appointment.id,
        advancePercent,
        mode: 'advance',
      });
    } catch {
      // Booking succeeds even if payment link fails
    }
  }

  void refreshCustomerAppointmentStats(businessId, customerId).catch(() => {});
  return { appointment, paymentIntent };
  } finally {
    await releaseSlotLock({ businessId, staffId, startAt: start, token: lockToken });
  }
}

export async function updateAppointmentStatus({
  businessId,
  appointmentId,
  toStatus,
  changedById = null,
  reason = null,
}) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include: { service: true, location: true, customer: true, staff: true },
  });
  if (!appt) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }

  const data = { status: toStatus, version: { increment: 1 } };
  if (toStatus === 'CANCELLED') {
    data.cancelledAt = new Date();
    data.cancellationReason = reason;
  }
  if (toStatus === 'CHECKED_IN') data.checkedInAt = new Date();
  if (toStatus === 'COMPLETED') data.completedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.appointment.update({
      where: { id: appointmentId },
      data,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        staff: { select: { id: true, name: true } },
        service: true,
        location: true,
      },
    });
    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId,
        fromStatus: appt.status,
        toStatus,
        changedById,
        reason,
      },
    });
    return row;
  });

  if (toStatus === 'CANCELLED') {
    await cancelRemindersForAppointment(appointmentId);
    void deleteAppointmentFromAllCalendars(appt).catch(() => {});
    await processWaitlistForSlot({
      businessId,
      serviceId: appt.serviceId,
      locationId: appt.locationId,
      staffId: appt.staffId,
      freedStartAt: appt.startAt,
    });
  } else if (toStatus === 'RESCHEDULED') {
    await cancelRemindersForAppointment(appointmentId);
    void deleteAppointmentFromAllCalendars(appt).catch(() => {});
  } else {
    await scheduleRemindersForAppointment(updated);
    void pushAppointmentToAllCalendars(updated).catch(() => {});
  }

  if (toStatus === 'COMPLETED') {
    void sendRatingRequestWhatsApp(updated).catch(() => {});
  }

  if (toStatus === 'CONFIRMED' && appt.status === 'PENDING') {
    void sendAppointmentConfirmationWhatsApp(updated).catch(() => {});
    void sendAppointmentConfirmationEmail(updated).catch(() => {});
  }

  await publishAppointmentEvent(businessId, EventType.APPOINTMENT_STATUS_CHANGED, updated);
  void refreshCustomerAppointmentStats(businessId, updated.customerId).catch(() => {});
  return updated;
}

export async function confirmPendingAppointments({ businessId, changedById = null, limit = 100 }) {
  const pending = await prisma.appointment.findMany({
    where: { businessId, status: 'PENDING' },
    orderBy: { startAt: 'asc' },
    take: Math.min(Math.max(Number(limit) || 100, 1), 200),
    select: { id: true },
  });

  const results = [];
  for (const row of pending) {
    try {
      await updateAppointmentStatus({
        businessId,
        appointmentId: row.id,
        toStatus: 'CONFIRMED',
        changedById,
        reason: 'Bulk confirmed from dashboard',
      });
      results.push({ id: row.id, ok: true });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: e.message });
    }
  }

  return {
    confirmed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function checkInTodayAppointments({ businessId, changedById = null, staffId = null }) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);

  const where = {
    businessId,
    status: 'CONFIRMED',
    startAt: { gte: dayStart, lte: dayEnd },
  };
  if (staffId) where.staffId = staffId;

  const rows = await prisma.appointment.findMany({
    where,
    orderBy: { startAt: 'asc' },
    select: { id: true },
    take: 200,
  });

  const results = [];
  for (const row of rows) {
    try {
      await updateAppointmentStatus({
        businessId,
        appointmentId: row.id,
        toStatus: 'CHECKED_IN',
        changedById,
        reason: 'Bulk check-in from schedule',
      });
      results.push({ id: row.id, ok: true });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: e.message });
    }
  }

  return {
    checkedIn: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function getSameDayCustomerWarnings(businessId, customerId, startAt, excludeAppointmentId = null) {
  if (!customerId || !startAt) return [];

  const d = new Date(startAt);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(d);
  dayEnd.setHours(23, 59, 59, 999);

  const others = await prisma.appointment.findMany({
    where: {
      businessId,
      customerId,
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      status: { in: ACTIVE_APPT },
      startAt: { gte: dayStart, lte: dayEnd },
    },
    select: { appointmentNumber: true, startAt: true },
    orderBy: { startAt: 'asc' },
    take: 3,
  });

  if (!others.length) return [];
  return others.map(
    (o) =>
      `Customer already has ${o.appointmentNumber} at ${new Date(o.startAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} on this day`,
  );
}

export async function rescheduleAppointment({
  businessId,
  appointmentId,
  newStartAt,
  changedById = null,
  reason = null,
}) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include: { service: true },
  });
  if (!appt) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }

  await updateAppointmentStatus({
    businessId,
    appointmentId,
    toStatus: 'RESCHEDULED',
    changedById,
    reason: reason || 'Rescheduled',
  });

  return createAppointment({
    businessId,
    customerId: appt.customerId,
    staffId: appt.staffId,
    serviceId: appt.serviceId,
    locationId: appt.locationId,
    startAt: newStartAt,
    appointmentType: appt.appointmentType,
    notes: appt.notes,
    source: appt.source,
    createdById: changedById,
    meetingLink: appt.meetingLink,
    address: appt.address,
    status: 'CONFIRMED',
  });
}

export async function recordAppointmentPayment({
  businessId,
  appointmentId,
  amount,
  paymentMethod,
  transactionId = null,
  provider = null,
  status = 'PAID',
}) {
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, businessId } });
  if (!appt) throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });

  const paid = Number(amount);
  const newPaid = Number(appt.amountPaid) + paid;
  const newDue = Math.max(0, Number(appt.amount) - newPaid);
  let paymentStatus = 'PARTIAL';
  if (newDue <= 0) paymentStatus = 'PAID';
  else if (newPaid <= 0) paymentStatus = 'UNPAID';

  const [payment, updated] = await prisma.$transaction([
    prisma.appointmentPayment.create({
      data: {
        businessId,
        appointmentId,
        amount: paid,
        paymentMethod,
        transactionId,
        provider,
        status,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    }),
    prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        amountPaid: newPaid,
        amountDue: newDue,
        paymentStatus,
      },
      include: { customer: true, staff: true, service: true, location: true },
    }),
  ]);

  await publishAppointmentEvent(businessId, EventType.APPOINTMENT_PAYMENT_RECEIVED, updated);
  void refreshCustomerAppointmentStats(businessId, updated.customerId).catch(() => {});
  return { payment, appointment: updated };
}

export async function ensureSchedulingDefaults(businessId) {
  const [locCount, staffCount, svcCount] = await Promise.all([
    prisma.location.count({ where: { businessId, deletedAt: null } }),
    prisma.staffMember.count({ where: { businessId, deletedAt: null } }),
    prisma.scheduledService.count({ where: { businessId, deletedAt: null } }),
  ]);

  let location;
  if (!locCount) {
    location = await prisma.location.create({
      data: {
        businessId,
        code: 'MAIN',
        name: 'Main Branch',
        timezone: 'Asia/Kolkata',
      },
    });
  } else {
    location = await prisma.location.findFirst({ where: { businessId, deletedAt: null } });
  }

  let staff;
  if (!staffCount) {
    staff = await prisma.staffMember.create({
      data: {
        businessId,
        staffCode: 'STF-001',
        name: 'Default Staff',
        designation: 'Service Provider',
        locations: { create: [{ locationId: location.id, isPrimary: true }] },
      },
    });
  } else {
    staff = await prisma.staffMember.findFirst({
      where: { businessId, activeStatus: 'ACTIVE', deletedAt: null },
    });
  }

  let service;
  if (!svcCount) {
    service = await prisma.scheduledService.create({
      data: {
        businessId,
        code: 'GENERAL',
        name: 'General Appointment',
        durationMin: 30,
        price: 0,
        staffLinks: staff ? { create: [{ staffId: staff.id }] } : undefined,
      },
    });
  } else {
    service = await prisma.scheduledService.findFirst({
      where: { businessId, isActive: true, deletedAt: null },
    });
  }

  if (staff && service) {
    await prisma.staffService.upsert({
      where: { staffId_serviceId: { staffId: staff.id, serviceId: service.id } },
      create: { staffId: staff.id, serviceId: service.id },
      update: {},
    });
  }

  const hours = await prisma.staffWorkingHours.count({ where: { staffId: staff?.id } });
  if (staff && !hours) {
    const defaults = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '18:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '09:00', endTime: '18:00' },
      { dayOfWeek: 5, startTime: '09:00', endTime: '18:00' },
      { dayOfWeek: 6, startTime: '10:00', endTime: '16:00' },
    ];
    await prisma.staffWorkingHours.createMany({
      data: defaults.map((d) => ({
        businessId,
        staffId: staff.id,
        locationId: location.id,
        ...d,
      })),
    });
  }

  return { location, staff, service };
}
