import { prisma } from '../lib/prisma.js';
import { createRazorpayPaymentLink } from '../services/razorpay.service.js';
import { buildUpiLink } from '../utils/upi.js';
import { sendAndRecordWhatsAppText } from '../services/outboundMessage.service.js';
import { publish } from '../realtime/publisher.js';
import { EventType } from '../realtime/events.js';
import { log } from '../utils/logger.js';

const DEFAULT_ADVANCE_PERCENT = Number(process.env.APPOINTMENT_ADVANCE_PERCENT || 30);

/**
 * Create Razorpay payment link for appointment advance or full balance.
 */
export async function createAppointmentPaymentIntent({
  businessId,
  appointmentId,
  advancePercent = DEFAULT_ADVANCE_PERCENT,
  mode = 'advance',
}) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include: {
      customer: true,
      service: true,
      staff: true,
      location: true,
    },
  });
  if (!appt) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }

  const amountDue = Number(appt.amountDue);
  if (amountDue <= 0) {
    const err = new Error('Nothing due on this appointment');
    err.statusCode = 400;
    throw err;
  }

  let chargeAmount = amountDue;
  if (mode === 'advance') {
    const pct = Number(advancePercent);
    if (!Number.isFinite(pct) || pct <= 0) {
      const err = new Error('advancePercent must be a positive number between 1 and 100');
      err.statusCode = 400;
      throw err;
    }
    chargeAmount = Math.max(1, Math.round((Number(appt.amount) * Math.min(100, Math.max(1, pct))) / 100));
    chargeAmount = Math.min(chargeAmount, amountDue);
  }

  const razorpayAvailable =
    Boolean(process.env.RAZORPAY_KEY_ID) && Boolean(process.env.RAZORPAY_KEY_SECRET);

  if (razorpayAvailable) {
    try {
      return await createRazorpayAppointmentPayment({
        businessId,
        appt,
        chargeAmount,
        mode,
        advancePercent,
      });
    } catch (e) {
      // Bad credentials or payment-links disabled — fall back to UPI when configured.
      if (e.statusCode === 401 || e.statusCode === 403) {
        log('warn', 'razorpay_payment_link_auth_failed', { message: e.message });
        const upiResult = await tryUpiAppointmentPayment({ businessId, appt, chargeAmount, mode });
        if (upiResult) return upiResult;
        const err = new Error('Payment gateway unavailable — please contact support');
        err.statusCode = 503;
        throw err;
      }
      throw e;
    }
  }

  const upiResult = await tryUpiAppointmentPayment({ businessId, appt, chargeAmount, mode });
  if (upiResult) return upiResult;

  const err = new Error(
    'Payment gateway is not configured. Please contact the business to arrange payment.',
  );
  err.statusCode = 503;
  throw err;
}

async function createRazorpayAppointmentPayment({
  businessId,
  appt,
  chargeAmount,
  mode,
  advancePercent,
}) {
  const pending = await prisma.appointmentPayment.create({
    data: {
      businessId,
      appointmentId: appt.id,
      amount: chargeAmount,
      paymentMethod: 'RAZORPAY_LINK',
      status: 'UNPAID',
      metadata: { mode, advancePercent },
    },
  });

  let paymentLink;
  try {
    paymentLink = await createRazorpayPaymentLink({
      amountInInr: chargeAmount,
      description: `${appt.service?.name || 'Appointment'} — ${appt.appointmentNumber}`,
      customer: {
        name: appt.customer?.name || undefined,
        contact: appt.customer?.phone?.replace(/^\+/, '') || undefined,
      },
      notes: {
        kind: 'appointment_payment',
        appointmentPaymentId: pending.id,
        appointmentId: appt.id,
        businessId,
      },
    });
  } catch (e) {
    await prisma.appointmentPayment.delete({ where: { id: pending.id } });
    if (e.statusCode === 401 || e.statusCode === 403) {
      const err = new Error(e.error?.description || e.message || 'Razorpay authentication failed');
      err.statusCode = e.statusCode;
      throw err;
    }
    throw e;
  }

  await prisma.appointmentPayment.update({
    where: { id: pending.id },
    data: {
      provider: 'RAZORPAY',
      providerRef: paymentLink.id,
      transactionId: paymentLink.id,
    },
  });

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { phoneNumberId: true },
  });

  if (business?.phoneNumberId && appt.customer?.phone) {
    const when = new Date(appt.startAt).toLocaleString('en-IN');
    try {
      await sendAndRecordWhatsAppText({
        businessId,
        customerId: appt.customer.id,
        phoneNumberId: business.phoneNumberId,
        toPhoneE164: appt.customer.phone,
        body:
          `Payment link for your appointment (${appt.appointmentNumber}):\n` +
          `${appt.service?.name} on ${when}\n` +
          `Amount: ₹${chargeAmount.toLocaleString('en-IN')}\n` +
          `${paymentLink.short_url}`,
      });
    } catch (e) {
      log('warn', 'appointment_payment_whatsapp_failed', { message: e.message });
    }
  }

  return {
    appointmentPaymentId: pending.id,
    amount: chargeAmount,
    paymentLinkUrl: paymentLink.short_url,
    providerLinkId: paymentLink.id,
    mode,
    method: 'razorpay',
  };
}

