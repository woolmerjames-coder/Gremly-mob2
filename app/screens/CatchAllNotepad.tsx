/**
 * CatchAllNotepad.tsx - Mind Drop Input & Provisional Entity Creation
 *
 * ARCHITECTURE NOTE: Title + tags are owned by UnifiedOverlayV2. Do not enrich here.
 *
 * This screen handles Mind Drop text input and creates provisional entities (notes/todos/habits)
 * with RAW text only. No title compaction or tag generation happens at creation time.
 *
 * Flow:
 * 1. User enters text: "Book doctor appointment tomorrow at 2pm"
 * 2. AI classifies intent → determines it's a todo
 * 3. Create provisional todo:
 *    - title: "Book doctor appointment tomorrow at 2pm" (raw text, not compacted)
 *    - body: "Book doctor appointment tomorrow at 2pm" (full text)
 *    - tags: [] (empty - no AI tag generation at creation)
 *    - due_date: extracted date (if detected)
 * 4. User opens in UnifiedOverlayV2 for first edit
 * 5. UnifiedOverlayV2 runs OverlayPrefill:
 *    - Compacts title: "Book doctor appointment tomorrow at 2pm" → "Doctor Appointment"
 *    - Generates tags: [] → ['doctor', 'appointment', 'tomorrow']
 *
 * Title compaction and tag generation happen ONLY in UnifiedOverlayV2 via OverlayPrefill.
 * This ensures consistent UX: user sees full text initially, AI suggestions appear on first edit.
 */

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
  ActionSheetIOS,
  Keyboard,
  PanResponder,
  PanResponderGestureState,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
import { eventBus } from '../../lib/events/EventBus';
import { deriveCompactTitle } from '../../lib/text/compactTitle';
import { parseDue } from '../../lib/nlp/datetime/parseDue';
import { Lock } from 'lucide-react-native';
import { formatDue } from '../../lib/date/formatDue';
import { env } from '../../lib/env';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import {
  appendLineageToWhyString,
  hasChecklist,
  convertUnsortedToHabit,
  convertUnsortedToTodo,
  convertUnsortedToLog,
} from '../../lib/conversion';
import { backgroundPrefill } from '../../lib/minddrop/backgroundPrefill';
import {
  runMindDropStageAClassification,
  runMindDropStageBPrefill,
} from '../../lib/minddrop/pipelineStages';
import GREMLY_TOP from '../../assets/mascot/ACTUAL GREMLY.png';
import MINDDROP_HEADER from '../../assets/minddrop_header-removebg.png';
import MascotIcon from '../../components/MascotIcon';
import {
  filterAndNormalizeTags,
  normalizeTags,
  deriveLogSubtypeFromTags,
} from '../../lib/tags/normalize';
import { applyTagQualityFilter } from '../../lib/tags/quality';
import { extractMeaningfulTags } from '../../lib/tags/extractTags';
import { buildMindDropDerivedFields } from '../../lib/minddrop/minddropShared';
import { buildCanonicalFromMindDrop } from '../../lib/minddrop/buildCanonicalFromMindDrop';
import { buildHabitFields } from '../../lib/cortex/textNormalization';
import { hashString } from '../../lib/telemetry/catchallLogger';

export const THINKING_DURATION = 1200;
const MICROCOPY_FADE_MS = 300;
const THINKING_MICROCOPY = [
  'Organizing your thoughts …',
  'Finding a home for this …',
  'All set.',
] as const;

const AnimatedMicrocopyText = Animated.createAnimatedComponent(Text);

// Auto-grow constants: aligned for deterministic behavior
const LINE_HEIGHT = 24; // Must match styles.input lineHeight
const INPUT_VERTICAL_PADDING = 20; // paddingTop + paddingBottom
const MAX_LINES = 8;

const START_HEIGHT = 64; // compact starting height
const MIN_HEIGHT = START_HEIGHT;

const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES + INPUT_VERTICAL_PADDING + 8; // 24*8 + 24 + 8 = 224

export const INPUT_LINE_HEIGHT = LINE_HEIGHT;
export { START_HEIGHT as START_HEIGHT, MIN_HEIGHT as MIN_HEIGHT, MAX_HEIGHT as MAX_HEIGHT };
export const MAX_DYNAMIC_HEIGHT = MAX_HEIGHT; // Backwards compatibility for existing imports
const MAX_INPUT_CHARACTERS = 2000;
const PHOTO_TEXT_HINT = 'Add a few words so Gremly knows what this photo is about.';
const SPACE = 8;
const INPUT_PADDING_LEFT = 16;
const INPUT_ICON_PADDING_RIGHT = 72;

const clampNoteLength = (value: string): string =>
  value.length > MAX_INPUT_CHARACTERS ? value.slice(0, MAX_INPUT_CHARACTERS) : value;

const CHIPS_AUTO_DISMISS_MS =
  Number.parseInt(String(process.env.EXPO_PUBLIC_MINDDROP_CHIPS_AUTO_DISMISS_MS ?? '10000'), 10) ||
  10000;

const DUE_STRIP =
  String(process.env.EXPO_PUBLIC_MINDDROP_DUE_STRIP ?? 'on').toLowerCase() !== 'off';
const DUE_CONFIDENCE_FLOOR =
  Number.parseFloat(String(process.env.EXPO_PUBLIC_MINDDROP_DUE_CONFIDENCE ?? '0.84')) || 0.84;

