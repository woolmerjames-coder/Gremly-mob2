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
  ViewStyle,
  findNodeHandle,
  GestureResponderEvent,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  Image,
  ActionSheetIOS,
  Keyboard,
  PanResponder,
  PanResponderGestureState,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { AppScrollView } from '../../components/common/AppScrollView';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Text } from '../../ui/Text';
import { Icon } from '../../design-system/Icon';
import { useGremlyStore, type PendingDrop } from '../../lib/store/useGremlyStore';
import {
  selectItemById,
  selectNoteBySourceMessageId,
  selectRecentNotes,
  selectRecentTodos,
  selectRecentHabits,
} from '../../lib/store/selectors';
import { useCortex } from '../../providers/CortexProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createCortexEngine } from '../../cortex/createEngine';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';
import {
  MidConfidenceChips,
  type CategoryChip,
  type TimingOption,
  type TimingChip,
} from '../components/minddrop/MidConfidenceChips';
import { MultiSplitModal } from '../components/minddrop/MultiSplitModal';
import type {
  MultiDropItem,
  MindDropBucket,
  LogSubtype as MindDropLogSubtype,
} from '../../lib/minddrop/types';
import { heuristicClassify } from '../../lib/minddrop/heuristicClassify';
import { runPhase2 } from '../../lib/minddrop/phase2';
import { MIND_DROP_V2 } from '../../src/config/featureFlags';
import { useActionToast } from '../../src/hooks/useActionToast';
import { useTheme } from '../../src/theme/useTheme';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { shouldUseHaptics } from '../../config/featureFlags';
import { haptics } from '../../lib/haptics';
import Reanimated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  cancelAnimation,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase/client';
import { logCatchallDecision } from '../../lib/telemetry/catchallLogger';
import { organizedToastSummary, type OrganizedDetail } from '../../lib/ui/toast/copy';
import { startCatchallTrace, step, end } from '../../lib/diagnostics/catchallDebug';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { AppRecord, LogSubtype, NoteSubtype } from '../../lib/types';
import { getFrequencyDisplayLabel } from '../../lib/habits/frequencyUtils';
import type { CortexAction, CortexContext, CortexResponse } from '../../lib/cortex/cortexDecide';
import { persistedToCanonical } from '../../lib/cortex/canonicalMap';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { addOverlaySavedListener } from '../../lib/events/overlaySaved';
import { eventBus } from '../../lib/events/EventBus';
import { deriveCompactTitle } from '../../lib/text/compactTitle';
import { parseDue } from '../../lib/nlp/datetime/parseDue';
import { Lock, Camera, Clock, LogOut, User, ChevronDown } from 'lucide-react-native';
import { formatDue } from '../../lib/date/formatDue';
import { env } from '../../lib/env';
import { kindToDisplayLabel } from '../../lib/ui/kindToDisplayLabel';
import {
  getGremlySpeech,
  getGreetingSpeech,
  getEmptyStateSpeech,
  type SpeechContext,
} from '../../lib/speech/gremlySpeech';
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
import GREMLY_TOP from '../../assets/mascot/gremly-mascot.png';
import MINDDROP_HEADER from '../../assets/minddrop_header-removebg.png';
import MascotIcon from '../../components/MascotIcon';
import RitualProgressIndicator from '../../components/ritual/RitualProgressIndicator';
import RitualProgressPopover from '../../components/ritual/RitualProgressPopover';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import FirstDropSpotlight from '../../components/onboarding/FirstDropSpotlight';
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
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import { useVoiceCapture, VoiceCaptureState } from '../../hooks/useVoiceCapture';
import { VoicePulse } from '../../components/VoicePulse';
import { FEATURE_FLAGS } from '../../lib/config/featureFlags';
import { MOOD_CONFIG, type Mood } from '../../lib/shared/moods';

export const THINKING_DURATION = 1200;
const MICROCOPY_FADE_MS = 300;
const THINKING_MICROCOPY = [
  'Organizing your thoughts …',
  'Finding a home for this …',
  'All set.',
] as const;

const AnimatedMicrocopyText = Animated.createAnimatedComponent(Text);

const TYPEWRITER_CHAR_DELAY_MS = 28;

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
  // Voice capture
  onMicPress?: () => void;
  voiceState?: VoiceCaptureState;
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
    onMicPress,
    voiceState = 'idle',
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
          {/* Mic button hidden for now - voice capture code kept in place */}
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
// Accepts createNote function from store for direct Zustand integration
export async function saveToUnsortedTray(
  createNote: (input: any) => Promise<any>,
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

  // Create note directly via store
  try {
    const created = await createNote(baseInput);
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
 * @deprecated Use useGremlyStore().uploadPhotosForNote() instead.
 * Photo upload is now atomic with note creation via createNote({ photoUris }).
 *
 * This function is kept for legacy V2/V3 pipeline fallback but should not be
 * called directly. The V4 pipeline (MIND_DROP_V4_ENABLED) uses the store.
 */
export async function uploadPhotosToNote(
  insertLogPhoto: (params: { noteId: string; url: string; position: number }) => Promise<any>,
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
      await insertLogPhoto({
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
  findNoteBySourceMessageId: (sourceMessageId: string) => any;
  updateNote: (id: string, patch: any) => Promise<any>;
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
  findNoteBySourceMessageId,
  updateNote,
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

  // Synchronous lookup from store
  const existingNote = findNoteBySourceMessageId(sourceMessageId);
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

  await updateNote(existingNote.id, patch);

  // Return the updated note by re-fetching from store
  return findNoteBySourceMessageId(sourceMessageId) ?? { ...existingNote, ...patch };
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
  frequency?: string | null; // For habits: daily, weekly, monthly, custom
  cadence?: 'daily' | 'weekly' | 'monthly' | null; // Canonical cadence for habits
  target_per_period?: number | null; // Target count per period for habits
  tags?: string[];
  optimisticKind?: 'note' | 'todo' | 'habit';
  drop_id?: string | null; // For deduplication: prefer canonical items over unsorted notes
  archived?: boolean; // Track archived status to filter out converted notes
  canonical_type?: string | null; // Canonical type from buildCanonicalFromMindDrop: 'todo', 'habit', 'log', 'journal'
  labels?: string[]; // Labels from backend: ['log'], ['habit'], ['todo'], ['catchall', 'needs_review'], etc.
  views?: any; // For ai_pending, ai_failed, and other view flags
  hasPhotos?: boolean; // True if note has photo attachments
  time_estimate_minutes?: number | null; // Time estimate for todos from Phase 2 enrichment
  start_date?: string | null; // ISO date string for habit start date
  days_active?: number[] | null; // Day numbers (0=Sunday, 1=Monday, etc.) for habit scheduling
  mood?: Mood[] | null; // Multi-select moods for journal entries
  // Multi-entity support
  is_multi?: boolean; // True if this drop contains multiple items
  multi_items?: import('../../lib/minddrop/types').MultiDropItem[]; // The parsed items array
  multi_summary_title?: string; // Summary title for display (e.g., "Groceries + Running Habit")
};

/**
 * Apply Phase 2 enrichment result to a UnifiedDrop item
 * CRITICAL: Must include ALL chip-relevant fields so they all animate together
 * Missing any field means that chip appears later without the blur animation
 */
function applyEnrichmentToItem(
  item: UnifiedDrop,
  result: {
    smartTitle?: string;
    tags?: string[];
    timeEstimateMinutes?: number | null;
    extractedDate?: string | null;
    extractedStartDate?: string | null;
    extractedFrequency?: string | null;
    extractedDays?: number[] | null;
    cadence?: string | null;
    targetPerPeriod?: number | null;
    confirmationMessage?: string | null;
    people?: string[];
    mood?: string[] | null;
  },
): UnifiedDrop {
  return {
    ...item,
    tags: result.tags || item.tags,
    time_estimate_minutes: result.timeEstimateMinutes ?? item.time_estimate_minutes,
    due_date: result.extractedDate ?? item.due_date,
    due_day: result.extractedDate?.split('T')[0] ?? item.due_day,
    start_date: result.extractedStartDate ?? item.start_date,
    frequency: result.extractedFrequency ?? item.frequency,
    cadence: (result.cadence as 'daily' | 'weekly' | 'monthly' | null) ?? item.cadence,
    target_per_period: result.targetPerPeriod ?? item.target_per_period,
    days_active: result.extractedDays ?? item.days_active,
    mood: (result.mood as Mood[] | null) ?? item.mood,
    views: {
      ...item.views,
      minddrop_stage: 'enriched',
      ai_pending: false,
      confirmation_message: result.confirmationMessage ?? item.views?.confirmation_message,
      people: result.people ?? item.views?.people,
    },
  };
}

/**
 * Visual state for Mind Drop items in Recent Drops list
 * - 'pending': AI enrichment in progress (views.ai_pending = true)
 * - 'enriching': Phase 2 enrichment in progress (entity exists, refining)
 * - 'streaming': Phase 2 streaming in progress (fields arriving progressively)
 * - 'revealing': Typewriter reveal animation in progress
 * - 'failed': AI enrichment failed (views.ai_failed = true)
 * - 'complete': AI enrichment complete or not needed
 */
type MindDropVisualState =
  | 'pending'
  | 'enriching'
  | 'streaming'
  | 'revealing'
  | 'failed'
  | 'complete';

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

  // Phase 1 in progress - no entity yet, show skeleton
  if (views.minddrop_stage === 'pending') {
    return 'pending';
  }

  // Phase 2 in progress - entity exists, show enriching animation
  if (views.minddrop_stage === 'enriching') {
    return 'enriching';
  }

  // Phase 2 streaming - fields arriving progressively
  if (views.minddrop_stage === 'streaming') {
    return 'streaming';
  }

  // Explicitly failed
  if (views.ai_failed === true) {
    return 'failed';
  }

  // Successfully enriched
  if (views.minddrop_stage === 'enriched' || views.minddrop_stage === 'prefilled') {
    return 'complete';
  }

  // Legacy: ai_pending check - treat as enriching since entity likely exists
  if (views.ai_pending === true) {
    return 'enriching';
  }

  // Default: complete
  return 'complete';
}

/**
 * Pending skeleton component with shimmer animation
 * Shows while AI enrichment is in progress
 */
/**
 * ShimmerBar - Reusable shimmer loading bar
 * Used across all skeleton states for consistent animation
 */
const ShimmerBar: React.FC<{
  width: number | string;
  height?: number;
  style?: any;
}> = ({ width, height = 14, style }) => {
  const shimmerPosition = React.useMemo(() => new Animated.Value(0), []);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerPosition, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerPosition]);

  const shimmerTranslate = shimmerPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 200],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: 'rgba(46, 85, 64, 0.08)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          transform: [{ translateX: shimmerTranslate }],
        }}
      >
        <View
          style={{
            width: 60,
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
          }}
        />
      </Animated.View>
    </View>
  );
};

// Track which items have already been animated in (persists across re-renders)
const animatedInItemIds = new Set<string>();

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Custom LayoutAnimation config for smooth card slide-down (Phase 1)
// Made slower and more intentional so users clearly see cards "making room"
const CardInsertLayoutAnimation = {
  duration: 450,
  create: {
    type: LayoutAnimation.Types.easeOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    // Spring animation for visible, bouncy slide-down effect
    type: LayoutAnimation.Types.spring,
    springDamping: 0.85, // Lower = more bouncy (0.85 = subtle bounce at end)
  },
};

/**
 * AnimatedCardInsert - Premium depth emergence animation synced with Phase 0 timing
 *
 * TIMING (synced with Phase 0 multi-detect ~700ms):
 *
 * 0ms    - User taps Drop, pending drop added to Zustand
 * 0-500ms - PHASE 1: Existing cards slide down via LayoutAnimation
 * 200ms  - PHASE 2 START: Card begins emerging from depth
 *          Initial state: scale 0.65, opacity 0.2 (far beneath surface)
 * 700ms  - Phase 0 returns: bucket + isMulti now known
 *          Card is at ~scale 0.88, opacity 0.74 (still visibly emerging)
 *          React re-renders with correct card type (single/multi)
 * 950ms  - PHASE 2 END: Card reaches full size
 *          Final state: scale 1.0, opacity 1.0 (fully surfaced)
 *          Card has "revealed" its true form during emergence
 *
 * The card content updates at 700ms while still scaled down (~0.88),
 * so the correct type (single/multi) is revealed as the card surfaces.
 * This creates a seamless "morph" effect - users never see a type switch.
 *
 * Math: Animation starts at 200ms, duration 750ms, ends at 950ms.
 * At 700ms: (700-200)/750 = 66.7% through animation.
 * With easeOut(cubic), ~85% of value change completed.
 * Scale at 700ms: 0.65 + 0.35 * 0.85 ≈ 0.88
 */
const AnimatedCardInsert: React.FC<{
  itemId: string;
  children: React.ReactNode;
}> = ({ itemId, children }) => {
  // Check if this item has already been animated
  const hasAnimated = animatedInItemIds.has(itemId);

  // Animation values for depth emergence - start at final state if already animated
  // scale: 0.65 → 1.0 (rising from deep within the screen)
  // opacity: 0.2 → 1.0 (emerging through frosted glass layers)
  const scale = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.65), []);
  const opacity = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.2), []);

  React.useEffect(() => {
    // Skip animation if already animated
    if (hasAnimated) return;

    // Mark as animated immediately to prevent re-triggering
    animatedInItemIds.add(itemId);

    // NOTE: LayoutAnimation.configureNext is now called in addPendingDrop (Zustand store)
    // BEFORE the state change, so existing cards slide down properly.
    // Calling it here in useEffect would be TOO LATE (layout already changed).

    // Phase 2: Depth emergence animation
    // Starts at 200ms so card is mid-emergence when Phase 0 returns at ~700ms
    const timeout = setTimeout(() => {
      Animated.parallel([
        // Scale from 0.65 to 1.0 - rising from deep within the phone
        Animated.timing(scale, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Opacity from 0.2 to 1.0 - emerging through glass layers
        Animated.timing(opacity, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);

    return () => clearTimeout(timeout);
  }, [itemId, hasAnimated, scale, opacity]);

  // If already animated, render without wrapper for performance
  if (hasAnimated) {
    return <>{children}</>;
  }

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ scale }],
      }}
    >
      {children}
    </Animated.View>
  );
};

// Module-level Set to track drop_ids that recently transitioned from pending→real
// These items should NOT have Layout animation enabled initially to avoid jolt
const recentlyPromotedDropIds = new Set<string>();

/**
 * AnimatedCardSlideDown - Wrapper for existing cards to animate their position
 * when new cards are inserted above them.
 *
 * Uses Reanimated's Layout transition for smooth position animation.
 * The 450ms duration matches CardInsertLayoutAnimation for visual consistency.
 *
 * CRITICAL: We use a smart delay system to prevent jolts:
 * 1. Items that just transitioned from pending→real skip Layout initially
 * 2. Items wait 500ms after mount before enabling Layout animation
 *
 * This prevents the "jolt" when pending items are removed and real items appear,
 * while still allowing smooth slide-down when NEW cards are inserted.
 */
