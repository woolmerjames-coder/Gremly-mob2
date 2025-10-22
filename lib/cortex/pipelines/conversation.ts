// lib/cortex/pipelines/conversation.ts
import { CortexContextBase } from '../lane';
import { cortexDecide, type DecideInput, type CortexContext } from '../cortexDecide';

const CATCHALL_COPY_RE = /saving to catch[- ]all/i;

/**
 * Space Chat conversation pipeline.
 * Step 4: implement chat-specific rules:
 * - Never auto-sort (auto → ask)
 * - No auto actions in chat
 * - Suppress catch-all copy
 * - Keep suggestions for inline chips
 */
export async function runConversationPipeline(input: DecideInput, ctx: CortexContext) {
  const raw = await cortexDecide(input, ctx);

  // Normalize for Space Chat UX
  const normalized = { ...raw };

  // Never auto-sort in chat
  if (normalized.mode === 'auto') {
    normalized.mode = 'ask';
  }
  // No auto actions in chat
  if (Array.isArray(normalized.actions) && normalized.actions.length > 0) {
    normalized.actions = [];
  }
  // Suppress catch-all copy in chat
  if (typeof normalized.explanation === 'string' && CATCHALL_COPY_RE.test(normalized.explanation)) {
    normalized.explanation = '';
  }

  // Lightweight telemetry (optional)
  if ((normalized as any).debug && typeof (normalized as any).debug === 'object') {
    (normalized as any).debug.lane = 'space_chat';
  }

  return normalized;
}
