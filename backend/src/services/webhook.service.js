import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { publish } from '../realtime/publisher.js';
import { publishInboxLive } from '../realtime/publishInbox.js';
import { EventType } from '../realtime/events.js';
import { detectIntent } from './intent.service.js';
import { generateAIReply } from './openai.service.js';
import {
  formatSlotsMessage,
  matchSlotSelection,
  parseSlotsFromConfig,
} from './bookingSlots.service.js';
import { sendWhatsAppImageUrl, sendWhatsAppText } from './whatsapp.service.js';
import { createRazorpayPaymentLink } from './razorpay.service.js';
import { structuredContent, parseStructuredContent } from '../utils/waStructuredMessage.js';
import { sessionAllowsFreeForm } from '../utils/conversationStatus.js';

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

function statusRank(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'read') return 3;
  if (s === 'delivered') return 2;
  if (s === 'sent') return 1;
  return 0;
}

function isCancelBookingMessage(text) {
  const t = String(text || '').toLowerCase();
  return /\b(cancel|stop|not now|later|leave it|no booking)\b/.test(t);
}

function extractRequestedAmountInInr(text) {
  const raw = String(text || '');
  const preferred = raw.match(/(?:rs\.?|inr|₹)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i);
  const preferredVal = Number(preferred?.[1] || preferred?.[2]);
  if (Number.isFinite(preferredVal) && preferredVal > 0) {
    return Math.round(preferredVal * 100) / 100;
  }

  // Fallback: in payment-intent messages, users often send bare amounts like "service is 3999".
  const allNums = [...raw.matchAll(/\b\d+(?:\.\d{1,2})?\b/g)]
    .map((m) => Number(m[0]))
    .filter((n) => Number.isFinite(n) && n >= 10 && n <= 1000000);
  if (!allNums.length) return null;
  return Math.round(Math.max(...allNums) * 100) / 100;
}

function parsePriceNumber(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function serviceCatalogEntries(services) {
  if (!Array.isArray(services)) return [];
  return services
    .map((s) => {
      if (typeof s === 'string') return { name: s, amount: null };
      if (!s || typeof s !== 'object') return null;
      const name = String(s.name || s.title || s.service || '').trim();
      const amount = parsePriceNumber(s.price || s.amount || s.rate || s.cost);
      if (!name) return null;
      return { name, amount };
    })
    .filter(Boolean);
}

function imageCatalogEntries(items, source) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || item.title || '').trim();
      const imageUrl = String(item.imageUrl || item.image || '').trim();
      if (!name || !/^https?:\/\/\S+$/i.test(imageUrl)) return null;
      return { name, imageUrl, source };
    })
    .filter(Boolean);
}

function pickRelevantCatalogImage({ text, services, products }) {
  const lower = String(text || '').toLowerCase();
  if (!lower) return null;
  const entries = [
    ...imageCatalogEntries(services, 'service'),
    ...imageCatalogEntries(products, 'product'),
  ];
  if (!entries.length) return null;
  const matched = entries
    .filter((entry) => lower.includes(entry.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  return matched[0] || null;
}

function inferAmountFromSelectedService({ text, history, services }) {
  const catalog = serviceCatalogEntries(services).filter((x) => Number.isFinite(x.amount) && x.amount > 0);
  if (!catalog.length) return null;

  const pickFromText = (t) => {
    const lower = String(t || '').toLowerCase();
    const matches = catalog.filter((c) => lower.includes(c.name.toLowerCase()));
    if (!matches.length) return null;
    matches.sort((a, b) => b.name.length - a.name.length);
    return matches[0].amount;
  };

  const fromCurrent = pickFromText(text);
  if (fromCurrent) return fromCurrent;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    if (m?.type !== 'USER') continue;
    const amt = pickFromText(m.content);
    if (amt) return amt;
  }
  return null;
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

  try {
    await syncInboundCustomerToContactBook({
      businessId: business.id,
      customer,
      profileName: contactName,
    });
  } catch (e) {
    log('warn', 'contact_book_sync_failed', {
      message: e.message,
      businessId: business.id,
      customerId: customer.id,
    });
  }

  return { business, customer, phone };
}

/** Ensure WhatsApp customers appear in the communications contact book for campaigns. */
async function syncInboundCustomerToContactBook({ businessId, customer, profileName }) {
  const phone = customer.phone;
  if (!phone || String(phone).replace(/\D/g, '').length < 10) return;
  const name = customer.name || profileName || null;
  const existing = await prisma.contact.findUnique({
    where: { businessId_phone: { businessId, phone } },
  });
  if (!existing) {
    await prisma.contact.create({
      data: { businessId, phone, name },
    });
    await publish({
      businessId,
      type: EventType.CONTACTS_CHANGED,
      reason: 'contact_created',
    });
    return;
  }
  if (name && existing.name !== name) {
    await prisma.contact.update({
      where: { id: existing.id },
      data: { name },
    });
    await publish({
      businessId,
      type: EventType.CONTACTS_CHANGED,
      reason: 'contact_updated',
    });
  }
}

async function bumpInboundCustomerActivity(customerId) {
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      lastInboundCustomerMessageAt: new Date(),
      inboxUnreadCount: { increment: 1 },
    },
  });
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
 * Plain-ish text from a stored USER message (for AI resume / non-text inbound).
 */
