import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { detectIntent } from './intent.service.js';
import { generateAIReply } from './openai.service.js';
import {
  formatSlotsMessage,
  matchSlotSelection,
  parseSlotsFromConfig,
} from './bookingSlots.service.js';
import { sendWhatsAppText } from './whatsapp.service.js';
import { createRazorpayPaymentLink } from './razorpay.service.js';

const MESSAGE_PREFIX = 'WA_MSG:';

function aiKnowledgeFromConfig(configServices) {
  if (Array.isArray(configServices)) {
    return { services: configServices, products: [], clientDetails: '' };
  }
  if (configServices && typeof configServices === 'object') {
    return {
      services: Array.isArray(configServices.services) ? configServices.services : [],
      products: Array.isArray(configServices.products) ? configServices.products : [],
      clientDetails: typeof configServices.clientDetails === 'string' ? configServices.clientDetails : '',
    };
  }
  return { services: [], products: [], clientDetails: '' };
}

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

function structuredContent(payload) {
  return `${MESSAGE_PREFIX}${JSON.stringify(payload)}`;
}

function isCancelBookingMessage(text) {
  const t = String(text || '').toLowerCase();
  return /\b(cancel|stop|not now|later|leave it|no booking)\b/.test(t);
}

function extractRequestedAmountInInr(text) {
  const m = String(text || '').match(/(?:rs\.?|inr|₹)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i);
  const val = Number(m?.[1] || m?.[2]);
  if (!Number.isFinite(val) || val <= 0) return null;
  return Math.round(val * 100) / 100;
}

