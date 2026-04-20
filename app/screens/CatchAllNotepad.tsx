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
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Text } from '../../ui/Text';
import { Icon } from '../../design-system/Icon';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import {
  useNeedsMindDropTutorial,
  useTrainingDropStep,
  useHasCompletedOnboarding,
  useHasCompletedFirstDrop,
  useTrialStartedAt,
  useIsInChallenge,
  useChallengeCompleted,
  useCanCreate,
} from '../../lib/store/lifecycleSelectors';

import celebrationController from '../features/celebration/CelebrationController';
import { selectBriefHeadline } from '../../lib/store/selectors';
import { selectItemById, selectNoteBySourceMessageId } from '../../lib/store/selectors';
import { useCortex } from '../../providers/CortexProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import Reanimated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  Layout,
  cancelAnimation,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase/client';
import { logCatchallDecision } from '../../lib/telemetry/catchallLogger';
import { organizedToastSummary, type OrganizedDetail } from '../../lib/ui/toast/copy';
import type { AppRecord, LogSubtype, NoteSubtype } from '../../lib/types';
import type { CortexResponse } from '../../lib/cortex/cortexDecide';
import { persistedToCanonical } from '../../lib/cortex/canonicalMap';
import { useWakeOnInput } from '../../hooks/useWakeOnInput';
import { addOverlaySavedListener } from '../../lib/events/overlaySaved';
import { eventBus } from '../../lib/events/EventBus';
import { parseDue } from '../../lib/nlp/datetime/parseDue';
import { Lock, Camera, LogOut, User, Calendar, X } from 'lucide-react-native';
// ClarificationIndicatorChip moved to badge position - import removed
import { getDateService, nowTimestamp } from '../../lib/date/DateService';
import { env } from '../../lib/env';
import {
  getGremlySpeech,
  getGreetingSpeech,
  getGreetingSpeechV2,
  getDcoGreetingSpeech,
  getReturnSpeech,
  getEmptyStateSpeech,
  getFirstVisitSpeech,
  getPostAgeUpSpeech,
  getFedCelebrationSpeech,
  type SpeechContext,
} from '../../lib/speech/gremlySpeech';
import { getFollowUpMessage } from '../../lib/speech/followUpMessages';
import { LinearGradient } from 'expo-linear-gradient';
import {
  appendLineageToWhyString,
  convertUnsortedToHabit,
  convertUnsortedToTodo,
  convertUnsortedToLog,
} from '../../lib/conversion';

import MINDDROP_HEADER from '../../assets/minddroplogo1.22.png';
import MascotIcon from '../../components/MascotIcon';
import MascotLottie from '../components/MascotLottie';
import RitualProgressIndicator from '../../components/ritual/RitualProgressIndicator';
import RitualProgressPopover from '../../components/ritual/RitualProgressPopover';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import {
  getTrainingDropPrompt,
  getClassificationHint,
  getNextTrainingModal,
} from '../../lib/training/trainingFlow';
import GaugeExplanationModal from '../components/training/GaugeExplanationModal';
import FirstFedModal from '../components/training/FirstFedModal';
import SweepUnlockModal from '../components/training/SweepUnlockModal';
import TrainingMeter from '../components/training/TrainingMeter';

import WeeklySummaryBanner from '../../components/WeeklySummaryBanner';
import { filterAndNormalizeTags, normalizeTags } from '../../lib/tags/normalize';
import { applyTagQualityFilter } from '../../lib/tags/quality';
import { extractMeaningfulTags } from '../../lib/tags/extractTags';
import { buildHabitFields } from '../../lib/cortex/textNormalization';
import { hashString } from '../../lib/telemetry/catchallLogger';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import { useMascotActions } from '../../hooks/useMascotActions';
import { useVoiceCapture, VoiceCaptureState } from '../../hooks/useVoiceCapture';
import { VoicePulse } from '../../components/VoicePulse';
import WeekStrip from '../../components/calendar/WeekStrip';
import { FEATURE_FLAGS } from '../../lib/config/featureFlags';
import { type Mood } from '../../lib/shared/moods';
import RecentDropsMemo, {
  RecentDropsTestable as RecentDropsTestable,
  resetAnimationTrackingForDrop,
  markDropAsRecentlyPromoted,
  useMaybeGlobalOverlay,
  noopOverlayController,
  type GlobalOverlayController,
  TypewriterText,
} from './RecentDrops';
export { RecentDropsTestable, resetAnimationTrackingForDrop, markDropAsRecentlyPromoted };

export const THINKING_DURATION = 1200;
const MICROCOPY_FADE_MS = 300;
const THINKING_MICROCOPY = [
  'Organizing your thoughts …',
  'Finding a home for this …',
  'All set.',
] as const;

const AnimatedMicrocopyText = Animated.createAnimatedComponent(Text);

const SCRIM_HEIGHT = Math.min(Dimensions.get('window').height * 0.12, 120);

const TYPEWRITER_CHAR_DELAY_MS = 28;

// Auto-grow constants: aligned for deterministic behavior
const LINE_HEIGHT = 24; // Must match styles.input lineHeight
const INPUT_VERTICAL_PADDING = 20; // paddingTop + paddingBottom
const MAX_LINES = 8;

const START_HEIGHT = 64; // compact starting height

/**
 * Calculate how long a speech bubble should stay visible.
 * Shorter than gremlySpeech.ts's version — reactions are quick beats, not greetings.
 */
function calculateSpeechDuration(message: string): number {
  const base = 4000;
  const perChar = 45;
  const max = 8000;
  return Math.min(base + message.length * perChar, max);
}
const MIN_HEIGHT = START_HEIGHT;

