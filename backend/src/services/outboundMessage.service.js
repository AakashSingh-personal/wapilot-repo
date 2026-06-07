/**
 * Outbound message helpers that BOTH send via WhatsApp AND persist the
 * message to the database so it appears in the customer's chat history.
 *
 * All scheduling/notification services (reminders, confirmations, payment
 * links, waitlist, rebooking) should use these instead of calling
 * sendWhatsAppText / sendWhatsAppTemplate directly.
 */

import { prisma } from '../lib/prisma.js';
import { sendWhatsAppText, sendWhatsAppTemplate } from './whatsapp.service.js';
import { publishInboxLive } from '../realtime/publishInbox.js';
import { EventType } from '../realtime/events.js';
import { structuredContent } from '../utils/waStructuredMessage.js';
import { log } from '../utils/logger.js';

async function persistAndPublish({ businessId, customerId, body, waMessageId, status }) {
  const record = await prisma.message.upsert({
    // Use a deterministic "key" so a double-call never creates two rows:
    // we always create a fresh row here, but we still want to be safe.
    where: { id: waMessageId ? `wa_${waMessageId}` : '__never__' },
    create: {
      customerId,
      businessId,
      content: structuredContent({
        kind: 'text',
        text: body,
        direction: 'outbound',
        status,
        waMessageId: waMessageId || undefined,
      }),
      type: 'BOT',
    },
    update: {},
  }).catch(async () => {
    // upsert by waMessageId is only useful when it exists; otherwise always create.
    return prisma.message.create({
      data: {
        customerId,
        businessId,
        content: structuredContent({
          kind: 'text',
          text: body,
          direction: 'outbound',
          status,
          waMessageId: waMessageId || undefined,
        }),
        type: 'BOT',
      },
    });
  });

  try {
    await publishInboxLive({
      businessId,
      customerId,
      type: EventType.MESSAGE_CREATED,
      reason: 'system_outbound',
      message: record,
    });
  } catch (e) {
    log('warn', 'outbound_message_realtime_publish_failed', { message: e.message });
  }

  return record;
}

/**
 * Send a plain-text WhatsApp message and save it to chat history.
 *
 * @param {{ businessId, customerId, phoneNumberId, toPhoneE164, body }} params
 */
export async function sendAndRecordWhatsAppText({
  businessId,
  customerId,
  phoneNumberId,
  toPhoneE164,
  body,
}) {
  // Create a pending record immediately so it shows in chat even if the
  // WhatsApp call is slow or fails.
  const pending = await prisma.message.create({
    data: {
      customerId,
      businessId,
      content: structuredContent({
        kind: 'text',
        text: body,
        direction: 'outbound',
        status: 'pending',
      }),
      type: 'BOT',
    },
  });

  let waMessageId;
  try {
    const sent = await sendWhatsAppText({ phoneNumberId, toPhoneE164, body });
    waMessageId = sent?.messages?.[0]?.id;

    const updated = await prisma.message.update({
      where: { id: pending.id },
      data: {
        content: structuredContent({
          kind: 'text',
          text: body,
          direction: 'outbound',
          status: sent?.skipped ? 'skipped' : 'sent',
          waMessageId: waMessageId || undefined,
        }),
      },
    });

    try {
      await publishInboxLive({
        businessId,
        customerId,
        type: EventType.MESSAGE_CREATED,
        reason: 'system_outbound',
        message: updated,
      });
    } catch (e) {
      log('warn', 'outbound_message_realtime_publish_failed', { message: e.message });
    }

    return { id: pending.id, waMessageId, skipped: Boolean(sent?.skipped) };
  } catch (e) {
    // Mark as failed but keep the record for audit/history.
    await prisma.message.update({
      where: { id: pending.id },
      data: {
        content: structuredContent({
          kind: 'text',
          text: body,
          direction: 'outbound',
          status: 'failed',
        }),
      },
    }).catch(() => {});
    throw e;
  }
}

/**
 * Send a WhatsApp template (or fall back to free-form text) and save to
 * chat history. Uses the same session-window logic as sendSchedulingWhatsApp
 * in reminder.service.js but adds DB persistence.
 *
 * @param {{ businessId, customerId, phoneNumberId, toPhoneE164, body,
 *           templateName, bodyParameters, languageCode, useTemplate }} params
 */
export async function sendAndRecordSchedulingMessage({
  businessId,
  customerId,
  phoneNumberId,
  toPhoneE164,
  body,
  templateName,
  bodyParameters,
  languageCode,
  useTemplate = false,
}) {
  let waMessageId;
  let sentViaTemplate = false;

  if (useTemplate && templateName) {
    try {
      const res = await sendWhatsAppTemplate({
        phoneNumberId,
        toPhoneE164,
        templateName,
        languageCode: languageCode || 'en_US',
        bodyParameters,
      });
      if (!res?.skipped) {
        waMessageId = res?.messages?.[0]?.id;
        sentViaTemplate = true;
      }
    } catch (e) {
      log('warn', 'scheduling_template_send_failed', { templateName, message: e.message });
      // Fall through to free-form text.
    }
  }

  if (!sentViaTemplate) {
    // Either no template configured, outside session window, or template failed.
    return sendAndRecordWhatsAppText({
      businessId,
      customerId,
      phoneNumberId,
      toPhoneE164,
      body,
    });
  }

  // Template was sent — record the plain-text equivalent in chat history.
  await persistAndPublish({ businessId, customerId, body, waMessageId, status: 'sent' });
  return { waMessageId, skipped: false };
}