const MIND_DROP_V3_INSTANT =
  String(process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT ?? 'off').toLowerCase() === 'on';

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
  onCameraPress?: () => void;
  photoHintText?: string;
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
    onCameraPress,
    photoHintText,
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
            disabled={!onCameraPress}
            style={[iconButtonStyle, iconCameraStyle]}
            accessibilityRole="button"
            accessibilityLabel="Attach a photo"
            accessibilityState={{ disabled: !onCameraPress }}
            onPress={onCameraPress}
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
        {photoHintText ? (
          <View style={{ marginTop: 4, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>{photoHintText}</Text>
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
    spaceId?: string | null;
  } = {},
): Promise<string | undefined> {
  if (!text?.trim()) return undefined;
  const { sourceMessageId, whyString, tags: incomingTags, dropId, spaceId } = options;
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
    space_id: spaceId ?? null, // Attach to space if provided
    views: {
      ai_pending: true, // Mark for background AI enrichment
      ai_failed: false, // Initial state - no failure yet
      minddrop_stage: 'pending', // Pipeline entry state
    },
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

/**
 * uploadPhotosToNote - Upload photo attachments to a note via Supabase storage
 *
 * This function handles the full photo upload flow:
 * 1. Fetch the file from local URI
 * 2. Upload to Supabase storage (log-photos bucket)
 * 3. Insert record into log_photos table
 *
 * Called after a note is created via Mind Drop pipeline when photos are attached.
 */
export async function uploadPhotosToNote(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: any,
  noteId: string,
  userId: string,
  photoUris: string[],
): Promise<void> {
  if (!photoUris || photoUris.length === 0) return;
  if (!noteId || !userId) {
    console.warn('[uploadPhotosToNote] Missing noteId or userId');
    return;
  }

  console.log('[MindDrop][Photos] Uploading', photoUris.length, 'photos for note:', noteId);

  for (let i = 0; i < photoUris.length; i++) {
    const photoUri = photoUris[i];
    if (!photoUri.startsWith('file://')) {
      console.warn('[MindDrop][Photos] Skipping non-local URI:', photoUri.substring(0, 50));
      continue;
    }

    try {
      // Generate unique storage path
      const fileExt = photoUri.split('.').pop() || 'jpg';
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const storagePath = `${userId}/${noteId}/${uniqueId}.${fileExt}`;

      // Fetch file from local URI
      const response = await fetch(photoUri);
      const arrayBuffer = await response.arrayBuffer();

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('log-photos')
        .upload(storagePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('[MindDrop][Photos] Failed to upload photo:', uploadError);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('log-photos').getPublicUrl(storagePath);

      const publicUrl = urlData?.publicUrl || storagePath;

      // Insert into log_photos table
      await repo.insertLogPhoto({
        noteId,
        url: publicUrl,
        position: i,
      });

      console.log('[MindDrop][Photos] Successfully uploaded photo', i + 1, 'of', photoUris.length);
    } catch (err) {
      console.error('[MindDrop][Photos] Error uploading photo:', err);
      // Continue with remaining photos
    }
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
  due_date?: string | null; // ISO timestamp for todos (fallback)
  due_day?: string | null; // YYYY-MM-DD format - canonical, timezone-safe
  due_time?: string | null; // HH:mm format for specific time
  tags?: string[];
  optimisticKind?: 'note' | 'todo' | 'habit';
  drop_id?: string | null; // For deduplication: prefer canonical items over unsorted notes
  archived?: boolean; // Track archived status to filter out converted notes
  canonical_type?: string | null; // Canonical type from buildCanonicalFromMindDrop: 'todo', 'habit', 'log', 'journal'
  labels?: string[]; // Labels from backend: ['log'], ['habit'], ['todo'], ['catchall', 'needs_review'], etc.
  views?: any; // For ai_pending, ai_failed, and other view flags
};

/**
 * Visual state for Mind Drop items in Recent Drops list
 * - 'pending': AI enrichment in progress (views.ai_pending = true)
 * - 'failed': AI enrichment failed (views.ai_failed = true)
 * - 'complete': AI enrichment complete or not needed
 */
type MindDropVisualState = 'pending' | 'failed' | 'complete';

/**
 * Get visual state for a Mind Drop item based on views flags
 * Used only for Mind Drop / CatchAll notes to show processing status
 */
/**
 * Get visual state for a Mind Drop item based on views flags
 * Used only for Mind Drop / CatchAll notes to show processing status
 */
function getMindDropVisualState(entity: {
  views?: any;
  title?: string;
  tags?: any[];
}): MindDropVisualState {
  const views = entity.views ?? {};

  // Still processing (Phase 4 flag check)
  if (views.ai_pending === true || views.minddrop_stage === 'pending') {
    return 'pending';
  }

  // Explicitly failed (Phase 4 flag check)
  if (views.ai_failed === true) {
    return 'failed';
  }

  // Successfully prefilled (Phase 4 explicit success check)
  if (views.minddrop_stage === 'prefilled' || views.minddrop_prefilled_v1 === true) {
    return 'complete';
  }

  // Implicit failure: ai_pending is false, not prefilled, and no enrichment signals
  // This catches cases where Stage B failed or never ran
  if (views.ai_pending === false && views.minddrop_stage !== 'prefilled') {
    const hasEnrichedTags = Array.isArray(entity.tags) && entity.tags.length > 0;
    const hasCompactTitle = entity.title && entity.title.length > 0 && entity.title.length < 60;

    // If no enrichment signals, treat as failed
    if (!hasEnrichedTags && !hasCompactTitle) {
      return 'failed';
    }
  }

  // Default: complete (backward compatibility for entities without new flags)
  return 'complete';
}

/**
 * Pending skeleton component with shimmer animation
 * Shows while AI enrichment is in progress
 */
/**
 * Calm pending animation for MindDrop v3
 * Simple fade with animated dots - no scaling, no pulsing, no transforms
 */
const PendingSkeleton: React.FC<{
  styles: any;
  c: any;
}> = ({ styles, c }) => {
  const [dots, setDots] = React.useState('');

  // Gentle fade opacity - 0.5 to 0.9, 3 seconds per cycle
  const [fadeOpacity] = React.useState(() => new Animated.Value(0.5));

  // Animated dots: add one every 500ms, reset after 3
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    // Gentle fade: opacity 0.5 -> 0.9 -> 0.5 over 3s (no pulsing, no scaling)
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeOpacity, {
          toValue: 0.9,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(fadeOpacity, {
          toValue: 0.5,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeOpacity]);

  return (
    <View
      testID="minddrop-pending-skeleton"
      style={[
        styles.recentCard,
        {
          height: 60, // Fixed height to prevent jumping
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'transparent', // No pulsing background
        },
      ]}
    >
      <Animated.Text
        style={{
          fontSize: 16, // Soft, not aggressive
          fontWeight: '500',
          textAlign: 'center',
          color: '#6B7280', // Soft gray, not bold/colored
          opacity: fadeOpacity,
        }}
      >
        Organizing{dots}
      </Animated.Text>
    </View>
  );
};

/**
 * Animated wrapper for Mind Drop card that smoothly transitions
 * from pending skeleton to final content when AI enrichment completes
 */
const AnimatedMindDropCard: React.FC<{
  item: UnifiedDrop;
  isPending: boolean;
  effectiveKind: 'note' | 'todo' | 'habit';
  displayKind: string;
  showLegacyUnsortedBadge: boolean | undefined;
  badgeStyleKey: string;
  c: any;
  styles: any;
  mode: string;
  handleEdit: (id: string, kind: UnifiedDrop['kind'], unsorted?: boolean) => void;
  handleDelete: (id: string, kind: UnifiedDrop['kind']) => void;
}> = ({
  item,
  isPending,
  effectiveKind,
  displayKind,
  showLegacyUnsortedBadge,
  badgeStyleKey,
  c,
  styles,
  mode,
  handleEdit,
  handleDelete,
}) => {
  // Get full visual state
  const visualState = getMindDropVisualState(item);

  // If pending, show calm animation
  if (visualState === 'pending') {
    return <PendingSkeleton styles={styles} c={c} />;
  }

  // Otherwise show full content
  const isFailed = visualState === 'failed';

  return (
    <Pressable
      key={`${item.kind}:${item.id}`}
      testID={`minddrop-recent-${item.kind}-${item.id}`}
      style={styles.recentCard}
      onPress={() => handleEdit(item.id, item.kind, item.unsorted)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.title || item.text || 'item'}`}
    >
      {/* First row: Title only */}
      <View style={styles.recentTopRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
          <Text numberOfLines={1} style={[styles.recentTitle, { flex: 1 }]}>
            {item.title || item.text || '—'}
          </Text>
          {effectiveKind === 'note' && (item as any)?.private === true && (
            <Lock size={12} color="#777" style={{ flexShrink: 0 }} />
          )}
        </View>
      </View>

      {/* Second row: All metadata (type chip, tags, due/time) */}
      <View style={styles.recentMetaRow}>
        <View style={styles.recentMetaLeft}>
          {/* Category pill */}
          <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>{displayKind}</Text>

          {showLegacyUnsortedBadge ? (
            <Text style={[styles.recentCategoryPill, styles.badge_unsorted]}>Unsorted</Text>
          ) : null}

          {/* Tags or status hint */}
          {Array.isArray(item.tags) && item.tags.length > 0 ? (
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.recentTagsText}>
              {getDisplayTagsForRecentDrop(item)
                .map((tag) => (tag.startsWith('@') ? tag : `#${tag}`))
                .join('  ')}
            </Text>
          ) : isFailed ? (
            <Text testID="minddrop-failed-hint" style={styles.subtleHint}>
              Saved as-is
            </Text>
          ) : null}

          {/* Due date OR time ago - now in metadata row */}
          {effectiveKind === 'todo' ? (
            <Text testID={`minddrop-recent-todo-due-${item.id}`} style={styles.recentMetaDue}>
              {formatDue({ dueDay: item.due_day, dueIso: item.due_date, dueTime: item.due_time })}
            </Text>
          ) : (
            <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
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
  onTodayCountChange?: (count: number) => void; // Callback to sync counter with actual Today items
  onAddPendingItem?: (
    callback: (params: {
      dropId: string;
      text: string;
      kind: 'todo' | 'habit' | 'note';
      noteSubtype?: string;
    }) => void,
  ) => void;
  refreshSignal?: number; // bump to force reload after submit
  initiallyOpen?: boolean;
  eagerLoad?: boolean;
}> = ({
  overlay,
  onEdited,
  onDeleted,
  onTodayCountChange,
  onAddPendingItem,
  refreshSignal,
  initiallyOpen = true,
  eagerLoad = false,
}) => {
  const repo = useRepo() as any;
  const { c, mode: themeMode } = useTheme();
  const { userId } = useAuth();
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);

  const [open, setOpen] = React.useState(initiallyOpen); // open by default for inline confirmation
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<UnifiedDrop[]>([]);
  const [pendingItems, setPendingItems] = React.useState<UnifiedDrop[]>([]); // Optimistic items shown before DB creation
  const [showOlder, setShowOlder] = React.useState(false); // Today-only by default
  const canonicalTypesOn = env.feature.canonicalTypes;

  const rangeLabel = showOlder ? 'Earlier' : 'Today';
  const rangeActionLabel = showOlder ? 'Back to today' : 'Show older';

  /**
   * Helper to merge a DB record into the local items state
   * Used when real-time updates arrive from Supabase
   */
  const mergeDbRecordIntoItems = React.useCallback(
    (prev: UnifiedDrop[], record: any, kind: 'todo' | 'habit' | 'note'): UnifiedDrop[] => {
      if (!record?.id) return prev;

      // If the record is archived (note) or completed (todo/habit), remove it from the list
      if (kind === 'note' && record.archived === true) {
        return prev.filter((item) => item.id !== record.id);
      }

      return prev.map((item) => {
        if (item.id !== record.id || item.kind !== kind) return item;

        const views = (record as any).views ?? item.views ?? {};
        const title = (record as any).title ?? (record as any).name ?? item.title;
        const tags = Array.isArray((record as any).tags)
          ? (record as any).tags.filter((t: unknown) => typeof t === 'string')
          : (item.tags ?? []);

        return {
          ...item,
          title,
          tags,
          views,
          drop_id: (record as any).drop_id ?? item.drop_id ?? null,
          archived: (record as any).archived ?? item.archived ?? false,
          labels: Array.isArray((record as any).labels)
            ? (record as any).labels
            : (item.labels ?? []),
        };
      });
    },
    [],
  );

  /**
   * Add an optimistic pending item to the Recent Drops list
   * This item appears immediately when user submits, before DB creation
   */
  const addPendingItem = React.useCallback(
    (params: {
      dropId: string;
      text: string;
      kind: 'todo' | 'habit' | 'note';
      noteSubtype?: string;
    }) => {
      const { dropId, text, kind, noteSubtype } = params;
      const tempId = `local-${dropId}`;
      const shortTitle = text.substring(0, 60) + (text.length > 60 ? '…' : '');

      const pendingItem: UnifiedDrop = {
        id: tempId,
        kind,
        title: shortTitle,
        text,
        created_at: new Date().toISOString(),
        drop_id: dropId,
        noteSubtype: kind === 'note' ? noteSubtype : null,
        tags: [],
        labels: [],
        views: {
          ai_pending: true,
          minddrop_stage: 'pending',
        },
      };

      setPendingItems((prev) => [pendingItem, ...prev]);
      console.debug('[MindDrop.Optimistic] Added pending item', { dropId, kind, tempId });
    },
    [],
  );

  // Expose addPendingItem to parent component
  React.useEffect(() => {
    if (onAddPendingItem) {
      onAddPendingItem(addPendingItem);
    }
  }, [onAddPendingItem, addPendingItem]);

  /**
   * Remove pending item(s) by drop_id when real entity appears
   * Called after Stage A creates the real entity in the database
   */
  const removePendingItem = React.useCallback((dropId: string) => {
    setPendingItems((prev) => {
      const filtered = prev.filter((item) => item.drop_id !== dropId);
      if (filtered.length < prev.length) {
        console.debug('[MindDrop.Optimistic] Removed pending item', { dropId });
      }
      return filtered;
    });
  }, []);

  /**
   * Load recent Mind Drops for the Catch-All / Recent Mind Drops list
   *
   * Mind Drop v3 Architecture:
   * - Catch-All = "Raw + in-flight Mind Drops" (pending/classified stage)
   * - Today/Habits/Logs = "Final destinations for converted drops" (prefilled stage)
   *
   * Filter Behavior:
   * - v3: Shows only pending/in-flight notes (not fully processed canonical entities)
   * - v2: Shows all Mind Drop items (notes, todos, habits) regardless of stage
   *
   * This prevents duplication: once a Mind Drop is converted to a canonical todo/habit,
   * it appears only in Today/Habits/Logs, not in Catch-All.
   */
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
        .filter((n) => {
          // Filter to Mind Drop items only
          const isMindDrop =
            n?.origin === 'catchall' ||
            (Array.isArray(n?.labels) && n.labels.includes(CATCHALL_LABEL));

          if (!isMindDrop) return false;

          // Exclude archived notes (converted unsorted notes)
          if (n?.archived === true) return false;

          // Show all Mind Drop items until explicitly archived
          return true;
        })
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
            views: (n as any)?.views ?? {},
          };
        });

      const todoDrops: UnifiedDrop[] = (Array.isArray(todos) ? todos : [])
        .filter((t) => {
          // Only include Mind Drop-origin todos
          if (t?.origin !== 'catchall') return false;

          // Exclude soft-deleted todos (completed_at is set)
          if ((t as any)?.completed_at) return false;

          // Show all Mind Drop todos until explicitly completed
          return true;
        })
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
            due_day: (t as any).due_day ?? null,
            due_time: (t as any).due_time ?? null,
            tags: toTagList((t as any)?.tags),
            drop_id: (t as any)?.drop_id ?? null,
            canonical_type: (t as any)?.canonical_type ?? null,
            labels: Array.isArray((t as any)?.labels) ? (t as any).labels : [],
            views: (t as any)?.views ?? {},
          };
        });

      const habitDrops: UnifiedDrop[] = (Array.isArray(habits) ? habits : [])
        .filter((h) => {
          // Only include Mind Drop-origin habits
          if (h?.origin !== 'catchall') return false;

          // Exclude soft-deleted habits (completed_at is set)
          if ((h as any)?.completed_at) return false;

          // Show all Mind Drop habits until explicitly completed
          return true;
        })
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
            views: (h as any)?.views ?? {},
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
        // Priority: habit > todo > note (non-unsorted) > note (unsorted/catchall)
        // A note is considered "unsorted" if:
        // - unsorted === true (has 'needs_review' label), OR
        // - noteSubtype === 'catchall', OR
        // - labels includes 'needs_review' or 'catchall'
        const isUnsortedNote = (drop: UnifiedDrop) =>
          drop.kind === 'note' &&
          (drop.unsorted === true ||
            drop.noteSubtype === 'catchall' ||
            (Array.isArray(drop.labels) &&
              (drop.labels.includes('needs_review') || drop.labels.includes('catchall'))));

        const getPriority = (drop: UnifiedDrop): number => {
          if (drop.kind === 'habit') return 3;
          if (drop.kind === 'todo') return 2;
          if (drop.kind === 'note' && !isUnsortedNote(drop)) return 1;
          return 0; // unsorted/catchall notes have lowest priority
        };

        const itemPriority = getPriority(item);
        const existingPriority = getPriority(existing);

        if (itemPriority > existingPriority) {
          // Replace with higher-priority item
          dropIdMap.set(item.drop_id, item);
        }
        // Otherwise keep existing (it has higher or equal priority)
      }

      // Combine deduplicated items with no-drop-id items
      unified = [...Array.from(dropIdMap.values()), ...noDropIdItems];

      console.debug('[MindDrop.UI] Unified items after dedup', {
        count: unified.length,
        items: unified.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title?.substring(0, 30),
          drop_id: i.drop_id,
          due_date: (i as any).due_date,
          space_id: (i as any).space_id,
        })),
      });

      // Calculate today count before any filtering
      const todayItems = unified.filter((i) => {
        const ts = new Date(i.created_at).getTime();
        return Number.isFinite(ts) && ts >= cutoff; // "Today"
      });

      if (!showOlder) {
        unified = todayItems;
      }

      unified = unified
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 25); // keep snappy; scroll handles overflow

      setItems(unified);

      // Log loaded items with their visual states for debugging
      const visualStates = unified.map((item) => ({
        id: item.id,
        kind: item.kind,
        drop_id: item.drop_id,
        visualState: getMindDropVisualState(item),
      }));
      console.debug('[RecentDrops] Loaded items:', {
        total: unified.length,
        pending: visualStates.filter((s) => s.visualState === 'pending').length,
        complete: visualStates.filter((s) => s.visualState === 'complete').length,
        failed: visualStates.filter((s) => s.visualState === 'failed').length,
      });

      // Remove pending items that now have real counterparts (auto-cleanup)
      {
        const realDropIds = new Set(unified.map((item) => item.drop_id).filter(Boolean));
        setPendingItems((prev) => {
          if (prev.length === 0) return prev;
          const filtered = prev.filter((p) => !realDropIds.has(p.drop_id));
          console.debug('[RecentDrops] Auto-cleanup pendingItems', {
            before: prev.length,
            after: filtered.length,
          });
          if (filtered.length < prev.length) {
            console.debug('[RecentDrops] Auto-cleanup removed pending items:', {
              before: prev.length,
              after: filtered.length,
              removed: prev.length - filtered.length,
            });
          }
          return filtered;
        });
      }

      // Notify parent of today count (for "X thoughts organized today" counter)
      // This ensures the counter always matches the actual number of items in Today section
      onTodayCountChange?.(todayItems.length);
    } finally {
      if (!isTest) setLoading(false);
    }
  }, [repo, showOlder, onTodayCountChange]);

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

  // Real-time subscription for Mind Drop items (Stage A/B enrichment)
  useEffect(() => {
    if (!userId) return;

    console.debug('[RecentDrops] Setting up real-time subscriptions for userId:', userId);

    // Subscribe to todos, habits, and notes for Mind Drop origin items
    const todosChannel = supabase
      .channel('minddrop-todos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todos',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as any;
          if (!record || record.origin !== 'catchall') return;

          console.debug('[RecentDrops] Todos DB update:', {
            event: payload.eventType,
            id: record.id,
            drop_id: record.drop_id,
            views: record.views ?? null,
          });

          if (record.drop_id) {
            removePendingItem(record.drop_id);
          }

          // Local merge so we don't rely solely on a refetch
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'todo'));

          // Safety: still perform a full reload to keep everything in sync
          void load();
        },
      )
      .subscribe();

    const habitsChannel = supabase
      .channel('minddrop-habits')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'habits',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as any;
          if (!record || record.origin !== 'catchall') return;

          console.debug('[RecentDrops] Habits DB update:', {
            event: payload.eventType,
            id: record.id,
            drop_id: record.drop_id,
            views: record.views ?? null,
          });

          if (record.drop_id) {
            removePendingItem(record.drop_id);
          }

          // Local merge so we don't rely solely on a refetch
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'habit'));

          // Safety: still perform a full reload to keep everything in sync
          void load();
        },
      )
      .subscribe();

    const notesChannel = supabase
      .channel('minddrop-notes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as any;
          if (!record || record.origin !== 'catchall') return;

          console.debug('[RecentDrops] Notes DB update:', {
            event: payload.eventType,
            id: record.id,
            drop_id: record.drop_id,
            views: record.views ?? null,
          });

          if (record.drop_id) {
            removePendingItem(record.drop_id);
          }

          // Local merge so we don't rely solely on a refetch
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'note'));

          // Safety: still perform a full reload to keep everything in sync
          void load();
        },
      )
      .subscribe();

    return () => {
      console.debug('[RecentDrops] Cleaning up real-time subscriptions');
      void todosChannel.unsubscribe();
      void habitsChannel.unsubscribe();
      void notesChannel.unsubscribe();
    };
  }, [userId, load, removePendingItem, mergeDbRecordIntoItems]);

  // Listen for ItemDeleted events from overlay and immediately remove from list
  useEffect(() => {
    const unsubscribe = eventBus.on(
      'ItemDeleted',
      (event: { id: string; type: 'habit' | 'todo' | 'note' }) => {
        console.debug('[RecentDrops] ItemDeleted event:', event.id, event.type);
        // Remove the item immediately from local state
        setItems((prev) => prev.filter((item) => item.id !== event.id));
        // Also remove from pending items in case it was still pending
        setPendingItems((prev) => prev.filter((item) => item.id !== event.id));
      },
    );

    return unsubscribe;
  }, []);

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
      // Find the item being deleted to check for drop_id
      const itemToDelete = items.find((item) => item.id === id);
      const dropId = itemToDelete?.drop_id;

      if (dropId) {
        // Archive all items (todos, habits, notes) with this drop_id
        await repo?.archiveItemsByDropId?.(dropId, 'user_deleted_drop');

        // Remove all items with this drop_id from local state
        setItems((prev) => prev.filter((item) => item.drop_id !== dropId));
      } else {
        // No drop_id: fallback to single-item delete
        await (repo?.remove?.(id) ?? repo?.[`${kind}s`]?.delete?.(id));

        // Remove only this item from local state
        setItems((prev) => prev.filter((item) => item.id !== id));
      }

      onDeleted?.();
    } catch (err) {
      // optional: error UI
      console.error('[handleDelete] Failed to delete:', err);
    }
  };

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
          ) : items.length === 0 && pendingItems.length === 0 ? (
            <Text style={styles.recentEmpty}>
              {showOlder ? 'No drops yet.' : "Gremly's ready when you are."}
            </Text>
          ) : (
            <ScrollView
              contentContainerStyle={styles.recentScrollContent}
              showsVerticalScrollIndicator
              onScrollBeginDrag={Keyboard.dismiss}
              keyboardShouldPersistTaps="handled"
            >
              {/* Pending items (optimistic UI) */}
              {pendingItems.map((item) => {
                const effectiveKind = item.kind;
                const displayKind = getDisplayKindForDrop(item, canonicalTypesOn);
                const badgeStyleKey =
                  effectiveKind === 'todo'
                    ? 'badge_todo'
                    : effectiveKind === 'habit'
                      ? 'badge_habit'
                      : 'badge_note';
                const isPending = true; // Always pending for optimistic items

                return (
                  <AnimatedMindDropCard
                    key={item.id}
                    item={item}
                    isPending={isPending}
                    effectiveKind={effectiveKind}
                    displayKind={displayKind}
                    showLegacyUnsortedBadge={undefined}
                    badgeStyleKey={badgeStyleKey}
                    c={c}
                    styles={styles}
                    mode={themeMode}
                    handleEdit={() => {}} // No-op for pending
                    handleDelete={() => {}} // No-op for pending
                  />
                );
              })}
              {/* Real items from database */}
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

                // Get visual state for pending/failed/final rendering
                const visualState = getMindDropVisualState(item);
                const isPending = visualState === 'pending';

                return (
                  <AnimatedMindDropCard
                    key={`${item.kind}:${item.id}`}
                    item={item}
                    isPending={isPending}
                    effectiveKind={effectiveKind}
                    displayKind={displayKind}
                    showLegacyUnsortedBadge={showLegacyUnsortedBadge}
                    badgeStyleKey={badgeStyleKey}
                    c={c}
                    styles={styles}
                    mode={themeMode}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                  />
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [microcopyIndex, setMicrocopyIndex] = useState(0);
  const [confirmations, setConfirmations] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [categoryChips, setCategoryChips] = useState<CategoryChip[]>([]);
  const [lowConfidenceUnsortedId, setLowConfidenceUnsortedId] = useState<string | null>(null);
  const [timingChips, setTimingChips] = useState<TimingChip[]>([]);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [pendingPhotoUris, setPendingPhotoUris] = useState<string[]>([]);
  const [showPhotoTextNudge, setShowPhotoTextNudge] = useState(false);
  const timingAskedRef = useRef<string | null>(null); // Track submission ID to avoid re-asking
  // Photo drop: Track if current submission has photos (for classification default to log-general)
  const currentSubmissionHasPhotosRef = useRef(false);

  // Auto-dismiss photo text nudge after 5 seconds
  useEffect(() => {
    if (!showPhotoTextNudge) return;
    const timeout = setTimeout(() => setShowPhotoTextNudge(false), 5000);
    return () => clearTimeout(timeout);
  }, [showPhotoTextNudge]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pulseScale] = useState(() => new Animated.Value(1));
  const [submitScale] = useState(() => new Animated.Value(1));
  const [microcopyOpacity] = useState(() => new Animated.Value(0));
  const hasTypedRef = useRef(false);
  const lastAppliedHeightRef = useRef(START_HEIGHT);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const microcopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  // Mind Drop: placeholder text and header focus target
  const headerTitleRef = useRef<any>(null);
  const [placeholder] = useState("What's on your mind?");
  const inputFocusRef = useRef(false);
  // Focused input mode: fade recent drops when keyboard is active
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [recentDropsOpacity] = useState(() => new Animated.Value(1));
  const handleInputFocusChange = useCallback(
    (focused: boolean) => {
      inputFocusRef.current = focused;
      setIsInputFocused(focused);
      // Animate recent drops opacity
      Animated.timing(recentDropsOpacity, {
        toValue: focused ? 0.3 : 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    },
    [recentDropsOpacity],
  );

  // PanResponder for swipe-down-to-dismiss-keyboard gesture
  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const { dx, dy, vy } = gestureState;
        // Start handling when the user clearly drags mostly downward
        const isVerticalSwipe = Math.abs(dy) > Math.abs(dx);
        const isDownward = dy > 10 && vy >= 0;
        return isVerticalSwipe && isDownward;
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (gestureState.dy > 10) {
          Keyboard.dismiss();
        }
      },
      onPanResponderRelease: () => {
        Keyboard.dismiss();
      },
    }),
  ).current;

  // Compute photo hint text: show gentle prompt when photos exist but text is empty
  const noteIsEmpty = note.trim().length === 0;
  const requiresTextForPhotos = pendingPhotoUris.length > 0 && noteIsEmpty;
  const photoHintText = requiresTextForPhotos ? PHOTO_TEXT_HINT : undefined;

  const handleInputContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      if (!hasTypedRef.current) return;

      const raw = Math.ceil(event.nativeEvent.contentSize?.height ?? 0);
      if (!raw) return;

      // Deterministic height calculation: clamp between START and MAX
      const target = Math.max(START_HEIGHT, Math.min(raw, MAX_HEIGHT));

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
          max: MAX_HEIGHT,
        });
      }
    },
    [setInputDynHeight],
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

  // Track which drop_ids already have unsorted notes to prevent duplicates
  // This is needed because dropIdRef persists across submissions but unsortedIdRef gets cleared
  const unsortedNotesByDropIdRef = useRef<Map<string, string>>(new Map());

  // Phase 1B: Submission mutex to prevent rapid duplicate submits
  const submissionMutex = useRef<Map<string, boolean>>(new Map());

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

  // Ref to hold the addPendingItem callback from RecentDrops component
  const addPendingItemRef = useRef<
    | ((params: {
        dropId: string;
        text: string;
        kind: 'todo' | 'habit' | 'note';
        noteSubtype?: string;
      }) => void)
    | null
  >(null);

  // Callback to receive addPendingItem from RecentDrops
  const handleReceiveAddPendingItem = useCallback(
    (
      callback: (params: {
        dropId: string;
        text: string;
        kind: 'todo' | 'habit' | 'note';
        noteSubtype?: string;
      }) => void,
    ) => {
      addPendingItemRef.current = callback;
    },
    [],
  );

  // Callback to sync "X thoughts organized today" counter with actual Today items count
  const handleTodayCountChange = useCallback(
    (count: number) => {
      // Only update if test override is not set
      if (typeof testOrganizedTodayOverride !== 'number') {
        setOrganizedToday(count);
      }
    },
    [testOrganizedTodayOverride],
  );

  const isProcessing = isSubmitting || isThinking;

  const hour = new Date().getHours();
  const contextPrompt =
    hour >= 6 && hour < 12
      ? "Good morning! What's on\nyour mind?"
      : hour >= 12 && hour < 17
        ? 'Afternoon brain dump?'
        : hour >= 17 && hour < 22
          ? 'Evening thoughts?'
          : 'Capture those late-night\nthoughts...';

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

  // When overlay is saved, refresh the Recent Drops list (which will update the counter via callback)
  useEffect(() => {
    const unsub = addOverlaySavedListener(() => {
      triggerRecentRefresh();
    });
    return unsub;
  }, [triggerRecentRefresh]);

  // Memoized disabled state: allow submit if note OR photos present
  const disabled = useMemo(
    () => (note.trim().length === 0 && pendingPhotoUris.length === 0) || isSubmitting || isThinking,
    [note, pendingPhotoUris, isSubmitting, isThinking],
  );
  const isButtonVisuallyDisabled = note.trim().length === 0 && pendingPhotoUris.length === 0;

  // Dynamic placeholder based on photo presence
  const dynamicPlaceholder = useMemo(
    () => (pendingPhotoUris.length > 0 ? 'Add a note about these?' : placeholder),
    [pendingPhotoUris, placeholder],
  );

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
    unsortedNotesByDropIdRef.current.clear(); // Clear drop_id tracking
    setNote('');
    setPendingPhotoUris([]); // Photo Drop: clear photos on reset
    setIsSubmitting(false);
    setIsThinking(false);
    setConfirmations([]);
    setInputDynHeight(START_HEIGHT);
    hasTypedRef.current = false;
    lastAppliedHeightRef.current = START_HEIGHT;
  }, []);

  // Trust Builders: Handle test override for organized today count
  useEffect(() => {
    if (typeof testOrganizedTodayOverride === 'number') {
      setOrganizedToday(testOrganizedTodayOverride);
    }
    // Counter is now synced via RecentDrops onTodayCountChange callback
    // No need for periodic refresh since the list updates reactively
  }, [testOrganizedTodayOverride]);

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

  // Navigate to Search → Recent (fallback toast if route missing)
  const handleViewDetails = useCallback(() => {
    try {
      // Navigate to Search tab; pass filter for future use if supported
      (navigation as any).navigate('Tabs', { screen: 'Search', params: { filter: 'recent' } });
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
        // Photo drop rule: Pass hasAttachments to force log-general for uncertain classifications
        decision = await decideWithContext(
          { text: cleanedText, hasAttachments: currentSubmissionHasPhotosRef.current },
          ctx,
        );
        step(trace, 'decide:result', {
          mode: decision.mode,
          confidence: decision.confidence,
          actions: Array.isArray(decision.actions) ? decision.actions.map((a) => a.type) : [],
          suggestions: Array.isArray(decision.suggestions) ? decision.suggestions.length : 0,
        });

        // Development-only logging for Mind Drop AI classification
        if (__DEV__ && decision.mindDropDecision) {
          const trimmedText =
            cleanedText.length > 120 ? cleanedText.slice(0, 120) + '…' : cleanedText;
          console.log(
            `[MindDrop AI] type=${decision.mindDropDecision.probableKind} ai_confidence=${decision.mindDropDecision.aiConfidence ?? 'null'} text="${trimmedText}"`,
          );
        }

        // Check canonical intent before forcing chips
        // Only show chips when:
        // 1. needsClarification is true (ambiguous intent)
        // 2. OR no canonical decision available (fallback to heuristic)
        const shouldSkipChips =
          decision.mindDropDecision &&
          decision.mindDropDecision.probableKind === 'log' &&
          !decision.mindDropDecision.needsClarification;

        if (__DEV__ && decision.mindDropDecision) {
          console.log('[CanonicalIntent] Chip decision:', {
            showChips: !shouldSkipChips,
            reason: shouldSkipChips
              ? 'confident-log'
              : decision.mindDropDecision.needsClarification
                ? 'ambiguous-intent'
                : 'heuristic-narrative-detection',
            probableKind: decision.mindDropDecision.probableKind,
            needsClarification: decision.mindDropDecision.needsClarification,
          });
        }

        // Early narrative detection guard: force category chips to prevent multiple catchall notes
        // SKIP this guard if canonical intent says this is a clear log
        if (classifyNarrative(cleanedText) && !shouldSkipChips) {
          // Check if we already have an unsorted note for this drop_id
          const existingUnsortedId = unsortedNotesByDropIdRef.current.get(dropId);

          if (existingUnsortedId) {
            // Reuse existing unsorted note for this drop_id
            unsortedIdRef.current = existingUnsortedId;
            console.debug('[MindDrop][Narrative] Reusing existing unsorted note for drop_id', {
              dropId,
              unsortedId: existingUnsortedId,
            });
          } else if (unsortedIdRef.current == null) {
            // Create new unsorted note only if we don't have one yet
            try {
              const narrativeTags = extractMeaningfulTags(cleanedText, 'journal');
              // Phase 4A: Apply quality filter to initial tags (same as BackgroundPrefill)
              const qualityFiltered = applyTagQualityFilter(narrativeTags);
              const tagsForCreate = qualityFiltered.length > 0 ? qualityFiltered : null;
              // Use trimmed (original text) to preserve full body including date references
              const id = await saveToUnsortedTray(repo as any, trimmed, {
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
                // Track this drop_id to prevent duplicates
                unsortedNotesByDropIdRef.current.set(dropId, id);
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
          // Step 1: Create unsorted note first (unified pipeline invariant)
          let unsortedNoteId: string | null = null;

          // Check if we already have an unsorted note for this drop_id
          const existingUnsortedId = unsortedNotesByDropIdRef.current.get(dropId);

          if (existingUnsortedId) {
            // Reuse existing unsorted note for this drop_id
            unsortedNoteId = existingUnsortedId;
            unsortedIdRef.current = existingUnsortedId;
            console.debug('[MindDrop][AutoCreate] Reusing existing unsorted note for drop_id', {
              dropId,
              unsortedId: existingUnsortedId,
            });
          } else if (unsortedIdRef.current == null) {
            // Create new unsorted note only if we don't have one yet
            try {
              // Compute combined AI tags from cortexDecide response
              const engineTags = Array.isArray(decision.engineTags) ? decision.engineTags : [];
              const classificationTagsRaw = Array.isArray(decision.meta?.classification?.tags)
                ? (decision.meta?.classification?.tags as string[])
                : [];
              const tagsForUnsorted = filterAndNormalizeTags([
                ...engineTags,
                ...classificationTagsRaw,
              ]);
              // Phase 4A: Apply quality filter to initial tags (same as BackgroundPrefill)
              const qualityFiltered = applyTagQualityFilter(tagsForUnsorted);

              // Use trimmed (original text) to preserve full body including date references
              const createdId = await saveToUnsortedTray(repo, trimmed, {
                sourceMessageId: validSourceMessageId ?? undefined,
                whyString: 'Auto-organizing via Mind Drop',
                tags: qualityFiltered,
                dropId,
              });
              unsortedNoteId = createdId ?? null;
              unsortedIdRef.current = unsortedNoteId;

              if (unsortedNoteId) {
                // Track this drop_id to prevent duplicates
                unsortedNotesByDropIdRef.current.set(dropId, unsortedNoteId);
              }
            } catch (err) {
              console.warn('[MindDrop][AutoCreate] Failed to create unsorted note', err);
              // If we can't create unsorted note, fall through to ask mode
              unsortedNoteId = null;
            }
          } else {
            unsortedNoteId = unsortedIdRef.current;
          }

          if (!unsortedNoteId) {
            // Couldn't create unsorted note - skip auto-create
            console.warn('[MindDrop][AutoCreate] No unsorted note available, skipping auto-create');
          } else {
            try {
              const createdIds = {
                todos: [] as string[],
                habits: [] as string[],
                notes: [] as string[],
              };
              const createdDetails: OrganizedDetail[] = [];
              let firstTodoId: string | null = null;
              const firstAction = actions[0];

              //Step 2A: Classification stage - create entities based on decision
              if (firstAction.type === 'create.todo') {
                // Use Stage A for todos
                const stageAResult = await runMindDropStageAClassification({
                  repo,
                  text: trimmed,
                  cleanedText,
                  decision,
                  dropId,
                  sourceMessageId: validSourceMessageId ?? null,
                  parsedDue: parsedIso,
                  unsortedNoteId,
                });

                createdIds.todos = stageAResult.entities.todos;
                createdDetails.push(...stageAResult.entityDetails);
                firstTodoId = createdIds.todos[0] ?? null;
              } else if (firstAction.type === 'create.habit') {
                // Use Stage A for habits
                const stageAResult = await runMindDropStageAClassification({
                  repo,
                  text: trimmed,
                  cleanedText,
                  decision,
                  dropId,
                  sourceMessageId: validSourceMessageId ?? null,
                  parsedDue: parsedIso,
                  unsortedNoteId,
                });

                createdIds.habits = stageAResult.entities.habits;
                createdDetails.push(...stageAResult.entityDetails);
              } else if (firstAction.type === 'create.note' || firstAction.type === 'add.to.list') {
                // Handle notes inline (complex logic with UI dependencies)
                const rawSubtype =
                  firstAction.type === 'add.to.list'
                    ? 'list'
                    : (firstAction.payload.subtype ??
                      decision.mindDropDecision?.logSubtype ??
                      'everything_else');

                const subtype =
                  rawSubtype === 'journal'
                    ? 'journal'
                    : rawSubtype === 'list'
                      ? 'list'
                      : rawSubtype === 'idea'
                        ? 'idea'
                        : rawSubtype === 'reference'
                          ? 'reference'
                          : 'everything_else';

                const canonicalType = persistedToCanonical('note', subtype);
                const whyUpdate = appendLineageToWhyString('Auto-organizing via Mind Drop', {
                  originId: unsortedNoteId,
                  source: 'auto_classification',
                });

                const existingNote = await repo.getById(unsortedNoteId);
                const existingLabels = (existingNote as any)?.labels || [];

                const updatedLabels = existingLabels.filter(
                  (l: string) => l !== 'catchall' && l !== 'needs_review',
                );
                if (!updatedLabels.includes('log')) {
                  updatedLabels.push('log');
                }

                const shouldAddListTag = subtype === 'list';
                const updatePatch: any = {
                  subtype,
                  canonicalType,
                  ai_placed: true,
                  why_string: whyUpdate,
                  views: {
                    alsoShowIn: ['Hub:Catch-All'],
                    minddrop_stage: 'classified', // Mark classification complete
                    ai_pending: false,
                  },
                  labels: updatedLabels,
                };

                if (shouldAddListTag) {
                  const existingTags = (existingNote as any)?.tags || [];
                  const hasListTag = existingTags.some(
                    (t: string) => t.toLowerCase().replace(/^[#@*]+/, '') === 'list',
                  );
                  if (!hasListTag) {
                    updatePatch.tags = [...existingTags, 'list'];
                  }
                }

                const updatedNote = await repo.update({
                  id: unsortedNoteId,
                  patch: updatePatch,
                });

                createdIds.notes.push(updatedNote.id);
                createdDetails.push({ kind: 'note', noteSubtype: subtype });
              }

              const counts = {
                todos: createdIds.todos.length,
                notes: createdIds.notes.length,
                habits: createdIds.habits.length,
              };

              // Step 2B: Prefill stage - run AI enhancement for all created entities
              runMindDropStageBPrefill({
                repo,
                entityIds: createdIds,
                rawText: cleanedText,
              })
                .then(() => {
                  // Ensure Recent Drops reflect enriched titles/tags once Stage B finishes
                  // This is important even if Supabase Realtime is flaky.
                  console.debug('[MindDrop.StageB.UI] Refreshing RecentDrops after StageB');
                  triggerRecentRefresh();
                })
                .catch((error) => {
                  // Non-fatal: the todo/note/habit still exists, just without enrichment
                  console.warn('[MindDrop.StageB.UI] Prefill failed', error);
                });

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
                  convertedFromUnsorted: true,
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

        // AUTHORITATIVE: Show chips when decision.mode === 'ask'
        if (decision.mode === 'ask') {
          console.log('[MindDrop][Chips] mode=ask detected, showing category chips');

          // Check if we already have an unsorted note for this drop_id
          const existingUnsortedId = unsortedNotesByDropIdRef.current.get(dropId);

          if (existingUnsortedId) {
            // Reuse existing unsorted note for this drop_id
            unsortedIdRef.current = existingUnsortedId;
            console.debug('[MindDrop][Ask] Reusing existing unsorted note for drop_id', {
              dropId,
              unsortedId: existingUnsortedId,
            });
          } else {
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
                const extractionSubtype =
                  fallbackSubtype === 'catchall' ? undefined : fallbackSubtype;
                const fallbackTags =
                  classificationTags.length > 0
                    ? classificationTags
                    : extractMeaningfulTags(cleanedText, extractionSubtype);
                // Phase 4A: Apply quality filter to initial tags (same as BackgroundPrefill)
                const qualityFiltered = applyTagQualityFilter(fallbackTags);
                const tagsForCreate = qualityFiltered.length > 0 ? qualityFiltered : null;

                // Mode='ask' means user needs to pick category, so use 'Awaiting chip selection'
                // Use trimmed (original text) to preserve full body including date references
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
                    mode: decision.mode,
                  });
                  // Track this drop_id to prevent duplicates
                  unsortedNotesByDropIdRef.current.set(dropId, id);
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
              console.debug(
                '[MindDrop][Ask] Reusing existing unsorted note, not creating duplicate',
              );
              // Fallback: create unsorted note if ref is still null despite duplicate text
              if (unsortedIdRef.current == null) {
                console.warn(
                  '[MindDrop][Ask] unsortedIdRef was null despite duplicate text, creating anyway',
                );
                // Use trimmed (original text) to preserve full body including date references
                const id = await saveToUnsortedTray(repo as any, trimmed, {
                  sourceMessageId: validSourceMessageId ?? undefined,
                  whyString: 'Awaiting chip selection',
                  dropId,
                });
                if (id) {
                  unsortedNotesByDropIdRef.current.set(dropId, id);
                }
                unsortedIdRef.current = id ?? null;
              }
            }
          }

          const savedUnsortedId = unsortedIdRef.current;
          const confidence = decision.confidence ?? 0;

          // ALWAYS show category chips when mode='ask' (removed confidence/narrative conditions)
          if (savedUnsortedId) {
            setLowConfidenceUnsortedId(savedUnsortedId);
            setCategoryChips([
              { kind: 'todo', label: 'Add to To-Do List' },
              { kind: 'log', label: 'Just Save It' },
              { kind: 'habit', label: 'Start a Habit' },
            ]);
            console.log('[MindDrop][Chips] Category chips set for mode=ask', {
              unsortedId: savedUnsortedId,
              confidence,
            });
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

          // Fallback if no unsorted ID (shouldn't normally happen)
          console.warn('[MindDrop][Chips] mode=ask but no unsortedId available');
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

        // Check if we already have an unsorted note for this drop_id
        const existingUnsortedId = unsortedNotesByDropIdRef.current.get(dropId);

        if (existingUnsortedId) {
          // Reuse existing unsorted note for this drop_id
          unsortedIdRef.current = existingUnsortedId;
          console.debug('[MindDrop][NoActions] Reusing existing unsorted note for drop_id', {
            dropId,
            unsortedId: existingUnsortedId,
          });
        } else if (unsortedIdRef.current == null) {
          // Create new unsorted note only if we don't have one yet
          try {
            const fallbackTags = extractMeaningfulTags(trimmed);
            // Phase 4A: Apply quality filter to initial tags (same as BackgroundPrefill)
            const qualityFiltered = applyTagQualityFilter(fallbackTags);
            const tagsForCreate = qualityFiltered.length > 0 ? qualityFiltered : null;

            // Only use 'Awaiting chip selection' when mode='ask'
            // For reflection logs (mode='auto'), use 'Captured via Mind Drop'
            const whyString =
              decision?.mode === 'ask' ? 'Awaiting chip selection' : 'Captured via Mind Drop';

            const id = await saveToUnsortedTray(repo as any, trimmed, {
              sourceMessageId: validSourceMessageId ?? undefined,
              whyString,
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
              // Track this drop_id to prevent duplicates
              unsortedNotesByDropIdRef.current.set(dropId, id);
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

  /**
   * Mind Drop AI Pipeline - Extracted for v3 instant submission support
   *
   * This function contains the AI-heavy logic that classifies user input and creates entities.
   * In v2 (blocking), onSubmit awaits this before returning.
   * In v3 (instant), onSubmit returns immediately after creating provisional note,
   * then runs this pipeline in the background.
   *
   * Logic extracted from onSubmit starting at performSave() retry loop.
   */
  type MindDropPipelineParams = {
    trimmed: string;
    dropId: string;
    validSourceMessageId: string | null | undefined;
    textHash: string;
    photoUris?: string[]; // Optional photo attachments to upload after note creation
  };

  async function runMindDropPipeline(params: MindDropPipelineParams): Promise<{
    success: boolean;
    result: SaveResult | null;
    error?: any;
  }> {
    const { trimmed, dropId, validSourceMessageId, textHash, photoUris } = params;

    try {
      // We'll attempt performSave() up to 2 times total.
      let attempt = 0;
      const maxAttempts = 2;
      let finalResult: SaveResult | null = null;
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
            // First failure — show "retrying" toast and try again
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
          // Check if we already have an unsorted note for this drop_id
          const existingUnsortedId = unsortedNotesByDropIdRef.current.get(dropId);

          let offlineRetryId: string | undefined;
          if (existingUnsortedId) {
            // Reuse existing unsorted note for this drop_id
            offlineRetryId = existingUnsortedId;
            console.debug('[MindDrop][OfflineRetry] Reusing existing unsorted note for drop_id', {
              dropId,
              unsortedId: existingUnsortedId,
            });
          } else {
            // Offline-ish path — save locally and reassure
            offlineRetryId = await saveToUnsortedTray(repo, trimmed, {
              sourceMessageId: validSourceMessageId ?? undefined,
              dropId,
            });
            if (offlineRetryId) {
              logMetrics('minddrop_unsorted_created', {
                noteId: offlineRetryId,
                dropId,
                mode: 'offline_retry',
              });
              // Track this drop_id to prevent duplicates
              unsortedNotesByDropIdRef.current.set(dropId, offlineRetryId);
            }
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
          // Check if we already have an unsorted note for this drop_id
          const existingUnsortedId = unsortedNotesByDropIdRef.current.get(dropId);

          let unsortedFallbackId: string | undefined;
          if (existingUnsortedId) {
            // Reuse existing unsorted note for this drop_id
            unsortedFallbackId = existingUnsortedId;
            console.debug(
              '[MindDrop][UnsortedFallback] Reusing existing unsorted note for drop_id',
              {
                dropId,
                unsortedId: existingUnsortedId,
              },
            );
          } else {
            // Non-network error: save to Unsorted Tray for manual follow-up
            unsortedFallbackId = await saveToUnsortedTray(repo, trimmed, {
              sourceMessageId: validSourceMessageId ?? undefined,
              dropId,
            });
            if (unsortedFallbackId) {
              logMetrics('minddrop_unsorted_created', {
                noteId: unsortedFallbackId,
                dropId,
                mode: 'fallback_unsorted',
              });
              // Track this drop_id to prevent duplicates
              unsortedNotesByDropIdRef.current.set(dropId, unsortedFallbackId);
            }
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
        // Refresh recent drops list (counter updates via callback)
        triggerRecentRefresh();
        focusGreetingForA11y();

        return { success: false, result: null, error: lastError };
      }

      // SUCCESS PATH — AI classification complete
      // Mark all created entities as no longer ai_pending
      try {
        const allCreatedIds = [
          ...(finalResult.created.todos ?? []),
          ...(finalResult.created.notes ?? []),
          ...(finalResult.created.habits ?? []),
        ];

        // Update views.ai_pending = false for all created entities
        await Promise.allSettled(
          allCreatedIds.map(async (entityId) => {
            try {
              const entity = await repo.getById(entityId);
              if (!entity) return;

              await repo.update({
                id: entityId,
                patch: {
                  views: {
                    ...(entity.views ?? {}),
                    ai_pending: false,
                  },
                },
              });
            } catch (err) {
              console.warn('[MindDrop][Pipeline] Failed to clear ai_pending flag:', entityId, err);
            }
          }),
        );
      } catch (err) {
        // Non-critical: log but don't fail the pipeline
        console.warn('[MindDrop][Pipeline] Failed to clear ai_pending flags:', err);
      }

      // Upload photos to created notes (if any)
      // Photos are only attached to notes (logs), not todos or habits
      if (photoUris && photoUris.length > 0) {
        const createdNotes = finalResult.created.notes ?? [];
        if (createdNotes.length > 0) {
          // Upload photos to the first created note
          const noteId = createdNotes[0];
          const currentUserId = user?.id ?? userId;
          if (noteId && currentUserId) {
            try {
              await uploadPhotosToNote(repo, noteId, currentUserId, photoUris);
              console.log('[MindDrop][Pipeline] Photos uploaded successfully for note:', noteId);
            } catch (err) {
              // Non-critical: note is created, photos just failed to upload
              console.warn('[MindDrop][Pipeline] Failed to upload photos:', err);
            }
          }
        } else {
          console.warn('[MindDrop][Pipeline] Photos provided but no note was created');
        }
      }

      return { success: true, result: finalResult };
    } catch (error) {
      console.error('[MindDrop][Pipeline] Unexpected error:', error);
      return { success: false, result: null, error };
    }
  }

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

      // Prevent duplicate conversions from rapid clicks using ref for immediate sync check
      if (submitLockRef.current) {
        console.warn('[MindDrop][CategoryChip] Already processing, ignoring duplicate click');
        return;
      }

      try {
        submitLockRef.current = true;
        setIsSubmitting(true);
        setCategoryChips([]);

        if (kind === 'todo') {
          // Convert unsorted → todo using conversion helper
          try {
            const original = await repo.getById(unsortedId);
            if (!original) {
              throw new Error('Original note not found');
            }

            const dropId =
              (typeof (original as any)?.drop_id === 'string' && (original as any).drop_id) ||
              dropIdRef.current ||
              null;

            // Parse due date from original text if available
            const rawBody = String(
              (original as any)?.body ?? (original as any)?.title ?? (original as any)?.text ?? '',
            );
            const parsedDue = parseDue(rawBody);
            const confidentDue =
              parsedDue && parsedDue.confidence >= DUE_CONFIDENCE_FLOOR ? parsedDue : null;
            const dueDate = confidentDue?.date ?? null;

            // Use conversion helper to create first-class todo
            const { todo: createdTodo } = await convertUnsortedToTodo(repo, unsortedId, {
              due: dueDate,
            });

            setOrganizedToday((prev) => prev + 1);
            triggerRecentRefresh();
            setLowConfidenceUnsortedId(null);
            unsortedIdRef.current = null;

            metricsRef.current.conversions += 1;
            logMetrics('category_converted_todo', {
              noteId: unsortedId,
              todoId: createdTodo.id,
              via: 'conversion_helper',
              dropId,
              mode: 'ask',
            });

            // Phase 2E / Mind Drop v3: Never auto-open overlay from Mind Drop
            // Overlay should only open on deliberate user action (tap), not automatically
            // when AI finishes classification or enrichment.
            // User can open from Recent Drops or Today when ready.
            console.log(
              '[MindDrop][Debug][openOverlay] Skipping auto-open for todo (Phase 2E - no auto-open from Mind Drop)',
              {
                todoId: createdTodo.id,
              },
            );

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: 'Converted to To-Do ✓',
              });
            }
          } catch (conversionError) {
            console.error('[MindDrop][CategoryChip] Todo conversion failed', conversionError);

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: '❌ Failed to create To-Do. Please try again.',
              });
            }

            // Don't clear the unsorted state - let the user retry
            setLowConfidenceUnsortedId(null);
            unsortedIdRef.current = null;
            submitLockRef.current = false;
            setIsSubmitting(false);
            return;
          }
        } else if (kind === 'habit') {
          // Convert unsorted → habit using conversion helper
          try {
            const original = await repo.getById(unsortedId);
            if (!original) {
              throw new Error('Original note not found');
            }

            const dropId =
              (typeof (original as any)?.drop_id === 'string' && (original as any).drop_id) ||
              dropIdRef.current ||
              null;

            // Extract frequency from the original text using buildHabitFields
            // This handles patterns like "Run 3x per week" → frequency='weekly', frequencyValue=3
            const rawText = (original as any)?.body ?? (original as any)?.title ?? '';
            const habitFields = buildHabitFields(rawText);

            // Use the conversion helper to create a first-class habit with parsed frequency
            const { habit: createdHabit } = await convertUnsortedToHabit(repo, unsortedId, {
              frequency: habitFields.freq,
              frequencyValue: habitFields.frequencyValue ?? null,
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

            // Phase 2E / Mind Drop v3: Never auto-open overlay from Mind Drop
            // Overlay should only open on deliberate user action (tap), not automatically
            // when AI finishes classification or enrichment.
            // User can open from Recent Drops or Today when ready.
            console.log(
              '[MindDrop][Debug][openOverlay] Skipping auto-open for habit (Phase 2E - no auto-open from Mind Drop)',
              {
                habitId: createdHabit.id,
                frequency: createdHabit.frequency,
              },
            );

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: 'Started a habit ✓',
              });
            }
          } catch (habitError) {
            console.error('[MindDrop][CategoryChip] Habit conversion failed', habitError);

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: 'Could not create habit',
              });
            }
          }
        } else {
          // Log: Convert unsorted note to canonical log using AI subtype classification
          try {
            const originalNote = await repo.getById(unsortedId);
            if (!originalNote) {
              throw new Error('Original note not found');
            }

            // Do NOT pass subtype - let convertUnsortedToLog use AI classification
            // This ensures AI determines the best subtype (journal/list/reference/idea/plain)
            const { note: convertedLog } = await convertUnsortedToLog(repo, unsortedId);

            setOrganizedToday((prev) => prev + 1);
            triggerRecentRefresh();
            setLowConfidenceUnsortedId(null);
            unsortedIdRef.current = null;

            // Mind Drop v3: Skip auto-opening overlay for logs
            // Overlay should only open on deliberate user action (tap), not automatically.
            // User doesn't need to edit logs immediately after creation.
            console.log('[MindDrop][Debug][openOverlay] Skipping auto-open for log', {
              noteId: convertedLog.id,
              subtype: convertedLog.subtype,
            });

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: 'Saved as note',
              });
            }
          } catch (logError) {
            console.error('[MindDrop][CategoryChip] Log conversion failed', logError);

            if (TOASTS_ON) {
              showActionToast({
                type: 'success',
                content: 'Could not save as note',
              });
            }
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
        submitLockRef.current = false;
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

  // Auto-dismiss category chips after timeout - default to log-general
  useEffect(() => {
    if (!categoryChips?.length) return;
    const timeout = setTimeout(() => {
      // Log timeout for telemetry before auto-selecting
      logMetrics('chip_timeout', {
        chips: categoryChips.map((c) => c.kind),
        defaultedTo: 'log-general',
        timeoutMs: CHIPS_AUTO_DISMISS_MS,
      });

      // Auto-select "Just Save It" (log-general)
      handleCategoryChipPick('log');
    }, CHIPS_AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [categoryChips, CHIPS_AUTO_DISMISS_MS, logMetrics, handleCategoryChipPick]);

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
  }, [timingChips, pendingTodoId, logMetrics, handleTimingSelection]);

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

      // Auto-dismiss photo text nudge when user starts typing
      if (showPhotoTextNudge && nextValue.trim().length > 0) {
        setShowPhotoTextNudge(false);
      }

      setNote(nextValue);
      if (nextValue.length === 0) {
        hasTypedRef.current = false;
        setInputDynHeight(START_HEIGHT);
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

    // Photos go through the normal Mind Drop pipeline (no overlay shortcut)
    // They will be uploaded after the note is created via uploadPhotosToNote
    const hasPhotos = pendingPhotoUris.length > 0;

    // Track if current submission has photos for classification default to log-general
    currentSubmissionHasPhotosRef.current = hasPhotos;

    // For photo-only drops (no text), create a minimal placeholder text
    // This ensures the note has some content for display in lists
    const effectiveText = trimmed || (hasPhotos ? '📷 Photo capture' : '');

    if (!effectiveText) {
      setIsSubmitting(false);
      submitLockRef.current = false;
      currentSubmissionHasPhotosRef.current = false;
      return;
    }

    // Phase 1B: Text-hash-based mutex to prevent rapid duplicate submissions
    const textHash = hashString(effectiveText);
    if (submissionMutex.current.get(textHash)) {
      console.log('[MindDrop] Duplicate submission blocked', textHash);
      setIsSubmitting(false);
      submitLockRef.current = false;
      currentSubmissionHasPhotosRef.current = false;
      return;
    }

    // Set mutex for this text
    submissionMutex.current.set(textHash, true);

    // Prevent rapid repeat submissions of same text
    const MIN_SUBMIT_INTERVAL_MS = 2000;
    if (
      now - lastSubmitAt.current < MIN_SUBMIT_INTERVAL_MS &&
      effectiveText === lastSubmittedTextRef.current
    ) {
      setIsSubmitting(false);
      submitLockRef.current = false;
      // Clear mutex after window
      setTimeout(() => {
        submissionMutex.current.delete(textHash);
      }, 2000);
      return;
    }
    lastSubmitAt.current = now;

    // Duplicate prevention: if same text as last submission and we cleared state but unsorted note exists
    if (
      effectiveText === lastSubmittedTextRef.current &&
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
        // Check if we already have an unsorted note for this drop_id
        const existingUnsortedId = unsortedNotesByDropIdRef.current.get(dropId);

        let offlineId: string | undefined;
        if (existingUnsortedId) {
          // Reuse existing unsorted note for this drop_id
          offlineId = existingUnsortedId;
          console.debug('[MindDrop][Offline] Reusing existing unsorted note for drop_id', {
            dropId,
            unsortedId: existingUnsortedId,
          });
        } else {
          // Create new unsorted note
          offlineId = await saveToUnsortedTray(repo, effectiveText, {
            sourceMessageId: validSourceMessageId,
            dropId,
          });
          if (offlineId) {
            logMetrics('minddrop_unsorted_created', {
              noteId: offlineId,
              dropId,
              mode: 'offline_short_circuit',
            });
            // Track this drop_id to prevent duplicates
            unsortedNotesByDropIdRef.current.set(dropId, offlineId);
          }
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
        // Counter will update via RecentDrops onTodayCountChange callback when list refreshes
        triggerRecentRefresh();
        // A11y focus target after clearing input
        focusGreetingForA11y();
        return;
      }

      // Branch based on v2 (blocking) vs v3 (instant) mode
      if (MIND_DROP_V3_INSTANT) {
        // V3 INSTANT MODE: Fire-and-forget the AI pipeline
        // The pipeline runs in the background; UI resets immediately
        //
        // Mind Drop v3 UX: Overlay ONLY opens on deliberate user action (tap card/chip),
        // NOT automatically when AI finishes classification or prefill.
        // This prevents interrupting the user's flow.

        // OPTIMISTIC UI: Add pending item immediately for instant feedback
        // Use simple heuristic to predict kind (will be replaced when real entity appears)
        // For photo drops, default to note (log) kind
        const lowerText = effectiveText.toLowerCase();
        const seemsLikeTodo =
          !hasPhotos &&
          (/\b(buy|get|call|email|schedule|book|remind|cancel|update|fix|send)\b/.test(lowerText) ||
            /\b(todo|task|asap|urgent|deadline)\b/.test(lowerText));
        const seemsLikeHabit =
          !hasPhotos && /\b(every|daily|weekly|habit|routine|practice|quit|stop)\b/.test(lowerText);
        const probableKind = seemsLikeTodo ? 'todo' : seemsLikeHabit ? 'habit' : 'note';

        addPendingItemRef.current?.({
          dropId,
          text: effectiveText,
          kind: probableKind,
          noteSubtype: probableKind === 'note' ? 'everything_else' : undefined,
        });

        // Capture photos for background upload (they will be cleared from state)
        const photosToUpload = hasPhotos ? [...pendingPhotoUris] : undefined;

        void runMindDropPipeline({
          trimmed: effectiveText,
          dropId,
          validSourceMessageId,
          textHash,
          photoUris: photosToUpload,
        });

        // Immediately reset UI state
        resetState();
        setIsSubmitting(false);
        submitLockRef.current = false;
        lastSubmittedTextRef.current = effectiveText;

        // Keep submission mutex behavior: prevent duplicate submissions for same text
        setTimeout(() => {
          submissionMutex.current.delete(textHash);
        }, 2000);

        // Return early - don't await the pipeline in v3 mode
        return;
      }

      // Capture photos for background upload (they will be cleared from state)
      const photosToUpload = hasPhotos ? [...pendingPhotoUris] : undefined;

      // V2 BLOCKING MODE: Await the full pipeline before returning
      const pipelineResult = await runMindDropPipeline({
        trimmed: effectiveText,
        dropId,
        validSourceMessageId,
        textHash,
        photoUris: photosToUpload,
      });

      if (!pipelineResult.success) {
        // Pipeline handled failure (offline save or unsorted fallback)
        // resetState, toasts, and triggerRecentRefresh already called in pipeline
        return;
      }

      const finalResult = pipelineResult.result;
      if (!finalResult) {
        // Shouldn't reach here, but handle gracefully
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

      // Counter updates via RecentDrops onTodayCountChange callback when list refreshes
      triggerRecentRefresh();
      // A11y focus target after clearing input
      focusGreetingForA11y();
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
      currentSubmissionHasPhotosRef.current = false; // Reset photo tracking
      // Clear mutex after 2 second window
      setTimeout(() => {
        submissionMutex.current.delete(textHash);
      }, 2000);
    }
  }, [
    note,
    isSubmitting,
    pendingPhotoUris,
    performSave,
    repo,
    showActionToast,
    networkIsOnline,
    resetState,
    focusGreetingForA11y,
    triggerRecentRefresh,
    TOASTS_ON,
    ensureSubmissionAndDropIds,
    user,
    userId,
  ]);

  // Photo Drop handlers
  const addMindDropPhoto = useCallback(
    async (fromCamera: boolean) => {
      // Check max limit
      if (pendingPhotoUris.length >= 5) {
        Alert.alert('Maximum Photos', 'You can add up to 5 photos per Mind Drop.');
        return;
      }

      try {
        let result;
        if (fromCamera) {
          const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
          if (!permissionResult.granted) {
            Alert.alert('Permission Required', 'Camera permission is required to take photos.');
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            quality: 0.8,
          });
        } else {
          const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permissionResult.granted) {
            Alert.alert(
              'Permission Required',
              'Photo library permission is required to choose photos.',
            );
            return;
          }
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.8,
          });
        }

        if (!result.canceled && result.assets?.[0]?.uri) {
          setPendingPhotoUris((prev) => [...prev, result.assets[0].uri]);
        }
      } catch (error) {
        console.error('[MindDrop] Error adding photo:', error);
        Alert.alert('Error', 'Failed to add photo. Please try again.');
      }
    },
    [pendingPhotoUris],
  );

  const handleMindDropPhotoAction = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take photo', 'Choose from library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) return addMindDropPhoto(true);
          if (buttonIndex === 2) return addMindDropPhoto(false);
        },
      );
    } else {
      Alert.alert('Add photo', 'Choose an option', [
        { text: 'Take photo', onPress: () => addMindDropPhoto(true) },
        { text: 'Choose from library', onPress: () => addMindDropPhoto(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [addMindDropPhoto]);

  const handleRemovePendingPhoto = useCallback((index: number) => {
    setPendingPhotoUris((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    if (isSubmitting || isThinking || (!note.trim() && pendingPhotoUris.length === 0)) {
      return;
    }

    // Photo-only or photo+text submissions go through the normal Mind Drop pipeline
    // Photos are uploaded after the note is created via uploadPhotosToNote

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
  }, [isSubmitting, isThinking, uiMode, note, onSubmit, pendingPhotoUris.length]);

  const legacyUI = React.useMemo(() => {
    const statsVisible = organizedToday > 0;

    return (
      <View style={styles.mainContainer} {...panResponder.panHandlers}>
        {/* Header + greeting at the top */}
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
              <Image
                ref={headerTitleRef}
                source={MINDDROP_HEADER}
                style={styles.headerTitle}
                resizeMode="contain"
                accessibilityLabel="Mind Drop"
                accessibilityIgnoresInvertColors
              />
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

        {/* Scrollable Recent Drops in the middle - fades when input is focused */}
        <Animated.View
          style={[styles.scrollableSection, { opacity: recentDropsOpacity }]}
          pointerEvents={isInputFocused ? 'none' : 'auto'}
        >
          <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ flex: 1 }}>
            <RecentDropsMemo
              overlay={overlay}
              refreshSignal={recentRefresh}
              onEdited={noopCallback}
              onDeleted={noopCallback}
              onTodayCountChange={handleTodayCountChange}
              onAddPendingItem={handleReceiveAddPendingItem}
              initiallyOpen={true}
            />
          </Pressable>
        </Animated.View>

        {/* Fixed bottom section: input + chips + button + stats */}
        <View style={styles.fixedTopSection}>
          <View style={styles.inputBlock}>
            <MindDropInput
              value={note}
              onChangeText={handleChangeText}
              placeholder={dynamicPlaceholder}
              placeholderTextColor="#66706A"
              containerStyle={styles.inputContainer}
              focusedStyle={styles.inputContainerFocused}
              inputStyle={styles.input}
              focusedInputStyle={styles.inputFocused}
              onFocusChange={handleInputFocusChange}
              autoFocus
              onContentSizeChange={handleInputContentSizeChange}
              scrollEnabled
              showHud={false}
              iconContainerStyle={styles.inputIconCluster}
              iconButtonStyle={styles.inputIconButton}
              iconMicStyle={styles.inputIconMicButton}
              iconCameraStyle={styles.inputIconCameraButton}
              iconWrapperStyle={styles.inputIconWrapper}
              iconColor={c.mossGreen}
              heightWrapperStyle={styles.inputHeightWrapper}
              inputDynHeight={inputDynHeight}
              onCameraPress={handleMindDropPhotoAction}
              photoHintText={photoHintText}
            />
          </View>

          {pendingPhotoUris.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoStrip}
              contentContainerStyle={styles.photoStripContent}
            >
              {pendingPhotoUris.map((uri, index) => (
                <View key={uri} style={styles.photoThumb}>
                  <Image source={{ uri }} style={styles.photoThumbImage} />
                  <Pressable
                    style={styles.photoRemoveButton}
                    onPress={() => handleRemovePendingPhoto(index)}
                    accessibilityLabel={`Remove photo ${index + 1}`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.photoRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
              {pendingPhotoUris.length < 5 && (
                <Pressable
                  style={styles.photoAddButton}
                  onPress={handleMindDropPhotoAction}
                  accessibilityLabel="Add another photo"
                  accessibilityRole="button"
                >
                  <Text style={styles.photoAddText}>+</Text>
                </Pressable>
              )}
            </ScrollView>
          )}

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

          {categoryChips.length > 0
            ? (() => {
                console.log('[MindDrop][UI] Rendering category chips', {
                  chipsCount: categoryChips.length,
                  chips: categoryChips.map((c) => c.kind),
                });
                return (
                  <MidConfidenceChips
                    variant="category"
                    categoryChips={categoryChips}
                    onDirectPick={handleCategoryChipPick}
                    prompt="What would you like to do?"
                    autoDismissMs={CHIPS_AUTO_DISMISS_MS}
                  />
                );
              })()
            : (() => {
                console.log('[MindDrop][UI] No category chips to render');
                return null;
              })()}

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
                  isButtonVisuallyDisabled
                    ? styles.submitButtonDisabled
                    : styles.submitButtonActive,
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
          </View>

          {showPhotoTextNudge && (
            <View style={styles.photoTextNudge}>
              <View style={styles.photoTextNudgeHeaderRow}>
                <Icon name="Info" size="xs" color={c.mutedText} strokeWidth={1.6} />
                <Text style={styles.photoTextNudgeTitle}>Add a quick note</Text>
              </View>
              <Text style={styles.photoTextNudgeBody}>
                Gremly needs a few words so it can organize your photo.
              </Text>
            </View>
          )}

          {statsVisible ? (
            <View style={styles.trustRow} testID="minddrop-trust">
              <Text style={styles.trustStyled} testID="minddrop-trust-text">
                {organizedToday === 1
                  ? '1 thought organized today'
                  : `${organizedToday} thoughts organized today`}
              </Text>
            </View>
          ) : null}
        </View>
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
    handleTodayCountChange,
    overlay,
    inputDynHeight,
    handleBack,
    handleInfoOpen,
    recentDropsOpacity,
    isInputFocused,
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
              <Text style={styles.infoBody}>
                Stop trying to remember everything. This is where thoughts go to be safe. Drop it
                here, and Gremly will make sure nothing gets lost - whether it's a task, habit, or
                just something on your mind.
              </Text>
              <View style={styles.infoActions}>
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

      {/* Phase 5A: Removed outer ScrollView, content now manages its own scroll areas */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.contentWrapper,
            {
              paddingTop: insets.top + SPACE * 3,
              paddingBottom: 8,
              paddingHorizontal: SPACE * 2,
            },
          ]}
        >
          {content}
        </View>
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
    // Phase 5A: Removed contentScroll (no longer using ScrollView)
    contentWrapper: {
      flex: 1, // Phase 5A: Changed from flexGrow to flex for proper layout
    },
    // Container for entire Mind Drop UI with header-middle-bottom layout
    mainContainer: {
      flex: 1,
    },
    // Scrollable section for Recent Drops in the middle
    scrollableSection: {
      flex: 1, // Takes remaining space, enables scrolling
    },
    // Fixed section at bottom containing input, chips, button (non-scrolling)
    fixedTopSection: {
      // No flex: this section sizes to its content
      // Note: Name kept as fixedTopSection for compatibility but now positioned at bottom
    },
    headerContainer: {
      position: 'relative',
      paddingRight: 72,
      paddingTop: 4,
      paddingBottom: 0,
      marginBottom: -8,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      minHeight: 32,
      paddingVertical: 0,
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flex: 1,
    },
    headerTitle: {
      height: 64,
      width: 162, // 64 * (450/178) = ~162px
      resizeMode: 'contain',
      marginLeft: 8,
      marginRight: 8,
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
      width: 64,
      height: 72,
      right: 12,
      top: -8,
    },

    contextPrompt: {
      marginTop: -16,
      marginBottom: space * 1.5,
      color: '#66706A',
      fontFamily: 'Inter-Medium',
      fontSize: 14,
    },

    inputBlock: {
      position: 'relative',
      marginTop: 10, // Spacing after recent drops (divider removed)
      marginBottom: 0,
    },
    inputContainer: {
      width: '100%',
      borderRadius: 16,
      paddingHorizontal: INPUT_PADDING_LEFT,
      paddingTop: 14,
      paddingBottom: 12,
      backgroundColor: c.linenCream ?? '#F9F6F1',
      borderWidth: 1,
      borderColor: '#E0E0E0',
      minHeight: START_HEIGHT,
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
      lineHeight: 24,
      paddingRight: INPUT_ICON_PADDING_RIGHT,
      backgroundColor: 'transparent',
      borderWidth: 0,
      textAlignVertical: 'top',
      fontFamily: 'Inter-Regular',
      padding: 0,
      margin: 0,
      paddingTop: 0,
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

    photoTextNudge: {
      marginTop: space * 1.5,
      marginBottom: space,
      marginHorizontal: space * 2,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: c.linenCream,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(191,216,192,0.25)',
    },
    photoTextNudgeHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      columnGap: 6,
    },
    photoTextNudgeTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    photoTextNudgeBody: {
      fontSize: 13,
      color: c.mutedText,
      lineHeight: 18,
    },

    submitButtonWrapper: {
      marginTop: space * 2,
      marginBottom: 0,
      width: '100%',
    },
    submitButtonWrapperNoStats: {
      marginBottom: space,
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
      marginTop: space * 2,
      marginBottom: space * 2,
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
      marginTop: space,
      marginBottom: 6,
      marginHorizontal: space * 2,
      borderRadius: 999,
      alignSelf: 'stretch',
    },
    sectionDividerNoStats: {
      marginTop: 0,
    },

    // Phase 5A: recentRoot now fills scrollableSection container
    recentRoot: {
      marginTop: 20,
      flex: 1, // Takes full height of scrollableSection
    },
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
    // Phase 5A: recentList now takes remaining vertical space for scrolling
    recentList: {
      marginTop: 4,
      flex: 1, // Takes remaining vertical space in scrollableSection
    },
    recentScrollContent: {
      gap: space,
      paddingBottom: space * 2,
    },
    recentCard: {
      backgroundColor: c.linenCream,
      borderRadius: 4,
      height: 72,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.sageMist,
      shadowColor: 'rgba(46,85,64,0.08)',
      shadowOpacity: 1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
      justifyContent: 'space-between',
    },
    // Top row: Title (left) + Due/Time (right)
    recentTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    // Title styling - single line, medium weight, truncated
    recentTitle: {
      color: c.charcoalInk,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: 'Inter-Medium',
      flex: 1,
    },
    // Meta row contains category, tags, actions (second row)
    recentMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    // Left side of meta row (category + tags) - single line, no wrap
    recentMetaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
      overflow: 'hidden',
    },
    // Right side of meta row (action icons only)
    recentMetaRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    // Category pill (tiny, subtle)
    recentCategoryPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      fontSize: 10,
      overflow: 'hidden',
      color: c.mutedText,
      backgroundColor: c.sageTint,
      fontFamily: 'Inter-Medium',
      textTransform: 'capitalize',
    },
    // Phase 5b: Removed old recentTopRow, recentText, recentBadgeRow, recentBadge styles
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
    // Due date styling - medium weight, slightly smaller than title (14px)
    recentDueBadge: {
      fontSize: 14,
      color: c.charcoalInk,
      fontFamily: 'Inter-Medium',
      flexShrink: 0,
    },
    // Single-line tags with truncation
    recentTagsText: {
      color: '#8A9A8C', // Muted gray-green
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      flex: 1,
    },
    // Due date in metadata row - smaller, lighter weight for secondary info
    recentMetaDue: {
      fontSize: 12,
      color: c.mutedText,
      fontFamily: 'Inter-Regular',
      flexShrink: 0,
    },
    // Time ago in metadata row - same as recentMetaDue for consistency
    recentMetaTime: {
      color: c.mutedText,
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      flexShrink: 0,
    },
    // Time ago styling - regular weight, smaller (13px), secondary gray
    recentTime: {
      color: c.mutedText,
      fontSize: 13,
      fontFamily: 'Inter-Regular',
      flexShrink: 0,
    },
    recentEmpty: {
      color: c.mutedText,
      fontSize: 13,
      textAlign: 'center',
      fontFamily: 'Inter-Regular',
      paddingTop: 4,
      paddingBottom: 10,
    },
    // Skeleton styles for pending state
    titleSkeletonContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    titleSkeleton: {
      height: 14,
      flex: 1,
      backgroundColor: c.sageTint,
      borderRadius: 4,
      opacity: 0.6,
    },
    timeSkeleton: {
      height: 12,
      width: 50,
      backgroundColor: c.sageTint,
      borderRadius: 4,
      opacity: 0.6,
    },
    recentSkeletonLabel: {
      marginLeft: 8,
      fontSize: 13,
      color: c.mutedText,
    },
    tagSkeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    tagSkeleton: {
      height: 10,
      width: 50,
      backgroundColor: c.sageTint,
      borderRadius: 6,
      opacity: 0.6,
    },
    // Subtle hint for failed AI enrichment state
    subtleHint: {
      color: c.mutedText,
      fontSize: 11,
      fontFamily: 'Inter-Regular',
      fontStyle: 'italic',
      opacity: 0.7,
    },
    // Photo Drop styles
    photoStrip: {
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: space,
    },
    photoStripContent: {
      flexDirection: 'row',
      gap: 8,
    },
    photoThumb: {
      position: 'relative',
      width: 40,
      height: 40,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: c.sageTint,
    },
    photoThumbImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    photoRemoveButton: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: c.charcoalInk,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoRemoveText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 16,
    },
    photoAddButton: {
      width: 40,
      height: 40,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: c.mossGreen,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    photoAddText: {
      color: c.mossGreen,
      fontSize: 20,
      fontWeight: '400',
      lineHeight: 24,
    },
  });
}
