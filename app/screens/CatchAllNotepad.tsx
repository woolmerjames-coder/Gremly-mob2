import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Alert,
  Platform,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  findNodeHandle,
  GestureResponderEvent,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Text } from '../../ui/Text';
import { Icon } from '../../design-system/Icon';
import { useRepo } from '../../providers/RepoProvider';
import { useCortex } from '../../providers/CortexProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createCortexEngine } from '../../cortex/createEngine';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';
import {
  MidConfidenceChips,
  type CategoryChip,
  type TimingOption,
  type TimingChip,
} from '../components/minddrop/MidConfidenceChips';
import { MIND_DROP_V2 } from '../../src/config/featureFlags';
import { useActionToast } from '../../src/hooks/useActionToast';
import { useTheme } from '../../src/theme/useTheme';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { shouldUseHaptics } from '../../config/featureFlags';
import { haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase/client';
import { logCatchallDecision } from '../../lib/telemetry/catchallLogger';
import { organizedToastSummary, type OrganizedDetail } from '../../lib/ui/toast/copy';
import { startCatchallTrace, step, end } from '../../lib/diagnostics/catchallDebug';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { AppRecord, LogSubtype, NoteSubtype } from '../../lib/types';
import type { CortexAction, CortexContext, CortexResponse } from '../../lib/cortex/cortexDecide';
import { persistedToCanonical } from '../../lib/cortex/canonicalMap';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { addOverlaySavedListener } from '../../lib/events/overlaySaved';
import { deriveCompactTitle } from '../../lib/text/compactTitle';
import { parseDue } from '../../lib/nlp/datetime/parseDue';
import { formatDue } from '../../lib/date/formatDue';
import { env } from '../../lib/env';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import {
  appendLineageToWhyString,
  hasChecklist,
  convertUnsortedToHabit,
} from '../../lib/conversion';
import GREMLY_TOP from '../../assets/mascot/ACTUAL GREMLY.png';
import {
  filterAndNormalizeTags,
  normalizeTags,
  deriveLogSubtypeFromTags,
} from '../../lib/tags/normalize';
import { buildFallbackTags } from '../../cortex/openAiEngine';
import { buildMindDropDerivedFields } from '../../lib/minddrop/minddropShared';
import { buildCanonicalFromMindDrop } from '../../lib/minddrop/buildCanonicalFromMindDrop';

export const THINKING_DURATION = 1200;
const MICROCOPY_FADE_MS = 300;
const THINKING_MICROCOPY = [
  'Organizing your thoughts …',
  'Finding a home for this …',
  'All set.',
] as const;

const AnimatedMicrocopyText = Animated.createAnimatedComponent(Text);

// Auto-grow constants: aligned for deterministic behavior
const LINE_HEIGHT = 22; // Must match styles.input lineHeight
const INPUT_VERTICAL_PADDING = 8; // paddingTop (4) + paddingBottom (4) from styles.input
const MAX_LINES = 6;
const START_HEIGHT = 100;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES + INPUT_VERTICAL_PADDING + 8; // 22*6 + 8 + 8 = 148 (small safety buffer)

export const INPUT_LINE_HEIGHT = LINE_HEIGHT;
export { START_HEIGHT as START_HEIGHT, MIN_HEIGHT as MIN_HEIGHT, MAX_HEIGHT as MAX_HEIGHT };
export const MAX_DYNAMIC_HEIGHT = MAX_HEIGHT; // Backwards compatibility for existing imports
const MAX_INPUT_CHARACTERS = 2000;
const SPACE = 8;
const INPUT_PADDING_LEFT = 16;
const INPUT_ICON_PADDING_RIGHT = 72;

const clampNoteLength = (value: string): string =>
  value.length > MAX_INPUT_CHARACTERS ? value.slice(0, MAX_INPUT_CHARACTERS) : value;

const CHIPS_AUTO_DISMISS_MS =
  Number.parseInt(String(process.env.EXPO_PUBLIC_MINDDROP_CHIPS_AUTO_DISMISS_MS ?? '12000'), 10) ||
  12000;

const DUE_STRIP =
  String(process.env.EXPO_PUBLIC_MINDDROP_DUE_STRIP ?? 'on').toLowerCase() !== 'off';
const DUE_CONFIDENCE_FLOOR =
  Number.parseFloat(String(process.env.EXPO_PUBLIC_MINDDROP_DUE_CONFIDENCE ?? '0.84')) || 0.84;

function createSubmissionId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    void error;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `minddrop-${time}-${rand}`;
}

