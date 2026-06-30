import { prisma } from '../lib/prisma.js';
import { createLlmClient } from '../services/openai.service.js';
import { buildSchedulingAssistantRules } from '../services/aiReplyPrompt.js';
import { log } from '../utils/logger.js';
import {
  SCHEDULING_TOOLS,
  executeSchedulingTool,
} from './schedulingTools.service.js';

const SESSION_TTL_MS = 30 * 60 * 1000;

function llmToolsEnabled() {
  if (process.env.AI_SCHEDULING_TOOLS === '0') return false;
  return Boolean(createLlmClient());
}

function buildHistoryMessages(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-10).map((m) => ({
    role: m.type === 'USER' ? 'user' : 'assistant',
    content: String(m.content || '').slice(0, 500),
  }));
}

async function persistSession(customerId, sessionUpdate, bookingSlotSelectionPending) {
  if (!sessionUpdate) return;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.aiBookingSession.upsert({
    where: { customerId },
    create: {
      businessId: sessionUpdate.businessId,
      customerId,
      intent: sessionUpdate.intent || 'BOOK',
      state: sessionUpdate.state || {},
      expiresAt,
    },
    update: {
      intent: sessionUpdate.intent || undefined,
      state: sessionUpdate.state || {},
      expiresAt,
    },
  });
  if (bookingSlotSelectionPending != null) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { bookingSlotSelectionPending: Boolean(bookingSlotSelectionPending) },
    });
  }
}

async function clearSession(customerId) {
  await prisma.aiBookingSession.deleteMany({ where: { customerId } });
  await prisma.customer.update({
    where: { id: customerId },
    data: { bookingSlotSelectionPending: false },
  });
}

/**
 * LLM agent with scheduling tool calls. Returns null to fall back to rule-based engine.
 */
export async function runSchedulingLlmTurn({
  business,
  customer,
  textBody,
  conversationHistory = [],
  sessionState = null,
}) {
  if (!llmToolsEnabled()) return null;

  const llm = createLlmClient();
  if (!llm) return null;

  const services = await prisma.scheduledService.findMany({
    where: { businessId: business.id, isActive: true, deletedAt: null },
    select: { name: true, durationMin: true, price: true },
  });

  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = [
    `You are the appointment scheduling assistant for "${business.name}" on WhatsApp.`,
    buildSchedulingAssistantRules(),
    `Today is ${today} (UTC date).`,
    `Services: ${services.map((s) => `${s.name} (${s.durationMin}m, ₹${s.price})`).join('; ') || 'none configured'}.`,
    sessionState?.step
      ? `Active session step: ${sessionState.step}. If customer sends a slot number during booking/reschedule, use rule-based flow (do not call tools).`
      : 'No active slot-selection session.',
    'Use tools for availability, booking slot offers, cancel, reschedule, waitlist, and payments.',
    'After offer_booking_slots or start_reschedule, tell the customer to reply with a slot number only.',
  ].join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...buildHistoryMessages(conversationHistory),
    { role: 'user', content: String(textBody || '') },
  ];

  let appointment = null;
  let sessionUpdate = null;
  let bookingPending = null;

  try {
    for (let round = 0; round < 4; round += 1) {
      const completion = await llm.chatCompletion({
        messages,
        tools: SCHEDULING_TOOLS,
        tool_choice: 'auto',
        max_tokens: 300,
        temperature: 0.2,
      });

      const choice = completion.choices[0]?.message;
      if (!choice) return null;

      if (!choice.tool_calls?.length) {
        const replyText = choice.content?.trim();
        if (!replyText) return null;

        if (sessionUpdate) {
          sessionUpdate.businessId = business.id;
          await persistSession(customer.id, sessionUpdate, bookingPending);
        }
        return { replyText, appointment, usedLlm: true };
      }

      messages.push(choice);

      for (const toolCall of choice.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          args = {};
        }

        const result = await executeSchedulingTool(toolCall.function.name, args, {
          business,
          customer,
          sessionState,
        });

        if (result.sessionUpdate) {
          sessionUpdate = {
            businessId: business.id,
            intent: result.sessionUpdate.intent,
            state: result.sessionUpdate.state,
          };
          bookingPending = result.bookingSlotSelectionPending ?? null;
        }
        if (result.sessionClear) {
          await clearSession(customer.id);
          sessionUpdate = null;
        }
        if (result.appointment) {
          appointment = result.appointment;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
    if (sessionUpdate) {
      await persistSession(customer.id, sessionUpdate, bookingPending);
    }
    return {
      replyText: lastAssistant?.content?.trim() || 'How can I help with your appointment?',
      appointment,
      usedLlm: true,
    };
  } catch (e) {
    log('warn', 'scheduling_llm_failed', { message: e.message, provider: llm.provider });
    return null;
  }
}

export function isSchedulingLlmEnabled() {
  return llmToolsEnabled();
}