export function extractUserPlainText(content) {
  if (typeof content !== 'string') return '';
  const parsed = parseStructuredContent(content);
  if (!parsed) return content.replace(/\s+/g, ' ').trim();
  if (parsed.kind === 'text') return String(parsed.text || '').replace(/\s+/g, ' ').trim();
  if (parsed.kind === 'image') return String(parsed.caption || '').trim() || '[Image]';
  if (parsed.kind === 'audio') return '[Voice/audio message]';
  if (parsed.kind === 'video') return String(parsed.caption || '').trim() || '[Video]';
  if (parsed.kind === 'document') return String(parsed.filename || '').trim() || '[Document]';
  if (parsed.kind === 'sticker') return '[Sticker]';
  if (parsed.kind === 'location') {
    return String(parsed.name || parsed.address || '').trim() || '[Location]';
  }
  if (parsed.kind === 'contacts') return '[Contact card]';
  if (parsed.kind === 'button') return String(parsed.text || parsed.payload || '').trim();
  if (parsed.kind === 'interactive') {
    return (
      String(
        parsed.buttonReply?.title || parsed.listReply?.title || parsed.nfmReply?.body || '',
      ).trim() || '[Interactive reply]'
    );
  }
  if (parsed.kind === 'reaction') return String(parsed.emoji || '').trim() || '[Reaction]';
  return '[Message]';
}

/**
 * Generate and send automated AI/bot reply for an inbound customer text (USER row must exist).
 */