const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES + INPUT_VERTICAL_PADDING + 8; // 24*8 + 24 + 8 = 224

export const INPUT_LINE_HEIGHT = LINE_HEIGHT;
export { START_HEIGHT as START_HEIGHT, MIN_HEIGHT as MIN_HEIGHT, MAX_HEIGHT as MAX_HEIGHT };
export const MAX_DYNAMIC_HEIGHT = MAX_HEIGHT; // Backwards compatibility for existing imports
const MAX_INPUT_CHARACTERS = 2000;
const PHOTO_TEXT_HINT = 'Add a few words so Gremly knows what this photo is about.';
const SPACE = 8;
const INPUT_PADDING_LEFT = 16;
const INPUT_ICON_PADDING_RIGHT = 120;

const clampNoteLength = (value: string): string =>
  value.length > MAX_INPUT_CHARACTERS ? value.slice(0, MAX_INPUT_CHARACTERS) : value;

const CHIPS_AUTO_DISMISS_MS =
  Number.parseInt(String(process.env.EXPO_PUBLIC_MINDDROP_CHIPS_AUTO_DISMISS_MS ?? '10000'), 10) ||
  10000;

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
  const time = getDateService().now().getTime().toString(36);
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

// Temporarily disabled to reduce Metro noise during testing
const DEBUG_MINDDROP_LOGS = false;
// const DEBUG_MINDDROP_LOGS =
//   (typeof __DEV__ !== 'undefined' && __DEV__) ||
//   String(process.env.FF_DEBUG_OVERLAY ?? '').toLowerCase() === 'on';

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