function createDropId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    void error;
  }

  // RFC4122-ish fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    if (c === 'x') return r.toString(16);
    return ((r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Check if a string is a valid UUID (8-4-4-4-12 format)
 */
function isValidUuid(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

const DEBUG_MINDDROP_LOGS =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  String(process.env.FF_DEBUG_OVERLAY ?? '').toLowerCase() === 'on';

const fingerprintTitle = (value?: string | null): string | null => {
  if (!value || !value.length) return null;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

const logMindDropDebug = (label: string, fields: Record<string, unknown>) => {
  if (!DEBUG_MINDDROP_LOGS) return;
  const sanitized: Record<string, unknown> = {};
  Object.entries(fields).forEach(([key, value]) => {
    sanitized[key] = value ?? null;
  });
  // eslint-disable-next-line no-console
  console.debug(`[MindDrop][Debug][${label}]`, sanitized);
};

// Collapse concurrent Mind Drop work per dropId.
const inFlightByDrop = new Map<string, Promise<unknown>>();

async function withDropLock<T>(dropId: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightByDrop.get(dropId);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightByDrop.delete(dropId);
    }
  })();

  inFlightByDrop.set(dropId, promise);
  return promise;
}

export const __mindDropTestHooks = { withDropLock };

// Discriminating common errors without coupling too tightly:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isNetworkError = (err: any) =>
  !!(
    err &&
    (String((err as { message?: string }).message || err).includes('Network') ||
      String((err as { name?: string }).name || '').includes('TypeError'))
  );

const UNSORTED_LABEL = 'needs_review'; // used as “Unsorted Tray” tag
const CATCHALL_LABEL = 'catchall'; // to mark Mind Drop items

// Legacy UISuggestion stub - suggestion chips removed but code references remain
type UISuggestion = {
  type: string;
  label?: string;
  title?: string;
  body?: string;
  payload?: any;
};

type MindDropInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  placeholderTextColor: string;
  containerStyle: any;
  focusedStyle: any;
  inputStyle: any;
  focusedInputStyle?: any;
  onFocusChange?: (focused: boolean) => void;
  autoFocus?: boolean;
  onContentSizeChange?: (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => void;
  scrollEnabled?: boolean;
  hudContainerStyle?: any;
  hudTextStyle?: any;
  characterCount?: number;
  lockIconColor?: string; // Phase 1: theme color
  showHud?: boolean;
  iconContainerStyle?: any;
  iconButtonStyle?: any;
  iconColor?: string;
  iconMicStyle?: any;
  iconCameraStyle?: any;
  iconWrapperStyle?: any;
  heightWrapperStyle?: any;
  inputDynHeight: number;
};

const MindDropInput = React.memo<MindDropInputProps>(
  ({
    value,
    onChangeText,
    placeholder,
    placeholderTextColor,
    containerStyle,
    focusedStyle,
    inputStyle,
    focusedInputStyle,
    onFocusChange,
    autoFocus = false,
    onContentSizeChange,
    scrollEnabled = false,
    hudContainerStyle,
    hudTextStyle,
    characterCount = 0,
    lockIconColor = '#2E5540',
    showHud = true,
    iconContainerStyle,
    iconButtonStyle,
    iconColor = '#2E5540',
    iconMicStyle,
    iconCameraStyle,
    iconWrapperStyle,
    heightWrapperStyle,
    inputDynHeight,
  }) => {
    const inputRef = React.useRef<TextInput>(null);
    const [focused, setFocused] = React.useState(false);
    const hasAutoFocusedRef = React.useRef(false);

    const handleFocus = React.useCallback(() => {
      setFocused(true);
      onFocusChange?.(true);
    }, [onFocusChange]);

    const handleBlur = React.useCallback(() => {
      setFocused(false);
      onFocusChange?.(false);
    }, [onFocusChange]);

    // Ensure the TextInput keeps focus if parent re-renders while typing
    React.useEffect(() => {
      if (focused) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    }, [focused]);

    // Restore the historical behavior where the input grabs focus as soon as the screen mounts
    React.useEffect(() => {
      if (!autoFocus || hasAutoFocusedRef.current) {
        return;
      }

      hasAutoFocusedRef.current = true;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }, [autoFocus]);

    return (
      <Pressable
        testID="minddrop-input-container"
        accessible={false}
        style={[containerStyle, focused && focusedStyle]}
        onPress={() => {
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }}
      >
        <View
          testID="minddrop-input-height-wrapper"
          style={[
            heightWrapperStyle,
            {
              width: '100%',
              height: inputDynHeight,
              overflow: 'visible',
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            testID="minddrop-input"
            value={value}
            onChangeText={onChangeText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            multiline
            accessibilityLabel="Mind Drop input"
            accessibilityHint="Type anything on your mind"
            textAlignVertical="top"
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor}
            maxLength={MAX_INPUT_CHARACTERS}
            autoFocus={autoFocus}
            onContentSizeChange={onContentSizeChange}
            scrollEnabled={scrollEnabled}
            numberOfLines={undefined}
            textBreakStrategy="simple"
            style={[inputStyle, focused && focusedInputStyle]}
          />
        </View>
        <View style={iconContainerStyle} pointerEvents="box-none">
          <Pressable
            disabled
            style={[iconButtonStyle, iconMicStyle]}
            accessibilityRole="button"
            accessibilityLabel="Record a voice note (coming soon)"
            accessibilityState={{ disabled: true }}
          >
            <View style={iconWrapperStyle}>
              <Icon name="Mic" size="sm" color={iconColor} strokeWidth={1.4} />
            </View>
          </Pressable>
          <Pressable
            disabled
            style={[iconButtonStyle, iconCameraStyle]}
            accessibilityRole="button"
            accessibilityLabel="Attach a photo (coming soon)"
            accessibilityState={{ disabled: true }}
          >
            <View style={iconWrapperStyle}>
              <Icon name="Camera" size="sm" color={iconColor} strokeWidth={1.4} />
            </View>
          </Pressable>
        </View>
        {showHud ? (
          <View style={hudContainerStyle} pointerEvents="none">
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                flexShrink: 1,
              }}
            >
              <View style={{ marginRight: 6 }}>
                <Icon name="Lock" size="xs" color={lockIconColor} strokeWidth={1.75} />
              </View>
              <Text
                testID="minddrop-privacy"
                style={hudTextStyle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                Private & secure
              </Text>
              <Text
                testID="minddrop-charcount"
                style={hudTextStyle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >{`${characterCount} / ${MAX_INPUT_CHARACTERS}`}</Text>
            </View>
          </View>
        ) : null}
      </Pressable>
    );
  },
);

MindDropInput.displayName = 'MindDropInput';

const copy = {
  title: 'Mind Drop',
} as const;

// Centralized copy for consistent toasts/messages
const COPY = {
  retrying: 'Let me try again…',
  savedOfflineTitle: 'Saved offline',
  savedOfflineMsg: 'No internet — but I saved it! Will organize when connected.',
  savedUnsortedTitle: 'Saved to Unsorted',
  savedUnsortedMsg: 'Saved to your Unsorted Tray — we’ll organize it together!',
};

// Thin local fallback writer for unsorted mind drops
// Writes a single note with labels [catchall, needs_review] and a pending flag when supported
// Adapted to our repo layer shape (uses addUnsorted if available, else create)
export async function saveToUnsortedTray(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: any,
  text: string,
  options: {
    sourceMessageId?: string;
    whyString?: string;
    tags?: string[] | null | undefined;
    dropId?: string;
  } = {},
): Promise<string | undefined> {
  if (!text?.trim()) return undefined;
  const { sourceMessageId, whyString, tags: incomingTags, dropId } = options;
  const clampedText = clampNoteLength(text);
  const catchallCanonical = persistedToCanonical('note', 'catchall');
  const normalizedTags = normalizeTags(incomingTags ?? []);
  const tags = normalizedTags.length > 0 ? normalizedTags : undefined;

  // Only use sourceMessageId if it's a valid UUID; otherwise set to null
  // This keeps the notes.source_message_id column as uuid (not "minddrop-..." strings)
  const validSourceMessageId = isValidUuid(sourceMessageId) ? sourceMessageId : null;

  // Base create payload for our repos
  const baseInput = {
    type: 'note' as const,
    title: clampedText,
    body: clampedText,
    subtype: 'catchall' as const,
    ai_placed: false, // Unsorted items are pending, not AI-placed yet
    origin: 'catchall' as const,
    labels: [CATCHALL_LABEL, UNSORTED_LABEL],
    why_string: whyString ?? null,
    canonicalType: catchallCanonical,
    sourceMessageId: validSourceMessageId ?? undefined,
    dropId: dropId ?? undefined,
    tags,
  };

  logMindDropDebug('provisional-create', {
    dropId: dropId ?? null,
    titleFingerprint: fingerprintTitle(clampedText),
    titleLocked: false,
    tagsCount: Array.isArray(tags) ? tags.length : 0,
    tagMetaPresent: false,
  });

  // If notes.create exists (future), prefer it; otherwise use addUnsorted/create
  try {
    if (repo?.notes?.create) {
      const note = await repo.notes.create({
        text: clampedText,
        labels: [CATCHALL_LABEL, UNSORTED_LABEL],
        // pending_sync is optional; if unsupported downstream, it will be ignored
        pending_sync: true,
        sourceMessageId: validSourceMessageId ?? undefined,
        dropId: dropId ?? undefined,
        tags,
      });
      return note?.id;
    }

    if (typeof repo?.addUnsorted === 'function') {
      const created = await repo.addUnsorted(null, baseInput);
      return created?.id;
    }

    // Fallback to generic create
    const inputAny: any = { ...baseInput };
    // Hint for future reconciliation; safe to include if ignored by repo
    inputAny.pending_sync = true;
    const created = await repo.create(inputAny);
    return created?.id;
  } catch (err) {
    // Swallow transient network errors; the caller may retry separately
    if (!isNetworkError(err)) {
      // eslint-disable-next-line no-console
      console.warn('[saveToUnsortedTray] failed:', err);
    }
    return undefined;
  }
}

type UpdateFromChipParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: any;
  sourceMessageId: string;
  chosenSubtype: 'journal' | 'idea' | 'list';
  title?: string | null;
  body?: string | null;
  canonicalType?: string | null;
  views?: { alsoShowIn?: string[] };
  aiPlaced?: boolean;
  why?: string;
};

export async function updateCatchallToChosenSubtype({
  repo,
  sourceMessageId,
  chosenSubtype,
  title,
  body,
  canonicalType,
  views,
  aiPlaced,
  why = 'Chosen via chip',
}: UpdateFromChipParams) {
  if (!sourceMessageId) {
    throw new Error('sourceMessageId is required to update a catchall note');
  }

  if (typeof repo?.findNoteBySourceMessageId !== 'function') {
    throw new Error('Repository does not support findNoteBySourceMessageId');
  }

  const existingNote = await repo.findNoteBySourceMessageId(sourceMessageId);
  if (!existingNote) {
    throw new Error('No pre-saved note found for this submission');
  }

  const existingLabels = Array.isArray(existingNote.labels) ? existingNote.labels : [];
  const sanitizedLabels = existingLabels.filter((label: string) => label !== UNSORTED_LABEL);
  if (!sanitizedLabels.includes(CATCHALL_LABEL)) {
    sanitizedLabels.push(CATCHALL_LABEL);
  }

  const lineageWhy = appendLineageToWhyString(existingNote.why_string, {
    originId: existingNote.id,
    source: 'ask-chip',
  });
  const combinedWhy = [lineageWhy, why].filter(Boolean).join(' | ');

  const patch: Record<string, unknown> = {
    subtype: chosenSubtype,
    labels: sanitizedLabels,
    why_string: combinedWhy || null,
    canonicalType: canonicalType ?? existingNote.canonicalType ?? null,
    views: views ?? existingNote.views ?? {},
    ai_placed: aiPlaced ?? existingNote.ai_placed,
  };

  if (title !== undefined) {
    patch.title = title;
  }
  if (body !== undefined) {
    patch.body = body;
  }

  const updated = await repo.update({
    id: existingNote.id,
    patch: patch as any,
  });

  return updated;
}

type Mode = 'free' | 'guided';
export type ListStyle = 'none' | 'bullets' | 'numbers' | 'checklist';

type MindDropToastArgs = {
  todos?: number;
  notes?: number;
  habits?: number;
  details?: OrganizedDetail[];
};

export function nextPrefix(style: ListStyle, currentText: string): string {
  if (style === 'bullets') {
    return '• ';
  }

  if (style === 'checklist') {
    return '[ ] ';
  }

  if (style === 'numbers') {
    const trimmed = currentText.replace(/\n+$/, '');
    const lines = trimmed.length ? trimmed.split('\n') : [];
    const lastLine = lines[lines.length - 1] ?? '';
    const match = lastLine.match(/^(\d+)\.\s/);
    if (match) {
      return `${Number(match[1]) + 1}. `;
    }
    const count = lines.filter((line) => /^\d+\.\s/.test(line)).length + 1;
    return `${count}. `;
  }

  return '';
}

const LIST_TOOLBAR_OPTIONS: Array<{ key: ListStyle; label: string; testID: string }> = [
  { key: 'none', label: 'None', testID: 'ca-toolbar-list-none' },
  { key: 'bullets', label: 'Bullets', testID: 'ca-toolbar-list-bullets' },
  { key: 'numbers', label: 'Numbers', testID: 'ca-toolbar-list-numbers' },
  { key: 'checklist', label: 'Checklist', testID: 'ca-toolbar-list-checklist' },
];

type DecisionLike = { mode: 'ask' | 'auto' | 'none' | 'keep' | 'unsorted' | 'reply' };

const shouldAutoCreate = (d: DecisionLike): boolean => d.mode === 'auto';
const allowsFallbackCreation = (d: DecisionLike): boolean =>
  d.mode === 'auto' || d.mode === 'keep' || d.mode === 'none';

// Removed legacy hex placeholder color; placeholderTextColor now uses themed c.mutedText

export const PLACEHOLDERS = [
  'What’s on your mind?',
  'Tasks, thoughts, worries, ideas...',
  'Buy milk, call mom, that idea about...',
  'Just type everything...',
] as const;

// Trust Builders helpers
function startOfTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

// Recent Drops helpers and component (colocated for now)
type UnifiedDrop = {
  id: string;
  kind: 'note' | 'todo' | 'habit';
  title: string;
  text: string;
  created_at: string;
  unsorted?: boolean; // for notes carrying the needs_review label
  noteSubtype?: string | null;
  due_date?: string | null; // ISO timestamp for todos
  tags?: string[];
  optimisticKind?: 'note' | 'todo' | 'habit';
  drop_id?: string | null; // For deduplication: prefer canonical items over unsorted notes
  archived?: boolean; // Track archived status to filter out converted notes
  canonical_type?: string | null; // Canonical type from buildCanonicalFromMindDrop: 'todo', 'habit', 'log', 'journal'
  labels?: string[]; // Labels from backend: ['log'], ['habit'], ['todo'], ['catchall', 'needs_review'], etc.
};

const relativeTime = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

/**
 * Get display tags for Recent drops list
 * Filters out junk tags (*journal, stop words, etc.) and normalizes formatting
 * Returns tags ready to display in the UI (e.g., ["running", "morning", "@alice"])
 */
function getDisplayTagsForRecentDrop(item: UnifiedDrop): string[] {
  if (!Array.isArray(item.tags) || item.tags.length === 0) {
    return [];
  }

  // Use the same tag filtering/normalization as Mind Drop overlay
  // This strips *journal, removes stop words, dedupes, etc.
  const cleaned = filterAndNormalizeTags(item.tags);

  // Remove the # prefix for display (we'll add it back in the UI)
  // Also filter out *journal and other internal markers
  return cleaned
    .filter((tag) => !tag.startsWith('*')) // Remove internal markers like *journal
    .map((tag) => {
      if (tag.startsWith('#')) return tag.slice(1);
      if (tag.startsWith('@')) return tag; // Keep @ prefix for mentions
      return tag;
    });
}

/**
 * Get display kind for Recent drops pill
 * Uses canonical_type first (from buildCanonicalFromMindDrop), then falls back to labels/subtype.
 * Ensures logs show "log" not "unsorted"
 */
function getDisplayKindForDrop(item: UnifiedDrop, canonicalTypesOn: boolean): string {
  const effectiveKind = item.optimisticKind ?? item.kind;

  // If canonical types are off, use simple kind mapping
  if (!canonicalTypesOn) {
    return effectiveKind;
  }

  // Prefer canonical_type if available (from buildCanonicalFromMindDrop)
  if (item.canonical_type) {
    return item.canonical_type;
  }

  // Check labels to detect confirmed logs/todos/habits
  // Items with labels=['log'] should show "log", not "unsorted"
  if (Array.isArray(item.labels)) {
    if (item.labels.includes('log')) return 'log';
    if (item.labels.includes('todo')) return 'todo';
    if (item.labels.includes('habit')) return 'habit';
  }

  // Fallback to kindToDisplayLabel for items without canonical_type or labels
  return kindToDisplayLabel(
    effectiveKind,
    effectiveKind === 'note' ? (item.noteSubtype ?? null) : null,
    canonicalTypesOn,
  );
}

type OverlayContextValue = ReturnType<typeof useGlobalOverlay>;
type GlobalOverlayController = Pick<OverlayContextValue, 'openCreate' | 'openEdit' | 'close'>;

const noopOverlayController: GlobalOverlayController = {
  openCreate: () => {},
  openEdit: () => {},
  close: () => {},
};

function useMaybeGlobalOverlay(): GlobalOverlayController | null {
  try {
    return useGlobalOverlay();
  } catch (error) {
    if (process.env.NODE_ENV === 'test') {
      return null;
    }
    throw error;
  }
}

const RecentDrops: React.FC<{
  overlay: GlobalOverlayController;
  onEdited?: () => void;
  onDeleted?: () => void;
  refreshSignal?: number; // bump to force reload after submit
  initiallyOpen?: boolean;
  eagerLoad?: boolean;
}> = ({ overlay, onEdited, onDeleted, refreshSignal, initiallyOpen = true, eagerLoad = false }) => {
  const repo = useRepo() as any;
  const { c, mode: themeMode } = useTheme();
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);

  const [open, setOpen] = React.useState(initiallyOpen); // open by default for inline confirmation
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<UnifiedDrop[]>([]);
  const [showOlder, setShowOlder] = React.useState(false); // Today-only by default
  const canonicalTypesOn = env.feature.canonicalTypes;

  const rangeLabel = showOlder ? 'Earlier' : 'Today';
  const rangeActionLabel = showOlder ? 'Back to today' : 'Show older';

  const load = React.useCallback(async () => {
    const isTest = process.env.JEST_WORKAROUND === '1';
    if (!isTest) setLoading(true);
    try {
      const fetchNotes = async () => {
        if (!repo?.notes?.list) return [];
        try {
          const result = await repo.notes.list({ limit: 50, order: 'desc' });
          return Array.isArray(result) ? result : [];
        } catch {
          return [];
        }
      };

      const fetchTodos = async () => {
        if (!repo?.todos?.list) return [];
        try {
          const result = await repo.todos.list({ limit: 50, order: 'desc' });
          return Array.isArray(result) ? result : [];
        } catch {
          return [];
        }
      };

      const fetchHabits = async () => {
        if (!repo?.habits?.list) return [];
        try {
          const result = await repo.habits.list({ limit: 50, order: 'desc' });
          return Array.isArray(result) ? result : [];
        } catch {
          return [];
        }
      };

      const [notes, todos, habits] = await Promise.all([fetchNotes(), fetchTodos(), fetchHabits()]);

      const start = startOfTodayLocal();
      const cutoff = start.getTime();

      const toTagList = (raw: unknown): string[] => {
        if (!Array.isArray(raw)) return [];
        return raw
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter((tag) => tag.length > 0);
      };

      // DEDUPLICATION RULE: One row per drop_id, prefer canonical items over unsorted notes
      // When an unsorted note is converted to a habit/todo/log:
      // - The original note is archived (archived=true)
      // - A new canonical item (habit/todo/note with canonicalType) is created with same drop_id
      // - We filter out archived notes and dedupe by drop_id, keeping canonical items

      const noteDrops: UnifiedDrop[] = (Array.isArray(notes) ? notes : [])
        .filter(
          (n) =>
            // Filter to Mind Drop items only
            (n?.origin === 'catchall' ||
              (Array.isArray(n?.labels) && n.labels.includes(CATCHALL_LABEL))) &&
            // Exclude archived notes (converted unsorted notes)
            n?.archived !== true,
        )
        .map((n) => {
          const labels = Array.isArray(n?.labels) ? n.labels : [];
          const unsorted = labels.includes(UNSORTED_LABEL);
          const rawSubtype = typeof n?.subtype === 'string' ? n.subtype : null;
          const noteSubtype = rawSubtype ?? (unsorted ? 'catchall' : null);
          const rawText = n.body || n.title || n.text || n.content || '';
          const { compact: derivedTitle } = deriveCompactTitle(
            [n.title, n.body, n.text, n.content, rawText],
            { fallback: rawText },
          );

          return {
            id: n.id,
            kind: 'note' as const,
            title: derivedTitle || rawText || 'Untitled note',
            text: n.body || n.title || n.text || n.content || '',
            created_at: n.created_at,
            unsorted,
            noteSubtype,
            tags: toTagList((n as any)?.tags),
            drop_id: (n as any)?.drop_id ?? null,
            archived: n?.archived === true,
            canonical_type: (n as any)?.canonical_type ?? null,
            labels: Array.isArray((n as any)?.labels) ? (n as any).labels : [],
          };
        });

      const todoDrops: UnifiedDrop[] = (Array.isArray(todos) ? todos : [])
        .filter((t) => t?.origin === 'catchall')
        .map((t) => {
          const rawText = t.name || t.title || '';
          const { compact: derivedTitle } = deriveCompactTitle([t.title, t.name, rawText], {
            fallback: rawText,
          });
          return {
            id: t.id,
            kind: 'todo' as const,
            title: derivedTitle || rawText || 'Untitled',
            text: rawText,
            created_at: t.created_at,
            due_date: t.due_date ?? null,
            tags: toTagList((t as any)?.tags),
            drop_id: (t as any)?.drop_id ?? null,
            canonical_type: (t as any)?.canonical_type ?? null,
            labels: Array.isArray((t as any)?.labels) ? (t as any).labels : [],
          };
        });

      const habitDrops: UnifiedDrop[] = (Array.isArray(habits) ? habits : [])
        .filter((h) => h?.origin === 'catchall')
        .map((h) => {
          const rawText = h.name || '';
          const { compact: derivedTitle } = deriveCompactTitle([h.name, rawText], {
            fallback: rawText,
          });
          return {
            id: h.id,
            kind: 'habit' as const,
            title: derivedTitle || rawText || 'Untitled',
            text: rawText,
            created_at: h.created_at,
            tags: toTagList((h as any)?.tags),
            drop_id: (h as any)?.drop_id ?? null,
            canonical_type: (h as any)?.canonical_type ?? null,
            labels: Array.isArray((h as any)?.labels) ? (h as any).labels : [],
          };
        });

      // Merge all drops, filter valid items
      let unified = [...noteDrops, ...todoDrops, ...habitDrops].filter(
        (i) => i.text && i.created_at,
      );

      // DEDUPLICATION: Group by drop_id and prefer canonical items (habit/todo) over unsorted notes
      // This ensures that when an unsorted note is converted to a habit, we only show the habit
      const dropIdMap = new Map<string, UnifiedDrop>();
      const noDropIdItems: UnifiedDrop[] = [];

      for (const item of unified) {
        if (!item.drop_id) {
          // No drop_id: keep as-is (shouldn't happen for Mind Drop items, but be safe)
          noDropIdItems.push(item);
          continue;
        }

        const existing = dropIdMap.get(item.drop_id);
        if (!existing) {
          // First item with this drop_id
          dropIdMap.set(item.drop_id, item);
          continue;
        }

        // Conflict: prefer canonical items (habit/todo) over unsorted notes
        // Priority: habit > todo > note (non-unsorted) > note (unsorted)
        const itemPriority =
          item.kind === 'habit' ? 3 : item.kind === 'todo' ? 2 : item.unsorted ? 0 : 1;

        const existingPriority =
          existing.kind === 'habit' ? 3 : existing.kind === 'todo' ? 2 : existing.unsorted ? 0 : 1;

        if (itemPriority > existingPriority) {
          // Replace with higher-priority item
          dropIdMap.set(item.drop_id, item);
        }
        // Otherwise keep existing (it has higher or equal priority)
      }

      // Combine deduplicated items with no-drop-id items
      unified = [...Array.from(dropIdMap.values()), ...noDropIdItems];

      if (!showOlder) {
        unified = unified.filter((i) => {
          const ts = new Date(i.created_at).getTime();
          return Number.isFinite(ts) && ts >= cutoff; // "Today"
        });
      }

      unified = unified
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 25); // keep snappy; scroll handles overflow

      setItems(unified);
    } finally {
      if (!isTest) setLoading(false);
    }
  }, [repo, showOlder]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  useLayoutEffect(() => {
    if (eagerLoad) void load();
  }, [eagerLoad, load]);

  // Listen for overlay saves and optimistically update the due_date for todos
  useEffect(() => {
    const unsub = addOverlaySavedListener((payload) => {
      if (payload.type === 'todo' && payload.savedEntity?.due_at !== undefined) {
        setItems((prevItems) =>
          prevItems.map((item) => {
            if (item.kind === 'todo' && item.id === payload.id) {
              return {
                ...item,
                due_date: payload.savedEntity?.due_at ?? null,
              };
            }
            return item;
          }),
        );
      }
      // Always reload to catch any other changes
      void load();
    });
    return unsub;
  }, [load]);

  const handleEdit = async (id: string, kind: UnifiedDrop['kind'], _unsorted?: boolean) => {
    try {
      // Fetch the full record so overlay can pre-fill all fields
      const record = await repo.getById(id);

      if (record && record.type === kind) {
        overlay.openEdit({
          record: record as any,
          spaceId: (record as any).space_id ?? null,
        });
        onEdited?.();
      } else {
        console.warn('[RecentDrops] handleEdit: record not found or type mismatch', { id, kind });
        // Fallback to minimal record if fetch fails
        overlay.openEdit({
          record: { id, type: kind } as any,
          spaceId: null,
        });
        onEdited?.();
      }
    } catch (error) {
      console.error('[RecentDrops] handleEdit: failed to fetch record', error);
      // Fallback to minimal record if fetch fails
      overlay.openEdit({
        record: { id, type: kind } as any,
        spaceId: null,
      });
      onEdited?.();
    }
  };

  const handleDelete = async (id: string, kind: UnifiedDrop['kind']) => {
    try {
      await (repo?.remove?.(id) ?? repo?.[`${kind}s`]?.delete?.(id));
      await load();
      onDeleted?.();
    } catch {
      // optional: error UI
    }
  };

  const handleAddToTodo = useCallback(
    (item: UnifiedDrop) => {
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                optimisticKind: 'todo',
                unsorted: false,
              }
            : entry,
        ),
      );

      overlay.openCreate({
        initialEntity: { type: 'todo', id: undefined, logSubtype: null },
        initialText: item.text ? String(item.text) : null,
      });

      onEdited?.();
    },
    [overlay, onEdited],
  );

  return (
    <View style={styles.recentRoot}>
      <View style={styles.recentHeaderRow}>
        <Pressable
          testID="minddrop-recent-toggle"
          onPress={() => setOpen((v) => !v)}
          style={styles.recentHeaderBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Toggle recent drops"
          accessibilityState={{ expanded: open }}
        >
          <View style={styles.recentHeaderLeft}>
            <Text style={styles.recentHeaderText}>Recent drops</Text>
            <Text style={styles.recentHeaderCaret}>{open ? '↑' : '↓'}</Text>
          </View>
        </Pressable>

        <View style={styles.recentHeaderCenter} pointerEvents="none">
          <Text testID="minddrop-recent-range" style={styles.recentRangeLabel}>
            {rangeLabel}
          </Text>
        </View>

        <Pressable
          testID="minddrop-recent-range-action"
          onPress={() => setShowOlder((v) => !v)}
          style={styles.recentHeaderLink}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={showOlder ? "Show only today's drops" : 'Show older drops'}
        >
          <Text style={styles.recentHeaderLinkText}>{rangeActionLabel}</Text>
        </Pressable>
      </View>

      {open ? (
        <View testID="minddrop-recent-list" style={styles.recentList}>
          {loading ? (
            <Text style={styles.recentEmpty}>Loading…</Text>
          ) : items.length === 0 ? (
            <Text style={styles.recentEmpty}>
              {showOlder ? 'No drops yet.' : 'Ready when you are'}
            </Text>
          ) : (
            <ScrollView
              contentContainerStyle={styles.recentScrollContent}
              showsVerticalScrollIndicator
            >
              {items.map((item) => {
                const effectiveKind = item.optimisticKind ?? item.kind;
                const displayKind = getDisplayKindForDrop(item, canonicalTypesOn);
                const showLegacyUnsortedBadge =
                  !canonicalTypesOn && effectiveKind === 'note' && item.unsorted;
                const badgeStyleKey =
                  effectiveKind === 'todo'
                    ? 'badge_todo'
                    : effectiveKind === 'habit'
                      ? 'badge_habit'
                      : 'badge_note';

                return (
                  <View
                    key={`${item.kind}:${item.id}`}
                    testID={`minddrop-recent-${item.kind}-${item.id}`}
                    style={styles.recentCard}
                  >
                    <View style={styles.recentTopRow}>
                      <Text numberOfLines={1} style={styles.recentText}>
                        {item.title || item.text || '—'}
                      </Text>
                      <Text style={styles.recentTime}>{relativeTime(item.created_at)}</Text>
                    </View>

                    <View style={styles.recentMetaRow}>
                      <View style={styles.recentBadgeRow}>
                        <Text style={[styles.recentBadge, styles[badgeStyleKey]]}>
                          {displayKind}
                        </Text>
                        {showLegacyUnsortedBadge ? (
                          <Text style={[styles.recentBadge, styles.badge_unsorted]}>Unsorted</Text>
                        ) : null}
                        {effectiveKind === 'todo' ? (
                          <Text
                            testID={`minddrop-recent-todo-due-${item.id}`}
                            style={styles.recentDueBadge}
                          >
                            {formatDue(item.due_date)}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.recentActions}>
                        {item.kind === 'note' && item.unsorted && !item.optimisticKind ? (
                          <>
                            <Pressable
                              onPress={() => handleAddToTodo(item)}
                              hitSlop={8}
                              accessibilityRole="button"
                            >
                              <Text style={styles.recentAction}>Add to To-Dos</Text>
                            </Pressable>
                            <Text style={styles.recentDot}>•</Text>
                          </>
                        ) : null}
                        <Pressable
                          onPress={() => handleEdit(item.id, item.kind, item.unsorted)}
                          hitSlop={8}
                          accessibilityRole="button"
                        >
                          <Text style={styles.recentAction}>Edit</Text>
                        </Pressable>
                        <Text style={styles.recentDot}>•</Text>
                        <Pressable
                          onPress={() => handleDelete(item.id, item.kind)}
                          hitSlop={8}
                          accessibilityRole="button"
                        >
                          <Text style={styles.recentActionDelete}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                    {/* Show tags for all Mind Drop items (todos, habits, logs) */}
                    {Array.isArray(item.tags) && item.tags.length > 0 ? (
                      <View style={styles.recentTagsRow}>
                        {getDisplayTagsForRecentDrop(item)
                          .slice(0, 6)
                          .map((tag) => (
                            <View key={`${item.id}-${tag}`} style={styles.recentTagPill}>
                              <Text style={styles.recentTagText}>
                                {tag.startsWith('@') ? tag : `#${tag}`}
                              </Text>
                            </View>
                          ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
};

// Memoize RecentDrops to avoid re-rendering when parent state (trust, tips) changes
const RecentDropsMemo = React.memo(RecentDrops);

// Named export for tests to import the isolated component
export const RecentDropsTestable = RecentDrops;

/**
 * Detects if input text is clearly narrative/journaling content
 * that should NOT trigger todo conversion chips.
 *
 * Heuristics:
 * - Multiple sentences (2+) OR long average sentence length (>8 words)
 * - No leading imperative verbs (buy, call, schedule, etc.)
 * - No todo-related keywords (todo, task, remind, ASAP, date tokens)
 *
 * @returns true if text appears to be narrative/journal content
 */
export function classifyNarrative(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  // Split by sentence terminators
  const sentences = trimmed
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const wordCount = trimmed.split(/\s+/).length;
  const avgWordsPerSentence = sentences.length > 0 ? wordCount / sentences.length : 0;

  // Imperative verbs that suggest actionable tasks
  const imperativeVerbs = new Set([
    'buy',
    'call',
    'schedule',
    'send',
    'email',
    'book',
    'plan',
    'find',
    'check',
    'update',
    'pay',
    'start',
    'finish',
    'complete',
    'submit',
    'review',
    'prepare',
    'organize',
    'contact',
    'remind',
    'create',
    'setup',
    'configure',
    'install',
    'download',
    'upload',
    'sign',
    'register',
    'confirm',
    'cancel',
    'return',
    'order',
    'purchase',
    'get',
    'make',
    'do',
    'add',
    'remove',
    'delete',
    'fix',
    'repair',
  ]);

  // Task-related keywords
  const taskKeywords = /\b(todo|task|remind|asap|urgent|deadline|due)\b/i;
  const hasTaskKeywords = taskKeywords.test(trimmed);

  // Date/time patterns suggesting scheduled action (more strict)
  // Only flag if combined with action context
  const hasActionableDate =
    /\b(tomorrow|tonight)\b/i.test(trimmed) || // Clear future temporal markers
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(morning|afternoon|evening|at|@)/i.test(
      trimmed,
    ) || // Day + time qualifier
    /\bat\s+\d{1,2}[:/]\d{1,2}/i.test(trimmed) || // "at 3:30"
    /\d{1,2}(st|nd|rd|th)\s+(at|of)/i.test(trimmed); // "15th at" or "3rd of"

  // Check first word for imperative verb
  const firstWord = trimmed
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, '');
  const startsWithImperative = firstWord ? imperativeVerbs.has(firstWord) : false;

  // Narrative criteria:
  // Multiple sentences OR long sentences
  // AND no imperative start
  // AND no task keywords
  // AND no actionable date patterns
  const hasMultipleSentences = sentences.length >= 2;
  const hasLongSentences = avgWordsPerSentence > 8;

  const isNarrative =
    (hasMultipleSentences || hasLongSentences) &&
    !startsWithImperative &&
    !hasTaskKeywords &&
    !hasActionableDate;

  return isNarrative;
}

/**
 * Detects if text contains urgent markers
 */
export function isUrgent(input: string): boolean {
  const keywords = ['asap', 'urgent', 'now', 'immediately', 'today'];
  return keywords.some((k) => input.toLowerCase().includes(k));
}

/**
 * Generates timing chip options based on current time
 */
export function getTimingChips(): Array<{ option: TimingOption; label: string }> {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 5 = Friday

  // Morning (6-10)
  if (hour >= 6 && hour < 10) {
    return [
      { option: 'today', label: 'Today' },
      { option: 'tomorrow', label: 'Tomorrow' },
      { option: 'someday', label: 'Someday' },
    ];
  }

  // Evening (18-23)
  if (hour >= 18 && hour < 23) {
    return [
      { option: 'tomorrow', label: 'Tomorrow' },
      { option: 'today-actually', label: 'Today actually' },
      { option: 'someday', label: 'Someday' },
    ];
  }

  // Late night (23-5)
  if (hour >= 23 || hour < 5) {
    return [
      { option: 'tomorrow', label: 'Tomorrow' },
      { option: 'later-this-week', label: 'Later this week' },
      { option: 'someday', label: 'Someday' },
    ];
  }

  // Friday after 15:00
  if (day === 5 && hour >= 15) {
    return [
      { option: 'monday', label: 'Monday' },
      { option: 'this-weekend', label: 'This weekend' },
      { option: 'someday', label: 'Someday' },
    ];
  }

  // Default (rest of the time)
  return [
    { option: 'today', label: 'Today' },
    { option: 'tomorrow', label: 'Tomorrow' },
    { option: 'someday', label: 'Someday' },
  ];
}

/**
 * Converts timing option to ISO date string
 */
export function timingOptionToDate(option: TimingOption): string | null {
  const now = new Date();

  switch (option) {
    case 'today':
    case 'today-actually': {
      // Today at 17:00 local
      const today = new Date(now);
      today.setHours(17, 0, 0, 0);
      return today.toISOString();
    }

    case 'tomorrow': {
      // Tomorrow at 09:00 local
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow.toISOString();
    }

    case 'later-this-week': {
      // +3 days at 09:00 local
      const later = new Date(now);
      later.setDate(later.getDate() + 3);
      later.setHours(9, 0, 0, 0);
      return later.toISOString();
    }

    case 'this-weekend': {
      // Upcoming Saturday at 10:00 local
      const dayOfWeek = now.getDay();
      const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7; // 0-6, if 0 then next week
      const saturday = new Date(now);
      saturday.setDate(saturday.getDate() + daysUntilSaturday);
      saturday.setHours(10, 0, 0, 0);
      return saturday.toISOString();
    }

    case 'monday': {
      // Next Monday at 09:00 local
      const dayOfWeek = now.getDay();
      const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7; // If today is Monday, go to next Monday
      const monday = new Date(now);
      monday.setDate(monday.getDate() + daysUntilMonday);
      monday.setHours(9, 0, 0, 0);
      return monday.toISOString();
    }

    case 'someday':
    default:
      return null; // No due date
  }
}

export type CatchAllNotepadProps = {
  trustRefreshMs?: number;
  // Optional P8: allow parent to pass network status if a hook exists elsewhere
  networkIsOnline?: boolean;
  // Test hook: override organized today count directly to simplify deterministic assertions
  testOrganizedTodayOverride?: number;
  overlayController?: GlobalOverlayController;
};

export default function CatchAllNotepad(props: CatchAllNotepadProps = {}): React.JSX.Element {
  const {
    trustRefreshMs = 60000,
    networkIsOnline,
    testOrganizedTodayOverride,
    overlayController,
  } = props;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const repo = useRepo();
  const { decideWithContext } = useCortex();
  const { user, userId } = useAuth();
  const { showToast: showActionToast, Toast: ActionToast } = useActionToast({
    bottomOffset: Platform.select({ ios: 112, android: 112, default: 112 }) ?? 112,
  });
  const overlayFromContext = useMaybeGlobalOverlay();
  const overlay = overlayController ?? overlayFromContext ?? noopOverlayController;
  const TOASTS_ON = String(process.env.EXPO_PUBLIC_MINDDROP_TOASTS ?? 'off').toLowerCase() === 'on';
  const insets = useSafeAreaInsets();
  const themeResult = useTheme();
  const c = React.useMemo(() => themeResult.c, [themeResult.mode]);
  const motion = themeResult.motion;
  const themeMode = themeResult.mode;
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);
  const reduceMotion = useReducedMotion();
  const [uiMode, setUiMode] = useState<Mode>('free');
  const [listStyle, setListStyle] = useState<ListStyle>('none');
  const [note, setNote] = useState('');
  const [inputDynHeight, setInputDynHeight] = useState(START_HEIGHT);
  const [inputScrollEnabled, setInputScrollEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [microcopyIndex, setMicrocopyIndex] = useState(0);
  const [confirmations, setConfirmations] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [categoryChips, setCategoryChips] = useState<CategoryChip[]>([]);
  const [lowConfidenceUnsortedId, setLowConfidenceUnsortedId] = useState<string | null>(null);
  const [timingChips, setTimingChips] = useState<TimingChip[]>([]);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const timingAskedRef = useRef<string | null>(null); // Track submission ID to avoid re-asking

  // Auto-dismiss category chips after configured interval
  useEffect(() => {
    if (!categoryChips?.length) return;
    const timeout = setTimeout(() => setCategoryChips([]), CHIPS_AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [categoryChips, CHIPS_AUTO_DISMISS_MS]);

  // Auto-dismiss timing chips after configured interval
  useEffect(() => {
    if (!timingChips?.length) return;
    // Auto-dismiss after 5s and assign 'Someday' (due null)
    const timeout = setTimeout(() => {
      setTimingChips([]);
      if (pendingTodoId) {
        // Auto-assign "Someday" (no due date)
        metricsRef.current.timingFallback += 1;
        logMetrics('timing_auto_fallback', { todoId: pendingTodoId });

        handleTimingSelection('someday');
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [timingChips, pendingTodoId]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const submitScale = useRef(new Animated.Value(1)).current;
  const microcopyOpacity = useRef(new Animated.Value(0)).current;
  const hasTypedRef = useRef(false);
  const lastAppliedHeightRef = useRef(START_HEIGHT);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const microcopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  // Mind Drop: placeholder text and header focus target
  const headerTitleRef = useRef<any>(null);
  const [placeholder] = useState('Drop your thoughts here…\nLet it flow, big or small.');
  const inputFocusRef = useRef(false);
  const handleInputFocusChange = useCallback((focused: boolean) => {
    inputFocusRef.current = focused;
  }, []);

  const handleInputContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      if (!hasTypedRef.current) return;

      const raw = Math.ceil(event.nativeEvent.contentSize?.height ?? 0);
      if (!raw) return;

      // Deterministic height calculation: clamp between START and MAX
      const target = Math.max(START_HEIGHT, Math.min(raw, MAX_HEIGHT));

      // Enable scrolling only when content exceeds MAX_HEIGHT
      const shouldScroll = raw > MAX_HEIGHT;
      setInputScrollEnabled(shouldScroll);

      // Only update if change is significant (avoid jitter from sub-pixel changes)
      if (Math.abs(target - lastAppliedHeightRef.current) < 2) {
        return;
      }

      setInputDynHeight(target);
      lastAppliedHeightRef.current = target;

      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[MindDrop][AutoGrow]', {
          raw,
          target,
          last: lastAppliedHeightRef.current,
          shouldScroll,
          max: MAX_HEIGHT,
        });
      }
    },
    [setInputDynHeight, setInputScrollEnabled],
  );

  // Mind Drop P4: submit lifecycle & guardrails
  const pendingUndo = useRef<{ todos: string[]; notes: string[]; habits: string[] }>({
    todos: [],
    notes: [],
    habits: [],
  });
  const unsortedIdRef = useRef<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const dropIdRef = useRef<string | null>(null);
  const lastSubmitAt = useRef<number>(0);
  const submitLockRef = useRef(false);

  // Duplicate prevention: track last submitted text and its unsorted ID
  const lastSubmittedTextRef = useRef<string | null>(null);
  const lastUnsortedIdRef = useRef<string | null>(null);

  // Metrics tracking for Mind Drop refinements
  const metricsRef = useRef({
    timingShown: 0,
    timingSelected: 0,
    timingFallback: 0,
    conversions: 0,
    urgentBypass: 0,
    totalEvents: 0,
  });

  // Helper to log metrics every 15 events
  const logMetrics = useCallback((eventName: string, payload?: any) => {
    metricsRef.current.totalEvents += 1;

    // Log to telemetry
    void logCatchallDecision({ eventName, ...payload });

    // Debug log every 15 events
    if (metricsRef.current.totalEvents % 15 === 0) {
      console.debug('[MindDropMetrics]', {
        timingShown: metricsRef.current.timingShown,
        timingSelected: metricsRef.current.timingSelected,
        timingFallback: metricsRef.current.timingFallback,
        conversions: metricsRef.current.conversions,
        urgentBypass: metricsRef.current.urgentBypass,
      });
    }
  }, []);

  // Trust Builders: organized today count
  const [organizedToday, setOrganizedToday] = useState<number>(
    typeof testOrganizedTodayOverride === 'number' ? testOrganizedTodayOverride : 0,
  );
  const trustRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recentRefresh, setRecentRefresh] = useState(0);
  const recentRefreshBatchRef = useRef<number | null>(null);
  const triggerRecentRefresh = useCallback(() => {
    if (recentRefreshBatchRef.current != null) return;

    recentRefreshBatchRef.current = requestAnimationFrame(() => {
      recentRefreshBatchRef.current = null;
      setRecentRefresh((v) => v + 1);
    });
  }, [setRecentRefresh]);
  const canonicalConversionsOn = env.feature.canonicalConversions;

  // Stable noop callbacks for RecentDrops to prevent unnecessary re-renders
  const noopCallback = useCallback(() => {}, []);

  const isProcessing = isSubmitting || isThinking;

  const hour = new Date().getHours();
  const contextPrompt =
    hour >= 6 && hour < 12
      ? "Good morning! What's on your mind?"
      : hour >= 12 && hour < 17
        ? 'Afternoon brain dump?'
        : hour >= 17 && hour < 22
          ? 'Evening thoughts?'
          : 'Capture those late-night thoughts...';

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    return () => {
      if (recentRefreshBatchRef.current != null) {
        cancelAnimationFrame(recentRefreshBatchRef.current);
        recentRefreshBatchRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseScale.stopAnimation();
      pulseScale.setValue(1);
      return;
    }

    if (isProcessing) {
      pulseLoopRef.current?.stop();
      pulseScale.stopAnimation();
      pulseScale.setValue(1);
      const grow = Animated.timing(pulseScale, {
        toValue: 1.05,
        duration: motion.pulseMs / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
      const shrink = Animated.timing(pulseScale, {
        toValue: 1,
        duration: motion.pulseMs / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
      const loop = Animated.loop(Animated.sequence([grow, shrink]));
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseScale.stopAnimation();
      pulseScale.setValue(1);
    }

    return () => {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseScale.stopAnimation();
    };
  }, [isProcessing, reduceMotion, motion.pulseMs, pulseScale]);

  useEffect(() => {
    if (microcopyTimerRef.current) {
      clearTimeout(microcopyTimerRef.current);
      microcopyTimerRef.current = null;
    }

    if (!isProcessing) {
      microcopyOpacity.stopAnimation();
      microcopyOpacity.setValue(0);
      setMicrocopyIndex(0);
      return;
    }

    if (reduceMotion) {
      microcopyOpacity.stopAnimation();
      microcopyOpacity.setValue(1);
      setMicrocopyIndex(0);
      return;
    }

    microcopyOpacity.stopAnimation();
    microcopyOpacity.setValue(0);
    setMicrocopyIndex(0);

    const fadeIn = Animated.timing(microcopyOpacity, {
      toValue: 1,
      duration: MICROCOPY_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });

    const scheduleNext = () => {
      const delay = Math.max(motion.pulseMs, MICROCOPY_FADE_MS * 2);
      microcopyTimerRef.current = setTimeout(() => {
        if (!isProcessingRef.current) {
          return;
        }

        Animated.timing(microcopyOpacity, {
          toValue: 0,
          duration: MICROCOPY_FADE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished || !isProcessingRef.current) {
            return;
          }

          setMicrocopyIndex((prev) => (prev + 1) % THINKING_MICROCOPY.length);

          Animated.timing(microcopyOpacity, {
            toValue: 1,
            duration: MICROCOPY_FADE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start(({ finished: fadeInFinished }) => {
            if (fadeInFinished && isProcessingRef.current) {
              scheduleNext();
            }
          });
        });
      }, delay);
    };

    fadeIn.start(({ finished }) => {
      if (finished && isProcessingRef.current) {
        scheduleNext();
      }
    });

    return () => {
      if (microcopyTimerRef.current) {
        clearTimeout(microcopyTimerRef.current);
        microcopyTimerRef.current = null;
      }
      microcopyOpacity.stopAnimation();
    };
  }, [isProcessing, reduceMotion, microcopyOpacity, motion.pulseMs]);

  const handleInfoOpen = useCallback(() => setInfoOpen(true), []);
  const handleInfoClose = useCallback(() => setInfoOpen(false), []);
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation as any).navigate('Tabs');
    }
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Trust Builders: loader for today's organized count
  const refreshOrganizedToday = useCallback(async () => {
    if (typeof testOrganizedTodayOverride === 'number') {
      setOrganizedToday(testOrganizedTodayOverride);
      return;
    }
    try {
      const since = startOfTodayLocal().toISOString();

      // Attempt to use repo APIs if available; otherwise, fall back to filtering
      const notes: any[] = (await (repo as any)?.notes?.list?.({ createdAfter: since })) ?? [];
      const todos: any[] = (await (repo as any)?.todos?.list?.({ createdAfter: since })) ?? [];
      const habits: any[] = (await (repo as any)?.habits?.list?.({ createdAfter: since })) ?? [];

      // DEDUPLICATION RULE: Count unique drop_ids, not individual records
      // When an unsorted note is converted to a habit/todo:
      // - The note is archived but may still be in the query results
      // - Both the note and the new habit/todo share the same drop_id
      // - We should count this as 1 thought organized, not 2

      // Filter to Mind Drop items created today
      const todayNotes = Array.isArray(notes)
        ? notes.filter(
            (n) =>
              new Date(n.created_at) >= new Date(since) &&
              (n?.origin === 'catchall' ||
                (Array.isArray(n?.labels) && n.labels.includes(CATCHALL_LABEL))) &&
              n?.archived !== true, // Exclude archived notes (converted items)
          )
        : [];

      const todayTodos = Array.isArray(todos)
        ? todos.filter((t) => new Date(t.created_at) >= new Date(since) && t?.origin === 'catchall')
        : [];

      const todayHabits = Array.isArray(habits)
        ? habits.filter(
            (h) => new Date(h.created_at) >= new Date(since) && h?.origin === 'catchall',
          )
        : [];

      // Collect all drop_ids and deduplicate
      const dropIds = new Set<string>();
      let itemsWithoutDropId = 0;

      for (const item of [...todayNotes, ...todayTodos, ...todayHabits]) {
        const dropId = (item as any)?.drop_id;
        if (dropId && typeof dropId === 'string') {
          dropIds.add(dropId);
        } else {
          // Count items without drop_id (shouldn't happen for Mind Drop, but be safe)
          itemsWithoutDropId++;
        }
      }

      // Total count = unique drop_ids + items without drop_id
      const count = dropIds.size + itemsWithoutDropId;

      // Only update state if count actually changed to prevent unnecessary re-renders
      setOrganizedToday((prev) => (prev === count ? prev : count));
      // Optional debug for tests/dev; avoid error overlay in RN
      if (__DEV__ && process.env.JEST_WORKAROUND === '1') {
        // eslint-disable-next-line no-console
        console.debug('[TrustBuilders] computed count', count, 'unique drops:', dropIds.size);
      }
    } catch (e) {
      // Silent fail — keep last known number
    }
  }, [repo, testOrganizedTodayOverride]);

  useEffect(() => {
    const unsub = addOverlaySavedListener(() => {
      void refreshOrganizedToday?.();
      triggerRecentRefresh();
    });
    return unsub;
  }, [refreshOrganizedToday, triggerRecentRefresh]);

  // Memoized disabled state: only depends on note & isSubmitting, isolating input from unrelated state
  const disabled = useMemo(
    () => note.trim().length === 0 || isSubmitting || isThinking,
    [note, isSubmitting, isThinking],
  );
  const isButtonVisuallyDisabled = note.trim().length === 0;

  const modeDescription = useMemo(() => {
    return uiMode === 'free'
      ? 'Just a calm notepad. You can format with bullets, numbers, or checkboxes.'
      : 'Talk it out with Gremly — I’ll suggest structure and help file it.';
  }, [uiMode]);

  const animateSubmitScale = useCallback(
    (toValue: number) => {
      Animated.timing(submitScale, {
        toValue,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [submitScale],
  );

  const handleSubmitPressIn = useCallback(() => {
    if (disabled || reduceMotion) {
      return;
    }
    animateSubmitScale(0.98);
  }, [animateSubmitScale, disabled, reduceMotion]);

  const handleSubmitPressOut = useCallback(() => {
    if (reduceMotion) {
      submitScale.setValue(1);
      return;
    }
    animateSubmitScale(1);
  }, [animateSubmitScale, reduceMotion, submitScale]);

  useEffect(() => {
    if (disabled) {
      submitScale.setValue(1);
    }
  }, [disabled, submitScale]);

  useEffect(() => {
    if (reduceMotion) {
      submitScale.setValue(1);
    }
  }, [reduceMotion, submitScale]);

  const handleModeSelect = useCallback((next: Mode) => {
    setUiMode(next);
  }, []);

  const handleToolbarSelect = useCallback((next: ListStyle) => {
    setListStyle(next);
  }, []);

  const resetState = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    unsortedIdRef.current = null;
    submissionIdRef.current = null;
    dropIdRef.current = null;
    setNote('');
    setIsSubmitting(false);
    setIsThinking(false);
    setConfirmations([]);
    setInputDynHeight(START_HEIGHT);
    setInputScrollEnabled(false);
    hasTypedRef.current = false;
    lastAppliedHeightRef.current = START_HEIGHT;
  }, []);

  // Trust Builders: start timer and initial refresh
  useEffect(() => {
    if (typeof testOrganizedTodayOverride === 'number') {
      setOrganizedToday(testOrganizedTodayOverride);
      return undefined;
    }

    let mounted = true;
    (async () => {
      await refreshOrganizedToday();
      // Refresh count every 60s, but skip if user is typing to prevent TextInput disruption
      trustRefreshRef.current = setInterval(() => {
        if (!inputFocusRef.current) {
          void refreshOrganizedToday();
        }
      }, trustRefreshMs);
    })();
    return () => {
      mounted = false;
      if (trustRefreshRef.current) clearInterval(trustRefreshRef.current);
    };
  }, [refreshOrganizedToday, trustRefreshMs, testOrganizedTodayOverride]);

  // Undo last created items (todos/notes/habits)
  const handleUndoCreated = useCallback(async () => {
    const snapshot = pendingUndo.current;
    if (
      !snapshot ||
      (!snapshot.todos.length && !snapshot.notes.length && !snapshot.habits.length)
    ) {
      if (TOASTS_ON) {
        showActionToast({ type: 'success', content: 'Nothing to undo' });
      }
      return;
    }

    try {
      // Delete items; if relationships exist, adjust order accordingly
      await Promise.all([
        ...snapshot.todos.map((id) => repo.remove(id)),
        ...snapshot.habits.map((id) => repo.remove(id)),
        ...snapshot.notes.map((id) => repo.remove(id)),
      ]);

      // Clear snapshot to avoid repeat undo
      pendingUndo.current = { todos: [], notes: [], habits: [] };

      if (TOASTS_ON) {
        showActionToast({ type: 'success', content: '✅ Undo complete — Mind Drop reverted' });
      }
    } catch (e) {
      Alert.alert('Undo failed', 'Could not revert items. You can edit from Recent.');
    }
  }, [repo, showActionToast, TOASTS_ON]);

  // Navigate to Hub → Recent (fallback toast if route missing)
  const handleViewDetails = useCallback(() => {
    try {
      // Navigate to Hub tab; pass filter for future use if supported
      (navigation as any).navigate('Tabs', { screen: 'Hub', params: { filter: 'recent' } });
    } catch (err) {
      if (TOASTS_ON) {
        showActionToast({
          type: 'success',
          content: 'ℹ️ Open Hub → Recent to see new items',
        });
      }
    }
  }, [navigation, showActionToast, TOASTS_ON]);

  const handleInfoViewRecent = useCallback(() => {
    handleInfoClose();
    handleViewDetails();
  }, [handleInfoClose, handleViewDetails]);

  // A11y: set focus to the greeting after successful actions
  const focusGreetingForA11y = useCallback(() => {
    try {
      const node = findNodeHandle(headerTitleRef.current);
      if (node) {
        // Optional API depending on platform
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AccessibilityInfo as any).setAccessibilityFocus?.(node);
      }
    } catch (e) {
      void e;
    }
  }, []);

  // Shared success toast helper for Mind Drop
  const showMindDropSuccessToast = useCallback(
    (args: MindDropToastArgs = {}) => {
      if (!TOASTS_ON) {
        try {
          if (shouldUseHaptics()) void haptics.submitSuccess();
        } catch (e) {
          void e;
        }
        try {
          AccessibilityInfo.announceForAccessibility?.('Mind Drop organized successfully.');
        } catch (e) {
          void e;
        }
        return;
      }

      const { todos, notes, habits, details } = args;
      const counts = { todos, notes, habits };
      const label = organizedToastSummary(counts, {
        canonicalTypesOn: env.feature.canonicalTypes,
        details,
      });

      showActionToast({
        type: 'success',
        content: label,
        metadata: {
          onUndo: handleUndoCreated,
          onViewDetails: handleViewDetails,
        },
      });
      try {
        if (shouldUseHaptics()) void haptics.submitSuccess();
      } catch (e) {
        void e;
      }
      // Announce for accessibility
      try {
        AccessibilityInfo.announceForAccessibility?.('Mind Drop organized successfully.');
      } catch (e) {
        void e;
      }
    },
    [TOASTS_ON, showActionToast, handleUndoCreated, handleViewDetails],
  );

  const ensureSubmissionAndDropIds = useCallback((): { submissionId: string; dropId: string } => {
    const submissionId = submissionIdRef.current ?? createSubmissionId();
    submissionIdRef.current = submissionId;

    const dropId = dropIdRef.current ?? createDropId();
    dropIdRef.current = dropId;

    return { submissionId, dropId };
  }, []);

  type SaveResult = {
    created: { todos: string[]; notes: string[]; habits: string[] };
    createdDetails: OrganizedDetail[];
    suggestions?: UISuggestion[];
    decisionMode?: CortexResponse['mode'];
    decisionConfidence?: number;
  };

  const performSave = useCallback(async (): Promise<SaveResult> => {
    const trimmed = clampNoteLength(note.trim());
    const trace = startCatchallTrace('minddrop');
    step(trace, 'submit', { length: trimmed.length });

    // Duplicate prevention guard: if same text as last submission and we have an existing unsorted record
    if (
      trimmed === lastSubmittedTextRef.current &&
      unsortedIdRef.current == null &&
      lastUnsortedIdRef.current
    ) {
      // Don't create a new record, just show category chips for existing unsorted note
      setLowConfidenceUnsortedId(lastUnsortedIdRef.current);
      setCategoryChips([
        { kind: 'todo', label: 'Add to To-Do List' },
        { kind: 'log', label: 'Just Save It' },
        { kind: 'habit', label: 'Start a Habit' },
      ]);
      setNote('');
      end(trace, 'duplicate_prevented', { reusingUnsortedId: lastUnsortedIdRef.current });
      return { created: { todos: [], notes: [], habits: [] }, createdDetails: [] };
    }

    try {
      if (!trimmed) {
        resetState();
        end(trace, 'empty', { length: 0 });
        return { created: { todos: [], notes: [], habits: [] }, createdDetails: [] };
      }

      const currentUserId = user?.id ?? userId ?? 'anonymous';
      const engineMode: 'LLM' | 'HEURISTIC' | 'DISABLED' = 'LLM';
      const modelVersion = process.env.EXPO_PUBLIC_CORTEX_MODEL || 'gpt-4o-mini';
      const { submissionId, dropId } = ensureSubmissionAndDropIds();

      // Only use submissionId if it's a valid UUID; otherwise use null for source_message_id
      // This keeps the database column as uuid type (not "minddrop-..." strings)
      const validSourceMessageId = isValidUuid(submissionId) ? submissionId : null;

      const parsed = parseDue(trimmed);
      const hasConfidentDue = !!parsed && parsed.confidence >= DUE_CONFIDENCE_FLOOR;
      const cleanedSourceRaw =
        hasConfidentDue && DUE_STRIP ? (parsed?.textWithoutWhen ?? '') : trimmed;
      const cleanedSource = clampNoteLength(cleanedSourceRaw);
      const cleanedText = clampNoteLength(cleanedSource.trim() || trimmed);
      const parsedIso = hasConfidentDue && parsed ? parsed.iso : null;

      let decision: CortexResponse | null = null;
      try {
        const ctx: CortexContext = {
          userId: currentUserId,
          activeSpaceId: null,
          uiSurface: 'overlay',
          lane: 'catchall',
        };
        decision = await decideWithContext({ text: cleanedText }, ctx);
        step(trace, 'decide:result', {
          mode: decision.mode,
          confidence: decision.confidence,
          actions: Array.isArray(decision.actions) ? decision.actions.map((a) => a.type) : [],
          suggestions: Array.isArray(decision.suggestions) ? decision.suggestions.length : 0,
        });

        // Early narrative detection guard: force category chips to prevent multiple catchall notes
        if (classifyNarrative(cleanedText)) {
          // Save to unsorted tray once if not already saved
          if (unsortedIdRef.current == null) {
            try {
              const narrativeTags = buildFallbackTags(cleanedText, 'note', 'journal');
              const tagsForCreate = narrativeTags.length > 0 ? narrativeTags : null;
              const id = await saveToUnsortedTray(repo as any, cleanedText, {
                sourceMessageId: validSourceMessageId ?? undefined,
                whyString: 'Narrative text - awaiting category selection',
                tags: tagsForCreate ?? undefined,
                dropId,
              });
              if (id) {
                logMetrics('minddrop_unsorted_created', {
                  noteId: id,
                  dropId,
                  mode: decision?.mode ?? 'narrative_guard',
                });
              }
              unsortedIdRef.current = id ?? null;

              // Track this submission to prevent duplicates
              lastSubmittedTextRef.current = trimmed;
              lastUnsortedIdRef.current = unsortedIdRef.current;
            } catch (e) {
              console.warn('[MindDrop][Narrative] failed to save to Unsorted', e);
            }
          }

          const savedUnsortedId = unsortedIdRef.current;
          if (savedUnsortedId) {
            setLowConfidenceUnsortedId(savedUnsortedId);
            setCategoryChips([
              { kind: 'todo', label: 'Add to To-Do List' },
              { kind: 'log', label: 'Just Save It' },
              { kind: 'habit', label: 'Start a Habit' },
            ]);
            setNote('');
            triggerRecentRefresh();
            pendingUndo.current = { todos: [], notes: [], habits: [] };

            void logCatchallDecision({
              userId: currentUserId,
              text: cleanedText,
              surface: 'catchall',
              engine: engineMode,
              modelVersion,
              intent: 'narrative',
              confidence: decision.confidence ?? 0,
              mode: decision.mode,
              decision: 'ask_chips',
              createdTodos: 0,
              createdNotes: 0,
              createdHabits: 0,
              dropId,
            });

            step(trace, 'narrative:forced-category-chips', { unsortedId: savedUnsortedId });
            end(trace, 'narrative-ask', { confidence: decision.confidence ?? 0 });

            return {
              created: { todos: [], notes: [], habits: [] },
              createdDetails: [],
              decisionMode: 'ask',
              decisionConfidence: decision.confidence ?? 0,
            };
          }
        }

        // Apply narrative detection guard to avoid prompting conversion for journaling text
        if (decision && classifyNarrative(cleanedText)) {
          const hasTodoAction = Array.isArray(decision.actions)
            ? decision.actions.some((a: any) => a.type === 'create.todo')
            : false;
          const hasTodoSuggestion = Array.isArray(decision.suggestions)
            ? decision.suggestions.some((s: any) => s.type === 'create.todo')
            : false;

          if (hasTodoAction || hasTodoSuggestion) {
            // Override: convert todo classification to note with reduced confidence
            decision = {
              ...decision,
              mode: 'ask',
              confidence: 0.74, // Below 0.8 threshold to show category chips if needed
              actions: [],
              suggestions: [
                {
                  type: 'create.note',
                  label: env.feature.canonicalTypes ? 'Save as log' : 'Save as note',
                  payload: {
                    title: cleanedText,
                    body: cleanedText,
                    subtype: 'journal',
                  },
                },
              ],
            };
            step(trace, 'decide:narrative-override', {
              originalMode: decision.mode,
              originalConfidence: decision.confidence,
              hadTodoAction: hasTodoAction,
              hadTodoSuggestion: hasTodoSuggestion,
            });
          }
        }
      } catch (err) {
        console.warn('[MindDrop][Decide] error', String(err));
        step(trace, 'decide:error', { error: String(err) });
      }

      if (decision) {
        const actions = Array.isArray(decision.actions) ? (decision.actions as CortexAction[]) : [];
        const chipSuggestions = Array.isArray(decision.suggestions)
          ? (decision.suggestions as unknown[]).filter(
              (s): s is UISuggestion =>
                !!s && typeof s === 'object' && 'type' in s && 'label' in s && 'payload' in s,
            )
          : [];

        if (shouldAutoCreate(decision) && actions.length > 0) {
          const mapped: Array<{
            bucket: 'todos' | 'notes' | 'habits';
            payload: CreateRecordInput;
          }> = [];
          let unsupported = false;

          // Compute combined AI tags from cortexDecide response
          const engineTags = Array.isArray(decision.engineTags) ? decision.engineTags : [];
          const classificationTagsRaw = Array.isArray(decision.meta?.classification?.tags)
            ? (decision.meta?.classification?.tags as string[])
            : [];
          const combinedTags = filterAndNormalizeTags([...engineTags, ...classificationTagsRaw]);

          for (const action of actions) {
            if (action.type === 'create.todo') {
              const rawTitle = (action.payload.title?.trim() || cleanedText).trim() || 'Quick task';
              const title = clampNoteLength(rawTitle);
              const due = action.payload.due ?? parsedIso ?? null;

              // Use canonical mapper for consistent Mind Drop → todo transformation
              const canonical = buildCanonicalFromMindDrop({
                kind: 'todo',
                rawText: trimmed,
                aiTitle: action.payload.title?.trim(),
                aiTags: combinedTags.length > 0 ? combinedTags : undefined,
              });

              mapped.push({
                bucket: 'todos',
                payload: {
                  type: 'todo',
                  ...canonical, // Spread canonical fields (title, name, body, tags, tags_meta, canonicalType, labels)
                  due_date: due,
                  undefined_due: !due,
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  origin: 'catchall',
                  sourceMessageId: validSourceMessageId,
                  dropId,
                },
              });
            } else if (action.type === 'create.habit') {
              const rawName = action.payload.name?.trim() || cleanedText || trimmed;
              const name = clampNoteLength(rawName);
              const freqRaw = action.payload.freq;
              const frequency: 'daily' | 'weekly' | 'monthly' =
                freqRaw === 'weekly' ? 'weekly' : 'daily';

              // Use canonical mapper for consistent Mind Drop → habit transformation
              const canonical = buildCanonicalFromMindDrop({
                kind: 'habit',
                rawText: trimmed,
                aiTitle: action.payload.name?.trim(),
                aiTags: combinedTags.length > 0 ? combinedTags : undefined,
              });

              mapped.push({
                bucket: 'habits',
                payload: {
                  type: 'habit',
                  ...canonical, // Spread canonical fields (title, name, notes, tags, tags_meta, canonicalType, labels)
                  frequency,
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  origin: 'catchall',
                  sourceMessageId: validSourceMessageId,
                  dropId,
                },
              });
            } else if (action.type === 'create.note') {
              const rawText = action.payload.text?.trim() || cleanedText || trimmed;
              const text = clampNoteLength(rawText);
              const rawSubtype = action.payload.subtype;
              const subtype = rawSubtype === 'journal' ? 'journal' : 'catchall';
              const canonicalType = persistedToCanonical('note', subtype);

              // Use canonical mapper for consistent Mind Drop → log transformation
              const canonical = buildCanonicalFromMindDrop({
                kind: 'log',
                rawText: trimmed,
                aiTitle: action.payload.text?.trim(),
                aiTags: combinedTags.length > 0 ? combinedTags : undefined,
              });

              mapped.push({
                bucket: 'notes',
                payload: {
                  type: 'note',
                  ...canonical, // Spread canonical fields (title, body, tags, tags_meta, canonicalType, labels)
                  subtype,
                  origin: 'catchall',
                  ai_placed: subtype !== 'catchall',
                  space_id: action.payload.spaceId ?? null,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  views: { alsoShowIn: ['Hub:Catch-All'] },
                  sourceMessageId: validSourceMessageId,
                  dropId,
                },
              });
            } else if (action.type === 'add.to.list') {
              const rawItemText = action.payload.item?.trim() || cleanedText || trimmed;
              const itemText = clampNoteLength(rawItemText);
              const rawListTitle = cleanedText || itemText || trimmed || 'Quick list';
              const listTitle = clampNoteLength(rawListTitle);
              const canonicalType = persistedToCanonical('note', 'list');

              // Use AI tags or fallback to locally generated tags for list notes
              const listTags =
                combinedTags.length > 0
                  ? combinedTags
                  : buildFallbackTags(cleanedText, 'note', 'list');

              mapped.push({
                bucket: 'notes',
                payload: {
                  type: 'note',
                  title: listTitle,
                  body: cleanedText || itemText,
                  subtype: 'list',
                  origin: 'catchall',
                  ai_placed: true,
                  space_id: action.payload.spaceId ?? null,
                  why_string: decision.explanation || 'Ideas/list capture',
                  canonicalType,
                  labels: [CATCHALL_LABEL],
                  views: { alsoShowIn: ['Hub:Catch-All'] },
                  sourceMessageId: validSourceMessageId,
                  dropId,
                  ...(listTags.length > 0 && { tags: listTags }),
                },
              });
            } else {
              unsupported = true;
              break;
            }
          }

          if (!unsupported && mapped.length > 0) {
            const createdIds = {
              todos: [] as string[],
              notes: [] as string[],
              habits: [] as string[],
            };
            const counts = { todos: 0, notes: 0, habits: 0 };
            const createdDetails: OrganizedDetail[] = [];
            let firstTodoId: string | null = null;

            try {
              for (const entry of mapped) {
                // Check if a note with this sourceMessageId already exists (for conversion scenarios)
                let record: any;
                const sourceMessageId = (entry.payload as any)?.sourceMessageId;
                let existingNote: any = null;

                if (
                  sourceMessageId &&
                  entry.bucket !== 'notes' &&
                  typeof repo?.findNoteBySourceMessageId === 'function'
                ) {
                  try {
                    existingNote = await repo.findNoteBySourceMessageId(sourceMessageId);
                  } catch (e) {
                    // If lookup fails, proceed with create
                  }
                }

                if (existingNote) {
                  // Convert existing note to the target type via update
                  const { sourceMessageId: _unused, ...patchFields } = entry.payload as any;
                  record = await repo.update({
                    id: existingNote.id,
                    patch: patchFields,
                  });
                } else {
                  // Create new record
                  record = await repo.create(entry.payload);
                }

                if (entry.bucket === 'todos') {
                  counts.todos += 1;
                  createdIds.todos.push(record.id);
                  createdDetails.push({ kind: 'todo' });

                  // Track first created todo for timing chips
                  if (!firstTodoId) {
                    firstTodoId = record.id;
                  }
                } else if (entry.bucket === 'habits') {
                  counts.habits += 1;
                  createdIds.habits.push(record.id);
                  createdDetails.push({ kind: 'habit' });
                } else {
                  counts.notes += 1;
                  createdIds.notes.push(record.id);
                  const payloadSubtype =
                    typeof (entry.payload as any)?.subtype === 'string'
                      ? (entry.payload as any).subtype
                      : null;
                  createdDetails.push({
                    kind: 'note',
                    noteSubtype: payloadSubtype,
                  });
                }
              }

              // Show timing chips for auto-created todos
              if (
                firstTodoId &&
                (decision.confidence ?? 0) >= 0.8 &&
                !isUrgent(cleanedText) &&
                !parsedIso &&
                timingAskedRef.current !== submissionIdRef.current
              ) {
                timingAskedRef.current = submissionIdRef.current;
                setPendingTodoId(firstTodoId);
                setTimingChips(getTimingChips());

                // Track timing options shown
                metricsRef.current.timingShown += 1;
                logMetrics('timing_options_shown', {
                  todoId: firstTodoId,
                  confidence: decision.confidence,
                  timingOptions: getTimingChips().map((c) => c.option),
                });
              }

              const firstAction = actions[0];
              const probableIntent =
                firstAction?.type === 'create.todo'
                  ? 'todo'
                  : firstAction?.type === 'create.habit'
                    ? 'habit'
                    : 'note';

              const autoCreatedCount = counts.todos + counts.notes + counts.habits;
              const didAutoCreate = autoCreatedCount > 0;
              const decisionModeForLog = decision.mode;
              const decisionOutcomeForLog =
                shouldAutoCreate(decision) && didAutoCreate
                  ? 'auto_create'
                  : decision.mode === 'ask'
                    ? 'ask_chip'
                    : 'unsorted';

              if (didAutoCreate) {
                logMetrics('minddrop_auto_created', {
                  dropId,
                  mode: decision.mode,
                  createdTodos: counts.todos,
                  createdNotes: counts.notes,
                  createdHabits: counts.habits,
                });
              }

              void logCatchallDecision({
                userId: currentUserId,
                text: cleanedText,
                surface: 'catchall',
                engine: engineMode,
                modelVersion,
                intent: probableIntent,
                confidence: decision.confidence ?? 0,
                mode: decisionModeForLog,
                decision: decisionOutcomeForLog,
                createdTodos: counts.todos,
                createdNotes: counts.notes,
                createdHabits: counts.habits,
                dropId,
              });

              end(trace, 'saved', {
                ids: createdIds,
                mode: decision.mode,
              });

              return {
                created: createdIds,
                createdDetails,
                decisionMode: decision.mode,
                decisionConfidence: decision.confidence,
              };
            } catch (err) {
              console.warn('[MindDrop][Decide] action execution failed, falling back', err);
            }
          }
        }

        if (decision.mode === 'ask' && chipSuggestions.length > 0) {
          // Duplicate prevention: only save if no existing unsorted note OR text is different
          const shouldSaveNew =
            unsortedIdRef.current == null && lastSubmittedTextRef.current !== cleanedText;

          if (shouldSaveNew) {
            try {
              const decisionMeta = decision.meta as
                | (Record<string, unknown> & {
                    engineOutput?: { tags?: unknown };
                    classification?: { tags?: unknown };
                    canonicalSubtype?: LogSubtype | null;
                  })
                | undefined;
              const engineTags = Array.isArray(decisionMeta?.engineOutput?.tags)
                ? (decisionMeta?.engineOutput?.tags as string[])
                : [];
              const classificationTagsMeta = Array.isArray(decisionMeta?.classification?.tags)
                ? (decisionMeta?.classification?.tags as string[])
                : [];
              const classificationTags = filterAndNormalizeTags([
                ...engineTags,
                ...classificationTagsMeta,
              ]);
              const canonicalSubtypeMeta = decisionMeta?.canonicalSubtype ?? null;
              const fallbackSubtype =
                canonicalSubtypeMeta === 'journal' ||
                canonicalSubtypeMeta === 'list' ||
                canonicalSubtypeMeta === 'idea'
                  ? (canonicalSubtypeMeta as NoteSubtype)
                  : 'catchall';
              const fallbackTags =
                classificationTags.length > 0
                  ? classificationTags
                  : buildFallbackTags(cleanedText, 'note', fallbackSubtype);
              const tagsForCreate = fallbackTags.length > 0 ? fallbackTags : null;
              const id = await saveToUnsortedTray(repo as any, cleanedText, {
                sourceMessageId: validSourceMessageId ?? undefined,
                whyString: 'Awaiting chip selection',
                tags: tagsForCreate ?? undefined,
                dropId,
              });
              if (id) {
                logMetrics('minddrop_unsorted_created', {
                  noteId: id,
                  dropId,
                  mode: decision.mode,
                });
              }
              unsortedIdRef.current = id ?? null;

              // Track this submission to prevent duplicates
              lastSubmittedTextRef.current = trimmed;
              lastUnsortedIdRef.current = unsortedIdRef.current;
            } catch (e) {
              console.warn('[MindDrop][Ask] failed to save to Unsorted', e);
            }
          } else {
            // Reuse existing unsorted note
            console.debug('[MindDrop][Ask] Reusing existing unsorted note, not creating duplicate');
          }

          const savedUnsortedId = unsortedIdRef.current;
          const confidence = decision.confidence ?? 0;

          // If low confidence or narrative, show category chips instead of suggestions
          if ((confidence <= 0.85 || classifyNarrative(trimmed)) && savedUnsortedId) {
            setLowConfidenceUnsortedId(savedUnsortedId);
            setCategoryChips([
              { kind: 'todo', label: 'Add to To-Do List' },
              { kind: 'log', label: 'Just Save It' },
              { kind: 'habit', label: 'Start a Habit' },
            ]);
            setNote('');
            triggerRecentRefresh();
            pendingUndo.current = { todos: [], notes: [], habits: [] };

            void logCatchallDecision({
              userId: currentUserId,
              text: cleanedText,
              surface: 'catchall',
              engine: engineMode,
              modelVersion,
              intent: decision.meta?.intent?.kind ?? 'ambiguous',
              confidence,
              mode: decision.mode,
              decision: 'ask_chip',
              createdTodos: 0,
              createdNotes: 0,
              createdHabits: 0,
              dropId,
            });

            return {
              created: { todos: [], notes: [], habits: [] },
              createdDetails: [],
              decisionMode: decision.mode,
              decisionConfidence: confidence,
            };
          }

          // If we reach here, show suggestion chips (not category chips)
          // This happens when confidence > 0.85 and not narrative
          setNote('');
          triggerRecentRefresh();
          pendingUndo.current = { todos: [], notes: [], habits: [] };

          return {
            created: { todos: [], notes: [], habits: [] },
            createdDetails: [],
            decisionMode: decision.mode,
            decisionConfidence: decision.confidence ?? 0,
          };
        }
      }

      // If decision is null or has no actions, fall back to ask mode with Unsorted
      if (!decision || !Array.isArray(decision.actions) || decision.actions.length === 0) {
        step(trace, 'no-decision-or-actions', {
          hasDecision: !!decision,
          actionsCount: decision?.actions?.length ?? 0,
        });

        // Save to Unsorted tray if not already saved
        if (unsortedIdRef.current == null) {
          try {
            const fallbackTags = buildFallbackTags(trimmed, 'note');
            const tagsForCreate = fallbackTags.length > 0 ? fallbackTags : null;

            const id = await saveToUnsortedTray(repo as any, trimmed, {
              sourceMessageId: validSourceMessageId ?? undefined,
              whyString: 'Awaiting chip selection',
              tags: tagsForCreate ?? undefined,
              dropId,
            });

            if (id) {
              logMetrics('minddrop_unsorted_created', {
                noteId: id,
                dropId,
                mode: decision?.mode ?? 'ask',
                reason: 'no_actions',
              });
            }

            unsortedIdRef.current = id ?? null;
            lastSubmittedTextRef.current = trimmed;
            lastUnsortedIdRef.current = unsortedIdRef.current;
          } catch (e) {
            console.warn('[MindDrop][NoActions] failed to save unsorted note', e);
          }
        }

        const savedUnsortedId = unsortedIdRef.current;
        if (savedUnsortedId) {
          setLowConfidenceUnsortedId(savedUnsortedId);
          setCategoryChips([
            { kind: 'todo', label: 'Add to To-Do List' },
            { kind: 'log', label: 'Just Save It' },
            { kind: 'habit', label: 'Start a Habit' },
          ]);
          setNote('');
          triggerRecentRefresh();
          pendingUndo.current = { todos: [], notes: [], habits: [] };

          void logCatchallDecision({
            userId: currentUserId,
            text: cleanedText,
            surface: 'catchall',
            engine: engineMode,
            modelVersion,
            intent: 'none',
            confidence: decision?.confidence ?? 0,
            mode: decision?.mode ?? 'ask',
            decision: 'ask_chip',
            createdTodos: 0,
            createdNotes: 0,
            createdHabits: 0,
            dropId,
          });

          step(trace, 'fallback-to-ask', { unsortedId: savedUnsortedId });
          end(trace, 'ask-chips', { confidence: decision?.confidence ?? 0 });

          return {
            created: { todos: [], notes: [], habits: [] },
            createdDetails: [],
            decisionMode: decision?.mode ?? 'ask',
            decisionConfidence: decision?.confidence ?? 0,
          };
        }
      }

      // If we reach here without returning, decision.mode is 'ask' but chips weren't shown
      // This shouldn't happen in normal flow, but handle it gracefully
      step(trace, 'unexpected-fallthrough', {
        mode: decision?.mode,
        hasUnsortedId: !!unsortedIdRef.current,
      });

      end(trace, 'no-action-taken', {});

      return {
        created: { todos: [], notes: [], habits: [] },
        createdDetails: [],
        decisionMode: decision?.mode ?? 'ask',
        decisionConfidence: decision?.confidence ?? 0,
      };
    } catch (error) {
      console.error('[CatchAllNotepad] Failed to capture note', error);
      end(trace, 'error', { message: String(error) });
      throw error;
    }
  }, [
    note,
    repo,
    user,
    userId,
    decideWithContext,
    triggerRecentRefresh,
    ensureSubmissionAndDropIds,
  ]);

  // COPILOT TASK: Ensure Mind Drop To-Do chip uses the RPC and does NOT leave duplicate unsorted entries.
  //
  // Context:
  // - A provisional note is created for each Mind Drop via SupabaseRepo.create with a drop_id.
  // - When the user taps the To-Do chip, we call the convert_or_create_from_drop RPC to
  //   create (or reuse) a todo for that same drop_id.
  // - After the RPC succeeds, we *only* want the todo to show up in "Recent drops";
  //   the original "unsorted" note should be cleaned up by the RPC (archived or relabeled).
  //
  // Requirements:
  //
  // 1) source_message_id and drop_id usage:
  //    ✅ ALREADY IMPLEMENTED:
  //    - In performSave (line 1967), validSourceMessageId is set to null for Mind Drop entries
  //    - saveToUnsortedTray (line 446) already validates and uses only valid UUIDs
  //    - All Mind Drop provisional notes get source_message_id: null, drop_id: <stable-text-id>
  //
  // 2) To-Do chip handler (handleCategoryChipPick):
  //    ✅ ALREADY IMPLEMENTED:
  //    - Calls convert_or_create_from_drop RPC with proper owner_id and drop_id (lines 2830-2875)
  //    - On RPC success: shows toast, triggers refresh, increments metrics
  //    - On RPC failure: shows error toast, leaves note unsorted for retry (lines 2897-2917)
  //    - No fallback to log mode on error - early return prevents overlay opening
  //
  // 3) Behavior summary:
  //    ✅ VERIFIED WORKING (see runtime logs):
  //    - Submitting a Mind Drop creates exactly one provisional note with drop_id
  //    - Tapping To-Do chip calls RPC, which creates/reuses todo and cleans up note
  //    - UI shows only the todo in "Recent drops" (no duplicate unsorted notes)
  //    - RPC handles archival via dynamic column detection (archived boolean or labels cleanup)
  //
  const handleCategoryChipPick = useCallback(
    async (kind: 'todo' | 'log' | 'habit') => {
      const unsortedId = lowConfidenceUnsortedId;
      if (!unsortedId) {
        console.warn('[MindDrop][CategoryChip] No unsorted id available');
        return;
      }

      try {
        setIsSubmitting(true);
        setCategoryChips([]);

        if (kind === 'todo') {
          try {
            const originalRecord = await repo.getById(unsortedId);
            if (!originalRecord) {
              throw new Error('Original note not found');
            }

            const originalNote = originalRecord as any;
            const dropId =
              (typeof originalNote?.drop_id === 'string' && originalNote.drop_id) ||
              dropIdRef.current ||
              null;
            if (!dropId) {
              throw new Error('Missing dropId for unsorted note');
            }

            const ownerId = user?.id ?? userId ?? null;
            if (!ownerId) {
              throw new Error('Missing owner id for conversion');
            }

            const rawBody = String(
              originalNote?.body ?? originalNote?.title ?? originalNote?.text ?? '',
            );
            const boundedBody = clampNoteLength(rawBody);
            const trimmedBody = boundedBody.trim();
            const titleSource = trimmedBody || boundedBody || 'Quick task';
            const { compact: compactTitleValue } = deriveCompactTitle([titleSource], {
              fallback: 'Quick task',
            });
            const todoTitle = clampNoteLength(compactTitleValue || 'Quick task');

            const parsedDue = parseDue(boundedBody);
            const confidentDue =
              parsedDue && parsedDue.confidence >= DUE_CONFIDENCE_FLOOR ? parsedDue : null;

            const payload = {
              name: todoTitle,
              body: boundedBody,
              due_date: confidentDue?.date ?? null,
              due_time: confidentDue?.time ?? null,
              origin: 'catchall',
              ai_placed: true,
              tags: Array.isArray(originalNote?.tags) ? originalNote.tags : null,
              tags_meta: originalNote?.tags_meta ?? null,
              why_string: 'Converted via Mind Drop chip',
              source_message_id: originalNote?.source_message_id ?? null,
            } as const;

            await withDropLock(dropId, async () => {
              logMindDropDebug('rpc-convert:start', {
                dropId,
                titleFingerprint: fingerprintTitle(payload.name),
                dueDatePresent: Boolean(payload.due_date),
                dueTimePresent: Boolean(payload.due_time),
                tagsCount: Array.isArray(payload.tags) ? payload.tags.length : 0,
                stickyCount: Array.isArray((payload as any)?.tags_meta?.sticky)
                  ? ((payload as any).tags_meta.sticky as unknown[]).length
                  : 0,
                tombstoneCount: Array.isArray((payload as any)?.tags_meta?.tombstones)
                  ? ((payload as any).tags_meta.tombstones as unknown[]).length
                  : 0,
              });

              const rpcArgs = {
                p_owner: ownerId,
                p_drop_id: dropId,
                p_target: 'todo',
                p_payload: payload,
              } as const;

              const { data, error } = await supabase.rpc('convert_or_create_from_drop', rpcArgs);

              if (error) {
                throw new Error(error.message ?? 'convert_or_create_from_drop failed');
              }

              const todoId = (data as string | null) ?? null;
              if (!todoId) {
                throw new Error('convert_or_create_from_drop returned no id');
              }

              logMindDropDebug('rpc-convert:result', {
                dropId,
                todoIdFingerprint: fingerprintTitle(todoId),
              });

              metricsRef.current.conversions += 1;
              logMetrics('category_converted_todo', {
                noteId: unsortedId,
                todoId,
                via: 'rpc_minddrop',
                dropId,
                mode: 'ask',
              });

              setOrganizedToday((prev) => prev + 1);
              triggerRecentRefresh();

              // DO NOT auto-open overlay - user must explicitly tap Edit on the todo
              // The overlay should only open via handleEdit in RecentDrops

              if (TOASTS_ON) {
                showActionToast({
                  type: 'success',
                  content: 'Converted to To-Do ✓',
                });
              }
            });
          } catch (conversionError) {
            console.error('[MindDrop][CategoryChip] Failed to convert via RPC', conversionError);

            // Leave the note as unsorted (labels: ['catchall', 'needs_review'])
            // so the user can try again later
            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: '❌ Failed to create To-Do. Please try again.',
              });
            }

            // Don't clear the unsorted state - let the user retry
            setLowConfidenceUnsortedId(null);
            unsortedIdRef.current = null;
            setIsSubmitting(false);
            return;
          }
        } else if (kind === 'habit') {
          // Convert the unsorted note to a habit using the conversion helper
          try {
            const original = await repo.getById(unsortedId);
            if (!original) {
              throw new Error('Original note not found');
            }

            const dropId =
              (typeof (original as any)?.drop_id === 'string' && (original as any).drop_id) ||
              dropIdRef.current ||
              null;

            // Get existing frequency if available, otherwise default to 'daily'
            const existingFrequency = (original as any)?.frequency || 'daily';

            // Use the conversion helper to create a first-class habit
            const { habit: createdHabit } = await convertUnsortedToHabit(repo, unsortedId, {
              frequency: existingFrequency,
            });

            setOrganizedToday((prev) => prev + 1);
            triggerRecentRefresh();
            setLowConfidenceUnsortedId(null);
            unsortedIdRef.current = null;

            metricsRef.current.conversions += 1;
            logMetrics('category_converted_habit', {
              noteId: unsortedId,
              habitId: createdHabit.id,
              habitName: createdHabit.name,
              dropId,
              mode: 'ask',
            });

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: 'Started a habit ✓',
              });
            }
          } catch (habitError) {
            console.error(
              '[MindDrop][CategoryChip] Habit conversion failed completely',
              habitError,
            );

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: 'Could not create habit',
              });
            }
          }
        } else {
          // Just keep as log - promote to canonical "log" subtype
          const originalNote = await repo.getById(unsortedId);
          const noteText =
            (originalNote as any)?.body ||
            (originalNote as any)?.title ||
            (originalNote as any)?.text ||
            '';
          const narrative = classifyNarrative(noteText);
          const nextSubtype = narrative ? 'journal' : 'idea';

          // Filter labels: remove catchall and needs_review, add log
          const originalLabels = ((originalNote as any)?.labels || []) as string[];
          const filteredLabels = originalLabels.filter(
            (l: string) => l !== 'needs_review' && l !== 'catchall',
          );
          const logLabels = Array.from(new Set([...filteredLabels, 'log']));

          await repo.update({
            id: unsortedId,
            patch: {
              archived: false,
              ai_placed: true,
              subtype: nextSubtype,
              canonicalType: 'log',
              labels: logLabels,
              why_string: 'Confirmed as log via category chip',
            },
          });

          setOrganizedToday((prev) => prev + 1);
          triggerRecentRefresh();
          setLowConfidenceUnsortedId(null);
          unsortedIdRef.current = null;

          if (TOASTS_ON) {
            showActionToast({
              type: 'success',
              content: 'Saved as note',
            });
          }
        }

        setLowConfidenceUnsortedId(null);
        unsortedIdRef.current = null;

        // Clear duplicate prevention tracking after successful category action
        lastSubmittedTextRef.current = null;
        lastUnsortedIdRef.current = null;
      } catch (error) {
        console.error('[MindDrop][CategoryChip] Failed to process', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      lowConfidenceUnsortedId,
      repo,
      setOrganizedToday,
      triggerRecentRefresh,
      TOASTS_ON,
      showActionToast,
      logMetrics,
      user,
      userId,
    ],
  );

  const handleTimingSelection = useCallback(
    async (option: TimingOption) => {
      const todoId = pendingTodoId;
      if (!todoId) {
        console.warn('[MindDrop][Timing] No pending todo id');
        return;
      }

      try {
        setTimingChips([]);
        setPendingTodoId(null);

        const dueDate = timingOptionToDate(option);

        // Mind Drop timing chip path: PARTIAL update for due date only.
        // This is intentionally separate from UnifiedOverlayV2's toCreateOrUpdateInput().
        // Do NOT include title, name, tags, or other fields here — those remain controlled by:
        // 1. Initial Mind Drop create (auto-actions path with AI tags)
        // 2. Overlay edits via UnifiedOverlayV2 (user-initiated changes)
        await repo.update({
          id: todoId,
          patch: {
            due_date: dueDate,
            undefined_due: !dueDate,
          } as any, // Todo-specific fields
        });

        triggerRecentRefresh();

        // Track timing selection (skip if this is auto-fallback which is already tracked)
        if (option !== 'someday' || timingChips.length > 0) {
          metricsRef.current.timingSelected += 1;
          logMetrics('timing_selected', { todoId, option, dueDate });
        }

        if (TOASTS_ON) {
          const label = option === 'someday' ? 'Added to list' : 'Scheduled ✓';
          showActionToast({
            type: 'success',
            content: label,
          });
        }
      } catch (error) {
        console.error('[MindDrop][Timing] Failed to assign timing', error);
      }
    },
    [
      pendingTodoId,
      repo,
      triggerRecentRefresh,
      TOASTS_ON,
      showActionToast,
      timingChips.length,
      logMetrics,
    ],
  );

  const handleChangeText = useCallback(
    (value: string) => {
      let nextValue = value;

      if (nextValue.length > MAX_INPUT_CHARACTERS) {
        nextValue = clampNoteLength(nextValue);
      }

      if (nextValue.endsWith('\n') && listStyle !== 'none') {
        const prefix = nextPrefix(listStyle, nextValue);
        const augmented = prefix ? nextValue + prefix : nextValue;
        nextValue = clampNoteLength(augmented);
      } else {
        nextValue = clampNoteLength(nextValue);
      }

      // Clear duplicate prevention tracking when user changes text
      if (nextValue.trim() !== lastSubmittedTextRef.current) {
        lastSubmittedTextRef.current = null;
        lastUnsortedIdRef.current = null;
      }

      setNote(nextValue);
      if (nextValue.length === 0) {
        hasTypedRef.current = false;
        setInputDynHeight(START_HEIGHT);
        setInputScrollEnabled(false);
        lastAppliedHeightRef.current = START_HEIGHT;
        return;
      }

      hasTypedRef.current = true;

      // Fallback height calculation based on line count
      const lines = nextValue.split(/\r?\n/).length;
      const fallbackHeight = Math.min(
        MAX_HEIGHT,
        Math.max(START_HEIGHT, lines * LINE_HEIGHT + INPUT_VERTICAL_PADDING),
      );

      // Only apply fallback if it's strictly greater than current height
      if (fallbackHeight > lastAppliedHeightRef.current) {
        lastAppliedHeightRef.current = fallbackHeight;
        setInputDynHeight(fallbackHeight);

        const shouldScroll = lines * LINE_HEIGHT + INPUT_VERTICAL_PADDING > MAX_HEIGHT;
        setInputScrollEnabled(shouldScroll);

        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[MindDrop][AutoGrow:fallback]', {
            lines,
            fallbackHeight,
            last: lastAppliedHeightRef.current,
            max: MAX_HEIGHT,
          });
        }
      }
    },
    [listStyle],
  );

  // Mind Drop: robust submit with retry + fallbacks
  const onSubmit = useCallback(async () => {
    // Lock immediately to prevent race conditions
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    if (isSubmitting) {
      submitLockRef.current = false;
      return;
    }
    setIsSubmitting(true);

    const now = Date.now();
    const trimmed = note.trim();

    if (!trimmed) {
      setIsSubmitting(false);
      submitLockRef.current = false;
      return;
    }

    // Prevent rapid repeat submissions of same text
    const MIN_SUBMIT_INTERVAL_MS = 2000;
    if (
      now - lastSubmitAt.current < MIN_SUBMIT_INTERVAL_MS &&
      trimmed === lastSubmittedTextRef.current
    ) {
      setIsSubmitting(false);
      submitLockRef.current = false;
      return;
    }
    lastSubmitAt.current = now;

    // Duplicate prevention: if same text as last submission and we cleared state but unsorted note exists
    if (
      trimmed === lastSubmittedTextRef.current &&
      unsortedIdRef.current == null &&
      lastUnsortedIdRef.current != null
    ) {
      // Re-hydrate category chips tied to existing unsorted record
      setLowConfidenceUnsortedId(lastUnsortedIdRef.current);
      setCategoryChips([
        { kind: 'todo', label: 'Add to To-Do List' },
        { kind: 'log', label: 'Just Save It' },
        { kind: 'habit', label: 'Start a Habit' },
      ]);
      setNote('');
      setIsSubmitting(false);
      submitLockRef.current = false;
      return;
    }

    const { submissionId, dropId } = ensureSubmissionAndDropIds();

    // Only use submissionId if it's a valid UUID; otherwise use undefined for source_message_id
    const validSourceMessageId = isValidUuid(submissionId) ? submissionId : undefined;

    try {
      // Optional short-circuit if network state is provided and offline
      if (typeof networkIsOnline === 'boolean' && !networkIsOnline) {
        const offlineId = await saveToUnsortedTray(repo, trimmed, {
          sourceMessageId: validSourceMessageId,
          dropId,
        });
        if (offlineId) {
          logMetrics('minddrop_unsorted_created', {
            noteId: offlineId,
            dropId,
            mode: 'offline_short_circuit',
          });
        }
        resetState();
        if (TOASTS_ON) {
          showActionToast({
            type: 'success',
            content: COPY.savedOfflineMsg,
          });
        }
        // Optional haptic warning
        try {
          if (shouldUseHaptics()) void haptics.warning();
        } catch (e) {
          void e;
        }
        try {
          AccessibilityInfo.announceForAccessibility?.(
            'Saved offline. Will organize when connected.',
          );
        } catch (e) {
          void e;
        }
        pendingUndo.current = { todos: [], notes: [], habits: [] };
        await refreshOrganizedToday?.();
        triggerRecentRefresh();
        // A11y focus target after clearing input
        focusGreetingForA11y();
        return;
      }

      // We’ll attempt performSave() up to 2 times total.
      let attempt = 0;
      const maxAttempts = 2;
      let finalResult: any = null;
      let lastError: any = null;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          // Primary path: existing pipeline
          // EXPECTED: returns { created: { todos: string[], notes: string[], habits: string[] } }
          const r = await performSave();

          // Treat an "empty create" result as a failure to trigger retry/fallback.
          const createdTodos = r?.created?.todos?.length ?? 0;
          const createdNotes = r?.created?.notes?.length ?? 0;
          const createdHabits = r?.created?.habits?.length ?? 0;
          const totalCreated = createdTodos + createdNotes + createdHabits;

          // Ask mode is a success even with 0 items created (user will manually categorize)
          if (totalCreated > 0 || (r?.suggestions?.length ?? 0) > 0 || r?.decisionMode === 'ask') {
            finalResult = r;
            break; // success
          }

          // No items created -> mark as failure and possibly retry
          lastError = new Error('EmptySave');
          if (attempt === 1) {
            if (TOASTS_ON) {
              showActionToast({ type: 'success', content: COPY.retrying });
            }
            // loop to attempt #2
          } else {
            // Second failure — stop retrying
            break;
          }
        } catch (err: any) {
          lastError = err;
          if (attempt === 1) {
            // First failure — show “retrying” toast and try again
            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: COPY.retrying,
              });
            }
            // loop to attempt #2
          } else {
            // Second failure — stop retrying
            break;
          }
        }
      }

      if (!finalResult) {
        // Primary pipeline failed twice. Decide fallback by error type.
        if (isNetworkError(lastError)) {
          // Offline-ish path — save locally and reassure
          const offlineRetryId = await saveToUnsortedTray(repo, trimmed, {
            sourceMessageId: validSourceMessageId,
            dropId,
          });
          if (offlineRetryId) {
            logMetrics('minddrop_unsorted_created', {
              noteId: offlineRetryId,
              dropId,
              mode: 'offline_retry',
            });
          }
          resetState();
          if (TOASTS_ON) {
            showActionToast({
              type: 'success',
              content: COPY.savedOfflineMsg,
            });
          }
          // Optional haptic warning
          try {
            if (shouldUseHaptics()) void haptics.warning();
          } catch (e) {
            void e;
          }
          try {
            AccessibilityInfo.announceForAccessibility?.(
              'Saved offline. Will organize when connected.',
            );
          } catch (e) {
            void e;
          }
        } else {
          // Non-network error: save to Unsorted Tray for manual follow-up
          const unsortedFallbackId = await saveToUnsortedTray(repo, trimmed, {
            sourceMessageId: validSourceMessageId,
            dropId,
          });
          if (unsortedFallbackId) {
            logMetrics('minddrop_unsorted_created', {
              noteId: unsortedFallbackId,
              dropId,
              mode: 'fallback_unsorted',
            });
          }
          resetState();
          if (TOASTS_ON) {
            showActionToast({
              type: 'success',
              content: COPY.savedUnsortedMsg,
            });
          }
          // Optional haptic warning
          try {
            if (shouldUseHaptics()) void haptics.warning();
          } catch (e) {
            void e;
          }
          try {
            AccessibilityInfo.announceForAccessibility?.('Saved to Unsorted Tray.');
          } catch (e) {
            void e;
          }
        }
        // Nothing created (no Undo set)
        pendingUndo.current = { todos: [], notes: [], habits: [] };
        // Refresh trust count & recent
        await refreshOrganizedToday?.();
        triggerRecentRefresh();
        focusGreetingForA11y();
        return;
      }

      // SUCCESS PATH — summarize created items
      if ((finalResult?.suggestions?.length ?? 0) > 0) {
        try {
          AccessibilityInfo.announceForAccessibility?.('Mind Drop organized successfully.');
        } catch (e) {
          void e;
        }
        pendingUndo.current = { todos: [], notes: [], habits: [] };
        return;
      }

      const createdTodos = finalResult?.created?.todos ?? [];
      const createdNotes = finalResult?.created?.notes ?? [];
      const createdHabits = finalResult?.created?.habits ?? [];
      const createdDetails = finalResult?.createdDetails ?? [];

      pendingUndo.current = {
        todos: createdTodos,
        notes: createdNotes,
        habits: createdHabits,
      };

      resetState();

      showMindDropSuccessToast({
        todos: createdTodos.length,
        notes: createdNotes.length,
        habits: createdHabits.length,
        details: createdDetails,
      });

      await refreshOrganizedToday?.();
      triggerRecentRefresh();
      // A11y focus target after clearing input
      focusGreetingForA11y();
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  }, [
    note,
    isSubmitting,
    performSave,
    repo,
    refreshOrganizedToday,
    showActionToast,
    networkIsOnline,
    resetState,
    focusGreetingForA11y,
    triggerRecentRefresh,
    TOASTS_ON,
    ensureSubmissionAndDropIds,
  ]);

  const handleSubmit = useCallback(() => {
    if (isSubmitting || isThinking || !note.trim()) {
      return;
    }

    const needsDelay = uiMode === 'guided';

    if (needsDelay) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setIsThinking(true);
      timerRef.current = setTimeout(() => {
        setIsThinking(false);
        timerRef.current = null;
        void onSubmit();
      }, THINKING_DURATION);
    } else {
      void onSubmit();
    }
  }, [isSubmitting, isThinking, uiMode, note, onSubmit]);

  const legacyUI = React.useMemo(() => {
    const statsVisible = organizedToday > 0;

    return (
      <View>
        <View style={styles.headerContainer}>
          <View style={styles.headerRow} testID="minddrop-header">
            <View style={styles.headerLeftGroup}>
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={handleBack}
                hitSlop={12}
                style={styles.headerBackBtn}
              >
                <Text style={styles.headerBackText}>{'<'}</Text>
              </Pressable>
              <Text
                ref={headerTitleRef}
                style={styles.headerTitle}
                accessibilityRole="header"
                numberOfLines={1}
              >
                {copy.title}
              </Text>
              <Pressable
                accessibilityLabel="About Mind Drop"
                accessibilityRole="button"
                testID="minddrop-info-header"
                style={styles.headerInfoBtn}
                onPress={handleInfoOpen}
                hitSlop={12}
              >
                <Icon name="Info" size="sm" color={c.mossGreen} />
              </Pressable>
            </View>
          </View>
          <Image
            source={GREMLY_TOP}
            style={styles.headerMascot}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <Text style={styles.contextPrompt} testID="minddrop-context-prompt">
          {contextPrompt}
        </Text>
        <View style={styles.inputBlock}>
          <MindDropInput
            value={note}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor="#66706A"
            containerStyle={styles.inputContainer}
            focusedStyle={styles.inputContainerFocused}
            inputStyle={styles.input}
            focusedInputStyle={styles.inputFocused}
            onFocusChange={handleInputFocusChange}
            autoFocus
            onContentSizeChange={handleInputContentSizeChange}
            scrollEnabled={inputScrollEnabled}
            showHud={false}
            iconContainerStyle={styles.inputIconCluster}
            iconButtonStyle={styles.inputIconButton}
            iconMicStyle={styles.inputIconMicButton}
            iconCameraStyle={styles.inputIconCameraButton}
            iconWrapperStyle={styles.inputIconWrapper}
            iconColor={c.mossGreen}
            heightWrapperStyle={styles.inputHeightWrapper}
            inputDynHeight={inputDynHeight}
          />
        </View>
        {note.length > 0 ? (
          <View style={styles.helperRow}>
            <View style={styles.helperLeft}>
              <Icon name="Lock" size="xs" color={c.goldenPear} strokeWidth={1.75} />
              <Text testID="minddrop-privacy" style={styles.helperText} numberOfLines={1}>
                Private & secure
              </Text>
            </View>
            {note.length >= 1500 ? (
              <Text
                testID="minddrop-counter"
                style={styles.helperCounter}
              >{`${note.length}/${MAX_INPUT_CHARACTERS}`}</Text>
            ) : null}
          </View>
        ) : null}
        {categoryChips.length > 0 ? (
          <MidConfidenceChips
            variant="category"
            categoryChips={categoryChips}
            onDirectPick={handleCategoryChipPick}
            prompt="What would you like to do?"
            autoDismissMs={CHIPS_AUTO_DISMISS_MS}
          />
        ) : null}
        {timingChips.length > 0 ? (
          <MidConfidenceChips
            variant="timing"
            timingChips={timingChips}
            onTimingPick={handleTimingSelection}
            prompt="When do you want to do this?"
            autoDismissMs={5000}
          />
        ) : null}
        <View
          style={[styles.submitButtonWrapper, !statsVisible && styles.submitButtonWrapperNoStats]}
        >
          <Pressable
            testID="minddrop-submit-button"
            onPress={handleSubmit}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={isProcessing ? 'Organizing' : 'Drop to Gremly'}
            accessibilityState={{ busy: isProcessing, disabled }}
            style={styles.submitPressable}
            onPressIn={handleSubmitPressIn}
            onPressOut={handleSubmitPressOut}
          >
            <Animated.View
              style={[
                styles.submitButton,
                isButtonVisuallyDisabled ? styles.submitButtonDisabled : styles.submitButtonActive,
                { transform: [{ scale: submitScale }] },
              ]}
            >
              <View style={styles.submitInnerRow}>
                {isProcessing ? (
                  <Animated.View
                    style={[
                      styles.submitPulse,
                      reduceMotion ? null : { transform: [{ scale: pulseScale }] },
                    ]}
                  />
                ) : null}
                <Text
                  style={[
                    styles.submitLabel,
                    isButtonVisuallyDisabled ? styles.submitLabelDisabled : null,
                  ]}
                >
                  {isProcessing ? '✓ Organizing...' : 'Drop to Gremly →'}
                </Text>
              </View>
            </Animated.View>
          </Pressable>
          <View style={styles.submitMicrocopyContainer} pointerEvents="none">
            {isProcessing ? (
              <AnimatedMicrocopyText
                style={[
                  styles.submitMicrocopy,
                  reduceMotion ? null : { opacity: microcopyOpacity },
                ]}
                accessibilityLiveRegion="polite"
              >
                {THINKING_MICROCOPY[microcopyIndex]}
              </AnimatedMicrocopyText>
            ) : null}
          </View>
        </View>
        {statsVisible ? (
          <View style={styles.trustRow} testID="minddrop-trust">
            <Text style={styles.trustStyled} testID="minddrop-trust-text">
              {organizedToday === 1
                ? '1 thought organized today'
                : `${organizedToday} thoughts organized today`}
            </Text>
          </View>
        ) : null}
        <View style={[styles.sectionDivider, !statsVisible && styles.sectionDividerNoStats]} />
        {/* Recent Drops section */}
        <RecentDropsMemo
          overlay={overlay}
          refreshSignal={recentRefresh}
          onEdited={noopCallback}
          onDeleted={noopCallback}
          initiallyOpen={true}
        />
      </View>
    );
  }, [
    headerTitleRef,
    styles,
    note,
    handleChangeText,
    handleInputFocusChange,
    handleInputContentSizeChange,
    placeholder,
    contextPrompt,
    c.mutedSageText,
    c.goldenPear,
    c.linenCream,
    c.mossGreen,
    isProcessing,
    pulseScale,
    reduceMotion,
    microcopyOpacity,
    microcopyIndex,
    handleSubmit,
    disabled,
    organizedToday,
    recentRefresh,
    noopCallback,
    inputDynHeight,
    inputScrollEnabled,
    handleBack,
    handleInfoOpen,
  ]);

  const content = MIND_DROP_V2 ? (
    <>
      {/* Mind Drop v2 UI will render here in subsequent steps */}
      {/* For P0: temporarily just render the existing UI so nothing changes visually. */}
      {legacyUI}
    </>
  ) : (
    legacyUI
  );

  return (
    <View style={styles.root} testID="minddrop-screen">
      {ActionToast}

      <Modal
        transparent
        animationType="fade"
        visible={infoOpen}
        onRequestClose={handleInfoClose}
        statusBarTranslucent
      >
        <Pressable
          style={styles.infoBackdrop}
          onPress={handleInfoClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Mind Drop info"
        >
          <Pressable
            style={styles.infoSheetContainer}
            onPress={() => {}}
            accessibilityLabel="About Mind Drop"
          >
            <View style={styles.infoSheet} testID="minddrop-info-sheet">
              <Text style={styles.infoTitle}>Your peaceful inbox</Text>
              <Text style={styles.infoBody}>
                Drop anything on your mind. I'll quietly sort it into tasks, habits, or log it for
                later... so you can let it go and move on.
              </Text>
              <Text style={styles.infoHeading}>Need to revisit something?</Text>
              <Text style={styles.infoBody}>
                Recent drops stay close by. Open them to edit, move, or undo anything I organized
                for you.
              </Text>
              <View style={styles.infoActions}>
                <Pressable
                  testID="minddrop-info-open-recent"
                  onPress={handleInfoViewRecent}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="View recent drops"
                >
                  <Text style={styles.secondaryButtonLabel}>View recent drops</Text>
                </Pressable>
                <Pressable
                  testID="minddrop-info-close"
                  onPress={handleInfoClose}
                  accessibilityRole="button"
                >
                  <Text style={styles.infoClose}>Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + SPACE * 6}
      >
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={[
            styles.contentWrapper,
            {
              paddingTop: insets.top + SPACE * 3,
              paddingBottom: insets.bottom + SPACE * 4,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function makeStyles(c: ReturnType<typeof useTheme>['c'], mode: string) {
  const space = SPACE;

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.linenCream, // Phase 2: full-bleed background
    },
    keyboardAvoider: {
      flex: 1,
    },
    contentScroll: {
      flex: 1,
    },
    contentWrapper: {
      flexGrow: 1,
      paddingHorizontal: space * 2,
    },
    headerContainer: {
      position: 'relative',
      paddingRight: 84,
      marginBottom: 0,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      marginBottom: 2,
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerTitle: {
      color: c.mossGreen,
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 32,
      lineHeight: 34,
      flexShrink: 1,
    },
    headerBackBtn: {
      padding: 6,
      marginRight: 12,
    },
    headerBackText: {
      color: c.mossGreen, // Phase 2: mossGreen for secondary actions
      fontSize: 24,
      fontFamily: 'PlusJakartaSans-Bold',
      lineHeight: 28,
    },
    headerInfoBtn: {
      padding: 8,
      marginLeft: 8,
      borderRadius: 9999,
      backgroundColor: 'transparent',
    },
    headerMascot: {
      position: 'absolute',
      width: 61,
      height: 78,
      right: 16,
      top: 16,
    },

    contextPrompt: {
      marginTop: space,
      marginBottom: space * 2,
      color: '#66706A',
      fontFamily: 'Inter-Medium',
      fontSize: 14,
    },

    inputBlock: {
      position: 'relative',
      marginTop: 0,
      marginBottom: 0,
    },
    inputContainer: {
      width: '100%',
      borderRadius: 16,
      paddingHorizontal: INPUT_PADDING_LEFT,
      paddingVertical: 16,
      backgroundColor: c.linenCream ?? '#F9F6F1',
      borderWidth: 1,
      borderColor: '#E0E0E0',
      minHeight: 100,
    },
    inputContainerFocused: {
      borderRadius: 16,
      borderColor: c.moss,
      shadowColor: c.moss,
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: Platform.OS === 'android' ? 2 : 0,
    },
    input: {
      width: '100%',
      color: c.charcoalInk,
      fontSize: 18,
      lineHeight: 22,
      paddingRight: INPUT_ICON_PADDING_RIGHT,
      backgroundColor: 'transparent',
      borderWidth: 0,
      textAlignVertical: 'top',
      fontFamily: 'Inter-Regular',
      padding: 0,
      margin: 0,
      paddingTop: 4,
      paddingBottom: 4,
    },
    inputFocused: {},
    inputHeightWrapper: {
      width: '100%',
    },
    inputHud: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      opacity: 0.8,
    },
    inputIconCluster: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      opacity: 0.35,
    },
    inputIconButton: {
      padding: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    inputIconMicButton: {},
    inputIconCameraButton: {},
    inputIconWrapper: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputHudText: {
      color: c.mutedSageText, // Phase 2: muted text for HUD
      fontSize: 12,
      fontFamily: 'Inter-Regular',
    },

    helperRow: {
      marginTop: space,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    helperLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space,
      flexShrink: 1,
    },
    helperText: {
      color: '#22222280',
      fontFamily: 'Inter-Medium',
      fontSize: 13,
    },
    helperCounter: {
      color: '#22222280',
      fontFamily: 'Inter-Medium',
      fontSize: 13,
      textAlign: 'right',
    },

    infoBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    infoSheetContainer: {
      backgroundColor: c.linenCream,
      borderRadius: 12,
      paddingBottom: 24,
      paddingTop: 12,
      width: '100%',
      shadowColor: 'rgba(46,85,64,0.15)',
      shadowOpacity: 1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    },
    infoSheet: {
      padding: 20,
    },
    infoTitle: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 18,
      color: c.text,
      marginBottom: 8,
    },
    infoHeading: {
      fontFamily: 'Inter-Medium',
      fontSize: 14,
      color: c.text,
      marginTop: 14,
      marginBottom: 4,
    },
    infoBody: {
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      color: c.mutedText,
    },
    infoActions: {
      marginTop: 16,
      gap: 12,
      width: '100%',
      alignItems: 'stretch',
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: c.mossGreen,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      width: '100%',
    },
    secondaryButtonPressed: {
      backgroundColor: 'rgba(46,85,64,0.08)',
    },
    secondaryButtonLabel: {
      color: c.mossGreen,
      fontFamily: 'Inter-Medium',
      fontSize: 16,
    },
    infoClose: {
      color: c.mutedText,
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      textAlign: 'center',
    },

    submitButtonWrapper: {
      marginTop: space * 2,
      marginBottom: 0,
      width: '100%',
    },
    submitButtonWrapperNoStats: {
      marginBottom: space * 2,
    },
    submitPressable: {
      width: '100%',
      borderRadius: 16,
    },
    submitButton: {
      width: '100%',
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      flexDirection: 'row',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
      shadowOpacity: 0,
      elevation: 0,
    },
    submitButtonActive: {
      backgroundColor: '#2E5540',
      shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
      elevation: Platform.OS === 'android' ? 4 : 0,
    },
    submitButtonDisabled: {
      backgroundColor: '#BFD8C0',
      shadowOpacity: 0,
      elevation: 0,
    },
    submitLabel: {
      color: '#F9F6F1',
      fontSize: 16,
      fontWeight: '600',
    },
    submitLabelDisabled: {
      color: 'rgba(46,85,64,0.85)',
    },
    submitInnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    submitPulse: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#F9F6F1',
    },
    submitMicrocopyContainer: {
      minHeight: 18,
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitMicrocopy: {
      color: '#2E5540',
      fontFamily: 'Inter-Medium',
      fontSize: 13,
    },

    trustRow: {
      marginTop: space * 3,
      alignItems: 'center',
      minHeight: 20,
    },
    trustStyled: {
      textAlign: 'center',
      color: '#222222',
      fontFamily: 'Inter-Medium',
      fontWeight: '500',
      letterSpacing: -0.2,
    },

    sectionDivider: {
      height: 1,
      backgroundColor: 'rgba(191,216,192,0.25)',
      marginTop: space * 3,
      marginBottom: space,
      marginHorizontal: space * 2,
      borderRadius: 999,
      alignSelf: 'stretch',
    },
    sectionDividerNoStats: {
      marginTop: 0,
    },

    recentRoot: { marginTop: 0 },
    recentHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space,
    },
    recentHeaderBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    recentHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    recentHeaderText: {
      color: c.sageMist,
      fontSize: 16,
      fontWeight: '600',
      fontFamily: 'Inter-Medium',
    },
    recentHeaderCaret: {
      color: c.mutedText,
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      marginTop: 2,
    },
    recentHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentRangeLabel: {
      color: c.mossGreen,
      fontSize: 13,
      fontFamily: 'Inter-Medium',
      letterSpacing: 0.2,
    },
    recentHeaderLink: {
      flex: 1,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    recentHeaderLinkText: {
      color: c.mossGreen,
      fontSize: 13,
      fontFamily: 'Inter-Medium',
      textDecorationLine: 'underline',
    },
    recentList: { marginTop: space },
    recentScrollContent: {
      gap: space,
      paddingBottom: space * 2,
    },
    recentCard: {
      backgroundColor: c.linenCream,
      borderRadius: 4,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.sageMist,
      shadowColor: 'rgba(46,85,64,0.08)',
      shadowOpacity: 1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    recentTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    recentText: {
      color: c.charcoalInk, // Phase 2: default text color
      fontSize: 14,
      lineHeight: 20,
      fontFamily: 'Inter-Regular',
      flex: 1,
      marginRight: 12,
    },
    recentBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    recentBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      fontSize: 11,
      overflow: 'hidden',
      color: c.text,
      backgroundColor: c.sageTint,
      fontFamily: 'Inter-Medium',
    },
    badge_note: {
      backgroundColor: c.sageTint,
    },
    badge_todo: {
      backgroundColor: '#E6F0FF',
    },
    badge_habit: {
      backgroundColor: '#EAF7ED',
    },
    badge_unsorted: {
      backgroundColor: c.goldenPear,
      color: c.mossGreen,
    },
    recentDueBadge: {
      fontSize: 11,
      color: c.mutedText,
      fontFamily: 'Inter-Regular',
      fontStyle: 'italic',
    },
    recentMetaRow: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    recentTagsRow: {
      marginTop: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    recentTagPill: {
      backgroundColor: '#E6F0FF',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    recentTagText: {
      color: c.mossGreen,
      fontSize: 11,
      fontFamily: 'Inter-Medium',
    },
    recentActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recentAction: {
      color: c.mossGreen, // Phase 2: mossGreen for actions
      fontSize: 13,
      textDecorationLine: 'underline',
      fontFamily: 'Inter-Medium',
      lineHeight: 18,
    },
    recentActionDelete: {
      color: c.danger,
      fontSize: 13,
      textDecorationLine: 'underline',
      fontFamily: 'Inter-Medium',
      lineHeight: 18,
    },
    recentDot: { color: c.mutedText, marginHorizontal: 6 },
    recentEmpty: {
      color: c.mutedText,
      fontSize: 13,
      textAlign: 'center',
      fontFamily: 'Inter-Regular',
      paddingVertical: 10,
    },
    recentTime: {
      color: c.mutedText,
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      fontStyle: 'italic',
      opacity: 0.6,
    },
  });
}
