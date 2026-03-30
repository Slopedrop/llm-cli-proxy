import { randomUUID } from 'node:crypto';
import type {
  NdjsonEvent,
  CliResponse,
  OpenAIMessage,
  OpenAIChatCompletion,
  OpenAIChunk,
  OpenAIToolCall,
} from './types.js';
import type { ProviderConfig } from './providers/base.js';

// ── OpenAI-compatible Format Adapter ────────────────────────────────

/**
 * Converts between OpenAI chat completion format and CLI NDJSON events.
 * This is the translation layer that makes the proxy compatible with
 * any tool expecting OpenAI's API format.
 */

/**
 * Collapse OpenAI messages into a single prompt string for the CLI.
 * System messages are prepended, then user/assistant messages in order.
 */
export function toCliMessage(messages: OpenAIMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case 'system':
        parts.push(`[System] ${msg.content}`);
        break;
      case 'user':
        parts.push(msg.content || '');
        break;
      case 'assistant':
        if (msg.content) {
          parts.push(`[Previous Assistant] ${msg.content}`);
        }
        break;
      case 'tool':
        parts.push(`[Tool Result (${msg.name || msg.tool_call_id})] ${msg.content}`);
        break;
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Convert a completed CLI response into an OpenAI chat completion response.
 */
export function toOpenAIResponse(
  response: CliResponse,
  model: string,
): OpenAIChatCompletion {
  const hasToolCalls = response.toolCalls.length > 0;

  const message: OpenAIMessage = {
    role: 'assistant',
    content: response.text || null,
  };

  if (hasToolCalls) {
    message.tool_calls = toOpenAIToolCalls(response.toolCalls);
  }

  return {
    id: `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * Convert a text_delta NDJSON event into an SSE-compatible OpenAI chunk.
 */
export function toOpenAIStreamChunk(
  event: NdjsonEvent,
  model: string,
  provider: ProviderConfig,
  chunkId: string,
): OpenAIChunk | null {
  const normalizedType = provider.normalizeEventType(event.type);

  if (normalizedType === 'text_delta') {
    const content = provider.extractTextContent(event);
    if (!content) return null;

    return {
      id: chunkId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: { content },
          finish_reason: null,
        },
      ],
    };
  }

  if (normalizedType === 'result') {
    return {
      id: chunkId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    };
  }

  return null;
}

/**
 * Convert tool call events to OpenAI format.
 */
export function toOpenAIToolCalls(
  toolEvents: { id: string; name: string; arguments: Record<string, unknown> }[],
): OpenAIToolCall[] {
  return toolEvents.map((tc) => ({
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.name,
      arguments: JSON.stringify(tc.arguments),
    },
  }));
}
