/**
 * Anthropic Messages API adapter — returns OpenAI-shaped chat completion responses
 * so callers can stay provider-agnostic.
 */

function convertOpenAiToolsToAnthropic(tools) {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description || '',
    input_schema: tool.function.parameters || { type: 'object', properties: {} },
  }));
}

function convertMessagesToAnthropic(messages) {
  const systemParts = [];
  const anthropicMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(String(msg.content || ''));
      continue;
    }

    if (msg.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: String(msg.content || ''),
      };
      const last = anthropicMessages[anthropicMessages.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        anthropicMessages.push({ role: 'user', content: [block] });
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const content = [];
      if (msg.content) {
        content.push({ type: 'text', text: String(msg.content) });
      }
      for (const toolCall of msg.tool_calls) {
        let input = {};
        try {
          input = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          input = {};
        }
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input,
        });
      }
      anthropicMessages.push({ role: 'assistant', content });
      continue;
    }

    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    anthropicMessages.push({ role, content: String(msg.content || '') });
  }

  return {
    system: systemParts.filter(Boolean).join('\n\n') || undefined,
    messages: anthropicMessages,
  };
}

function convertAnthropicResponseToOpenAi(response) {
  const blocks = response.content || [];
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  const toolUses = blocks.filter((block) => block.type === 'tool_use');

  const message = { content: text || null, role: 'assistant' };
  if (toolUses.length) {
    message.tool_calls = toolUses.map((toolUse) => ({
      id: toolUse.id,
      type: 'function',
      function: {
        name: toolUse.name,
        arguments: JSON.stringify(toolUse.input ?? {}),
      },
    }));
  }

  return { choices: [{ message }] };
}

export async function anthropicChatCompletion(client, model, { messages, tools, max_tokens, temperature }) {
  const { system, messages: anthropicMessages } = convertMessagesToAnthropic(messages);
  const anthropicTools = convertOpenAiToolsToAnthropic(tools);

  const response = await client.messages.create({
    model,
    max_tokens: max_tokens ?? 1024,
    ...(temperature != null ? { temperature } : {}),
    ...(system ? { system } : {}),
    messages: anthropicMessages,
    ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
  });

  return convertAnthropicResponseToOpenAi(response);
}
