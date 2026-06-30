import { prisma } from '../lib/prisma.js';
import {
  createRazorpayOrder,
  createRazorpayPaymentLink,
  fetchRazorpayOrder,
  fetchRazorpayPaymentLink,
  razorpayPublicConfig,
  verifyRazorpayCredentials,
  verifyRazorpayPaymentSignature,
} from '../services/razorpay.service.js';
import { activateProSubscription, syncSubscriptionByRazorpayPaymentId, trySyncPendingSubscriptionPayment } from '../services/subscriptionBilling.service.js';

function proAmount() {
  const raw = process.env.SUBSCRIPTION_PRO_AMOUNT || '999';
  return Number(raw);
}

function proAmountPaise() {
  return Math.round(proAmount() * 100);
}

function useCheckoutFallback() {
  return process.env.SUBSCRIPTION_USE_CHECKOUT === '1';
}

async function findReusableSubscriptionPayment(businessId) {
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

  const ref = pending.providerOrderId;
  try {
    if (ref.startsWith('plink_')) {
      const link = await fetchRazorpayPaymentLink(ref);
      if (link.status === 'created' && Number(link.amount) === proAmountPaise()) {
        return {
          paymentId: pending.id,
          paymentLinkUrl: link.short_url,
          amount: amt,
          currency: link.currency || 'INR',
          plan: 'PRO',
          mode: 'payment_link',
        };
      }
    } else if (ref.startsWith('order_')) {
      const order = await fetchRazorpayOrder(ref);
      if (order.status === 'created' && Number(order.amount) === proAmountPaise()) {
        return {
          paymentId: pending.id,
          orderId: order.id,
          amount: amt,
          currency: order.currency || 'INR',
          plan: 'PRO',
          mode: 'checkout',
        };
      }
    }
  } catch {
    // Stale reference or API keys changed.
  }
  return null;
}

async function createSubscriptionPaymentLink(businessId, userEmail) {
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

  const paymentLink = await createRazorpayPaymentLink({
    amountInInr: amt,
    description: 'Vartalap PRO subscription',
    customer: userEmail ? { email: userEmail } : {},
    notes: {
      kind: 'subscription',
      paymentId: payment.id,
      businessId,
      plan: 'PRO',
    },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerOrderId: paymentLink.id },
  });

  return {
    paymentId: payment.id,
    paymentLinkUrl: paymentLink.short_url,
    amount: amt,
    currency: paymentLink.currency || 'INR',
    plan: 'PRO',
    mode: 'payment_link',
  };
}

async function createSubscriptionCheckoutOrder(businessId) {
  const amt = proAmount();
  const keyId = razorpayPublicConfig().keyId;

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
      kind: 'subscription',
      paymentId: payment.id,
      businessId,
      plan: 'PRO',
    },
  });
  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerOrderId: order.id },
  });
  return {
    paymentId: payment.id,
    orderId: order.id,
    amount: amt,
    currency: order.currency || 'INR',
    keyId,
    plan: 'PRO',
    mode: 'checkout',
  };
}

export async function subscriptionQr(req, res, next) {
  try {
    const businessId = req.user.businessId;
    if (!razorpayPublicConfig().keyId) {
      return res.status(503).json({ error: 'Razorpay is not configured on the server' });
    }

    try {
      await verifyRazorpayCredentials();
    } catch (e) {
      return res.status(503).json({
        error: 'Razorpay API keys are invalid or mismatched. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.',
        detail: e.message,
      });
    }

    const reusable = await findReusableSubscriptionPayment(businessId);
    if (reusable) {
      return res.json({
        ...reusable,
        keyId: razorpayPublicConfig().keyId,
        reused: true,
      });
    }

    const payload = useCheckoutFallback()
      ? await createSubscriptionCheckoutOrder(businessId)
      : await createSubscriptionPaymentLink(businessId, req.user.email);

    res.json({ ...payload, reused: false });
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
    let { id } = req.params;
    const body = req.body || {};
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    if (!id || id === 'undefined') {
      const pending = await prisma.payment.findFirst({
        where: { businessId: req.user.businessId, type: 'SUBSCRIPTION', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (!pending) {
        return res.status(400).json({ error: 'Invalid payment id and no pending subscription payment' });
      }
      id = pending.id;
    }

    if (razorpay_payment_id && !razorpay_signature) {
      await syncSubscriptionByRazorpayPaymentId(req.user.businessId, razorpay_payment_id);
      return res.json({ ok: true, synced: true });
    }

    const payment = await prisma.payment.findFirst({
      where: { id, businessId: req.user.businessId },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing Razorpay verification fields (order_id, payment_id, signature)',
      });
    }
    if (payment.providerOrderId?.startsWith('order_') && payment.providerOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order id does not match this payment record' });
    }
    const valid = verifyRazorpayPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) return res.status(400).json({ error: 'Invalid Razorpay signature' });

    await activateProSubscription(req.user.businessId, payment.id, {
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
      providerSignature: razorpay_signature,
    });

    res.json({ ok: true });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function syncSubscriptionPayment(req, res, next) {
  try {
    const { razorpay_payment_id: razorpayPaymentId } = req.body || {};
    if (razorpayPaymentId) {
      await syncSubscriptionByRazorpayPaymentId(req.user.businessId, razorpayPaymentId);
      return res.json({ ok: true, synced: true });
    }
    const result = await trySyncPendingSubscriptionPayment(req.user.businessId);
    if (result.synced) return res.json({ ok: true, synced: true });
    return res.json({ ok: false, synced: false, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

export async function subscriptionStatus(req, res, next) {
  try {
    const businessId = req.user.businessId;

    await trySyncPendingSubscriptionPayment(businessId);

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

    let pendingPaymentLinkUrl = null;
    if (pending?.providerOrderId?.startsWith('plink_')) {
      try {
        const link = await fetchRazorpayPaymentLink(pending.providerOrderId);
        if (link.status === 'created') pendingPaymentLinkUrl = link.short_url;
      } catch {
        // ignore
      }
    }

    res.json({
      subscription: sub,
      pendingPayment: pending,
      pendingPaymentLinkUrl,
      latestPayment: latest,
      razorpayKeyId: razorpayPublicConfig().keyId || null,
    });
  } catch (e) {
    next(e);
  }
}