async function resolveInboundContext({ phoneNumberId, fromWaId, contactName }) {
  const business = await findBusinessByPhoneNumberId(phoneNumberId);
  if (!business) {
    log('warn', 'webhook_unknown_phone_number_id', { phoneNumberId });
    return null;
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

  return { business, customer, phone };
}

async function recentConversation(customerId, businessId, limit = 12) {
  const rows = await prisma.message.findMany({
    where: { customerId, businessId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { type: true, content: true },
  });
  return rows.reverse();
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
  const context = await resolveInboundContext({ phoneNumberId, fromWaId, contactName });
  if (!context) return { ok: false, reason: 'unknown_business' };
  const { business, customer, phone } = context;

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
  const knowledge = aiKnowledgeFromConfig(cfg.services);

  const slots = parseSlotsFromConfig(cfg.workingHours);
  const pickedSlot = matchSlotSelection(textBody, slots);
  const intent = detectIntent(textBody);
  const history = await recentConversation(customer.id, business.id, 12);
  let replyText = '';

  if (pickedSlot) {
    let confirmed = false;
    try {
      await prisma.$transaction([
        prisma.booking.create({
          data: {
            customerId: customer.id,
            businessId: business.id,
            service: pickedSlot.service,
            slot: pickedSlot.slot,
            status: 'CONFIRMED',
          },
        }),
        prisma.lead.updateMany({
          where: { customerId: customer.id, businessId: business.id },
          data: { status: 'BOOKED' },
        }),
        prisma.customer.update({
          where: { id: customer.id },
          data: { bookingSlotSelectionPending: false },
        }),
      ]);
      confirmed = true;
    } catch (e) {
      log('error', 'booking_create_failed', {
        businessId: business.id,
        customerId: customer.id,
        slot: pickedSlot.slot,
        message: e.message,
      });
    }

    if (confirmed) {
      replyText = `Booking confirmed for ${pickedSlot.slot}! 🎉 See you soon.`;
    } else {
      replyText = `Sorry, booking confirm nahi ho payi.\n${formatSlotsMessage(slots)}`;
    }
  } else if (intent === 'BOOKING') {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { bookingSlotSelectionPending: true },
    });
    replyText = formatSlotsMessage(slots);
  } else if (customer.bookingSlotSelectionPending && isCancelBookingMessage(textBody)) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { bookingSlotSelectionPending: false },
    });
    replyText = 'No problem, booking request cancelled. Jab chaho message kar do.';
  } else if (customer.bookingSlotSelectionPending) {
    replyText = `I am still holding your booking request.\n${formatSlotsMessage(slots)}`;
  } else if (intent === 'PRICE_QUERY') {
    replyText = await generateAIReply(
      `Customer asked about pricing. Answer using only services/products JSON. Message: ${textBody}`,
      {
        services: knowledge.services,
        products: knowledge.products,
        clientDetails: knowledge.clientDetails,
        workingHours: cfg.workingHours,
        businessName: business.name,
        conversationHistory: history,
      },
    );
  } else if (intent === 'PAYMENT') {
    const requestedAmount = extractRequestedAmountInInr(textBody);
    const amountInInr = requestedAmount || 100;
    try {
      const cp = await prisma.customerPayment.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          amount: amountInInr.toFixed(2),
          status: 'PENDING',
          provider: 'RAZORPAY',
        },
      });
      const paymentLink = await createRazorpayPaymentLink({
        amountInInr,
        description: `Payment for ${business.name}`,
        customer: {
          name: customer.name || undefined,
          contact: customer.phone ? customer.phone.replace(/^\+/, '') : undefined,
        },
        notes: {
          kind: 'customer_payment',
          customerPaymentId: cp.id,
          businessId: business.id,
        },
      });
      await prisma.customerPayment.update({
        where: { id: cp.id },
        data: { providerLinkId: paymentLink.id },
      });
      replyText = `Please complete payment here: ${paymentLink.short_url}\nAmount: Rs ${amountInInr.toFixed(2)}`;
    } catch (e) {
      log('error', 'payment_link_create_failed', {
        businessId: business.id,
        customerId: customer.id,
        message: e.message,
      });
      replyText = 'Payment link abhi generate nahi ho pa raha. Please try again in a moment.';
    }
  } else {
    replyText = await generateAIReply(textBody, {
      services: knowledge.services,
      products: knowledge.products,
      clientDetails: knowledge.clientDetails,
      workingHours: cfg.workingHours,
      businessName: business.name,
      conversationHistory: history,
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

/**
 * Process one inbound WhatsApp image message.
 */
export async function handleInboundImage({
  phoneNumberId,
  fromWaId,
  mediaId,
  caption,
  mimeType,
  contactName,
}) {
  const context = await resolveInboundContext({ phoneNumberId, fromWaId, contactName });
  if (!context) return { ok: false, reason: 'unknown_business' };
  const { business, customer } = context;

  if (!mediaId) return { ok: false, reason: 'missing_media_id' };

  await prisma.message.create({
    data: {
      customerId: customer.id,
      businessId: business.id,
      content: structuredContent({
        kind: 'image',
        mediaId,
        caption: caption || '',
        mimeType: mimeType || '',
      }),
      type: 'USER',
    },
  });

  return { ok: true };
}

export async function handleInboundNonText({
  phoneNumberId,
  fromWaId,
  msgType,
  msgPayload,
  contactName,
}) {
  const context = await resolveInboundContext({ phoneNumberId, fromWaId, contactName });
  if (!context) return { ok: false, reason: 'unknown_business' };
  const { business, customer } = context;

  if (!msgType) return { ok: false, reason: 'missing_message_type' };

  let payload = { kind: msgType };
  if (msgType === 'audio' || msgType === 'video' || msgType === 'document' || msgType === 'sticker') {
    if (!msgPayload?.id) return { ok: false, reason: 'missing_media_id' };
    payload = {
      kind: msgType,
      mediaId: msgPayload.id,
      mimeType: msgPayload.mime_type || '',
      caption: msgPayload.caption || '',
      filename: msgPayload.filename || '',
      sha256: msgPayload.sha256 || '',
      voice: Boolean(msgPayload.voice),
    };
  } else if (msgType === 'location') {
    payload = {
      kind: 'location',
      latitude: msgPayload?.latitude,
      longitude: msgPayload?.longitude,
      name: msgPayload?.name || '',
      address: msgPayload?.address || '',
      url: msgPayload?.url || '',
    };
  } else if (msgType === 'contacts') {
    payload = {
      kind: 'contacts',
      contacts: Array.isArray(msgPayload) ? msgPayload : [],
    };
  } else if (msgType === 'button') {
    payload = {
      kind: 'button',
      text: msgPayload?.text || '',
      payload: msgPayload?.payload || '',
    };
  } else if (msgType === 'interactive') {
    payload = {
      kind: 'interactive',
      interactiveType: msgPayload?.type || '',
      buttonReply: msgPayload?.button_reply || null,
      listReply: msgPayload?.list_reply || null,
      nfmReply: msgPayload?.nfm_reply || null,
    };
  } else if (msgType === 'reaction') {
    payload = {
      kind: 'reaction',
      emoji: msgPayload?.emoji || '',
      messageId: msgPayload?.message_id || '',
    };
  } else {
    payload = {
      kind: msgType,
      raw: msgPayload || null,
    };
  }

  await prisma.message.create({
    data: {
      customerId: customer.id,
      businessId: business.id,
      content: structuredContent(payload),
      type: 'USER',
    },
  });

  return { ok: true };
}