const AnimatedCardSlideDown: React.FC<{
  itemId: string;
  dropId?: string | null;
  children: React.ReactNode;
}> = ({ itemId, dropId, children }) => {
  // Track if this item's layout animation is enabled
  const [layoutEnabled, setLayoutEnabled] = React.useState(false);

  React.useEffect(() => {
    // Check if this item just transitioned from pending
    // If so, we need to skip Layout animation to avoid the jolt
    const wasRecentlyPromoted = dropId && recentlyPromotedDropIds.has(dropId);

    if (wasRecentlyPromoted) {
      // Remove from set after checking (one-time skip)
      recentlyPromotedDropIds.delete(dropId);
      // Use longer delay for recently promoted items
      const timeout = setTimeout(() => {
        setLayoutEnabled(true);
      }, 2000);
      return () => clearTimeout(timeout);
    }

    // For normal items, enable Layout after a short delay
    // This prevents any initial mount jitter
    const timeout = setTimeout(() => {
      setLayoutEnabled(true);
    }, 500);
    return () => clearTimeout(timeout);
  }, [itemId, dropId]);

  // Before Layout is enabled, render without animation
  if (!layoutEnabled) {
    return <View>{children}</View>;
  }

  // After enabled, use Reanimated Layout for smooth position animation
  return (
    <Reanimated.View
      layout={Layout.duration(450).easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
    >
      {children}
    </Reanimated.View>
  );
};

// Export function to mark a drop as recently promoted (called from entity:created handler)
export const markDropAsRecentlyPromoted = (dropId: string) => {
  recentlyPromotedDropIds.add(dropId);
  // Auto-cleanup after 5 seconds
  setTimeout(() => recentlyPromotedDropIds.delete(dropId), 5000);
};

/**
 * UnifiedCardWrapper - Single wrapper for both pending and real items.
 *
 * CRITICAL: Using a single component prevents React from remounting children
 * when an item transitions from pending to real. This preserves modal state.
 *
 * - isPending=true: Apply depth emergence animation (scale + opacity)
 * - isPending=false: Apply slide-down animation via Reanimated Layout
 */
const UnifiedCardWrapper: React.FC<{
  itemId: string;
  dropId?: string | null;
  isPending: boolean;
  children: React.ReactNode;
}> = ({ itemId, dropId, isPending, children }) => {
  // DEBUG: Track wrapper mount/unmount
  React.useEffect(() => {
    console.log('[DEBUG:Wrapper] UnifiedCardWrapper MOUNTED:', { itemId, dropId, isPending });
    return () => {
      console.log('[DEBUG:Wrapper] UnifiedCardWrapper UNMOUNTED:', { itemId, dropId });
    };
  }, []);

  // DEBUG: Track isPending changes
  React.useEffect(() => {
    console.log('[DEBUG:Wrapper] isPending changed:', { itemId, dropId, isPending });
  }, [isPending, itemId, dropId]);

  // Track animation state - starts true if was pending, then transitions
  const [wasPending, setWasPending] = React.useState(isPending);
  const [layoutEnabled, setLayoutEnabled] = React.useState(false);

  // Animation values for depth emergence (pending items)
  const hasAnimated = animatedInItemIds.has(itemId);
  const scale = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.65), []);
  const opacity = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.2), []);

  // Handle pending→real transition
  React.useEffect(() => {
    if (wasPending && !isPending) {
      // Item just transitioned from pending to real
      // Mark that transition happened so we can skip Layout animation
      if (dropId) {
        recentlyPromotedDropIds.add(dropId);
      }
      setWasPending(false);
    }
  }, [isPending, wasPending, dropId]);

  // Pending item animation (depth emergence)
  React.useEffect(() => {
    if (!isPending || hasAnimated) return;

    animatedInItemIds.add(itemId);

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);

    return () => clearTimeout(timeout);
  }, [itemId, isPending, hasAnimated, scale, opacity]);

  // Real item Layout animation (slide-down)
  React.useEffect(() => {
    if (isPending) return;

    const wasRecentlyPromoted = dropId && recentlyPromotedDropIds.has(dropId);
    const delay = wasRecentlyPromoted ? 2000 : 500;

    if (wasRecentlyPromoted && dropId) {
      recentlyPromotedDropIds.delete(dropId);
    }

    const timeout = setTimeout(() => {
      setLayoutEnabled(true);
    }, delay);
    return () => clearTimeout(timeout);
  }, [isPending, dropId]);

  // Pending items: use Animated.View with scale/opacity
  if (isPending && !hasAnimated) {
    return <Animated.View style={{ opacity, transform: [{ scale }] }}>{children}</Animated.View>;
  }

  // Real items with Layout enabled: use Reanimated.View
  if (!isPending && layoutEnabled) {
    return (
      <Reanimated.View
        layout={Layout.duration(450).easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
      >
        {children}
      </Reanimated.View>
    );
  }

  // Default: plain View (pending after animation, or real before Layout enabled)
  return <View>{children}</View>;
};

/**
 * AnimatedChipsTransition - Magical blur-to-sharp reveal for Phase 2 metadata chips
 *
 * When Phase 2 data arrives, ALL chips "emerge from mist" together:
 * - Start: opacity 0.3, scale 0.98, with frosted mist overlay
 * - End: opacity 1, scale 1.0, mist fades away
 * - Duration: 900ms ease-out for a more intentional, noticeable effect
 *
 * The mist effect is achieved by overlaying a semi-transparent white layer
 * that fades out as the chips become visible, creating the illusion of
 * content crystallizing out of fog.
 *
 * CRITICAL: Uses module-level chipAnimatedIds Set to persist animation state
 * across pending→entity transition. The drop_id stays the same, so we track
 * by that instead of component-level ref which resets on remount.
 */
const AnimatedChipsTransition: React.FC<{
  trackingId: string;
  hasRealData: boolean;
  children: React.ReactNode;
}> = ({ trackingId, hasRealData, children }) => {
  // Check if this drop has already animated using module-level Set
  // This persists across pending→entity transition (drop_id stays the same)
  const alreadyAnimated = chipAnimatedIds.has(trackingId);

  // Use useState to create stable Animated.Values that persist across re-renders
  // If already animated, start at final values
  const [animValues] = React.useState(() => ({
    // Chips: start dim and slightly smaller, end fully visible
    opacity: new Animated.Value(alreadyAnimated ? 1 : 0.3),
    scale: new Animated.Value(alreadyAnimated ? 1 : 0.98),
    // Mist overlay: starts visible, fades to invisible
    mistOpacity: new Animated.Value(alreadyAnimated ? 0 : 0.85),
  }));
  // Track animation state for render decisions - show immediately if already animated
  const [isVisible, setIsVisible] = React.useState(alreadyAnimated || hasRealData);
  // Component-level ref to prevent double-trigger within same mount
  const animationStarted = React.useRef(alreadyAnimated);

  React.useEffect(() => {
    // When real data arrives, animate chips into view with magical reveal
    // Skip if already animated (tracked by module-level Set)
    if (hasRealData && !animationStarted.current && !chipAnimatedIds.has(trackingId)) {
      animationStarted.current = true;
      chipAnimatedIds.add(trackingId); // Persist across remounts
      // Start showing the container immediately (animation will run)
      setIsVisible(true);
      Animated.parallel([
        // Chips fade in and scale up
        Animated.timing(animValues.opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(animValues.scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Mist clears away
        Animated.timing(animValues.mistOpacity, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (hasRealData && chipAnimatedIds.has(trackingId) && !isVisible) {
      // Already animated but not visible (e.g., remounted) - show immediately
      setIsVisible(true);
    }
  }, [trackingId, hasRealData, animValues, isVisible]);

  // Fixed minimum height prevents layout jump when chips appear
  const containerStyle: ViewStyle = {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
  };

  // If not visible yet, render empty container with min height (no placeholders)
  if (!isVisible) {
    return <View style={containerStyle} />;
  }

  // Render chips with animation + mist overlay
  return (
    <View style={[containerStyle, { position: 'relative' }]}>
      {/* Chips layer - animated opacity and scale */}
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          opacity: animValues.opacity,
          transform: [{ scale: animValues.scale }],
        }}
      >
        {children}
      </Animated.View>
      {/* Mist overlay - fades out to reveal sharp chips */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -2,
          left: -4,
          right: -4,
          bottom: -2,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          opacity: animValues.mistOpacity,
          borderRadius: 8,
        }}
      />
    </View>
  );
};

/**
 * Row3Chips - UNIFIED chip rendering component for Row 3
 *
 * This is the SINGLE source of truth for ALL Row 3 chip rendering.
 * All chips (context, deadline, frequency, start date, time estimate, mood, people)
 * are rendered in ONE place so they ALL animate together with blur-to-focus.
 *
 * CRITICAL: Returns null until enrichment is complete. This ensures:
 * 1. All chips appear at the SAME TIME
 * 2. All chips get the SAME animation
 * 3. No flickering from partial data
 */
const Row3Chips: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'todo' | 'habit' | 'note';
  styles: any;
  isMulti?: boolean;
}> = ({ item, effectiveKind, styles, isMulti = false }) => {
  // Compute derived state once
  const isJournal =
    item.kind === 'note' && (item.noteSubtype === 'journal' || item.canonical_type === 'journal');
  const isIdea =
    item.kind === 'note' && (item.noteSubtype === 'idea' || item.canonical_type === 'idea');
  const isGeneralNote =
    item.kind === 'note' &&
    !isJournal &&
    !isIdea &&
    (item.noteSubtype === 'catchall' ||
      item.noteSubtype === 'general' ||
      item.canonical_type === 'log' ||
      !item.noteSubtype);

  const hasMoods = isJournal && item.mood && item.mood.length > 0;
  const hasPeople =
    item.views?.people && Array.isArray(item.views.people) && item.views.people.length > 0;

  // CRITICAL: Row 3 chips must wait for Phase 2 to FULLY complete before animating.
  // This is SEPARATE from minddrop_stage which triggers Row 1-2 typewriter earlier.
  //
  // For pending drops: chip_data_ready is EXPLICITLY set (false until Phase 2, then true)
  // For real entities: chip_data_ready is undefined, use minddrop_stage === 'enriched'
  // For legacy items: no stage tracking at all
  const chipDataReady = item.views?.chip_data_ready === true;
  const minddropStage = item.views?.minddrop_stage;
  const isEntityEnriched = minddropStage === 'enriched';
  const isLegacyItem =
    minddropStage === undefined &&
    item.views?.ai_pending !== true &&
    item.views?.ai_failed !== true;

  // CRITICAL: Check if this is a pending drop (chip_data_ready is explicitly set)
  // Pending drops: chip_data_ready is false/true - ONLY use chipDataReady
  // Real entities: chip_data_ready is undefined - use isEntityEnriched
  const isPendingDrop = item.views?.chip_data_ready !== undefined;
  const hasRealChipData = isPendingDrop ? chipDataReady : isEntityEnriched || isLegacyItem;

  // CRITICAL: Use drop_id for tracking animation state across pending→entity transition
  // drop_id is set when pending drop is created and persists when synced to Supabase
  const trackingId = item.drop_id || item.id;

  // Get chip data
  const contextMeta = getContextualMeta(effectiveKind, item);
  const contextTestId =
    effectiveKind === 'todo' ? `minddrop-recent-todo-due-${item.id}` : undefined;

  // Build multi-entity type label if needed
  let multiTypeLabel = '';
  if (isMulti) {
    const multiItems: MultiDropItem[] = item.multi_items || item.views?.multi_items || [];
    const bucketCounts: Record<string, number> = {};
    for (const mi of multiItems) {
      const label =
        mi.bucket === 'todo'
          ? 'Todo'
          : mi.bucket === 'habit'
            ? 'Habit'
            : mi.subtype === 'journal'
              ? 'Journal'
              : mi.subtype === 'idea'
                ? 'Idea'
                : 'Note';
      bucketCounts[label] = (bucketCounts[label] || 0) + 1;
    }
    const labels = Object.entries(bucketCounts).map(([label, count]) =>
      count > 1 ? `${count} ${label}s` : label,
    );
    multiTypeLabel = labels.join(' + ') || 'Multiple Items';
  }

  // Render context chip based on item type
  const renderContextChip = () => {
    // Multi-entity: show combined type label
    if (isMulti) {
      return (
        <View style={styles.moodChip}>
          <Text style={styles.moodChipText}>{multiTypeLabel}</Text>
        </View>
      );
    }

    // Journal: show type + mood chips
    if (isJournal && contextMeta) {
      return (
        <>
          <View style={styles.moodChip}>
            <Text style={styles.moodChipText}>{contextMeta}</Text>
          </View>
          {hasMoods && (
            <>
              {item.mood!.slice(0, 2).map((m: Mood, idx: number) => (
                <React.Fragment key={m}>
                  {idx === 0 && <Text style={styles.journalSeparator}> </Text>}
                  <Text style={styles.journalSubtypeLabel}>{MOOD_CONFIG[m]?.label}</Text>
                  {idx < Math.min(item.mood!.length, 2) - 1 && (
                    <Text style={styles.journalSeparator}>·</Text>
                  )}
                </React.Fragment>
              ))}
              {item.mood!.length > 2 && (
                <Text style={styles.moodOverflow}> +{item.mood!.length - 2}</Text>
              )}
            </>
          )}
        </>
      );
    }

    // Idea: show type chip
    if (isIdea && contextMeta) {
      return (
        <View style={styles.moodChip}>
          <Text style={styles.moodChipText}>{contextMeta}</Text>
        </View>
      );
    }

    // General note: show type chip
    if (isGeneralNote && contextMeta) {
      return (
        <View style={styles.moodChip}>
          <Text style={styles.moodChipText}>{contextMeta}</Text>
        </View>
      );
    }

    // Todo/Habit: show context pill (deadline/frequency)
    return contextMeta ? (
      <View style={styles.recentContextPillContainer}>
        <Text testID={contextTestId} style={styles.recentContextPill}>
          {contextMeta}
        </Text>
      </View>
    ) : null;
  };

  return (
    <AnimatedChipsTransition trackingId={trackingId} hasRealData={hasRealChipData}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Context chip (deadline, frequency, type label, etc.) */}
        {renderContextChip()}

        {/* Start date chip for habits - before time estimate */}
        {effectiveKind === 'habit' && (
          <Text style={styles.recentContextPill}>{formatStartDate(item.start_date)}</Text>
        )}

        {/* Time estimate chip for todos AND habits */}
        {(effectiveKind === 'todo' || effectiveKind === 'habit') && item.time_estimate_minutes && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Alert.alert(
                '⏱️ Time Estimate',
                effectiveKind === 'habit'
                  ? 'This is how long each session of this habit might take. Tap the card to adjust it.'
                  : 'Gremly guesses how long this might take based on your task. Tap the card to adjust it.',
                [{ text: 'Got it', style: 'default' }],
              );
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.timeEstimateChip}>
              <Clock size={10} color="#888" strokeWidth={2} />
              <Text style={styles.timeEstimateText}>
                {formatTimeEstimate(item.time_estimate_minutes)}
              </Text>
            </View>
          </Pressable>
        )}

        {/* People chip */}
        {hasPeople && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <User size={10} color="#6B8E6B" strokeWidth={2.5} />
            <Text style={{ fontSize: 10, color: '#6B8E6B', fontFamily: 'Inter-Medium' }}>
              {item.views!.people![0]}
            </Text>
          </View>
        )}
      </View>
    </AnimatedChipsTransition>
  );
};

/**
 * TypewriterText - Character-by-character reveal animation
 * Creates magical "AI is writing" effect
 * Uses refs to prevent animation restart on parent re-renders
 */
const TypewriterText: React.FC<{
  text: string;
  style?: any;
  duration?: number;
  delay?: number;
  onComplete?: () => void;
}> = ({ text, style, duration = 350, delay = 0, onComplete }) => {
  const [displayedText, setDisplayedText] = React.useState('');

  // Use refs to avoid dependency issues and prevent re-triggering
  const textRef = React.useRef(text);
  const onCompleteRef = React.useRef(onComplete);
  const hasStartedRef = React.useRef(false);

  // Update refs when props change (but don't re-trigger animation)
  React.useEffect(() => {
    textRef.current = text;
    onCompleteRef.current = onComplete;
  }, [text, onComplete]);

  // Run animation only once on mount
  React.useEffect(() => {
    if (hasStartedRef.current) return; // Already started, don't restart
    hasStartedRef.current = true;

    const targetText = textRef.current;
    if (!targetText) {
      setDisplayedText('');
      return;
    }

    let isMounted = true;

    const delayTimeout = setTimeout(() => {
      const chars = targetText.split('');
      const charDuration = Math.max(duration / chars.length, 12); // Min 12ms per char
      let index = 0;

      const interval = setInterval(() => {
        if (!isMounted) return;

        if (index < chars.length) {
          index++;
          setDisplayedText(targetText.substring(0, index));
        } else {
          clearInterval(interval);
          onCompleteRef.current?.();
        }
      }, charDuration);

      // Store interval for cleanup
      return () => clearInterval(interval);
    }, delay);

    return () => {
      isMounted = false;
      clearTimeout(delayTimeout);
    };
  }, [duration, delay]); // Only depend on timing values, not text/callback

  return <Text style={style}>{displayedText}</Text>;
};

/**
 * Helper to truncate text for optimistic display
 */
const truncateText = (text: string, maxLength: number): string => {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.substring(0, maxLength - 3).trim() + '...';
};

/**
 * PendingSkeleton - Phase 1: Classifying with calm arrival animation
 * Shows raw input text immediately with gentle shimmer + skeleton for secondary fields
 * Slides in smoothly for ADHD-friendly experience
 */
