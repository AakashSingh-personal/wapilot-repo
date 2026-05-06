import { prisma } from '../lib/prisma.js';
import { buildUpiLink } from '../utils/upi.js';
import { qrPngDataUrl } from '../services/qrcode.service.js';

export async function createPaymentLink(req, res, next) {
  try {
    const { customerId, amount } = req.body || {};
    if (!customerId || amount == null) {
      return res.status(400).json({ error: 'customerId and amount required' });
    }

    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      include: { config: true },
    });
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId: req.user.businessId },
    });

    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const upi = business?.config?.upiId?.trim();
    if (!upi) return res.status(400).json({ error: 'Configure business UPI ID in settings first' });

    const amtStr = String(amount);
    const link = buildUpiLink({
      pa: upi,
      pn: business.name.slice(0, 50),
      am: amtStr,
    });
    const qrImage = await qrPngDataUrl(link);

    await prisma.customerPayment.create({
      data: {
        businessId: req.user.businessId,
        customerId,
        amount: amtStr,
        status: 'PENDING',
      },
    });

    res.json({ upiLink: link, qrImage });
  } catch (e) {
    next(e);
  }
}