export async function runAutoReplyForInboundText({ business, customer, phone, textBody }) {
  const cfg = business.config;
  if (!cfg?.autoReplyEnabled) return { ok: true, skipped: true };
  if (!customer.aiEnabled || customer.aiOverride) {
    return { ok: true, skipped: true, reason: 'human_override' };
  }
  if (!sessionAllowsFreeForm(customer.lastInboundCustomerMessageAt)) {
    log('info', 'ai_reply_skipped_session_expired', { customerId: customer.id });
    return { ok: true, skipped: true, reason: 'session_expired' };
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
      await publishInboxLive({
        businessId: business.id,
        customerId: customer.id,
        type: EventType.CONVERSATION_UPDATED,
        reason: 'booking_confirmed',
      });
      replyText = `Booking confirmed for ${pickedSlot.slot}! 🎉 See you soon.`;
    } else {
      replyText = `Sorry, booking confirm nahi ho payi.\n${formatSlotsMessage(slots)}`;
    }
  } else if (intent === 'BOOKING') {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { bookingSlotSelectionPending: true },
    });
    await publishInboxLive({
      businessId: business.id,
      customerId: customer.id,
      type: EventType.CONVERSATION_UPDATED,
      reason: 'booking_intent',
    });
    replyText = formatSlotsMessage(slots);
  } else if (customer.bookingSlotSelectionPending && isCancelBookingMessage(textBody)) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { bookingSlotSelectionPending: false },
    });
    await publishInboxLive({
      businessId: business.id,
      customerId: customer.id,
      type: EventType.CONVERSATION_UPDATED,
      reason: 'booking_cancelled',
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
  } else if (intent === 'PAYMENT_STATUS') {
    const latestPayment = await prisma.customerPayment.findFirst({
      where: {
        businessId: business.id,
        customerId: customer.id,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        amount: true,
        provider: true,
        providerLinkId: true,
        createdAt: true,
      },
    });
    if (!latestPayment) {
      replyText = 'Aapka koi payment record abhi nahi mila. "I want to pay" bhej do, main link share karta hun.';
    } else if (latestPayment.status === 'PAID') {
      replyText = `Payment received: Rs ${Number(latestPayment.amount).toFixed(2)}.\nThank you! ✅`;
    } else {
      const created = new Date(latestPayment.createdAt).toLocaleString('en-IN');
      replyText = `Your latest payment is still pending: Rs ${Number(latestPayment.amount).toFixed(2)}.\nRequested on ${created}.`;
    }
  } else if (intent === 'PAYMENT') {
    const requestedAmount = extractRequestedAmountInInr(textBody);
    const selectedServiceAmount = inferAmountFromSelectedService({
      text: textBody,
      history,
      services: knowledge.services,
    });
    const amountInInr = requestedAmount || selectedServiceAmount || 100;
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

  const outgoingText = await prisma.message.create({
    data: {
      customerId: customer.id,
      businessId: business.id,
      content: structuredContent({
        kind: 'text',
        text: replyText,
        direction: 'outbound',
        status: 'pending',
      }),
      type: 'BOT',
    },
  });

  const outboundIds = [outgoingText.id];
  try {
    const sent = await sendWhatsAppText({
      phoneNumberId: business.phoneNumberId,
      toPhoneE164: phone,
      body: replyText,
    });
    const waMessageId = sent?.messages?.[0]?.id;
    await prisma.message.update({
      where: { id: outgoingText.id },
      data: {
        content: structuredContent({
          kind: 'text',
          text: replyText,
          direction: 'outbound',
          status: 'sent',
          waMessageId: waMessageId || undefined,
        }),
      },
    });

    const pickedImage = pickRelevantCatalogImage({
      text: `${textBody}\n${replyText}`,
      services: knowledge.services,
      products: knowledge.products,
    });
    if (pickedImage?.imageUrl) {
      const caption = `${pickedImage.name}`;
      const imgSent = await sendWhatsAppImageUrl({
        phoneNumberId: business.phoneNumberId,
        toPhoneE164: phone,
        imageUrl: pickedImage.imageUrl,
        caption,
      });
      const imageWaMessageId = imgSent?.messages?.[0]?.id;
      const imgRow = await prisma.message.create({
        data: {
          customerId: customer.id,
          businessId: business.id,
          content: structuredContent({
            kind: 'image',
            imageUrl: pickedImage.imageUrl,
            caption,
            source: pickedImage.source,
            direction: 'outbound',
            status: 'sent',
            waMessageId: imageWaMessageId || undefined,
          }),
          type: 'BOT',
        },
      });
      outboundIds.push(imgRow.id);
    }
  } catch (e) {
    log('error', 'webhook_reply_send_failed', { message: e.message });
  }

  const msgs = await prisma.message.findMany({
    where: { id: { in: outboundIds } },
    orderBy: { createdAt: 'asc' },
  });
  await publishInboxLive({
    businessId: business.id,
    customerId: customer.id,
    type: EventType.MESSAGE_CREATED,
    reason: 'ai_auto_reply',
    ...(msgs.length ? { messages: msgs } : {}),
  });

  return { ok: true };
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
  await bumpInboundCustomerActivity(customer.id);
  const userMsg = await prisma.message.findFirst({
    where: { customerId: customer.id, businessId: business.id, type: 'USER' },
    orderBy: { createdAt: 'desc' },
  });
  await publishInboxLive({
    businessId: business.id,
    customerId: customer.id,
    type: EventType.MESSAGE_CREATED,
    reason: 'user_inbound_text',
    message: userMsg,
  });

  const cfg = business.config;
  if (!cfg?.autoReplyEnabled) {
    return { ok: true, skipped: true };
  }

  const freshCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!freshCustomer?.aiEnabled || freshCustomer.aiOverride) {
    return { ok: true, skipped: true, reason: 'human_override' };
  }

  return runAutoReplyForInboundText({
    business,
    customer: freshCustomer,
    phone,
    textBody,
  });
}

