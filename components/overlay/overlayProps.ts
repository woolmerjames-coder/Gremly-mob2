/**
 * What the add and edit overlay is given when it opens.
 */
import type { OverlaySavedPayload } from '../../lib/events/overlaySaved';
import type { CanonicalType, LogSubtype } from '../../lib/types';

export type UnifiedOverlayProps = {
  visible: boolean;
  mode: 'create' | 'edit' | 'view';
  initialEntity?: {
    type: CanonicalType | 'journal' | 'note' | 'person' | null;
    id?: string;
    logSubtype?: LogSubtype | null;
  };
  initialSpaceId?: string | null; // from scope
  conversionMeta?: {
    origin?: string;
    ai_placed?: boolean;
    why_string?: string | null;
    source_message_id?: string | null;
    // Phase 10.7B: Initial values for prefill
    initialTitle?: string;
    initialNote?: string;
    // Optional: prefill todo due date (ISO yyyy-mm-dd or full ISO)
    initialDueDate?: string | null;
    // Phase 10.7D: Initial tags for prefill
    initialTags?: string[];
    // Phase 10.7E: Initial list items for prefill
    initialListItems?: Array<{ id: string; text: string; checked: boolean }>;
    initialIsList?: boolean;
    // Phase 10.8: Habit frequency prefill from Space Chat
    initialFrequency?: string;
    initialFrequencyValue?: number;
    // When true and type is log, opens in preview mode
    fromChat?: boolean;
    // Sweep conversion: source note ID to archive after creating todo
    sourceNoteId?: string;
  };
  initialText?: string | null;
  initialLogPhotoUris?: string[]; // Photo Drop: initial photos for create-mode logs
  defaultDueToday?: boolean; // When true, todo defaults to due today (used by Now page)
  onClose: () => void;
  onSaved?: (result: OverlaySavedPayload) => void;
  onCommitmentsChanged?: () => void | Promise<void>;
};
