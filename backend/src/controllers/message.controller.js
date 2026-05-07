import { prisma } from '../lib/prisma.js';
import { sendWhatsAppImageUrl, sendWhatsAppText } from '../services/whatsapp.service.js';

const MESSAGE_PREFIX = 'WA_MSG:';

function structuredContent(payload) {
  return `${MESSAGE_PREFIX}${JSON.stringify(payload)}`;
}

export async function sendMessage(req, res, next) {
  try {
    const { customerId, content, imageUrl } = req.body || {};
    if (!customerId || (!content && !imageUrl)) {
      return res.status(400).json({ error: 'customerId and either content or imageUrl required' });
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

    const isImage = Boolean(imageUrl);
    const created = await prisma.message.create({
      data: {
        customerId,
        businessId: req.user.businessId,
        content: structuredContent(
          isImage
            ? {
                kind: 'image',
                imageUrl,
                caption: content || '',
                direction: 'outbound',
                status: 'pending',
                source: 'catalog',
              }
            : {
                kind: 'text',
                text: content,
                direction: 'outbound',
                status: 'pending',
              },
        ),
        type: 'STAFF',
      },
    });

    const sendRes = isImage
      ? await sendWhatsAppImageUrl({
          phoneNumberId,
          toPhoneE164: customer.phone,
          imageUrl,
          caption: content || '',
        })
      : await sendWhatsAppText({
          phoneNumberId,
          toPhoneE164: customer.phone,
          body: content,
        });
    const waMessageId = sendRes?.messages?.[0]?.id;
    await prisma.message.update({
      where: { id: created.id },
      data: {
        content: structuredContent(
          isImage
            ? {
                kind: 'image',
                imageUrl,
                caption: content || '',
                direction: 'outbound',
                status: 'sent',
                waMessageId: waMessageId || undefined,
                source: 'catalog',
              }
            : {
                kind: 'text',
                text: content,
                direction: 'outbound',
                status: 'sent',
                waMessageId: waMessageId || undefined,
              },
        ),
      },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