export async function handleWhatsAppStatuses({ phoneNumberId, statuses = [] }) {
  if (!Array.isArray(statuses) || !statuses.length) return { ok: true, updated: 0 };
  const business = await findBusinessByPhoneNumberId(phoneNumberId);
  let updated = 0;
  for (const st of statuses) {
    const waMessageId = String(st?.id || '').trim();
    const nextStatus = String(st?.status || '').toLowerCase();
    if (!waMessageId || !['sent', 'delivered', 'read'].includes(nextStatus)) continue;
    const existing = await prisma.message.findFirst({
      where: {
        ...(business?.id ? { businessId: business.id } : {}),
        type: { in: ['BOT', 'STAFF'] },
        OR: [
          { content: { contains: `"waMessageId":"${waMessageId}"` } },
          { content: { contains: `"waMessageId": "${waMessageId}"` } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!existing) continue;
    const parsed = parseStructuredContent(existing.content);
    if (!parsed || parsed.direction !== 'outbound') continue;
    const current = String(parsed.status || '').toLowerCase();
    if (statusRank(nextStatus) <= statusRank(current)) continue;
    await prisma.message.update({
      where: { id: existing.id },
      data: {
        content: structuredContent({
          ...parsed,
          status: nextStatus,
          waMessageId,
        }),
      },
    });
    updated += 1;
    if (business?.id && existing.customerId) {
      const full = await prisma.message.findUnique({ where: { id: existing.id } });
      await publishInboxLive({
        businessId: business.id,
        customerId: existing.customerId,
        type: EventType.MESSAGE_STATUS,
        reason: 'whatsapp_status',
        waStatus: nextStatus,
        message: full,
      });
    }
  }
  return { ok: true, updated };
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
  await bumpInboundCustomerActivity(customer.id);
  const userMsg = await prisma.message.findFirst({
    where: { customerId: customer.id, businessId: business.id, type: 'USER' },
    orderBy: { createdAt: 'desc' },
  });
  await publishInboxLive({
    businessId: business.id,
    customerId: customer.id,
    type: EventType.MESSAGE_CREATED,
    reason: 'user_inbound_image',
    message: userMsg,
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
  await bumpInboundCustomerActivity(customer.id);
  const userMsg = await prisma.message.findFirst({
    where: { customerId: customer.id, businessId: business.id, type: 'USER' },
    orderBy: { createdAt: 'desc' },
  });
  await publishInboxLive({
    businessId: business.id,
    customerId: customer.id,
    type: EventType.MESSAGE_CREATED,
    reason: 'user_inbound_media',
    message: userMsg,
  });

  return { ok: true };
}

/**
 * After clearing aiOverride — optionally process latest USER message immediately (Back to AI → Last message).
 */
export async function resumeAiFromLastCustomerMessage({ customerId, businessId }) {
  const business = await prisma.business.findFirst({
    where: { id: businessId },
    include: { config: true },
  });
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
  });
  if (!business?.config?.autoReplyEnabled) {
    return { ok: true, skipped: true, reason: 'auto_reply_off' };
  }
  if (!customer?.aiEnabled) {
    return { ok: true, skipped: true, reason: 'ai_disabled' };
  }
  if (customer.aiOverride) {
    return { ok: true, skipped: true, reason: 'still_overridden' };
  }

  const latestUser = await prisma.message.findFirst({
    where: { customerId, businessId, type: 'USER' },
    orderBy: { createdAt: 'desc' },
  });
  if (!latestUser) return { ok: true, skipped: true, reason: 'no_customer_message' };

  const textBody = extractUserPlainText(latestUser.content);
  if (!String(textBody || '').trim()) {
    return { ok: true, skipped: true, reason: 'empty_text' };
  }

  if (!sessionAllowsFreeForm(customer.lastInboundCustomerMessageAt)) {
    log('info', 'resume_ai_skipped_session', { customerId });
    return { ok: true, skipped: true, reason: 'session_expired' };
  }

  return runAutoReplyForInboundText({
    business,
    customer,
    phone: customer.phone,
    textBody,
  });
}