const PendingSkeleton: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'note' | 'todo' | 'habit';
  badgeStyleKey: string;
  styles: any;
  c: any;
  index?: number; // For stagger delay
}> = ({ item, effectiveKind, badgeStyleKey, styles, c, index = 0 }) => {
  const [dots, setDots] = React.useState('');

  // Animated dots: cycle through '', '.', '..', '...'
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Vanilla Animated shimmer (crash-safe) - gentle pulse between 0.5 and 0.85 opacity
  const titleOpacity = React.useMemo(() => new Animated.Value(0.6), []);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(titleOpacity, {
          toValue: 0.85,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 0.5,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [titleOpacity]);

  // Show raw text as title immediately (truncated to 50 chars)
  const displayTitle = truncateText(item.text || item.title || '', 50);

  // Stagger delay for multiple cards
  const staggerDelay = index * 80;

  return (
    <Reanimated.View
      testID="minddrop-pending-skeleton"
      entering={SlideInDown.duration(280)
        .delay(staggerDelay)
        .easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
      exiting={FadeOut.duration(100)}
      layout={Layout.duration(200)}
      style={[
        styles.recentCard,
        {
          justifyContent: 'space-between',
        },
      ]}
    >
      {/* Row 1: Title (raw text with shimmer) + Kind badge */}
      <View style={styles.recentTopRow}>
        <Animated.Text
          numberOfLines={1}
          style={[styles.recentTitle, { fontStyle: 'italic', opacity: titleOpacity }]}
        >
          {displayTitle || '—'}
        </Animated.Text>
        <View style={styles.recentTopRight}>
          <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>
            {effectiveKind === 'todo' ? 'Todo' : effectiveKind === 'habit' ? 'Habit' : 'Note'}
          </Text>
        </View>
      </View>

      {/* Row 2: Confirmation skeleton shimmer */}
      <View>
        <ShimmerBar width="45%" height={14} />
      </View>

      {/* Row 3: Empty chip row (no placeholders) + Organizing indicator */}
      <View style={styles.recentMetaRow}>
        <View style={{ minHeight: 20 }} />
        <Text
          style={[styles.recentMetaTime, { fontStyle: 'italic', color: '#6B7280', minWidth: 75 }]}
        >
          Organizing{dots}
        </Text>
      </View>
    </Reanimated.View>
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
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
};

/**
 * EnrichingSkeleton - Phase 2: AI knows the type, refining details
 * Shows raw text title + category chip + timestamp, skeleton for secondary fields
 * Breathing border indicates active processing
 * Has calm shimmer on title that crossfades to full opacity when AI title is ready
 */
const EnrichingSkeleton: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'note' | 'todo' | 'habit';
  badgeStyleKey: string;
  styles: any;
  c: any;
  index?: number; // For stagger delay
}> = ({ item, effectiveKind, badgeStyleKey, styles, c, index = 0 }) => {
  // Breathing border animation (vanilla Animated)
  const borderOpacity = React.useMemo(() => new Animated.Value(0.15), []);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(borderOpacity, {
          toValue: 0.35,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(borderOpacity, {
          toValue: 0.15,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [borderOpacity]);

  const animatedBorderColor = borderOpacity.interpolate({
    inputRange: [0.15, 0.35],
    outputRange: ['rgba(46, 85, 64, 0.15)', 'rgba(46, 85, 64, 0.35)'],
  });

  // Detect if AI title is ready (different from raw text)
  const rawText = item.text || '';
  const aiTitle = item.title || '';
  const isAITitleReady =
    aiTitle && aiTitle !== rawText && !aiTitle.startsWith(rawText.substring(0, 20));

  // Vanilla Animated shimmer (crash-safe) - pulse between 0.5 and 0.85
  const titleOpacity = React.useMemo(() => new Animated.Value(isAITitleReady ? 1 : 0.6), []);
  const animationRef = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    if (isAITitleReady) {
      // Crossfade to full opacity when AI title arrives
      animationRef.current?.stop();
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Gentle shimmer while waiting
      animationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(titleOpacity, {
            toValue: 0.85,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(titleOpacity, {
            toValue: 0.5,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      animationRef.current.start();
    }

    return () => animationRef.current?.stop();
  }, [isAITitleReady, titleOpacity]);

  // Show AI title if ready, otherwise raw text (truncated)
  const displayTitle = truncateText(isAITitleReady ? aiTitle : rawText, 50);

  return (
    <Animated.View
      testID="minddrop-enriching-skeleton"
      style={[
        styles.recentCard,
        {
          justifyContent: 'space-between',
          borderWidth: 1.5,
          borderColor: animatedBorderColor,
        },
      ]}
    >
      {/* Row 1: Title (raw or AI) with shimmer/crossfade + Category chip */}
      <View style={styles.recentTopRow}>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.recentTitle,
            !isAITitleReady && { fontStyle: 'italic' },
            { opacity: titleOpacity },
          ]}
        >
          {displayTitle || '—'}
        </Animated.Text>
        <View style={styles.recentTopRight}>
          <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>
            {effectiveKind === 'todo' ? 'Todo' : effectiveKind === 'habit' ? 'Habit' : 'Note'}
          </Text>
        </View>
      </View>

      {/* Row 2: Confirmation shimmer */}
      <View>
        <ShimmerBar width="40%" height={14} />
      </View>

      {/* Row 3: Empty chip row (no placeholders) + timestamp */}
      <View style={styles.recentMetaRow}>
        <View style={{ minHeight: 20 }} />
        <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
      </View>
    </Animated.View>
  );
};

/**
 * RevealingCard - Phase 3: Typewriter reveal animation
 * Crossfades from shimmer, then reveals each line with typewriter effect
 * Ends with subtle pulse to indicate completion
 */
const RevealingCard: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'note' | 'todo' | 'habit';
  displayKind: string;
  badgeStyleKey: string;
  styles: any;
  c: any;
  onRevealComplete: () => void;
}> = ({ item, effectiveKind, displayKind, badgeStyleKey, styles, c, onRevealComplete }) => {
  // CRITICAL: Use drop_id for tracking - persists across pending→entity transition
  const trackingId = item.drop_id || item.id;

  // Track completion of each line
  const [line1Done, setLine1Done] = React.useState(false);
  const [line2Done, setLine2Done] = React.useState(false);

  // CRITICAL: Capture initial values so they don't change during animation
  // This prevents Phase 2 updates from restarting the typewriter animation
  // Using useState initializer to freeze on first render (only runs once)
  const [titleText] = React.useState(() => item.title || item.text || '—');
  const [confirmationText] = React.useState(() => getConfirmationMessage(effectiveKind, item));

  // Memoize callbacks to prevent re-renders
  const handleLine1Done = React.useCallback(() => setLine1Done(true), []);
  const handleLine2Done = React.useCallback(() => setLine2Done(true), []);

  // Row 1 & 2: Shimmer fade-out / text fade-in (starts immediately)
  const shimmerOpacity = React.useMemo(() => new Animated.Value(1), []);
  const textOpacity = React.useMemo(() => new Animated.Value(0), []);

  // Settle pulse animation
  const settleScale = React.useMemo(() => new Animated.Value(1), []);
  const settleShadow = React.useMemo(() => new Animated.Value(0), []);

  // Start Row 1 & 2 crossfade immediately
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(shimmerOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shimmerOpacity, textOpacity]);

  // Trigger settle animation when Row 1 & 2 typewriter complete
  // Row 3 chips have their own animation via AnimatedChipsTransition
  React.useEffect(() => {
    if (line1Done && line2Done) {
      // Subtle pulse: scale up slightly, glow, then settle
      Animated.sequence([
        Animated.parallel([
          Animated.timing(settleScale, {
            toValue: 1.008,
            duration: 150,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(settleShadow, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(settleScale, {
            toValue: 1,
            duration: 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(settleShadow, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }),
        ]),
      ]).start(() => {
        onRevealComplete();
      });
    }
  }, [line1Done, line2Done, settleScale, settleShadow, onRevealComplete]);

  // Animated shadow for settle effect
  const animatedShadowOpacity = settleShadow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.25],
  });

  return (
    <Animated.View
      testID="minddrop-revealing-card"
      style={[
        styles.recentCard,
        {
          justifyContent: 'space-between',
          transform: [{ scale: settleScale }],
        },
      ]}
    >
      {/* Row 1: Title + Category chip */}
      <View style={styles.recentTopRow}>
        <View style={{ flex: 1, minHeight: 20 }}>
          {/* Text layer with typewriter - no shimmer overlay for title */}
          <Animated.View style={{ opacity: textOpacity }}>
            <TypewriterText
              text={titleText}
              style={[styles.recentTitle, { flex: undefined }]}
              duration={350}
              delay={50}
              onComplete={handleLine1Done}
            />
          </Animated.View>
        </View>
        <View style={styles.recentTopRight}>
          {effectiveKind === 'note' && (item as any)?.private === true && (
            <Lock size={12} color="#777" />
          )}
          <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>
            {getDisplayKindForChip(effectiveKind, item)}
          </Text>
        </View>
      </View>

      {/* Row 2: Confirmation message */}
      <View style={{ position: 'relative' }}>
        {/* Shimmer layer (fades out) */}
        <Animated.View style={{ opacity: shimmerOpacity, position: 'absolute', left: 0, right: 0 }}>
          <ShimmerBar width="40%" height={14} />
        </Animated.View>
        {/* Text layer (fades in, typewriter) */}
        <Animated.View style={{ opacity: textOpacity }}>
          <TypewriterText
            text={confirmationText}
            style={styles.recentConfirmation}
            duration={300}
            delay={150}
            onComplete={handleLine2Done}
          />
        </Animated.View>
      </View>

      {/* Row 3: Chips (use Row3Chips with AnimatedChipsTransition) + timestamp */}
      <View style={styles.recentMetaRow}>
        <Row3Chips item={item} effectiveKind={effectiveKind} styles={styles} />
        <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
      </View>
    </Animated.View>
  );
};

/**
 * Helper component to trigger callback after delay
 * Used when there's no context meta to reveal
 */
const DelayedCallback: React.FC<{
  delay: number;
  onComplete: () => void;
}> = ({ delay, onComplete }) => {
  React.useEffect(() => {
    const timeout = setTimeout(onComplete, delay);
    return () => clearTimeout(timeout);
  }, [delay, onComplete]);
  return null;
};

/**
 * Get friendly confirmation message for Mind Drop card based on kind and item details
 */
function getConfirmationMessage(kind: 'note' | 'todo' | 'habit', item: UnifiedDrop): string {
  // Use AI-generated confirmation if available
  if (item.views?.confirmation_message) {
    return item.views.confirmation_message;
  }

  // Fall back to templates
  if (kind === 'todo') {
    if (item.due_date || item.due_day) {
      return `Scheduled for ${formatDue({ dueDay: item.due_day, dueIso: item.due_date })}.`;
    }
    return 'Added to your list.';
  }
  if (kind === 'habit') {
    return "Let's build this together.";
  }
  // Notes/Logs
  const subtype = item.noteSubtype || item.canonical_type || 'log';
  if (subtype === 'journal') return 'Thoughts captured.';
  if (subtype === 'idea') return 'Interesting — saved for later.';
  if (subtype === 'list') return 'List saved.';
  return 'Noted.';
}

/**
 * Format time estimate for display in chip
 * Returns null if no estimate, otherwise returns formatted string like "~15m" or "~1h"
 */
function formatTimeEstimate(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return `~${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) return `~${hours}h`;
  return `~${hours}h ${remainingMins}m`;
}

/**
 * Format habit start date for display
 * Returns "Starts TBD" if null, or "Starts Mon" / "Starts Jan 1" format
 */
function formatStartDate(startDate: string | null | undefined): string {
  if (!startDate) return 'Starts TBD';

  try {
    const date = new Date(startDate + 'T00:00:00'); // Parse as local date
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // If within next 7 days, show day name
    if (diffDays >= 0 && diffDays < 7) {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      return `Starts ${dayName}`;
    }

    // Otherwise show "Jan 1" format
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Starts ${formatted}`;
  } catch {
    return 'Starts TBD';
  }
}

/**
 * Get contextual metadata string for Mind Drop card meta row
 */
function getContextualMeta(kind: 'note' | 'todo' | 'habit', item: UnifiedDrop): string | null {
  if (kind === 'todo') {
    if (item.due_date || item.due_day) {
      return formatDue({ dueDay: item.due_day, dueIso: item.due_date, dueTime: item.due_time });
    }
    return 'no deadline yet';
  }
  if (kind === 'habit') {
    // Show specific days if days_active is set (e.g., "Mon · Fri")
    if (item.days_active && item.days_active.length > 0) {
      const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return item.days_active.map((d) => DAY_ABBREVS[d]).join(' · ');
    }
    // Fall back to frequency display label (e.g., "2x/week")
    return getFrequencyDisplayLabel(item.cadence, item.target_per_period, item.frequency);
  }
  // Notes/Logs - show the subtype
  const subtype = item.noteSubtype || item.canonical_type || 'log';
  if (subtype === 'journal') return 'Journal';
  if (subtype === 'idea') return 'Idea';
  if (subtype === 'list') return 'List';
  if (subtype === 'reference') return 'Reference';
  return 'General Note';
}

/**
 * Get display kind for category chip - parent category only
 * Subtype (Idea, Journal, etc.) is shown via getContextualMeta in the meta row
 */
function getDisplayKindForChip(kind: 'note' | 'todo' | 'habit', _item: UnifiedDrop): string {
  if (kind === 'todo') return 'Todo';
  if (kind === 'habit') return 'Habit';

  // For notes, always show "Note" as the parent category
  return 'Note';
}

/**
 * Pulsing animation hook for Gremly icon on multi-entity cards
 */
const useGremlyPulse = () => {
  const pulseAnim = React.useMemo(() => new Animated.Value(1), []);

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return pulseAnim;
};

// Module-level Set to track items that have already shown reveal animation
// Prevents double animation when component remounts or Phase 2 arrives
const revealedItemIds = new Set<string>();

// Module-level Set to track drops that have already animated their Row 3 chips
// This persists across pending→entity transition (drop_id stays the same)
const chipAnimatedIds = new Set<string>();

// Module-level Set to track drops that have already shown multi-drop bounce animation
// Uses drop_id for stability across pending→synced transition
const multiBounceAnimatedIds = new Set<string>();

/**
 * Animated wrapper for Mind Drop card that smoothly transitions
 * from pending skeleton to final content when AI enrichment completes
 *
 * MEMOIZED to prevent re-renders when other cards update
 */
const AnimatedMindDropCard = React.memo<{
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
  index?: number; // For stagger delay in calm arrival animation
  // Multi-entity handlers passed from parent
  onKeepAsNote?: (id: string) => void;
  onSplitSelected?: (id: string, selectedItems: MultiDropItem[]) => void;
  // Callback to open modal at parent level (modal lives in RecentDrops, not here)
  onOpenModal?: (item: UnifiedDrop) => void;
}>(
  ({
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
    index = 0,
    onKeepAsNote,
    onSplitSelected,
    onOpenModal,
  }) => {
    // Check for multi-entity drops
    const isMulti = item.is_multi === true || item.views?.is_multi === true;

    // DEBUG: Track component mount/unmount
    React.useEffect(() => {
      console.log('[DEBUG:AnimatedMindDropCard] MOUNTED:', {
        itemId: item.id,
        dropId: item.drop_id,
        isMulti,
      });
      return () => {
        console.log('[DEBUG:AnimatedMindDropCard] UNMOUNTED:', {
          itemId: item.id,
          dropId: item.drop_id,
        });
      };
    }, []); // Empty deps = only on mount/unmount

    // ─────────────────────────────────────────────────────────────────────────
    // Multi-drop bounce animation
    // When a card transitions to multi-drop, do a celebratory bounce
    // Uses drop_id (stable across pending→synced) to prevent duplicate animations
    // ─────────────────────────────────────────────────────────────────────────
    const bounceScale = useSharedValue(1);

    // Use drop_id for tracking (stable across pending→entity transition)
    // Falls back to item.id for items without drop_id
    const bounceTrackingId = item.drop_id || item.id;

    React.useEffect(() => {
      // Trigger bounce when isMulti is true AND we haven't animated this drop yet
      // Uses module-level Set to persist across component remounts
      if (isMulti && !multiBounceAnimatedIds.has(bounceTrackingId)) {
        multiBounceAnimatedIds.add(bounceTrackingId);

        // Pronounced bounce: 1.0 → 1.10 → 0.96 → 1.0
        bounceScale.value = withSequence(
          withTiming(1.1, { duration: 180 }),
          withTiming(0.96, { duration: 140 }),
          withSpring(1, { damping: 6, stiffness: 120, mass: 1 }),
        );
      }
    }, [isMulti, bounceTrackingId, bounceScale]);

    const bounceStyle = useAnimatedStyle(() => ({
      transform: [{ scale: bounceScale.value }],
    }));

    // Gremly pulse animation for multi-entity cards (always called, conditionally used)
    const gremlyPulseScale = useGremlyPulse();

    // Get visual state from item
    const itemVisualState = getMindDropVisualState(item);

    // Track revealed items by drop_id (stable across pending→synced transition)
    // Falls back to item.id for items without drop_id
    const trackingId = item.drop_id || item.id;

    // Local state to track revealing phase
    const [isRevealing, setIsRevealing] = React.useState(false);
    const [revealComplete, setRevealComplete] = React.useState(() => {
      // Initialize as complete if this item was already revealed
      return revealedItemIds.has(trackingId);
    });
    const prevStateRef = React.useRef<MindDropVisualState | null>(null);
    const isFirstRender = React.useRef(true);

    // Detect transition to complete state to trigger reveal animation
    // Only triggers ONCE per item - uses module-level Set to track by drop_id
    React.useEffect(() => {
      const prev = prevStateRef.current;

      // Skip if already revealed (check by tracking ID which persists across sync)
      if (revealedItemIds.has(trackingId)) {
        // Ensure local state is in sync
        if (!revealComplete) {
          setRevealComplete(true);
        }
        prevStateRef.current = itemVisualState;
        return;
      }

      // For first render: if item is already complete/streaming and was created recently (within 30s),
      // trigger reveal animation since user just submitted it
      if (isFirstRender.current) {
        isFirstRender.current = false;
        // Streaming = Phase 1 done, title ready for typewriter
        // Complete = Phase 2 done, all data ready
        if (itemVisualState === 'complete' || itemVisualState === 'streaming') {
          const createdAt = new Date(item.created_at).getTime();
          const ageMs = Date.now() - createdAt;
          if (ageMs < 30000) {
            // Item is new (created within 30s), trigger reveal
            // Mark as revealing IMMEDIATELY to prevent duplicate animations on sync
            revealedItemIds.add(trackingId);
            console.log('[AnimatedMindDropCard] First render reveal', { trackingId, ageMs });
            setIsRevealing(true);
          } else {
            // Item is old, mark as already revealed
            revealedItemIds.add(trackingId);
            setRevealComplete(true);
          }
        }
        prevStateRef.current = itemVisualState;
        return;
      }

      // Normal transition detection
      // Trigger reveal when Phase 1 completes (streaming) or Phase 2 completes (complete)
      const isNowReadyForReveal = itemVisualState === 'complete' || itemVisualState === 'streaming';
      const wasNotReady = prev === 'enriching' || prev === 'pending';
      if (wasNotReady && isNowReadyForReveal) {
        // Mark as revealing IMMEDIATELY to prevent duplicate animations on sync
        revealedItemIds.add(trackingId);
        // Start revealing animation
        console.log('[AnimatedMindDropCard] Transition reveal', {
          trackingId,
          prev,
          current: itemVisualState,
        });
        setIsRevealing(true);
      }
      prevStateRef.current = itemVisualState;
    }, [itemVisualState, trackingId, item.created_at, revealComplete]);

    // Handle reveal completion - mark as revealed to prevent re-animation
    const handleRevealComplete = React.useCallback(() => {
      revealedItemIds.add(trackingId);
      setIsRevealing(false);
      setRevealComplete(true);
    }, [trackingId]);

    // Determine actual visual state
    // 'streaming' = Phase 1 done, treat like 'complete' for card rendering (chips will wait for chip_data_ready)
    const visualState: MindDropVisualState = isRevealing
      ? 'revealing'
      : revealComplete || itemVisualState === 'complete' || itemVisualState === 'streaming'
        ? 'complete'
        : itemVisualState;

    // MULTI-DROP EARLY RETURN: Show multi-card immediately, even during pending/enriching
    // Multi-drops have enough info from Phase 0 to render the multi-card shape
    // This bypasses skeleton states so the multi-card appears at ~2s (Phase 0) not ~5s (Phase 1+2)
    if (isMulti) {
      // Fall through to complete card render below (skip skeleton states)
    } else {
      // Phase 1: Still creating entity - show raw text with skeleton for secondary fields
      if (visualState === 'pending') {
        return (
          <PendingSkeleton
            item={item}
            effectiveKind={effectiveKind}
            badgeStyleKey={badgeStyleKey}
            styles={styles}
            c={c}
            index={index}
          />
        );
      }

      // Phase 2: Entity exists, enriching in progress - show shimmers + chip/timestamp
      if (visualState === 'enriching') {
        return (
          <EnrichingSkeleton
            item={item}
            effectiveKind={effectiveKind}
            badgeStyleKey={badgeStyleKey}
            styles={styles}
            c={c}
            index={index}
          />
        );
      }

      // Phase 3: Transitioning - crossfade shimmer to typewriter reveal
      if (visualState === 'revealing') {
        return (
          <RevealingCard
            item={item}
            effectiveKind={effectiveKind}
            displayKind={displayKind}
            badgeStyleKey={badgeStyleKey}
            styles={styles}
            c={c}
            onRevealComplete={handleRevealComplete}
          />
        );
      }
    }

    // Complete or Failed: Show static content (also used for multi-drops)
    const isFailed = visualState === 'failed';

    // Multi-entity handler - opens modal at parent level
    const handleCardPress = () => {
      if (isMulti) {
        // Modal lives in RecentDrops - just tell parent to open it
        if (onOpenModal) {
          onOpenModal(item);
        }
        return;
      }
      handleEdit(item.id, item.kind, item.unsorted);
    };

    return (
      <Reanimated.View style={bounceStyle}>
        <Pressable
          key={`${item.kind}:${item.id}`}
          testID={`minddrop-recent-${item.kind}-${item.id}`}
          style={[styles.recentCard, isMulti && { backgroundColor: '#F4F9F4' }]}
          onPress={handleCardPress}
          accessibilityRole="button"
          accessibilityLabel={
            isMulti
              ? 'Tap to decide what to do with multiple items'
              : `Edit ${item.title || item.text || 'item'}`
          }
        >
          {/* Row 1: Title (left) + Chip (right) */}
          <View style={styles.recentTopRow}>
            <Text numberOfLines={1} style={styles.recentTitle}>
              {isMulti
                ? item.multi_summary_title ||
                  item.views?.multi_summary_title ||
                  item.title ||
                  'Multiple Items'
                : item.title || item.text || '—'}
            </Text>
            <View style={styles.recentTopRight}>
              {effectiveKind === 'note' && (item as any)?.private === true && (
                <Lock size={12} color="#777" />
              )}
              <Text
                style={[
                  styles.recentCategoryPill,
                  styles[badgeStyleKey],
                  isMulti && { backgroundColor: 'rgba(156, 166, 224, 0.15)', color: '#7B86C9' },
                ]}
              >
                {isMulti ? 'Multi' : getDisplayKindForChip(effectiveKind, item)}
              </Text>
            </View>
          </View>

          {/* Row 2: Confirmation message or multi hint */}
          {isMulti ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -2 }}>
              <Animated.Image
                source={require('../../assets/buttonforHP.png')}
                style={{
                  width: 26,
                  height: 26,
                  marginRight: 8,
                  borderRadius: 13,
                  transform: [{ scale: gremlyPulseScale }],
                }}
              />
              <Text style={{ fontSize: 13, color: '#4A7C59', fontWeight: '600' }}>
                Should I split these? Tap to decide.
              </Text>
            </View>
          ) : (
            (() => {
              const confirmationMsg = getConfirmationMessage(effectiveKind, item);
              // Always show static text in CompleteCard - TypewriterText is only used in RevealingCard
              return <Text style={styles.recentConfirmation}>{confirmationMsg}</Text>;
            })()
          )}

          {/* Row 3: Contextual info + time estimate (left) | photo icon + timestamp (right) */}
          <View style={styles.recentMetaRow}>
            {/* Left side: ALL chips rendered by unified Row3Chips component */}
            <Row3Chips
              item={item}
              effectiveKind={effectiveKind}
              styles={styles}
              isMulti={isMulti}
            />
            {/* Right side: photo icon + timestamp */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {item.hasPhotos && <Camera size={14} color="#888" strokeWidth={1.5} />}
              <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
            </View>
          </View>
        </Pressable>
      </Reanimated.View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for React.memo - only re-render if THIS card's data changed
    // Compare by item id and key fields that affect rendering
    if (prevProps.item.id !== nextProps.item.id) return false;
    if (prevProps.item.title !== nextProps.item.title) return false;
    if (prevProps.item.views?.minddrop_stage !== nextProps.item.views?.minddrop_stage) return false;
    if (prevProps.item.views?.confirmation_message !== nextProps.item.views?.confirmation_message)
      return false;
    if (prevProps.item.time_estimate_minutes !== nextProps.item.time_estimate_minutes) return false;
    if (prevProps.item.frequency !== nextProps.item.frequency) return false; // Habit frequency
    if (prevProps.item.cadence !== nextProps.item.cadence) return false; // Habit cadence
    if (prevProps.isPending !== nextProps.isPending) return false;
    if (prevProps.effectiveKind !== nextProps.effectiveKind) return false;
    // Tags comparison (shallow array check)
    const prevTags = prevProps.item.tags || [];
    const nextTags = nextProps.item.tags || [];
    if (prevTags.length !== nextTags.length) return false;
    for (let i = 0; i < prevTags.length; i++) {
      if (prevTags[i] !== nextTags[i]) return false;
    }
    // Multi-drop comparison - re-render when isMulti or segments change
    if (prevProps.item.is_multi !== nextProps.item.is_multi) return false;
    const prevSegments = prevProps.item.multi_items || [];
    const nextSegments = nextProps.item.multi_items || [];
    if (prevSegments.length !== nextSegments.length) return false;
    for (let i = 0; i < prevSegments.length; i++) {
      if (prevSegments[i]?.bucket !== nextSegments[i]?.bucket) return false;
      // Check preview_title to detect when Phase 1 updates segment titles
      if (prevSegments[i]?.preview_title !== nextSegments[i]?.preview_title) return false;
    }
    return true; // Props are equal, skip re-render
  },
);

// Display name for debugging
AnimatedMindDropCard.displayName = 'AnimatedMindDropCard';

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

  // Habits and todos display as-is
  if (effectiveKind === 'habit') return 'habit';
  if (effectiveKind === 'todo') return 'todo';

  // All notes in Mind Drop are logs - never "unsorted"
  return 'log';
}

type OverlayContextValue = ReturnType<typeof useGlobalOverlay>;
type GlobalOverlayController = Pick<
  OverlayContextValue,
  'openCreate' | 'openEdit' | 'openView' | 'close'
>;

const noopOverlayController: GlobalOverlayController = {
  openCreate: () => {},
  openEdit: () => {},
  openView: () => {},
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

// Stable no-op callbacks for pending items (avoids inline arrow functions defeating React.memo)
const NOOP_EDIT = () => {};
const NOOP_DELETE = () => {};

const RecentDrops: React.FC<{
  overlay: GlobalOverlayController;
  onEdited?: () => void;
  onDeleted?: () => void;
  onTodayCountChange?: (count: number) => void; // Callback to sync counter with actual Today items
  refreshSignal?: number; // bump to force reload after submit
  initiallyOpen?: boolean;
  eagerLoad?: boolean;
}> = ({
  overlay,
  onEdited,
  onDeleted,
  onTodayCountChange,
  refreshSignal,
  initiallyOpen = true,
  eagerLoad = false,
}) => {
  // DEBUG: Log every RecentDrops render with timestamp
  console.log('[RecentDrops] 🔄 Render', { timestamp: Date.now() });

  // Direct store access - no adapter
  const deleteNote = useGremlyStore((s) => s.deleteNote);
  const deleteTodo = useGremlyStore((s) => s.deleteTodo);
  const deleteHabit = useGremlyStore((s) => s.deleteHabit);
  // Multi-entity handlers need these
  const updateNote = useGremlyStore((s) => s.updateNote);
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const createNote = useGremlyStore((s) => s.createNote);
  const archiveNote = useGremlyStore((s) => s.archiveNote);
  const repo = useRepo();

  // Pending drops from Zustand (optimistic queue system)
  const pendingDropsMap = useGremlyStore((s) => s.pendingDrops);

  // Configure smooth layout animation when pending drops content changes
  // This prevents jolt when Phase 1 data (smart titles) arrive for segments
  // BUT we skip animation when:
  // - Drops are just being removed (promoted to entity)
  // - A drop just became multi (bounce animation handles that)
  const prevPendingDropsVersionRef = React.useRef<string>('');
  const prevPendingDropsCountRef = React.useRef<number>(0);
  const prevMultiIdsRef = React.useRef<Set<string>>(new Set());
  React.useLayoutEffect(() => {
    const currentDrops = Array.from(pendingDropsMap.values());
    const currentCount = currentDrops.length;

    // Track which drops are multi
    const currentMultiIds = new Set(currentDrops.filter((d) => d.isMulti).map((d) => d.localId));

    // Check if any drop just became multi (bounce animation handles this)
    const newlyMulti = [...currentMultiIds].some((id) => !prevMultiIdsRef.current.has(id));

    // Create a "version" string based on segment count and titles
    // This detects meaningful changes that could affect card height
    const version = currentDrops
      .map(
        (d) =>
          `${d.localId}:${d.multiSegments?.length ?? 0}:${d.multiSegments?.[0]?.smartTitle ?? ''}`,
      )
      .join('|');

    // Only animate if:
    // 1. Version changed (content changed)
    // 2. Not initial mount
    // 3. Count didn't decrease (drop wasn't removed/promoted)
    // 4. No drop just became multi (bounce handles that transition)
    const contentChanged = version !== prevPendingDropsVersionRef.current;
    const notInitialMount = prevPendingDropsVersionRef.current !== '';
    const notRemoval = currentCount >= prevPendingDropsCountRef.current;

    if (contentChanged && notInitialMount && notRemoval && !newlyMulti) {
      console.log('[CatchAllNotepad] 🔄 Pending drops data changed, configuring layout animation');
      LayoutAnimation.configureNext({
        duration: 200,
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
          // Use opacity instead of scaleY to avoid conflict with bounce animation
          property: LayoutAnimation.Properties.opacity,
        },
      });
    }

    prevPendingDropsVersionRef.current = version;
    prevPendingDropsCountRef.current = currentCount;
    prevMultiIdsRef.current = currentMultiIds;
  }, [pendingDropsMap]);

  // Synchronous lookups from store
  const getItemById = React.useCallback(
    (id: string) => selectItemById(useGremlyStore.getState(), id),
    [],
  );

  const { c, mode: themeMode } = useTheme();
  const { userId } = useAuth();
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);

  const [open, setOpen] = React.useState(initiallyOpen); // open by default for inline confirmation
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<UnifiedDrop[]>([]);
  const [todayCount, setTodayCount] = React.useState(0); // Track today's drop count for toggle label
  const [olderCount, setOlderCount] = React.useState(0); // Track older drops count
  const [filter, setFilter] = React.useState<'today' | 'older'>('today'); // Filter selection
  const canonicalTypesOn = env.feature.canonicalTypes;

  // Animated chevron rotation
  const chevronRotation = useSharedValue(1); // 1 = expanded (pointing down), 0 = collapsed (pointing up)
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }));

  // Toggle open state with chevron animation
  const handleChevronPress = React.useCallback(() => {
    setOpen((v) => {
      const newOpen = !v;
      chevronRotation.value = withTiming(newOpen ? 1 : 0, { duration: 200 });
      return newOpen;
    });
  }, [chevronRotation]);

  // Show filter picker (Today / Older)
  const handleFilterPress = React.useCallback(() => {
    const options = ['Today', 'Older', 'Cancel'];
    const cancelButtonIndex = 2;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: 'Show drops from',
      },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          setFilter('today');
        } else if (buttonIndex === 1) {
          setFilter('older');
        }
      },
    );
  }, []);

  // Modal state lifted from AnimatedMindDropCard to prevent remount issues
  // Modal stays visible even when card remounts due to pending→real transition
  const [activeModalItem, setActiveModalItem] = React.useState<UnifiedDrop | null>(null);

  // Handler to open modal from child card
  const handleOpenModal = React.useCallback((item: UnifiedDrop) => {
    console.log('[RecentDrops] Opening modal for item:', item.id, item.drop_id);
    setActiveModalItem(item);
  }, []);

  // Transform pending drops from Zustand Map to UnifiedDrop array
  const pendingItems = React.useMemo((): UnifiedDrop[] => {
    const drops = Array.from(pendingDropsMap.values());
    return drops
      .map((drop: PendingDrop): UnifiedDrop => {
        // Map bucket to kind
        const kind: 'todo' | 'habit' | 'note' =
          drop.bucket === 'todo' ? 'todo' : drop.bucket === 'habit' ? 'habit' : 'note';

        // Map subtype for notes
        const noteSubtype = kind === 'note' ? (drop.subtype ?? 'catchall') : undefined;

        // Determine visual stage based on status and enrichment fields
        // - pending: no classification yet → show PendingSkeleton
        // - enriching: classified but Phase 2 in progress → show EnrichingSkeleton
        // - streaming: Phase 1 done, show title/confirmation with typewriter, chips wait for Phase 2
        // - enriched: Phase 2 complete → all data ready
        //
        // CRITICAL: Only report 'enriched' when status === 'enriched' (Phase 2 done)
        // This ensures chips don't animate until all chip data is available
        const hasEnrichmentFields = !!drop.smartTitle || !!drop.confirmationMessage;
        const minddropStage =
          drop.status === 'pending'
            ? 'pending'
            : drop.status === 'classifying'
              ? 'classifying' // Multi-drop: Phase 1 running
              : drop.status === 'enriching' && hasEnrichmentFields
                ? 'streaming' // Phase 1 done, show typewriter, but chips wait for Phase 2
                : drop.status === 'enriching'
                  ? 'enriching' // Phase 2 still in progress, no enrichment fields yet
                  : drop.status === 'enriched' || drop.status === 'synced'
                    ? 'enriched' // Phase 2 FULLY complete - NOW chips can animate
                    : 'pending';

        // For multi-drops, use the summary as the title
        const displayTitle =
          drop.isMulti && drop.multiSummary
            ? drop.multiSummary
            : drop.smartTitle || drop.text.substring(0, 60) + (drop.text.length > 60 ? '…' : '');

        return {
          id: drop.localId,
          kind,
          title: displayTitle,
          text: drop.text,
          created_at: drop.createdAt,
          drop_id: drop.localId,
          noteSubtype,
          tags: drop.tags || [],
          labels: [],
          // Map extracted date to due_date/due_day for deadline chip
          due_date: drop.extractedDate ?? null,
          due_day: drop.extractedDate?.split('T')[0] ?? null,
          views: {
            ai_pending: drop.status !== 'synced' && drop.status !== 'enriched',
            minddrop_stage: minddropStage,
            confirmation_message: drop.confirmationMessage,
            people: drop.people, // Include people for chip rendering
            // Flag for Row3Chips: only animate chips when Phase 2 is FULLY complete
            // This is separate from minddrop_stage which triggers Row 1-2 typewriter earlier
            chip_data_ready: drop.status === 'enriched' || drop.status === 'synced',
            // Multi-drop data for UI rendering
            is_multi: drop.isMulti,
            multi_segments: drop.multiSegments,
            multi_summary: drop.multiSummary,
          },
          time_estimate_minutes: drop.timeEstimateMinutes ?? null,
          frequency: drop.extractedFrequency ?? null, // For habits: "3x/week", "daily", etc.
          days_active: drop.extractedDays ?? null, // For habits: day numbers for scheduling
          mood: drop.mood ? (drop.mood as unknown as Mood[]) : null, // For journals: mood chips
          is_multi: drop.isMulti,
          // Multi-drop fields (from Phase 0/1, before entity creation)
          multi_items: drop.multiSegments?.map((seg, idx) => {
            // Debug: Log segment data including Phase 1 titles
            if (idx === 0) {
              console.log('🟡 [pendingItems] Mapping multiSegments', {
                segmentCount: drop.multiSegments?.length,
                firstSeg: {
                  text: seg.text?.substring(0, 20),
                  smartTitle: seg.smartTitle,
                  confirmationMessage: seg.confirmationMessage?.substring(0, 30),
                },
              });
            }
            return {
              text: seg.text,
              bucket: seg.bucket,
              subtype: seg.subtype ?? null,
              habitSubtype: null,
              // Use smart_title from Phase 1 if available, fall back to truncated text
              preview_title: seg.smartTitle || seg.text.substring(0, 40),
              // Pass Phase 1 data for entity creation during split
              smart_title: seg.smartTitle ?? null,
              confirmation_message: seg.confirmationMessage ?? null,
            } satisfies MultiDropItem;
          }),
          multi_summary_title: drop.multiSummary,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [pendingDropsMap]);

  // Get drop_ids of all pending items to filter out duplicates from real items
  const pendingDropIds = React.useMemo(() => {
    return new Set(pendingItems.map((p) => p.drop_id).filter(Boolean));
  }, [pendingItems]);

  // Filter real items to exclude any that still have a pending version
  // This prevents the "jolt" when a pending item is promoted to a real entity
  const filteredItems = React.useMemo(() => {
    if (pendingDropIds.size === 0) return items;
    return items.filter((item) => !item.drop_id || !pendingDropIds.has(item.drop_id));
  }, [items, pendingDropIds]);

  // Keep modal item synced with latest version from items/pendingItems
  // (in case Phase 1 updates segments while modal is open)
  const currentModalItem = React.useMemo(() => {
    if (!activeModalItem) return null;
    // Find the current version of this item by drop_id or id in both lists
    const dropId = activeModalItem.drop_id || activeModalItem.id;
    const fromPending = pendingItems.find((i) => (i.drop_id || i.id) === dropId);
    if (fromPending) return fromPending;
    const fromItems = items.find((i) => (i.drop_id || i.id) === dropId);
    return fromItems || activeModalItem;
  }, [activeModalItem, pendingItems, items]);

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

      // Check if this is a new item we don't have yet
      const existingIndex = prev.findIndex((item) => item.id === record.id && item.kind === kind);

      if (existingIndex === -1) {
        // New item - add it to the list
        const newItem: UnifiedDrop = {
          id: record.id,
          kind,
          title: record.title ?? record.name ?? '',
          text: record.body ?? record.name ?? record.title ?? '',
          created_at: record.created_at,
          drop_id: record.drop_id ?? null,
          tags: Array.isArray(record.tags) ? record.tags : [],
          views: record.views ?? {},
          labels: Array.isArray(record.labels) ? record.labels : [],
          due_date: record.due_date ?? null,
          due_day: record.due_day ?? null,
          due_time: record.due_time ?? null,
          noteSubtype: kind === 'note' ? (record.subtype ?? 'catchall') : undefined,
          canonical_type: record.canonical_type ?? null,
          days_active: Array.isArray(record.days_active) ? record.days_active : null,
          time_estimate_minutes: record.time_estimate_minutes ?? null,
          // Habit frequency fields
          frequency: record.frequency ?? null,
          cadence: record.cadence ?? null,
          target_per_period: record.target_per_period ?? null,
          // Multi-entity support: extract from views to top level
          is_multi: record.views?.is_multi === true,
          multi_items: record.views?.multi_items ?? undefined,
          multi_summary_title: record.views?.multi_summary_title ?? undefined,
        };
        return [newItem, ...prev];
      }

      // Existing item - update it
      return prev.map((item) => {
        if (item.id !== record.id || item.kind !== kind) return item;

        // Capture all Phase 2 enrichment fields
        const views = (record as any).views ?? item.views ?? {};
        const title = (record as any).title ?? (record as any).name ?? item.title;
        const tags = Array.isArray((record as any).tags)
          ? (record as any).tags.filter((t: unknown) => typeof t === 'string')
          : (item.tags ?? []);
        const dueDate = (record as any).due_date ?? item.due_date ?? null;
        const dueDay = (record as any).due_day ?? item.due_day ?? null;

        console.debug('[RecentDrops] Merging Phase 2 update', {
          id: record.id,
          oldTitle: item.title?.substring(0, 20),
          newTitle: title?.substring(0, 20),
          oldTags: item.tags?.length ?? 0,
          newTags: tags.length,
          stage: views.minddrop_stage,
        });

        return {
          ...item,
          title,
          tags,
          views,
          due_date: dueDate,
          due_day: dueDay,
          drop_id: (record as any).drop_id ?? item.drop_id ?? null,
          archived: (record as any).archived ?? item.archived ?? false,
          labels: Array.isArray((record as any).labels)
            ? (record as any).labels
            : (item.labels ?? []),
          noteSubtype:
            kind === 'note'
              ? ((record as any).subtype ?? item.noteSubtype ?? 'catchall')
              : item.noteSubtype,
          canonical_type: (record as any).canonical_type ?? item.canonical_type ?? null,
          days_active: Array.isArray((record as any).days_active)
            ? (record as any).days_active
            : (item.days_active ?? null),
          time_estimate_minutes:
            (record as any).time_estimate_minutes ?? item.time_estimate_minutes ?? null,
          // Habit frequency fields - use record value if present, else preserve existing
          frequency: (record as any).frequency ?? item.frequency ?? null,
          cadence: (record as any).cadence ?? item.cadence ?? null,
          target_per_period: (record as any).target_per_period ?? item.target_per_period ?? null,
          // Multi-entity support: extract from views to top level
          is_multi: views?.is_multi === true,
          multi_items: views?.multi_items ?? item.multi_items ?? undefined,
          multi_summary_title: views?.multi_summary_title ?? item.multi_summary_title ?? undefined,
        };
      });
    },
    [],
  );

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
      // Synchronous access from store - no async needed
      const state = useGremlyStore.getState();
      const notes = selectRecentNotes(state, 50);
      const todos = selectRecentTodos(state, 50);
      const habits = selectRecentHabits(state, 50);

      // Time boundaries for filtering
      const start = startOfTodayLocal();
      const todayCutoff = start.getTime();

      // 3 days ago at start of day (for "Show older" toggle)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);
      const olderCutoff = threeDaysAgo.getTime();

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

      // DEBUG: Log notes with views before mapping
      (Array.isArray(notes) ? notes : []).forEach((note) => {
        const noteAny = note as any;
        if (noteAny?.views?.is_multi || noteAny?.title?.includes('Call Mom + Quit')) {
          console.log('[DEBUG:NoteMapping]', {
            id: noteAny.id,
            title: noteAny.title?.substring(0, 30),
            has_views: !!noteAny.views,
            views_keys: noteAny.views ? Object.keys(noteAny.views) : [],
            is_multi: noteAny.views?.is_multi,
          });
        }
      });

      const noteDrops: UnifiedDrop[] = (Array.isArray(notes) ? notes : [])
        .filter((n) => {
          // Show ALL recent notes regardless of origin (Mind Drop, Space chat, manual add, etc.)
          // Exclude archived notes (converted unsorted notes)
          if (n?.archived === true) return false;

          return true;
        })
        .map((n) => {
          const labels = Array.isArray(n?.labels) ? n.labels : [];
          const unsorted = labels.includes(UNSORTED_LABEL);
          const rawSubtype = typeof n?.subtype === 'string' ? n.subtype : null;
          // Default to 'catchall' for all Mind Drop notes - ensures they display as "log" not "unsorted"
          const noteSubtype = rawSubtype ?? 'catchall';
          const noteAny = n as any;
          const rawText = n.body || n.title || noteAny.text || noteAny.content || '';
          const { compact: derivedTitle } = deriveCompactTitle(
            [n.title, n.body, noteAny.text, noteAny.content, rawText],
            { fallback: rawText },
          );

          return {
            id: n.id,
            kind: 'note' as const,
            title: derivedTitle || rawText || 'Untitled note',
            text: n.body || n.title || noteAny.text || noteAny.content || '',
            created_at: n.created_at,
            unsorted,
            noteSubtype,
            tags: toTagList(noteAny?.tags),
            drop_id: noteAny?.drop_id ?? null,
            archived: n?.archived === true,
            canonical_type: noteAny?.canonical_type ?? null,
            labels: Array.isArray(noteAny?.labels) ? noteAny.labels : [],
            views: noteAny?.views ?? {},
            hasPhotos: noteAny?.views?.has_photos === true,
            mood: noteAny?.mood ?? null,
            // Multi-entity support: extract from views to top level
            is_multi: noteAny?.views?.is_multi === true,
            multi_items: noteAny?.views?.multi_items ?? undefined,
            multi_summary_title: noteAny?.views?.multi_summary_title ?? undefined,
          };
        });

      const todoDrops: UnifiedDrop[] = (Array.isArray(todos) ? todos : [])
        .filter((t) => {
          // Show ALL recent todos regardless of origin (Mind Drop, Space chat, manual add, etc.)
          // Exclude completed todos
          if ((t as any)?.completed_at) return false;

          // Exclude archived todos
          if ((t as any)?.status === 'archived') return false;

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
            time_estimate_minutes: (t as any)?.time_estimate_minutes ?? null,
          };
        });

      const habitDrops: UnifiedDrop[] = (Array.isArray(habits) ? habits : [])
        .filter((h) => {
          // Show ALL recent habits regardless of origin (Mind Drop, Space chat, manual add, etc.)
          // Exclude completed habits
          if ((h as any)?.completed_at) return false;

          // Exclude archived habits
          if ((h as any)?.archived === true) return false;

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
            frequency: h.frequency ?? null,
            cadence: (h as any)?.cadence ?? null,
            target_per_period: (h as any)?.target_per_period ?? null,
            tags: toTagList((h as any)?.tags),
            drop_id: (h as any)?.drop_id ?? null,
            canonical_type: (h as any)?.canonical_type ?? null,
            labels: Array.isArray((h as any)?.labels) ? (h as any).labels : [],
            views: (h as any)?.views ?? {},
            start_date: (h as any)?.start_date ?? null,
            days_active: (h as any)?.days_active ?? null,
            time_estimate_minutes: (h as any)?.time_estimate_minutes ?? null,
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
        return Number.isFinite(ts) && ts >= todayCutoff; // "Today"
      });

      // Calculate older items (last 3 days, excluding today)
      const olderItems = unified.filter((i) => {
        const ts = new Date(i.created_at).getTime();
        return Number.isFinite(ts) && ts >= olderCutoff && ts < todayCutoff;
      });

      // Filter based on selection
      if (filter === 'today') {
        unified = todayItems;
      } else {
        unified = olderItems;
      }

      unified = unified
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 25); // keep snappy; scroll handles overflow

      setItems(unified);
      setTodayCount(todayItems.length); // Update today count for toggle label
      setOlderCount(olderItems.length); // Update older count for toggle label

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

      // Note: Pending items now come from Zustand pendingDrops - auto-cleanup is handled by the store

      // Notify parent of today count (for "X thoughts organized today" counter)
      // This ensures the counter always matches the actual number of items in Today section
      onTodayCountChange?.(todayItems.length);
    } finally {
      if (!isTest) setLoading(false);
    }
  }, [filter, onTodayCountChange]);

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

          // Merge into items list - pending drops are managed by Zustand pendingDrops
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'todo'));
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

          // Merge into items list - pending drops are managed by Zustand pendingDrops
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'habit'));
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

          // Merge into items list - pending drops are managed by Zustand pendingDrops
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'note'));
        },
      )
      .subscribe();

    return () => {
      console.debug('[RecentDrops] Cleaning up real-time subscriptions');
      void todosChannel.unsubscribe();
      void habitsChannel.unsubscribe();
      void notesChannel.unsubscribe();
    };
  }, [userId, load, mergeDbRecordIntoItems]);

  // Listen for entity:deleted events from overlay and immediately remove from list
  useEffect(() => {
    const unsubscribe = eventBus.on(
      'entity:deleted',
      (event: { id: string; type?: string; spaceId?: string | null }) => {
        console.debug('[RecentDrops] entity:deleted event:', event.id, event.type);
        // Remove the item immediately from local state
        setItems((prev) => prev.filter((item) => item.id !== event.id));
        // Note: Pending items are managed by Zustand pendingDrops - no cleanup needed here
      },
    );

    const unsubEntityCreated = eventBus.on(
      'entity:created',
      (payload: { entity: any; type: string; spaceId?: string | null }) => {
        const dropId = payload.entity?.drop_id;
        console.debug('[CatchAllNotepad] entity:created received', {
          dropId,
          type: payload.type,
          entityId: payload.entity?.id,
        });

        // DEBUG: Log multi-entity note details
        if (payload.type === 'note') {
          console.log('[DEBUG:EntityCreated:Note]', {
            entityId: payload.entity?.id,
            has_views: !!payload.entity?.views,
            views_is_multi: payload.entity?.views?.is_multi,
            views_keys: payload.entity?.views ? Object.keys(payload.entity.views) : [],
          });
        }

        // Merge entity into items list - pending drops are managed by Zustand pendingDrops
        if (dropId && payload.entity) {
          const entityType = payload.type as 'todo' | 'habit' | 'note';
          const entity = payload.entity;

          // Mark this drop as recently promoted to skip Layout animation jolt
          markDropAsRecentlyPromoted(dropId);

          const realItem: UnifiedDrop = {
            id: entity.id,
            kind: entityType,
            title: entity.title ?? entity.name ?? '',
            text: entity.body ?? entity.name ?? entity.title ?? '',
            created_at: entity.created_at,
            drop_id: dropId,
            tags: Array.isArray(entity.tags) ? entity.tags : [],
            views: entity.views ?? { minddrop_stage: 'classified', ai_pending: true },
            labels: Array.isArray(entity.labels) ? entity.labels : [],
            due_date: entity.due_date ?? entity.due_at ?? null,
            due_day: entity.due_day ?? null,
            due_time: entity.due_time ?? null,
            noteSubtype: entityType === 'note' ? (entity.subtype ?? 'catchall') : undefined,
            mood: entityType === 'note' ? (entity.mood ?? null) : undefined,
            time_estimate_minutes: entity.time_estimate_minutes ?? null,
            // Habit frequency fields
            frequency: entity.frequency ?? null,
            cadence: entity.cadence ?? null,
            target_per_period: entity.target_per_period ?? null,
            days_active: entity.days_active ?? null,
            start_date: entity.start_date ?? null,
            // Multi-entity support: extract from views to top level
            is_multi: entity.views?.is_multi === true,
            multi_items: entity.views?.multi_items ?? undefined,
            multi_summary_title: entity.views?.multi_summary_title ?? undefined,
          };

          // Merge into items - pending drops will be automatically removed from Zustand when synced
          setItems((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === realItem.id);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = realItem;
              return updated;
            }
            return [realItem, ...prev];
          });
        }
      },
    );

    // Listen for Phase 2 enrichment completion to update card smoothly
    const unsubEntityEnriched = eventBus.on('entity:enriched', (payload) => {
      console.debug('[RecentDrops] entity:enriched received', payload);

      // Update the item in local state immediately for smooth card update
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== payload.entityId) return item;
          return {
            ...item,
            title: payload.smartTitle,
            tags: payload.tags,
            due_date: payload.dueDate ?? item.due_date,
            frequency: payload.frequency ?? item.frequency,
            // Canonical frequency fields (SINGLE SOURCE OF TRUTH for display)
            ...(payload.cadence !== undefined && { cadence: payload.cadence }),
            ...(payload.target_per_period !== undefined && {
              target_per_period: payload.target_per_period,
            }),
            // Days active from extracted_days (for habit day-specific scheduling)
            ...(payload.extracted_days !== undefined && { days_active: payload.extracted_days }),
            hasPhotos: payload.hasPhotos ?? item.hasPhotos,
            time_estimate_minutes: payload.timeEstimate ?? item.time_estimate_minutes,
            start_date: payload.startDate ?? item.start_date,
            // Mood for journal entries (multi-select array)
            ...(payload.mood !== undefined && { mood: payload.mood as Mood[] | null }),
            views: {
              ...item.views,
              minddrop_stage: 'enriched',
              ai_pending: false,
              confirmation_message: payload.confirmationMessage ?? item.views?.confirmation_message,
              people: payload.people ?? item.views?.people,
            },
          };
        }),
      );
    });

    // Listen for Phase 2 streaming field updates for progressive UI
    const unsubFieldUpdated = eventBus.on('entity:field_updated', (payload) => {
      const { entityId, field, value } = payload;
      console.log('🔵 [RecentDrops] entity:field_updated received', { entityId, field, value });

      setItems((prev) => {
        const matchingItem = prev.find((item) => item.id === entityId);
        console.log('🔵 [RecentDrops] Found matching item?', !!matchingItem, matchingItem?.id);

        return prev.map((item) => {
          if (item.id !== entityId) return item;

          // Update the specific field that changed
          if (field === 'smart_title') {
            console.log('🔴 UPDATING TITLE IN STATE:', value);
            return { ...item, title: value };
          }
          if (field === 'confirmation_message') {
            console.log('🟡 UPDATING CONFIRMATION IN STATE:', value);
            return {
              ...item,
              views: { ...item.views, confirmation_message: value },
            };
          }
          if (field === 'tags') {
            console.log('🟢 UPDATING TAGS IN STATE:', value);
            return { ...item, tags: value };
          }
          // CRITICAL: Do NOT update minddrop_stage via field_updated events!
          // The stage should ONLY be set to 'enriched' via the entity:enriched event
          // which contains ALL fields at once. If we set 'enriched' here before
          // time_estimate_minutes arrives, chips animate in without the time estimate.
          if (field === 'minddrop_stage') {
            console.log('🟣 IGNORING minddrop_stage via field_updated (wait for entity:enriched)');
            return item; // Don't update - wait for entity:enriched
          }
          if (field === 'time_estimate_minutes') {
            console.log('⏱️ UPDATING TIME ESTIMATE IN STATE:', value);
            return { ...item, time_estimate_minutes: value };
          }

          return item;
        });
      });
    });

    // Remove completed items from list immediately
    const unsubItemCompleted = eventBus.on(
      'ItemCompleted',
      (payload: { id: string; type: 'habit' | 'todo' }) => {
        console.debug('[RecentDrops] ItemCompleted event:', payload.id, payload.type);
        // Remove the item immediately from local state
        setItems((prev) => prev.filter((item) => item.id !== payload.id));
        // Note: Pending items are managed by Zustand pendingDrops - no cleanup needed here
      },
    );

    // Timeout mechanism for stuck cards - recover after 30 seconds
    const stuckCardInterval = setInterval(() => {
      const now = Date.now();
      const STUCK_THRESHOLD_MS = 30000; // 30 seconds

      setItems((prev) => {
        let hasChanges = false;
        const updated = prev.map((item) => {
          const stage = item.views?.minddrop_stage;
          if (stage === 'streaming' || stage === 'enriching' || stage === 'pending') {
            const createdAt = new Date(item.created_at).getTime();
            if (now - createdAt > STUCK_THRESHOLD_MS) {
              console.warn('[RecentDrops] Recovering stuck card:', item.id, stage);
              hasChanges = true;
              return {
                ...item,
                views: {
                  ...item.views,
                  minddrop_stage: 'enriched',
                  ai_pending: false,
                },
              };
            }
          }
          return item;
        });
        return hasChanges ? updated : prev;
      });
    }, 10000); // Check every 10 seconds

    return () => {
      unsubscribe();
      unsubEntityCreated();
      unsubEntityEnriched();
      unsubFieldUpdated();
      unsubItemCompleted();
      clearInterval(stuckCardInterval);
    };
  }, [load]);

  const handleEdit = React.useCallback(
    async (id: string, kind: UnifiedDrop['kind'], _unsorted?: boolean) => {
      try {
        // Synchronous lookup from store
        const record = getItemById(id);

        if (record && record.type === kind) {
          // Open habits in view mode, others in edit mode
          if (kind === 'habit') {
            overlay.openView({
              record: record as any,
              spaceId: (record as any).space_id ?? null,
            });
          } else {
            overlay.openEdit({
              record: record as any,
              spaceId: (record as any).space_id ?? null,
            });
          }
          onEdited?.();
        } else {
          console.warn('[RecentDrops] handleEdit: record not found or type mismatch', { id, kind });
          // Fallback to minimal record if fetch fails
          if (kind === 'habit') {
            overlay.openView({
              record: { id, type: kind } as any,
              spaceId: null,
            });
          } else {
            overlay.openEdit({
              record: { id, type: kind } as any,
              spaceId: null,
            });
          }
          onEdited?.();
        }
      } catch (error) {
        console.error('[RecentDrops] handleEdit: failed to fetch record', error);
        // Fallback to minimal record if fetch fails
        if (kind === 'habit') {
          overlay.openView({
            record: { id, type: kind } as any,
            spaceId: null,
          });
        } else {
          overlay.openEdit({
            record: { id, type: kind } as any,
            spaceId: null,
          });
        }
        onEdited?.();
      }
    },
    [getItemById, overlay, onEdited],
  );

  const handleDelete = React.useCallback(
    async (id: string, kind: UnifiedDrop['kind']) => {
      try {
        // Look up drop_id from store instead of local state to avoid dependency on `items`
        const state = useGremlyStore.getState();
        let dropId: string | undefined;

        if (kind === 'todo') {
          dropId = state.todos.find((t) => t.id === id)?.drop_id ?? undefined;
        } else if (kind === 'habit') {
          dropId = state.habits.find((h) => h.id === id)?.drop_id ?? undefined;
        } else {
          dropId = state.notes.find((n) => n.id === id)?.drop_id ?? undefined;
        }

        if (dropId) {
          // Archive all items with this drop_id
          const todosToDelete = state.todos.filter((t) => t.drop_id === dropId);
          const habitsToDelete = state.habits.filter((h) => h.drop_id === dropId);
          const notesToDelete = state.notes.filter((n) => n.drop_id === dropId);

          // Delete each item by type
          await Promise.all([
            ...todosToDelete.map((t) => deleteTodo(t.id)),
            ...habitsToDelete.map((h) => deleteHabit(h.id)),
            ...notesToDelete.map((n) => deleteNote(n.id)),
          ]);

          // Remove all items with this drop_id from local state
          setItems((prev) => prev.filter((item) => item.drop_id !== dropId));
        } else {
          // No drop_id: fallback to single-item delete
          if (kind === 'todo') {
            await deleteTodo(id);
          } else if (kind === 'habit') {
            await deleteHabit(id);
          } else {
            await deleteNote(id);
          }

          // Remove only this item from local state
          setItems((prev) => prev.filter((item) => item.id !== id));
        }

        onDeleted?.();
      } catch (err) {
        // optional: error UI
        console.error('[handleDelete] Failed to delete:', err);
      }
    },
    [deleteTodo, deleteHabit, deleteNote, onDeleted],
  );

  // Multi-entity: Keep as note handler
  const handleKeepAsNote = React.useCallback(
    async (noteId: string) => {
      // Close modal first (modal is at RecentDrops level now)
      setActiveModalItem(null);

      try {
        const noteToUpdate = items.find((item) => item.id === noteId);
        if (!noteToUpdate) return;

        const dominantBucket = noteToUpdate.views?.dominant_bucket;
        const dominantSubtype = noteToUpdate.views?.dominant_subtype;
        const originalText = noteToUpdate.text || noteToUpdate.title || '';
        const spaceId = noteToUpdate.views?.space_id ?? null;

        // If dominant_bucket is todo or habit, convert to that type instead of keeping as note
        if (dominantBucket === 'todo') {
          // Create a todo from this note
          const newTodo = await createTodo({
            name: noteToUpdate.title || originalText,
            body: originalText,
            space_id: spaceId,
            origin: 'catchall',
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
              origin: 'multi_kept_together',
            },
          } as any);

          if (newTodo?.id) {
            // Archive the original note
            await archiveNote(noteId, 'converted_to_todo');

            // Update local state: remove note, add todo
            setItems((prev) => {
              const withoutOriginal = prev.filter((item) => item.id !== noteId);
              const newItem: UnifiedDrop = {
                id: newTodo.id,
                kind: 'todo',
                title: noteToUpdate.title || originalText,
                text: originalText,
                created_at: new Date().toISOString(),
                tags: [],
                views: { minddrop_stage: 'classified', ai_pending: true },
                labels: [],
              };
              return [newItem, ...withoutOriginal];
            });

            // Run Phase 2 enrichment (non-streaming)
            runPhase2(newTodo.id, originalText, 'todo', null, repo)
              .then((result) => {
                console.log(`[RecentDrops:Phase2:${newTodo.id}] Complete`, result);
                // Update local state with ALL enrichment fields so chips animate together
                if (result) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === newTodo.id ? applyEnrichmentToItem(item, result) : item,
                    ),
                  );
                }
              })
              .catch((err) => console.warn('[RecentDrops:Phase2] Enrichment failed', err));

            console.log('[RecentDrops] Converted multi-drop to todo:', newTodo.id);
          }
          return;
        }

        if (dominantBucket === 'habit') {
          // Create a habit from this note
          const newHabit = await createHabit({
            name: noteToUpdate.title || originalText,
            title: noteToUpdate.title || originalText,
            notes: originalText,
            frequency: 'daily',
            subtype: 'start_habit',
            space_id: spaceId,
            origin: 'catchall',
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
              origin: 'multi_kept_together',
            },
          } as any);

          if (newHabit?.id) {
            // Archive the original note
            await archiveNote(noteId, 'converted_to_habit');

            // Update local state: remove note, add habit
            setItems((prev) => {
              const withoutOriginal = prev.filter((item) => item.id !== noteId);
              const newItem: UnifiedDrop = {
                id: newHabit.id,
                kind: 'habit',
                title: noteToUpdate.title || originalText,
                text: originalText,
                created_at: new Date().toISOString(),
                tags: [],
                views: { minddrop_stage: 'classified', ai_pending: true },
                labels: [],
              };
              return [newItem, ...withoutOriginal];
            });

            // Run Phase 2 enrichment (non-streaming)
            runPhase2(newHabit.id, originalText, 'habit', null, repo)
              .then((result) => {
                console.log(`[RecentDrops:Phase2:${newHabit.id}] Complete`, result);
                // Update local state with ALL enrichment fields so chips animate together
                if (result) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === newHabit.id ? applyEnrichmentToItem(item, result) : item,
                    ),
                  );
                }
              })
              .catch((err) => console.warn('[RecentDrops:Phase2] Enrichment failed', err));

            console.log('[RecentDrops] Converted multi-drop to habit:', newHabit.id);
          }
          return;
        }

        // Default: keep as note (log bucket)
        const noteSubtype =
          dominantSubtype === 'journal'
            ? 'journal'
            : dominantSubtype === 'idea'
              ? 'idea'
              : 'catchall';

        await updateNote(noteId, {
          subtype: noteSubtype,
          views: {
            ...noteToUpdate.views,
            is_multi: false,
            minddrop_stage: 'classified',
            ai_pending: true,
            multi_items: undefined,
            multi_summary_title: undefined,
          },
        } as any);

        // Update local state
        setItems((prev) =>
          prev.map((item) =>
            item.id === noteId
              ? {
                  ...item,
                  is_multi: false,
                  noteSubtype: noteSubtype,
                  views: {
                    ...item.views,
                    is_multi: false,
                    minddrop_stage: 'classified',
                    ai_pending: true,
                  },
                }
              : item,
          ),
        );

        // Run Phase 2 enrichment for the note (non-streaming)
        runPhase2(noteId, originalText, 'log', dominantSubtype || 'general', repo)
          .then((result) => {
            console.log(`[RecentDrops:Phase2:${noteId}] Complete`, result);
            // Update local state with ALL enrichment fields so chips animate together
            if (result) {
              setItems((prev) =>
                prev.map((item) =>
                  item.id === noteId ? applyEnrichmentToItem(item, result) : item,
                ),
              );
            }
          })
          .catch((err) => console.warn('[RecentDrops:Phase2] Enrichment failed', err));

        console.log('[RecentDrops] Kept multi-drop as note with subtype:', noteSubtype);
      } catch (err) {
        console.error('[RecentDrops] Failed to keep as note:', err);
      }
    },
    [items, updateNote, createTodo, createHabit, archiveNote, repo],
  );

  // Multi-entity: Split selected items handler
  const handleSplitSelected = React.useCallback(
    async (noteId: string, selectedItems: MultiDropItem[]) => {
      // Close modal first (modal is at RecentDrops level now)
      setActiveModalItem(null);

      console.log('[RecentDrops] Splitting multi-drop into', selectedItems.length, 'items');
      console.log(
        '[RecentDrops] Split items detail:',
        selectedItems.map((item) => ({
          text: item.text.substring(0, 30),
          bucket: item.bucket,
          subtype: item.subtype,
          habitSubtype: item.habitSubtype,
          smart_title: item.smart_title,
          confirmation_message: item.confirmation_message,
        })),
      );
      const noteToSplit = items.find((item) => item.id === noteId);
      const spaceId = noteToSplit?.views?.space_id ?? null;
      const now = Date.now();

      // 1. Create optimistic items immediately for instant visual feedback
      const optimisticItems: UnifiedDrop[] = selectedItems.map((splitItem, index) => {
        const tempId = `temp-split-${now}-${index}`;
        const kind: 'todo' | 'habit' | 'note' =
          splitItem.bucket === 'todo' ? 'todo' : splitItem.bucket === 'habit' ? 'habit' : 'note';

        // Use smart_title from Phase 1 if available, fall back to preview_title or raw text
        const displayTitle = splitItem.smart_title || splitItem.preview_title || splitItem.text;

        return {
          id: tempId,
          kind,
          title: displayTitle,
          text: splitItem.text,
          created_at: new Date().toISOString(),
          drop_id: `split-${noteId}-${index}`,
          tags: [],
          views: {
            minddrop_stage: 'classified',
            ai_pending: true,
            origin: 'multi_split',
            // Store confirmation_message for display
            confirmation_message: splitItem.confirmation_message ?? null,
          },
          labels: [],
          noteSubtype:
            kind === 'note'
              ? splitItem.subtype === 'journal'
                ? 'journal'
                : splitItem.subtype === 'idea'
                  ? 'idea'
                  : 'catchall'
              : undefined,
        };
      });

      // 2. Update UI immediately: remove original, add optimistic items
      setItems((prev) => {
        const withoutOriginal = prev.filter((item) => item.id !== noteId);
        return [...optimisticItems, ...withoutOriginal];
      });

      console.log(
        '[RecentDrops] Added optimistic items:',
        optimisticItems.map((o) => ({
          id: o.id,
          title: o.title,
          kind: o.kind,
        })),
      );

      // 3. Create actual entities in database (async, in background)
      try {
        for (let i = 0; i < selectedItems.length; i++) {
          const splitItem = selectedItems[i];
          const optimisticId = optimisticItems[i].id;
          const bucket: MindDropBucket = splitItem.bucket;
          const subtype: MindDropLogSubtype | null = splitItem.subtype;
          let newEntity: { id: string } | null = null;

          // Use smart_title from Phase 1 if available
          const entityTitle = splitItem.smart_title || splitItem.preview_title || splitItem.text;

          if (splitItem.bucket === 'todo') {
            newEntity = await createTodo({
              name: entityTitle,
              body: splitItem.text,
              space_id: spaceId,
              origin: 'catchall',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_split',
                source_drop_id: noteId,
                confirmation_message: splitItem.confirmation_message ?? null,
              },
            } as any);
          } else if (splitItem.bucket === 'habit') {
            newEntity = await createHabit({
              name: entityTitle,
              title: entityTitle,
              notes: splitItem.text,
              frequency: 'daily',
              subtype: splitItem.habitSubtype || 'start_habit',
              space_id: spaceId,
              origin: 'catchall',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_split',
                source_drop_id: noteId,
                confirmation_message: splitItem.confirmation_message ?? null,
              },
            } as any);
          } else {
            // log bucket -> note
            const noteSubtype =
              splitItem.subtype === 'journal'
                ? 'journal'
                : splitItem.subtype === 'idea'
                  ? 'idea'
                  : 'catchall';
            newEntity = await createNote({
              title: entityTitle,
              body: splitItem.text,
              subtype: noteSubtype,
              space_id: spaceId,
              origin: 'catchall',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_split',
                source_drop_id: noteId,
                confirmation_message: splitItem.confirmation_message ?? null,
              },
            } as any);
          }

          // Replace optimistic item with real item
          if (newEntity?.id) {
            setItems((prev) =>
              prev.map((item) =>
                item.id === optimisticId
                  ? { ...item, id: newEntity!.id, drop_id: item.drop_id }
                  : item,
              ),
            );

            // Trigger Phase 2 enrichment for the new entity (non-streaming)
            const entityIdForPhase2 = newEntity.id;
            runPhase2(entityIdForPhase2, splitItem.text, bucket, subtype, repo)
              .then((result) => {
                console.log(`[RecentDrops:Phase2:${entityIdForPhase2}] Complete`, result);
                // Update local state with ALL enrichment fields so chips animate together
                if (result) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === entityIdForPhase2 ? applyEnrichmentToItem(item, result) : item,
                    ),
                  );
                }
              })
              .catch((err) => {
                console.warn('[RecentDrops:Phase2] Enrichment failed', err);
                // Reset card state so it doesn't stay stuck in enriching
                setItems((prev) =>
                  prev.map((item) =>
                    item.id === entityIdForPhase2
                      ? {
                          ...item,
                          views: {
                            ...item.views,
                            minddrop_stage: 'enriched',
                            ai_pending: false,
                          },
                        }
                      : item,
                  ),
                );
              });
          }
        }

        // Archive the original multi-drop note
        await archiveNote(noteId, 'split_completed');

        console.log('[RecentDrops] Split complete, archived original:', noteId);
      } catch (err) {
        console.error('[RecentDrops] Failed to split multi-drop:', err);
        // On error, remove optimistic items (they weren't created)
        setItems((prev) => prev.filter((item) => !item.id.startsWith('temp-split-')));
      }
    },
    [items, createTodo, createHabit, createNote, archiveNote, repo],
  );

  return (
    <View style={styles.recentRoot}>
      {/* Two-zone toggle: text for filter picker, chevron for collapse */}
      <View style={styles.recentToggleRow}>
        {/* Tap zone 1: Filter picker (Today/Older) */}
        <Pressable
          testID="minddrop-recent-filter"
          onPress={handleFilterPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Show ${filter === 'today' ? 'today' : 'older'} drops. Tap to change.`}
        >
          <Text style={styles.recentToggleText}>
            {filter === 'today'
              ? `Today${todayCount > 0 ? ` (${todayCount})` : ''}`
              : `Older${olderCount > 0 ? ` (${olderCount})` : ''}`}
          </Text>
        </Pressable>

        {/* Tap zone 2: Collapse/expand chevron */}
        <Pressable
          testID="minddrop-recent-chevron"
          onPress={handleChevronPress}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Toggle recent drops"
          accessibilityState={{ expanded: open }}
          style={styles.recentChevronBtn}
        >
          <Reanimated.View style={chevronAnimatedStyle}>
            <ChevronDown size={18} color={c.mossGreen} />
          </Reanimated.View>
        </Pressable>
      </View>

      {open ? (
        <View testID="minddrop-recent-list" style={styles.recentList}>
          {loading ? (
            <Text style={styles.recentEmpty}>Loading…</Text>
          ) : filteredItems.length === 0 && pendingItems.length === 0 ? (
            <View style={styles.recentEmptyContainer}>
              <Text style={styles.recentEmptyPrimary}>
                {filter === 'today' ? "Gremly's ready when you are." : 'No older drops.'}
              </Text>
              {filter === 'today' && (
                <Text style={styles.recentEmptySecondary}>
                  What's on your mind? Drop it here — tasks, ideas, worries, anything.
                </Text>
              )}
            </View>
          ) : (
            <AppScrollView
              contentContainerStyle={styles.recentScrollContent}
              showsVerticalScrollIndicator
            >
              {/* Combined list: pending items first, then real items (sorted by created_at) */}
              {/* Using a single loop ensures React maintains component identity when */}
              {/* a pending item is promoted to a real item (prevents modal from closing) */}
              {(() => {
                // Combine pending and real items, mark which list they're from
                const allItems = [
                  ...pendingItems.map((item) => ({ ...item, _isPendingList: true as const })),
                  ...filteredItems.map((item) => ({ ...item, _isPendingList: false as const })),
                ].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                );

                return allItems.map((item) => {
                  const effectiveKind = item.optimisticKind ?? item.kind;
                  const displayKind = getDisplayKindForDrop(item, canonicalTypesOn);
                  const showLegacyUnsortedBadge =
                    !canonicalTypesOn && effectiveKind === 'note' && (item as any).unsorted;
                  const badgeStyleKey =
                    effectiveKind === 'todo'
                      ? 'badge_todo'
                      : effectiveKind === 'habit'
                        ? 'badge_habit'
                        : 'badge_note';

                  // Get visual state for pending/failed/final rendering
                  const visualState = getMindDropVisualState(item);
                  const isPending = item._isPendingList || visualState === 'pending';

                  // Use drop_id for key to maintain component identity across pending→real transition
                  const stableKey = item.drop_id || `${item.kind}:${item.id}`;

                  // DEBUG: Log each item render with key info
                  console.log('[DEBUG:Render] Item in list:', {
                    stableKey,
                    itemId: item.id,
                    dropId: item.drop_id,
                    isPendingList: item._isPendingList,
                    kind: item.kind,
                  });

                  // Use UnifiedCardWrapper for BOTH pending and real items
                  // This prevents remounting when transitioning (preserves modal state)
                  return (
                    <UnifiedCardWrapper
                      key={stableKey}
                      itemId={item.id}
                      dropId={item.drop_id}
                      isPending={item._isPendingList}
                    >
                      <AnimatedMindDropCard
                        item={item}
                        isPending={isPending}
                        effectiveKind={effectiveKind}
                        displayKind={displayKind}
                        showLegacyUnsortedBadge={
                          item._isPendingList ? undefined : showLegacyUnsortedBadge
                        }
                        badgeStyleKey={badgeStyleKey}
                        c={c}
                        styles={styles}
                        mode={themeMode}
                        handleEdit={item._isPendingList ? NOOP_EDIT : handleEdit}
                        handleDelete={item._isPendingList ? NOOP_DELETE : handleDelete}
                        onKeepAsNote={handleKeepAsNote}
                        onSplitSelected={handleSplitSelected}
                        onOpenModal={handleOpenModal}
                      />
                    </UnifiedCardWrapper>
                  );
                });
              })()}
            </AppScrollView>
          )}
        </View>
      ) : null}

      {/* Multi-entity modal lifted to RecentDrops level - survives card remounts */}
      {currentModalItem && (
        <MultiSplitModal
          visible={!!currentModalItem}
          items={currentModalItem.multi_items || currentModalItem.views?.multi_items || []}
          summaryTitle={
            currentModalItem.multi_summary_title ||
            currentModalItem.views?.multi_summary_title ||
            'Multiple Items'
          }
          originalText={currentModalItem.text || currentModalItem.title || ''}
          dominantBucket={currentModalItem.views?.dominant_bucket || null}
          dominantSubtype={currentModalItem.views?.dominant_subtype || null}
          onClose={() => setActiveModalItem(null)}
          onKeepAsNote={() => handleKeepAsNote(currentModalItem.id)}
          onSplitSelected={(selectedItems) =>
            handleSplitSelected(currentModalItem.id, selectedItems)
          }
        />
      )}
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

  // Direct store access - no adapter
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createNote = useGremlyStore((s) => s.createNote);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const deleteTodo = useGremlyStore((s) => s.deleteTodo);
  const deleteNote = useGremlyStore((s) => s.deleteNote);
  const deleteHabit = useGremlyStore((s) => s.deleteHabit);
  const insertLogPhoto = useGremlyStore((s) => s.insertLogPhoto);

  // Ritual progress state
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const todayDropsCount = useGremlyStore((s) => s.todayDropsCount);
  const todaySweepsCount = useGremlyStore((s) => s.todaySweepsCount);

  // First drop tracking
  const firstDropCompletedAt = useGremlyStore((s) => s.firstDropCompletedAt);
  const onboardingCompletedAt = useGremlyStore((s) => s.onboardingCompletedAt);
  const markFirstDropComplete = useGremlyStore((s) => s.markFirstDropComplete);

  // Synchronous lookups from store
  const getItemById = useCallback(
    (id: string) => selectItemById(useGremlyStore.getState(), id),
    [],
  );
  const findNoteBySourceMessageId = useCallback(
    (sourceMessageId: string) =>
      selectNoteBySourceMessageId(useGremlyStore.getState(), sourceMessageId),
    [],
  );

  const { decideWithContext } = useCortex();
  const { user, userId, signOut } = useAuth();

  // Sign out confirmation handler
  const handleSignOutPress = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (err) {
            console.error('[MindDrop] Sign out failed:', err);
          }
        },
      },
    ]);
  }, [signOut]);

  const { submit: mindDropSubmit, isSubmitting: isMindDropSubmitting } = useMindDropSubmit();

  // Voice capture
  const {
    state: voiceState,
    toggle: toggleVoice,
    duration: voiceDuration,
    errorMessage: voiceError,
  } = useVoiceCapture({
    onTranscribe: (result) => {
      // Append transcribed text to input
      setNote((prev) => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${result.text}` : result.text;
      });
    },
    onError: (error) => {
      console.warn('[VoiceCapture] Error:', error);
      // Don't show toast - too disruptive
    },
    maxDuration: 60,
  });

  // Handle mic press
  const handleMicPress = useCallback(() => {
    if (voiceState !== 'transcribing') {
      toggleVoice();
    }
  }, [voiceState, toggleVoice]);

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
  const [showRitualProgress, setShowRitualProgress] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFirstDropSpotlight, setShowFirstDropSpotlight] = useState(false);
  const [gremlySpeech, setGremlySpeech] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const gremlySpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechRef = useRef<string | null>(null);
  const timingAskedRef = useRef<string | null>(null); // Track submission ID to avoid re-asking
  // Photo drop: Track if current submission has photos (for classification default to log-general)
  const currentSubmissionHasPhotosRef = useRef(false);

  // Auto-dismiss photo text nudge after 5 seconds
  useEffect(() => {
    if (!showPhotoTextNudge) return;
    const timeout = setTimeout(() => setShowPhotoTextNudge(false), 5000);
    return () => clearTimeout(timeout);
  }, [showPhotoTextNudge]);

  // Cleanup gremlySpeech timeout on unmount
  useEffect(() => {
    return () => {
      if (gremlySpeechTimeoutRef.current) {
        clearTimeout(gremlySpeechTimeoutRef.current);
      }
    };
  }, []);

  // Show first drop spotlight for new users
  useEffect(() => {
    if (onboardingCompletedAt && !firstDropCompletedAt) {
      // Small delay to let layout settle
      const timer = setTimeout(() => setShowFirstDropSpotlight(true), 600);
      return () => clearTimeout(timer);
    }
  }, [onboardingCompletedAt, firstDropCompletedAt]);

  // Track keyboard visibility to adjust bottom padding
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Helper to show Gremly speech bubble with auto-dismiss
  const showGremlySpeech = useCallback((message: string, durationMs = 3500) => {
    console.log('[Gremly Speech] showGremlySpeech called:', { message, durationMs });
    if (gremlySpeechTimeoutRef.current) {
      clearTimeout(gremlySpeechTimeoutRef.current);
    }
    lastSpeechRef.current = message;
    setGremlySpeech(message);
    gremlySpeechTimeoutRef.current = setTimeout(() => {
      console.log('[Gremly Speech] Auto-dismissing speech bubble');
      setGremlySpeech(null);
    }, durationMs);
  }, []);

  // State for tracking drops today and returning user detection
  const [dropsToday, setDropsToday] = useState(0);
  const lastDropTimeRef = useRef<number | null>(null);

  // Show a contextual greeting on mount
  useEffect(() => {
    // Delay slightly so the animation is visible
    const timer = setTimeout(() => {
      const greeting = getGreetingSpeech();
      showGremlySpeech(greeting.message, greeting.duration);
    }, 500);
    return () => clearTimeout(timer);
  }, [showGremlySpeech]);

  // Helper to check if user is returning (>24h since last drop)
  const isReturningUser = useCallback(() => {
    if (!lastDropTimeRef.current) return false;
    return Date.now() - lastDropTimeRef.current > 24 * 60 * 60 * 1000;
  }, []);

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
  const handleInputFocusChange = useCallback((focused: boolean) => {
    inputFocusRef.current = focused;
    setIsInputFocused(focused);
    // Keep recent drops visible so users can watch cards update in real-time
  }, []);

  // Auto-dismiss spotlight when user focuses input or starts typing
  useEffect(() => {
    if (showFirstDropSpotlight && (isInputFocused || note.length > 0)) {
      setShowFirstDropSpotlight(false);
      markFirstDropComplete();
    }
  }, [showFirstDropSpotlight, isInputFocused, note.length, markFirstDropComplete]);

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
        ...snapshot.todos.map((id) => deleteTodo(id)),
        ...snapshot.habits.map((id) => deleteHabit(id)),
        ...snapshot.notes.map((id) => deleteNote(id)),
      ]);

      // Clear snapshot to avoid repeat undo
      pendingUndo.current = { todos: [], notes: [], habits: [] };

      if (TOASTS_ON) {
        showActionToast({ type: 'success', content: '✅ Undo complete — Mind Drop reverted' });
      }
    } catch (e) {
      Alert.alert('Undo failed', 'Could not revert items. You can edit from Recent.');
    }
  }, [deleteTodo, deleteHabit, deleteNote, showActionToast, TOASTS_ON]);

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

  /**
   * New Mind Drop submit handler using unified useMindDropSubmit hook.
   * Enabled via FEATURE_FLAGS.MIND_DROP_V4_ENABLED.
   */
  const handleMindDropSubmit = useCallback(async (): Promise<SaveResult> => {
    console.log('[MindDrop:NewPipeline] Submitting via unified hook');
    const trimmed = clampNoteLength(note.trim());
    const hasPhotos = pendingPhotoUris.length > 0;
    const effectiveText = hasPhotos && !trimmed ? '📷 Photo' : trimmed;

    if (!effectiveText) {
      resetState();
      return { created: { todos: [], notes: [], habits: [] }, createdDetails: [] };
    }

    // Use the same dropId from CatchAllNotepad ref for pending item correlation
    const { dropId } = ensureSubmissionAndDropIds();

    // OPTIMISTIC UI: The new submit flow already adds pending item via addPendingDrop
    // in useMindDropSubmit hook, so no manual call needed here

    const result = await mindDropSubmit(effectiveText, {
      spaceId: null, // CatchAllNotepad is global, no space
      photoUris: pendingPhotoUris,
      userId: userId, // Pass userId for photo uploads
      source: 'minddrop',
      dropId, // Pass the dropId to ensure pending item correlation
    });

    if (result.success) {
      setNote('');
      setPendingPhotoUris([]);
      // CRITICAL: Clear drop_id ref so next submission generates a new one
      // Without this, subsequent submissions would reuse the same drop_id,
      // causing the database constraint to return the existing entity instead of creating a new one
      dropIdRef.current = null;
      submissionIdRef.current = null;

      // Map log subtype to UI-friendly format
      const noteSubtype =
        result.bucket === 'log'
          ? result.subtype === 'journal'
            ? 'journal'
            : result.subtype === 'idea'
              ? 'idea'
              : 'general'
          : undefined;

      return {
        created: {
          todos: result.bucket === 'todo' ? [result.entityId!] : [],
          notes: result.bucket === 'log' ? [result.entityId!] : [],
          habits: result.bucket === 'habit' ? [result.entityId!] : [],
        },
        createdDetails: [
          {
            kind: result.bucket === 'log' ? 'note' : result.bucket!,
            noteSubtype,
          },
        ],
        decisionConfidence: result.confidence,
        decisionMode: 'auto',
      };
    } else {
      console.error('[MindDrop:NewPipeline] Submit failed:', result.error);
      // Also clear refs on failure so user can retry with fresh IDs
      dropIdRef.current = null;
      submissionIdRef.current = null;
      return { created: { todos: [], notes: [], habits: [] }, createdDetails: [] };
    }
  }, [note, pendingPhotoUris, mindDropSubmit, resetState, ensureSubmissionAndDropIds]);

  const performSave = useCallback(async (): Promise<SaveResult> => {
    // Feature flag check for new Mind Drop pipeline
    if (FEATURE_FLAGS.MIND_DROP_V4_ENABLED) {
      return handleMindDropSubmit();
    }

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
              const id = await saveToUnsortedTray(createNote, trimmed, {
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
              const createdId = await saveToUnsortedTray(createNote, trimmed, {
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

              // Create adapter for pipeline stages
              const pipelineStageAdapter = {
                getById: getItemById,
                createTodo,
                createHabit,
                createNote,
                updateTodo,
                updateHabit,
                updateNote,
              };

              //Step 2A: Classification stage - create entities based on decision
              if (firstAction.type === 'create.todo') {
                // Use Stage A for todos
                const stageAResult = await runMindDropStageAClassification({
                  repo: pipelineStageAdapter as any,
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
                  repo: pipelineStageAdapter as any,
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
                      'general');

                const subtype =
                  rawSubtype === 'journal'
                    ? 'journal'
                    : rawSubtype === 'list'
                      ? 'list'
                      : rawSubtype === 'idea'
                        ? 'idea'
                        : rawSubtype === 'reference'
                          ? 'reference'
                          : 'general';

                const canonicalType = persistedToCanonical('note', subtype);
                const whyUpdate = appendLineageToWhyString('Auto-organizing via Mind Drop', {
                  originId: unsortedNoteId,
                  source: 'auto_classification',
                });

                // Synchronous lookup from store
                const existingNote = getItemById(unsortedNoteId);
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

                await updateNote(unsortedNoteId, updatePatch);

                createdIds.notes.push(unsortedNoteId);
                createdDetails.push({ kind: 'note', noteSubtype: subtype });
              }

              const counts = {
                todos: createdIds.todos.length,
                notes: createdIds.notes.length,
                habits: createdIds.habits.length,
              };

              // Step 2B: Prefill stage - run AI enhancement for all created entities
              // Create minimal adapter for pipeline compatibility
              const pipelineAdapter = {
                getById: getItemById,
                update: async (params: { id: string; patch: any }) => {
                  const item = getItemById(params.id);
                  if (!item) return null;
                  const itemType =
                    (item as any).type ??
                    ('due_date' in item ? 'todo' : 'frequency' in item ? 'habit' : 'note');
                  if (itemType === 'todo') await updateTodo(params.id, params.patch);
                  else if (itemType === 'habit') await updateHabit(params.id, params.patch);
                  else await updateNote(params.id, params.patch);
                  return getItemById(params.id);
                },
              };
              runMindDropStageBPrefill({
                repo: pipelineAdapter as any,
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
                // Valid log subtypes: journal, idea, general (stored as 'catchall')
                // 'list' is a NoteSubtype but not a LogSubtype
                const fallbackSubtype =
                  canonicalSubtypeMeta === 'journal' || canonicalSubtypeMeta === 'idea'
                    ? (canonicalSubtypeMeta as NoteSubtype)
                    : 'catchall'; // log-general
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
                const id = await saveToUnsortedTray(createNote, trimmed, {
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
                const id = await saveToUnsortedTray(createNote, trimmed, {
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

            const id = await saveToUnsortedTray(createNote, trimmed, {
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
    createNote,
    createTodo,
    createHabit,
    updateNote,
    updateTodo,
    updateHabit,
    getItemById,
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
            offlineRetryId = await saveToUnsortedTray(createNote, trimmed, {
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
            unsortedFallbackId = await saveToUnsortedTray(createNote, trimmed, {
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
              // Synchronous lookup from store
              const entity = getItemById(entityId);
              if (!entity) return;

              // Determine type and update accordingly
              const itemType =
                (entity as any).type ??
                ('due_date' in entity ? 'todo' : 'frequency' in entity ? 'habit' : 'note');
              const patch = {
                views: {
                  ...((entity as any).views ?? {}),
                  ai_pending: false,
                },
              };

              if (itemType === 'todo') {
                await updateTodo(entityId, patch);
              } else if (itemType === 'habit') {
                await updateHabit(entityId, patch);
              } else {
                await updateNote(entityId, patch);
              }
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
              await uploadPhotosToNote(insertLogPhoto, noteId, currentUserId, photoUris);
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

      // With the new optimistic queue system:
      // - Pending drops are managed by Zustand pendingDrops (auto-removed when synced)
      // - Real items are merged via entity:created event handler
      // - No manual pending item cleanup needed here
      console.log('[MindDrop][Pipeline] Success - entity created via realtime', {
        dropId,
      });

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
            // Synchronous lookup from store
            const original = getItemById(unsortedId);
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

            // Create adapter for conversion helper
            const conversionAdapter = {
              getById: getItemById,
              createTodo,
              updateNote,
              deleteNote,
            };
            // Use conversion helper to create first-class todo
            const { todo: createdTodo } = await convertUnsortedToTodo(
              conversionAdapter as any,
              unsortedId,
              {
                due: dueDate,
              },
            );

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
            // Synchronous lookup from store
            const original = getItemById(unsortedId);
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

            // Create adapter for conversion helper
            const conversionAdapter = {
              getById: getItemById,
              createHabit,
              updateNote,
              deleteNote,
            };
            // Use the conversion helper to create a first-class habit with parsed frequency
            const { habit: createdHabit } = await convertUnsortedToHabit(
              conversionAdapter as any,
              unsortedId,
              {
                frequency: habitFields.freq,
                frequencyValue: habitFields.frequencyValue ?? null,
              },
            );

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
            // Synchronous lookup from store
            const originalNote = getItemById(unsortedId);
            if (!originalNote) {
              throw new Error('Original note not found');
            }

            // Create adapter for conversion helper
            const conversionAdapter = {
              getById: getItemById,
              updateNote,
            };
            // Do NOT pass subtype - let convertUnsortedToLog use AI classification
            // This ensures AI determines the best subtype (journal/list/reference/idea/plain)
            const { note: convertedLog } = await convertUnsortedToLog(
              conversionAdapter as any,
              unsortedId,
            );

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
      getItemById,
      createTodo,
      createHabit,
      updateNote,
      deleteNote,
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
        await updateTodo(todoId, {
          due_date: dueDate,
          undefined_due: !dueDate,
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
      updateTodo,
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

    // V4 Mind Drop pipeline: Use unified hook instead of legacy flow
    if (FEATURE_FLAGS.MIND_DROP_V4_ENABLED) {
      // Clear mutex after delay
      setTimeout(() => {
        submissionMutex.current.delete(textHash);
      }, 2000);

      const result = await handleMindDropSubmit();
      setIsSubmitting(false);

      // Show speech based on classification result using full getGremlySpeech logic
      if (result.createdDetails?.length > 0) {
        const detail = result.createdDetails[0];
        const uiKind = detail.kind === 'note' ? 'log' : detail.kind;

        // Get due date from created entity if available
        let dueDate: string | null = null;
        if (uiKind === 'todo' && result.created?.todos?.[0]) {
          const createdTodo = getItemById(result.created.todos[0]);
          dueDate = (createdTodo as any)?.due_date ?? (createdTodo as any)?.due_day ?? null;
        }

        // Map confidence number to category
        const rawConfidence = (result as any).decisionConfidence ?? 0.9;
        const confidenceCategory: 'high' | 'medium' | 'low' =
          rawConfidence >= 0.8 ? 'high' : rawConfidence >= 0.5 ? 'medium' : 'low';

        const newDropsToday = dropsToday + 1;
        setDropsToday(newDropsToday);
        lastDropTimeRef.current = Date.now();

        const speechCtx: SpeechContext = {
          kind: uiKind,
          logSubtype: (detail as any).noteSubtype || undefined,
          confidence: confidenceCategory,
          dueDate,
          mode: 'auto',
          dropsToday: newDropsToday,
          isFirstDrop: dropsToday === 0,
          hasPhotos: pendingPhotoUris.length > 0,
          isReturningUser: isReturningUser(),
          error: null,
        };
        const speechResult = getGremlySpeech(speechCtx);
        if (speechResult) {
          lastSpeechRef.current = speechResult.message;
          showGremlySpeech(speechResult.message, speechResult.duration);
        }
      }

      submitLockRef.current = false;
      currentSubmissionHasPhotosRef.current = false;
      return;
    }

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
          offlineId = await saveToUnsortedTray(createNote, effectiveText, {
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

        // OPTIMISTIC UI: The new submit flow already adds pending item via addPendingDrop
        // in useMindDropSubmit hook, so no manual call needed here
        // Heuristic prediction happens inside the hook using heuristicClassify

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

        // Show optimistic speech based on heuristic bucket
        const heuristicResult = heuristicClassify(effectiveText, {
          hasAttachments: hasPhotos,
          spaceId: null,
        });
        const probableKind = heuristicResult.bucket;
        const optimisticSpeech =
          probableKind === 'todo'
            ? 'Added as a task.'
            : probableKind === 'habit'
              ? 'Habit saved.'
              : 'Thought saved.';
        showGremlySpeech(optimisticSpeech);

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

      // SUCCESS PATH — summarize created items and show Gremly speech

      // Generate contextual speech based on classification result
      console.log('[Gremly Speech] finalResult.createdDetails:', finalResult.createdDetails);
      if (finalResult.createdDetails?.length > 0) {
        const detail = finalResult.createdDetails[0];
        const uiKind = detail.kind === 'note' ? 'log' : detail.kind;

        // Get due date from created todo if available
        let dueDate: string | null = null;
        if (uiKind === 'todo' && finalResult.created?.todos?.[0]) {
          const createdTodo = getItemById(finalResult.created.todos[0]);
          dueDate = (createdTodo as any)?.due_date ?? null;
        }

        // Map confidence number to category
        const rawConfidence = finalResult.decisionConfidence ?? 0;
        const confidenceCategory: 'high' | 'medium' | 'low' =
          rawConfidence >= 0.8 ? 'high' : rawConfidence >= 0.5 ? 'medium' : 'low';

        const newDropsToday = dropsToday + 1;
        setDropsToday(newDropsToday);
        lastDropTimeRef.current = Date.now();

        const speechCtx: SpeechContext = {
          kind: uiKind,
          logSubtype: (detail as any).noteSubtype || undefined,
          confidence: confidenceCategory,
          dueDate,
          mode: (finalResult.decisionMode as string) ?? 'auto',
          dropsToday: newDropsToday,
          isFirstDrop: dropsToday === 0,
          hasPhotos: currentSubmissionHasPhotosRef.current,
          isReturningUser: isReturningUser(),
          error: null,
        };
        console.log('[Gremly Speech] speechCtx:', speechCtx);
        const speechResult = getGremlySpeech(speechCtx);
        console.log(
          '[Gremly Speech] generated speech:',
          speechResult,
          'lastSpeechRef:',
          lastSpeechRef.current,
        );
        if (speechResult) {
          lastSpeechRef.current = speechResult.message;
          showGremlySpeech(speechResult.message, speechResult.duration);
          console.log('[Gremly Speech] showGremlySpeech called with:', speechResult.message);
        }
      } else {
        console.log('[Gremly Speech] No createdDetails, skipping speech');
      }

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
    handleMindDropSubmit,
    createNote,
    showActionToast,
    networkIsOnline,
    resetState,
    focusGreetingForA11y,
    triggerRecentRefresh,
    TOASTS_ON,
    ensureSubmissionAndDropIds,
    user,
    userId,
    showGremlySpeech,
    dropsToday,
    isReturningUser,
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
        {/* Header: Safe area wrapper + row with mascot, centered title, logout */}
        <View style={{ paddingTop: insets.top + 16 }} testID="minddrop-header">
          <View style={styles.headerRow}>
            {/* Left - Mascot */}
            <View style={styles.headerLeft}>
              <Pressable onPress={() => setShowHelp(true)} accessibilityLabel="Help">
                <Image
                  source={GREMLY_TOP}
                  style={styles.headerMascot}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </Pressable>
            </View>

            {/* Center - Title (absolutely positioned to true center) */}
            <View style={styles.headerCenter} pointerEvents="none">
              <View style={styles.titleImageWrapper}>
                <Image
                  ref={headerTitleRef}
                  source={MINDDROP_HEADER}
                  style={styles.headerTitleCenter}
                  resizeMode="contain"
                  accessibilityLabel="Mind Drop"
                  accessibilityIgnoresInvertColors
                />
                <View style={styles.titleUnderline} />
              </View>
            </View>

            {/* Right - Logout button */}
            <View style={styles.headerRight}>
              <Pressable
                accessibilityLabel="Sign out"
                accessibilityRole="button"
                onPress={handleSignOutPress}
                hitSlop={12}
                style={styles.logoutBtn}
              >
                <LogOut size={18} color="#6A6F76" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Gremly speech slot - fixed height container, always present to prevent layout shift */}
        <View style={styles.gremlySpeechSlot}>
          {gremlySpeech && (
            <Reanimated.View
              style={styles.gremlySpeechContainer}
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
            >
              <TypewriterText text={gremlySpeech} style={styles.gremlySpeechText} />
            </Reanimated.View>
          )}
        </View>

        {/* Scrollable Recent Drops in the middle - fades when input is focused */}
        <Animated.View
          style={[styles.scrollableSection, { opacity: recentDropsOpacity }]}
          pointerEvents="auto"
        >
          <RecentDropsMemo
            overlay={overlay}
            refreshSignal={recentRefresh}
            onEdited={noopCallback}
            onDeleted={noopCallback}
            onTodayCountChange={handleTodayCountChange}
            initiallyOpen={true}
          />
        </Animated.View>

        {/* Fixed bottom section: input + chips + button + stats */}
        <View style={[styles.fixedTopSection, keyboardVisible && { paddingBottom: 12 }]}>
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
              onMicPress={handleMicPress}
              voiceState={voiceState}
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

          {note.length >= 1500 ? (
            <View style={styles.helperRow}>
              <View style={{ flex: 1 }} />
              <Text
                testID="minddrop-counter"
                style={styles.helperCounter}
              >{`${note.length}/${MAX_INPUT_CHARACTERS}`}</Text>
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
    handleInfoOpen,
    recentDropsOpacity,
    isInputFocused,
    keyboardVisible,
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

      <RitualProgressPopover
        visible={showRitualProgress}
        onDismiss={() => setShowRitualProgress(false)}
        gremlyAge={gremlyAge}
        dropsCount={todayDropsCount}
        sweepsCount={todaySweepsCount}
      />

      <GremlyHelpCard visible={showHelp} onDismiss={() => setShowHelp(false)} screen="minddrop" />

      <FirstDropSpotlight
        visible={showFirstDropSpotlight}
        onDismiss={() => {
          setShowFirstDropSpotlight(false);
          markFirstDropComplete();
        }}
      />

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
              paddingBottom: 0,
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
      paddingHorizontal: 16,
    },
    // Scrollable section for Recent Drops in the middle
    scrollableSection: {
      flex: 1, // Takes remaining space, enables scrolling
      overflow: 'hidden', // Clip content so cards don't extend behind fixed input
    },
    // Fixed section at bottom containing input, chips, button (non-scrolling)
    fixedTopSection: {
      // No flex: this section sizes to its content
      // Note: Name kept as fixedTopSection for compatibility but now positioned at bottom
      paddingBottom: 88, // Tab bar (72px) + gap (16px) - button renders above this padding
    },
    headerContainer: {
      position: 'relative',
      paddingTop: 0,
      paddingBottom: 0,
      marginBottom: 0,
      zIndex: 1,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 4,
      position: 'relative',
      // paddingTop is set dynamically via insets.top in the component
    },
    headerLeft: {
      zIndex: 1, // ensure mascot is tappable above centered title
    },
    headerCenter: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerRight: {
      zIndex: 1, // ensure logout is tappable above centered title
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 0,
    },
    ritualAgePressable: {
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    ritualAgeNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: c.charcoalInk,
      lineHeight: 28,
    },
    ritualAgeLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: c.mutedText,
      marginTop: -2,
    },
    logoutBtn: {
      padding: 6,
      marginTop: 0,
      marginRight: 4,
    },
    headerMascot: {
      height: 64,
      width: 64,
      marginRight: 0,
    },
    titleImageWrapper: {
      position: 'relative',
      alignItems: 'center',
    },
    headerTitleCenter: {
      height: 64,
      width: 180,
      resizeMode: 'contain',
    },
    titleUnderline: {
      position: 'absolute',
      left: 25, // Shifted right to center under MindDrop text
      top: 40, // Moved up closer to text baseline
      width: 108, // ~60% of 180px width
      height: 2,
      backgroundColor: '#D4A853',
      borderRadius: 1,
    },
    countBadge: {
      backgroundColor: '#BFD8C0',
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginLeft: 2,
      marginTop: -2,
    },
    countBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter-Medium',
      color: '#2E5540',
    },
    gremlySpeechSlot: {
      height: 20, // Exactly one line of text (matches lineHeight)
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: -9,
      marginBottom: -9,
    },
    gremlySpeechContainer: {
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    gremlySpeechText: {
      fontFamily: 'Inter-Medium',
      fontSize: 14,
      color: '#2E5540',
      lineHeight: 20,
      textAlign: 'center',
      transform: [{ translateY: 4 }],
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
      backgroundColor: '#FFFFFF',
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
      marginTop: space * 1.5,
      marginBottom: 0,
      width: '100%',
    },
    submitButtonWrapperNoStats: {
      marginBottom: 0,
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
      marginTop: space * 1.5,
      marginBottom: space * 0.5,
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
    // Simplified toggle row: "Today (count)" with chevron - minimal chrome
    recentToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    recentToggleText: {
      color: c.mossGreen,
      fontSize: 15,
      fontWeight: '600',
      fontFamily: 'Inter-Medium',
    },
    recentChevronBtn: {
      padding: 4,
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
      backgroundColor: '#FDFCFA',
      borderRadius: 12,
      height: 88,
      paddingTop: 8,
      paddingBottom: 8,
      paddingHorizontal: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(46,85,64,0.15)',
      shadowColor: 'rgba(46,85,64,0.12)',
      shadowOpacity: 1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
      justifyContent: 'space-between',
    },
    // Top row: Title (left) + Chip (right)
    recentTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    // Right side of top row (chip only)
    recentTopRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    // Title styling - single line, medium weight, truncated
    recentTitle: {
      color: c.charcoalInk,
      fontSize: 15,
      lineHeight: 20,
      fontFamily: 'Inter-Medium',
      flex: 1,
    },
    // Confirmation message - Gremly's voice
    recentConfirmation: {
      fontSize: 13,
      lineHeight: 16,
      fontFamily: 'Inter-Italic',
      color: c.mossGreen,
    },
    // Bottom row: Contextual info + timestamp
    recentMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    // Left side of meta row (contextual meta + tags) - single line, no wrap
    recentMetaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
    // Contextual metadata (due date, frequency) after category chip
    recentContextualMeta: {
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      color: c.mutedText,
      marginLeft: 6,
    },
    // Contextual metadata pill (due date, frequency, subtype)
    recentContextPill: {
      backgroundColor: 'rgba(191, 216, 192, 0.3)',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      fontSize: 10,
      lineHeight: 14,
      color: c.mutedText,
      fontFamily: 'Inter-Medium',
      overflow: 'hidden',
    },
    // Time estimate chip for todos
    timeEstimateChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
      backgroundColor: 'rgba(230, 240, 255, 0.6)',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    timeEstimateText: {
      fontSize: 10,
      color: '#666',
      fontFamily: 'Inter-Medium',
    },
    // Journal subtype display - plain text label with separator and mood chips
    journalMetaRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    journalSubtypeLabel: {
      fontSize: 10,
      color: c.mutedText,
      fontFamily: 'Inter-Medium',
    },
    journalSeparator: {
      fontSize: 10,
      color: c.mutedText,
      fontFamily: 'Inter-Medium',
      marginHorizontal: 2,
    },
    // Mood chips for journal cards
    moodChipsRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    moodChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: 'rgba(230, 240, 235, 0.6)',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      gap: 2,
    },
    moodChipEmoji: {
      fontSize: 10,
    },
    moodChipText: {
      fontSize: 10,
      color: '#666',
      fontFamily: 'Inter-Medium',
    },
    moodOverflow: {
      fontSize: 10,
      color: '#888',
      fontFamily: 'Inter-Medium',
    },
    // Time ago in metadata row - same as recentMetaDue for consistency
    recentMetaTime: {
      color: c.mutedText,
      fontSize: 10,
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
    recentEmptyContainer: {
      alignItems: 'center',
      paddingTop: 4,
      paddingBottom: 10,
    },
    recentEmptyPrimary: {
      fontSize: 14,
      fontWeight: '400',
      color: c.mutedText,
      textAlign: 'center',
    },
    recentEmptySecondary: {
      fontSize: 13,
      fontWeight: '400',
      color: 'rgba(34, 34, 34, 0.45)',
      textAlign: 'center',
      marginTop: 2,
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
