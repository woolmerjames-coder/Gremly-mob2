/**
 * UnifiedOverlayV2 — Entity create/edit/view overlay
 *
 * Architecture:
 * - State: useOverlayDraft (Zustand + immer) — single source of truth
 * - Save: buildSavePayload (overlaySave.ts) → Zustand mutations → Supabase
 * - Hydration: hydrateEntityToDraft (overlayHydration.ts) — one-shot on open
 *
 * Extracted modules:
 * - useOverlayDraft.ts: Draft store (Zustand + immer)
 * - overlayHydration.ts: Entity → draft mapping
 * - overlaySave.ts: Draft → save payload mapping
 * - overlayStyles.ts: StyleSheet definitions
 * - ExpandableRow.tsx: Inline-expandable metadata rows
 * - TypePicker.tsx: Type pill + dropdown (6 entity types)
 * - HabitModeToggle.tsx: Build/Break segmented control
 * - ToggleSwitch.tsx: iOS-style toggle
 * - PhotoStrip.tsx: Photo thumbnails + add button
 * - OverlayExpandedEditor.tsx: Full-screen text editor
 * - SetRemindersModal.tsx: Reminder management
 *
 * Refactor complete: 2026-04-10
 * Before: 11,234 lines, 65 useStates, 35 useEffects, 4 state layers
 * After:   6,083 lines,  7 useStates, 14 useEffects, 1 state layer
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  UIManager,
  useColorScheme,
  View,
  Animated as RNAnimated,
  Easing,
  Alert,
  Image,
  ActionSheetIOS,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import {
  Plus,
  Minus,
  Calendar,
  Lock,
  Bell,
  ChevronRight,
  Trash2,
  Camera,
  Diamond,
  Maximize2,
  Star,
  FileText,
  BarChart3,
  X,
  FolderOpen,
  MessageCircle,
  CalendarDays,
  Link2,
  Heart,
  Zap,
  RotateCcw,
  Shield,
  Pencil,
  Clock,
} from 'lucide-react-native';
import { useReducedMotion, conditionalAnimation, timingConfig } from '../../design/animations';
import { Box, Text, Button } from '../../ui';
import { renderFormattedContent } from '../../lib/markdown/renderFormattedContent';
import { stripMarkdown } from '../../lib/markdown/stripMarkdown';
import * as Haptics from 'expo-haptics';
import { Modal } from 'react-native';
import {
  format,
  parseISO,
  addDays,
  setHours,
  isSameDay,
  differenceInDays,
} from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { getDateService, getTodayDayString } from '../../lib/date';
import {
  lightTokens,
  darkTokens,
  spacing as tokenSpacing,
} from '../../design/tokens';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { selectItemById, useActiveSpaces, useSpaceHasEvents } from '../../lib/store/selectors';
import { useAuth } from '../../providers/AuthProvider';
import ScopeSelector from '../ScopeSelector';
import { usePhase8LinksState } from './hooks/usePhase8LinksState';
import { PeopleLinker } from './fields/PeopleLinker';
import PersonPicker from './fields/PersonPicker';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';
import { styles } from './overlayStyles';
import {
  initialV2State,
  type BaseType,
  type TagKey,
} from './overlayV2.state';
import {
  normalizeToTagKey,
  extractTagKeysFromEntity,
  TYPE_FAMILY,
  SCHEDULE_PRESETS,
  type TypeFamily,
  hydrateEntityToDraft,
} from './overlayHydration';
import { useOverlayDraft, selectDraft, selectUI } from './useOverlayDraft';
import ToastUndo from './ToastUndo';
import { OverlayExpandedEditor } from './OverlayExpandedEditor';
import {
  linkSelectedPerson,
} from './overlayV2.mapping';

import { eventBus } from '../../lib/events/EventBus';
import { TagsRow, type TagsRowTag } from './fields/TagsRow';
import { normalizeTag } from '../../lib/tags/normalize';

import {
  ALL_MOODS,
  MOOD_CONFIG,
  type Mood,
} from '../../lib/shared/moods';
import { emitOverlayEvent } from '../../lib/telemetry/overlay';
import { getMindDropRawText } from './getMindDropRawText';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import SetRemindersModal from './SetRemindersModal';
import type { ItemReminder } from '../../lib/types';
import {
  scheduleItemReminder,
  cancelAllItemReminders,
} from '../../lib/notifications/itemReminderService';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { enrichListItems } from '../../lib/ai/enrichListItem';
import {
  jsonToFrequency,
  getFrequencyLabel,
} from './frequencyHelpers';
import {
  buildSavePayload,
  detectListFromText,
  type SaveContext,
} from './overlaySave';

// Make Actionable feature
import { ChecklistView } from './ChecklistView';

// Habit View Mode
import HabitViewMode from './HabitViewMode';

// Entity Chat
import { EntityChatButton, EntityChatScreen, EntityNotesModal } from '../chat';
import { ChecklistProgress } from './ChecklistProgress';

// Linked Items for Events
import LinkedItemsSection from './LinkedItemsSection';
import LinkedEventPicker from './LinkedEventPicker';
import { TodoPreviewModal } from './TodoPreviewModal';
import { env } from '../../lib/env';
import { ClarificationPopup } from '../minddrop/ClarificationPopup';
import {
  hasActionableList,
  type ExtractedListItem,
  type ListItem,
} from '../../lib/lists';
import { TypePill, TypePickerDropdown, deriveEntityType, getTypeConfig } from './TypePicker';
import { HabitModeToggle, habitSubtypeToMode, habitModeToSubtype } from './HabitModeToggle';
import { PhotoStrip } from './PhotoStrip';
import { ExpandableRow, StaticRow } from './ExpandableRow';
import { ToggleSwitch } from './ToggleSwitch';

const BASE_LABEL: Record<BaseType, string> = { log: 'Note', todo: 'To-Do', habit: 'Habit' };

// Preset time options for time picker
const PRESET_TIMES = [
  { label: '9:00 AM', hour: 9, minute: 0, key: '9:00-AM' },
  { label: '12:00 PM', hour: 12, minute: 0, key: '12:00-PM' },
  { label: '3:00 PM', hour: 15, minute: 0, key: '3:00-PM' },
  { label: '6:00 PM', hour: 18, minute: 0, key: '6:00-PM' },
  { label: '9:00 PM', hour: 21, minute: 0, key: '9:00-PM' },
] as const;

// Time estimate options for todos - quick select grid
const TIME_ESTIMATE_QUICK_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90] as const;

// Stepper constraints for time estimates
const TIME_ESTIMATE_MIN = 5;
const TIME_ESTIMATE_MAX = 240;
const TIME_ESTIMATE_STEP = 5;

// Utility function for consistent time formatting
function formatTimeEstimate(minutes: number | null | undefined): string {
  if (!minutes) return '';

  if (minutes < 60) {
    return `${minutes} min`;
  } else if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
}

// Time window options for todos and habits (preferred time of day)
const TIME_WINDOW_OPTIONS: {
  label: string;
  value: 'any' | 'morning' | 'day' | 'evening' | null;
}[] = [
  { label: 'Any time', value: null },
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'day' }, // Display "Afternoon", store as 'day'
  { label: 'Evening', value: 'evening' },
];

// Duration stepper steps (minutes)
const DURATION_STEPS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const;
const QUICK_DURATIONS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
];

// Build frequency_json from count/unit/days for inline schedule editing
function buildFreqJson(count: number, unit: 'day' | 'week' | 'month', days: number[]) {
  if (unit === 'week' && days.length > 0) return { type: 'days', days };
  if (count === 1) {
    const simpleMap: Record<string, string> = { day: 'daily', week: 'weekly', month: 'monthly' };
    return { type: 'simple', value: simpleMap[unit] };
  }
  return { type: 'custom', value: { count, unit } };
}

// Multi-photo support for logs (Phase L5)

type LogPhoto = {
  id?: string; // existing DB row id (for edit mode)
  url: string; // public URL or storage path (or local file URI for new photos)
  position: number; // 0-based ordering
  isNew?: boolean; // not yet persisted to backend
  isDeleted?: boolean; // marked for deletion on save
};

// Helper: format ItemReminder[] for summary display in detail rows
function formatItemReminderSummary(reminders: ItemReminder[]): string {
  if (!reminders || reminders.length === 0) return 'Off';
  if (reminders.length === 1) {
    const r = reminders[0];
    const [h, m] = r.time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const timeStr = `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
    if (r.frequency === 'daily') return `Daily ${timeStr}`;
    return timeStr;
  }
  return `${reminders.length} reminders`;
}

function toCanonicalParts(value: string | null | undefined): { canonical: string; slug: string } {
  if (!value) return { canonical: '', slug: '' };
  let trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return { canonical: '', slug: '' };
  if (!/^[#@*]/.test(trimmed)) {
    trimmed = `#${trimmed}`;
  }
  const slug = trimmed.replace(/^[#@*]+/, '');
  return { canonical: trimmed, slug };
}

/**
 * Common emotion tags that should be prioritized for journal/log entries.
 * Synced with lib/tags/extractTags.ts ALLOWED_EMOTIONS for consistency.
 * Extended with variations (e.g., anxiety/anxious, stress/stressed) for matching.
 */
const EMOTION_TAGS = new Set([
  'anxious',
  'anxiety',
  'overwhelmed',
  'stressed',
  'stress',
  'sad',
  'sadness',
  'angry',
  'anger',
  'excited',
  'excitement',
  'nervous',
  'calm',
  'peaceful',
  'grateful',
  'gratitude',
  'tired',
  'exhausted',
]);

/**
 * Check if a tag represents an emotion.
 */
function isEmotionTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return EMOTION_TAGS.has(normalized);
}

/**
 * Merge AI tags into existing log/journal tags, prioritizing emotion tags.
 *
 * For Mind Drop → log conversions, we want to:
 * 1. Always preserve *journal marker
 * 2. Keep all emotion tags (anxious, overwhelmed, stressed, etc.)
 * 3. Add 1-2 context tags from AI suggestions (meeting, walk, etc.)
 * 4. Keep the tag list short but meaningful
 *
 * Example:
 * Existing: ['*journal', 'anxious', 'better']
 * AI tags: ['anxiety', 'meeting', 'walk']
 * Result: ['journal', 'anxious', 'anxiety', 'meeting'] (emotion + top context tag)
 */