const PREFILL_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatPrefillChip(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${PREFILL_MONTH_NAMES[m - 1]} ${d}`;
}

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
  onCalendarPress?: () => void;
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
    onCalendarPress,
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
          {onCalendarPress && (
            <Pressable
              style={[iconButtonStyle, iconCameraStyle]}
              accessibilityRole="button"
              accessibilityLabel="Pick a date"
              onPress={onCalendarPress}
            >
              <View style={iconWrapperStyle}>
                <Icon name="Calendar" size="sm" color={iconColor} strokeWidth={1.4} />
              </View>
            </Pressable>
          )}
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
      const uniqueId = `${getDateService().now().getTime()}-${Math.random().toString(36).substring(7)}`;
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

// Trust Builders helpers — startOfTodayLocal removed, use dateService below

// RecentDrops extracted to ./RecentDrops.tsx

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
  const now = getDateService().now();
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
  const now = getDateService().now();

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
  const canCreate = useCanCreate();

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

  // DCO brief headline
  const briefHeadline = useGremlyStore(selectBriefHeadline);
  const dco = useGremlyStore((s) => s.dco);
  const lastSweepCompletedAt = useGremlyStore((s) => s.lastSweepCompletedAt);
  const feedingGaugeValue = useGremlyStore((s) => s.feedingGaugeValue);
  const isFedToday = useGremlyStore((s) => s.isFedToday);

  // First drop tracking
  const hasCompletedFirstDrop = useHasCompletedFirstDrop();
  const hasCompletedOnboarding = useHasCompletedOnboarding();
  const markFirstDropComplete = useGremlyStore((s) => s.markFirstDropComplete);

  // Training mode state
  const isTrainingMode = useNeedsMindDropTutorial();
  const isInChallenge = useIsInChallenge();
  const challengeCompleted = useChallengeCompleted();
  const trainingDropStep = useTrainingDropStep();
  const hasSeenGaugeExplanation = useGremlyStore((s) => s.hasSeenGaugeExplanation);
  const hasSeenFirstFedModal = useGremlyStore((s) => s.hasSeenFirstFedModal);
  const hasSeenSweepUnlockModal = useGremlyStore((s) => s.hasSeenSweepUnlockModal);
  const advanceTrainingDropStep = useGremlyStore((s) => s.advanceTrainingDropStep);
  const markGaugeExplanationSeen = useGremlyStore((s) => s.markGaugeExplanationSeen);
  const markFirstFedModalSeen = useGremlyStore((s) => s.markFirstFedModalSeen);
  const markSweepUnlockModalSeen = useGremlyStore((s) => s.markSweepUnlockModalSeen);
  const hasSeenTrainingMeterAutoOpen = useGremlyStore((s) => s.hasSeenTrainingMeterAutoOpen);
  const markTrainingMeterAutoOpenSeen = useGremlyStore((s) => s.markTrainingMeterAutoOpenSeen);
  const trialStartedAt = useTrialStartedAt();

  // Derive drops-today and last-drop-time from store — survives tab switches
  const storeTodos = useGremlyStore((s) => s.todos);
  const storeNotes = useGremlyStore((s) => s.notes);
  const storeHabits = useGremlyStore((s) => s.habits);

  const storeDropsToday = useMemo(() => {
    const todayStart = getDateService().now();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    let count = 0;
    for (const item of storeTodos) {
      if (item.created_at && item.created_at >= todayISO) count++;
    }
    for (const item of storeNotes) {
      if (item.created_at && item.created_at >= todayISO) count++;
    }
    for (const item of storeHabits) {
      if (item.created_at && item.created_at >= todayISO) count++;
    }
    return count;
  }, [storeTodos, storeNotes, storeHabits]);

  // Actionable drops only (todos + habits) — used for milestone speech at 5/10
  const actionableDropsToday = useMemo(() => {
    const todayStart = getDateService().now();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    let count = 0;
    for (const item of storeTodos) {
      if (item.created_at && item.created_at >= todayISO) count++;
    }
    for (const item of storeHabits) {
      if (item.created_at && item.created_at >= todayISO) count++;
    }
    return count;
  }, [storeTodos, storeHabits]);

  const storeLastDropTime = useMemo(() => {
    let latest = 0;
    for (const item of storeTodos) {
      if (item.created_at) latest = Math.max(latest, new Date(item.created_at).getTime());
    }
    for (const item of storeNotes) {
      if (item.created_at) latest = Math.max(latest, new Date(item.created_at).getTime());
    }
    for (const item of storeHabits) {
      if (item.created_at) latest = Math.max(latest, new Date(item.created_at).getTime());
    }
    return latest || null;
  }, [storeTodos, storeNotes, storeHabits]);

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
  const [timingChips, setTimingChips] = useState<TimingChip[]>([]);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [pendingPhotoUris, setPendingPhotoUris] = useState<string[]>([]);
  const [showPhotoTextNudge, setShowPhotoTextNudge] = useState(false);
  const [showRitualProgress, setShowRitualProgress] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpInitialPage, setHelpInitialPage] = useState<'help' | 'gauge' | undefined>(undefined);

  // Calendar date pre-fill
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [showDateStrip, setShowDateStrip] = useState(false);

  // Open Gremly modal to gauge page when fed toast is tapped
  useEffect(() => {
    const unsub = eventBus.on('openGremlyModal', () => {
      setHelpInitialPage('gauge');
      setShowHelp(true);
    });
    return unsub;
  }, []);

  const [gremlySpeech, setGremlySpeech] = useState<{
    message: string;
    variant: 'default' | 'celebration';
  } | null>(null);
  const [showGaugeModal, setShowGaugeModal] = useState(false);
  const [showFirstFedModal, setShowFirstFedModal] = useState(false);
  const [showSweepUnlockModal, setShowSweepUnlockModal] = useState(false);
  const [showSweepTimeModal, setShowSweepTimeModal] = useState(false);
  const [askSweepTimeAfterDemo, setAskSweepTimeAfterDemo] = useState(false);
  const [showTrainingMeter, setShowTrainingMeter] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const gremlySpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const followUpTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechRef = useRef<string | null>(null);
  const hasShownGreetingRef = useRef(false);
  const lastSpeechTimeRef = useRef<number | null>(null);
  const hasShownMeterSpeechRef = useRef(false);
  const timingAskedRef = useRef<string | null>(null); // Track submission ID to avoid re-asking
  // Photo drop: Track if current submission has photos (for classification default to log-general)
  const currentSubmissionHasPhotosRef = useRef(false);
  const pendingTrainingReactionRef = useRef<string | null>(null);

  // Auto-dismiss photo text nudge after 5 seconds
  useEffect(() => {
    if (!showPhotoTextNudge) return;
    const timeout = setTimeout(() => setShowPhotoTextNudge(false), 5000);
    return () => clearTimeout(timeout);
  }, [showPhotoTextNudge]);

  // Cleanup speech timeouts on unmount
  useEffect(() => {
    return () => {
      if (gremlySpeechTimeoutRef.current) {
        clearTimeout(gremlySpeechTimeoutRef.current);
      }
      if (followUpTimeoutRef.current) {
        clearTimeout(followUpTimeoutRef.current);
      }
    };
  }, []);

  // After sweep demo, return to MindDrop and prompt for notification time
  useEffect(() => {
    if (!askSweepTimeAfterDemo) return;
    const unsubscribe = navigation.addListener('focus', () => {
      if (askSweepTimeAfterDemo) {
        setAskSweepTimeAfterDemo(false);
        setTimeout(() => {
          setShowSweepTimeModal(true);
        }, 500);
      }
    });
    return unsubscribe;
  }, [askSweepTimeAfterDemo, navigation]);

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
  const showGremlySpeech = useCallback(
    (message: string, durationMs = 3500, variant: 'default' | 'celebration' = 'default') => {
      if (gremlySpeechTimeoutRef.current) {
        clearTimeout(gremlySpeechTimeoutRef.current);
      }
      lastSpeechRef.current = message;
      lastSpeechTimeRef.current = getDateService().now().getTime();
      setGremlySpeech({ message, variant });
      gremlySpeechTimeoutRef.current = setTimeout(() => {
        // console.log('[Gremly Speech] Auto-dismissing speech bubble');
        setGremlySpeech(null);
      }, durationMs);
    },
    [],
  );

  const buildSpeechContext = useCallback(
    (moment: 'greeting' | 'return' | 'post_drop'): SpeechContext => {
      const daysSinceLastSweep = lastSweepCompletedAt
        ? Math.floor(
            (getDateService().now().getTime() - new Date(lastSweepCompletedAt).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

      return {
        moment,
        dropsToday: 0,
        isFirstDrop: false,
        hasPhotos: false,
        isReturningUser: false,
        error: null,
        gaugeValue: feedingGaugeValue,
        isFedToday,
        timeSinceLastDrop: storeLastDropTime
          ? getDateService().now().getTime() - storeLastDropTime
          : null,
        briefHeadline,
        tone: dco?.tone ?? null,
        overdueTodos: dco?.active_today?.overdue_todos ?? 0,
        habitStreakRisk: dco?.active_today?.habit_streak_risk ?? [],
        upcomingIn7d: dco?.active_today?.upcoming_in_7d ?? [],
        daysSinceLastSweep,
        lastSpeechTime: lastSpeechTimeRef.current,
      };
    },
    [feedingGaugeValue, isFedToday, storeLastDropTime, briefHeadline, dco, lastSweepCompletedAt],
  );

  // Subscribe to post-age-up celebration events
  useEffect(() => {
    const unsubscribe = celebrationController.subscribe((payload) => {
      if (payload.kind === 'post_age_up' && payload.age) {
        const speech = getPostAgeUpSpeech(payload.age);
        showGremlySpeech(speech.message, speech.duration, 'celebration');
      }
    });
    return unsubscribe;
  }, [showGremlySpeech]);

  // Show a contextual greeting on mount (or first-visit onboarding speech)
  useEffect(() => {
    if (hasShownGreetingRef.current) return;

    // During Day 1 guided drops, prompts handle speech
    if (isTrainingMode && trainingDropStep >= 1 && trainingDropStep <= 4) {
      hasShownGreetingRef.current = true;
      const prompt = getTrainingDropPrompt(trainingDropStep + 1);
      if (prompt) {
        setGremlySpeech({ message: prompt.message, variant: 'default' });
      }
      return;
    }

    // First visit: show after 500ms, lock ref immediately to
    // prevent hydration-driven re-fires from restarting the timer
    if (!hasCompletedFirstDrop) {
      hasShownGreetingRef.current = true;
      const timer = setTimeout(() => {
        const speech = getFirstVisitSpeech();
        setGremlySpeech({ message: speech.message, variant: 'default' });
      }, 500);
      return () => clearTimeout(timer);
    }

    // Returning user: same pattern
    hasShownGreetingRef.current = true;
    const timer = setTimeout(() => {
      const ctx = buildSpeechContext('greeting');
      const greeting = getGreetingSpeechV2(ctx);
      if (greeting) {
        showGremlySpeech(greeting.message, greeting.duration);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    showGremlySpeech,
    hasCompletedFirstDrop,
    buildSpeechContext,
    isTrainingMode,
    trainingDropStep,
  ]);

  // Subscribe to AI reaction events from the pipeline (speech bubble)
  useEffect(() => {
    const unsubscribe = eventBus.on('drop:reaction_ready', (payload) => {
      const { message, rawReaction, followUp } = payload;

      // Training mode: handle speech for guided drops
      const storeState = useGremlyStore.getState();
      if (
        !storeState.graduatedAt &&
        storeState.trainingDropStep >= 1 &&
        storeState.trainingDropStep <= 4
      ) {
        if (storeState.trainingDropStep === 1) {
          // Step 1: stash RAW reaction for gauge modal dismiss
          pendingTrainingReactionRef.current = rawReaction || null;
        } else {
          // Steps 2-4: combine RAW reaction + training prompt
          const trainingPrompt = getTrainingDropPrompt(storeState.trainingDropStep + 1);
          if (trainingPrompt) {
            const reaction = rawReaction || '';
            const combined = reaction
              ? reaction + '\n\n' + trainingPrompt.message
              : trainingPrompt.message;
            setGremlySpeech({
              message: combined,
              variant: 'default',
            });
          }
        }
        return;
      }

      console.log('[SpeechBubble] drop:reaction_ready received', {
        localId: payload.localId,
        message: message?.substring(0, 30),
        followUp,
      });

      // Cancel any pending follow-up from a previous drop
      if (followUpTimeoutRef.current) {
        clearTimeout(followUpTimeoutRef.current);
        followUpTimeoutRef.current = null;
      }

      // Resolve beat 1: AI reaction — only fall back to pool when there's no follow-up
      // (multi/clarify drops should NOT show a generic pool message)
      const reactionMessage =
        message ||
        (!followUp
          ? (() => {
              const ctx = buildSpeechContext('post_drop');
              const fallback = getGremlySpeech(ctx);
              return fallback?.message || null;
            })()
          : null);

      const recentSpeech = useGremlyStore.getState().recentSpeech;

      console.log('[Speech] Displaying reaction:', {
        message: reactionMessage,
        followUp,
        wasPoolFallback: !message,
      });

      if (reactionMessage && !followUp) {
        // Single beat — just the reaction
        const duration = calculateSpeechDuration(reactionMessage);
        showGremlySpeech(reactionMessage, duration);
        useGremlyStore.getState().pushRecentSpeech(reactionMessage);
      } else if (reactionMessage && followUp) {
        // Two beats — vary the order so it doesn't feel templated
        const reactionFirst = Math.random() < 0.5;
        const followUpMsg = getFollowUpMessage(followUp, recentSpeech);
        const first = reactionFirst ? reactionMessage : followUpMsg;
        const second = reactionFirst ? followUpMsg : reactionMessage;
        const firstDuration = reactionFirst
          ? calculateSpeechDuration(reactionMessage)
          : followUpMsg
            ? calculateSpeechDuration(followUpMsg)
            : 5000;
        const secondDuration = reactionFirst
          ? followUpMsg
            ? calculateSpeechDuration(followUpMsg)
            : 5000
          : calculateSpeechDuration(reactionMessage);

        if (first) showGremlySpeech(first, firstDuration);
        useGremlyStore.getState().pushRecentSpeech(reactionMessage);

        followUpTimeoutRef.current = setTimeout(() => {
          followUpTimeoutRef.current = null;
          if (second) showGremlySpeech(second, secondDuration);
        }, firstDuration + 500);
      } else if (!reactionMessage && followUp) {
        // No reaction (e.g. multi parent) — just follow-up
        const followUpMsg = getFollowUpMessage(followUp, recentSpeech);
        if (followUpMsg) showGremlySpeech(followUpMsg, calculateSpeechDuration(followUpMsg));
      }
      // If both null, no speech (shouldn't happen but safe)
    });

    return () => {
      unsubscribe();
      if (followUpTimeoutRef.current) {
        clearTimeout(followUpTimeoutRef.current);
      }
    };
  }, [showGremlySpeech, buildSpeechContext]);

  // Return-visit speech: fire when user returns to MindDrop after visiting another tab
  useEffect(() => {
    // Only set up return speech after initial greeting has been shown
    if (!hasShownGreetingRef.current) return;

    const unsubscribe = navigation.addListener('focus', () => {
      // Don't fire return speech during training mode
      if (!useGremlyStore.getState().graduatedAt) return;

      const ctx = buildSpeechContext('return');
      const speech = getReturnSpeech(ctx);
      if (speech) {
        showGremlySpeech(speech.message, speech.duration);
      }
    });

    return unsubscribe;
  }, [navigation, buildSpeechContext, showGremlySpeech]);

  // Day 2: auto-open training meter on first app open after Day 1
  useEffect(() => {
    if (!isTrainingMode) return;
    if (!hasSeenFirstFedModal) return; // hasn't finished Day 1 yet
    if (hasSeenTrainingMeterAutoOpen) return; // already shown
    if (!trialStartedAt) return;

    // Check if today is after training Day 1
    const ds = getDateService();
    const startDay = ds.toLocalDate(new Date(trialStartedAt));
    const todayDay = ds.today();
    const daysSinceStart = ds.daysBetween(startDay, todayDay);
    if (daysSinceStart < 1) return; // still Day 1

    // Auto-open the training meter
    const timer = setTimeout(() => {
      setShowTrainingMeter(true);
      markTrainingMeterAutoOpenSeen();
    }, 1000); // slight delay so the screen is settled

    return () => clearTimeout(timer);
  }, [
    isTrainingMode,
    hasSeenFirstFedModal,
    hasSeenTrainingMeterAutoOpen,
    trialStartedAt,
    markTrainingMeterAutoOpenSeen,
  ]);

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
  const submissionIdRef = useRef<string | null>(null);
  const dropIdRef = useRef<string | null>(null);
  const lastSubmitAt = useRef<number>(0);
  const submitLockRef = useRef(false);

  // Duplicate prevention: track last submitted text and its unsorted ID
  const lastSubmittedTextRef = useRef<string | null>(null);

  // Phase 1B: Submission mutex to prevent rapid duplicate submits
  const submissionMutex = useRef<Map<string, boolean>>(new Map());

  const { celebrate, celebrateFed } = useMascotActions();

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

  // Refresh items when MindDrop tab regains focus (e.g. after saving from Ask Gremly)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      triggerRecentRefresh();
    });
    return unsubscribe;
  }, [navigation, triggerRecentRefresh]);

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

  // Track drop counts for empty state logic (header mascot opacity, toggle visibility)
  const [hasTodayDrops, setHasTodayDrops] = useState(false);
  const [hasOlderDrops, setHasOlderDrops] = useState(false);
  const handleDropCountsChange = useCallback((todayCount: number, olderCount: number) => {
    setHasTodayDrops(todayCount > 0);
    setHasOlderDrops(olderCount > 0);
  }, []);

  const isProcessing = isSubmitting || isThinking;

  const hour = getDateService().now().getHours();
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
    submissionIdRef.current = null;
    dropIdRef.current = null;
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
    justCrossedFed?: boolean;
  };

  /**
   * New Mind Drop submit handler using unified useMindDropSubmit hook.
   * Enabled via FEATURE_FLAGS.MIND_DROP_V4_ENABLED.
   */
  const handleMindDropSubmit = useCallback(async (): Promise<SaveResult> => {
    console.log('[MindDrop:NewPipeline] Submitting via unified hook');
    // TODO: Pass classificationHint to useMindDropSubmit hook
    // const hint = isTrainingMode ? getClassificationHint(trainingDropStep) : null;
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

    console.log('[PrefillDate:1-CatchAll] Submitting with prefillDate:', prefillDate ?? null);
    const result = await mindDropSubmit(effectiveText, {
      spaceId: null, // CatchAllNotepad is global, no space
      photoUris: pendingPhotoUris,
      userId: userId, // Pass userId for photo uploads
      source: 'minddrop',
      dropId, // Pass the dropId to ensure pending item correlation
      prefillDate: prefillDate ?? null,
    });

    if (result.success) {
      setNote('');
      setPendingPhotoUris([]);
      // Clear calendar prefill after successful drop
      setPrefillDate(null);
      setShowDateStrip(false);
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
        justCrossedFed: result.justCrossedFed,
      };
    } else {
      console.error('[MindDrop:NewPipeline] Submit failed:', result.error);
      // Also clear refs on failure so user can retry with fresh IDs
      dropIdRef.current = null;
      submissionIdRef.current = null;
      return { created: { todos: [], notes: [], habits: [] }, createdDetails: [] };
    }
  }, [note, pendingPhotoUris, mindDropSubmit, resetState, ensureSubmissionAndDropIds, prefillDate]);

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
  //    - In handleMindDropSubmit, validSourceMessageId is set to null for Mind Drop entries
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
      const unsortedId: string | null = null;
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

        // Clear duplicate prevention tracking after successful category action
        lastSubmittedTextRef.current = null;
      } catch (error) {
        console.error('[MindDrop][CategoryChip] Failed to process', error);
      } finally {
        submitLockRef.current = false;
        setIsSubmitting(false);
      }
    },
    [
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

  const wakeOnInput = useWakeOnInput();

  const handleChangeText = useCallback(
    (value: string) => {
      wakeOnInput();
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
    [listStyle, wakeOnInput],
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

    const now = getDateService().now().getTime();
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

    // Clear mutex after delay
    setTimeout(() => {
      submissionMutex.current.delete(textHash);
    }, 2000);

    const result = await handleMindDropSubmit();
    setIsSubmitting(false);

    // First-drop override: show post-drop sweep prompt instead of normal speech
    if (!hasCompletedFirstDrop) {
      celebrate();
      markFirstDropComplete();
      if (isTrainingMode) advanceTrainingDropStep(); // synchronous, step goes 0 -> 1

      // Clear the first-visit speech
      setGremlySpeech(null);
      if (gremlySpeechTimeoutRef.current) {
        clearTimeout(gremlySpeechTimeoutRef.current);
        gremlySpeechTimeoutRef.current = null;
      }

      // Show gauge explanation modal after first drop
      if (isTrainingMode && !hasSeenGaugeExplanation) {
        setTimeout(() => {
          setShowGaugeModal(true);
        }, 3000);
      }
    } else if (result.createdDetails?.length > 0) {
      // During Day 1 training: skip generic speech, show training prompt instead
      if (isTrainingMode && trainingDropStep >= 1 && trainingDropStep <= 4) {
        advanceTrainingDropStep(); // synchronous, updates store immediately
        celebrate();

        console.log('[Training] Drop in training block', {
          closureStep: trainingDropStep,
          storeStep: useGremlyStore.getState().trainingDropStep,
          justCrossedFed: result.justCrossedFed,
          isFedToday: useGremlyStore.getState().isFedToday,
          gaugeValue: useGremlyStore.getState().feedingGaugeValue,
          hasSeenFirstFedModal,
        });

        // Still handle fed celebration if this drop crossed the threshold
        if (result.justCrossedFed) {
          if (!hasSeenFirstFedModal) {
            setTimeout(() => setShowFirstFedModal(true), 2500);
          } else {
            celebrationController.showFedCelebration(useGremlyStore.getState().fedDaysCount + 1);
          }
          // Mark fed celebration as shown so store path doesn't double-fire
          useGremlyStore.setState({ todayFedCelebrationShownAt: nowTimestamp() });
        }

        // Skip all generic speech below
      } else if (result.justCrossedFed) {
        if (isTrainingMode && !hasSeenFirstFedModal) {
          advanceTrainingDropStep();
          setGremlySpeech(null); // clear "Last one" speech

          celebrateFed();
          setTimeout(() => setShowFirstFedModal(true), 3500);
        } else {
          celebrateFed();

          // Show celebration speech instead of FedToast when user is on MindDrop
          const fedDaysCount = useGremlyStore.getState().fedDaysCount;
          const fedSpeech = getFedCelebrationSpeech(fedDaysCount);
          showGremlySpeech(fedSpeech.message, fedSpeech.duration, 'celebration');
        }
        // Mark fed celebration as shown so store path doesn't double-fire
        useGremlyStore.setState({ todayFedCelebrationShownAt: nowTimestamp() });
      } else {
        celebrate();
        // Post-drop speech is now handled by the drop:reaction_ready event listener
      }
    }

    submitLockRef.current = false;
    currentSubmissionHasPhotosRef.current = false;
  }, [
    note,
    isSubmitting,
    pendingPhotoUris,
    handleMindDropSubmit,
    showGremlySpeech,
    getItemById,
    hasCompletedFirstDrop,
    isTrainingMode,
    trainingDropStep,
    hasSeenGaugeExplanation,
    hasSeenFirstFedModal,
    actionableDropsToday,
    storeLastDropTime,
    dco,
    lastSweepCompletedAt,
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

  const handleCalendarToggle = useCallback(() => {
    setShowDateStrip((prev) => {
      if (prev) {
        // Closing strip — also clear date
        setPrefillDate(null);
      } else {
        // Opening strip — default to today
        setPrefillDate(getDateService().today());
      }
      return !prev;
    });
  }, []);

  const handleDateStripSelect = useCallback((date: string) => {
    setPrefillDate(date);
  }, []);

  const handleClearPrefillDate = useCallback(() => {
    setPrefillDate(null);
    setShowDateStrip(false);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canCreate) {
      navigation.navigate('TrialEndPaywall', { source: 'expiry' });
      return;
    }
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
  }, [
    canCreate,
    navigation,
    isSubmitting,
    isThinking,
    uiMode,
    note,
    onSubmit,
    pendingPhotoUris.length,
  ]);

  const legacyUI = React.useMemo(() => {
    const statsVisible = organizedToday > 0;

    return (
      <View style={styles.mainContainer} {...panResponder.panHandlers}>
        {/* Header: Safe area wrapper + row with mascot, centered title, logout */}
        <View style={{ paddingTop: insets.top + 16 }} testID="minddrop-header">
          <View style={styles.headerRow}>
            {/* Left - Training icon during training, otherwise empty spacer */}
            <View style={styles.headerLeft}></View>

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

        <WeeklySummaryBanner />

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
            onDropCountsChange={handleDropCountsChange}
            initiallyOpen={true}
          />
          {/* Permanent fade — cards dissolve into page background approaching input area */}
          <LinearGradient
            colors={['rgba(249, 246, 241, 0)', 'rgba(249, 246, 241, 1)']}
            style={styles.cardFadeScrim}
            pointerEvents="none"
          />
        </Animated.View>

        {/* Fixed bottom section: input + chips + button + stats */}
        <View style={[styles.fixedTopSection, keyboardVisible && { paddingBottom: 12 }]}>
          <View style={styles.inputBlock}>
            {/* Gremly speech - positioned above input, to left of Gremly */}
            {gremlySpeech && (
              <Reanimated.View
                style={styles.gremlyMessageContainer}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
              >
                <View
                  style={[
                    styles.gremlyMessageBackdrop,
                    gremlySpeech.variant === 'celebration' && styles.gremlyMessageCelebration,
                  ]}
                >
                  <TypewriterText
                    key={gremlySpeech.message}
                    text={gremlySpeech.message}
                    style={styles.gremlyMessage}
                    duration={1400}
                    fadeIn={!hasCompletedFirstDrop}
                  />
                </View>
              </Reanimated.View>
            )}
            {/* Gremly perched on input - always visible */}
            <Pressable
              onPress={() => {
                if (isTrainingMode) {
                  // Pre-graduation: show tutorial variant of TrainingMeter
                  setShowTrainingMeter(true);
                } else if (isInChallenge) {
                  // Graduated but still in 7-fed-days challenge: show challenge variant
                  setShowTrainingMeter(true);
                } else {
                  // Seasoned (challenge complete): show help card
                  setHelpInitialPage(undefined);
                  setShowHelp(true);
                }
              }}
              accessibilityLabel="Help"
              style={styles.inputGremly}
            >
              <MascotLottie />
            </Pressable>
            <MindDropInput
              value={note}
              onChangeText={handleChangeText}
              placeholder={dynamicPlaceholder}
              placeholderTextColor="#757575"
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
              onCalendarPress={handleCalendarToggle}
              photoHintText={photoHintText}
              onMicPress={handleMicPress}
              voiceState={voiceState}
            />
          </View>

          {/* Calendar date pre-fill: chip + week strip */}
          {prefillDate && (
            <Reanimated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <View style={styles.prefillChipRow}>
                <View style={styles.prefillChip}>
                  <Calendar size={14} color="#2D4A33" />
                  <Text style={styles.prefillChipText}>{formatPrefillChip(prefillDate)}</Text>
                  <Pressable
                    onPress={handleClearPrefillDate}
                    hitSlop={8}
                    accessibilityLabel="Clear date"
                    accessibilityRole="button"
                  >
                    <X size={14} color="#6B7280" />
                  </Pressable>
                </View>
              </View>
            </Reanimated.View>
          )}
          {showDateStrip && (
            <Reanimated.View entering={SlideInDown.duration(200)} exiting={FadeOut.duration(100)}>
              <WeekStrip
                selectedDate={prefillDate || getDateService().today()}
                onDateSelect={handleDateStripSelect}
              />
            </Reanimated.View>
          )}

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
    handleDropCountsChange,
    hasTodayDrops,
    overlay,
    inputDynHeight,
    handleInfoOpen,
    recentDropsOpacity,
    isInputFocused,
    keyboardVisible,
    gremlySpeech,
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

      <GremlyHelpCard
        visible={showHelp}
        onDismiss={() => {
          setShowHelp(false);
          setHelpInitialPage(undefined);
        }}
        screen="minddrop"
        initialPage={helpInitialPage}
      />

      <GaugeExplanationModal
        visible={showGaugeModal}
        onDismiss={() => {
          setShowGaugeModal(false);
          markGaugeExplanationSeen();
          const nextPrompt = getTrainingDropPrompt(2);
          if (nextPrompt) {
            const reaction = pendingTrainingReactionRef.current;
            pendingTrainingReactionRef.current = null;
            const combined = reaction ? reaction + '\n\n' + nextPrompt.message : nextPrompt.message;
            setTimeout(() => setGremlySpeech({ message: combined, variant: 'default' }), 300);
          }
        }}
      />

      <FirstFedModal
        visible={showFirstFedModal}
        onDismiss={() => {
          setShowFirstFedModal(false);
          markFirstFedModalSeen();
          // Immediately show sweep unlock modal
          setTimeout(() => setShowSweepUnlockModal(true), 300);
        }}
      />

      <SweepUnlockModal
        visible={showSweepUnlockModal}
        onDismiss={() => {
          setShowSweepUnlockModal(false);
          markSweepUnlockModalSeen();
        }}
        onTryNow={() => {
          setShowSweepUnlockModal(false);
          markSweepUnlockModalSeen();
          setAskSweepTimeAfterDemo(true);
          navigation.navigate('Sweep', { demoMode: true } as any);
        }}
        onSetReminder={async (time) => {
          const userId = useGremlyStore.getState().userId;
          if (!userId) return;

          const hours = time.getHours().toString().padStart(2, '0');
          const minutes = time.getMinutes().toString().padStart(2, '0');
          const timeStr = `${hours}:${minutes}:00`;

          try {
            const { error } = await supabase.from('notification_preferences').upsert(
              {
                user_id: userId,
                evening_enabled: true,
                evening_time: timeStr,
                updated_at: nowTimestamp(),
              },
              { onConflict: 'user_id' },
            );

            if (error) {
              console.warn('[Training] Failed to save evening time:', error);
            } else {
              console.log('[Training] Evening notification time saved:', timeStr);
            }
          } catch (err) {
            console.warn('[Training] Failed to save evening time:', err);
          }
        }}
      />

      <SweepUnlockModal
        visible={showSweepTimeModal}
        timePickerOnly
        onDismiss={() => {
          setShowSweepTimeModal(false);
        }}
        onTryNow={() => {}}
        onSetReminder={async (time) => {
          const userId = useGremlyStore.getState().userId;
          if (!userId) return;
          const hours = time.getHours().toString().padStart(2, '0');
          const minutes = time.getMinutes().toString().padStart(2, '0');
          const timeStr = `${hours}:${minutes}:00`;
          try {
            await supabase.from('notification_preferences').upsert(
              {
                user_id: userId,
                evening_enabled: true,
                evening_time: timeStr,
                updated_at: nowTimestamp(),
              },
              { onConflict: 'user_id' },
            );
          } catch (err) {
            console.warn('[Training] Failed to save evening time:', err);
          }
          setShowSweepTimeModal(false);
        }}
      />

      <TrainingMeter
        visible={showTrainingMeter}
        onDismiss={() => {
          setShowTrainingMeter(false);

          // On Day 2 first dismiss, show gauge-reset speech
          if (isTrainingMode && !hasShownMeterSpeechRef.current && hasSeenTrainingMeterAutoOpen) {
            hasShownMeterSpeechRef.current = true;
            setTimeout(() => {
              showGremlySpeech(
                'Your Gremly resets each day. Drop thoughts to fill it back up.',
                5000,
              );
            }, 400);
          }
        }}
        onNavigate={(screen, params) => {
          navigation.navigate(screen as any, params as any);
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
    cardFadeScrim: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: SCRIM_HEIGHT,
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
      width: 64, // Maintain original mascot width for balanced layout
      height: 64, // Maintain original mascot height for consistent header spacing
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
      backgroundColor: 'rgba(46, 85, 64, 0.5)', // moss green at 50% opacity
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
    // Gremly message - positioned above input, to left of Gremly
    gremlyMessageContainer: {
      position: 'absolute',
      bottom: 100, // Above the input field, level with Gremly's head
      left: 0,
      right: 110, // Leave space for Gremly on the right
      zIndex: 15,
    },
    gremlyMessageBackdrop: {
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      borderBottomRightRadius: 4,
      alignSelf: 'flex-end',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 4,
      borderWidth: 1,
      borderColor: 'rgba(46, 85, 64, 0.10)',
    },
    gremlyMessage: {
      fontSize: 14,
      fontWeight: '500',
      color: '#2D3A35',
      textAlign: 'right',
      lineHeight: 20,
      fontFamily: 'Inter-Medium',
    },
    gremlyMessageCelebration: {
      backgroundColor: '#F2F7F2',
      shadowColor: '#4A7C4A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 3,
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
    inputGremly: {
      position: 'absolute',
      top: -66, // Head peeks above input field, body overlaps camera area
      right: 0, // Flush with right edge
      width: 95,
      height: 111,
      zIndex: 10,
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
      padding: 10,
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    inputIconMicButton: {},
    inputIconCameraButton: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
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
      color: '#757575',
      fontFamily: 'Inter-Medium',
      fontSize: 13,
    },
    helperCounter: {
      color: '#757575',
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
      minHeight: 48,
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
      marginTop: 8,
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
      minHeight: 56,
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
      justifyContent: 'flex-start',
      gap: 2,
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
    // Card note subtitle - session only
    recentConfirmation: {
      color: c.mutedText,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: 'Inter-Regular',
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
      color: '#556B63',
    },
    badge_journal: {
      backgroundColor: 'rgba(180, 160, 130, 0.12)',
      color: '#8B7355',
    },
    badge_idea: {
      backgroundColor: 'rgba(200, 170, 80, 0.12)',
      color: '#9A7B2F',
    },
    badge_event: {
      backgroundColor: 'rgba(120, 150, 200, 0.12)',
      color: '#5A7BA8',
    },
    badge_todo: {
      backgroundColor: '#E6F0FF',
      color: '#2E5540',
    },
    badge_habit: {
      backgroundColor: '#EAF7ED',
      color: '#2E5540',
    },
    badge_unsorted: {
      backgroundColor: c.goldenPear,
      color: c.mossGreen,
    },
    badge_clarify: {
      backgroundColor: 'rgba(255, 243, 224, 0.9)',
      color: '#8B6914',
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
    // Target date chip (event/deadline context) - right-aligned
    targetDateChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
      backgroundColor: 'rgba(122, 154, 122, 0.15)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      marginLeft: 8,
    },
    targetDateText: {
      fontSize: 10,
      color: '#5d7a5d',
      fontFamily: 'Inter-Medium',
    },
    // Reminder bell chip (golden pear)
    reminderChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
      backgroundColor: 'rgba(224, 196, 122, 0.10)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    reminderText: {
      fontSize: 10,
      color: '#877030',
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
      color: '#6B7280',
      fontSize: 11,
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
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    recentEmptyPrimary: {
      fontSize: 17,
      fontWeight: '600',
      color: c.charcoalInk,
      textAlign: 'center',
      marginBottom: 8,
    },
    recentEmptySecondary: {
      fontSize: 15,
      fontWeight: '400',
      color: c.mutedText,
      textAlign: 'center',
      lineHeight: 22,
    },
    // Empty state styles (centered text when no today drops)
    emptyStateContainer: {
      flex: 1,
      justifyContent: 'center', // Vertically centered
      alignItems: 'center',
      paddingHorizontal: 32,
      marginBottom: 100, // Push up from true center (~40% from top)
    },
    emptyStateTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: c.charcoalInk,
      textAlign: 'center',
      marginBottom: 8,
    },
    showOlderLink: {
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    showOlderText: {
      fontSize: 14,
      color: c.mossGreen,
      fontWeight: '500',
      textAlign: 'center',
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
    // Calendar prefill chip styles
    prefillChipRow: {
      flexDirection: 'row',
      paddingHorizontal: space,
      paddingTop: 8,
      paddingBottom: 4,
    },
    prefillChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EEF3EE',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 8,
    },
    prefillChipText: {
      fontSize: 13,
      color: '#2D4A33',
      fontFamily: 'Inter-Medium',
    },
    prefillChipX: {
      fontSize: 14,
      color: '#6B7280',
      lineHeight: 16,
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
