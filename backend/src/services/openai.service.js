import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger.js';
import { anthropicChatCompletion } from './llmAnthropic.adapter.js';
import {
  buildBusinessUserPrompt,
  buildWhatsAppAssistantSystemPrompt,
} from './aiReplyPrompt.js';

/** @returns {'groq' | 'openai' | 'claude' | null} */
function resolveProvider() {
  const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'groq') return 'groq';
  if (explicit === 'openai') return 'openai';
  if (explicit === 'claude' || explicit === 'anthropic') return 'claude';

  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (hasGroq && !hasOpenai && !hasClaude) return 'groq';
  if (hasOpenai && !hasGroq && !hasClaude) return 'openai';
  if (hasClaude && !hasGroq && !hasOpenai) return 'claude';
  if (hasOpenai) return 'openai';
  if (hasClaude) return 'claude';
  if (hasGroq) return 'groq';

  return null;
}

function openAiChatCompletion(client, model, opts) {
  return client.chat.completions.create({ model, ...opts });
}

/** @returns {{ provider: string; model: string; chatCompletion: Function } | null} */
export function createLlmClient() {
  const provider = resolveProvider();
  if (!provider) return null;

  if (provider === 'groq') {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) {
      log('warn', 'ai_groq_selected_but_missing_key');
      return null;
    }
    const model = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
    const client = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    return {
      provider: 'groq',
      model,
      chatCompletion: (opts) => openAiChatCompletion(client, model, opts),
    };
  }

  if (provider === 'claude') {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      log('warn', 'ai_claude_selected_but_missing_key');
      return null;
    }
    const model = process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-8';
    const client = new Anthropic({ apiKey: key });
    return {
      provider: 'claude',
      model,
      chatCompletion: (opts) => anthropicChatCompletion(client, model, opts),
    };
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    log('warn', 'ai_openai_selected_but_missing_key');
    return null;
  }
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const client = new OpenAI({ apiKey: key });
  return {
    provider: 'openai',
    model,
    chatCompletion: (opts) => openAiChatCompletion(client, model, opts),
  };
}

/**
 * @param {string} message
 * @param {{ services: unknown, products?: unknown, clientDetails?: string, workingHours: string, businessName: string, conversationHistory?: Array<{ type: string, content: string }> }} businessConfig
 */
export async function generateAIReply(message, businessConfig) {
  let servicesText = '';
  let productsText = '';
  try {
    const s = businessConfig.services;
    servicesText = typeof s === 'string' ? s : JSON.stringify(s ?? []);
  } catch {
    servicesText = '[]';
  }
  try {
    const p = businessConfig.products;
    productsText = typeof p === 'string' ? p : JSON.stringify(p ?? []);
  } catch {
    productsText = '[]';
  }
  const clientDetails = String(businessConfig.clientDetails || '').trim();
  const workingHours = String(businessConfig.workingHours || '').trim();
  const history = Array.isArray(businessConfig.conversationHistory)
    ? businessConfig.conversationHistory
        .slice(-12)
        .map((m) => `${m.type === 'USER' ? 'Customer' : m.type === 'STAFF' ? 'Staff' : 'Bot'}: ${m.content}`)
        .join('\n')
    : '';

  const prompt = buildBusinessUserPrompt({
    businessName: businessConfig.businessName,
    message,
    clientDetails,
    servicesText,
    productsText,
    workingHours,
    history,
  });

  const llm = createLlmClient();
  if (!llm) {
    log('warn', 'ai_missing_keys_fallback');
    return 'Thanks for messaging us! Hamari team jaldi reply karegi. 🙏';
  }

  try {
    const completion = await llm.chatCompletion({
      messages: [
        { role: 'system', content: buildWhatsAppAssistantSystemPrompt() },
        { role: 'user', content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.2,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text || 'Thanks! We will get back to you shortly.';
  } catch (e) {
    log('error', 'ai_completion_failed', {
      provider: llm.provider,
      message: e.message,
    });
    return 'Sorry, abhi reply generate nahi ho paya. Please try again in a moment.';
  }
}
