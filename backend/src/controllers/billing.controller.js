import { prisma } from '../lib/prisma.js';
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  razorpayPublicConfig,
  verifyRazorpayPaymentSignature,
} from '../services/razorpay.service.js';

function proAmount() {
  const raw = process.env.SUBSCRIPTION_PRO_AMOUNT || '999';
  return Number(raw);
}

function proAmountPaise() {
  return Math.round(proAmount() * 100);
}

async function findReusableSubscriptionCheckout(businessId) {
  const amt = proAmount();
  const pending = await prisma.payment.findFirst({
    where: {
      businessId,
      type: 'SUBSCRIPTION',
      status: 'PENDING',
      providerOrderId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending?.providerOrderId) return null;

  try {
    const order = await fetchRazorpayOrder(pending.providerOrderId);
    if (order.status === 'created' && Number(order.amount) === proAmountPaise()) {
      return { payment: pending, order, amount: amt };
    }
  } catch {
    // Order missing or keys changed — create a fresh checkout below.
  }
  return null;
}

export async function subscriptionQr(req, res, next) {
  try {
    const businessId = req.user.businessId;
    const keyId = razorpayPublicConfig().keyId;
    if (!keyId) {
      return res.status(503).json({ error: 'Razorpay is not configured on the server' });
    }

    const reusable = await findReusableSubscriptionCheckout(businessId);
    if (reusable) {
      return res.json({
        paymentId: reusable.payment.id,
        orderId: reusable.order.id,
        amount: reusable.amount,
        currency: reusable.order.currency || 'INR',
        keyId,
        plan: 'PRO',
        reused: true,
      });
    }

    const amt = proAmount();

    await prisma.payment.updateMany({
      where: { businessId, type: 'SUBSCRIPTION', status: 'PENDING' },
      data: { status: 'FAILED' },
    });

    const payment = await prisma.payment.create({
      data: {
        businessId,
        amount: amt.toFixed(2),
        type: 'SUBSCRIPTION',
        status: 'PENDING',
        provider: 'RAZORPAY',
      },
    });
    const order = await createRazorpayOrder({
      amountInInr: amt,
      receipt: payment.id,
      notes: {
        paymentId: payment.id,
        businessId,
        plan: 'PRO',
      },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerOrderId: order.id },
    });
    res.json({
      paymentId: payment.id,
      orderId: order.id,
      amount: amt,
      currency: order.currency || 'INR',
      keyId,
      plan: 'PRO',
      reused: false,
    });
  } catch (e) {
    next(e);
  }
}

export async function markSubscriptionPaid(req, res, next) {
  try {
    const amt = proAmount();
    const payment = await prisma.payment.create({
      data: {
        businessId: req.user.businessId,
        amount: amt,
        type: 'SUBSCRIPTION',
        status: 'PENDING',
      },
    });
    res.status(201).json({ payment });
  } catch (e) {
    next(e);
  }
}

export async function verifySubscriptionPayment(req, res, next) {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const payment = await prisma.payment.findFirst({
      where: { id, businessId: req.user.businessId },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment verification fields' });
    }
    if (payment.providerOrderId && payment.providerOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order id does not match this payment record' });
    }
    const valid = verifyRazorpayPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) return res.status(400).json({ error: 'Invalid Razorpay signature' });

    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          providerOrderId: razorpay_order_id,
          providerPaymentId: razorpay_payment_id,
          providerSignature: razorpay_signature,
          provider: 'RAZORPAY',
        },
      });
      await tx.subscription.updateMany({
        where: { businessId: req.user.businessId },
        data: { status: 'EXPIRED' },
      });
      await tx.subscription.create({
        data: {
          businessId: req.user.businessId,
          plan: 'PRO',
          status: 'ACTIVE',
          amount: payment.amount,
          expiresAt: expires,
        },
      });
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function subscriptionStatus(req, res, next) {
  try {
    const businessId = req.user.businessId;
    const [sub, pending, latest] = await Promise.all([
      prisma.subscription.findFirst({
        where: { businessId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.findFirst({
        where: { businessId, type: 'SUBSCRIPTION', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.findFirst({
        where: { businessId, type: 'SUBSCRIPTION' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    res.json({
      subscription: sub,
      pendingPayment: pending,
      latestPayment: latest,
      razorpayKeyId: razorpayPublicConfig().keyId || null,
    });
  } catch (e) {
    next(e);
  }
}
