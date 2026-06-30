/** Exact reply when the question is outside client/business context or cannot be answered from client data. */
export const AI_OUT_OF_CONTEXT_REPLY =
  'Someone from our team will connect with you for this.';

const CORE_REPLY_RULES = [
  'Answer ONLY what the customer asked — exact, direct, and nothing extra.',
  'Do not add suggestions, greetings, sign-offs, emojis, or information they did not ask for.',
  'Use ONLY facts from the business data provided below. Never use general knowledge or guess.',
  `If the question is NOT about this business or its services, products, hours, pricing, or appointments, reply with EXACTLY: "${AI_OUT_OF_CONTEXT_REPLY}"`,
  `If the question is about the business but the answer is NOT in the provided data, reply with EXACTLY: "${AI_OUT_OF_CONTEXT_REPLY}"`,
  'Reply in Hinglish or English to match the customer. Keep under 2 lines.',
].join('\n');

export function buildWhatsAppAssistantSystemPrompt() {
  return `You are a WhatsApp assistant for an Indian small business.

${CORE_REPLY_RULES}`;
}

export function buildBusinessUserPrompt({
  businessName,
  message,
  clientDetails = '',
  servicesText = '[]',
  productsText = '[]',
  workingHours = '',
  history = '',
}) {
  return `Business name: "${businessName}"
Business/client details: ${clientDetails || 'Not provided'}
Working hours: ${workingHours || 'Not provided'}
Services (JSON): ${servicesText}
Products (JSON): ${productsText}
Previous conversation:
${history || 'No prior context.'}

Customer message: ${message}`;
}

export function buildSchedulingAssistantRules() {
  return [
    'Answer ONLY what the customer asked — exact, direct, and nothing extra.',
    'Do not add suggestions, greetings, or information they did not ask for.',
    'Only handle questions about this business appointments, services, slots, cancel, reschedule, waitlist, or payments.',
    `If the question is unrelated to scheduling or this business, reply with EXACTLY: "${AI_OUT_OF_CONTEXT_REPLY}"`,
    `If you cannot answer from the business services or scheduling context, reply with EXACTLY: "${AI_OUT_OF_CONTEXT_REPLY}"`,
    'Reply in Hinglish or English. Keep under 3 lines unless listing slots.',
  ].join('\n');
}
