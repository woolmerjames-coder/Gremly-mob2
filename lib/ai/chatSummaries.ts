import type { SpaceChatMessage } from '../types';

/**
 * summarizeChatForCard - returns a short 1–2 line summary for a chat card.
 * TODO: integrate with Cortex summarize pipeline.
 * Fallback order:
 * 1) Last assistant message content (trimmed)
 * 2) Last message content (any role)
 * 3) "Tap to view"
 */
export async function summarizeChatForCard(
  _chatId: string,
  messages: SpaceChatMessage[],
): Promise<string> {
  try {
    // TODO: Call Cortex when available
    // const summary = await cortexClient.summarizeThread({ chatId: _chatId, limit: 8 });
    // if (summary) return clampToTwoLines(summary);

    // Fallbacks
    const assistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.content && m.content.trim().length > 0);
    if (assistant) return clampToTwoLines(assistant.content);

    const last = messages[messages.length - 1];
    if (last?.content) return clampToTwoLines(last.content);

    return 'Tap to view';
  } catch {
    return 'Tap to view';
  }
}

function clampToTwoLines(text: string, maxChars = 180): string {
  // Light clamp by characters; UI will also set numberOfLines=2
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars - 1) + '…';
}
