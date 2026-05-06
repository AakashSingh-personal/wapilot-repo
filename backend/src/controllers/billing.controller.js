import { prisma } from '../lib/prisma.js';
import { buildUpiLink } from '../utils/upi.js';
import { qrPngDataUrl } from '../services/qrcode.service.js';

function proAmount() {
  const raw = process.env.SUBSCRIPTION_PRO_AMOUNT || '999';
  return raw;
}

function platformUpi() {
  return (process.env.WAPILOT_PLATFORM_UPI_ID || '').trim();
}

export async function subscriptionQr(req, res, next) {
  try {
    const amt = proAmount();
    const pa = platformUpi();
    if (!pa) {
      return res.status(400).json({ error: 'WAPILOT_PLATFORM_UPI_ID not configured on server' });
    }
    const link = buildUpiLink({
      pa,
      pn: 'WAPilot',
      am: amt,
    });
    const qrImage = await qrPngDataUrl(link);
    res.json({ upiLink: link, qrImage, amount: amt, plan: 'PRO' });
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
    const payment = await prisma.payment.findFirst({
      where: { id, businessId: req.user.businessId },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCESS' },
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
    const sub = await prisma.subscription.findFirst({
      where: { businessId: req.user.businessId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    const pending = await prisma.payment.findFirst({
      where: {
        businessId: req.user.businessId,
        type: 'SUBSCRIPTION',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ subscription: sub, pendingPayment: pending });
  } catch (e) {
    next(e);
  }
}