async function tryUpiAppointmentPayment({ businessId, appt, chargeAmount, mode }) {
  const bizConfig = await prisma.businessConfig.findUnique({
    where: { businessId },
    select: { upiId: true },
  });
  const upiId = bizConfig?.upiId || null;
  if (!upiId) return null;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, phoneNumberId: true },
  });

  const upiLink = buildUpiLink({
    pa: upiId,
    pn: business?.name || 'Business',
    am: String(chargeAmount),
  });

  if (business?.phoneNumberId && appt.customer?.phone) {
    const when = new Date(appt.startAt).toLocaleString('en-IN');
    try {
      await sendAndRecordWhatsAppText({
        businessId,
        customerId: appt.customer.id,
        phoneNumberId: business.phoneNumberId,
        toPhoneE164: appt.customer.phone,
        body:
          `Payment for your appointment (${appt.appointmentNumber}):\n` +
          `${appt.service?.name} on ${when}\n` +
          `Amount: ₹${chargeAmount.toLocaleString('en-IN')}\n` +
          `UPI: ${upiId}\n` +
          `Pay via app: ${upiLink}`,
      });
    } catch (e) {
      log('warn', 'appointment_payment_whatsapp_failed', { message: e.message });
    }
  }

  return {
    appointmentPaymentId: null,
    amount: chargeAmount,
    paymentLinkUrl: upiLink,
    providerLinkId: null,
    mode,
    method: 'upi',
    upiId,
  };
}

export async function settleAppointmentPaymentFromWebhook({
  providerLinkId,
  providerPaymentId,
}) {
  const pending = await prisma.appointmentPayment.findFirst({
    where: { providerRef: providerLinkId, status: 'UNPAID' },
  });
  if (!pending) return null;

  const appt = await prisma.appointment.findFirst({
    where: { id: pending.appointmentId, businessId: pending.businessId },
  });
  if (!appt) return null;

  const paid = Number(pending.amount);
  const newPaid = Number(appt.amountPaid) + paid;
  const newDue = Math.max(0, Number(appt.amount) - newPaid);
  let paymentStatus = 'PARTIAL';
  if (newDue <= 0) paymentStatus = 'PAID';
  else if (newPaid <= 0) paymentStatus = 'UNPAID';

  const [updatedPayment, updatedAppt] = await prisma.$transaction([
    prisma.appointmentPayment.update({
      where: { id: pending.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        transactionId: providerPaymentId || providerLinkId,
      },
    }),
    prisma.appointment.update({
      where: { id: appt.id },
      data: {
        amountPaid: newPaid,
        amountDue: newDue,
        paymentStatus,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        staff: { select: { id: true, name: true } },
        service: true,
        location: true,
      },
    }),
  ]);

  await publish({
    businessId: pending.businessId,
    type: EventType.APPOINTMENT_PAYMENT_RECEIVED,
    appointment: updatedAppt,
    customerId: updatedAppt.customerId,
  });

  return { payment: updatedPayment, appointment: updatedAppt };
}
