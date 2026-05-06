import { prisma } from '../lib/prisma.js';
import { createRazorpayPaymentLink } from '../services/razorpay.service.js';

export async function createPaymentLink(req, res, next) {
  try {
    const { customerId, amount } = req.body || {};
    if (!customerId || amount == null) {
      return res.status(400).json({ error: 'customerId and amount required' });
    }

    const business = await prisma.business.findUnique({ where: { id: req.user.businessId } });
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId: req.user.businessId },
    });

    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }

    const cp = await prisma.customerPayment.create({
      data: {
        businessId: req.user.businessId,
        customerId,
        amount: amtNum.toFixed(2),
        status: 'PENDING',
        provider: 'RAZORPAY',
      },
    });

    const paymentLink = await createRazorpayPaymentLink({
      amountInInr: amtNum,
      description: `Payment for ${business?.name || 'Business'}`,
      customer: {
        name: customer.name || undefined,
        contact: customer.phone ? customer.phone.replace(/^\+/, '') : undefined,
      },
      notes: {
        kind: 'customer_payment',
        customerPaymentId: cp.id,
        businessId: req.user.businessId,
      },
    });

    await prisma.customerPayment.update({
      where: { id: cp.id },
      data: { providerLinkId: paymentLink.id },
    });

    res.json({
      paymentLinkId: paymentLink.id,
      shortUrl: paymentLink.short_url,
      amount: amtNum.toFixed(2),
      status: 'PENDING',
    });
  } catch (e) {
    next(e);
  }
}
