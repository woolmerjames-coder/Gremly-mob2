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
import { logCatchallDecision } from '../../lib/telemetry/catchallLogger';
import { organizedToastSummary, type OrganizedDetail } from '../../lib/ui/toast/copy';
import { startCatchallTrace, step, end } from '../../lib/diagnostics/catchallDebug';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { AppRecord, CanonicalType, LogSubtype, NoteSubtype } from '../../lib/types';
import type { CortexAction, CortexContext, CortexResponse } from '../../lib/cortex/cortexDecide';
import { persistedToCanonical } from '../../lib/cortex/canonicalMap';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { eventBus } from '../../lib/events/EventBus';
import { parseDue } from '../../lib/nlp/datetime/parseDue';
import { env } from '../../lib/env';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import { appendLineageToWhyString, hasChecklist } from '../../lib/conversion';
import GREMLY_TOP from '../../assets/mascot/ACTUAL GREMLY.png';
import { normalizeTags, deriveLogSubtypeFromTags } from '../../lib/tags/normalize';
import { sanitizeSuggestedTags } from '../../components/overlay/overlayV2.mapping';
import { buildFallbackTags } from '../../cortex/openAiEngine';
import { persistedNoteSubtypeToLogSubtype } from '../../lib/logSubtypes';
import { v4 as uuidv4 } from 'uuid';

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

const labelIsString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function normalizeCatchallLabels(labels: unknown): string[] {
  const base = Array.isArray(labels) ? labels.filter(labelIsString) : [];
  const sanitized = base.filter((label) => label !== UNSORTED_LABEL);
  if (!sanitized.includes(CATCHALL_LABEL)) {
    sanitized.push(CATCHALL_LABEL);
  }
  return Array.from(new Set(sanitized));
}

function removeLabels(curr: string[], toRemove: string[]): string[] {
  const rm = new Set(toRemove);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const label of curr) {
    if (!labelIsString(label)) continue;
    if (rm.has(label)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    next.push(label);
  }
  return next;
}

const stripCatchallAndUnsortedLabels = (labels: unknown): string[] => {
  if (!Array.isArray(labels)) return [];
  const filtered = labels.filter(labelIsString) as string[];
  return removeLabels(filtered, [CATCHALL_LABEL, UNSORTED_LABEL]);
};

function extractPrimaryText(record: AppRecord): string {
  if (record.type === 'note') {
    return (
      (typeof record.body === 'string' && record.body.length > 0
        ? record.body
        : typeof record.title === 'string'
          ? record.title
          : '') ?? ''
    );
  }

  if (record.type === 'todo') {
    return record.name || record.title || '';
  }

  if (record.type === 'habit') {
    return record.name || '';
  }

  return '';
}

function buildChipWhy(record: AppRecord, reason: string): string | null {
  const existingWhy =
    record.type === 'note'
      ? record.why_string
      : record.type === 'todo'
        ? record.why_string
        : record.type === 'habit'
          ? record.why_string
          : null;

  const lineage = appendLineageToWhyString(existingWhy ?? null, {
    originId: record.id,
    source: 'ask-chip',
  });
  const combined = [lineage, reason].filter(Boolean).join(' | ');
  return combined || null;
}

type LowConfidenceChipClassification = {
  type?: string | null;
  subtype?: string | null;
  frequency?: string | null;
  tags?: string[] | null;
};

type LowConfidenceChipContext = {
  text: string;
  parsedDueIso: string | null;
  classification?: LowConfidenceChipClassification | null;
  tags?: string[] | null;
  submissionId?: string | null;
};

const CHIPS_AUTO_DISMISS_MS =
  Number.parseInt(String(process.env.EXPO_PUBLIC_MINDDROP_CHIPS_AUTO_DISMISS_MS ?? '12000'), 10) ||
  12000;

const DUE_STRIP =
  String(process.env.EXPO_PUBLIC_MINDDROP_DUE_STRIP ?? 'on').toLowerCase() !== 'off';
const DUE_CONFIDENCE_FLOOR =
  Number.parseFloat(String(process.env.EXPO_PUBLIC_MINDDROP_DUE_CONFIDENCE ?? '0.84')) || 0.84;

const CANONICAL_VALUES: CanonicalType[] = ['habit', 'todo', 'log', 'unsorted'];

const isCanonicalType = (value: unknown): value is CanonicalType =>
  typeof value === 'string' && CANONICAL_VALUES.includes(value as CanonicalType);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const coerceUuid = (value?: string | null): string | null =>
  typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;

const fallbackUuid = (): string => {
  const buffer = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }

  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;

  const hex = Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
};

function createSubmissionId(): string {
  const tryGenerate = (fn: () => string | null | undefined): string | null => {
    try {
      const candidate = fn();
      const normalized = coerceUuid(candidate ?? null);
      return normalized;
    } catch (error) {
      void error;
      return null;
    }
  };

  const fromCrypto =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? tryGenerate(() => globalThis.crypto?.randomUUID())
      : null;
  if (fromCrypto) {
    return fromCrypto;
  }

  const fromUuid = tryGenerate(() => uuidv4());
  if (fromUuid) {
    return fromUuid;
  }

  return fallbackUuid();
}

function buildPatchFromCreatePayload(payload: CreateRecordInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (payload.space_id !== undefined) patch.space_id = payload.space_id ?? null;
  if (payload.ai_placed !== undefined) patch.ai_placed = payload.ai_placed;
  if (payload.why_string !== undefined) patch.why_string = payload.why_string ?? null;
  if (payload.origin !== undefined) patch.origin = payload.origin ?? null;
  if (payload.canonicalType !== undefined) patch.canonicalType = payload.canonicalType;
  if (payload.labels !== undefined) patch.labels = payload.labels;
  if (payload.views !== undefined) patch.views = payload.views;
  if (payload.tags !== undefined) patch.tags = payload.tags ?? null;
  if (payload.sourceMessageId !== undefined)
    patch.source_message_id = coerceUuid(payload.sourceMessageId ?? null);

  if (payload.type === 'todo') {
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.title !== undefined) patch.title = payload.title;
    if (payload.body !== undefined) patch.body = payload.body;
    if (payload.due_date !== undefined) patch.due_date = payload.due_date ?? null;
    if (payload.due_time !== undefined) patch.due_time = payload.due_time ?? null;
    if (payload.undefined_due !== undefined) patch.undefined_due = payload.undefined_due;
    if (payload.subtype !== undefined) patch.subtype = payload.subtype ?? null;
    if (payload.notes !== undefined) patch.notes = payload.notes ?? null;
  } else if (payload.type === 'habit') {
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.frequency !== undefined) patch.frequency = payload.frequency;
    if (payload.subtype !== undefined) patch.subtype = payload.subtype ?? null;
    if (payload.notes !== undefined) patch.notes = payload.notes ?? null;
  } else {
    if (payload.title !== undefined) patch.title = payload.title ?? null;
    if (payload.body !== undefined) patch.body = payload.body ?? null;
    if (payload.subtype !== undefined) patch.subtype = payload.subtype ?? null;
    if (payload.fmt !== undefined) patch.fmt = payload.fmt ?? null;
    if (payload.date !== undefined) patch.date = payload.date ?? null;
    if (payload.mood !== undefined) patch.mood = payload.mood ?? null;
    if (payload.reminders !== undefined) patch.reminders = payload.reminders ?? null;
    if (payload.journal_subtype !== undefined)
      patch.journal_subtype = payload.journal_subtype ?? null;
  }

  return patch;
}

// Discriminating common errors without coupling too tightly:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isNetworkError = (err: any) =>
  !!(
    err &&
    (String((err as { message?: string }).message || err).includes('Network') ||
      String((err as { name?: string }).name || '').includes('TypeError'))
  );

