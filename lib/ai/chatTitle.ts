export type MessageLike = { role: 'user' | 'assistant' | string; content: string };

/**
 * generateChatTitle - creates a concise title based on the first user message
 * and assistant reply. Falls back to "New Chat".
 */
export function generateChatTitle(messages: MessageLike[] | null | undefined): string {
  const msgs = Array.isArray(messages) ? messages : [];
  const user = msgs.find((m) => m.role === 'user' && m.content?.trim());
  const assistant = msgs.find((m) => m.role === 'assistant' && m.content?.trim());

  const pick = (text?: string | null, maxWords = 6): string | null => {
    if (!text) return null;
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    const words = cleaned.split(' ');
    const head = words.slice(0, maxWords).join(' ');
    // Capitalize first letter
    return head.charAt(0).toUpperCase() + head.slice(1);
  };

  return pick(user?.content, 7) || pick(assistant?.content, 7) || 'New Chat';
}
