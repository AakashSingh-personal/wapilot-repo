import { prisma } from '../lib/prisma.js';
import { sendWhatsAppText } from '../services/whatsapp.service.js';

export async function sendMessage(req, res, next) {
  try {
    const { customerId, content } = req.body || {};
    if (!customerId || !content) {
      return res.status(400).json({ error: 'customerId and content required' });
    }

    const [customer, business] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: customerId, businessId: req.user.businessId },
      }),
      prisma.business.findUnique({ where: { id: req.user.businessId } }),
    ]);

    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const phoneNumberId = business.phoneNumberId || process.env.PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      return res.status(400).json({
        error: 'WhatsApp phone number not configured — add Phone Number ID in Settings or PHONE_NUMBER_ID env',
      });
    }

    await prisma.message.create({
      data: {
        customerId,
        businessId: req.user.businessId,
        content,
        type: 'STAFF',
      },
    });

    await sendWhatsAppText({
      phoneNumberId,
      toPhoneE164: customer.phone,
      body: content,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