function mergeLogTags(existingTags: string[], aiTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase().replace(/^\*/, '');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  // 1. Always preserve journal marker (without the * prefix for storage)
  const hasJournalMarker = existingTags.some(
    (t) => t.toLowerCase() === 'journal' || t.toLowerCase() === '*journal',
  );
  if (hasJournalMarker) {
    addTag('journal');
  }

  // 2. Keep all emotion tags from existing tags
  existingTags.forEach((tag) => {
    const cleaned = tag.replace(/^[*#@]/, '').trim();
    if (isEmotionTag(cleaned)) {
      addTag(cleaned);
    }
  });

  // 3. Add emotion tags from AI suggestions
  aiTags.forEach((tag) => {
    if (isEmotionTag(tag)) {
      addTag(tag);
    }
  });

  // 4. Add 1-2 context tags from AI suggestions (non-emotion tags)
  const contextTags = aiTags.filter((tag) => !isEmotionTag(tag));
  contextTags.slice(0, 2).forEach((tag) => {
    addTag(tag);
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sweep Status Chip Helper
// ─────────────────────────────────────────────────────────────────────────────

type SweepStatus = {
  label: string;
  type: 'archived' | 'completed' | 'deferred' | 'in-sweep' | 'scheduled' | null;
};

function computeSweepStatus(entity: any, baseType: BaseType): SweepStatus {
  if (!entity) return { label: '', type: null };

  const today = getTodayDayString();

  // Priority 1: Archived (all types)
  if (entity.archived) {
    return { label: 'Archived', type: 'archived' };
  }

  // Priority 2: Completed (todos only)
  if (baseType === 'todo' && entity.completed_at) {
    const completedDate = format(parseISO(entity.completed_at), 'MMM d');
    return { label: `Done ${completedDate}`, type: 'completed' };
  }

  // Priority 3: Deferred (resurface_at in future) - todos and notes
  const resurfaceAt = entity.resurface_at;
  if (resurfaceAt && resurfaceAt > today) {
    const resurfaceDate = format(parseISO(resurfaceAt), 'MMM d');
    return { label: `Sweep: ${resurfaceDate}`, type: 'deferred' };
  }

  // TODOS
  if (baseType === 'todo') {
    const dueDay = entity.due_day;

    // In tonight's sweep: overdue, due today, or undated
    if (!dueDay || dueDay <= today) {
      return { label: "In tonight's Sweep", type: 'in-sweep' };
    }

    // Future due date
    return { label: 'Sweep: Due date', type: 'scheduled' };
  }

  // HABITS
  if (baseType === 'habit') {
    const startDate = entity.start_date;

    // Unconfirmed habit (no start date) - needs sweep confirmation
    if (!startDate) {
      return { label: "In tonight's Sweep", type: 'in-sweep' };
    }

    // Confirmed/active habit - no status needed
    return { label: '', type: null };
  }

  // NOTES (logs)
  if (baseType === 'log') {
    // Journal entries don't go through sweep
    if (entity.subtype === 'journal') {
      return { label: '', type: null };
    }

    // Swept and not resurfacing - it's been saved/processed
    if (entity.swept_at && !resurfaceAt) {
      return { label: 'Saved', type: 'completed' };
    }

    // Otherwise it's in sweep (recent idea, today's catchall, resurfacing, etc.)
    return { label: "In tonight's Sweep", type: 'in-sweep' };
  }

  return { label: '', type: null };
}

// ============================================================================
// Mind Drop Detection Helpers (type-agnostic for todos, habits, notes)
// ============================================================================

/**
 * Check if an entity is a Mind Drop item that may need auto-prefill
 */
function isMindDropEntity(entity: any, mode: 'create' | 'edit'): boolean {
  if (mode !== 'edit') return false;
  if (!entity || entity.origin !== 'catchall') return false;
  const type = entity.type;
  return type === 'todo' || type === 'habit' || type === 'note';
}

/**
 * Get the short title for an entity (type-agnostic)
 * - todos: title ?? name
 * - habits: name ?? title
 * - notes: title
 */
function getEntityShortTitle(entity: any): string {
  if (!entity) return '';
  const type = entity.type;

  if (type === 'todo') {
    return entity.title ?? entity.name ?? '';
  }
  if (type === 'habit') {
    return entity.name ?? entity.title ?? '';
  }
  if (type === 'note') {
    return entity.title ?? '';
  }
  return '';
}

/**
 * Phase 1: Check if a Mind Drop entity has already been AI-prefilled and should be locked.
 * Once AI has generated title/tags, we don't re-run AI on every open.
 * AI should only run again if user explicitly taps "Re-summarize" (future phase).
 *
 * Returns true when:
 * - Entity is from Mind Drop (has drop_id)
 * - Entity was AI-placed (ai_placed = true)
 * - Entity has already been prefilled once (views.minddrop_prefilled_v1 = true)
 */
function isMindDropAiLocked(entity: any): boolean {
  const isMindDrop = !!entity?.drop_id;
  const aiPlaced = !!entity?.ai_placed;
  const views = entity?.views ?? {};
  const alreadyPrefilled = views.minddrop_prefilled_v1 === true;

  // Phase 1 rule:
  // If it came from Mind Drop AND has already been AI-prefilled once, treat AI as locked.
  return isMindDrop && aiPlaced && alreadyPrefilled;
}

/**
 * Determine if an entity's title is still a "raw sentence" (not yet condensed by AI)
 * Returns true when:
 * - Title has 5+ words, AND
 * - Title matches the original raw Mind Drop text
 *
 * Special case for Mind Drop todos:
 * - If todo has origin='catchall' and a body field, treat it as a raw sentence
 * - This allows OverlayPrefill to run on first edit, even if the title was already compacted
 */
function isRawSentenceTitle(entity: any, fullEntity?: any): boolean {
  // Special handling for Mind Drop todos with body field
  // Check fullEntity first (has complete data in edit mode), then fall back to entity
  const entityToCheck = fullEntity || entity;

  if (entityToCheck?.type === 'todo' && entityToCheck?.origin === 'catchall') {
    const body = entityToCheck.body?.trim();
    // If todo has a body (details field), treat it as a raw sentence
    // This enables prefill on first edit for todos with compacted titles
    if (body && body.length > 0) {
      return true;
    }
  }

  // Enhanced Mind Drop detection for todos/habits created from Mind Drop
  // If origin='catchall', ai_placed=true, has drop_id, and title is basically the full sentence
  if (
    entityToCheck?.origin === 'catchall' &&
    entityToCheck?.ai_placed === true &&
    entityToCheck?.drop_id
  ) {
    const entityType = entityToCheck?.type;
    if (entityType === 'todo' || entityType === 'habit') {
      const title = entityToCheck.title?.trim() || entityToCheck.name?.trim() || '';
      const rawText = getMindDropRawText(entityToCheck);

      if (title && rawText) {
        // Check if title is the same as raw text (full sentence preserved)
        if (title === rawText.trim()) {
          return true;
        }

        // Check if title is very similar to raw text (minor differences)
        // This handles cases where AI made minimal edits
        const titleNormalized = title.toLowerCase().replace(/[.,!?;:]$/g, '');
        const rawNormalized = rawText
          .trim()
          .toLowerCase()
          .replace(/[.,!?;:]$/g, '');

        if (titleNormalized === rawNormalized) {
          return true;
        }

        // For todos/habits, also check body/notes field similarity
        const bodyField =
          entityType === 'todo' ? entityToCheck.body?.trim() : entityToCheck.notes?.trim();

        if (bodyField && title === bodyField.trim()) {
          return true;
        }
      }
    }
  }

  const shortTitle = getEntityShortTitle(entity);
  if (!shortTitle || shortTitle.trim().length === 0) return false;

  const trimmed = shortTitle.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 5) return false;

  // Use standardized helper to get raw Mind Drop text
  const rawText = getMindDropRawText(entity);
  if (!rawText) return false;

  // Check if title equals the raw Mind Drop sentence
  return trimmed === rawText.trim();
}

// ============================================================================

function toMetaCanonical(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const { tag } = normalizeTag(value);
  if (!tag) return null;
  return tag;
}

function addMetaTag(list: string[] | undefined | null, value: string | null | undefined): string[] {
  const canonical = toMetaCanonical(value ?? null);
  const base = Array.isArray(list) ? [...list] : [];
  if (!canonical) return base;
  const key = canonical.toLowerCase();
  if (base.some((entry) => typeof entry === 'string' && entry.toLowerCase() === key)) {
    return base;
  }
  return [...base, canonical];
}

function removeMetaTag(
  list: string[] | undefined | null,
  value: string | null | undefined,
): string[] {
  if (!Array.isArray(list)) return [];
  const canonical = toMetaCanonical(value ?? null);
  if (!canonical) return [...list];
  const key = canonical.toLowerCase();
  return list.filter((entry) => typeof entry === 'string' && entry.toLowerCase() !== key);
}


if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Runtime sanity checks (fail fast with clear messages during tests)
// These run at module-evaluation time to help identify broken imports.
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _any: any = {};
  if (typeof (Box as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `Box` is undefined');
  if (typeof (Text as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `Text` is undefined');
  if (typeof (Button as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `Button` is undefined');
  if (typeof (ScopeSelector as any) === 'undefined')
    throw new Error('UnifiedOverlayV2: import `ScopeSelector` is undefined');
} catch (e: any) {
  // eslint-disable-next-line no-console
  console.error('UnifiedOverlayV2 sanity check failed:', e && e.message ? e.message : e);
}

// Helper to format log timestamp (Phase L2)
function formatLogTimestamp(mode: 'create' | 'edit' | 'view', entity: any | null): string {
  try {
    if ((mode === 'edit' || mode === 'view') && entity) {
      const raw =
        entity.date ?? entity.created_at ?? entity.inserted_at ?? entity.updated_at ?? null;
      if (raw) {
        const d = new Date(raw);
        return format(d, 'MMM d, h:mm a');
      }
    }
    // create mode – just show "Today" with time
    const now = getDateService().now();
    return format(now, 'MMM d, h:mm a');
  } catch {
    return '';
  }
}

// Helper to get log subtype chip label
// Note: 'list' is legacy for backward compatibility - checklist mode is now separate
function getLogSubtypeChipLabel(
  subtype: 'journal' | 'idea' | 'general' | 'list' | 'event',
): string {
  switch (subtype) {
    case 'journal':
      return 'Journal';
    case 'idea':
      return 'Idea';
    case 'event':
      return 'Event';
    case 'list':
      return 'Note'; // Legacy 'list' subtype displays as Note; checklist is separate toggle
    case 'general':
    default:
      return 'General';
  }
}

export function UnifiedOverlayV2(props: UnifiedCreateOverlayProps) {
  const {
    visible,
    onClose,
    mode = 'create',
    initialEntity,
    initialSpaceId,
    onSaved,
    initialText,
    initialLogPhotoUris,
    defaultDueToday,
    conversionMeta,
  } = props;

  // NOTE: isViewMode is now derived above with displayMode state for habits

  // Get the entity ID from props (passed by OverlayHost in edit mode)
  const propsEntity = (props as any).entity ?? initialEntity ?? null;
  const entityIdToFetch = propsEntity?.id ?? null;

  // Zustand store mutations (replaces useRepo)
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createNote = useGremlyStore((s) => s.createNote);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const deleteTodo = useGremlyStore((s) => s.deleteTodo);
  const deleteNote = useGremlyStore((s) => s.deleteNote);
  const deleteHabit = useGremlyStore((s) => s.deleteHabit);
  const archiveNote = useGremlyStore((s) => s.archiveNote);
  const insertLogPhoto = useGremlyStore((s) => s.insertLogPhoto);
  const deleteLogPhoto = useGremlyStore((s) => s.deleteLogPhoto);
  const updateLogPhotoPosition = useGremlyStore((s) => s.updateLogPhotoPosition);
  const listLogPhotos = useGremlyStore((s) => s.listLogPhotos);

  // Habit progress for view mode
  const habitProgressForView = useGremlyStore((s) => s.habitProgress);
  const completeHabit = useGremlyStore((s) => s.completeHabit);
  const logHabitCompletionForDate = useGremlyStore((s) => s.logHabitCompletionForDate);
  const removeHabitCompletionForDate = useGremlyStore((s) => s.removeHabitCompletionForDate);

  // Spaces from selector (replaces repo.listSpaces)
  const storeSpaces = useActiveSpaces();

  // Synchronous getItemById helper (replaces repo.getById)
  const getItemById = useCallback(
    (id: string) => selectItemById(useGremlyStore.getState(), id),
    [],
  );

  // Repo adapter for legacy hooks (usePhase8LinksState, etc.)
  // This allows incremental migration while maintaining backwards compatibility
  const repo = useMemo(
    () => ({
      getById: async (id: string) => getItemById(id),
      listSpaces: async () => storeSpaces,
      update: async ({ id, patch }: { id: string; patch: any }) => {
        const item = getItemById(id);
        if (!item) return null;
        if (item.type === 'todo') {
          await updateTodo(id, patch);
        } else if (item.type === 'habit') {
          await updateHabit(id, patch);
        } else {
          await updateNote(id, patch);
        }
        return getItemById(id);
      },
      create: async (input: any) => {
        if (input.type === 'todo') {
          return createTodo(input);
        } else if (input.type === 'habit') {
          return createHabit(input);
        } else {
          return createNote(input);
        }
      },
      remove: async (id: string) => {
        const item = getItemById(id);
        if (!item) return;
        if (item.type === 'todo') {
          await deleteTodo(id);
        } else if (item.type === 'habit') {
          await deleteHabit(id);
        } else {
          await deleteNote(id);
        }
      },
      deleteLogPhoto,
      insertLogPhoto: async (params: { note_id: string; url: string; position: number }) => {
        return insertLogPhoto({
          noteId: params.note_id,
          url: params.url,
          position: params.position,
        });
      },
      updateLogPhotoPosition,
      listLogPhotos,
    }),
    [
      getItemById,
      storeSpaces,
      updateTodo,
      updateHabit,
      updateNote,
      createTodo,
      createHabit,
      createNote,
      deleteTodo,
      deleteHabit,
      deleteNote,
      deleteLogPhoto,
      insertLogPhoto,
      updateLogPhotoPosition,
      listLogPhotos,
    ],
  );

  const globalOverlay = useGlobalOverlay();
  const overlayNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // ── Draft store ─────────────────────────────────────────────────────
  const store = useOverlayDraft();
  const draft = useOverlayDraft(selectDraft);
  const storeUI = useOverlayDraft(selectUI);

  // Safe draft read — falls back to initialV2State when overlay is closed
  const state = draft ?? initialV2State;

  // ── Store-backed UI aliases (replace legacy useState declarations) ──
  const keyboardHeight = storeUI.keyboardHeight;
  const setKeyboardHeight = (v: number) => store.setUI({ keyboardHeight: v });
  const showRemindersModal = storeUI.showRemindersModal;
  const setShowRemindersModal = (v: boolean) => store.setUI({ showRemindersModal: v });
  const saveError = storeUI.saveError;
  const setSaveError = (v: string | null) => store.setUI({ saveError: v });
  const showSaveToast = storeUI.showSaveToast;
  const setShowSaveToast = (v: boolean) => store.setUI({ showSaveToast: v });
  const showUndoToast = storeUI.showUndoToast;
  const setShowUndoToast = (v: boolean) => store.setUI({ showUndoToast: v });
  const showClarificationPopup = storeUI.showClarificationPopup;
  const setShowClarificationPopup = (v: boolean) => store.setUI({ showClarificationPopup: v });
  const clarificationLoading = storeUI.clarificationLoading;
  const setClarificationLoading = (v: boolean) => store.setUI({ clarificationLoading: v });
  const isExpandedEditor = storeUI.isExpandedEditor;
  const setIsExpandedEditor = (v: boolean) => store.setUI({ isExpandedEditor: v });
  const isPreviewMode = storeUI.isPreviewMode;
  const setIsPreviewMode = (v: boolean) => store.setUI({ isPreviewMode: v });
  const moodPickerExpanded = storeUI.moodPickerExpanded;
  const setMoodPickerExpanded = (v: boolean) => store.setUI({ moodPickerExpanded: v });
  const bodyFocused = storeUI.bodyFocused;
  const setBodyFocused = (v: boolean) => store.setUI({ bodyFocused: v });
  const commitmentFocused = storeUI.commitmentFocused;
  const setCommitmentFocused = (v: boolean) => store.setUI({ commitmentFocused: v });
  const isCreatingTodos = storeUI.isCreatingTodos;
  const setIsCreatingTodos = (v: boolean) => store.setUI({ isCreatingTodos: v });
  const displayMode = storeUI.displayMode;
  const setDisplayMode = (v: 'view' | 'edit') => store.setUI({ displayMode: v });
  const timeEstimateValue = storeUI.timeEstimateValue;
  const setTimeEstimateValue = (v: number) => store.setUI({ timeEstimateValue: v });
  const dateModalTarget = storeUI.dateModalTarget;
  const setDateModalTarget = (v: typeof dateModalTarget) => store.setUI({ dateModalTarget: v });
  const selectedDate = storeUI.selectedDate;
  const setSelectedDate = (v: Date) => store.setUI({ selectedDate: v });
  const selectedTime = storeUI.selectedTime;
  const setSelectedTime = (v: Date) => store.setUI({ selectedTime: v });
  const showTimePicker = storeUI.showTimePicker;
  const setShowTimePicker = (v: boolean) => store.setUI({ showTimePicker: v });
  const clearDateFlag = storeUI.clearDateFlag;
  const setClearDateFlag = (v: boolean) => store.setUI({ clearDateFlag: v });
  const selectedTimePreset = storeUI.selectedTimePreset;
  const setSelectedTimePreset = (v: string | null) => store.setUI({ selectedTimePreset: v });
  const showCustomTimePicker = storeUI.showCustomTimePicker;
  const setShowCustomTimePicker = (v: boolean) => store.setUI({ showCustomTimePicker: v });
  const dueToastMessage = storeUI.dueToastMessage;
  const setDueToastMessage = (v: string | null) => store.setUI({ dueToastMessage: v });
  const clarificationSuccess = storeUI.clarificationSuccess;
  const setClarificationSuccess = (v: string | null) => store.setUI({ clarificationSuccess: v });

  // ── Store-backed entity-data aliases (replace legacy useState declarations) ──
  const isFavorite = draft?.isFavorite ?? false;
  const setIsFavorite = (v: boolean) => store.setFavorite(v);
  const tagsDirty = draft?.tagsDirty ?? false;
  const setTagsDirty = (_v?: boolean) => store.setTagsDirty();
  const userClearedChecklist = draft?.userClearedChecklist ?? false;
  const setUserClearedChecklist = (v: boolean) => store.setUserClearedChecklist(v);
  const itemReminders = draft?.itemReminders ?? [];
  const setItemReminders = (v: ItemReminder[]) => store.setItemReminders(v);
  const checklistItems = draft?.checklistItems ?? null;
  const setChecklistItems = (v: ListItem[] | null) => store.setChecklistItems(v);
  const photoUri = draft?.photoUri ?? null;
  const moods = draft?.moods ?? [];
  const setMoods = (v: Mood[]) => store.setMoods(v);

  // Fetch the entity snapshot from the draft store (one-shot, no live subscription)
  const fullEntity = store.draft?.originalEntity ?? propsEntity ?? null;

  // Clarification detection (Phase 2)
  const needsClarification =
    (fullEntity?.views?.needs_clarification === true ||
      fullEntity?.needs_clarification === true ||
      fullEntity?.clarification_needed === true) &&
    fullEntity?.views?.clarification_resolved !== true &&
    fullEntity?.clarification_resolved !== true;
  const clarificationQuestion =
    fullEntity?.views?.clarification_question ?? fullEntity?.clarification_question ?? null;
  const clarificationOptions =
    fullEntity?.views?.clarification_options ?? fullEntity?.clarification_options ?? null;
  const clarificationType =
    fullEntity?.views?.clarification_type ?? fullEntity?.clarification_type ?? null;

  // Local UI state that was previously in the reducer
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleRow = (key: string) => setExpandedRow(prev => prev === key ? null : key);
  const [habitIsCustomFreq, setHabitIsCustomFreq] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const undoStackRef = useRef<Array<{ kind: 'type' | 'tag' | 'commitment'; prev: Partial<any> }>>([]);
  const baseType = state.baseType;
  const isBreakHabit = baseType === 'habit' && state.habit.subtype === 'break_habit';

  // Track entity ID for dependency array
  const currentEntityId = (initialEntity as any)?.id ?? null;

  // Initialize store when overlay opens
  useEffect(() => {
    if (visible) {
      // Always (re)open — forces fresh hydration from entity, discarding any dirty state
      store.open({
        entity: propsEntity || null,
        mode: mode as 'create' | 'edit' | 'view',
        initialSpaceId,
        hydrate: (entity) => hydrateEntityToDraft(entity, mode as any, initialSpaceId),
      });
      aiTagOverrideAppliedRef.current = false;
      hasLoadedEditTagsRef.current = false;
    } else {
      store.discard();
    }
  }, [visible, currentEntityId, mode]);

  // Track if we started in view mode so we can show a back button
  const startedInViewMode = mode === 'view';

  // Derive effective view mode - displayMode toggles for all types
  const isViewMode = displayMode === 'view' && mode === 'view';

  // Entity Chat: get store selectors and derive entityType
  const getEntityChatMessageCount = useGremlyStore((s) => s.getEntityChatMessageCount);
  const updateEntityChatNoteChecklist = useGremlyStore((s) => s.updateEntityChatNoteChecklist);
  const updateEntityChatNote = useGremlyStore((s) => s.updateEntityChatNote);
  const deleteEntityChatNote = useGremlyStore((s) => s.deleteEntityChatNote);

  // Select entity arrays to make notes reactive to store changes
  const storeTodos = useGremlyStore((s) => s.todos);
  const storeHabits = useGremlyStore((s) => s.habits);
  const storeNotes = useGremlyStore((s) => s.notes);

  const entityTypeForChat: 'todo' | 'habit' | 'note' = useMemo(() => {
    if (baseType === 'todo') return 'todo';
    if (baseType === 'habit') return 'habit';
    return 'note'; // log maps to 'note'
  }, [baseType]);

  const hasExistingChat = useMemo(() => {
    if (!currentEntityId) return false;
    return getEntityChatMessageCount(currentEntityId, entityTypeForChat) > 0;
  }, [currentEntityId, entityTypeForChat, getEntityChatMessageCount]);

  // Entity Chat: get saved notes for current entity (reactive to store changes)
  const entityChatNotes = useMemo(() => {
    if (!currentEntityId) return [];

    // Find the entity from the appropriate store array
    let entity: any;
    if (entityTypeForChat === 'todo') {
      entity = storeTodos.find((t) => t.id === currentEntityId);
    } else if (entityTypeForChat === 'habit') {
      entity = storeHabits.find((h) => h.id === currentEntityId);
    } else {
      entity = storeNotes.find((n) => n.id === currentEntityId);
    }

    // Extract notes from entity.views.chat
    const views = entity?.views as Record<string, any> | undefined;
    const chatData = views?.chat;
    const notes = chatData?.notes ?? [];

    return notes;
  }, [currentEntityId, entityTypeForChat, storeTodos, storeHabits, storeNotes]);

  // Entity Chat: handle checklist toggle
  const handleChatNoteChecklistToggle = useCallback(
    (noteId: string, itemId: string, completed: boolean) => {
      if (!currentEntityId) return;
      updateEntityChatNoteChecklist(currentEntityId, entityTypeForChat, noteId, itemId, completed);
    },
    [currentEntityId, entityTypeForChat, updateEntityChatNoteChecklist],
  );

  // Entity Chat: handle note content update
  const handleChatNoteUpdate = useCallback(
    (noteId: string, content: string) => {
      if (!currentEntityId) return;
      updateEntityChatNote(currentEntityId, entityTypeForChat, noteId, content);
    },
    [currentEntityId, entityTypeForChat, updateEntityChatNote],
  );

  // Entity Chat: handle note deletion
  const handleChatNoteDelete = useCallback(
    (noteId: string) => {
      if (!currentEntityId) return;
      deleteEntityChatNote(currentEntityId, entityTypeForChat, noteId);
    },
    [currentEntityId, entityTypeForChat, deleteEntityChatNote],
  );

  // Entity Chat: handle convert to checklist
  const convertNoteToChecklist = useGremlyStore((s) => s.convertNoteToChecklist);
  const handleConvertNoteToChecklist = useCallback(
    (
      noteId: string,
      checklistData: {
        is_checklist: true;
        checklist_items: Array<{ id: string; label: string; completed: boolean }>;
        preamble?: string;
        postamble?: string;
      },
    ) => {
      if (!currentEntityId) return;
      convertNoteToChecklist(currentEntityId, entityTypeForChat, noteId, checklistData);
    },
    [currentEntityId, entityTypeForChat, convertNoteToChecklist],
  );

  // Clarification popup: auto-show when overlay opens for item needing clarification
  useEffect(() => {
    if (visible && needsClarification && clarificationQuestion) {
      // Small delay to let overlay animate in first
      const timer = setTimeout(() => {
        setShowClarificationPopup(true);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowClarificationPopup(false);
    }
  }, [visible, needsClarification, clarificationQuestion]);

  // Clarification: handle option selection
  const resolvePendingDropClarification = useGremlyStore((s) => s.resolvePendingDropClarification);
  const resolveSkippedClarification = useGremlyStore((s) => s.resolveSkippedClarification);
  const handleClarificationSelect = useCallback(
    async (optionId: string) => {
      // Get the entity ID from fullEntity (which combines props.entity and initialEntity)
      const entityId = fullEntity?.id;

      if (!entityId) {
        console.error('[UnifiedOverlayV2] No entity ID available for clarification');
        setShowClarificationPopup(false);
        return;
      }

      // Show loading state
      setClarificationLoading(true);

      try {
        await resolvePendingDropClarification(entityId, optionId);

        // Haptic feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Show success state
        setClarificationLoading(false);
        setClarificationSuccess('Got it — updated!');

        // Wait for user to see success message, then close
        setTimeout(() => {
          setClarificationSuccess(null);
          setShowClarificationPopup(false);

          // Close the overlay - the entity may have been converted to a different type
          onClose?.();

          // Emit events to trigger list refresh so the new entity appears
          // ItemUpdated: specific entity update notification
          eventBus.emit('ItemUpdated', { id: entityId, source: 'clarification-resolved' });

          // entity:updated: broader refresh signal for bucket conversions
          // RecentDrops and other list components listen for this
          eventBus.emit('entity:updated', {
            entity: { id: entityId },
            type: 'unknown', // May have changed type during conversion
            source: 'clarification-resolved',
          });
        }, 1200); // Show success for 1.2 seconds
      } catch (error) {
        console.error('[UnifiedOverlayV2] Store action failed:', error);
        setClarificationLoading(false);
        setShowClarificationPopup(false);
      }
    },
    [fullEntity?.id, propsEntity?.id, initialEntity?.id, resolvePendingDropClarification, onClose],
  );

  // Clarification: handle skip
  const handleClarificationSkip = useCallback(async () => {
    const entityId = fullEntity?.id;

    // Close popup immediately
    setShowClarificationPopup(false);

    if (!entityId) return;

    // Resolve as skipped - this updates the entity and runs Phase 2
    try {
      await resolveSkippedClarification(entityId);
    } catch (error) {
      console.error('[UnifiedOverlayV2] Skip resolution failed:', error);
    }
  }, [fullEntity?.id, resolveSkippedClarification]);

  // Log kind detection (Phase L1)
  const isLog = baseType === 'log';
  const logKind = isLog ? state.log.kind : 'basic';
  const isJournalLog = isLog && logKind === 'journal';
  const isIdeaLog = isLog && logKind === 'idea';
  const isListLog = isLog && logKind === 'list';

  // Phase L8: Derive effective log subtype from manual override or entity subtype or detected tags
  // Priority order: manual override > tags > entity subtype > fallback
  const effectiveLogSubtype: 'journal' | 'idea' | 'general' | 'list' | 'event' = useMemo(() => {
    if (!isLog) return 'general';

    // 1. Manual override takes HIGHEST precedence (user explicitly chose)
    if (state.logSubtypeOverride) return state.logSubtypeOverride;

    // 2. Fallback to entity.subtype or logSubtype if present
    // - entity.subtype: from classification system or edit mode (persisted notes)
    // - entity.logSubtype: from openCreate() in create mode
    const entity = initialEntity as any;
    const rawSubtype = (entity?.subtype ?? entity?.logSubtype) as string | undefined;
    if (
      rawSubtype === 'journal' ||
      rawSubtype === 'idea' ||
      rawSubtype === 'general' ||
      rawSubtype === 'list' ||
      rawSubtype === 'event'
    ) {
      return rawSubtype;
    }

    return 'general';
  }, [isLog, state.logSubtypeOverride, initialEntity]);

  // Journal detection for mood selector (Phase L4) - now uses effectiveLogSubtype
  const isJournal = isLog && effectiveLogSubtype === 'journal';

  // Event note detection for LinkedItemsSection
  const isEventNote = isLog && effectiveLogSubtype === 'event' && !!currentEntityId;

  // LinkedEventPicker: Check if current space has events
  // Resolve spaceId from state (explicit) or entity (fallback)
  const effectiveSpaceId = state.spaceId ?? fullEntity?.space_id ?? initialSpaceId ?? null;
  const spaceHasEvents = useSpaceHasEvents(effectiveSpaceId ?? '');
  // Show LinkedEventPicker when:
  // - Entity has a space_id with events
  // - Entity is NOT itself an event (subtype !== 'event')
  const showLinkedEventPicker =
    !!effectiveSpaceId &&
    spaceHasEvents &&
    effectiveLogSubtype !== 'event' &&
    !(baseType === 'habit' && state.habit.subtype === 'break_habit'); // Don't show for break habits

  // Derived checklist mode: explicit state OR legacy "list" subtype for logs
  const isChecklistMode =
    state.isChecklistMode || (baseType === 'log' && effectiveLogSubtype === 'list');

  // Prompt 3: Smart list detection for logs
  const listDetection = useMemo(() => {
    if (!isLog) return { kind: 'plain' } as const;
    return detectListFromText(state.log.body);
  }, [isLog, state.log.body]);


  // Make Actionable feature state
  const [extractedItems, setExtractedItems] = useState<ExtractedListItem[]>([]);

  const [sourceNote, setSourceNote] = useState<{ id: string; title: string } | null>(null);

  // Entity Chat state

  // LinkedItemsSection handlers for event notes
  const handleLinkedItemPress = useCallback(
    (item: any) => {
      const itemSpaceId = item.space_id || fullEntity?.space_id || initialSpaceId;
      onClose();
      // Small delay to let current overlay close before opening new one
      setTimeout(() => {
        globalOverlay.openEdit({ record: item, spaceId: itemSpaceId });
      }, 100);
    },
    [onClose, globalOverlay, fullEntity?.space_id, initialSpaceId],
  );

  const handleLinkedAddTodo = useCallback(() => {
    const eventId = currentEntityId;
    const spaceId = fullEntity?.space_id || initialSpaceId;
    const eventDate = (fullEntity as any)?.target_date; // Event's date becomes todo's deadline
    onClose();
    setTimeout(() => {
      globalOverlay.openCreate({
        type: 'todo',
        spaceId,
        initialEntity: {
          type: 'todo',
          linked_event_id: eventId,
          target_date: eventDate, // Pre-populate deadline from event date
        } as any,
      });
    }, 100);
  }, [onClose, globalOverlay, fullEntity?.space_id, initialSpaceId, currentEntityId, fullEntity]);

  const handleLinkedAddNote = useCallback(() => {
    const eventId = currentEntityId;
    const spaceId = fullEntity?.space_id || initialSpaceId;
    onClose();
    setTimeout(() => {
      globalOverlay.openCreate({
        type: 'log',
        spaceId,
        initialEntity: { type: 'log', linked_event_id: eventId } as any,
      });
    }, 100);
  }, [onClose, globalOverlay, fullEntity?.space_id, initialSpaceId, currentEntityId]);

  const handleLinkExisting = useCallback(() => {
    Alert.alert('Coming Soon', 'Linking existing items will be available in a future update.');
  }, []);

  // Handler for LinkedEventPicker changes
  const handleLinkedEventChange = useCallback(
    (eventId: string | null) => {
      store.setLinkedEventId(eventId);

      // Auto-populate todo deadline from event date if todo doesn't have one
      if (eventId && baseType === 'todo' && !state.todo.target_date) {
        const event = getItemById(eventId);
        const eventDate = (event as any)?.target_date;
        if (eventDate) {
          store.setTodoTargetDate(eventDate);
        }
      }
    },
    [baseType, state.todo.target_date, getItemById],
  );



  // View mode: store fetched entity for display
  const viewModeEntity: any = useMemo(() => {
    if (mode !== 'view' || !initialEntity) return null;
    const entityId = (initialEntity as any)?.id;
    if (!entityId) return null;
    return getItemById(entityId) ?? null;
  }, [mode, initialEntity, getItemById]);

  // Keep this for other parts of the component that need the body
  const noteBody =
    state.log?.body ||
    fullEntity?.body ||
    viewModeEntity?.body ||
    (initialEntity as any)?.body ||
    '';

  // Make Actionable: compute whether to show the button
  const showMakeActionable = useMemo(() => {
    // Compute body inside useMemo - check all possible sources
    const body =
      state.log?.body ||
      fullEntity?.body ||
      viewModeEntity?.body ||
      (initialEntity as any)?.body ||
      '';
    const entity = fullEntity || viewModeEntity || (initialEntity as any);

    const result = {
      mode,
      baseType,
      noteBodyLength: body?.length ?? 0,
      hasListFlag: entity?.has_list,
      hasActionableResult: hasActionableList(body),
      hasChecklistItems: checklistItems && checklistItems.length > 0,
    };

    if (mode !== 'view') return false;
    if (baseType !== 'log') return false;
    if (entity?.has_list) return false; // Already a checklist in DB
    if (checklistItems && checklistItems.length > 0) return false; // Already showing checklist
    return hasActionableList(body);
  }, [mode, baseType, state.log?.body, fullEntity, viewModeEntity, initialEntity, checklistItems]);





  // Multi-photo support for logs (Phase L5)
  const [logPhotos, setLogPhotos] = useState<LogPhoto[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Photo Drop: hydrate logPhotos from initialLogPhotoUris for create-mode logs (once)
  const initialLogPhotosHydratedRef = useRef(false);

  // Keyboard height tracking + timer cleanup on unmount
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current as any);
        undoTimerRef.current = null;
      }
      if (saveToastTimerRef.current) {
        clearTimeout(saveToastTimerRef.current as any);
        saveToastTimerRef.current = null;
      }
      if (dueToastTimerRef.current) {
        clearTimeout(dueToastTimerRef.current as any);
        dueToastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      baseType !== 'log' ||
      mode !== 'create' ||
      initialLogPhotosHydratedRef.current ||
      !initialLogPhotoUris ||
      initialLogPhotoUris.length === 0
    ) {
      return;
    }

    const seeded: LogPhoto[] = initialLogPhotoUris.slice(0, 5).map((uri, index) => ({
      url: uri,
      position: index,
      isNew: true,
      isDeleted: false,
    }));

    setLogPhotos(seeded);
    initialLogPhotosHydratedRef.current = true;
  }, [baseType, mode, initialLogPhotoUris]);



  // focus states for accessibility focus rings
  // Expanded editor mode state
  // Preview mode: When opening a log from chat, show formatted read-only view first
  // useAuth may not be available in some test harnesses that mock providers,
  // so guard against the hook throwing by falling back to null.
  let userId: string | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    userId = useAuth().userId ?? null;
  } catch (e) {
    userId = null;
  }

  const phase8Links = usePhase8LinksState(
    repo as any, // Cast to any for legacy hook compatibility
    userId ?? '',
    null,
    baseType === 'todo' ? 'todo' : baseType === 'habit' ? 'habit' : 'note',
  );
  // Track whether user has modified tags (to avoid overwriting Mind Drop AI tags on edit)
  // local UI state for undo toast
  const undoTimerRef = useRef<number | null>(null);
  const saveToastTimerRef = useRef<number | null>(null);
  const dueToastTimerRef = useRef<number | null>(null);
  const aiTitlePersistedRef = useRef(false);
  const textInputRef = useRef<TextInput | null>(null);
  const prevConversionMetaRef = useRef(conversionMeta);

  // feature flag for commitments (soft rollout)
  const commitmentsOn = env.feature.commitments;
  const currentTagsRef = useRef<TagKey[]>(state.tags);
  currentTagsRef.current = state.tags;
  const hasLoadedEditTagsRef = useRef(false);

  async function canEnableCommitment(): Promise<boolean> {
    try {
      if (typeof (repo as any).countActiveCommitments === 'function') {
        const n = await (repo as any).countActiveCommitments();
        return n < 3;
      }
      if (typeof (repo as any).listCommitments === 'function') {
        const items = await (repo as any).listCommitments();
        return (items?.length ?? 0) < 3;
      }
    } catch (e) {
      // ignore and allow by default
    }
    return true;
  }



  // Derive spaces from store (no useEffect needed)
  const spaces = storeSpaces || [];

  // Item reminders are hydrated once in store.open() via hydrateEntityToDraft

  // Emit an 'opened' funnel event when the overlay becomes visible;
  // reset local-only state when closing.
  useEffect(() => {
    if (visible) {
      try {
        eventBus.emit('OverlayOpened', { mode, baseType: state.baseType });
      } catch (e) {
        // ignore telemetry errors
      }
      overlayEntryTypeRef.current = state.baseType;
      if (!openTelemetrySentRef.current) {
        openTelemetrySentRef.current = true;
        void emitOverlayEvent({ type: 'overlay_open', mode, entryType: overlayEntryTypeRef.current });
      }
    } else {
      openTelemetrySentRef.current = false;
      // Reset local-only state; store-backed fields are reset by store.discard()
      setSourceNote(null);
      setExtractedItems([]);
    }
  }, [visible, mode, state.baseType]);



  // Reset transient UI on baseType change
  useEffect(() => {
    if (baseType !== 'todo' && dueToastMessage) setDueToastMessage(null);
    setIsExpandedEditor(false);
    if (baseType !== 'log') {
      setLogPhotos([]);
      setSelectedPhotoIndex(null);
    }
  }, [baseType]);

  // Initialize preview mode when opening a log from chat with content OR viewing a note
  useEffect(() => {
    const isCreatingLogFromChat =
      visible &&
      mode === 'create' &&
      baseType === 'log' &&
      conversionMeta?.fromChat === true &&
      (conversionMeta?.initialNote?.length ?? 0) > 0;

    const isViewingNote = visible && mode === 'view' && baseType === 'log' && initialEntity?.id; // It's an existing note in view mode

    if (isCreatingLogFromChat || isViewingNote) {
      setIsPreviewMode(true);
    }
  }, [visible, mode, baseType, conversionMeta, initialEntity]);

  // Get source note for todos created via "explode to todos" (from store)
  useEffect(() => {
    const entity = fullEntity || (initialEntity as any);

    if (baseType !== 'todo') {
      setSourceNote(null);
      return;
    }

    let sourceNoteId = entity?.source_note_id;

    // If source_note_id isn't in the passed entity, check fresh from store
    // This handles the case where the todo list didn't include this field
    if (!sourceNoteId && entity?.id) {
      const freshTodo = getItemById(entity.id);
      sourceNoteId = (freshTodo as any)?.source_note_id;
    }

    if (!sourceNoteId) {
      setSourceNote(null);
      return;
    }

    const note = getItemById(sourceNoteId);
    if (note) {
      setSourceNote({
        id: note.id,
        title: (note as any).title || 'Untitled',
      });
    } else {
      setSourceNote(null);
    }
  }, [baseType, fullEntity, initialEntity, getItemById]);

  // Compute sweep status for the entity
  const sweepStatus = useMemo(() => {
    const entity = fullEntity || (initialEntity as any);
    if (!entity?.id) return { label: '', type: null };
    return computeSweepStatus(entity, baseType);
  }, [fullEntity, initialEntity, baseType]);

  // safe area insets (guard when the test harness doesn't provide the hook)
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    insets = useSafeAreaInsets();
  } catch (e) {
    insets = { top: 0, bottom: 0, left: 0, right: 0 };
  }

  // reduced motion preference
  const reduceMotion = useReducedMotion();

  // ============================================
  // MAKE ACTIONABLE HANDLERS
  // ============================================

  /**
   * Toggle a checklist item's checked state
   */
  const handleToggleChecklistItem = useCallback(
    async (itemId: string) => {
      const entity = fullEntity || (initialEntity as any);
      const entityId = entity?.id;

      if (!entityId || !checklistItems) return;

      // Optimistic update
      const updatedItems = checklistItems.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item,
      );
      setChecklistItems(updatedItems);

      try {
        await updateNote(entityId, {
          list_items: updatedItems,
        } as any);

        // Emit update event
        eventBus.emit('ItemUpdated', { id: entityId });
      } catch (error) {
        // Revert on failure
        setChecklistItems(checklistItems);
        console.error('[Checklist] Failed to toggle item:', error);
      }
    },
    [fullEntity, initialEntity, checklistItems, updateNote],
  );

  /**
   * Create todos from selected items
   * Uses AI enrichment to generate concise action-oriented titles
   * Stores original verbose text in body for context
   */
  const handleExplodeToTodos = useCallback(
    async (selectedItems: ExtractedListItem[]) => {
      // Get entity from fullEntity OR initialEntity
      const entity = fullEntity || (initialEntity as any);
      const entityId = entity?.id;

      if (!entityId || selectedItems.length === 0) return;

      const targetSpaceId = entity.space_id || initialSpaceId;

      try {
        setIsCreatingTodos(true);

        // Enrich all items in parallel using AI
        const enrichedItems = await enrichListItems(selectedItems.map((item) => item.text));

        const createdTodos = [];

        for (let i = 0; i < selectedItems.length; i++) {
          const item = selectedItems[i];
          const enriched = enrichedItems[i];

          // Build body: original text + AI notes if present
          let bodyText: string | undefined;
          if (enriched.title !== item.text) {
            bodyText = item.text;
            if (enriched.notes) {
              bodyText += `\n\n${enriched.notes}`;
            }
          } else if (enriched.notes) {
            bodyText = enriched.notes;
          }

          const todo = await createTodo({
            name: enriched.title,
            body: bodyText,
            space_id: targetSpaceId,
            source_note_id: entityId,
            tags: entity.tags || [],
            due_day: null,
            due_time: null,
            ai_placed: false,
          } as any);
          createdTodos.push(todo);
        }

        // Close modal
        store.setUI({ showTodoPreview: false });

        // Haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Emit events for created todos
        for (const todo of createdTodos) {
          eventBus.emit('entity:created', {
            type: 'todo',
            entity: todo,
            spaceId: targetSpaceId,
          });
        }

        // Show toast (use existing toast mechanism if available)
        Alert.alert(
          'Tasks Created',
          `Created ${createdTodos.length} ${createdTodos.length === 1 ? 'task' : 'tasks'}`,
        );
      } catch (error) {
        console.error('[MakeActionable] Failed to create todos:', error);
        Alert.alert('Error', 'Failed to create tasks. Please try again.');
      } finally {
        setIsCreatingTodos(false);
      }
    },
    [fullEntity, initialEntity, initialSpaceId, createTodo],
  );

  /**
   * Toggle favorite/star state
   */
  const handleToggleFavorite = useCallback(async () => {
    const entity = fullEntity || (initialEntity as any);
    const entityId = entity?.id;
    const entityType = entity?.type;

    if (!entityId) return;

    const newValue = !isFavorite;

    // Optimistic update
    setIsFavorite(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Use type-specific update mutation
      const patch = { is_favorite: newValue } as any;
      if (entityType === 'todo') {
        await updateTodo(entityId, patch);
      } else if (entityType === 'habit') {
        await updateHabit(entityId, patch);
      } else {
        await updateNote(entityId, patch);
      }

      eventBus.emit('ItemUpdated', { id: entityId });
    } catch (error) {
      // Revert on failure
      setIsFavorite(!newValue);
    }
  }, [fullEntity, initialEntity, isFavorite, updateTodo, updateHabit, updateNote]);

  /**
   * Open source note (for todos created from notes)
   */
  const handleOpenSourceNote = useCallback(() => {
    if (!sourceNote) return;

    // Get full note data from store before opening
    const fullNote = getItemById(sourceNote.id);

    if (!fullNote) return;

    const entity = fullEntity || (initialEntity as any);
    const spaceId = (fullNote as any).space_id || entity?.space_id || initialSpaceId;

    // Close current overlay
    onClose?.();

    // Small delay to let current overlay close
    setTimeout(() => {
      globalOverlay.openEdit({
        record: {
          ...fullNote,
          type: 'note',
        } as any,
        spaceId: spaceId,
      });
    }, 300);
  }, [sourceNote, fullEntity, initialEntity, initialSpaceId, onClose, globalOverlay, getItemById]);



  /**
   * ─────────────────────────────────────────────────────────────────────────
   * TYPE CHANGE HANDLER
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Handles user switching between types (log ↔ todo ↔ habit) in the overlay.
   *
   * BEHAVIOR:
   * - Updates local state.baseType immediately for UI feedback
   * - Copies current content to the new type's slot (text, tags, etc.)
   * - Pushes undo entry to allow reverting the type change
   * - Emits OverlayTypeChanged telemetry event
   *
   * CROSS-TABLE CONVERSION (handled in onSave):
   * - When baseType differs from initialEntity.type at save time
   * - Creates new record in target table with drop_id preserved
   * - Archives/deletes old record from source table
   * - Emits OverlayTypeConverted event
   *
   * SUPPORTED CONVERSIONS:
   * - note/log → todo: Creates todo, archives note
   * - note/log → habit: Creates habit, archives note
   * - todo → note/log: Creates note, archives todo
   * - todo → habit: Creates habit, archives todo
   * - habit → todo: Creates todo, archives habit
   * - habit → note/log: Creates note, archives habit
   * ─────────────────────────────────────────────────────────────────────────
   */
  const handleTypeSelect = useCallback(
    (next: BaseType) => {
      if (state.baseType === next) return;
      setMoodPickerExpanded(false); // Collapse mood picker on type change
      const prev = state.baseType;
      pushUndoEntry('type', {
        baseType: state.baseType,
        log: state.log,
        todo: state.todo,
        habit: state.habit,
      });
      store.setBaseType(next);
      try {
        eventBus.emit('OverlayTypeChanged', { from: prev, to: next });
      } catch (e) {
        // ignore telemetry errors
      }
    },
    [state.baseType, state.habit, state.log, state.todo],
  );

  // Runtime checks for components that must exist at render time.
  if (typeof Box === 'undefined') throw new Error('UnifiedOverlayV2 render: `Box` is undefined');
  if (typeof Text === 'undefined') throw new Error('UnifiedOverlayV2 render: `Text` is undefined');
  if (typeof Button === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `Button` is undefined');
  if (typeof ScopeSelector === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `ScopeSelector` is undefined');
  if (typeof ToastUndo === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `ToastUndo` is undefined');
  if (typeof Reanimated === 'undefined' || typeof (Reanimated as any).View === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `Animated.View` is undefined');
  if (typeof SafeAreaView === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `SafeAreaView` is undefined');
  if (typeof PeopleLinker === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `PeopleLinker` is undefined');
  if (typeof PersonPicker === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `PersonPicker` is undefined');
  if (typeof Modal === 'undefined')
    throw new Error('UnifiedOverlayV2 render: `Modal` is undefined');

  // animation values for commitment and save pulse
  const commitmentAnim = useSharedValue(state.commitment ? 1 : 0);
  const savePulse = useSharedValue(0);
  const headerPulse = useSharedValue(0);

  // View ↔ Edit mode crossfade animation values
  const viewModeOpacity = useSharedValue(isViewMode ? 1 : 0);
  const editModeOpacity = useSharedValue(!isViewMode ? 1 : 0);

  const sheetTranslateY = useRef(new RNAnimated.Value(16)).current;
  const sheetOpacity = useRef(new RNAnimated.Value(0)).current;
  const overlayEntryTypeRef = useRef<BaseType>(baseType);
  overlayEntryTypeRef.current = baseType;
  const openTelemetrySentRef = useRef(false);



  const commitmentStyle = useAnimatedStyle(() => ({
    opacity: commitmentAnim.value,
    transform: [{ scale: interpolate(commitmentAnim.value, [0, 1], [0.98, 1]) }],
  }));

  const saveStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(savePulse.value, [0, 1], [1, 1.06]) }],
  }));

  const headerPulseStyle = useAnimatedStyle(() => ({
    opacity: headerPulse.value,
  }));

  // View ↔ Edit mode crossfade animated styles
  const viewModeStyle = useAnimatedStyle(() => ({
    opacity: viewModeOpacity.value,
    position: viewModeOpacity.value === 0 ? ('absolute' as const) : ('relative' as const),
    width: '100%',
    zIndex: viewModeOpacity.value > 0 ? 1 : 0,
  }));

  const editModeStyle = useAnimatedStyle(() => ({
    opacity: editModeOpacity.value,
    position: editModeOpacity.value === 0 ? ('absolute' as const) : ('relative' as const),
    width: '100%',
    zIndex: editModeOpacity.value > 0 ? 1 : 0,
  }));

  useEffect(() => {
    if (!visible) return;
    const delay = 24;
    if (reduceMotion) {
      sheetTranslateY.setValue(0);
      sheetOpacity.setValue(1);
      return;
    }
    sheetTranslateY.setValue(16);
    sheetOpacity.setValue(0);
    RNAnimated.parallel([
      RNAnimated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 160,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      RNAnimated.timing(sheetOpacity, {
        toValue: 1,
        duration: 150,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reduceMotion, sheetTranslateY, sheetOpacity]);


  // animate commitment reveal/hide
  useEffect(() => {
    try {
      if (commitmentAnim && typeof (commitmentAnim as any).value !== 'undefined') {
        (commitmentAnim as any).value = conditionalAnimation(
          withTiming(state.commitment ? 1 : 0, timingConfig.normal),
          state.commitment ? 1 : 0,
          reduceMotion,
        );
      }
    } catch (e) {
      // ignore incomplete mocks in tests
    }
  }, [state.commitment, commitmentAnim, reduceMotion]);

  // Animate view ↔ edit mode crossfade
  useEffect(() => {
    try {
      const duration = reduceMotion ? 0 : 180;
      if (isViewMode) {
        viewModeOpacity.value = withTiming(1, { duration });
        editModeOpacity.value = withTiming(0, { duration });
      } else {
        viewModeOpacity.value = withTiming(0, { duration });
        editModeOpacity.value = withTiming(1, { duration });
      }
    } catch (e) {
      // ignore incomplete mocks in tests
    }
  }, [mode, viewModeOpacity, editModeOpacity, reduceMotion]);

  // load existing draft once
  const currentText =
    baseType === 'log'
      ? state.log.body
      : baseType === 'todo'
        ? state.todo.details
        : state.habit.notes;

  function pushUndoEntry(kind: 'type' | 'tag' | 'commitment', prev: Partial<any>) {
    undoStackRef.current = [...undoStackRef.current, { kind, prev }];
    setShowUndoToast(true);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current as any);
    }
    // auto hide after 3s
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    undoTimerRef.current = setTimeout(() => setShowUndoToast(false), 3000) as unknown as number;
  }

  function handleUndo() {
    const stack = undoStackRef.current;
    if (stack.length > 0) {
      const last = stack[stack.length - 1];
      undoStackRef.current = stack.slice(0, -1);
      store.patchDraft(last.prev);
    }
    setShowUndoToast(false);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current as any);
      undoTimerRef.current = null;
    }
  }

  function safeFormat(iso: string | null | undefined) {
    try {
      if (!iso) return '';
      return format(parseISO(iso), 'MMM d');
    } catch (e) {
      return '';
    }
  }

  /**
   * Format due_day (YYYY-MM-DD) for display.
   * This is the canonical way to display todo due dates.
   */
  function formatDueDay(dueDay: string | null | undefined): string {
    if (!dueDay) return '';
    return getDateService().formatForChip(dueDay);
  }

  function formatDueTime(time: string | null | undefined): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const isPM = h >= 12;
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
  }

  // Initial defaults (match brief: text-first; first line becomes title)
  // CRITICAL: Always get full entity from store to ensure commitment fields round-trip
  // Today/Now selectors may pass truncated entity shapes that lose commitment fields
  // → Now handled by store.open() via hydrateEntityToDraft (one-shot)

  // Load existing log photos from database (Phase L5)
  useEffect(() => {
    const loadLogPhotos = async () => {
      const entityType = (initialEntity as any)?.type;
      const isNoteEntity = entityType === 'note' || entityType === 'log';

      if (mode !== 'edit' || !initialEntity || !isNoteEntity) return;

      const noteId = (initialEntity as any)?.id;
      if (!noteId) return;

      try {
        const data = await listLogPhotos(noteId);

        if (data && data.length > 0) {
          const photos: LogPhoto[] = data.map((row) => ({
            id: row.id,
            url: row.url,
            position: row.position,
            isNew: false,
            isDeleted: false,
          }));
          setLogPhotos(photos);
        }
      } catch (err) {
        // ignore photo load errors gracefully
      }
    };

    loadLogPhotos();
  }, [mode, initialEntity, listLogPhotos]);

  // Phase 6 Task 4: Fallback prefill retry on overlay open
  // When user manually opens overlay for a Mind Drop with ai_failed=true and minddrop_stage='classified',
  // retry backgroundPrefill once (guarded by minddrop_retry_attempted flag)
  useEffect(() => {
    const attemptFallbackPrefill = async () => {
      if (mode !== 'edit' || !initialEntity) return;

      const entity = initialEntity as any;
      const views = entity?.views ?? {};

      // Only retry if:
      // 1. AI failed on Stage B
      // 2. Entity is still in 'classified' stage (never got prefilled)
      // 3. Haven't attempted retry before
      const shouldRetry =
        views.ai_failed === true &&
        views.minddrop_stage === 'classified' &&
        views.minddrop_retry_attempted !== true;

      if (!shouldRetry) return;

      console.debug('[MindDrop.FallbackRetry]', {
        entityId: entity.id,
        entityType: entity.type,
        stage: views.minddrop_stage,
        retrying: true,
      });

      try {
        // Import backgroundPrefill dynamically to avoid circular deps
        const { backgroundPrefill } = await import('../../lib/minddrop/backgroundPrefill');

        // Get raw text for prefill
        const rawText = entity.body?.trim() || entity.title?.trim() || entity.name?.trim() || '';

        // Retry prefill
        await backgroundPrefill(entity, rawText);

        // Mark retry as attempted (even if prefill fails again, don't retry infinitely)
        // Use type-specific update mutation
        const patch = {
          views: {
            ...views,
            minddrop_retry_attempted: true,
          },
        };
        if (entity.type === 'todo') {
          await updateTodo(entity.id, patch);
        } else if (entity.type === 'habit') {
          await updateHabit(entity.id, patch);
        } else {
          await updateNote(entity.id, patch);
        }
      } catch (err) {
        console.error('[MindDrop.FallbackRetry] Retry failed', err);

        // Still mark as attempted to prevent infinite retries
        try {
          const failPatch = {
            views: {
              ...views,
              minddrop_retry_attempted: true,
              ai_failed: true, // Keep failure state
            },
          };
          if (entity.type === 'todo') {
            await updateTodo(entity.id, failPatch);
          } else if (entity.type === 'habit') {
            await updateHabit(entity.id, failPatch);
          } else {
            await updateNote(entity.id, failPatch);
          }
        } catch (updateErr) {
          console.error('[MindDrop.FallbackRetry] Failed to mark retry attempt', updateErr);
        }
      }
    };

    attemptFallbackPrefill();
  }, [mode, initialEntity, updateNote, updateTodo, updateHabit]);

  // Clear photos when switching away from log type (Phase L5)
  useEffect(() => {
    if (mode !== 'edit') return;
    if (hasLoadedEditTagsRef.current) return;

    // Extract tags from entity props or store — hydration already sets tags
    // via store.open(), so this is a safety net only. We must NOT merge with
    // currentTagsRef (which reflects the previous render and may hold a stale
    // entity's tags). Instead, set tags directly from the entity source.
    let entityTags = extractTagKeysFromEntity(initialEntity);

    if (entityTags.length === 0) {
      const entityId = (initialEntity as any)?.id;
      if (entityId) {
        const entity = getItemById(entityId);
        if (entity) {
          entityTags = extractTagKeysFromEntity(entity);
        }
      }
    }

    if (entityTags.length > 0) {
      store.setTags(entityTags);
    }
    hasLoadedEditTagsRef.current = true;
  }, [mode, initialEntity, getItemById]);

  // Detect if item already has AI-generated content from Mind Drop
  const hasAiTags = useMemo(() => {
    const entity = initialEntity as any;
    return Array.isArray(entity?.tags) && entity.tags.length > 0;
  }, [initialEntity]);

  const hasAiTitle = useMemo(() => {
    const short = getEntityShortTitle(initialEntity as any);
    return !!short && short.trim().length > 0;
  }, [initialEntity]);

  const isAiPlaced = useMemo(() => {
    const entity = initialEntity as any;
    return entity?.ai_placed === true;
  }, [initialEntity]);

  // Phase 2: Overlay no longer runs AI prefill on edit. Titles and tags come only from backgroundPrefill.

  const suggestedTitleRef = useRef<string | null>(null);

  // Track previous title to detect manual edits after an AI suggestion was applied
  const prevTitleRef = useRef<string | null>(null);

  const resuggestRequestIdRef = useRef(0);
  const resuggestAppliedIdRef = useRef(0);

  // AI Tag Override for Mind Drop items
  // Phase 2: Removed Mind Drop tag override logic - overlay no longer runs AI prefill
  const aiTagOverrideAppliedRef = useRef(false);

  const stickyCanonicalMap = useMemo(() => {
    const map = new Map<string, string>();
    (state.stickyTags ?? []).forEach((entry) => {
      if (typeof entry !== 'string') return;
      const { canonical, slug } = toCanonicalParts(entry);
      if (!canonical || !slug) return;
      if (!map.has(slug)) {
        map.set(slug, canonical);
      }
    });
    return map;
  }, [state.stickyTags]);

  const activeTagChips = useMemo((): TagsRowTag[] => {
    if (!Array.isArray(state.tags)) return [];
    const entries: TagsRowTag[] = [];
    state.tags.forEach((slug) => {
      const canonicalCandidate = stickyCanonicalMap.get(slug) ?? toCanonicalParts(slug).canonical;
      if (!canonicalCandidate) return;
      const provenance = stickyCanonicalMap.has(slug) ? 'You' : undefined;
      entries.push({
        canonical: canonicalCandidate,
        slug,
        provenance,
      });
    });
    return entries;
  }, [state.tags, stickyCanonicalMap]);

  const handleTagToggle = useCallback(
    (tag: string) => {
      const normalized = normalizeToTagKey(tag);
      if (!normalized) return;

      const stickySnapshot = Array.isArray(state.stickyTags) ? [...state.stickyTags] : [];
      const tombstoneSnapshot = Array.isArray(state.tagTombstones) ? [...state.tagTombstones] : [];

      pushUndoEntry('tag', {
        tags: [...state.tags],
        list: state.list,
        mood: state.mood,
        stickyTags: stickySnapshot,
        tagTombstones: tombstoneSnapshot,
      });

      const isActive = state.tags.includes(normalized);
      const metaSource = tag;

      if (isActive) {
        const nextTags = state.tags.filter((t) => t !== normalized);
        const nextSticky = removeMetaTag(stickySnapshot, metaSource);
        const nextTombstones = addMetaTag(tombstoneSnapshot, metaSource);
        store.setTags(nextTags);
        setTagsDirty(true); // Mark tags as user-modified
        return;
      }

      const nextTags = [...state.tags, normalized];
      const nextSticky = stickySnapshot;
      const nextTombstones = removeMetaTag(tombstoneSnapshot, metaSource);
      store.setTags(nextTags);
      setTagsDirty(true); // Mark tags as user-modified
    },
    [state.list, state.mood, state.tags, state.stickyTags, state.tagTombstones],
  );

  const handleTagAdd = useCallback(
    (raw: string) => {
      const { tag: canonical } = normalizeTag(typeof raw === 'string' ? raw : '');
      if (!canonical) return;
      const normalized = normalizeToTagKey(canonical);
      if (!normalized) return;

      const stickySnapshot = Array.isArray(state.stickyTags) ? [...state.stickyTags] : [];
      const tombstoneSnapshot = Array.isArray(state.tagTombstones) ? [...state.tagTombstones] : [];

      pushUndoEntry('tag', {
        tags: [...state.tags],
        list: state.list,
        mood: state.mood,
        stickyTags: stickySnapshot,
        tagTombstones: tombstoneSnapshot,
      });

      const exists = state.tags.includes(normalized);
      const nextTags = exists ? [...state.tags] : [...state.tags, normalized];
      const nextSticky = addMetaTag(stickySnapshot, canonical);
      const nextTombstones = removeMetaTag(tombstoneSnapshot, canonical);

      store.setTags(nextTags);
      setTagsDirty(true); // Mark tags as user-modified
    },
    [state.list, state.mood, state.tags, state.stickyTags, state.tagTombstones],
  );

  const handleTelemetryTagAdd = useCallback((canonical: string) => {
    if (!canonical) return;
    void emitOverlayEvent({ type: 'overlay_tag_user_add', label: canonical });
  }, []);

  const handleTelemetryTagRemove = useCallback((canonical: string, wasAi: boolean) => {
    if (!canonical) return;
    void emitOverlayEvent({ type: 'overlay_tag_user_remove', label: canonical, wasAi });
  }, []);

  // Multi-photo handlers for logs (Phase L5)
  const handleAddLogPhoto = useCallback(
    async (fromCamera: boolean) => {
      // Check max limit
      const activePhotos = logPhotos.filter((p) => !p.isDeleted);
      if (activePhotos.length >= 5) {
        Alert.alert('Maximum Photos', 'You can add up to 5 photos per log entry.');
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
          const newPhoto: LogPhoto = {
            url: result.assets[0].uri,
            position: logPhotos.length,
            isNew: true,
            isDeleted: false,
          };
          setLogPhotos((prev) => [...prev, newPhoto]);
        }
      } catch (error) {
        console.error('Error adding photo:', error);
        Alert.alert('Error', 'Failed to add photo. Please try again.');
      }
    },
    [logPhotos],
  );

  const handleOpenMultiPhotoActionSheet = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleAddLogPhoto(true);
          } else if (buttonIndex === 2) {
            handleAddLogPhoto(false);
          }
        },
      );
    } else {
      Alert.alert(
        'Add Photo',
        'Choose an option',
        [
          { text: 'Take Photo', onPress: () => handleAddLogPhoto(true) },
          { text: 'Choose from Library', onPress: () => handleAddLogPhoto(false) },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true },
      );
    }
  }, [handleAddLogPhoto]);

  const handleViewLogPhoto = useCallback((index: number) => {
    setSelectedPhotoIndex(index);
  }, []);

  const showDueToast = useCallback((message: string) => {
    setDueToastMessage(message);
    if (dueToastTimerRef.current) {
      clearTimeout(dueToastTimerRef.current as any);
    }
    dueToastTimerRef.current = setTimeout(() => {
      setDueToastMessage(null);
      dueToastTimerRef.current = null;
    }, 1000) as unknown as number;
  }, []);

  const handleDateConfirm = useCallback((date: Date) => {
    try {
      const dateStr = getDateService().toLocalDate(date);
      if (dateModalTarget === 'reminder') {
        store.setReminderAt(date.toISOString());
      } else if (dateModalTarget === 'todo_deadline') {
        store.setTodoTargetDate(dateStr);
        showDueToast(`Deadline set for ${format(date, 'MMM d')}`);
      } else if (dateModalTarget === 'todo_dodate') {
        store.setTodoScheduledDate(dateStr);
        store.setTodoDue({ due_at: null, due_day: dateStr, due_time: null });
        showDueToast(`Do date set for ${format(date, 'MMM d')}`);
      } else if (dateModalTarget === 'note_event') {
        store.setLogTargetDate(dateStr);
        showDueToast(`Event date set for ${format(date, 'MMM d')}`);
      } else if (dateModalTarget === 'note_end_date') {
        store.setLogEndDate(dateStr);
        showDueToast(`End date set for ${format(date, 'MMM d')}`);
      }
      store.setUI({ showDateModal: false });
      setDateModalTarget(null);
      setShowTimePicker(false);
      setClearDateFlag(false);
      setSelectedTimePreset(null);
      setShowCustomTimePicker(false);
    } catch (e) {
      console.error('[DatePicker] Error setting date:', e);
    }
  }, [dateModalTarget, store, showDueToast, setDateModalTarget, setShowTimePicker, setClearDateFlag, setSelectedTimePreset, setShowCustomTimePicker]);

  const handleTodoDueChange = useCallback(
    (dateOrNull: Date | null, options?: { label?: string }) => {
      // GREMLY TODO DATE MODEL:
      // Use due_day (YYYY-MM-DD) as the canonical source of truth.
      // Do NOT use due_at for Mind Drop / Today logic.
      // This avoids UTC timezone drift issues.

      if (dateOrNull) {
        // Compute due_day using local timezone helper
        const dueDay = getDateService().toLocalDate(dateOrNull);

        // Dispatch with due_day as source of truth, due_at = null (not used)
        store.setTodoDue({
          due_at: null, // Explicitly null - we don't use due_at for all-day todos
          due_day: dueDay,
          due_time: null, // All-day todos have no specific time
        });

        const formatted = options?.label ?? format(dateOrNull, 'MMM d');
        showDueToast(`Due set for ${formatted}`);
        void emitOverlayEvent({ type: 'overlay_due_set' });
      } else {
        // Clear all due date fields - user pressed Clear
        store.setTodoDue({
          due_at: null,
          due_day: null,
          due_time: null,
        });
        showDueToast('Due cleared');
        void emitOverlayEvent({ type: 'overlay_due_clear' });
      }
    },
    [showDueToast],
  );

  // Phase 2: Removed prefill suggestion normalization effect - overlay no longer runs AI prefill

  // theme / background for overlay (phase‑8 visual polish)
  const colorMode = useColorScheme();
  const tokens = colorMode === 'dark' ? darkTokens : lightTokens;
  const sheetBackground = tokens.colors.linen;

  const typeTabActiveColor = tokens.colors.moss;
  const typeTabInactiveColor =
    colorMode === 'dark' ? 'rgba(248,250,249,0.65)' : 'rgba(34,34,34,0.55)';
  const typeTabUnderlineColor = tokens.colors.moss;

  // Type-specific accent colors for subtle underline
  const getTypeAccentColor = (type: BaseType): string => {
    if (colorMode === 'dark') {
      // Darker mode uses subtle variations
      return type === 'todo'
        ? 'rgba(174, 184, 255, 0.5)' // periwinkle hint
        : type === 'habit'
          ? 'rgba(191, 216, 192, 0.5)' // sage hint
          : 'rgba(255,255,255,0.2)'; // neutral gray
    }
    // Light mode: soft, subtle accent colors
    return type === 'todo'
      ? '#C5D0FF' // soft periwinkle/blue
      : type === 'habit'
        ? '#C8E6C9' // soft sage/green
        : '#E0E0E0'; // soft gray for log
  };

  const headerPulseColor =
    colorMode === 'dark' ? 'rgba(94, 160, 138, 0.35)' : 'rgba(46, 125, 106, 0.18)';
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const overlaySubtitle = state.compactTitle?.trim() ?? '';

  // Derived "Lock In" state from commitment field
  const isLockedIn = !!state.commitment && (baseType === 'todo' || baseType === 'habit');

  // Log timestamp and mood (Phase L2)
  const logTimestampLabel = isLog
    ? formatLogTimestamp(mode, fullEntity ?? initialEntity ?? null)
    : '';
  const currentMood = state.mood ?? 'neu';

  // Log subtype chip label - only show for non-plain subtypes
  const logSubtypeLabel = isLog ? getLogSubtypeChipLabel(effectiveLogSubtype) : null;

  const canSave = currentText.trim().length > 0 && !storeUI.saving;

  // Save context for buildSavePayload (extracted to overlaySave.ts)
  const saveContext: SaveContext = useMemo(() => ({
    mode,
    initialEntity,
    fullEntity: fullEntity ?? initialEntity,
    tagsDirty,
    isViewMode,
    isChecklistMode,
    checklistItems,
    userEditedTitle: state.userEditedTitle,
  }), [mode, initialEntity, fullEntity, tagsDirty, isViewMode, isChecklistMode, checklistItems, state.userEditedTitle]);

  /* --- toCreateOrUpdateInput was here; now lives in overlaySave.ts as buildSavePayload --- */

  const onSave = useCallback(async () => {
    if (!canSave) return;
    // If offline, surface a small hint and keep the draft (enqueue behavior no-op here)
    if (isOffline) {
      setSaveError("You're offline — Save will keep the draft.");
      return;
    }

    // Key Dates: Events require a target_date
    if (isLog && effectiveLogSubtype === 'event' && !state.log.target_date) {
      Alert.alert('Date required', 'Key dates must have a date set.');
      return;
    }

    setSaveError(null);
    store.setUI({ saving: true });
    try {
      const stateForSave = { ...state, itemReminders };

      // Build save context with fresh ref values
      const ctx: SaveContext = saveContext;

      const input = await buildSavePayload(
        baseType,
        stateForSave as any,
        initialSpaceId ?? null,
        fullEntity,
        ctx,
        photoUri, // Phase L3: Pass photo URI
        moods, // Phase L4: Pass multi-select moods for journals
        effectiveLogSubtype, // Phase L8: Pass effective log subtype
      );

      // ── Schedule item reminders and persist to entity ──────────────────────
      if (baseType === 'todo' || baseType === 'habit') {
        const entityTitle = (input as any).title || (input as any).name || state.compactTitle || '';
        const oldReminders: ItemReminder[] = (fullEntity?.reminders as ItemReminder[]) ?? [];
        const remindersChanged = JSON.stringify(itemReminders) !== JSON.stringify(oldReminders);

        if (remindersChanged) {
          // Cancel old reminders (fire and forget — don't block save)
          cancelAllItemReminders(oldReminders).catch(() => {});

          // Schedule new reminders and collect notification IDs
          const scheduledReminders: ItemReminder[] = [];
          for (const reminder of itemReminders) {
            const notificationId = await scheduleItemReminder(
              fullEntity?.id || 'new',
              entityTitle,
              baseType === 'habit' ? 'habit' : 'todo',
              reminder,
            );
            scheduledReminders.push({
              ...reminder,
              notificationId: notificationId ?? undefined,
            });
          }

          (input as any).reminders = scheduledReminders.length > 0 ? scheduledReminders : null;
        } else if (itemReminders.length > 0) {
          // Reminders unchanged but present — persist them as-is
          (input as any).reminders = itemReminders;
        } else if (oldReminders.length > 0 && itemReminders.length === 0) {
          // User cleared all reminders
          (input as any).reminders = null;
        }
      }

      const telemetryTitle =
        typeof (input as any)?.title === 'string'
          ? ((input as any).title as string)
          : typeof (input as any)?.name === 'string'
            ? ((input as any).name as string)
            : state.compactTitle || '';
      const telemetryTagCount = Array.isArray((input as any)?.tags)
        ? (input as any).tags.length
        : state.tags.length;
      const telemetryDueAt = baseType === 'todo' ? ((input as any)?.due_at ?? null) : null;

      /**
       * ─────────────────────────────────────────────────────────────────────────
       * TYPE CHANGE DETECTION AND CROSS-TABLE CONVERSION
       * ─────────────────────────────────────────────────────────────────────────
       *
       * When the user changes the type in the overlay (e.g., log → todo), we need
       * to handle cross-table conversions properly since Supabase uses separate
       * tables for each entity type (notes, todos, habits).
       *
       * CONVERSION FLOW:
       * 1. Detect if the target type family differs from the original entity's family
       * 2. If cross-table conversion needed:
       *    a. Create new record in the target table with all fields + drop_id
       *    b. Archive/delete the old record in the source table
       *    c. Emit conversion telemetry
       * 3. If same-table update (e.g., log subtype change):
       *    a. Use standard repo.update()
       *
       * SUPPORTED CONVERSIONS:
       * - note/log → todo: Create todo, archive note
       * - note/log → habit: Create habit, archive note
       * - todo → note/log: Create note, archive todo
       * - todo → habit: Create habit, archive todo
       * - habit → todo: Create todo, archive habit
       * - habit → note/log: Create note, archive habit
       * ─────────────────────────────────────────────────────────────────────────
       */

      // Determine original and target type families
      const originalEntityType = (initialEntity as any)?.type;
      const originalFamily: TypeFamily | null =
        originalEntityType === 'todo'
          ? 'todo'
          : originalEntityType === 'habit'
            ? 'habit'
            : originalEntityType === 'note'
              ? 'note'
              : null;
      const targetFamily = TYPE_FAMILY[baseType];

      // Detect cross-table type conversion
      const isTypeConversion =
        (mode === 'edit' || isViewMode) &&
        (initialEntity as any)?.id &&
        originalFamily !== null &&
        originalFamily !== targetFamily;

      let result: any;

      if (isTypeConversion) {
        // ─────────────────────────────────────────────────────────────────────
        // CROSS-TABLE CONVERSION FLOW
        // ─────────────────────────────────────────────────────────────────────
        const oldId = (initialEntity as any).id;
        const dropId = (fullEntity as any)?.drop_id ?? (initialEntity as any)?.drop_id ?? null;

        // Ensure drop_id is preserved in the create input
        const createInput = {
          ...(input as any),
          dropId: dropId, // Preserve Mind Drop linkage
        };

        // Step 1: Create new record in target table (use type-specific mutation)
        if (targetFamily === 'todo') {
          result = await createTodo(createInput);
        } else if (targetFamily === 'habit') {
          result = await createHabit(createInput);
        } else {
          result = await createNote(createInput);
        }

        // Step 2: Archive/delete old record - moved to fire-and-forget background IIFE
        // (handled after overlay closes, see backgroundConversionOldId below)

        // Emit conversion telemetry
        try {
          eventBus.emit('OverlayTypeConverted', {
            from: originalEntityType,
            to: baseType,
            oldId,
            newId: result?.id ?? '',
            dropId,
          });
        } catch (e) {
          // Ignore telemetry errors
        }
      } else {
        // ─────────────────────────────────────────────────────────────────────
        // STANDARD UPDATE/CREATE FLOW (same table or new entity)
        // ─────────────────────────────────────────────────────────────────────
        const isEdit = (mode === 'edit' || isViewMode) && (initialEntity as any)?.id;
        const entityId = (initialEntity as any)?.id;

        // Use type-specific store mutations
        if (isEdit) {
          // Update existing entity (mutations return void, so get from store after)
          if (baseType === 'todo') {
            await updateTodo(entityId, input as any);
            result = getItemById(entityId);
          } else if (baseType === 'habit') {
            await updateHabit(entityId, input as any);
            result = getItemById(entityId);
          } else {
            await updateNote(entityId, input as any);
            result = getItemById(entityId);
          }
        } else {
          // Create new entity
          if (baseType === 'todo') {
            result = await createTodo(input as any);
          } else if (baseType === 'habit') {
            result = await createHabit(input as any);
          } else {
            result = await createNote(input as any);
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // IMMEDIATE CLOSE: Core save succeeded, close overlay immediately
      // Zustand mutations already did optimistic updates, so UI is correct.
      // ─────────────────────────────────────────────────────────────────────────
      const savedType = (result as any)?.type ?? baseType;
      const savedId = result?.id;

      // Clear saving state
      store.setUI({ saving: false });
      setUserClearedChecklist(false);

      // Notify parent and close
      try {
        onSaved?.({
          id: savedId,
          type: savedType,
          savedEntity: result,
        } as any);
      } catch (e) {
        console.error('[UnifiedOverlayV2] onSaved failed:', e);
      }

      // Fire success haptic before close
      if (!reduceMotion) {
        try {
          Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);
        } catch (err) {
          // ignore
        }
      }

      // Close immediately - no animation delay
      onClose?.();

      // ─────────────────────────────────────────────────────────────────────────
      // FIRE-AND-FORGET BACKGROUND SYNC
      // Photo uploads, tag/person linking, and telemetry run after overlay closes.
      // Capture result in closure since overlay state will be cleared.
      // ─────────────────────────────────────────────────────────────────────────
      const backgroundResult = result;
      const backgroundBaseType = baseType;
      const backgroundLogPhotos = [...logPhotos];
      const backgroundUserId = userId;
      const backgroundPhase8Links = phase8Links;
      const backgroundRepo = repo;
      const backgroundState = state;

      // Capture cross-table conversion info for background archival
      const backgroundConversionOldId = isTypeConversion ? (initialEntity as any)?.id : null;
      const backgroundConversionEntityType = isTypeConversion
        ? (originalEntityType as 'todo' | 'habit' | 'note')
        : null;

      // Capture Sweep conversion source note ID (from conversionMeta.sourceNoteId)
      const backgroundSweepSourceNoteId = conversionMeta?.sourceNoteId ?? null;

      // Capture delete methods for background archival (archive by ID, not drop_id)
      const backgroundDeleteTodo = deleteTodo;
      const backgroundDeleteHabit = deleteHabit;
      const backgroundDeleteNote = deleteNote;
      const backgroundArchiveNote = archiveNote; // Soft delete for Sweep conversions

      (async () => {
        try {
          // Archive old entity for cross-table conversions (fire-and-forget)
          // Use delete by ID (not drop_id) to avoid archiving the newly created entity
          if (backgroundConversionOldId && backgroundConversionEntityType) {
            try {
              switch (backgroundConversionEntityType) {
                case 'todo':
                  await backgroundDeleteTodo(backgroundConversionOldId);
                  break;
                case 'habit':
                  await backgroundDeleteHabit(backgroundConversionOldId);
                  break;
                case 'note':
                  await backgroundDeleteNote(backgroundConversionOldId);
                  break;
              }
            } catch (removeError) {
              console.warn(
                '[UnifiedOverlayV2] Background: Failed to archive old entity during conversion:',
                removeError,
              );
              // Non-fatal: new entity already exists
            }
          }

          // Archive source note for Sweep conversions (note → todo via Sweep)
          if (backgroundSweepSourceNoteId && !backgroundConversionOldId) {
            try {
              await backgroundArchiveNote(backgroundSweepSourceNoteId, 'sweep-conversion');
            } catch (removeError) {
              console.warn(
                '[UnifiedOverlayV2] Background: Failed to archive Sweep source note:',
                removeError,
              );
              // Non-fatal: new todo already exists
            }
          }

          // Handle multi-photo uploads and deletions for logs (Phase L5)
          if (backgroundBaseType === 'log' && backgroundResult?.id && backgroundUserId) {
            try {
              const noteId = backgroundResult.id;
              const { supabase } = await import('../../lib/supabase/client');

              // Process deletions first
              for (const photo of backgroundLogPhotos) {
                if (photo.isDeleted && photo.id) {
                  try {
                    // Delete from store (store mutation)
                    await deleteLogPhoto(photo.id);

                    // Try to delete from storage (best effort)
                    if (photo.url && photo.url.includes('log-photos/')) {
                      const pathMatch = photo.url.match(/log-photos\/(.+)$/);
                      if (pathMatch) {
                        await supabase.storage.from('log-photos').remove([pathMatch[1]]);
                      }
                    }
                  } catch (err) {
                    console.error('[UnifiedOverlayV2] Background: Error deleting photo:', err);
                  }
                }
              }

              // Process new photo uploads
              const activePhotos = backgroundLogPhotos.filter((p) => !p.isDeleted);
              for (let i = 0; i < activePhotos.length; i++) {
                const photo = activePhotos[i];
                if (photo.isNew && photo.url.startsWith('file://')) {
                  try {
                    // Generate unique storage path
                    const fileExt = photo.url.split('.').pop() || 'jpg';
                    const uniqueId = `${getDateService().now().getTime()}-${Math.random().toString(36).substring(7)}`;
                    const storagePath = `${backgroundUserId}/${noteId}/${uniqueId}.${fileExt}`;

                    // React Native: Create ArrayBuffer from file URI
                    const response = await fetch(photo.url);
                    const arrayBuffer = await response.arrayBuffer();

                    // Upload to storage
                    const { error: uploadError } = await supabase.storage
                      .from('log-photos')
                      .upload(storagePath, arrayBuffer, {
                        contentType: 'image/jpeg',
                        upsert: false,
                      });

                    if (uploadError) {
                      console.error(
                        '[UnifiedOverlayV2] Background: Failed to upload photo:',
                        uploadError,
                      );
                      continue;
                    }

                    // Get public URL
                    const { data: urlData } = supabase.storage
                      .from('log-photos')
                      .getPublicUrl(storagePath);

                    const publicUrl = urlData?.publicUrl || storagePath;

                    // Insert into store (store mutation)
                    await insertLogPhoto({
                      noteId,
                      url: publicUrl,
                      position: i,
                    });
                  } catch (err) {
                    console.error('[UnifiedOverlayV2] Background: Error uploading photo:', err);
                  }
                } else if (!photo.isNew && photo.id) {
                  // Update position for existing photos (store mutation)
                  try {
                    await updateLogPhotoPosition(photo.id, i);
                  } catch (err) {
                    console.error(
                      '[UnifiedOverlayV2] Background: Error updating photo position:',
                      err,
                    );
                  }
                }
              }
            } catch (err) {
              console.error('[UnifiedOverlayV2] Background: Error processing log photos:', err);
            }
          }

          // Link any pending Phase‑8 tags/people
          try {
            const itemType =
              backgroundBaseType === 'todo'
                ? 'todo'
                : backgroundBaseType === 'habit'
                  ? 'habit'
                  : 'note';

            // Link any pending tags first (non-blocking failures)
            if ((backgroundPhase8Links as any)?.pendingTagIds?.length) {
              for (const tagId of (backgroundPhase8Links as any).pendingTagIds) {
                try {
                  await (backgroundRepo as any).linkTag({
                    itemId: backgroundResult.id,
                    tagId,
                    itemType,
                  });
                } catch (err) {
                  console.error('[Phase8] Background: Failed to link pending tag to item:', err);
                }
              }
            }

            // Link any pending people
            if ((backgroundPhase8Links as any)?.pendingPeople?.length) {
              for (const person of (backgroundPhase8Links as any).pendingPeople) {
                try {
                  await (backgroundRepo as any).linkPerson({
                    itemId: backgroundResult.id,
                    itemType,
                    personName: person.personName,
                    personEmail: person.personEmail,
                  });
                } catch (err) {
                  console.error('[Phase8] Background: Failed to link pending person to item:', err);
                }
              }
            }

            // If there are pendingPeople entries (temp links), try to persist them
            if ((backgroundPhase8Links as any)?.pendingPeople?.length) {
              for (const p of (backgroundPhase8Links as any).pendingPeople) {
                try {
                  const pid = p.id;
                  if (pid && typeof (backgroundRepo as any).linkPersonToEntity === 'function') {
                    await (backgroundRepo as any).linkPersonToEntity({
                      entityId: backgroundResult.id,
                      personId: pid,
                    });
                  } else if (
                    pid &&
                    (backgroundRepo as any).entities &&
                    typeof (backgroundRepo as any).entities.linkPerson === 'function'
                  ) {
                    await (backgroundRepo as any).entities.linkPerson({
                      entityId: backgroundResult.id,
                      personId: pid,
                    });
                  } else if (
                    pid &&
                    (backgroundRepo as any).people &&
                    typeof (backgroundRepo as any).people.linkToEntity === 'function'
                  ) {
                    await (backgroundRepo as any).people.linkToEntity({
                      entityId: backgroundResult.id,
                      personId: pid,
                    });
                  }
                } catch (err) {
                  console.error('[Phase8] Background: Failed to persist pending person link:', err);
                }
              }
            }

            // Note: Removed clearPendingPeople/clearPendingTags calls here
            // These would attempt to update React state after overlay unmount
            // The state will be reset when the overlay reopens anyway
          } catch (err) {
            console.error('[UnifiedOverlayV2] Background: post-save linking failed', err);
          }

          // Attempt to link the explicitly selected person (non-blocking)
          try {
            await linkSelectedPerson(
              backgroundRepo,
              backgroundResult?.id,
              (backgroundState as any).person?.id,
            );
          } catch (err) {
            console.error('[UnifiedOverlayV2] Background: person link failed', err);
          }

          // Emit telemetry
          void emitOverlayEvent({
            type: 'overlay_save',
            entryType: backgroundBaseType,
            titleLen: telemetryTitle.length,
            tagCount: telemetryTagCount,
            dueAt: telemetryDueAt ?? null,
          });

          // Emit overlay saved analytics
          try {
            eventBus.emit('OverlaySaved', { id: backgroundResult?.id, type: savedType });
          } catch (e) {
            // ignore
          }
        } catch (err) {
          console.error('[UnifiedOverlayV2] Background sync failed:', err);
          // Could show a toast here, but don't block the user
        }
      })();
    } catch (e) {
      console.error('[UnifiedOverlayV2] save failed', e);
      // show inline retry bar; do not clear draft
      setSaveError('Save failed. Retry?');
      store.setUI({ saving: false });
    }
  }, [
    canSave,
    baseType,
    state,
    initialSpaceId,
    mode,
    initialEntity,
    fullEntity,
    repo,
    onClose,
    isOffline,
    reduceMotion,
    headerPulse,
    photoUri, // Phase L3: Photo dependency
    moods, // Phase L4: Multi-select moods dependency
    conversionMeta, // Sweep conversion: capture sourceNoteId for archival
  ]);

  const handleCancel = useCallback(async () => {
    onClose?.();
  }, [onClose]);

  // ============================================================================
  // HABIT VIEW MODE HANDLERS
  // ============================================================================
  const handleLogHabitToday = useCallback(() => {
    const habitId = fullEntity?.id || (initialEntity as any)?.id;
    if (habitId) {
      completeHabit(habitId);
    }
  }, [fullEntity, initialEntity, completeHabit]);

  const handleLogHabitDate = useCallback(
    (dateIso: string) => {
      const habitId = fullEntity?.id || (initialEntity as any)?.id;
      if (habitId) {
        logHabitCompletionForDate(habitId, dateIso);
      }
    },
    [fullEntity, initialEntity, logHabitCompletionForDate],
  );

  const handleRemoveHabitDate = useCallback(
    (dateIso: string) => {
      const habitId = fullEntity?.id || (initialEntity as any)?.id;
      if (habitId) {
        removeHabitCompletionForDate(habitId, dateIso);
      }
    },
    [fullEntity, initialEntity, removeHabitCompletionForDate],
  );

  const handleUpdateHabitWhy = useCallback(
    async (why: string) => {
      const habitId = fullEntity?.id || (initialEntity as any)?.id;
      if (habitId) {
        await updateHabit(habitId, { why_string: why });
      }
    },
    [fullEntity, initialEntity, updateHabit],
  );

  const handleOpenHabitChat = useCallback(() => {
    store.setUI({ showEntityChat: true });
  }, []);

  // ============================================================================
  // VIEW MODE CONTENT RENDERER
  // ============================================================================
  // Renders a read-optimized display layout for viewing entities
  const renderViewModeContent = () => {
    const entity = fullEntity || viewModeEntity || initialEntity;
    if (!entity) return null;

    const entityTitle = (entity as any).name || (entity as any).title || 'Untitled';
    const entityBody =
      (entity as any).body || (entity as any).notes || (entity as any).content || '';
    const entityTags = state.tags || [];
    const entitySpaceName = state.spaceId ? spaces.find((s) => s.id === state.spaceId)?.name : null;
    const entityCreatedAt = (entity as any).created_at;

    const formattedCreatedDate = entityCreatedAt
      ? format(parseISO(entityCreatedAt), 'MMM d, yyyy')
      : null;

    const bodyHasContent =
      entityBody && entityBody.trim() && entityBody.trim() !== entityTitle.trim();

    // Build schedule summary for todo/habit metadata card
    const scheduleParts: string[] = [];
    if (baseType === 'todo') {
      const effectiveDoDate = state.todo.scheduled_date ?? state.todo.due_day;
      if (effectiveDoDate) scheduleParts.push(formatDueDay(effectiveDoDate));
      if (state.todo.time_estimate_minutes)
        scheduleParts.push(formatTimeEstimate(state.todo.time_estimate_minutes));
      if (state.todo.due_time) scheduleParts.push(formatDueTime(state.todo.due_time));
      if (state.todo.time_window) {
        const twLabel = TIME_WINDOW_OPTIONS.find((o) => o.value === state.todo.time_window)?.label;
        if (twLabel && twLabel !== 'Any time') scheduleParts.push(twLabel);
      }
      if (state.todo.target_date) scheduleParts.push(`Due ${formatDueDay(state.todo.target_date)}`);
    } else if (baseType === 'habit') {
      scheduleParts.push(getFrequencyLabel(jsonToFrequency(state.habit.frequency_json)));
      if (state.habit.time_estimate_minutes)
        scheduleParts.push(`~${state.habit.time_estimate_minutes}m`);
      if (state.habit.time_window) {
        const twLabel = TIME_WINDOW_OPTIONS.find((o) => o.value === state.habit.time_window)?.label;
        if (twLabel && twLabel !== 'Any time') scheduleParts.push(twLabel);
      }
    }
    const scheduleSummary = scheduleParts.length > 0 ? scheduleParts.join(' · ') : null;

    // Event-specific date formatting
    const formatEventDate = () => {
      if (!state.log.target_date) return null;
      const targetDate = parseISO(state.log.target_date);
      const endDate = state.log.end_date ? parseISO(state.log.end_date) : null;
      const eventTime = state.log.event_time;
      const today = getDateService().now();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isToday = isSameDay(targetDate, today);
      const isTomorrow = isSameDay(targetDate, tomorrow);
      const daysFromNow = differenceInDays(targetDate, today);
      let dateStr: string;
      if (isToday) dateStr = 'Today';
      else if (isTomorrow) dateStr = 'Tomorrow';
      else if (daysFromNow > 0 && daysFromNow <= 7) dateStr = format(targetDate, 'EEEE');
      else dateStr = format(targetDate, 'MMM d, yyyy');
      if (endDate && !isSameDay(targetDate, endDate)) {
        dateStr = `${format(targetDate, 'MMM d')}–${format(endDate, targetDate.getFullYear() === endDate.getFullYear() ? 'd, yyyy' : 'MMM d, yyyy')}`;
      }
      let timeStr = 'All day';
      if (eventTime) {
        const [hours, minutes] = eventTime.split(':').map(Number);
        const td = getDateService().now();
        td.setHours(hours, minutes, 0, 0);
        timeStr = format(td, 'h:mm a');
      }
      return `${dateStr} · ${timeStr}`;
    };

    return (
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, paddingTop: 12 }}
      >
        {/* Type badge + date row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <View
            style={{
              backgroundColor: 'rgba(46,85,64,0.08)',
              paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '500', color: tokens.colors.primary, textTransform: 'capitalize' }}>
              {effectiveLogSubtype === 'event' ? 'Event' : BASE_LABEL[baseType]}
            </Text>
          </View>
          {formattedCreatedDate && (
            <Text style={{ fontSize: 12, color: '#A09A90' }}>{formattedCreatedDate}</Text>
          )}
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: 22,
            fontWeight: '600',
            color: tokens.colors.text,
            marginBottom: 12,
            lineHeight: 30,
          }}
        >
          {entityTitle}
        </Text>

        {/* Event date row */}
        {effectiveLogSubtype === 'event' && (() => {
          const eventStr = formatEventDate();
          if (!eventStr) return null;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <CalendarDays size={14} color="#2E5540" />
              <Text style={{ fontSize: 14, color: '#555', fontWeight: '500' }}>{eventStr}</Text>
            </View>
          );
        })()}

        {/* Body in subtle card */}
        {bodyHasContent && (
          <View
            style={{
              padding: 14, paddingHorizontal: 16,
              backgroundColor: '#EDEAE380', borderRadius: 12,
              borderWidth: 0.5, borderColor: '#E8E5DE',
              marginBottom: 14,
            }}
          >
            {renderFormattedContent(entityBody, {
              textColor: '#333',
              fontSize: 15,
              lineHeight: 23,
            })}
          </View>
        )}

        {/* Checklist (if note has checklist) */}
        {baseType === 'log' && checklistItems && checklistItems.length > 0 && !bodyHasContent && (
          <View
            style={{
              padding: 14, paddingHorizontal: 16,
              backgroundColor: '#EDEAE380', borderRadius: 12,
              borderWidth: 0.5, borderColor: '#E8E5DE',
              marginBottom: 14,
            }}
          >
            <ChecklistProgress items={checklistItems} />
            <ChecklistView items={checklistItems} onToggle={handleToggleChecklistItem} />
          </View>
        )}

        {/* Photo strip */}
        {isLog && logPhotos.filter((p) => !p.isDeleted).length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <PhotoStrip
              photos={logPhotos as import('./useOverlayDraft').DraftPhoto[]}
              onAddPhoto={() => {}}
              onTapPhoto={(i) => handleViewLogPhoto(i)}
              disabled
            />
          </View>
        )}

        {/* Tags — read-only, no dismiss, no add */}
        {entityTags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {entityTags.map((tag) => (
              <View
                key={tag}
                style={{
                  backgroundColor: 'rgba(46,85,64,0.08)', paddingHorizontal: 10,
                  paddingVertical: 4, borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 12, color: tokens.colors.primary, fontWeight: '500' }}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Metadata summary card (todo/habit) */}
        {(baseType === 'todo' || baseType === 'habit') && (scheduleSummary || entitySpaceName) && (
          <View
            style={{
              padding: 10, paddingHorizontal: 14,
              backgroundColor: '#EDEAE3', borderRadius: 10,
              marginBottom: 14,
            }}
          >
            {scheduleSummary && (
              <View style={{ flexDirection: 'row', marginBottom: entitySpaceName ? 4 : 0 }}>
                <Text style={{ fontSize: 12, color: tokens.colors.subtle, fontWeight: '500', width: 68 }}>Schedule</Text>
                <Text style={{ fontSize: 12, color: '#555', flex: 1 }}>{scheduleSummary}</Text>
              </View>
            )}
            {entitySpaceName && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 12, color: tokens.colors.subtle, fontWeight: '500', width: 68 }}>Space</Text>
                <Text style={{ fontSize: 12, color: '#555', flex: 1 }}>{entitySpaceName}</Text>
              </View>
            )}
            {itemReminders.length > 0 && (
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: tokens.colors.subtle, fontWeight: '500', width: 68 }}>Reminders</Text>
                <Text style={{ fontSize: 12, color: '#555', flex: 1 }}>{formatItemReminderSummary(itemReminders)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Mood display (journal) */}
        {isJournal && moods.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>Mood:</Text>
            <Text style={{ fontSize: 13, color: tokens.colors.primary, fontWeight: '500' }}>
              {moods.map((m) => MOOD_CONFIG[m]?.label ?? m).join(', ')}
            </Text>
          </View>
        )}

        {/* Linked items (event notes) */}
        {effectiveLogSubtype === 'event' && currentEntityId && fullEntity?.space_id && (
          <LinkedItemsSection
            eventId={currentEntityId}
            spaceId={fullEntity.space_id}
            onItemPress={handleLinkedItemPress}
            onAddTodo={handleLinkedAddTodo}
            onAddNote={handleLinkedAddNote}
            onLinkExisting={handleLinkExisting}
          />
        )}

        {/* Chat saved notes */}
        {entityChatNotes.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Star size={14} color="#8B8579" />
              <Text style={{ fontSize: 12, color: tokens.colors.subtle, fontWeight: '600' }}>
                Saved from chat
              </Text>
            </View>
            {entityChatNotes.map((note: any, idx: number) => (
              <View
                key={note.id ?? idx}
                style={{
                  padding: 10, paddingHorizontal: 12,
                  backgroundColor: '#EDEAE380', borderRadius: 10,
                  borderWidth: 0.5, borderColor: '#E8E5DE',
                  marginBottom: 6,
                }}
              >
                <Text style={{ fontSize: 13, color: '#444', lineHeight: 19 }}>
                  {note.content}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Chat with Gremly button */}
        {currentEntityId && (
          <View style={{ marginTop: 4 }}>
            <EntityChatButton
              entityId={currentEntityId}
              entityType={entityTypeForChat ?? 'note'}
              variant="overlay"
              onPress={() => store.setUI({ showEntityChat: true })}
            />
          </View>
        )}

        {/* Source note link (todos from notes) */}
        {baseType === 'todo' && sourceNote && (
          <Pressable
            onPress={handleOpenSourceNote}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingVertical: 8, paddingHorizontal: 12,
              backgroundColor: 'rgba(107,142,107,0.08)', borderRadius: 8,
              marginTop: 10, alignSelf: 'flex-start',
            }}
          >
            <FileText size={14} color={lightTokens.colors.mossGreen} />
            <Text style={{ flex: 1, fontSize: 13, color: lightTokens.colors.mossGreen }}>
              From: {sourceNote.title}
            </Text>
            <ChevronRight size={14} color="#999" />
          </Pressable>
        )}
      </ScrollView>
    );
  };

  if (!visible) return null;

  // Derive space name for modals
  const currentSpaceName = state.spaceId
    ? spaces.find((s) => s.id === state.spaceId)?.name || 'this Space'
    : 'this Space';

  return (
    <>
      <KeyboardAvoidingView
        style={[{ flex: 1, backgroundColor: sheetBackground }]}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={0}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <RNAnimated.View
            style={{
              flex: 1,
              opacity: sheetOpacity,
              transform: [{ translateY: sheetTranslateY }],
              backgroundColor: sheetBackground,
            }}
          >
                  {showSaveToast ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: tokenSpacing.sm,
                        right: tokenSpacing.base,
                        backgroundColor:
                          colorMode === 'dark'
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(46, 125, 106, 0.12)',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 12,
                        zIndex: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: typeTabUnderlineColor,
                          fontWeight: '600',
                          fontSize: lightTokens.typography.size.sm,
                        }}
                      >
                        Saved
                      </Text>
                    </View>
                  ) : null}
                  {/* ── Header: Title row + type pill ── */}
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingTop: Math.max(insets.top, 20) + 10,
                      paddingBottom: 10,
                      backgroundColor: sheetBackground,
                    }}
                  >
                    <View style={{ position: 'relative' }}>
                      <Reanimated.View
                        pointerEvents="none"
                        style={[
                          StyleSheet.absoluteFillObject,
                          { backgroundColor: headerPulseColor, borderRadius: 12 },
                          headerPulseStyle,
                        ]}
                      />
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        {/* Editable title */}
                        <TextInput
                          value={state.compactTitle}
                          onChangeText={(text) => store.setCompactTitle(text)}
                          placeholder="Add title..."
                          placeholderTextColor="#999999"
                          editable={!isViewMode}
                          style={{
                            color: tokens.colors.text,
                            fontWeight: '600',
                            fontSize: 21,
                            flex: 1,
                            padding: 0,
                            margin: 0,
                            borderBottomWidth: !isViewMode ? 2 : 0,
                            borderBottomColor: 'rgba(46,85,64,0.25)',
                            paddingBottom: 3,
                          }}
                          maxLength={100}
                          selectTextOnFocus={false}
                          autoCorrect={false}
                        />

                        {/* Type pill */}
                        {!isViewMode && (
                          <TypePill
                            type={deriveEntityType(state.baseType, state.logSubtypeOverride || effectiveLogSubtype)}
                            onPress={() => setShowTypePicker(true)}
                            testID="type-pill"
                          />
                        )}

                        {/* Favorite star - view mode, notes only */}
                        {isViewMode &&
                          baseType === 'log' &&
                          effectiveLogSubtype !== 'event' &&
                          (fullEntity?.id || (initialEntity as any)?.id) && (
                            <Pressable
                              onPress={handleToggleFavorite}
                              style={{ padding: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={
                                isFavorite ? 'Remove from favorites' : 'Add to favorites'
                              }
                            >
                              <Star
                                size={22}
                                color={isFavorite ? '#F5A623' : '#ccc'}
                                fill={isFavorite ? '#F5A623' : 'transparent'}
                              />
                            </Pressable>
                          )}

                        {/* Back to View button - shown when we started in view mode and switched to edit */}
                        {displayMode === 'edit' && startedInViewMode ? (
                          <Pressable
                            onPress={() => setDisplayMode('view')}
                            accessibilityRole="button"
                            accessibilityLabel="Back to view"
                            style={({ pressed }) => ({
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 999,
                              opacity: pressed ? 0.6 : 1,
                            })}
                          >
                            <Text style={{ color: '#666666', fontSize: 14, fontWeight: '500' }}>
                              ← View
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>

                    {/* Sweep badge */}
                    {sweepStatus.label && mode !== 'create' && (
                      <View style={{ alignItems: 'flex-start', marginTop: 6 }}>
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 8,
                            backgroundColor: 'rgba(46,85,64,0.12)',
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '500', color: tokens.colors.primary }}>
                            {sweepStatus.label}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Lock In badge */}
                    {isLockedIn ? (
                      <View
                        style={[
                          styles.lockedBadge,
                          { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
                        ]}
                      >
                        <Diamond size={12} color="#2E5540" fill="#2E5540" />
                        <Text style={styles.lockedBadgeText}>Locked In</Text>
                      </View>
                    ) : null}

                    {/* Habit Build/Break toggle */}
                    {baseType === 'habit' && !isViewMode && (
                      <HabitModeToggle
                        mode={habitSubtypeToMode(state.habit.subtype)}
                        onChange={(m) => store.setHabitSubtype(habitModeToSubtype(m))}
                      />
                    )}
                  </View>

                  {/* Type picker dropdown */}
                  <TypePickerDropdown
                    visible={showTypePicker}
                    current={deriveEntityType(state.baseType, state.logSubtypeOverride || effectiveLogSubtype)}
                    onSelect={(entityType) => {
                      const config = getTypeConfig(entityType);
                      if (config.baseType !== state.baseType) {
                        handleTypeSelect(config.baseType);
                      }
                      if (config.baseType === 'log' && config.logSubtype) {
                        store.setLogSubtypeOverride(config.logSubtype);
                      }
                    }}
                    onClose={() => setShowTypePicker(false)}
                  />

                  {/* View/Edit Mode Content Container with Crossfade Animation */}
                  <View style={{ flex: 1 }}>
                    {/* View Mode Content - Read-only display */}
                    {isViewMode && (
                      <View style={{ flex: 1 }}>
                        {baseType === 'habit' && (fullEntity || initialEntity?.id) ? (
                          <HabitViewMode
                            habit={
                              (fullEntity ||
                                storeHabits.find((h) => h.id === (initialEntity as any)?.id)) as any
                            }
                            habitProgress={habitProgressForView}
                            spaceName={spaces.find((s) => s.id === state.spaceId)?.name}
                            onLogToday={handleLogHabitToday}
                            onLogDate={handleLogHabitDate}
                            onRemoveDate={handleRemoveHabitDate}
                            onUpdateWhy={handleUpdateHabitWhy}
                            onChatWithGremly={handleOpenHabitChat}
                            onLogSlip={handleLogHabitToday}
                          />
                        ) : (
                          renderViewModeContent()
                        )}
                      </View>
                    )}

                    {/* Edit/Create Mode Content - Interactive form */}
                    {!isViewMode && (
                      <Reanimated.View style={[editModeStyle, { flex: 1 }]}>
                        <ScrollView
                          style={{ flex: 1 }}
                          keyboardShouldPersistTaps="handled"
                          keyboardDismissMode="on-drag"
                          onScrollBeginDrag={() => {
                            Keyboard.dismiss();
                            setMoodPickerExpanded(false);
                          }}
                          contentContainerStyle={{
                            paddingHorizontal: 16,
                            paddingBottom: 80,
                            paddingTop: 0,
                          }}
                        >
                          {/* Main text field - moved above tags */}
                          <Box style={{ marginBottom: 16 }}>
                            {isPreviewMode ? (
                              /* Preview mode: Formatted read-only content */
                              <View style={{ position: 'relative' }}>
                                <View
                                  style={{
                                    maxHeight: 72,
                                    paddingVertical: 8,
                                    paddingRight: 36,
                                  }}
                                >
                                  <ScrollView
                                    style={{ flex: 1 }}
                                    showsVerticalScrollIndicator={true}
                                    nestedScrollEnabled={true}
                                  >
                                    {renderFormattedContent(currentText, {
                                      textColor: tokens.colors.text,
                                      fontSize: 14,
                                      lineHeight: 14 * 1.65,
                                    })}
                                  </ScrollView>
                                </View>

                                {/* Edit button - top right */}
                                <Pressable
                                  onPress={() => {
                                    // Strip markdown and switch to edit mode
                                    const strippedText = stripMarkdown(currentText);
                                    store.setBody(strippedText);
                                    setIsPreviewMode(false);
                                  }}
                                  style={({ pressed }) => ({
                                    position: 'absolute',
                                    top: 8,
                                    right: 0,
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 10,
                                    backgroundColor: 'rgba(0,0,0,0.04)',
                                    opacity: pressed ? 0.7 : 1,
                                  })}
                                  accessibilityLabel="Edit content"
                                  accessibilityRole="button"
                                >
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      fontWeight: '600',
                                      color:
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.8)' : tokens.colors.primary,
                                    }}
                                  >
                                    Edit
                                  </Text>
                                </Pressable>
                              </View>
                            ) : (
                              /* Compact text area mode */
                              <View style={{ position: 'relative' }}>
                                {/* Borderless body text */}
                                <TextInput
                                  ref={textInputRef}
                                  value={currentText}
                                  onChangeText={(t) => store.setBody(t)}
                                  editable={!isViewMode}
                                  pointerEvents={isViewMode ? 'none' : 'auto'}
                                  accessibilityLabel="Overlay content input"
                                  onFocus={() => {
                                    setBodyFocused(true);
                                    setMoodPickerExpanded(false);
                                  }}
                                  onBlur={() => setBodyFocused(false)}
                                  placeholder="Add notes..."
                                  placeholderTextColor={lightTokens.colors.subtle}
                                  multiline
                                  scrollEnabled={true}
                                  textAlignVertical="top"
                                  style={{
                                    fontSize: 14,
                                    lineHeight: 14 * 1.65,
                                    color: tokens.colors.text,
                                    maxHeight: 72,
                                    paddingVertical: 8,
                                    paddingHorizontal: 0,
                                    paddingRight: 36,
                                    textAlignVertical: 'top',
                                  }}
                                />
                                {/* Expand button — top-right of text area */}
                                <Pressable
                                  onPress={() => {
                                    LayoutAnimation.configureNext(
                                      LayoutAnimation.Presets.easeInEaseOut,
                                    );
                                    setIsExpandedEditor(true);
                                  }}
                                  style={({ pressed }) => ({
                                    position: 'absolute',
                                    top: 8,
                                    right: 0,
                                    width: 28,
                                    height: 28,
                                    borderRadius: 14,
                                    backgroundColor: 'rgba(0,0,0,0.04)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: pressed ? 0.7 : 1,
                                  })}
                                  accessibilityLabel="Expand editor"
                                  accessibilityRole="button"
                                >
                                  <Maximize2 size={14} color="#666" />
                                </Pressable>
                              </View>
                            )}
                          </Box>

                          {/* Photo strip — thumbnails or subtle "Add photo" link */}
                          {isLog && (
                            <View style={{ paddingHorizontal: 0 }}>
                              <PhotoStrip
                                photos={logPhotos as import('./useOverlayDraft').DraftPhoto[]}
                                onAddPhoto={handleOpenMultiPhotoActionSheet}
                                onTapPhoto={(i) => handleViewLogPhoto(i)}
                                disabled={isViewMode}
                              />
                            </View>
                          )}

                          {/* Linked Items section for event notes - only in view mode */}
                          {isViewMode && isEventNote && fullEntity?.space_id && (
                            <Box px={4}>
                              <LinkedItemsSection
                                eventId={currentEntityId}
                                spaceId={fullEntity.space_id}
                                onItemPress={handleLinkedItemPress}
                                onAddTodo={handleLinkedAddTodo}
                                onAddNote={handleLinkedAddNote}
                                onLinkExisting={handleLinkExisting}
                              />
                            </Box>
                          )}

                          {/* LinkedEventPicker for notes (non-event) - show when space has events */}
                          {isLog && !isEventNote && showLinkedEventPicker && effectiveSpaceId && (
                            <Box px={4} mt={3}>
                              <LinkedEventPicker
                                spaceId={effectiveSpaceId}
                                currentEventId={state.linkedEventId}
                                onChange={handleLinkedEventChange}
                              />
                            </Box>
                          )}

                          {/* Tags row — no Re-suggest link */}
                          <Box style={{ marginBottom: 16, paddingHorizontal: 16 }}>
                            <TagsRow
                              tags={activeTagChips}
                              suggested={[]}
                              onToggle={isViewMode ? () => {} : handleTagToggle}
                              onAdd={isViewMode ? undefined : handleTagAdd}
                              onUserAdd={isViewMode ? undefined : handleTelemetryTagAdd}
                              onUserRemove={isViewMode ? undefined : handleTelemetryTagRemove}
                            />
                          </Box>

                          {/* ===== Metadata rows — always visible, no accordion ===== */}
                          <View style={{ paddingHorizontal: 16 }}>

                            {/* ── TO-DO rows ── */}
                            {baseType === 'todo' && (
                              <>
                                <ExpandableRow
                                  icon={Calendar}
                                  label="Schedule"
                                  summary={(() => {
                                    const parts: string[] = [];
                                    if (state.todo.target_date)
                                      parts.push(`Due ${formatDueDay(state.todo.target_date)}`);
                                    const effectiveDoDate = state.todo.scheduled_date ?? state.todo.due_day;
                                    if (effectiveDoDate) parts.push(`Do ${formatDueDay(effectiveDoDate)}`);
                                    if (state.todo.time_estimate_minutes)
                                      parts.push(formatTimeEstimate(state.todo.time_estimate_minutes));
                                    if (state.todo.time_window) {
                                      const label = TIME_WINDOW_OPTIONS.find((o) => o.value === state.todo.time_window)?.label;
                                      if (label && label !== 'Any time') parts.push(label);
                                    }
                                    return parts.length > 0 ? parts.join(' · ') : 'Tap to set';
                                  })()}
                                  expanded={expandedRow === 'schedule'}
                                  onToggle={() => toggleRow('schedule')}
                                  iconColor="#2E5540"
                                >
                                  {/* Time of day */}
                                  <Text style={{ fontSize: 11, color: tokens.colors.subtle, fontWeight: '500', marginBottom: 5 }}>
                                    Time of day
                                  </Text>
                                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                                    {TIME_WINDOW_OPTIONS.map((opt) => {
                                      const isSel = (state.todo.time_window ?? null) === opt.value;
                                      return (
                                        <Pressable
                                          key={opt.value ?? 'null'}
                                          onPress={() => store.setTodoTimeWindow(opt.value)}
                                          style={{
                                            flex: 1, paddingVertical: 7, alignItems: 'center',
                                            borderRadius: 8, backgroundColor: isSel ? '#2D4A3E' : '#F5F2ED',
                                          }}
                                        >
                                          <Text style={{
                                            fontSize: 12, fontWeight: isSel ? '600' : '500',
                                            color: isSel ? '#FFFFFF' : '#6B665C',
                                          }}>
                                            {opt.label}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </View>

                                  {/* Specific time */}
                                  <Text style={{ fontSize: 11, color: tokens.colors.subtle, fontWeight: '500', marginBottom: 5, marginTop: 4 }}>
                                    Specific time
                                  </Text>
                                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                                    <Pressable
                                      onPress={() => {
                                        const now = getDateService().now();
                                        if (state.todo.due_time) {
                                          const [h, m] = state.todo.due_time.split(':').map(Number);
                                          now.setHours(h, m, 0, 0);
                                        }
                                        setSelectedTime(now);
                                        setDateModalTarget('todo_time');
                                        store.setUI({ showDateModal: true });
                                      }}
                                      style={{
                                        flex: 1, padding: 10, paddingHorizontal: 12, borderRadius: 8,
                                        borderWidth: 0.5, borderColor: '#D5D0C8', backgroundColor: '#EDEAE3',
                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 13, fontWeight: '500',
                                        color: state.todo.due_time ? '#2D4A3E' : '#B5AFA5',
                                      }}>
                                        {state.todo.due_time ? formatDueTime(state.todo.due_time) : 'Not set'}
                                      </Text>
                                      <Clock size={14} color="#8B8579" />
                                    </Pressable>
                                    {state.todo.due_time && (
                                      <Pressable
                                        onPress={() => store.setTodoDue({ due_time: null })}
                                        style={{
                                          paddingHorizontal: 12, justifyContent: 'center',
                                          borderRadius: 8, backgroundColor: '#EDEAE3',
                                        }}
                                      >
                                        <Text style={{ fontSize: 12, color: '#8B8579' }}>Clear</Text>
                                      </Pressable>
                                    )}
                                  </View>

                                  {/* Duration */}
                                  <Text style={{ fontSize: 11, color: '#8B8579', fontWeight: '500', marginBottom: 5 }}>
                                    Duration
                                  </Text>
                                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                    {[
                                      { label: '15m', value: 15 },
                                      { label: '30m', value: 30 },
                                      { label: '45m', value: 45 },
                                      { label: '1h', value: 60 },
                                      { label: '1.5h', value: 90 },
                                      { label: '2h', value: 120 },
                                      { label: '3h', value: 180 },
                                    ].map((chip) => {
                                      const isSelected = state.todo.time_estimate_minutes === chip.value;
                                      return (
                                        <Pressable
                                          key={chip.value}
                                          onPress={() => store.setTodoTimeEstimate(isSelected ? null : chip.value)}
                                          style={{
                                            paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8,
                                            backgroundColor: isSelected ? '#2D4A3E' : '#F5F2ED',
                                          }}
                                        >
                                          <Text style={{
                                            fontSize: 12, fontWeight: isSelected ? '600' : '500',
                                            color: isSelected ? '#FFFFFF' : '#6B665C',
                                          }}>
                                            {chip.label}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </View>

                                  {/* Dates */}
                                  <Text style={{ fontSize: 11, color: tokens.colors.subtle, fontWeight: '500', marginBottom: 5 }}>
                                    Dates
                                  </Text>
                                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
                                    <Pressable
                                      onPress={() => {
                                        setDateModalTarget('todo_dodate');
                                        store.setUI({ showDateModal: true });
                                      }}
                                      style={{
                                        flex: 1, padding: 7, paddingHorizontal: 10, borderRadius: 8,
                                        borderWidth: 0.5, borderColor: tokens.colors.border, backgroundColor: '#EDEAE3',
                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                      }}
                                    >
                                      <View>
                                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#A09A90', marginBottom: 2 }}>
                                          Do date
                                        </Text>
                                        <Text style={{ fontSize: 13, fontWeight: '500', color: '#2D4A3E' }}>
                                          {(state.todo.scheduled_date ?? state.todo.due_day)
                                            ? formatDueDay(state.todo.scheduled_date ?? state.todo.due_day ?? '')
                                            : 'Not set'}
                                        </Text>
                                      </View>
                                      <Calendar size={14} color="#8B8579" />
                                    </Pressable>
                                    <Pressable
                                      onPress={() => {
                                        setDateModalTarget('todo_deadline');
                                        store.setUI({ showDateModal: true });
                                      }}
                                      style={{
                                        flex: 1, padding: 7, paddingHorizontal: 10, borderRadius: 8,
                                        borderWidth: 0.5, borderColor: tokens.colors.border, backgroundColor: '#EDEAE3',
                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                      }}
                                    >
                                      <View>
                                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#A09A90', marginBottom: 2 }}>
                                          Deadline
                                        </Text>
                                        <Text style={{ fontSize: 13, fontWeight: '500', color: state.todo.target_date ? '#2D4A3E' : '#B5AFA5' }}>
                                          {state.todo.target_date
                                            ? formatDueDay(state.todo.target_date)
                                            : 'None'}
                                        </Text>
                                      </View>
                                      <Calendar size={14} color="#8B8579" />
                                    </Pressable>
                                  </View>
                                </ExpandableRow>

                                {dueToastMessage ? (
                                  <View
                                    style={{
                                      paddingHorizontal: 10,
                                      paddingVertical: 4,
                                      borderRadius: 999,
                                      backgroundColor: 'rgba(46,125,106,0.12)',
                                      alignSelf: 'flex-start',
                                      marginBottom: 4,
                                    }}
                                    pointerEvents="none"
                                  >
                                    <Text
                                      style={{
                                        color: typeTabUnderlineColor,
                                        fontSize: lightTokens.typography.size.xs,
                                        fontWeight: '600',
                                      }}
                                    >
                                      {dueToastMessage}
                                    </Text>
                                  </View>
                                ) : null}

                                <StaticRow
                                  icon={Bell}
                                  label="Reminders"
                                  right={
                                    <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                      {formatItemReminderSummary(itemReminders)}
                                    </Text>
                                  }
                                  onPress={() => { if (!isViewMode) setShowRemindersModal(true); }}
                                />

                                <StaticRow
                                  icon={FolderOpen}
                                  label="Space"
                                  right={
                                    <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                      {state.spaceId
                                        ? (spaces.find((s) => s.id === state.spaceId)?.name ?? '+ Add')
                                        : '+ Add'}
                                    </Text>
                                  }
                                  onPress={() => { if (!isViewMode) store.setUI({ showSpaceModal: true }); }}
                                />

                                {showLinkedEventPicker && effectiveSpaceId && (
                                  <StaticRow
                                    icon={Link2}
                                    label="Link to event"
                                    right={
                                      <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                        {state.linkedEventId ? 'Linked' : 'None'}
                                      </Text>
                                    }
                                    onPress={() => toggleRow('linked')}
                                  />
                                )}

                                {commitmentsOn && (
                                  <StaticRow
                                    icon={Diamond}
                                    label="Lock In"
                                    right={
                                      <ToggleSwitch
                                        on={isLockedIn}
                                        onToggle={async () => {
                                          if (!state.commitment) {
                                            const ok = await canEnableCommitment();
                                            if (!ok) return;
                                          }
                                          pushUndoEntry('commitment', {
                                            commitment: state.commitment,
                                            commitmentNote: state.commitmentNote,
                                            commitmentStartedAt: state.commitmentStartedAt,
                                          });
                                          store.setCommitment(!state.commitment);
                                          try { eventBus.emit('OverlayCommitmentToggled', { on: !state.commitment }); } catch {}
                                        }}
                                      />
                                    }
                                  />
                                )}

                                {currentEntityId && (
                                  <StaticRow
                                    icon={MessageCircle}
                                    label="Chat with Gremly"
                                    iconColor="#2E5540"
                                    right={
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Image
                                          source={require('../../assets/buttonforHP.png')}
                                          style={{ width: 22, height: 22, borderRadius: 11 }}
                                          resizeMode="cover"
                                        />
                                        <ChevronRight size={14} color="#2E5540" />
                                      </View>
                                    }
                                    onPress={() => store.setUI({ showEntityChat: true })}
                                  />
                                )}

                                {mode === 'edit' && (initialEntity as any)?.id && (
                                  <StaticRow
                                    icon={Trash2}
                                    label="Delete to-do"
                                    iconColor="#D9534F"
                                    borderBottom={false}
                                    onPress={() => {
                                      Alert.alert('Delete this to-do?', "This can't be undone.", [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                          text: 'Delete',
                                          style: 'destructive',
                                          onPress: async () => {
                                            try {
                                              const itemId = (initialEntity as any).id;
                                              const itemSpaceId = (initialEntity as any).space_id ?? state.spaceId ?? initialSpaceId;
                                              await deleteTodo(itemId);
                                              eventBus.emit('entity:deleted', { id: itemId, type: 'todo', spaceId: itemSpaceId });
                                              onClose();
                                            } catch (err) {
                                              console.error('[UnifiedOverlayV2] Delete failed:', err);
                                              Alert.alert('Error', 'Failed to delete to-do. Please try again.');
                                            }
                                          },
                                        },
                                      ]);
                                    }}
                                  />
                                )}
                              </>
                            )}

                            {/* ── HABIT rows ── */}
                            {baseType === 'habit' && (
                              <>
                                {isBreakHabit ? (
                                  <>
                                    <StaticRow
                                      icon={Zap}
                                      label="Trigger"
                                      right={
                                        <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>Not set</Text>
                                      }
                                      iconColor="#D97706"
                                    />

                                    <StaticRow
                                      icon={RotateCcw}
                                      label="Replacement"
                                      right={
                                        <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>Not set</Text>
                                      }
                                      iconColor="#2E5540"
                                    />

                                    <StaticRow
                                      icon={Shield}
                                      label="Tracking"
                                      right={
                                        <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>Daily check-in</Text>
                                      }
                                      iconColor="#6B4C8A"
                                    />
                                  </>
                                ) : (
                                  <ExpandableRow
                                    icon={Calendar}
                                    label="Schedule"
                                    summary={[
                                      getFrequencyLabel(jsonToFrequency(state.habit.frequency_json)),
                                      state.habit.time_estimate_minutes && `~${state.habit.time_estimate_minutes}m`,
                                      state.habit.start_date && format(parseISO(state.habit.start_date), 'MMM d'),
                                    ].filter(Boolean).join(' · ')}
                                    expanded={expandedRow === 'schedule'}
                                    onToggle={() => toggleRow('schedule')}
                                    iconColor="#2E5540"
                                  >
                                    {/* Frequency presets */}
                                    <Text style={{ fontSize: 11, color: tokens.colors.subtle, fontWeight: '500', marginBottom: 5 }}>
                                      Frequency
                                    </Text>
                                    {(() => {
                                      const freq = jsonToFrequency(state.habit.frequency_json);
                                      let curCount = 1, curUnit: 'day' | 'week' | 'month' = 'day', curDays: number[] = [];
                                      if (freq.mode === 'simple') {
                                        curUnit = freq.value === 'daily' ? 'day' : freq.value === 'weekly' ? 'week' : 'month';
                                      } else if (freq.mode === 'custom') {
                                        curCount = freq.value.count; curUnit = freq.value.unit;
                                      } else if (freq.mode === 'days') {
                                        curCount = freq.days.length; curUnit = 'week'; curDays = [...freq.days];
                                      }
                                      const matchesAnyPreset = SCHEDULE_PRESETS.some(
                                        (p) => p.count === curCount && p.unit === curUnit &&
                                          JSON.stringify([...p.days].sort()) === JSON.stringify([...curDays].sort()),
                                      );
                                      const isCustom = habitIsCustomFreq || !matchesAnyPreset;
                                      return (
                                        <>
                                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                            {SCHEDULE_PRESETS.map((preset) => {
                                              const isMatch = !isCustom && curCount === preset.count && curUnit === preset.unit &&
                                                JSON.stringify([...curDays].sort()) === JSON.stringify([...preset.days].sort());
                                              return (
                                                <Pressable
                                                  key={preset.key}
                                                  onPress={() => {
                                                    setHabitIsCustomFreq(false);
                                                    store.setHabitFrequency(buildFreqJson(preset.count, preset.unit, [...preset.days]));
                                                  }}
                                                  style={{
                                                    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8,
                                                    backgroundColor: isMatch ? '#2D4A3E' : '#F5F2ED',
                                                  }}
                                                >
                                                  <Text style={{
                                                    fontSize: 12, fontWeight: isMatch ? '600' : '500',
                                                    color: isMatch ? '#FFFFFF' : '#6B665C',
                                                  }}>
                                                    {preset.label}
                                                  </Text>
                                                </Pressable>
                                              );
                                            })}
                                            <Pressable
                                              onPress={() => setHabitIsCustomFreq(true)}
                                              style={{
                                                paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8,
                                                backgroundColor: isCustom ? '#2D4A3E' : '#F5F2ED',
                                              }}
                                            >
                                              <Text style={{
                                                fontSize: 12, fontWeight: isCustom ? '600' : '500',
                                                color: isCustom ? '#FFFFFF' : '#6B665C',
                                              }}>
                                                Custom
                                              </Text>
                                            </Pressable>
                                          </View>

                                          {/* Custom counter */}
                                          {isCustom && (
                                            <View style={{ backgroundColor: '#F5F2ED', borderRadius: 12, padding: 12, marginBottom: 8 }}>
                                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                                <Pressable
                                                  onPress={() => {
                                                    const nc = Math.max(1, curCount - 1);
                                                    store.setHabitFrequency(buildFreqJson(nc, curUnit, curDays));
                                                  }}
                                                  disabled={curCount <= 1}
                                                  style={{
                                                    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    opacity: curCount <= 1 ? 0.3 : 1,
                                                  }}
                                                >
                                                  <Text style={{ fontSize: 18, color: '#2D4A3E' }}>−</Text>
                                                </Pressable>
                                                <Text style={{
                                                  fontSize: 20, fontWeight: '700', color: '#2D4A3E',
                                                  marginHorizontal: 20, minWidth: 28, textAlign: 'center',
                                                }}>
                                                  {curCount}
                                                </Text>
                                                <Pressable
                                                  onPress={() => {
                                                    const nc = Math.min(30, curCount + 1);
                                                    store.setHabitFrequency(buildFreqJson(nc, curUnit, curDays));
                                                  }}
                                                  disabled={curCount >= 30}
                                                  style={{
                                                    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    opacity: curCount >= 30 ? 0.3 : 1,
                                                  }}
                                                >
                                                  <Text style={{ fontSize: 18, color: '#2D4A3E' }}>+</Text>
                                                </Pressable>
                                                <Text style={{ fontSize: 13, color: tokens.colors.subtle, marginLeft: 12 }}>times per</Text>
                                              </View>
                                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                                                {(['day', 'week', 'month'] as const).map((u) => {
                                                  const isUnitSel = curUnit === u;
                                                  return (
                                                    <Pressable
                                                      key={u}
                                                      onPress={() => {
                                                        const newDays = u !== 'week' ? [] : curDays;
                                                        store.setHabitFrequency(buildFreqJson(curCount, u, newDays));
                                                      }}
                                                      style={{
                                                        flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8,
                                                        backgroundColor: isUnitSel ? '#2D4A3E' : '#FFFFFF',
                                                      }}
                                                    >
                                                      <Text style={{
                                                        fontSize: 12, fontWeight: isUnitSel ? '600' : '500',
                                                        color: isUnitSel ? '#FFFFFF' : '#6B665C',
                                                      }}>
                                                        {u}
                                                      </Text>
                                                    </Pressable>
                                                  );
                                                })}
                                              </View>
                                            </View>
                                          )}

                                          {/* Pin to days (weekly only) */}
                                          {curUnit === 'week' && (
                                            <View style={{ marginBottom: 8 }}>
                                              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
                                                <Text style={{ fontSize: 11, color: tokens.colors.subtle, fontWeight: '500' }}>On these days</Text>
                                                <Text style={{ fontSize: 11, color: '#A09A90', marginLeft: 4 }}>(optional)</Text>
                                              </View>
                                              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                {([
                                                  { day: 1, label: 'M' }, { day: 2, label: 'T' }, { day: 3, label: 'W' },
                                                  { day: 4, label: 'T' }, { day: 5, label: 'F' }, { day: 6, label: 'S' },
                                                  { day: 0, label: 'S' },
                                                ] as const).map(({ day, label }) => {
                                                  const isDayOn = curDays.includes(day);
                                                  return (
                                                    <Pressable
                                                      key={day}
                                                      onPress={() => {
                                                        const newDays = isDayOn
                                                          ? curDays.filter((d) => d !== day)
                                                          : [...curDays, day].sort();
                                                        store.setHabitFrequency(buildFreqJson(curCount, curUnit, newDays));
                                                      }}
                                                      style={{
                                                        width: 34, height: 34, borderRadius: 17,
                                                        alignItems: 'center', justifyContent: 'center',
                                                        backgroundColor: isDayOn ? '#2D4A3E' : '#F5F2ED',
                                                      }}
                                                    >
                                                      <Text style={{
                                                        fontSize: 12, fontWeight: '600',
                                                        color: isDayOn ? '#FFFFFF' : '#6B665C',
                                                      }}>
                                                        {label}
                                                      </Text>
                                                    </Pressable>
                                                  );
                                                })}
                                              </View>
                                            </View>
                                          )}
                                        </>
                                      );
                                    })()}

                                    {/* Time of day */}
                                    <View style={{ height: 1, backgroundColor: '#E5E0D8', marginVertical: 10 }} />
                                    <Text style={{ fontSize: 11, color: tokens.colors.subtle, fontWeight: '500', marginBottom: 5 }}>
                                      Time of day
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                                      {TIME_WINDOW_OPTIONS.map((opt) => {
                                        const isSel = (state.habit.time_window ?? null) === opt.value;
                                        return (
                                          <Pressable
                                            key={opt.value ?? 'null'}
                                            onPress={() => store.setHabitTimeWindow(opt.value)}
                                            style={{
                                              flex: 1, paddingVertical: 7, alignItems: 'center',
                                              borderRadius: 8, backgroundColor: isSel ? '#2D4A3E' : '#F5F2ED',
                                            }}
                                          >
                                            <Text style={{
                                              fontSize: 12, fontWeight: isSel ? '600' : '500',
                                              color: isSel ? '#FFFFFF' : '#6B665C',
                                            }}>
                                              {opt.label}
                                            </Text>
                                          </Pressable>
                                        );
                                      })}
                                    </View>

                                    {/* Duration */}
                                    <Text style={{ fontSize: 11, color: '#8B8579', fontWeight: '500', marginBottom: 5 }}>
                                      Duration
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                      {[
                                        { label: '15m', value: 15 },
                                        { label: '30m', value: 30 },
                                        { label: '45m', value: 45 },
                                        { label: '1h', value: 60 },
                                        { label: '1.5h', value: 90 },
                                        { label: '2h', value: 120 },
                                        { label: '3h', value: 180 },
                                      ].map((chip) => {
                                        const isSelected = state.habit.time_estimate_minutes === chip.value;
                                        return (
                                          <Pressable
                                            key={chip.value}
                                            onPress={() => store.setHabitTimeEstimate(isSelected ? null : chip.value)}
                                            style={{
                                              paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8,
                                              backgroundColor: isSelected ? '#2D4A3E' : '#F5F2ED',
                                            }}
                                          >
                                            <Text style={{
                                              fontSize: 12, fontWeight: isSelected ? '600' : '500',
                                              color: isSelected ? '#FFFFFF' : '#6B665C',
                                            }}>
                                              {chip.label}
                                            </Text>
                                          </Pressable>
                                        );
                                      })}
                                    </View>

                                    {/* Dates */}
                                    <View style={{ height: 1, backgroundColor: '#E5E0D8', marginVertical: 10 }} />
                                    <Text style={{ fontSize: 11, color: tokens.colors.subtle, fontWeight: '500', marginBottom: 5 }}>
                                      Dates
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
                                      <Pressable
                                        onPress={() => store.setUI({ showHabitStartDatePicker: true })}
                                        style={{
                                          flex: 1, padding: 7, paddingHorizontal: 10, borderRadius: 8,
                                          borderWidth: 0.5, borderColor: tokens.colors.border, backgroundColor: '#EDEAE3',
                                          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                        }}
                                      >
                                        <View>
                                          <Text style={{ fontSize: 11, fontWeight: '500', color: '#A09A90', marginBottom: 2 }}>
                                            Starts
                                          </Text>
                                          <Text style={{ fontSize: 13, fontWeight: '500', color: '#2D4A3E' }}>
                                            {state.habit.start_date
                                              ? format(parseISO(state.habit.start_date), 'MMM d, yyyy')
                                              : 'Not set'}
                                          </Text>
                                        </View>
                                        <Calendar size={14} color="#8B8579" />
                                      </Pressable>
                                      <Pressable
                                        onPress={() => store.setUI({ showHabitEndDatePicker: true })}
                                        style={{
                                          flex: 1, padding: 7, paddingHorizontal: 10, borderRadius: 8,
                                          borderWidth: 0.5, borderColor: tokens.colors.border, backgroundColor: '#EDEAE3',
                                          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                        }}
                                      >
                                        <View>
                                          <Text style={{ fontSize: 11, fontWeight: '500', color: '#A09A90', marginBottom: 2 }}>
                                            Ends
                                          </Text>
                                          <Text style={{ fontSize: 13, fontWeight: '500', color: state.habit.end_date ? '#2D4A3E' : '#B5AFA5' }}>
                                            {state.habit.end_date
                                              ? format(parseISO(state.habit.end_date), 'MMM d, yyyy')
                                              : 'No end'}
                                          </Text>
                                        </View>
                                        <Calendar size={14} color="#8B8579" />
                                      </Pressable>
                                    </View>
                                  </ExpandableRow>
                                )}

                                <StaticRow
                                  icon={Bell}
                                  label="Reminders"
                                  right={
                                    <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                      {formatItemReminderSummary(itemReminders)}
                                    </Text>
                                  }
                                  onPress={() => { if (!isViewMode) setShowRemindersModal(true); }}
                                />

                                <StaticRow
                                  icon={FolderOpen}
                                  label="Space"
                                  right={
                                    <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                      {state.spaceId
                                        ? (spaces.find((s) => s.id === state.spaceId)?.name ?? '+ Add')
                                        : '+ Add'}
                                    </Text>
                                  }
                                  onPress={() => { if (!isViewMode) store.setUI({ showSpaceModal: true }); }}
                                />

                                {showLinkedEventPicker && effectiveSpaceId && (
                                  <StaticRow
                                    icon={Link2}
                                    label="Link to event"
                                    right={
                                      <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                        {state.linkedEventId ? 'Linked' : 'None'}
                                      </Text>
                                    }
                                    onPress={() => toggleRow('linked')}
                                  />
                                )}

                                {commitmentsOn && (
                                  <StaticRow
                                    icon={Diamond}
                                    label="Lock In"
                                    right={
                                      <ToggleSwitch
                                        on={isLockedIn}
                                        onToggle={async () => {
                                          if (!state.commitment) {
                                            const ok = await canEnableCommitment();
                                            if (!ok) return;
                                          }
                                          pushUndoEntry('commitment', {
                                            commitment: state.commitment,
                                            commitmentNote: state.commitmentNote,
                                            commitmentStartedAt: state.commitmentStartedAt,
                                          });
                                          store.setCommitment(!state.commitment);
                                          try { eventBus.emit('OverlayCommitmentToggled', { on: !state.commitment }); } catch {}
                                        }}
                                      />
                                    }
                                  />
                                )}

                                {baseType === 'habit' && currentEntityId && (
                                  <StaticRow
                                    icon={BarChart3}
                                    label="View progress"
                                    iconColor="#2E5540"
                                    right={<ChevronRight size={14} color="#2E5540" />}
                                    onPress={() => store.setUI({ displayMode: 'view' })}
                                  />
                                )}

                                {currentEntityId && (
                                  <StaticRow
                                    icon={MessageCircle}
                                    label="Chat with Gremly"
                                    iconColor="#2E5540"
                                    right={
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Image
                                          source={require('../../assets/buttonforHP.png')}
                                          style={{ width: 22, height: 22, borderRadius: 11 }}
                                          resizeMode="cover"
                                        />
                                        <ChevronRight size={14} color="#2E5540" />
                                      </View>
                                    }
                                    onPress={() => store.setUI({ showEntityChat: true })}
                                  />
                                )}

                                {mode === 'edit' && (initialEntity as any)?.id && (
                                  <StaticRow
                                    icon={Trash2}
                                    label="Delete habit"
                                    iconColor="#D9534F"
                                    borderBottom={false}
                                    onPress={() => {
                                      Alert.alert('Delete this habit?', "This can't be undone.", [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                          text: 'Delete',
                                          style: 'destructive',
                                          onPress: async () => {
                                            try {
                                              const itemId = (initialEntity as any).id;
                                              const itemSpaceId = (initialEntity as any).space_id ?? state.spaceId ?? initialSpaceId;
                                              await deleteHabit(itemId);
                                              eventBus.emit('entity:deleted', { id: itemId, type: 'habit', spaceId: itemSpaceId });
                                              onClose();
                                            } catch (err) {
                                              console.error('[UnifiedOverlayV2] Delete failed:', err);
                                              Alert.alert('Error', 'Failed to delete habit. Please try again.');
                                            }
                                          },
                                        },
                                      ]);
                                    }}
                                  />
                                )}
                              </>
                            )}

                            {/* ── LOG rows (journal, idea, general, event) ── */}
                            {baseType === 'log' && (
                              <>
                                {/* Event-type logs: Date & time */}
                                {/* Journal: Mood */}
                                {isJournal && (
                                  <ExpandableRow
                                    icon={Heart}
                                    label="Mood"
                                    summary={
                                      moods.length > 0
                                        ? moods.map((m) => MOOD_CONFIG[m]?.label ?? m).join(', ')
                                        : 'Tap to set'
                                    }
                                    expanded={expandedRow === 'mood'}
                                    onToggle={() => toggleRow('mood')}
                                    iconColor="#8B5E3C"
                                  >
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                      {ALL_MOODS.map((moodKey) => {
                                        const config = MOOD_CONFIG[moodKey];
                                        if (!config) return null;
                                        const isSelected = moods.includes(moodKey);
                                        return (
                                          <Pressable
                                            key={moodKey}
                                            onPress={() => {
                                              if (isSelected) {
                                                setMoods(moods.filter((m) => m !== moodKey));
                                              } else {
                                                setMoods([...moods, moodKey]);
                                              }
                                            }}
                                            style={{
                                              paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16,
                                              backgroundColor: isSelected ? 'rgba(46,85,64,0.12)' : '#EDEAE3',
                                              borderWidth: isSelected ? 1 : 0,
                                              borderColor: isSelected ? 'rgba(46,85,64,0.3)' : 'transparent',
                                            }}
                                          >
                                            <Text style={{
                                              fontSize: 13, fontWeight: isSelected ? '600' : '400',
                                              color: isSelected ? '#2E5540' : '#6B665C',
                                            }}>
                                              {config.label}
                                            </Text>
                                          </Pressable>
                                        );
                                      })}
                                    </View>
                                  </ExpandableRow>
                                )}

                                {isEventNote && (
                                  <ExpandableRow
                                    icon={CalendarDays}
                                    label="Date & time"
                                    summary={
                                      state.log.target_date
                                        ? `${formatDueDay(state.log.target_date)}${state.log.event_time ? ' · ' + state.log.event_time : ''}`
                                        : 'Set date'
                                    }
                                    expanded={expandedRow === 'event-date'}
                                    onToggle={() => toggleRow('event-date')}
                                    iconColor="#6B4C8A"
                                  >
                                    {/* Start date */}
                                    <Text style={{ fontSize: 11, color: '#8B8579', fontWeight: '500', marginBottom: 5 }}>
                                      Date
                                    </Text>
                                    <Pressable
                                      onPress={() => {
                                        setDateModalTarget('note_event');
                                        store.setUI({ showDateModal: true });
                                      }}
                                      style={{
                                        padding: 7, paddingHorizontal: 10, borderRadius: 8,
                                        borderWidth: 0.5, borderColor: '#D5D0C8', backgroundColor: '#EDEAE3',
                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                        marginBottom: 12,
                                      }}
                                    >
                                      <Text style={{ fontSize: 13, fontWeight: '500', color: state.log.target_date ? '#2D4A3E' : '#B5AFA5' }}>
                                        {state.log.target_date ? formatDueDay(state.log.target_date) : 'Not set'}
                                      </Text>
                                      <Calendar size={14} color="#8B8579" />
                                    </Pressable>

                                    {/* End date */}
                                    <Text style={{ fontSize: 11, color: '#8B8579', fontWeight: '500', marginBottom: 5 }}>
                                      End date
                                    </Text>
                                    <Pressable
                                      onPress={() => {
                                        setDateModalTarget('note_end_date');
                                        store.setUI({ showDateModal: true });
                                      }}
                                      style={{
                                        padding: 7, paddingHorizontal: 10, borderRadius: 8,
                                        borderWidth: 0.5, borderColor: '#D5D0C8', backgroundColor: '#EDEAE3',
                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                        marginBottom: 12,
                                      }}
                                    >
                                      <Text style={{ fontSize: 13, fontWeight: '500', color: state.log.end_date ? '#2D4A3E' : '#B5AFA5' }}>
                                        {state.log.end_date ? formatDueDay(state.log.end_date) : 'Same day'}
                                      </Text>
                                      <Calendar size={14} color="#8B8579" />
                                    </Pressable>

                                    {/* Time */}
                                    <Text style={{ fontSize: 11, color: '#8B8579', fontWeight: '500', marginBottom: 5 }}>
                                      Time
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
                                      <Pressable
                                        onPress={() => {
                                          const now = getDateService().now();
                                          if (state.log.event_time) {
                                            const [h, m] = state.log.event_time.split(':').map(Number);
                                            now.setHours(h, m, 0, 0);
                                          }
                                          setSelectedTime(now);
                                          setDateModalTarget('event_time');
                                          store.setUI({ showDateModal: true });
                                        }}
                                        style={{
                                          flex: 1, padding: 10, paddingHorizontal: 12, borderRadius: 8,
                                          borderWidth: 0.5, borderColor: '#D5D0C8', backgroundColor: '#EDEAE3',
                                          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                        }}
                                      >
                                        <Text style={{
                                          fontSize: 13, fontWeight: '500',
                                          color: state.log.event_time ? '#2D4A3E' : '#B5AFA5',
                                        }}>
                                          {state.log.event_time ? formatDueTime(state.log.event_time) : 'Not set'}
                                        </Text>
                                        <Clock size={14} color="#8B8579" />
                                      </Pressable>
                                      {state.log.event_time && (
                                        <Pressable
                                          onPress={() => store.setLogEventTime(null)}
                                          style={{
                                            paddingHorizontal: 12, justifyContent: 'center',
                                            borderRadius: 8, backgroundColor: '#EDEAE3',
                                          }}
                                        >
                                          <Text style={{ fontSize: 12, color: '#8B8579' }}>Clear</Text>
                                        </Pressable>
                                      )}
                                    </View>
                                  </ExpandableRow>
                                )}

                                {/* Reminders — all log subtypes */}
                                <StaticRow
                                  icon={Bell}
                                  label="Reminders"
                                  right={
                                    <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                      {formatItemReminderSummary(itemReminders)}
                                    </Text>
                                  }
                                  onPress={() => { if (!isViewMode) setShowRemindersModal(true); }}
                                />

                                <StaticRow
                                  icon={FolderOpen}
                                  label="Space"
                                  right={
                                    <Text style={{ fontSize: 13, color: tokens.colors.subtle }}>
                                      {state.spaceId
                                        ? (spaces.find((s) => s.id === state.spaceId)?.name ?? '+ Add')
                                        : '+ Add'}
                                    </Text>
                                  }
                                  onPress={() => { if (!isViewMode) store.setUI({ showSpaceModal: true }); }}
                                />

                                {/* Idea conversion buttons */}
                                {effectiveLogSubtype === 'idea' && mode === 'edit' && (
                                  <View style={{ marginTop: 12, marginBottom: 4 }}>
                                    <Text style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
                                      Convert to...
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                      <Pressable
                                        onPress={() => {
                                          const ideaTitle = state.log.title || '';
                                          const ideaBody = state.log.body || '';
                                          const ideaTags = state.tags || [];
                                          const ideaListItems = state.list?.items;
                                          const ideaIsList = !!state.list?.items?.length;
                                          const ideaId = (initialEntity as any)?.id;
                                          onClose();
                                          setTimeout(() => {
                                            globalOverlay.openCreate({
                                              type: 'todo',
                                              conversionMeta: {
                                                origin: 'idea_conversion',
                                                initialTitle: ideaTitle,
                                                initialNote: ideaBody,
                                                initialTags: ideaTags,
                                                initialListItems: ideaIsList ? ideaListItems : undefined,
                                                initialIsList: ideaIsList,
                                              },
                                            });
                                          }, 100);
                                          if (ideaId) {
                                            updateNote(ideaId, { archived: true });
                                            eventBus.emit('ItemUpdated', { id: ideaId });
                                          }
                                        }}
                                        style={({ pressed }) => ({
                                          flex: 1,
                                          backgroundColor: pressed ? '#EAEAE8' : '#F5F5F3',
                                          borderRadius: 8,
                                          paddingVertical: 12,
                                          paddingHorizontal: 16,
                                          minHeight: 44,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          flexDirection: 'row',
                                          gap: 6,
                                        })}
                                      >
                                        <Text style={{ fontSize: 15 }}>📋</Text>
                                        <Text style={{ fontSize: 15, fontWeight: '500', color: '#333' }}>To-Do</Text>
                                      </Pressable>
                                      <Pressable
                                        onPress={() => {
                                          const ideaTitle = state.log.title || '';
                                          const ideaBody = state.log.body || '';
                                          const ideaTags = state.tags || [];
                                          const ideaListItems = state.list?.items;
                                          const ideaIsList = !!state.list?.items?.length;
                                          const ideaId = (initialEntity as any)?.id;
                                          onClose();
                                          setTimeout(() => {
                                            globalOverlay.openCreate({
                                              type: 'habit',
                                              conversionMeta: {
                                                origin: 'idea_conversion',
                                                initialTitle: ideaTitle,
                                                initialNote: ideaBody,
                                                initialTags: ideaTags,
                                                initialListItems: ideaIsList ? ideaListItems : undefined,
                                                initialIsList: ideaIsList,
                                              },
                                            });
                                          }, 100);
                                          if (ideaId) {
                                            updateNote(ideaId, { archived: true });
                                            eventBus.emit('ItemUpdated', { id: ideaId });
                                          }
                                        }}
                                        style={({ pressed }) => ({
                                          flex: 1,
                                          backgroundColor: pressed ? '#EAEAE8' : '#F5F5F3',
                                          borderRadius: 8,
                                          paddingVertical: 12,
                                          paddingHorizontal: 16,
                                          minHeight: 44,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          flexDirection: 'row',
                                          gap: 6,
                                        })}
                                      >
                                        <Text style={{ fontSize: 15 }}>🔄</Text>
                                        <Text style={{ fontSize: 15, fontWeight: '500', color: '#333' }}>Habit</Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                )}

                                {/* Event-type: linked items */}
                                {isViewMode && isEventNote && fullEntity?.space_id && (
                                  <StaticRow
                                    icon={Link2}
                                    label="Linked items"
                                    right={<ChevronRight size={14} color="#A09A90" />}
                                    onPress={() => {/* LinkedItemsSection is rendered above */}}
                                  />
                                )}

                                {currentEntityId && (
                                  <StaticRow
                                    icon={MessageCircle}
                                    label="Chat with Gremly"
                                    iconColor="#2E5540"
                                    right={
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Image
                                          source={require('../../assets/buttonforHP.png')}
                                          style={{ width: 22, height: 22, borderRadius: 11 }}
                                          resizeMode="cover"
                                        />
                                        <ChevronRight size={14} color="#2E5540" />
                                      </View>
                                    }
                                    onPress={() => store.setUI({ showEntityChat: true })}
                                  />
                                )}

                                {mode === 'edit' && (initialEntity as any)?.id && (
                                  <StaticRow
                                    icon={Trash2}
                                    label="Delete log"
                                    iconColor="#D9534F"
                                    borderBottom={false}
                                    onPress={() => {
                                      Alert.alert('Delete this log?', "This can't be undone.", [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                          text: 'Delete',
                                          style: 'destructive',
                                          onPress: async () => {
                                            try {
                                              const itemId = (initialEntity as any).id;
                                              const itemSpaceId = (initialEntity as any).space_id ?? state.spaceId ?? initialSpaceId;
                                              await deleteNote(itemId);
                                              eventBus.emit('entity:deleted', { id: itemId, type: 'note', spaceId: itemSpaceId });
                                              onClose();
                                            } catch (err) {
                                              console.error('[UnifiedOverlayV2] Delete log failed:', err);
                                              Alert.alert('Error', 'Failed to delete log. Please try again.');
                                            }
                                          },
                                        },
                                      ]);
                                    }}
                                  />
                                )}
                              </>
                            )}

                            {/* Mentions / Dates chips (inline suggestions) */}
                            <Box
                              mt={3}
                              row
                              gap={2}
                              style={{ flexWrap: 'wrap', marginTop: tokenSpacing.md }}
                            >
                              {(state.detected?.mentions || []).map((m) => (
                                <Chip key={m} label={`@${m}`} />
                              ))}
                              {(state.detected?.dates || []).map((d) => (
                                <Button
                                  key={d}
                                  size="sm"
                                  variant="ghost"
                                  onPress={() => {
                                    if (d === '__token:today') {
                                      handleTodoDueChange(getDateService().now(), {
                                        label: 'Today',
                                      });
                                    } else if (d === '__token:tomorrow') {
                                      handleTodoDueChange(addDays(getDateService().now(), 1), {
                                        label: 'Tomorrow',
                                      });
                                    } else {
                                      // fallback: open custom date modal with parsed date prefilled
                                      try {
                                        const dateStr = d.replace(/^\D+/g, '');
                                        const parsed = new Date(dateStr);
                                        if (!isNaN(parsed.getTime())) {
                                          setSelectedDate(parsed);
                                          setClearDateFlag(false);
                                        }
                                      } catch (e) {
                                        // Use today as fallback
                                        setSelectedDate(getDateService().now());
                                      }
                                      setDateModalTarget('todo_deadline');
                                      store.setUI({ showDateModal: true });
                                    }
                                  }}
                                  title={
                                    d === '__token:today'
                                      ? 'Set due: Today'
                                      : d === '__token:tomorrow'
                                        ? 'Set due: Tomorrow'
                                        : d
                                  }
                                />
                              ))}
                            </Box>
                            {/* Tag row hidden at Level-1; lands in Phase 3 */}
                          </View>
                        </ScrollView>
                      </Reanimated.View>
                    )}
                  </View>

                  <Modal visible={storeUI.showDateModal && dateModalTarget !== 'todo_time' && dateModalTarget !== 'event_time'} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => {
                        // Close modal when tapping outside
                        store.setUI({ showDateModal: false });
                        setDateModalTarget(null);
                        setShowTimePicker(false);
                        setClearDateFlag(false);
                        setSelectedTimePreset(null);
                        setShowCustomTimePicker(false);
                      }}
                    >
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                          width: '92%',
                          maxWidth: 400,
                          maxHeight: '85%',
                          alignSelf: 'center',
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 12,
                          paddingTop: 20,
                          paddingBottom: 16,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: '#E0E0E0',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.15,
                          shadowRadius: 24,
                          elevation: 8,
                        }}
                      >
                        <ScrollView
                          showsVerticalScrollIndicator={false}
                          bounces={true}
                          contentContainerStyle={{
                            paddingBottom: 32,
                            paddingTop: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 18,
                              fontWeight: '600',
                              color: '#222222',
                              marginBottom: 16,
                            }}
                          >
                            {dateModalTarget === 'todo_deadline' && 'Set deadline'}
                            {dateModalTarget === 'todo_dodate' && 'Set do date'}
                            {dateModalTarget === 'note_event' && 'Set event date'}
                            {dateModalTarget === 'note_end_date' && 'Set end date'}
                            {dateModalTarget === 'reminder' && 'Set reminder'}
                          </Text>
                          <Box mt={1}>
                            <Box row gap={2} style={{ flexWrap: 'wrap' }}>
                              <Pressable
                                onPress={() => {
                                  const today = getDateService().now();
                                  if (dateModalTarget === 'reminder') {
                                    store.setReminderAt(today.toISOString());
                                    store.setUI({ showDateModal: false });
                                    setDateModalTarget(null);
                                  } else {
                                    handleDateConfirm(today);
                                  }
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 14,
                                  paddingVertical: 7,
                                  borderRadius: 18,
                                  backgroundColor: pressed
                                    ? '#F5F5F5'
                                    : clearDateFlag === false &&
                                        getDateService().toLocalDate(selectedDate) ===
                                          getDateService().today()
                                      ? '#F0F4F1'
                                      : '#FAFAFA',
                                  borderWidth: 1,
                                  borderColor:
                                    clearDateFlag === false &&
                                    getDateService().toLocalDate(selectedDate) ===
                                      getDateService().today()
                                      ? tokens.colors.primary
                                      : '#E0E0E0',
                                })}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '500', color: '#222222' }}>
                                  Today
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  const tomorrow = addDays(getDateService().now(), 1);
                                  if (dateModalTarget === 'reminder') {
                                    store.setReminderAt(tomorrow.toISOString());
                                    store.setUI({ showDateModal: false });
                                    setDateModalTarget(null);
                                  } else {
                                    handleDateConfirm(tomorrow);
                                  }
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 14,
                                  paddingVertical: 7,
                                  borderRadius: 18,
                                  backgroundColor: pressed
                                    ? '#F5F5F5'
                                    : clearDateFlag === false &&
                                        getDateService().toLocalDate(selectedDate) ===
                                          getDateService().tomorrow()
                                      ? '#F0F4F1'
                                      : '#FAFAFA',
                                  borderWidth: 1,
                                  borderColor:
                                    clearDateFlag === false &&
                                    getDateService().toLocalDate(selectedDate) ===
                                      getDateService().tomorrow()
                                      ? tokens.colors.primary
                                      : '#E0E0E0',
                                })}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '500', color: '#222222' }}>
                                  Tomorrow
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  setClearDateFlag(true);
                                  setShowTimePicker(false);
                                  setSelectedTimePreset(null);
                                  setShowCustomTimePicker(false);
                                  if (dateModalTarget === 'reminder') {
                                    store.setReminderAt(null);
                                    store.setUI({ showDateModal: false });
                                    setDateModalTarget(null);
                                  }
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 14,
                                  paddingVertical: 7,
                                  borderRadius: 18,
                                  backgroundColor: pressed
                                    ? '#F5F5F5'
                                    : clearDateFlag
                                      ? '#F0F4F1'
                                      : '#FAFAFA',
                                  borderWidth: 1,
                                  borderColor: clearDateFlag ? tokens.colors.primary : '#E0E0E0',
                                })}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '500', color: '#222222' }}>
                                  Clear
                                </Text>
                              </Pressable>
                            </Box>
                          </Box>

                          {/* Date Picker */}
                          {!clearDateFlag && (
                            <Box mt={3} mb={4}>
                              <DateTimePicker
                                value={selectedDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                onChange={(event, date) => {
                                  if (date) {
                                    if (isSameDay(selectedDate, date)) {
                                      handleDateConfirm(date);
                                    } else {
                                      setSelectedDate(date);
                                      setClearDateFlag(false);
                                    }
                                  }
                                }}
                                themeVariant={colorMode === 'dark' ? 'dark' : 'light'}
                                accentColor="#2E5540"
                              />
                            </Box>
                          )}



                          {/* Action buttons - now inside ScrollView */}
                          <Box row style={{ gap: 12, marginTop: 12 }}>
                            <Button
                              variant="ghost"
                              onPress={() => {
                                store.setUI({ showDateModal: false });
                                setDateModalTarget(null);
                                setShowTimePicker(false);
                                setClearDateFlag(false);
                                setSelectedTimePreset(null);
                                setShowCustomTimePicker(false);
                              }}
                              title="Cancel"
                            />
                            <Box flex={1} />
                            <Button
                              variant="primary"
                              onPress={() => {
                                try {
                                  if (clearDateFlag) {
                                    // Clear logic
                                    if (dateModalTarget === 'reminder') {
                                      store.setReminderAt(null);
                                    } else if (dateModalTarget === 'todo_deadline') {
                                      store.setTodoTargetDate(null);
                                      showDueToast('Deadline cleared');
                                    } else if (dateModalTarget === 'todo_dodate') {
                                      store.setTodoScheduledDate(null);
                                      store.setTodoDue({ due_at: null, due_day: null, due_time: null });
                                      showDueToast('Do date cleared');
                                    } else if (dateModalTarget === 'note_event') {
                                      store.setLogTargetDate(null);
                                      showDueToast('Event date cleared');
                                    } else if (dateModalTarget === 'note_end_date') {
                                      store.setLogEndDate(null);
                                      showDueToast('End date cleared');
                                    }
                                  } else {
                                    handleDateConfirm(selectedDate);
                                    return; // handleDateConfirm already resets and closes
                                  }
                                  // Reset and close
                                  store.setUI({ showDateModal: false });
                                  setDateModalTarget(null);
                                  setShowTimePicker(false);
                                  setClearDateFlag(false);
                                  setSelectedTimePreset(null);
                                  setShowCustomTimePicker(false);
                                } catch (e) {
                                  console.error('[DatePicker] Error setting date:', e);
                                }
                              }}
                              title="Set"
                            />
                          </Box>
                        </ScrollView>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Native time picker modal */}
                  <Modal
                    visible={storeUI.showDateModal && (dateModalTarget === 'todo_time' || dateModalTarget === 'event_time')}
                    transparent
                    animationType="fade"
                  >
                    <Pressable
                      style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
                      onPress={() => { store.setUI({ showDateModal: false }); setDateModalTarget(null); }}
                    >
                      <Pressable onPress={(e) => e.stopPropagation()}>
                        <View style={{
                          backgroundColor: '#F5F2EB', borderTopLeftRadius: 16,
                          borderTopRightRadius: 16, paddingBottom: 34, paddingTop: 16,
                        }}>
                          <View style={{
                            flexDirection: 'row', justifyContent: 'space-between',
                            alignItems: 'center', paddingHorizontal: 20, marginBottom: 12,
                          }}>
                            <Pressable onPress={() => { store.setUI({ showDateModal: false }); setDateModalTarget(null); }}>
                              <Text style={{ fontSize: 15, color: '#6B665C' }}>Cancel</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                const hours = selectedTime.getHours();
                                const mins = selectedTime.getMinutes();
                                const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                                if (dateModalTarget === 'todo_time') {
                                  store.setTodoDue({ due_time: timeStr });
                                } else if (dateModalTarget === 'event_time') {
                                  store.setLogEventTime(timeStr);
                                }
                                store.setUI({ showDateModal: false });
                                setDateModalTarget(null);
                              }}
                              style={{
                                backgroundColor: '#2D4A3E', paddingHorizontal: 24,
                                paddingVertical: 8, borderRadius: 10,
                              }}
                            >
                              <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Set</Text>
                            </Pressable>
                          </View>
                          <DateTimePicker
                            value={selectedTime}
                            mode="time"
                            display="spinner"
                            onChange={(_, date) => { if (date) setSelectedTime(date); }}
                            minuteInterval={5}
                            style={{ height: 180 }}
                          />
                        </View>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Time Estimate Modal - Hybrid Grid + Stepper */}
                  <Modal visible={storeUI.showTimeEstimateModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => store.setUI({ showTimeEstimateModal: false })}
                    >
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                          width: '92%',
                          maxWidth: 340,
                          alignSelf: 'center',
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 20,
                          paddingTop: 20,
                          paddingBottom: 24,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: '#E0E0E0',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.15,
                          shadowRadius: 24,
                          elevation: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: '600',
                            color: '#222222',
                            marginBottom: 16,
                            textAlign: 'center',
                          }}
                        >
                          How long will this take?
                        </Text>

                        {/* Quick Select Grid */}
                        <View style={styles.timeEstimateGrid}>
                          {TIME_ESTIMATE_QUICK_OPTIONS.map((minutes) => (
                            <Pressable
                              key={minutes}
                              style={[
                                styles.timeEstimateOption,
                                timeEstimateValue === minutes && styles.timeEstimateOptionSelected,
                              ]}
                              onPress={() => setTimeEstimateValue(minutes)}
                            >
                              <Text
                                style={[
                                  styles.timeEstimateOptionText,
                                  timeEstimateValue === minutes &&
                                    styles.timeEstimateOptionTextSelected,
                                ]}
                              >
                                {formatTimeEstimate(minutes)}
                              </Text>
                            </Pressable>
                          ))}
                        </View>

                        {/* Stepper for custom values */}
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                          <Text style={{ fontSize: 13, color: '#666666', marginBottom: 8 }}>
                            Custom
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <Pressable
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 22,
                                backgroundColor: '#F5F5F5',
                                justifyContent: 'center',
                                alignItems: 'center',
                                opacity: timeEstimateValue <= TIME_ESTIMATE_MIN ? 0.5 : 1,
                              }}
                              onPress={() =>
                                setTimeEstimateValue(
                                  Math.max(TIME_ESTIMATE_MIN, timeEstimateValue - TIME_ESTIMATE_STEP),
                                )
                              }
                              disabled={timeEstimateValue <= TIME_ESTIMATE_MIN}
                            >
                              <Minus
                                size={20}
                                color={
                                  timeEstimateValue <= TIME_ESTIMATE_MIN ? '#CCCCCC' : tokens.colors.primary
                                }
                              />
                            </Pressable>

                            <View style={{ minWidth: 80, alignItems: 'center' }}>
                              <Text
                                style={{
                                  fontSize: 20,
                                  fontWeight: '600',
                                  color: !TIME_ESTIMATE_QUICK_OPTIONS.includes(
                                    timeEstimateValue as (typeof TIME_ESTIMATE_QUICK_OPTIONS)[number],
                                  )
                                    ? tokens.colors.primary
                                    : '#333333',
                                }}
                              >
                                {formatTimeEstimate(timeEstimateValue)}
                              </Text>
                            </View>

                            <Pressable
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 22,
                                backgroundColor: '#F5F5F5',
                                justifyContent: 'center',
                                alignItems: 'center',
                                opacity: timeEstimateValue >= TIME_ESTIMATE_MAX ? 0.5 : 1,
                              }}
                              onPress={() =>
                                setTimeEstimateValue(
                                  Math.min(TIME_ESTIMATE_MAX, timeEstimateValue + TIME_ESTIMATE_STEP),
                                )
                              }
                              disabled={timeEstimateValue >= TIME_ESTIMATE_MAX}
                            >
                              <Plus
                                size={20}
                                color={
                                  timeEstimateValue >= TIME_ESTIMATE_MAX ? '#CCCCCC' : tokens.colors.primary
                                }
                              />
                            </Pressable>
                          </View>
                          <Text style={{ fontSize: 12, color: '#999999', marginTop: 4 }}>
                            5 min – 4 hrs
                          </Text>
                        </View>

                        {/* Action buttons */}
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Pressable
                            style={{ paddingVertical: 12, paddingHorizontal: 16 }}
                            onPress={() => {
                              if (baseType === 'habit') {
                                store.setHabitTimeEstimate(null);
                              } else {
                                store.setTodoTimeEstimate(null);
                              }
                              store.setUI({ showTimeEstimateModal: false });
                            }}
                          >
                            <Text style={{ fontSize: 14, color: '#666666' }}>Clear</Text>
                          </Pressable>

                          <Pressable
                            style={{
                              backgroundColor: tokens.colors.primary,
                              paddingVertical: 12,
                              paddingHorizontal: 24,
                              borderRadius: 8,
                            }}
                            onPress={() => {
                              if (baseType === 'habit') {
                                store.setHabitTimeEstimate(timeEstimateValue);
                              } else {
                                store.setTodoTimeEstimate(timeEstimateValue);
                              }
                              store.setUI({ showTimeEstimateModal: false });
                            }}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
                              Save
                            </Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Time Window Modal */}
                  <Modal visible={storeUI.showTimeWindowModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => store.setUI({ showTimeWindowModal: false })}
                    >
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                          width: '92%',
                          maxWidth: 400,
                          alignSelf: 'center',
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 20,
                          paddingTop: 20,
                          paddingBottom: 24,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: '#E0E0E0',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.15,
                          shadowRadius: 24,
                          elevation: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: '600',
                            color: '#222222',
                            marginBottom: 16,
                          }}
                        >
                          Preferred time of day
                        </Text>
                        <View style={styles.timeEstimateGrid}>
                          {TIME_WINDOW_OPTIONS.map((option) => {
                            const isSelected =
                              baseType === 'todo'
                                ? state.todo.time_window === option.value
                                : state.habit.time_window === option.value;
                            return (
                              <Pressable
                                key={option.value ?? 'null'}
                                style={[
                                  styles.timeEstimateOption,
                                  isSelected && styles.timeEstimateOptionSelected,
                                ]}
                                onPress={() => {
                                  if (baseType === 'todo') {
                                    store.setTodoTimeWindow(option.value);
                                  } else {
                                    store.setHabitTimeWindow(option.value);
                                  }
                                  store.setUI({ showTimeWindowModal: false });
                                }}
                              >
                                <Text
                                  style={[
                                    styles.timeEstimateOptionText,
                                    isSelected && styles.timeEstimateOptionTextSelected,
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </Pressable>
                    </Pressable>
                  </Modal>


                  {/* Habit Start Date Picker Modal */}
                  <Modal visible={storeUI.showHabitStartDatePicker} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => store.setUI({ showHabitStartDatePicker: false })}
                    >
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                          width: '92%',
                          maxWidth: 400,
                          alignSelf: 'center',
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 20,
                          paddingTop: 20,
                          paddingBottom: 24,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: '#E0E0E0',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.15,
                          shadowRadius: 24,
                          elevation: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: '600',
                            color: '#222222',
                            marginBottom: 16,
                          }}
                        >
                          When do you want to start?
                        </Text>
                        <DateTimePicker
                          value={
                            state.habit.start_date
                              ? parseISO(state.habit.start_date)
                              : getDateService().now()
                          }
                          mode="date"
                          display="spinner"
                          onChange={(event, date) => {
                            if (event.type === 'set' && date) {
                              store.setHabitStartDate(format(date, 'yyyy-MM-dd'));
                            }
                            store.setUI({ showHabitStartDatePicker: false });
                          }}
                        />
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            marginTop: 16,
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              store.setHabitStartDate(null);
                              store.setUI({ showHabitStartDatePicker: false });
                            }}
                            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                          >
                            <Text style={{ color: '#888888', fontSize: 14 }}>Leave TBD</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              store.setHabitStartDate(format(getDateService().now(), 'yyyy-MM-dd'));
                              store.setUI({ showHabitStartDatePicker: false });
                            }}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 16,
                              backgroundColor: lightTokens.colors.moss,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                              Start Today
                            </Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Habit End Date Picker Modal */}
                  <Modal visible={storeUI.showHabitEndDatePicker} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => store.setUI({ showHabitEndDatePicker: false })}
                    >
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                          width: '92%',
                          maxWidth: 400,
                          alignSelf: 'center',
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 20,
                          paddingTop: 20,
                          paddingBottom: 24,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: '#E0E0E0',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.15,
                          shadowRadius: 24,
                          elevation: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: '600',
                            color: '#222222',
                            marginBottom: 16,
                          }}
                        >
                          Set an end date (optional)
                        </Text>
                        <DateTimePicker
                          value={
                            state.habit.end_date
                              ? parseISO(state.habit.end_date)
                              : addDays(getDateService().now(), 30)
                          }
                          mode="date"
                          display="spinner"
                          minimumDate={
                            state.habit.start_date
                              ? parseISO(state.habit.start_date)
                              : getDateService().now()
                          }
                          onChange={(event, date) => {
                            if (event.type === 'set' && date) {
                              store.setHabitEndDate(format(date, 'yyyy-MM-dd'));
                            }
                            store.setUI({ showHabitEndDatePicker: false });
                          }}
                        />
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            marginTop: 16,
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              store.setHabitEndDate(null);
                              store.setUI({ showHabitEndDatePicker: false });
                            }}
                            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                          >
                            <Text style={{ color: '#888888', fontSize: 14 }}>No end date</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => store.setUI({ showHabitEndDatePicker: false })}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 16,
                              backgroundColor: lightTokens.colors.moss,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                              Done
                            </Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Space Selector Modal for To-Do Details */}
                  <Modal visible={storeUI.showSpaceModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => store.setUI({ showSpaceModal: false })}
                    >
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                          width: '85%',
                          maxWidth: 350,
                          backgroundColor: '#FFFFFF',
                          padding: 20,
                          borderRadius: 16,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.1,
                          shadowRadius: 12,
                          elevation: 5,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: '600',
                            color: '#111827',
                            marginBottom: 16,
                          }}
                        >
                          Select Space
                        </Text>

                        {/* Clear selection option */}
                        <Pressable
                          onPress={() => {
                            store.setSpaceId(null);
                            store.setUI({ showSpaceModal: false });
                          }}
                          style={({ pressed }) => ({
                            paddingVertical: 12,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: pressed
                              ? '#F3F4F6'
                              : state.spaceId === null
                                ? '#F0F4F1'
                                : 'transparent',
                            marginBottom: 8,
                          })}
                        >
                          <Text style={{ fontSize: 15, color: '#374151' }}>None</Text>
                        </Pressable>

                        {/* Space options */}
                        <ScrollView style={{ maxHeight: 300 }}>
                          {spaces.map((space) => (
                            <Pressable
                              key={space.id}
                              onPress={() => {
                                store.setSpaceId(space.id);
                                store.setUI({ showSpaceModal: false });
                              }}
                              style={({ pressed }) => ({
                                paddingVertical: 12,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                                backgroundColor: pressed
                                  ? '#F3F4F6'
                                  : state.spaceId === space.id
                                    ? '#F0F4F1'
                                    : 'transparent',
                                marginBottom: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                              })}
                            >
                              {space.icon && (
                                <Text style={{ fontSize: 16, marginRight: 10 }}>{space.icon}</Text>
                              )}
                              <Text style={{ fontSize: 15, color: '#374151' }}>{space.name}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Reminders Management Modal – powered by SetRemindersModal */}
                  <SetRemindersModal
                    visible={showRemindersModal}
                    onClose={() => setShowRemindersModal(false)}
                    reminders={itemReminders}
                    onSave={(updated) => {
                      setItemReminders(updated);
                      setShowRemindersModal(false);
                    }}
                    itemType={baseType === 'habit' ? 'habit' : 'todo'}
                  />

                  {/* Save bar (fixed within the sheet) */}
                  {/* Inline save error / retry bar (Phase 9) */}
                  {saveError ? (
                    <Box
                      px={4}
                      py={2}
                      style={{
                        backgroundColor: '#fce8e6',
                        borderTopWidth: StyleSheet.hairlineWidth,
                      }}
                    >
                      <Box row style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#7a2719', flex: 1 }}>{saveError}</Text>
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => {
                            // Retry invokes save again
                            setSaveError(null);
                            // call onSave again
                            // eslint-disable-next-line @typescript-eslint/no-floating-promises
                            onSave();
                          }}
                          title="Retry"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => setSaveError(null)}
                          title="Dismiss"
                        />
                      </Box>
                    </Box>
                  ) : isOffline ? (
                    <Box px={4} py={1}>
                      <Text variant="subtle">You're offline — Save will keep the draft.</Text>
                    </Box>
                  ) : null}

                  {/* Persistent footer — Cancel / Save */}
                  {!isViewMode && (
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
                      borderTopWidth: 0.5,
                      borderTopColor: '#D5D0C8',
                      backgroundColor: '#F5F2EB',
                    }}>
                      <Pressable
                        onPress={handleCancel}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 44, justifyContent: 'center' })}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                      >
                        <Text style={{ fontSize: 15, color: '#6B665C' }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={onSave}
                        disabled={storeUI.saving || !canSave}
                        accessibilityRole="button"
                        accessibilityLabel={storeUI.saving ? 'Saving' : 'Save'}
                        style={({ pressed }) => ({
                          backgroundColor: (storeUI.saving || !canSave) ? 'rgba(45,74,62,0.35)' : '#2D4A3E',
                          paddingHorizontal: 28,
                          paddingVertical: 10,
                          borderRadius: 20,
                          minHeight: 44,
                          justifyContent: 'center',
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '600', color: (storeUI.saving || !canSave) ? 'rgba(255,255,255,0.6)' : '#FFFFFF' }}>
                          {storeUI.saving ? 'Saving...' : isLockedIn ? 'Lock It In →' : 'Save'}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* View mode footer */}
                  {isViewMode && (
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
                      borderTopWidth: 0.5,
                      borderTopColor: '#D5D0C8',
                      backgroundColor: '#F5F2EB',
                    }}>
                      <Pressable
                        onPress={handleCancel}
                        style={{ minHeight: 44, justifyContent: 'center' }}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                      >
                        <Text style={{ fontSize: 15, color: '#6B665C' }}>Close</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setDisplayMode('edit')}
                        accessibilityRole="button"
                        accessibilityLabel="Edit"
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          borderWidth: 0.5, borderColor: '#D5D0C8',
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                          minHeight: 44,
                        }}
                      >
                        <Pencil size={14} color="#2E5540" />
                        <Text style={{ fontSize: 14, fontWeight: '500', color: '#2E5540' }}>Edit</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Expanded editor — full-screen overlay */}
                  {isExpandedEditor && (
                    <View style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 50,
                      backgroundColor: '#FFFFFF',
                    }}>
                      <OverlayExpandedEditor
                        baseType={baseType}
                        effectiveLogSubtype={effectiveLogSubtype}
                        text={currentText}
                        onChangeText={(t) => store.setBody(t)}
                        colorMode={colorMode}
                        isLog={isLog}
                        onCollapse={() => {
                          LayoutAnimation.configureNext(
                            LayoutAnimation.Presets.easeInEaseOut,
                          );
                          setIsExpandedEditor(false);
                        }}
                        journalDateTime={
                          effectiveLogSubtype === 'journal'
                            ? getDateService().now()
                            : undefined
                        }
                        isChecklistMode={isChecklistMode}
                        onToggleChecklistMode={() => {
                          const newMode = !state.isChecklistMode;
                          store.setChecklistMode(newMode);
                          if (!newMode && checklistItems && checklistItems.length > 0) {
                            setUserClearedChecklist(true);
                            setChecklistItems(null);
                          }
                        }}
                      />
                    </View>
                  )}

          </RNAnimated.View>
        </SafeAreaView>

        {/* Fullscreen image modal (Phase L5 - multi-photo support) */}
        <Modal visible={selectedPhotoIndex !== null} transparent animationType="fade">
          <Pressable
            style={styles.imageModalContainer}
            onPress={() => setSelectedPhotoIndex(null)}
            accessibilityLabel="Close fullscreen image"
            accessibilityRole="button"
          >
            {selectedPhotoIndex !== null && logPhotos[selectedPhotoIndex] ? (
              <Image
                source={{ uri: logPhotos[selectedPhotoIndex].url }}
                style={styles.imageModalImage}
                resizeMode="contain"
              />
            ) : null}
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>

      {/* Entity Chat Screen - full screen overlay on top of current overlay */}
      {storeUI.showEntityChat && currentEntityId && (
        <Modal visible={storeUI.showEntityChat} animationType="slide" presentationStyle="fullScreen">
          <EntityChatScreen
            entityId={currentEntityId}
            entityType={entityTypeForChat}
            onClose={() => store.setUI({ showEntityChat: false })}
          />
        </Modal>
      )}

      {/* TodoPreviewModal - for exploding notes to todos */}
      <TodoPreviewModal
        visible={storeUI.showTodoPreview}
        items={extractedItems}
        spaceName={currentSpaceName}
        spaceId={fullEntity?.space_id || initialSpaceId || ''}
        onConfirm={handleExplodeToTodos}
        onCancel={() => store.setUI({ showTodoPreview: false })}
        isLoading={isCreatingTodos}
      />

      {/* Entity Notes Modal - saved notes from chat */}
      <EntityNotesModal
        visible={storeUI.showNotesModal}
        notes={entityChatNotes}
        onClose={() => store.setUI({ showNotesModal: false })}
        onChecklistToggle={handleChatNoteChecklistToggle}
        onUpdateNote={handleChatNoteUpdate}
        onDeleteNote={handleChatNoteDelete}
        onConvertToChecklist={handleConvertNoteToChecklist}
      />

      {/* Clarification Popup - Phase 2 */}
      <ClarificationPopup
        visible={showClarificationPopup}
        question={clarificationQuestion}
        options={clarificationOptions}
        onSelectOption={handleClarificationSelect}
        onSkip={handleClarificationSkip}
        onClose={() => setShowClarificationPopup(false)}
        isSubmitting={clarificationLoading}
        successMessage={clarificationSuccess}
      />
    </>
  );
}

