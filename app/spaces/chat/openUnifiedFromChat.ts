// app/spaces/chat/openUnifiedFromChat.ts
import { Lane } from '../../../lib/cortex/lane';
import { useUnifiedOverlayController } from '../../../hooks/useUnifiedOverlayController';
import type { CanonicalType, LogSubtype } from '../../../lib/types';

export type OverlayKind = 'todo' | 'note' | 'habit' | 'reflection';

/**
 * Map SaveableType (from detection) to OverlayKind.
 * Detection returns types like 'log-general', 'log-list', etc.
 * but overlay expects 'note', 'todo', 'habit', 'reflection'.
 */
export function saveableTypeToOverlayKind(saveableType: string): OverlayKind {
  switch (saveableType) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'log-general':
    case 'log-list':
    case 'log-idea':
    default:
      return 'note';
  }
}

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
  dueDate?: string | null;
  frequency?: string;
  frequencyValue?: number;
  tags?: string[];
  // add others as your overlay supports (due_date, cadence, etc.)
}

// Map overlay kind to entity type
const kindToType: Record<OverlayKind, CanonicalType> = {
  todo: 'todo',
  note: 'log',
  habit: 'habit',
  reflection: 'log',
};

const kindToLogSubtype: Partial<Record<OverlayKind, LogSubtype>> = {
  note: 'everything_else',
  reflection: 'journal',
};

export function openUnifiedFromChat(
  kind: OverlayKind,
  initial: OverlayInitial,
  meta: ChatConversionMeta,
  overlayController: ReturnType<typeof useUnifiedOverlayController>,
  options?: { suppressOverlayOpen?: boolean },
) {
  const entityType = kindToType[kind];
  const logSubtype = kindToLogSubtype[kind];

  // P0 Fix: Ensure proper mapping of title/note to initialTitle/initialNote
  overlayController.openCreate({
    type: entityType,
    spaceId: meta.spaceId,
    logSubtype: logSubtype,
    conversionMeta: {
      origin: 'space_chat',
      ai_placed: false,
      why_string: meta.whyString,
      source_message_id: meta.messageId,
      // Map overlay initial values to prefill fields
      initialTitle: initial.title || '',
      initialNote: initial.note || '',
      initialDueDate: initial.dueDate ?? null,
      initialFrequency: initial.frequency,
      initialFrequencyValue: initial.frequencyValue,
      initialTags: initial.tags || [],
    },
    suppressOverlayOpen: options?.suppressOverlayOpen,
  });
}
