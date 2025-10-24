// app/spaces/chat/openUnifiedFromChat.ts
import { Lane } from '../../../lib/cortex/lane';
import { useUnifiedOverlayController } from '../../../hooks/useUnifiedOverlayController';

export type OverlayKind = 'todo' | 'note' | 'habit' | 'reflection';

export interface ChatConversionMeta {
  lane: Lane; // 'space_chat'
  spaceId: string | null; // the current space
  messageId?: string | null; // chat message being converted
  whyString?: string | null; // explanation/summarization snippet if any
  // Phase 10.7B: Initial values for prefill
  initialTitle?: string;
  initialNote?: string;
}

export interface OverlayInitial {
  title?: string;
  note?: string;
  // add others as your overlay supports (due_date, cadence, etc.)
}

// Map overlay kind to entity type
const kindToType: Record<OverlayKind, 'todo' | 'note' | 'habit'> = {
  todo: 'todo',
  note: 'note',
  habit: 'habit',
  reflection: 'note', // reflections are notes with journal subtype
};

export function openUnifiedFromChat(
  kind: OverlayKind,
  initial: OverlayInitial,
  meta: ChatConversionMeta,
  overlayController: ReturnType<typeof useUnifiedOverlayController>,
) {
  const entityType = kindToType[kind];

  // P0 Fix: Ensure proper mapping of title/note to initialTitle/initialNote
  overlayController.openCreate({
    type: entityType,
    spaceId: meta.spaceId,
    // NEW: Pass subtype for reflection notes
    subtype: kind === 'reflection' ? 'journal' : undefined,
    conversionMeta: {
      origin: 'space_chat',
      ai_placed: false,
      why_string: meta.whyString,
      source_message_id: meta.messageId,
      // Map overlay initial values to prefill fields
      initialTitle: initial.title || '',
      initialNote: initial.note || '',
    },
  });
}
