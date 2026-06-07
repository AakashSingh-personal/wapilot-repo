import { prisma } from '../lib/prisma.js';

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
