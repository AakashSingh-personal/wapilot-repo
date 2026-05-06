import OpenAI from 'openai';
import { log } from '../utils/logger.js';

/** @returns {'groq' | 'openai' | null} */
function resolveProvider() {
  const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'groq') return 'groq';
  if (explicit === 'openai') return 'openai';

  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (hasGroq && !hasOpenai) return 'groq';
  if (hasOpenai && !hasGroq) return 'openai';
  if (hasGroq && hasOpenai) return 'openai';

  return null;
}

/** @returns {{ client: OpenAI; model: string; provider: 'groq' | 'openai' } | null} */
function createLlmClient() {
  const provider = resolveProvider();
  if (!provider) return null;

  if (provider === 'groq') {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) {
      log('warn', 'ai_groq_selected_but_missing_key');
      return null;
    }
    const model = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
    return {
      provider: 'groq',
      model,
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
    };
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    log('warn', 'ai_openai_selected_but_missing_key');
    return null;
  }
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  return {
    provider: 'openai',
    model,
    client: new OpenAI({ apiKey: key }),
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
  const history = Array.isArray(businessConfig.conversationHistory)
    ? businessConfig.conversationHistory
        .slice(-12)
        .map((m) => `${m.type === 'USER' ? 'Customer' : m.type === 'STAFF' ? 'Staff' : 'Bot'}: ${m.content}`)
        .join('\n')
    : '';

  const prompt = `You are a WhatsApp assistant for an Indian SMB "${businessConfig.businessName}".
Reply in Hinglish or English. Keep it under 2 lines. Be helpful, polite, and clear.
Business/client details: ${clientDetails || 'Not provided'}
Use only these services (JSON): ${servicesText}
Use only these products (JSON): ${productsText}
Previous conversation (latest context, use this to stay in context):
${history || 'No prior context available.'}
If details are missing, ask one concise follow-up question.
Customer message: ${message}`;

  const llm = createLlmClient();
  if (!llm) {
    log('warn', 'ai_missing_keys_fallback');
    return 'Thanks for messaging us! Hamari team jaldi reply karegi. 🙏';
  }

  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      messages: [
        { role: 'system', content: 'You are a concise WhatsApp assistant for Indian small businesses.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.6,
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
