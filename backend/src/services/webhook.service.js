import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { detectIntent } from './intent.service.js';
import { generateAIReply } from './openai.service.js';
import {
  formatSlotsMessage,
  matchSlotSelection,
  parseSlotsFromConfig,
} from './bookingSlots.service.js';
import { sendWhatsAppImageFromBuffer, sendWhatsAppText } from './whatsapp.service.js';
import { buildUpiLink } from '../utils/upi.js';
import { qrPngBuffer } from './qrcode.service.js';

function normalizePhone(from) {
  const digits = String(from || '').replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

async function findBusinessByPhoneNumberId(phoneNumberId) {
  const id = phoneNumberId != null ? String(phoneNumberId).trim() : '';
  if (!id) return null;
  return prisma.business.findFirst({
    where: { phoneNumberId: id },
    include: { config: true },
  });
}

async function findOrCreateCustomer({ businessId, phone, name }) {
  const existing = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId, phone } },
  });
  if (existing) {
    if (name && !existing.name) {
      return prisma.customer.update({
        where: { id: existing.id },
        data: { name },
      });
    }
    return existing;
  }
  return prisma.customer.create({
    data: { businessId, phone, name: name || null },
  });
}

/**
 * Process one inbound WhatsApp text message.
 */
export async function handleInboundText({
  phoneNumberId,
  fromWaId,
  textBody,
  contactName,
}) {
  const business = await findBusinessByPhoneNumberId(phoneNumberId);
  if (!business) {
    log('warn', 'webhook_unknown_phone_number_id', { phoneNumberId });
    return { ok: false, reason: 'unknown_business' };
  }

  const phone = normalizePhone(fromWaId);
  const customer = await findOrCreateCustomer({
    businessId: business.id,
    phone,
    name: contactName,
  });

  const existingLead = await prisma.lead.findFirst({
    where: { customerId: customer.id, businessId: business.id },
  });
  if (!existingLead) {
    await prisma.lead.create({
      data: {
        customerId: customer.id,
        businessId: business.id,
        status: 'NEW',
      },
    });
  }

  await prisma.message.create({
    data: {
      customerId: customer.id,
      businessId: business.id,
      content: textBody,
      type: 'USER',
    },
  });

  const cfg = business.config;
  if (!cfg?.autoReplyEnabled) {
    return { ok: true, skipped: true };
  }

  const slots = parseSlotsFromConfig(cfg.workingHours);
  const pickedSlot = matchSlotSelection(textBody, slots);
  const intent = detectIntent(textBody);
  let replyText = '';

  if (pickedSlot) {
    await prisma.booking.create({
      data: {
        customerId: customer.id,
        businessId: business.id,
        service: pickedSlot.service,
        slot: pickedSlot.slot,
        status: 'CONFIRMED',
      },
    });
    await prisma.lead.updateMany({
      where: { customerId: customer.id, businessId: business.id },
      data: { status: 'BOOKED' },
    });
    replyText = `Booking confirmed for ${pickedSlot.slot}! 🎉 See you soon.`;
  } else if (intent === 'BOOKING') {
    replyText = formatSlotsMessage(slots);
  } else if (intent === 'PRICE_QUERY') {
    replyText = await generateAIReply(
      `Customer asked about pricing. Answer using services JSON only. Message: ${textBody}`,
      {
        services: cfg.services,
        workingHours: cfg.workingHours,
        businessName: business.name,
      },
    );
  } else if (intent === 'PAYMENT') {
    const upi = cfg.upiId?.trim();
    if (!upi) {
      replyText =
        'Payment link abhi setup nahi hai. Owner se contact karein — thanks!';
    } else {
      const defaultAmt = '100';
      const link = buildUpiLink({
        pa: upi,
        pn: business.name.slice(0, 50),
        am: defaultAmt,
      });
      try {
        const buf = await qrPngBuffer(link);
        await sendWhatsAppImageFromBuffer({
          phoneNumberId: business.phoneNumberId,
          toPhoneE164: phone,
          buffer: buf,
        });
        replyText = 'Scan & pay via UPI 🙏 Dhanyavaad!';
      } catch (e) {
        log('error', 'payment_qr_send_failed', { message: e.message });
        replyText = `Pay via UPI:\n${link}`;
      }
    }
  } else {
    replyText = await generateAIReply(textBody, {
      services: cfg.services,
      workingHours: cfg.workingHours,
      businessName: business.name,
    });
  }

  await prisma.message.create({
    data: {
      customerId: customer.id,
      businessId: business.id,
      content: replyText,
      type: 'BOT',
    },
  });

  try {
    await sendWhatsAppText({
      phoneNumberId: business.phoneNumberId,
      toPhoneE164: phone,
      body: replyText,
    });
  } catch (e) {
    log('error', 'webhook_reply_send_failed', { message: e.message });
  }

  return { ok: true };
}