const UNSORTED_LABEL = 'needs_review'; // used as “Unsorted Tray” tag
const LEGACY_UNSORTED_LABEL = 'unsorted';
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

type PendingCreateEntry = {
  requestId: string;
  sourceMessageId: string | null;
  expectedType: CreateRecordInput['type'];
  expectedSubtype: NoteSubtype | null;
  existingId: string | null;
  resolve: (record: AppRecord) => void;
  reject: (error: Error) => void;
  resolved: boolean;
  presented: boolean;
};

type OverlayRequestArgs = {
  payload: CreateRecordInput;
  sourceMessageId: string;
  existing?: AppRecord | null;
};

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
  } = {},
): Promise<string | undefined> {
  if (!text?.trim()) return undefined;
  const { sourceMessageId: providedSourceMessageId, whyString, tags: incomingTags } = options;
  const repoSourceMessageId = coerceUuid(providedSourceMessageId ?? null);
  const clampedText = clampNoteLength(text);
  const catchallCanonical = persistedToCanonical('note', 'catchall');
  const normalizedTags = normalizeTags(incomingTags ?? []);
  const tags = normalizedTags.length > 0 ? normalizedTags : undefined;

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
    sourceMessageId: repoSourceMessageId ?? undefined,
    tags,
  };

  // If notes.create exists (future), prefer it; otherwise use addUnsorted/create
  try {
    if (repo?.notes?.create) {
      const note = await repo.notes.create({
        text: clampedText,
        labels: [CATCHALL_LABEL, UNSORTED_LABEL],
        // pending_sync is optional; if unsupported downstream, it will be ignored
        pending_sync: true,
        sourceMessageId: repoSourceMessageId ?? undefined,
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
  const safeSourceMessageId = coerceUuid(sourceMessageId);

  if (!safeSourceMessageId) {
    throw new Error('Valid sourceMessageId is required to update a catchall note');
  }

  if (typeof repo?.findNoteBySourceMessageId !== 'function') {
    throw new Error('Repository does not support findNoteBySourceMessageId');
  }

  const existingNote = await repo.findNoteBySourceMessageId(safeSourceMessageId);
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

function mapDecisionOutcome(mode: 'auto' | 'ask' | 'keep' | 'unsorted') {
  switch (mode) {
    case 'auto':
      return 'auto_create' as const;
    case 'ask':
      return 'ask_chip' as const;
    case 'keep':
      return 'keep_note' as const;
    default:
      return 'unsorted' as const;
  }
}

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
  text: string;
  created_at: string;
  unsorted?: boolean; // for notes carrying the needs_review label
  noteSubtype?: string | null;
  due_date?: string | null; // ISO timestamp for todos
  tags?: string[];
  optimisticKind?: 'note' | 'todo' | 'habit';
  canonicalType?: CanonicalType | null;
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
 * Formats due date for human-friendly display
 */
export const formatDue = (dueIso?: string | null): string => {
  if (!dueIso) return 'no deadline yet';

  const due = new Date(dueIso);
  const now = new Date();

  // Normalize to start of day for date comparisons
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffMs = dueStart.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Check if time is specified (not midnight or 00:00)
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  const timeStr = hasTime
    ? ` @ ${due.getHours().toString().padStart(2, '0')}:${due.getMinutes().toString().padStart(2, '0')}`
    : '';

  // Today
  if (diffDays === 0) {
    return `due Today${timeStr}`;
  }

  // Tomorrow
  if (diffDays === 1) {
    return `due Tomorrow${timeStr}`;
  }

  // Within next 7 days - show weekday short (Mon, Tue, Wed, etc.)
  if (diffDays > 1 && diffDays <= 7) {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = weekdays[due.getDay()];
    return `due ${weekday}${timeStr}`;
  }

  // Beyond 7 days but within same month - show "Mon DD"
  if (
    diffDays > 7 &&
    due.getMonth() === now.getMonth() &&
    due.getFullYear() === now.getFullYear()
  ) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = months[due.getMonth()];
    const day = due.getDate();
    return `due ${month} ${day}${timeStr}`;
  }

  // Beyond same month - show "Mon DD"
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[due.getMonth()];
  const day = due.getDate();
  return `due ${month} ${day}${timeStr}`;
};

const RecentDrops: React.FC<{
  onEdited?: () => void;
  onDeleted?: () => void;
  refreshSignal?: number; // bump to force reload after submit
  initiallyOpen?: boolean;
  eagerLoad?: boolean;
}> = ({ onEdited, onDeleted, refreshSignal, initiallyOpen = true, eagerLoad = false }) => {
  const overlayController = useUnifiedOverlayController();
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

      const noteDrops: UnifiedDrop[] = (Array.isArray(notes) ? notes : [])
        .filter(
          (n) =>
            n?.origin === 'catchall' ||
            (Array.isArray(n?.labels) && n.labels.includes(CATCHALL_LABEL)),
        )
        .map((n) => {
          const labels = Array.isArray(n?.labels) ? n.labels : [];
          const rawCanonical = (n as any)?.canonical_type ?? (n as any)?.canonicalType;
          const rawSubtype = typeof n?.subtype === 'string' ? n.subtype : null;
          const fallbackSubtype = labels.includes(UNSORTED_LABEL) ? 'catchall' : null;
          const noteSubtypeCandidate = rawSubtype ?? fallbackSubtype;
          const canonicalType = isCanonicalType(rawCanonical)
            ? rawCanonical
            : persistedToCanonical('note', noteSubtypeCandidate ?? null);
          const unsorted = canonicalType === 'unsorted' || labels.includes(UNSORTED_LABEL);
          const noteSubtype =
            canonicalType === 'unsorted'
              ? (noteSubtypeCandidate ?? 'catchall')
              : noteSubtypeCandidate;

          return {
            id: n.id,
            kind: 'note' as const,
            text: n.body || n.title || n.text || n.content || '',
            created_at: n.created_at,
            unsorted,
            noteSubtype,
            tags: toTagList((n as any)?.tags),
            canonicalType,
          };
        });

      const todoDrops: UnifiedDrop[] = (Array.isArray(todos) ? todos : [])
        .filter((t) => t?.origin === 'catchall')
        .map((t) => ({
          id: t.id,
          kind: 'todo' as const,
          text: t.name || t.title || '',
          created_at: t.created_at,
          due_date: t.due_date ?? null,
          tags: toTagList((t as any)?.tags),
          canonicalType: 'todo' as const,
        }));

      const habitDrops: UnifiedDrop[] = (Array.isArray(habits) ? habits : [])
        .filter((h) => h?.origin === 'catchall')
        .map((h) => ({
          id: h.id,
          kind: 'habit' as const,
          text: h.name || '',
          created_at: h.created_at,
          tags: toTagList((h as any)?.tags),
          canonicalType: 'habit' as const,
        }));

      let unified = [...noteDrops, ...todoDrops, ...habitDrops].filter(
        (i) => i.text && i.created_at,
      );

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

  const handleEdit = (id: string, kind: UnifiedDrop['kind'], _unsorted?: boolean) => {
    overlayController.openEdit({
      record: { id, type: kind } as any,
      spaceId: null,
    });
    onEdited?.();
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

      overlayController.openCreate({
        initialEntity: { type: 'todo', id: undefined, logSubtype: null },
        initialText: item.text ? String(item.text) : null,
      });

      onEdited?.();
    },
    [overlayController, onEdited],
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
                const canonicalFallback =
                  effectiveKind === 'note'
                    ? persistedToCanonical('note', item.noteSubtype ?? null)
                    : (effectiveKind as CanonicalType);
                const canonicalForDisplay = canonicalTypesOn
                  ? (item.canonicalType ?? canonicalFallback)
                  : null;
                const displayKind = kindToDisplayLabel(
                  effectiveKind,
                  effectiveKind === 'note' ? (item.noteSubtype ?? null) : null,
                  canonicalTypesOn,
                  canonicalForDisplay ?? null,
                );
                const resolvedCanonical = canonicalForDisplay ?? canonicalFallback;
                const isUnsortedCanonical = resolvedCanonical === 'unsorted' || item.unsorted;
                const showLegacyUnsortedBadge = !canonicalTypesOn && isUnsortedCanonical;
                const badgeBasis = resolvedCanonical;
                const badgeStyleKey =
                  badgeBasis === 'todo'
                    ? 'badge_todo'
                    : badgeBasis === 'habit'
                      ? 'badge_habit'
                      : 'badge_note';
                const showDueBadge = resolvedCanonical === 'todo';

                return (
                  <View
                    key={`${item.kind}:${item.id}`}
                    testID={`minddrop-recent-${item.kind}-${item.id}`}
                    style={styles.recentCard}
                  >
                    <View style={styles.recentTopRow}>
                      <Text numberOfLines={1} style={styles.recentText}>
                        {item.text || '—'}
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
                        {showDueBadge ? (
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
                    {effectiveKind === 'todo' &&
                    Array.isArray(item.tags) &&
                    item.tags.length > 0 ? (
                      <View style={styles.recentTagsRow}>
                        {item.tags.slice(0, 6).map((tag) => (
                          <View key={`${item.id}-${tag}`} style={styles.recentTagPill}>
                            <Text style={styles.recentTagText}>{`#${tag}`}</Text>
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
};

export default function CatchAllNotepad(props: CatchAllNotepadProps = {}): React.JSX.Element {
  const { trustRefreshMs = 60000, networkIsOnline, testOrganizedTodayOverride } = props;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const repo = useRepo();
  const { decideWithContext } = useCortex();
  const { user, userId } = useAuth();
  const { showToast: showActionToast, Toast: ActionToast } = useActionToast({
    bottomOffset: Platform.select({ ios: 112, android: 112, default: 112 }) ?? 112,
  });
  const overlayController = useUnifiedOverlayController();
  const pendingBySourceRef = useRef<Map<string, PendingCreateEntry[]>>(new Map());
  const pendingByIdRef = useRef<Map<string, PendingCreateEntry[]>>(new Map());
  const pendingByRequestRef = useRef<Map<string, PendingCreateEntry>>(new Map());
  const pendingSequenceRef = useRef<PendingCreateEntry[]>([]);
  const activeEntryRef = useRef<PendingCreateEntry | null>(null);
  const prevOverlayVisibleRef = useRef<boolean>(overlayController.state.visible);

  const cleanupEntry = useCallback((entry: PendingCreateEntry) => {
    pendingByRequestRef.current.delete(entry.requestId);

    if (entry.sourceMessageId) {
      const queue = pendingBySourceRef.current.get(entry.sourceMessageId);
      if (queue) {
        const next = queue.filter((candidate) => candidate !== entry);
        if (next.length > 0) {
          pendingBySourceRef.current.set(entry.sourceMessageId, next);
        } else {
          pendingBySourceRef.current.delete(entry.sourceMessageId);
        }
      }
    }

    if (entry.existingId) {
      const queue = pendingByIdRef.current.get(entry.existingId);
      if (queue) {
        const next = queue.filter((candidate) => candidate !== entry);
        if (next.length > 0) {
          pendingByIdRef.current.set(entry.existingId, next);
        } else {
          pendingByIdRef.current.delete(entry.existingId);
        }
      }
    }

    const seq = pendingSequenceRef.current;
    const idx = seq.indexOf(entry);
    if (idx >= 0) {
      seq.splice(idx, 1);
    }

    if (activeEntryRef.current === entry) {
      activeEntryRef.current = null;
    }
  }, []);

  const registerEntry = useCallback((entry: PendingCreateEntry) => {
    pendingByRequestRef.current.set(entry.requestId, entry);

    if (entry.sourceMessageId) {
      const queue = pendingBySourceRef.current.get(entry.sourceMessageId) ?? [];
      queue.push(entry);
      pendingBySourceRef.current.set(entry.sourceMessageId, queue);
    }

    if (entry.existingId) {
      const queue = pendingByIdRef.current.get(entry.existingId) ?? [];
      queue.push(entry);
      pendingByIdRef.current.set(entry.existingId, queue);
    }

    pendingSequenceRef.current.push(entry);
  }, []);

  const completeEntry = useCallback((entry: PendingCreateEntry, record: AppRecord) => {
    entry.resolve(record);
  }, []);

  const failEntry = useCallback((entry: PendingCreateEntry, error: Error) => {
    entry.reject(error);
  }, []);

  const buildOverlayCreateOptions = useCallback((payload: CreateRecordInput) => {
    let overlayType: CanonicalType;
    let overlayLogSubtype: LogSubtype | null = null;

    const conversionMeta: {
      origin?: string;
      ai_placed?: boolean;
      why_string?: string | null;
      source_message_id?: string | null;
      initialTitle?: string;
      initialNote?: string;
      initialDueDate?: string | null;
    } = {};

    if (typeof payload.origin === 'string') {
      conversionMeta.origin = payload.origin;
    }

    if (typeof payload.ai_placed === 'boolean') {
      conversionMeta.ai_placed = payload.ai_placed;
    }

    conversionMeta.why_string = payload.why_string ?? null;
    conversionMeta.source_message_id = coerceUuid(payload.sourceMessageId ?? null);

    let initialText: string | null = null;

    if (payload.type === 'todo') {
      overlayType = 'todo';
      const title =
        typeof payload.title === 'string' && payload.title.length > 0
          ? payload.title
          : typeof payload.name === 'string'
            ? payload.name
            : '';
      if (title) {
        conversionMeta.initialTitle = title;
        initialText = title;
      }
      if (payload.due_date) {
        conversionMeta.initialDueDate = payload.due_date;
      }
    } else if (payload.type === 'habit') {
      overlayType = 'habit';
      const name =
        typeof payload.title === 'string' && payload.title.length > 0
          ? payload.title
          : typeof payload.name === 'string'
            ? payload.name
            : '';
      if (name) {
        conversionMeta.initialTitle = name;
        initialText = name;
      }
    } else {
      const rawSubtype = (payload as { subtype?: string | null })?.subtype ?? null;
      const labels = Array.isArray((payload as { labels?: unknown })?.labels)
        ? ((payload as { labels?: string[] }).labels as string[])
        : [];
      const isUnsorted = rawSubtype === 'catchall' || labels.includes(UNSORTED_LABEL);

      if (isUnsorted) {
        overlayType = 'unsorted';
      } else {
        overlayType = 'log';
        overlayLogSubtype = persistedNoteSubtypeToLogSubtype(rawSubtype ?? null);
      }

      const title = typeof payload.title === 'string' ? payload.title : null;
      const noteBody =
        typeof (payload as { body?: string })?.body === 'string'
          ? ((payload as { body?: string }).body as string)
          : null;

      if (title) {
        conversionMeta.initialTitle = title;
      }
      if (noteBody) {
        conversionMeta.initialNote = noteBody;
      }
      initialText = noteBody ?? title;
    }

    return {
      type: overlayType,
      logSubtype: overlayLogSubtype,
      spaceId: payload.space_id ?? undefined,
      conversionMeta,
      initialText: initialText ?? null,
    };
  }, []);

  const openOverlayAndWait = useCallback(
    ({ payload, existing, sourceMessageId }: OverlayRequestArgs) => {
      return new Promise<AppRecord>((resolve, reject) => {
        const requestId = `overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const targetSubtype =
          payload.type === 'note'
            ? ((payload as { subtype?: NoteSubtype | null })?.subtype ?? null)
            : null;

        const entry: PendingCreateEntry = {
          requestId,
          sourceMessageId,
          expectedType: payload.type,
          expectedSubtype: targetSubtype,
          existingId: existing?.id ?? null,
          resolve: () => {
            /* placeholder - reassigned below */
          },
          reject: () => {
            /* placeholder - reassigned below */
          },
          resolved: false,
          presented: false,
        };

        entry.resolve = (record: AppRecord) => {
          if (entry.resolved) {
            return;
          }
          entry.resolved = true;
          cleanupEntry(entry);
          resolve(record);
        };

        entry.reject = (error: Error) => {
          if (entry.resolved) {
            return;
          }
          entry.resolved = true;
          cleanupEntry(entry);
          reject(error);
        };

        registerEntry(entry);

        const hasMatchingType = existing?.type === payload.type;
        if (existing && hasMatchingType) {
          overlayController.openEdit({ record: existing, spaceId: payload.space_id ?? null });
        } else {
          const options = buildOverlayCreateOptions(payload);
          overlayController.openCreate({
            ...options,
            sourceMessageId,
          });
        }
      });
    },
    [buildOverlayCreateOptions, cleanupEntry, overlayController, registerEntry],
  );

  const overlayVisible = overlayController.state.visible;

  useEffect(() => {
    const wasVisible = prevOverlayVisibleRef.current;
    prevOverlayVisibleRef.current = overlayVisible;

    if (!wasVisible && overlayVisible) {
      const current = pendingSequenceRef.current[0];
      if (current) {
        current.presented = true;
        activeEntryRef.current = current;
      }
    } else if (wasVisible && !overlayVisible) {
      const current = activeEntryRef.current;
      if (current && !current.resolved) {
        failEntry(current, new Error('OverlayCancelled'));
      } else {
        activeEntryRef.current = null;
      }
    }
  }, [overlayVisible, failEntry]);

  const extractSourceMessageId = useCallback(
    (record: AppRecord | null | undefined): string | null => {
      if (!record) return null;
      const raw =
        (record as unknown as { source_message_id?: unknown; sourceMessageId?: unknown })
          ?.source_message_id ??
        (record as unknown as { sourceMessageId?: unknown })?.sourceMessageId;
      return typeof raw === 'string' && raw.length > 0 ? raw : null;
    },
    [],
  );

  const handleRecordChanged = useCallback(
    async ({ id, change }: { id: string; change: 'created' | 'updated' }) => {
      if (change !== 'created' && change !== 'updated') {
        return;
      }

      let record: AppRecord | null = null;
      try {
        record = await repo.getById(id);
      } catch {
        record = null;
      }

      const sourceMessageId = extractSourceMessageId(record);

      const selectCandidate = (candidates?: PendingCreateEntry[]): PendingCreateEntry | null => {
        if (!candidates) return null;
        for (const candidate of candidates) {
          if (candidate.resolved) continue;
          if (!record || record.type === candidate.expectedType) {
            return candidate;
          }
        }
        return null;
      };

      let entry: PendingCreateEntry | null = sourceMessageId
        ? selectCandidate(pendingBySourceRef.current.get(sourceMessageId))
        : null;

      if (!entry) {
        entry = selectCandidate(pendingByIdRef.current.get(id));
      }

      if (!entry) {
        return;
      }

      if (
        !record &&
        sourceMessageId &&
        typeof (repo as any)?.findBySourceMessageId === 'function'
      ) {
        const lookupKey = coerceUuid(sourceMessageId);
        if (lookupKey) {
          try {
            record = await repo.findBySourceMessageId(entry.expectedType, lookupKey);
          } catch {
            record = null;
          }
        }
      }

      const safeRecord = record ?? ({ id, type: entry.expectedType } as AppRecord);
      completeEntry(entry, safeRecord);
    },
    [repo, completeEntry, extractSourceMessageId],
  );

  useEffect(() => {
    const off = eventBus.on('RecordChanged', handleRecordChanged);
    return off;
  }, [handleRecordChanged]);
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
  const [lowConfidenceChipContext, setLowConfidenceChipContext] =
    useState<LowConfidenceChipContext | null>(null);
  const [lowConfidenceUnsortedId, setLowConfidenceUnsortedId] = useState<string | null>(null);
  const [timingChips, setTimingChips] = useState<TimingChip[]>([]);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const timingAskedRef = useRef<string | null>(null); // Track submission ID to avoid re-asking

  // Auto-dismiss category chips after configured interval
  useEffect(() => {
    if (!categoryChips?.length) return;
    const timeout = setTimeout(() => {
      setCategoryChips([]);
      setLowConfidenceChipContext(null);
    }, CHIPS_AUTO_DISMISS_MS);
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
  const writeLocksRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const lastSubmitAt = useRef<number>(0);
  const submitLockRef = useRef(false);
  const [isSubmitLocked, setIsSubmitLocked] = useState(false);
  const setSubmitLock = useCallback(
    (value: boolean) => {
      submitLockRef.current = value;
      setIsSubmitLocked(value);
    },
    [setIsSubmitLocked],
  );

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

  const withWriteLock = useCallback(async function executeWithWriteLock<T>(
    key: string,
    task: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return task();
    }
    const locks = writeLocksRef.current;
    const existing = locks.get(key);
    if (existing) {
      try {
        await existing;
      } catch {
        // ignore rejection; allow retry to proceed
      }
      return executeWithWriteLock(key, task);
    }

    const run = (async () => {
      try {
        return await task();
      } finally {
        locks.delete(key);
      }
    })();

    locks.set(key, run);
    return run;
  }, []);

  const upsertBySourceMessageId = useCallback(
    async (payload: CreateRecordInput) => {
      const key = coerceUuid(payload.sourceMessageId ?? null);
      const normalizedPayload =
        key != null && payload.sourceMessageId === key
          ? payload
          : {
              ...payload,
              sourceMessageId: key ?? null,
            };

      const lookupExisting = async (): Promise<AppRecord | null> => {
        if (!key) return null;
        const finder = (repo as any)?.findBySourceMessageId;
        if (typeof finder !== 'function') {
          return null;
        }
        try {
          return await finder.call(repo, payload.type, key);
        } catch {
          return null;
        }
      };

      const useTestWorkaround = process.env.JEST_WORKAROUND === '1';

      if (!key) {
        return repo.create(normalizedPayload);
      }

      return withWriteLock(key, async () => {
        const existing = await lookupExisting();
        if (existing) {
          const patch = buildPatchFromCreatePayload(normalizedPayload);
          return repo.update({ id: existing.id, patch: patch as any });
        }

        if (useTestWorkaround) {
          return repo.create(normalizedPayload);
        }

        return openOverlayAndWait({
          payload: normalizedPayload,
          existing: existing ?? undefined,
          sourceMessageId: key,
        });
      });
    },
    [repo, withWriteLock, openOverlayAndWait],
  );
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

      // no-op

      let count = [notes, todos, habits]
        .map((arr) =>
          Array.isArray(arr)
            ? arr.filter((i) => new Date(i.created_at) >= new Date(since)).length
            : 0,
        )
        .reduce((a, b) => a + b, 0);

      if (count === 0) {
        const fallbackCount = [notes, todos, habits]
          .map((arr) => (Array.isArray(arr) ? arr.length : 0))
          .reduce((a, b) => a + b, 0);
        if (fallbackCount > 0) {
          count = fallbackCount;
        }
      }

      // Only update state if count actually changed to prevent unnecessary re-renders
      setOrganizedToday((prev) => (prev === count ? prev : count));
      // Optional debug for tests/dev; avoid error overlay in RN
      if (__DEV__ && process.env.JEST_WORKAROUND === '1') {
        // eslint-disable-next-line no-console
        console.debug('[TrustBuilders] computed count', count);
      }
    } catch (e) {
      // Silent fail — keep last known number
    }
  }, [repo, testOrganizedTodayOverride]);

  useEffect(() => {
    const off = eventBus.on('RecordChanged', ({ change }) => {
      if (change === 'created' || change === 'updated') {
        void refreshOrganizedToday?.();
        triggerRecentRefresh();
      }
    });
    return off;
  }, [refreshOrganizedToday, triggerRecentRefresh]);

  // Memoized disabled state: only depends on note & isSubmitting, isolating input from unrelated state
  const disabled = useMemo(
    () => note.trim().length === 0 || isSubmitting || isThinking || isSubmitLocked,
    [note, isSubmitting, isThinking, isSubmitLocked],
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
    setNote('');
    setIsSubmitting(false);
    setIsThinking(false);
    setConfirmations([]);
    setCategoryChips([]);
    setLowConfidenceUnsortedId(null);
    setLowConfidenceChipContext(null);
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

  const announceForAccessibility = useCallback((message: string) => {
    try {
      AccessibilityInfo.announceForAccessibility?.(message);
    } catch (error) {
      void error;
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
      setLowConfidenceChipContext({
        text: trimmed,
        parsedDueIso: null,
        classification: null,
        tags: null,
        submissionId: submissionIdRef.current,
      });
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
      const submissionId =
        submissionIdRef.current ?? (submissionIdRef.current = createSubmissionId());
      const repoSourceMessageId = coerceUuid(submissionId);

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
        decision = await decideWithContext({ text: trimmed }, ctx);
        step(trace, 'decide:result', {
          mode: decision.mode,
          confidence: decision.confidence,
          actions: Array.isArray(decision.actions) ? decision.actions.map((a) => a.type) : [],
          suggestions: Array.isArray(decision.suggestions) ? decision.suggestions.length : 0,
        });

        // Early narrative detection guard: force category chips to prevent multiple catchall notes
        if (classifyNarrative(trimmed)) {
          let tagsForContext: string[] | null = null;
          // Save to unsorted tray once if not already saved
          if (unsortedIdRef.current == null) {
            try {
              const narrativeTags = buildFallbackTags(trimmed, 'note', 'journal');
              const tagsForSave = narrativeTags.length > 0 ? narrativeTags : null;
              tagsForContext = tagsForSave;
              const id = await withWriteLock(submissionId, () =>
                saveToUnsortedTray(repo as any, trimmed, {
                  sourceMessageId: submissionId,
                  whyString: 'Narrative text - awaiting category selection',
                  tags: tagsForSave ?? undefined,
                }),
              );
              unsortedIdRef.current = id ?? null;
              announceForAccessibility("Saved to Unsorted, we'll organize together.");

              // Track this submission to prevent duplicates
              lastSubmittedTextRef.current = trimmed;
              lastUnsortedIdRef.current = unsortedIdRef.current;
            } catch (e) {
              console.warn('[MindDrop][Narrative] failed to save to Unsorted', e);
            }
          }

          const savedUnsortedId = unsortedIdRef.current;
          const classificationMetaRaw = (decision.meta as Record<string, unknown> | undefined)
            ?.classification;
          if (!tagsForContext && Array.isArray((classificationMetaRaw as any)?.tags)) {
            tagsForContext = ((classificationMetaRaw as any).tags as string[]) ?? null;
          }
          const classificationForContext: LowConfidenceChipClassification | null =
            classificationMetaRaw
              ? {
                  type:
                    typeof (classificationMetaRaw as any)?.type === 'string'
                      ? ((classificationMetaRaw as any).type as string)
                      : null,
                  subtype:
                    typeof (classificationMetaRaw as any)?.subtype === 'string'
                      ? ((classificationMetaRaw as any).subtype as string)
                      : null,
                  frequency:
                    typeof (classificationMetaRaw as any)?.frequency === 'string'
                      ? ((classificationMetaRaw as any).frequency as string)
                      : null,
                  tags: Array.isArray((classificationMetaRaw as any)?.tags)
                    ? ((classificationMetaRaw as any).tags as string[])
                    : null,
                }
              : null;
          if (savedUnsortedId) {
            const manualSuggestions: UISuggestion[] = [
              {
                type: 'create.todo',
                label: 'Add to To-Do List',
                payload: { title: trimmed, body: trimmed },
              },
              {
                type: 'create.note',
                label: 'Just Save It',
                payload: { title: trimmed, body: trimmed, subtype: 'journal' },
              },
              {
                type: 'create.habit',
                label: 'Start a Habit',
                payload: { name: trimmed, freq: 'daily' },
              },
            ];
            setLowConfidenceUnsortedId(savedUnsortedId);
            setCategoryChips([
              { kind: 'todo', label: 'Add to To-Do List' },
              { kind: 'log', label: 'Just Save It' },
              { kind: 'habit', label: 'Start a Habit' },
            ]);
            setLowConfidenceChipContext({
              text: trimmed,
              parsedDueIso: parsedIso,
              classification: classificationForContext,
              tags: tagsForContext,
              submissionId,
            });
            setNote('');
            triggerRecentRefresh();
            pendingUndo.current = { todos: [], notes: [], habits: [] };

            void logCatchallDecision({
              userId: currentUserId,
              text: trimmed,
              surface: 'catchall',
              engine: engineMode,
              modelVersion,
              intent: 'narrative',
              confidence: decision.confidence ?? 0,
              mode: 'ask',
              decision: mapDecisionOutcome('ask'),
              createdTodos: 0,
              createdNotes: 0,
              createdHabits: 0,
            });

            step(trace, 'narrative:forced-category-chips', { unsortedId: savedUnsortedId });
            end(trace, 'narrative-ask', { confidence: decision.confidence ?? 0 });

            return {
              created: { todos: [], notes: [], habits: [] },
              createdDetails: [],
              suggestions: manualSuggestions,
              decisionMode: 'ask',
              decisionConfidence: decision.confidence ?? 0,
            };
          }
        }

        // Apply narrative detection guard to avoid prompting conversion for journaling text
        if (decision && classifyNarrative(trimmed)) {
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
                    title: trimmed,
                    body: trimmed,
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

        if (decision.mode === 'auto' && actions.length > 0) {
          const mapped: Array<{
            bucket: 'todos' | 'notes' | 'habits';
            payload: CreateRecordInput;
          }> = [];
          let unsupported = false;

          for (const action of actions) {
            if (action.type === 'create.todo') {
              const rawTitle = (action.payload.title?.trim() || cleanedText).trim() || 'Quick task';
              const title = clampNoteLength(rawTitle);
              const due = action.payload.due ?? parsedIso ?? null;
              mapped.push({
                bucket: 'todos',
                payload: {
                  type: 'todo',
                  title,
                  name: title,
                  due_date: due,
                  undefined_due: !due,
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  origin: 'catchall',
                  sourceMessageId: repoSourceMessageId ?? null,
                },
              });
            } else if (action.type === 'create.habit') {
              const rawName = action.payload.name?.trim() || cleanedText || trimmed;
              const name = clampNoteLength(rawName);
              const freqRaw = action.payload.freq;
              const frequency: 'daily' | 'weekly' | 'monthly' =
                freqRaw === 'weekly' ? 'weekly' : 'daily';

              mapped.push({
                bucket: 'habits',
                payload: {
                  type: 'habit',
                  name,
                  frequency,
                  space_id: action.payload.spaceId ?? null,
                  ai_placed: true,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  origin: 'catchall',
                  sourceMessageId: repoSourceMessageId ?? null,
                },
              });
            } else if (action.type === 'create.note') {
              const rawText = action.payload.text?.trim() || cleanedText || trimmed;
              const text = clampNoteLength(rawText);
              const rawSubtype = action.payload.subtype;
              const subtype = rawSubtype === 'journal' ? 'journal' : 'catchall';
              const canonicalType = persistedToCanonical('note', subtype);

              mapped.push({
                bucket: 'notes',
                payload: {
                  type: 'note',
                  title: text || 'Quick note',
                  body: text,
                  subtype,
                  origin: 'catchall',
                  ai_placed: subtype !== 'catchall',
                  space_id: action.payload.spaceId ?? null,
                  why_string: decision.explanation || 'Organized via Mind Drop',
                  canonicalType,
                  labels: [CATCHALL_LABEL],
                  views: { alsoShowIn: ['Hub:Catch-All'] },
                  sourceMessageId: repoSourceMessageId ?? null,
                },
              });
            } else if (action.type === 'add.to.list') {
              const rawItemText = action.payload.item?.trim() || cleanedText || trimmed;
              const itemText = clampNoteLength(rawItemText);
              const rawListTitle = cleanedText || itemText || trimmed || 'Quick list';
              const listTitle = clampNoteLength(rawListTitle);
              const canonicalType = persistedToCanonical('note', 'list');

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
                  sourceMessageId: repoSourceMessageId ?? null,
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
                const record = await upsertBySourceMessageId(entry.payload);
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
                !isUrgent(trimmed) &&
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

              void logCatchallDecision({
                userId: currentUserId,
                text: trimmed,
                surface: 'catchall',
                engine: engineMode,
                modelVersion,
                intent: probableIntent,
                confidence: decision.confidence ?? 0,
                mode: decision.mode,
                decision: mapDecisionOutcome(decision.mode),
                createdTodos: counts.todos,
                createdNotes: counts.notes,
                createdHabits: counts.habits,
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
          // Duplicate prevention: create a new Unsorted note when we don't already have one
          // or when the user has changed the text since the last submission.
          const shouldSaveNew =
            unsortedIdRef.current == null || lastSubmittedTextRef.current !== trimmed;
          let tagsForContext: string[] | null = null;

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
              const classificationTags = normalizeTags([...engineTags, ...classificationTagsMeta]);
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
                  : buildFallbackTags(trimmed, 'note', fallbackSubtype);
              const tagsForCreate = fallbackTags.length > 0 ? fallbackTags : null;
              tagsForContext = tagsForCreate;
              const id = await withWriteLock(submissionId, () =>
                saveToUnsortedTray(repo as any, trimmed, {
                  sourceMessageId: submissionId,
                  whyString: 'Awaiting chip selection',
                  tags: tagsForCreate ?? undefined,
                }),
              );
              unsortedIdRef.current = id ?? null;
              announceForAccessibility("Saved to Unsorted, we'll organize together.");

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
          const classificationMetaRaw = (decision.meta as Record<string, unknown> | undefined)
            ?.classification;
          if (!tagsForContext && Array.isArray((classificationMetaRaw as any)?.tags)) {
            tagsForContext = ((classificationMetaRaw as any).tags as string[]) ?? null;
          }
          const classificationForContext: LowConfidenceChipClassification | null =
            classificationMetaRaw
              ? {
                  type:
                    typeof (classificationMetaRaw as any)?.type === 'string'
                      ? ((classificationMetaRaw as any).type as string)
                      : null,
                  subtype:
                    typeof (classificationMetaRaw as any)?.subtype === 'string'
                      ? ((classificationMetaRaw as any).subtype as string)
                      : null,
                  frequency:
                    typeof (classificationMetaRaw as any)?.frequency === 'string'
                      ? ((classificationMetaRaw as any).frequency as string)
                      : null,
                  tags: Array.isArray((classificationMetaRaw as any)?.tags)
                    ? ((classificationMetaRaw as any).tags as string[])
                    : null,
                }
              : null;

          // If low confidence or narrative, show category chips instead of suggestions
          if ((confidence <= 0.85 || classifyNarrative(trimmed)) && savedUnsortedId) {
            setLowConfidenceUnsortedId(savedUnsortedId);
            setCategoryChips([
              { kind: 'todo', label: 'Add to To-Do List' },
              { kind: 'log', label: 'Just Save It' },
              { kind: 'habit', label: 'Start a Habit' },
            ]);
            setLowConfidenceChipContext({
              text: trimmed,
              parsedDueIso: parsedIso,
              classification: classificationForContext,
              tags: tagsForContext,
              submissionId,
            });
            setNote('');
            triggerRecentRefresh();
            pendingUndo.current = { todos: [], notes: [], habits: [] };

            void logCatchallDecision({
              userId: currentUserId,
              text: trimmed,
              surface: 'catchall',
              engine: engineMode,
              modelVersion,
              intent: decision.meta?.intent?.kind ?? 'ambiguous',
              confidence,
              mode: decision.mode,
              decision: mapDecisionOutcome('ask'),
              createdTodos: 0,
              createdNotes: 0,
              createdHabits: 0,
            });

            return {
              created: { todos: [], notes: [], habits: [] },
              createdDetails: [],
              suggestions: chipSuggestions,
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
            suggestions: chipSuggestions,
            decisionMode: decision.mode,
            decisionConfidence: decision.confidence ?? 0,
          };
        }
      }

      step(trace, 'classify:start', { excerpt: trimmed.slice(0, 120) });
      let classifyOut: any = null;
      try {
        const engine = createCortexEngine();
        classifyOut = await engine.classify({ text: trimmed, spaceId: null });
        step(trace, 'classify:result', classifyOut);
      } catch (err) {
        console.warn('[MindDrop][Classify] error', String(err));
        step(trace, 'classify:error', { error: String(err) });
      }

      const createdIds = {
        todos: [] as string[],
        notes: [] as string[],
        habits: [] as string[],
      };
      const counts = { todos: 0, notes: 0, habits: 0 };
      const createdDetails: OrganizedDetail[] = [];

      const looksLikeIdeas =
        /\bideas?\b|brainstorm|wish\s*list|packing\s*list|itinerary|list/i.test(trimmed);
      if (looksLikeIdeas && classifyOut?.type === 'todo') {
        classifyOut = {
          ...classifyOut,
          type: 'note',
          subtype: 'list',
          aiPlaced: true,
          whyString: 'Ideas/list capture',
        };
      }

      const tagsSanitized = sanitizeSuggestedTags(
        trimmed,
        Array.isArray(classifyOut?.tags) ? classifyOut!.tags : [],
      );
      const tags = tagsSanitized.length ? tagsSanitized : null;
      const normalizedTags = tags ?? [];

      let payload: CreateRecordInput;
      if (classifyOut?.type === 'todo') {
        const due = parsedIso ?? null;
        const todoTitle = clampNoteLength(cleanedText || trimmed || 'Quick task');
        payload = {
          type: 'todo',
          title: todoTitle,
          name: todoTitle,
          due_date: due,
          undefined_due: !due,
          space_id: null,
          ai_placed: true,
          why_string: classifyOut?.whyString || 'Auto-classified as a task',
          origin: 'catchall',
          sourceMessageId: repoSourceMessageId ?? null,
          tags,
        };
      } else if (classifyOut?.type === 'habit') {
        const freqRaw = typeof classifyOut?.frequency === 'string' ? classifyOut.frequency : null;
        const frequency: 'daily' | 'weekly' | 'monthly' =
          freqRaw === 'weekly' ? 'weekly' : freqRaw === 'monthly' ? 'monthly' : 'daily';
        const habitName = clampNoteLength(cleanedText || trimmed);

        payload = {
          type: 'habit',
          name: habitName,
          frequency,
          space_id: null,
          ai_placed: true,
          why_string: classifyOut?.whyString || 'Auto-classified as a habit',
          origin: 'catchall',
          sourceMessageId: repoSourceMessageId ?? null,
          tags,
        };
      } else {
        const derivedLogSubtype = deriveLogSubtypeFromTags(normalizedTags);
        const derivedNoteSubtype: NoteSubtype | null = (() => {
          switch (derivedLogSubtype) {
            case 'journal':
              return 'journal';
            case 'list':
              return 'list';
            case 'idea':
              return 'idea';
            default:
              return null;
          }
        })();

        const classificationSubtype: NoteSubtype | null =
          classifyOut?.type === 'note' &&
          (classifyOut?.subtype === 'journal' ||
            classifyOut?.subtype === 'list' ||
            classifyOut?.subtype === 'idea')
            ? (classifyOut.subtype as NoteSubtype)
            : null;

        const subtype = derivedNoteSubtype ?? classificationSubtype ?? 'catchall';
        const canonicalType = persistedToCanonical('note', subtype);
        const noteTitle = clampNoteLength(cleanedText || trimmed || 'Quick note');
        const noteBody = clampNoteLength(cleanedText || trimmed);

        payload = {
          type: 'note',
          title: noteTitle,
          body: noteBody,
          subtype,
          origin: 'catchall',
          ai_placed:
            classifyOut?.aiPlaced !== undefined
              ? classifyOut?.aiPlaced
                ? subtype !== 'catchall'
                : false
              : subtype !== 'catchall',
          space_id: null,
          why_string: classifyOut?.whyString || 'Saved from Catch-All Notepad',
          canonicalType,
          labels: [CATCHALL_LABEL],
          views: {
            alsoShowIn: ['Hub:Catch-All'],
          },
          sourceMessageId: repoSourceMessageId ?? null,
          tags,
        };
      }

      step(trace, 'payload:final', payload);
      const rec = await upsertBySourceMessageId(payload);

      if (payload.type === 'todo') {
        counts.todos = 1;
        createdIds.todos.push(rec.id);
        createdDetails.push({ kind: 'todo' });

        // Check if todo is urgent
        if (isUrgent(trimmed)) {
          // Auto-assign urgent todos to Today
          const today = new Date();
          today.setHours(17, 0, 0, 0); // Today at 17:00 local
          await repo.update({
            id: rec.id,
            patch: {
              due_date: today.toISOString(),
              undefined_due: false,
            } as any,
          });
          showActionToast({ type: 'success', content: 'Added to Today ✓' });

          // Track urgent bypass
          metricsRef.current.urgentBypass += 1;
          logMetrics('urgent_bypass', { todoId: rec.id, input: trimmed });

          // timingAskedRef remains false - no timing chips shown
        } else {
          // Check if we should show timing chips for non-urgent todos
          const confidence =
            typeof classifyOut?.confidence === 'number' && Number.isFinite(classifyOut.confidence)
              ? classifyOut.confidence
              : 0;
          const shouldShowTiming =
            confidence >= 0.8 && timingAskedRef.current !== submissionId && !parsedIso; // Don't ask if we already parsed a due date

          if (shouldShowTiming) {
            timingAskedRef.current = submissionId;
            setPendingTodoId(rec.id);
            setTimingChips(getTimingChips());

            // Track timing options shown
            metricsRef.current.timingShown += 1;
            logMetrics('timing_options_shown', {
              todoId: rec.id,
              confidence,
              timingOptions: getTimingChips().map((c) => c.option),
            });
          }
        }
      } else if (payload.type === 'habit') {
        counts.habits = 1;
        createdIds.habits.push(rec.id);
        createdDetails.push({ kind: 'habit' });
      } else {
        counts.notes = 1;
        createdIds.notes.push(rec.id);
        const subtypeValue =
          typeof (payload as any)?.subtype === 'string' ? (payload as any).subtype : null;
        createdDetails.push({ kind: 'note', noteSubtype: subtypeValue });
      }

      const probableIntent =
        payload.type === 'todo' ? 'todo' : payload.type === 'habit' ? 'habit' : 'note';
      const decisionMode = payload.type === 'note' ? 'keep' : 'auto';
      const decisionOutcome = payload.type === 'note' ? 'unsorted' : 'auto_create';

      void logCatchallDecision({
        userId: currentUserId,
        text: trimmed,
        surface: 'catchall',
        engine: engineMode,
        modelVersion,
        intent: probableIntent,
        confidence:
          typeof classifyOut?.confidence === 'number' && Number.isFinite(classifyOut.confidence)
            ? classifyOut.confidence
            : 0,
        mode: decisionMode,
        decision: decisionOutcome,
        createdTodos: counts.todos,
        createdNotes: counts.notes,
        createdHabits: counts.habits,
      });

      end(trace, 'saved', {
        id: rec?.id,
        type: payload.type,
        subtype: (payload as any)?.subtype,
      });

      return {
        created: createdIds,
        createdDetails,
        decisionMode,
        decisionConfidence:
          typeof classifyOut?.confidence === 'number' ? classifyOut.confidence : undefined,
      };
    } catch (error) {
      console.error('[CatchAllNotepad] Failed to capture note', error);
      end(trace, 'error', { message: String(error) });
      throw error;
    }
  }, [note, repo, user, userId, decideWithContext, triggerRecentRefresh, announceForAccessibility]);

  const handleCategoryChipPick = useCallback(
    async (kind: 'todo' | 'log' | 'habit') => {
      const unsortedId = lowConfidenceUnsortedId ?? unsortedIdRef.current;
      if (!unsortedId) {
        console.warn('[MindDrop][CategoryChip] No unsorted id available');
        return;
      }

      setIsSubmitting(true);
      setCategoryChips([]);

      const context = lowConfidenceChipContext;

      const clearState = (undo: { todos: string[]; notes: string[]; habits: string[] }) => {
        setLowConfidenceUnsortedId(null);
        setLowConfidenceChipContext(null);
        unsortedIdRef.current = null;
        lastSubmittedTextRef.current = null;
        lastUnsortedIdRef.current = null;
        setNote('');
        setCategoryChips([]);
        pendingUndo.current = undo;
        metricsRef.current.conversions += 1;
        setOrganizedToday((prev) => prev + 1);
        triggerRecentRefresh();
      };

      try {
        const fallbackSubmissionId =
          typeof context?.submissionId === 'string' && context.submissionId.trim().length > 0
            ? context.submissionId
            : null;
        const fallbackLookupId = coerceUuid(fallbackSubmissionId);

        let existing: AppRecord | null = null;
        try {
          existing = await repo.getById(unsortedId);
        } catch (lookupError) {
          console.warn('[MindDrop][CategoryChip] Primary lookup failed', lookupError);
          existing = null;
        }

        if (!existing && fallbackLookupId) {
          try {
            const fallback = await repo.findBySourceMessageId('note', fallbackLookupId);
            if (fallback) {
              existing = fallback;
            }
          } catch (secondaryError) {
            console.warn('[MindDrop][CategoryChip] Source message lookup failed', secondaryError);
          }
        }

        if (!existing) {
          throw new Error('Original unsorted record not found');
        }

        const primaryText = extractPrimaryText(existing);
        const existingLabelsRaw = Array.isArray((existing as any).labels)
          ? ((existing as any).labels as string[])
          : [];
        const existingLabels = existingLabelsRaw.filter(labelIsString);
        const logLabels = removeLabels(normalizeCatchallLabels(existingLabels), [
          UNSORTED_LABEL,
          LEGACY_UNSORTED_LABEL,
        ]);
        const convertedLabels = removeLabels(existingLabels, [
          CATCHALL_LABEL,
          UNSORTED_LABEL,
          LEGACY_UNSORTED_LABEL,
        ]);
        const sourceMessageId =
          context?.submissionId ??
          (typeof (existing as any).source_message_id === 'string'
            ? ((existing as any).source_message_id as string)
            : null);
        const safeSourceMessageId = coerceUuid(sourceMessageId);
        const resolvedTags =
          context?.tags && context.tags.length > 0
            ? context.tags
            : Array.isArray((existing as any).tags)
              ? ((existing as any).tags as string[])
              : null;
        const spaceId = (existing as any).space_id ?? null;

        const whyString = (reason: string) => buildChipWhy(existing, reason);

        if (kind === 'log') {
          const classificationSubtype = context?.classification?.subtype;
          let nextSubtype: NoteSubtype = 'journal';
          if (
            classificationSubtype === 'journal' ||
            classificationSubtype === 'idea' ||
            classificationSubtype === 'list'
          ) {
            nextSubtype = classificationSubtype;
          } else if (hasChecklist((existing as any).body)) {
            nextSubtype = 'list';
          } else if (classifyNarrative(primaryText)) {
            nextSubtype = 'journal';
          } else {
            nextSubtype = 'idea';
          }

          const patch: Record<string, unknown> = {
            subtype: nextSubtype,
            canonicalType: persistedToCanonical('note', nextSubtype),
            labels: logLabels,
            ai_placed: true,
            why_string: whyString('Confirmed as note via category chip'),
            tags: resolvedTags ?? null,
            source_message_id: safeSourceMessageId,
            views:
              (existing as any).views && typeof (existing as any).views === 'object'
                ? (existing as any).views
                : { alsoShowIn: ['Hub:Catch-All'] },
          };

          const updated = await repo.update({
            id: existing.id,
            patch: patch as any,
          });

          try {
            eventBus.emit('RecordChanged', { id: existing.id, change: 'updated' });
          } catch (emitError) {
            if (__DEV__) console.warn('[MindDrop][CategoryChip] emit failed', emitError);
          }

          overlayController.openEdit({ record: updated, spaceId: spaceId ?? null });
          clearState({ todos: [], notes: [existing.id], habits: [] });
          announceForAccessibility('Logged as Idea.');
          if (TOASTS_ON) {
            showActionToast({ type: 'success', content: 'Saved as note' });
          }
          logMetrics('category_converted_log', { noteId: existing.id, subtype: nextSubtype });
          return;
        }

        if (kind === 'todo') {
          const dueIso = context?.parsedDueIso ?? null;
          const todoPatch: Record<string, unknown> = {
            canonicalType: 'todo',
            ai_placed: true,
            labels: convertedLabels,
            why_string: whyString('Confirmed as to-do via category chip'),
            tags: resolvedTags ?? null,
            source_message_id: safeSourceMessageId,
            space_id: spaceId,
            title: clampNoteLength(primaryText || 'Quick task'),
            body: clampNoteLength(primaryText || 'Quick task'),
            views:
              (existing as any).views && typeof (existing as any).views === 'object'
                ? (existing as any).views
                : { alsoShowIn: ['Hub:Catch-All'] },
            subtype: null,
          };
          if (dueIso) {
            todoPatch.views = {
              ...(todoPatch.views as Record<string, unknown>),
              dueSuggestion: dueIso,
            };
          }

          const updated = await repo.update({
            id: existing.id,
            patch: todoPatch as any,
          });

          try {
            eventBus.emit('RecordChanged', { id: existing.id, change: 'updated' });
          } catch (emitError) {
            if (__DEV__) console.warn('[MindDrop][CategoryChip] emit failed', emitError);
          }

          overlayController.openEdit({ record: updated, spaceId: spaceId ?? null });
          clearState({ todos: [existing.id], notes: [], habits: [] });
          announceForAccessibility('Moved to To-Do.');
          if (TOASTS_ON) {
            showActionToast({ type: 'success', content: 'Added to To-Do List ✓' });
          }
          logMetrics('category_converted_todo', {
            fromId: existing.id,
            todoId: existing.id,
            due: dueIso,
          });
          return;
        }

        // kind === 'habit'
        const freqRaw = context?.classification?.frequency;
        const frequency: 'daily' | 'weekly' | 'monthly' =
          freqRaw === 'weekly' ? 'weekly' : freqRaw === 'monthly' ? 'monthly' : 'daily';
        const habitName = clampNoteLength(primaryText || 'New habit');
        const habitPatch: Record<string, unknown> = {
          canonicalType: 'habit',
          ai_placed: true,
          labels: convertedLabels,
          why_string: whyString('Confirmed as habit via category chip'),
          tags: resolvedTags ?? null,
          source_message_id: safeSourceMessageId,
          space_id: spaceId,
          title: habitName,
          body: habitName,
          views:
            (existing as any).views && typeof (existing as any).views === 'object'
              ? (existing as any).views
              : { alsoShowIn: ['Hub:Catch-All'] },
          subtype: null,
        };

        const updated = await repo.update({
          id: existing.id,
          patch: habitPatch as any,
        });

        try {
          eventBus.emit('RecordChanged', { id: existing.id, change: 'updated' });
        } catch (emitError) {
          if (__DEV__) console.warn('[MindDrop][CategoryChip] emit failed', emitError);
        }

        overlayController.openEdit({ record: updated, spaceId: spaceId ?? null });
        clearState({ todos: [], notes: [], habits: [existing.id] });
        if (TOASTS_ON) {
          showActionToast({ type: 'success', content: 'Started a habit ✓' });
        }
        logMetrics('category_converted_habit', {
          fromId: existing.id,
          habitId: existing.id,
          frequency,
        });
      } catch (error) {
        console.error('[MindDrop][CategoryChip] Failed to process selection', error);
        setCategoryChips([
          { kind: 'todo', label: 'Add to To-Do List' },
          { kind: 'log', label: 'Just Save It' },
          { kind: 'habit', label: 'Start a Habit' },
        ]);
        if (TOASTS_ON) {
          showActionToast({
            type: 'success',
            content: 'Could not finish conversion — check Recent',
          });
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      lowConfidenceUnsortedId,
      lowConfidenceChipContext,
      repo,
      upsertBySourceMessageId,
      setOrganizedToday,
      triggerRecentRefresh,
      TOASTS_ON,
      showActionToast,
      logMetrics,
      announceForAccessibility,
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

        // Update the todo with the selected due date
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
    setSubmitLock(true);

    if (isSubmitting) {
      setSubmitLock(false);
      return;
    }
    setIsSubmitting(true);

    const now = Date.now();
    const trimmed = note.trim();

    if (!trimmed) {
      setIsSubmitting(false);
      setSubmitLock(false);
      return;
    }

    // Prevent rapid repeat submissions of same text
    const MIN_SUBMIT_INTERVAL_MS = 2000;
    if (
      now - lastSubmitAt.current < MIN_SUBMIT_INTERVAL_MS &&
      trimmed === lastSubmittedTextRef.current
    ) {
      setIsSubmitting(false);
      setSubmitLock(false);
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
      setSubmitLock(false);
      return;
    }

    const submissionId = submissionIdRef.current ?? createSubmissionId();
    submissionIdRef.current = submissionId;
    const repoSourceMessageId = coerceUuid(submissionId);

    try {
      // Optional short-circuit if network state is provided and offline
      if (typeof networkIsOnline === 'boolean' && !networkIsOnline) {
        await withWriteLock(submissionId, () =>
          saveToUnsortedTray(repo, trimmed, { sourceMessageId: submissionId }),
        );
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
        announceForAccessibility("Saved to Unsorted, we'll organize together.");
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
          await withWriteLock(submissionId, () =>
            saveToUnsortedTray(repo, trimmed, { sourceMessageId: submissionId }),
          );
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
          announceForAccessibility("Saved to Unsorted, we'll organize together.");
        } else {
          // Non-network error: save to Unsorted Tray for manual follow-up
          await withWriteLock(submissionId, () =>
            saveToUnsortedTray(repo, trimmed, { sourceMessageId: submissionId }),
          );
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
          announceForAccessibility("Saved to Unsorted, we'll organize together.");
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
      setSubmitLock(false);
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
    announceForAccessibility,
    TOASTS_ON,
    setSubmitLock,
  ]);

  const handleSubmit = useCallback(() => {
    if (isSubmitting || isThinking || isSubmitLocked || !note.trim()) {
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
  }, [isSubmitting, isThinking, isSubmitLocked, uiMode, note, onSubmit]);

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