function headerFor(base: BaseType, mode: 'create' | 'edit' | 'view', title?: string) {
  // Phase 6b: Show entity title in edit mode instead of generic "Edit"
  // View mode shows its own title inside renderViewModeContent — avoid duplicating it in header
  if (mode === 'edit' && title) return title;
  if (mode === 'view') return base === 'habit' ? 'Habit Progress' : 'View';
  if (mode === 'edit') return 'Edit';
  return base === 'log' ? 'New Log' : base === 'todo' ? 'New To-Do' : 'New Habit';
}

function MoodPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const _on = onPress ?? (() => {});
  return (
    <Box style={styles.chipSmall}>
      <Button
        size="sm"
        variant={active ? 'primary' : 'ghost'}
        onPress={_on}
        title={label}
        accessibilityLabel={`Mood ${label}`}
      />
    </Box>
  );
}

function Chip({ label, onPress }: { label: string; onPress?: () => void }) {
  const _on = onPress ?? (() => {});
  return (
    <Box style={styles.chipSmall}>
      <Button
        size="sm"
        variant="ghost"
        onPress={_on}
        title={label}
        accessibilityLabel={`Mention ${label}`}
      />
    </Box>
  );
}

function buildCreateOrUpdateInput({
  mode,
  baseType,
  text,
  title,
  spaceId,
  initialEntity,
}: {
  mode: 'create' | 'edit';
  baseType: BaseType;
  text: string;
  title: string;
  spaceId: string | null;
  initialEntity?: { id?: string; type?: string } | null;
}) {
  // Minimal, safe parity with V1 paths:
  if (baseType === 'todo') {
    return {
      type: 'todo' as const,
      title: title || 'Untitled',
      details: text || null,
      space_id: spaceId,
      origin: 'catchall' as const,
    };
  }
  if (baseType === 'habit') {
    return {
      type: 'habit' as const,
      title: title || 'Untitled',
      notes: text || null,
      frequency: 'custom', // Level-1 default; refined in later phases
      space_id: spaceId,
      origin: 'catchall' as const,
    };
  }
  // default: log → note (catchall)
  return {
    type: 'note' as const,
    subtype: 'catchall' as const,
    title: title || 'Untitled note',
    body: text,
    space_id: spaceId,
    origin: 'catchall' as const,
  };
}

