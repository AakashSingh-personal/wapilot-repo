import { prisma } from '../lib/prisma.js';
import {
  fetchRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  fetchRazorpayPaymentLink,
} from './razorpay.service.js';

export async function activateProSubscription(
  businessId,
  paymentId,
  { providerPaymentId = null, providerLinkId = null, providerOrderId = null, providerSignature = null } = {},
) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, businessId, type: 'SUBSCRIPTION' },
  });
  if (!payment) return { ok: false, reason: 'payment_not_found' };
  if (payment.status === 'SUCCESS') return { ok: true, alreadyActive: true };

  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!fresh || fresh.status === 'SUCCESS') return;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        provider: 'RAZORPAY',
        ...(providerPaymentId ? { providerPaymentId } : {}),
        ...(providerLinkId ? { providerOrderId: providerLinkId } : {}),
        ...(providerOrderId ? { providerOrderId } : {}),
        ...(providerSignature ? { providerSignature } : {}),
      },
    });
    await tx.subscription.updateMany({
      where: { businessId },
      data: { status: 'EXPIRED' },
    });
    await tx.subscription.create({
      data: {
        businessId,
        plan: 'PRO',
        status: 'ACTIVE',
        amount: payment.amount,
        expiresAt: expires,
      },
    });
  });

  return { ok: true };
}

function paymentAmountPaise(payment) {
  return Math.round(Number(payment.amount) * 100);
}

async function activateFromRazorpayPaymentRecord(businessId, payment, rpPayment) {
  if (!['captured', 'authorized'].includes(rpPayment.status)) {
    const err = new Error(`Razorpay payment status is ${rpPayment.status}, not captured`);
    err.statusCode = 400;
    throw err;
  }
  if (Number(rpPayment.amount) !== paymentAmountPaise(payment)) {
    const err = new Error('Payment amount does not match subscription amount');
    err.statusCode = 400;
    throw err;
  }

  const notes = rpPayment.notes || {};
  if (notes.paymentId && notes.paymentId !== payment.id) {
    const err = new Error('Payment belongs to a different checkout session');
    err.statusCode = 400;
    throw err;
  }

  if (payment.providerOrderId?.startsWith('order_') && rpPayment.order_id !== payment.providerOrderId) {
    const err = new Error('Razorpay order does not match pending subscription payment');
    err.statusCode = 400;
    throw err;
  }

  return activateProSubscription(businessId, payment.id, {
    providerPaymentId: rpPayment.id,
    providerOrderId: rpPayment.order_id || payment.providerOrderId || undefined,
  });
}

/** Poll Razorpay for paid payment link / order and activate PRO if captured. */
export async function trySyncPendingSubscriptionPayment(businessId) {
  const pending = await prisma.payment.findFirst({
    where: {
      businessId,
      type: 'SUBSCRIPTION',
      status: 'PENDING',
      providerOrderId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending?.providerOrderId) return { synced: false };

  const ref = pending.providerOrderId;
  try {
    if (ref.startsWith('plink_')) {
      const link = await fetchRazorpayPaymentLink(ref);
      if (link.status === 'paid') {
        await activateProSubscription(businessId, pending.id, { providerLinkId: ref });
        return { synced: true };
      }
      return { synced: false, providerStatus: link.status };
    }

    if (ref.startsWith('order_')) {
      const order = await fetchRazorpayOrder(ref);
      if (order.status === 'paid') {
        const payments = await fetchRazorpayOrderPayments(ref);
        const captured = (payments.items || []).find((p) => p.status === 'captured');
        await activateProSubscription(businessId, pending.id, {
          providerOrderId: ref,
          providerPaymentId: captured?.id || null,
        });
        return { synced: true };
      }
      return { synced: false, providerStatus: order.status };
    }
  } catch {
    return { synced: false };
  }

  return { synced: false };
}

export async function syncSubscriptionByRazorpayPaymentId(businessId, razorpayPaymentId) {
  const pending = await prisma.payment.findFirst({
    where: { businessId, type: 'SUBSCRIPTION', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) {
    const err = new Error('No pending subscription payment found');
    err.statusCode = 404;
    throw err;
  }

  const rpPayment = await fetchRazorpayPayment(razorpayPaymentId);
  const result = await activateFromRazorpayPaymentRecord(businessId, pending, rpPayment);
  if (!result.ok) {
    const err = new Error(result.reason || 'Could not activate subscription');
    err.statusCode = 400;
    throw err;
  }
  return result;
}
