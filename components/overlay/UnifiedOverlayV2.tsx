/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useCallback, useReducer, useState, useRef } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  StyleSheet,
  UIManager,
  useColorScheme,
  View,
  Animated as RNAnimated,
  Easing,
  ActivityIndicator,
  Alert,
  Image,
  ActionSheetIOS,
  Keyboard,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolate,
} from 'react-native-reanimated';
import {
  X as CloseIcon,
  Plus,
  Minus,
  Calendar,
  Pencil,
  RotateCw,
  Lock,
  Bell,
  Folder,
  ChevronRight,
  Trash2,
  Camera,
  Diamond,
  Maximize2,
  Star,
  FileText,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  X,
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
  setMinutes,
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
  borderRadius as tokenRadius,
} from '../../design/tokens';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { selectItemById, useActiveSpaces, useSpaceHasEvents } from '../../lib/store/selectors';
import { useAuth } from '../../providers/AuthProvider';
import ScopeSelector from '../ScopeSelector';
import { usePhase8LinksState } from './hooks/usePhase8LinksState';
import { PeopleLinker } from './fields/PeopleLinker';
import PersonPicker from './fields/PersonPicker';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';
import {
  v2Reducer,
  initialV2State,
  firstLine,
  classifyLogKind,
  type BaseType,
  type TagKey,
  type V2State,
  type HabitState,
} from './overlayV2.state';
import ToastUndo from './ToastUndo';
import { OverlayExpandedEditor } from './OverlayExpandedEditor';
import {
  linkSelectedPerson,
  sanitizeSuggestedTags,
  filterMindDropTodoTags,
} from './overlayV2.mapping';
import { recordOverlayFeedback } from './overlayV2.feedback';
import { eventBus } from '../../lib/events/EventBus';
import { getTodayISO } from '../../app/utils/recurrence';
import { TagsRow, type TagsRowTag } from './fields/TagsRow';
import { normalizeTag, filterAndNormalizeTags } from '../../lib/tags/normalize';
import { extractMeaningfulTags } from '../../lib/tags/extractTags';
import { getEffectiveTags } from '../../lib/tags/getEffectiveTags';
import { getEffectiveLogSubtype } from '../../lib/logs/getEffectiveLogSubtype';
import { calculateBuffers } from '../../lib/planning';
import {
  ALL_MOODS,
  MOOD_CONFIG,
  getMoodsByCategory,
  isValidMood,
  migrateLegacyMood,
  type Mood,
} from '../../lib/shared/moods';
import { emitOverlayEvent } from '../../lib/telemetry/overlay';
import { getMindDropRawText } from './getMindDropRawText';
import { buildCanonicalFromMindDrop } from '../../lib/minddrop/buildCanonicalFromMindDrop';
import { resummarizeTitle, resummarizeTags } from '../../lib/minddrop/backgroundPrefill';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { enrichListItems } from '../../lib/ai/enrichListItem';
import {
  type FrequencyConfig,
  type DayOfWeek,
  frequencyToJson,
  jsonToFrequency,
  getFrequencyLabel,
  DAY_LABELS,
} from './frequencyHelpers';
import {
  canonicalToFrequencyJson,
  frequencyJsonToCanonical,
  parseFrequencyString,
} from '../../lib/habits/frequencyUtils';

// Make Actionable feature
import { MakeActionableButton } from './MakeActionableButton';
import { ChecklistView } from './ChecklistView';

// Habit View Mode
import HabitViewMode from './HabitViewMode';

// Entity Chat
import { EntityChatButton, EntityChatScreen, EntityNotesSection, EntityNotesModal } from '../chat';
import { ChecklistProgress } from './ChecklistProgress';

// Linked Items for Events
import LinkedItemsSection from './LinkedItemsSection';
import LinkedEventPicker from './LinkedEventPicker';
import { RevertToTextButton } from './RevertToTextButton';
import { TodoPreviewModal } from './TodoPreviewModal';
import { ClarificationPopup } from '../minddrop/ClarificationPopup';
import {
  extractListItems,
  hasActionableList,
  toListItems,
  type ExtractedListItem,
  type ListItem,
} from '../../lib/lists';

const BASE_LABEL: Record<BaseType, string> = { log: 'Note', todo: 'To-Do', habit: 'Habit' };

/**
 * Constructs frequency_json from DB columns for the overlay's FrequencyConfig format.
 *
 * Uses centralized frequencyUtils for canonical schema, with fallback for legacy schema.
 * Priority: cadence/target_per_period > frequency_value > parsed frequency string
 */
function buildFrequencyJsonFromDb(
  frequency: string | null | undefined,
  frequencyValue: number | null | undefined,
  cadence?: string | null,
  targetPerPeriod?: number | null,
  daysActive?: number[] | string[] | null,
): any {
  // If frequency_value is already a JSON object, use it directly (legacy support)
  if (frequencyValue && typeof frequencyValue === 'object') {
    console.log('[buildFrequencyJsonFromDb] Using legacy frequencyValue object:', frequencyValue);
    return frequencyValue;
  }

  // If days_active is set, build custom_days frequency
  // DB may return as integer[] or string[] depending on how it was stored
  if (daysActive && Array.isArray(daysActive) && daysActive.length > 0) {
    // Convert strings to numbers if needed (DB sometimes returns strings)
    const days = daysActive
      .map((d) => (typeof d === 'string' ? parseInt(d, 10) : d))
      .filter((d): d is number => typeof d === 'number' && !isNaN(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (days.length > 0) {
      console.log('[buildFrequencyJsonFromDb] ✅ Built custom_days from days_active:', {
        daysActive,
        days,
        result: { type: 'days', days },
      });
      return { type: 'days', days };
    }
  }

  // Use centralized utility for canonical schema (SINGLE SOURCE OF TRUTH)
  if (cadence) {
    const result = canonicalToFrequencyJson(cadence, targetPerPeriod);
    console.log('[buildFrequencyJsonFromDb] Built from cadence:', {
      cadence,
      targetPerPeriod,
      result,
    });
    return result;
  }

  // Legacy: parse frequency string if no canonical fields
  if (frequency) {
    const { cadence: parsedCadence, target_per_period } = parseFrequencyString(frequency);
    const result = canonicalToFrequencyJson(parsedCadence, target_per_period);
    console.log('[buildFrequencyJsonFromDb] Built from legacy frequency:', { frequency, result });
    return result;
  }

  // Default to daily
  console.log('[buildFrequencyJsonFromDb] Defaulting to daily');
  return { type: 'simple', value: 'daily' };
}

/**
 * Extract days_active from frequency_json for custom_days frequency.
 * Returns numeric day indices (0=Sunday, 1=Monday, etc.) as integer array.
 *
 * @param frequencyJson - The frequency_json object from overlay state
 * @returns Array of day numbers like [1, 3, 5] or null
 */
function extractDaysActiveFromFrequencyJson(frequencyJson: any): number[] | null {
  if (!frequencyJson || typeof frequencyJson !== 'object') {
    console.log(
      '[UnifiedOverlay:DaysActive] ❌ extractDaysActive - no frequencyJson:',
      frequencyJson,
    );
    return null;
  }

  // Handle custom_days format: { kind: 'custom_days', days: [1, 3, 5] }
  if (
    frequencyJson.kind === 'custom_days' &&
    Array.isArray(frequencyJson.days) &&
    frequencyJson.days.length > 0
  ) {
    const days = frequencyJson.days.filter(
      (d: number) => typeof d === 'number' && d >= 0 && d <= 6,
    );
    console.log('[UnifiedOverlay:DaysActive] ✅ extractDaysActive - found days:', {
      frequencyJson,
      extractedDays: days,
    });
    return days;
  }

  console.log('[UnifiedOverlay:DaysActive] ⚠️ extractDaysActive - not custom_days:', frequencyJson);
  return null;
}

/**
 * Convert frequency_json back to canonical cadence/target_per_period fields.
 * Uses centralized frequencyUtils (SINGLE SOURCE OF TRUTH).
 *
 * @param frequencyJson - The frequency_json object from overlay state
 * @param schedule - The schedule string from overlay state (fallback)
 * @returns Object with cadence and target_per_period
 */
function frequencyJsonToCadenceFields(
  frequencyJson: any,
  schedule?: string | null,
): { cadence: 'daily' | 'weekly' | 'monthly'; target_per_period: number } {
  // Use centralized utility (SINGLE SOURCE OF TRUTH)
  if (frequencyJson && typeof frequencyJson === 'object') {
    return frequencyJsonToCanonical(frequencyJson);
  }

  // Fallback to schedule string
  const sched = (schedule || 'daily').toLowerCase();
  if (sched === 'weekly') return { cadence: 'weekly', target_per_period: 1 };
  if (sched === 'monthly') return { cadence: 'monthly', target_per_period: 1 };
  return { cadence: 'daily', target_per_period: 1 };
}

/**
 * TYPE_FAMILY maps BaseType to Supabase table family.
 * - 'note' family: logs/notes (stored in `notes` table)
 * - 'todo' family: todos (stored in `todos` table)
 * - 'habit' family: habits (stored in `habits` table)
 *
 * When converting between different families, we must:
 * 1. Create a new record in the target table
 * 2. Archive/delete the old record in the source table
 * 3. Preserve drop_id to maintain Mind Drop linkage
 */
type TypeFamily = 'note' | 'todo' | 'habit';
const TYPE_FAMILY: Record<BaseType, TypeFamily> = {
  log: 'note',
  todo: 'todo',
  habit: 'habit',
};

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

// Multi-photo support for logs (Phase L5)
type LogPhoto = {
  id?: string; // existing DB row id (for edit mode)
  url: string; // public URL or storage path (or local file URI for new photos)
  position: number; // 0-based ordering
  isNew?: boolean; // not yet persisted to backend
  isDeleted?: boolean; // marked for deletion on save
};

// Overlay-only reminder type for unified reminders UX
type OverlayReminder = {
  id: string; // local UUID for list keys
  time: string; // "HH:mm" in 24h format (e.g. "09:00")
  repeat: 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';
  date?: string; // ISO date for "once" reminders
  days?: number[]; // 0–6 for custom days (0=Sunday, 6=Saturday)
};

// Short day labels for custom repeat display
const SHORT_DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Smart list detection helper (Prompt 3)
type ListDetectionResult =
  | { kind: 'plain' }
  | { kind: 'list'; items: Array<{ id: string; label: string; checked?: boolean }> };

function detectListFromText(text: string): ListDetectionResult {
  if (!text || text.trim().length === 0) {
    return { kind: 'plain' };
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { kind: 'plain' };
  }

  // List patterns to detect
  const bulletPattern = /^[-•]\s+(.+)$/; // - item or • item
  const checkboxPattern = /^\[([ xX])\]\s+(.+)$/; // [ ] item or [x] item
  const numberedPattern = /^\d+\.\s+(.+)$/; // 1. item or 2. item

  const items: Array<{ id: string; label: string; checked?: boolean }> = [];
  let matchCount = 0;

  for (const line of lines) {
    let matched = false;

    // Check for checkbox pattern first (preserves checked state)
    const checkboxMatch = line.match(checkboxPattern);
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === 'x';
      const label = checkboxMatch[2];
      items.push({ id: `item-${items.length}`, label, checked });
      matched = true;
      matchCount++;
    }

    // Check for bullet pattern
    if (!matched) {
      const bulletMatch = line.match(bulletPattern);
      if (bulletMatch) {
        const label = bulletMatch[1];
        items.push({ id: `item-${items.length}`, label, checked: false });
        matched = true;
        matchCount++;
      }
    }

    // Check for numbered pattern
    if (!matched) {
      const numberedMatch = line.match(numberedPattern);
      if (numberedMatch) {
        const label = numberedMatch[1];
        items.push({ id: `item-${items.length}`, label, checked: false });
        matched = true;
        matchCount++;
      }
    }

    // If this line doesn't match any pattern, it might be part of previous item or non-list text
    // For simplicity, we'll skip it (could be enhanced to append to previous item)
  }

  // Require at least 2 matching list items to qualify as a list
  if (matchCount >= 2 && items.length >= 2) {
    return { kind: 'list', items };
  }

  return { kind: 'plain' };
}

// Helper: format time from "HH:mm" to "h:mm AM/PM"
function formatTime24To12(time24: string): string {
  const [hourStr, minute] = time24.split(':');
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute} ${period}`;
}

// Helper: format single reminder for display
function formatSingleReminder(r: OverlayReminder): string {
  const timeFormatted = formatTime24To12(r.time);

  switch (r.repeat) {
    case 'once':
      // Format date like "Nov 25 · 3:00 PM"
      if (r.date) {
        try {
          const dateFormatted = format(parseISO(r.date), 'MMM d');
          return `${dateFormatted} · ${timeFormatted}`;
        } catch {
          return `Once · ${timeFormatted}`;
        }
      }
      return `Once · ${timeFormatted}`;

    case 'daily':
      return `Daily · ${timeFormatted}`;

    case 'weekdays':
      return `Weekdays · ${timeFormatted}`;

    case 'weekends':
      return `Weekends · ${timeFormatted}`;

    case 'custom':
      if (r.days && r.days.length > 0) {
        const dayLabels = r.days
          .sort((a, b) => a - b)
          .map((d) => SHORT_DAY_LABELS[d])
          .join(', ');
        return `${dayLabels} · ${timeFormatted}`;
      }
      return `Custom · ${timeFormatted}`;

    default:
      return timeFormatted;
  }
}

// Helper: format reminders array for summary display
function formatReminderSummary(reminders: OverlayReminder[]): string {
  if (reminders.length === 0) return 'Off';
  if (reminders.length === 1) return formatSingleReminder(reminders[0]);
  return `${reminders.length} reminders`;
}

// Helper: map reminders array to legacy reminderAt field (use first reminder only)
function mapRemindersToLegacyFields(reminders: OverlayReminder[]): {
  reminderAt: string | null;
} {
  if (reminders.length === 0) {
    return { reminderAt: null };
  }

  const first = reminders[0];

  // For "once" reminders, combine date + time into ISO timestamp
  if (first.repeat === 'once' && first.date) {
    try {
      const [hour, minute] = first.time.split(':').map(Number);
      const dateObj = parseISO(first.date);
      const combined = setMinutes(setHours(dateObj, hour), minute);
      return { reminderAt: combined.toISOString() };
    } catch {
      return { reminderAt: null };
    }
  }

  // For recurring reminders, store as today + time for now
  // (full recurrence will be handled in backend later)
  try {
    const [hour, minute] = first.time.split(':').map(Number);
    const today = new Date();
    const combined = setMinutes(setHours(today, hour), minute);
    return { reminderAt: combined.toISOString() };
  } catch {
    return { reminderAt: null };
  }
}

// Helper: hydrate reminders array from existing reminderAt field
function hydrateRemindersFromLegacy(reminderAt: string | null): OverlayReminder[] {
  if (!reminderAt) return [];

  try {
    const dateObj = parseISO(reminderAt);
    const hour = format(dateObj, 'HH');
    const minute = format(dateObj, 'mm');
    const time = `${hour}:${minute}`;
    const date = format(dateObj, 'yyyy-MM-dd');

    // Create a single "once" reminder from existing reminderAt
    return [
      {
        id: `reminder-${Date.now()}`,
        time,
        repeat: 'once',
        date,
      },
    ];
  } catch {
    return [];
  }
}

function normalizeTagCandidate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  // Preserve @ and # prefixes, only strip other leading chars
  if (/^[@#]/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/^[^a-z0-9]+/, '');
}

function normalizeToTagKey(value: unknown): TagKey | null {
  const slug = normalizeTagCandidate(value);
  return slug || null;
}

function coerceIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
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

function extractTagKeysFromEntity(entity: any): TagKey[] {
  if (!entity) return [];
  const raw = entity.tags;
  if (!Array.isArray(raw)) return [];

  // For Mind Drop todos (origin='catchall'), apply tag quality filtering
  const isMindDropTodo = entity.type === 'todo' && entity.origin === 'catchall';
  let tagsToProcess = isMindDropTodo ? filterAndNormalizeTags(raw) : raw;

  // Apply "Book [appointment]" heuristic for Mind Drop todos
  if (isMindDropTodo) {
    const rawText = getMindDropRawText(entity);
    if (rawText) {
      tagsToProcess = filterMindDropTodoTags(rawText, tagsToProcess);
    }
  }

  // IMPORTANT: Only use tags from entity.tags (DB source of truth)
  // Do NOT extract additional tags from body text here.
  // People/topic tags should be persisted to DB during Phase 2 enrichment.
  const seen = new Set<TagKey>();
  for (const entry of tagsToProcess) {
    const tag = normalizeToTagKey(entry);
    if (tag && !seen.has(tag)) seen.add(tag);
  }
  return Array.from(seen);
}

function mergeTagKeys(base: TagKey[], incoming: TagKey[]): TagKey[] {
  if (incoming.length === 0) return base;
  const next = new Set(base.map((tag) => normalizeToTagKey(tag) ?? tag));
  incoming.forEach((tag) => {
    const normalized = normalizeToTagKey(tag);
    if (normalized) {
      next.add(normalized);
    }
  });
  return Array.from(next) as TagKey[];
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

function deriveBaseTypeFromInitial(type: unknown): BaseType | null {
  if (!type) return null;
  const normalized = String(type).toLowerCase();
  if (normalized === 'todo') return 'todo';
  if (normalized === 'habit') return 'habit';
  return 'log';
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

/**
 * Derives the initial V2State from props, ensuring baseType is correct on first render.
 * This fixes the P0 bug where editing a todo/habit briefly shows an empty LOG overlay.
 *
 * For edit/view mode: derives baseType from initialEntity.type synchronously
 * For create mode: uses the default baseType from initialV2State ('log')
 */
function getInitialV2StateFromProps(props: UnifiedCreateOverlayProps): V2State {
  const { mode, initialEntity } = props;

  // Start with the default initial state
  let baseType: BaseType = initialV2State.baseType; // default is 'log'

  // For edit/view mode with an initialEntity, derive baseType from entity type
  if ((mode === 'edit' || mode === 'view') && initialEntity) {
    const entityType = (initialEntity as any)?.type;
    const derived = deriveBaseTypeFromInitial(entityType);
    if (derived) {
      baseType = derived;
    }
  }

  // Return initial state with the correct baseType
  // Note: Full hydration still happens via HYDRATE_EDIT action
  return {
    ...initialV2State,
    baseType,
  };
}

function stripJournalTags(tags: TagKey[], keepJournal: boolean): TagKey[] {
  if (keepJournal) return [...tags];
  return tags.filter((tag) => {
    const slug = tag.trim().toLowerCase();
    return slug !== 'journal' && slug !== '*journal';
  });
}

/**
 * Compare two tag arrays to determine if they have changed.
 * Returns true if tags are different (order-insensitive).
 */
function areTagsEqual(originalTags: string[], newTags: string[]): boolean {
  // Normalize and sort both arrays for comparison
  const normalize = (tags: string[]) => {
    const normalized = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .sort();
    return Array.from(new Set(normalized)); // Remove duplicates
  };

  const normalizedOriginal = normalize(originalTags);
  const normalizedNew = normalize(newTags);

  // Compare lengths first
  if (normalizedOriginal.length !== normalizedNew.length) {
    return false;
  }

  // Compare each element (arrays are already sorted)
  return normalizedOriginal.every((tag, index) => tag === normalizedNew[index]);
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
const SHEET_MAX_H = Math.round(Dimensions.get('window').height * 0.9);

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
    const now = new Date();
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

  // Fetch the LIVE entity from Zustand store (so we get updated clarification data)
  const fullEntity = useGremlyStore((state) => {
    if (!entityIdToFetch) return propsEntity; // Fall back to props if no ID

    // Check all entity types for the most up-to-date data
    const todo = state.todos.find((t) => t.id === entityIdToFetch);
    if (todo) return todo;

    const habit = state.habits.find((h) => h.id === entityIdToFetch);
    if (habit) return habit;

    const note = state.notes.find((n) => n.id === entityIdToFetch);
    if (note) return note;

    // Fall back to props entity if not found in store
    return propsEntity;
  });

  // Debug: Log entity sources to understand what's available
  console.log('[UnifiedOverlayV2] Entity sources:', {
    propsEntityId: propsEntity?.id,
    entityIdToFetch,
    fullEntityId: fullEntity?.id,
    fullEntityType: fullEntity?.type,
    fullEntityViews: fullEntity?.views ? Object.keys(fullEntity.views) : 'none',
    fromZustand: fullEntity?.id && fullEntity?.id === entityIdToFetch,
  });

  // Clarification detection (Phase 2)
  // Check both direct fields and views JSONB (data stored in views)
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

  // Debug: Log clarification check
  console.log('[UnifiedOverlayV2] Clarification data from fullEntity:', {
    visible,
    entityId: fullEntity?.id,
    needsClarification,
    clarificationResolved:
      fullEntity?.clarification_resolved || fullEntity?.views?.clarification_resolved,
    clarificationQuestion,
    clarificationOptionsCount: clarificationOptions?.length || 0,
    clarificationType,
  });

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
  // P0 fix: Use lazy initializer to derive baseType from initialEntity.type on first render
  // This prevents the brief flash of empty LOG form when editing todos/habits
  const [state, dispatch] = useReducer(v2Reducer, props, getInitialV2StateFromProps);
  const baseType = state.baseType;
  const isBreakHabit = baseType === 'habit' && state.habit.subtype === 'break_habit';

  // Track previous entity ID to detect entity changes
  const prevEntityIdRef = useRef<string | null>(null);
  const currentEntityId = (initialEntity as any)?.id ?? null;

  // Local display mode for habits - allows toggling between view/edit within the overlay
  // Track if we started in view mode so we can show a back button
  const startedInViewMode = mode === 'view' && baseType === 'habit';
  const [displayMode, setDisplayMode] = useState<'view' | 'edit'>(
    startedInViewMode ? 'view' : 'edit',
  );

  // Derive effective view mode - use local state for habits, prop for others
  const isViewMode = baseType === 'habit' ? displayMode === 'view' : mode === 'view';

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

    // Debug logging
    if (__DEV__) {
      console.log('[UnifiedOverlayV2] entityChatNotes computed:', {
        entityId: currentEntityId,
        entityType: entityTypeForChat,
        hasEntity: !!entity,
        viewsKeys: views ? Object.keys(views) : null,
        hasChatData: !!chatData,
        notesCount: notes.length,
        notes: notes.map((n: any) => ({ id: n.id, content: n.content?.substring(0, 30) })),
      });
    }

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
    console.log('[UnifiedOverlayV2] Clarification useEffect triggered:', {
      visible,
      needsClarification,
      clarificationQuestion,
      clarificationOptionsLength: clarificationOptions?.length,
    });

    if (visible && needsClarification && clarificationQuestion) {
      console.log('[UnifiedOverlayV2] Should show clarification popup!');
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
      console.log('[UnifiedOverlayV2] handleClarificationSelect called:', { optionId });

      // Get the entity ID from fullEntity (which combines props.entity and initialEntity)
      const entityId = fullEntity?.id;
      console.log('[UnifiedOverlayV2] Entity ID resolved:', {
        entityId,
        fromFullEntity: fullEntity?.id,
        propsEntityId: propsEntity?.id,
        initialEntityId: initialEntity?.id,
      });

      if (!entityId) {
        console.error('[UnifiedOverlayV2] No entity ID available for clarification');
        setShowClarificationPopup(false);
        return;
      }

      // Show loading state
      setClarificationLoading(true);

      console.log('[UnifiedOverlayV2] Calling store action resolvePendingDropClarification...');

      try {
        await resolvePendingDropClarification(entityId, optionId);
        console.log('[UnifiedOverlayV2] Store action completed successfully');

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

          console.log('[UnifiedOverlayV2] Clarification resolved, events emitted');
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
    console.log('[UnifiedOverlayV2] Clarification skipped', { entityId });

    // Close popup immediately
    setShowClarificationPopup(false);

    if (!entityId) return;

    // Resolve as skipped - this updates the entity and runs Phase 2
    try {
      await resolveSkippedClarification(entityId);
      console.log('[UnifiedOverlayV2] Skip resolution completed');
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

  // Phase L9: Show Private toggle only for journal logs
  const showLogPrivateToggle = baseType === 'log' && effectiveLogSubtype === 'journal';

  // Derived checklist mode: explicit state OR legacy "list" subtype for logs
  const isChecklistMode =
    state.isChecklistMode || (baseType === 'log' && effectiveLogSubtype === 'list');

  // Prompt 3: Smart list detection for logs
  const listDetection = useMemo(() => {
    if (!isLog) return { kind: 'plain' } as const;
    return detectListFromText(state.log.body);
  }, [isLog, state.log.body]);

  if (__DEV__ && isLog) {
    console.log(
      '[UnifiedOverlayV2] log kind:',
      logKind,
      'effectiveLogSubtype:',
      effectiveLogSubtype,
    );
  }
  const [isSaving, setIsSaving] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showTimeEstimateModal, setShowTimeEstimateModal] = useState(false);
  const [timeEstimateValue, setTimeEstimateValue] = useState<number>(30); // Stepper value for time estimate modal
  const [showTimeWindowModal, setShowTimeWindowModal] = useState(false);
  const [showHabitStartDatePicker, setShowHabitStartDatePicker] = useState(false);
  const [showHabitEndDatePicker, setShowHabitEndDatePicker] = useState(false);
  const [dateModalTarget, setDateModalTarget] = useState<
    'todo_deadline' | 'todo_dodate' | 'note_event' | 'note_end_date' | 'reminder' | null
  >(null);
  const [showSpaceModal, setShowSpaceModal] = useState(false);

  // Keyboard height tracking for dynamic sheet sizing
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Reminders management state
  const [reminders, setReminders] = useState<OverlayReminder[]>([]);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<OverlayReminder | null>(null);
  const [editingMode, setEditingMode] = useState<'add' | 'edit'>('add');
  const [reminderTimeValue, setReminderTimeValue] = useState(new Date());
  const [reminderDateValue, setReminderDateValue] = useState(new Date());
  const [reminderRepeat, setReminderRepeat] = useState<OverlayReminder['repeat']>('once');
  const [reminderCustomDays, setReminderCustomDays] = useState<number[]>([]);
  const [reminderValidationError, setReminderValidationError] = useState<string | null>(null);

  // Date picker state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [clearDateFlag, setClearDateFlag] = useState(false);
  // Preset time picker state
  const [selectedTimePreset, setSelectedTimePreset] = useState<string | 'custom' | null>(null);
  const [showCustomTimePicker, setShowCustomTimePicker] = useState(false);
  // Frequency picker state (legacy modal — now reads from scheduleModalState)
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  // Unified Schedule Modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showScheduleStartDatePicker, setShowScheduleStartDatePicker] = useState(false);
  const [showScheduleEndDatePicker, setShowScheduleEndDatePicker] = useState(false);
  const [scheduleModalState, setScheduleModalState] = useState({
    frequencyTab: 'simple' as 'simple' | 'days' | 'custom',
    frequencyJson: null as any,
    selectedDays: [] as number[],
    customCount: '1',
    customUnit: 'week' as 'day' | 'week' | 'month',
    startDate: null as string | null,
    endDate: null as string | null,
    timeWindow: null as string | null,
    timeEstimateMinutes: null as number | null,
  });
  // save error UI
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [dueToastMessage, setDueToastMessage] = useState<string | null>(null);

  // Make Actionable feature state
  const [showTodoPreview, setShowTodoPreview] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedListItem[]>([]);
  const [checklistItems, setChecklistItems] = useState<ListItem[] | null>(null);
  const [userClearedChecklist, setUserClearedChecklist] = useState(false);

  // Reset checklistItems when overlay opens - critical for reopening same entity
  useEffect(() => {
    if (!visible) return;

    // Get the freshest has_list value from the entity passed via openEdit
    const passedEntity = initialEntity as any;
    const entityData = fullEntity || passedEntity;

    if (entityData?.has_list === true && entityData?.list_items?.length > 0) {
      setChecklistItems(entityData.list_items);
    } else {
      // Explicitly clear - this is the key fix
      setChecklistItems(null);
    }
  }, [visible]); // Only run when visibility changes

  const [isFavorite, setIsFavorite] = useState(false);
  const [moodPickerExpanded, setMoodPickerExpanded] = useState(false);
  const [sourceNote, setSourceNote] = useState<{ id: string; title: string } | null>(null);
  const [isCreatingTodos, setIsCreatingTodos] = useState(false);

  // Entity Chat state
  const [showEntityChat, setShowEntityChat] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);

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
      dispatch({ type: 'SET_LINKED_EVENT_ID', eventId });

      // Auto-populate todo deadline from event date if todo doesn't have one
      if (eventId && baseType === 'todo' && !state.todo.target_date) {
        const event = getItemById(eventId);
        const eventDate = (event as any)?.target_date;
        if (eventDate) {
          dispatch({ type: 'SET_TODO_TARGET_DATE', date: eventDate });
        }
      }
    },
    [dispatch, baseType, state.todo.target_date, getItemById],
  );

  // Clarification popup state (Phase 2)
  const [showClarificationPopup, setShowClarificationPopup] = useState(false);
  const [clarificationLoading, setClarificationLoading] = useState(false);
  const [clarificationSuccess, setClarificationSuccess] = useState<string | null>(null);

  // View mode: store fetched entity for display
  const [viewModeEntity, setViewModeEntity] = useState<any>(null);

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

  // Swipe-down-to-close: track drag offset and store onClose ref
  const sheetDragY = useRef(new RNAnimated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // Keep ref updated with latest onClose

  // Threshold for swipe-to-close (in pixels)
  const SWIPE_CLOSE_THRESHOLD = 100;
  const SWIPE_VELOCITY_THRESHOLD = 0.5;

  // PanResponder for swipe-down-to-close gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const { dx, dy, vy } = gestureState;
        // Start handling when the user clearly drags mostly downward
        const isVerticalSwipe = Math.abs(dy) > Math.abs(dx);
        const isDownward = dy > 10 && vy >= 0;
        // Don't capture if saving
        if (isSavingRef.current) return false;
        return isVerticalSwipe && isDownward;
      },
      onPanResponderGrant: () => {
        // Reset drag offset when gesture starts
        sheetDragY.setValue(0);
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        // Update drag offset for visual feedback (only allow downward drag)
        const clampedDy = Math.max(0, gestureState.dy);
        sheetDragY.setValue(clampedDy);
        // Dismiss keyboard when dragging
        if (gestureState.dy > 10) {
          Keyboard.dismiss();
        }
      },
      onPanResponderRelease: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        Keyboard.dismiss();
        const { dy, vy } = gestureState;
        // Close if threshold exceeded OR velocity is high enough
        if (dy > SWIPE_CLOSE_THRESHOLD || vy > SWIPE_VELOCITY_THRESHOLD) {
          // Animate sheet off screen then close
          RNAnimated.timing(sheetDragY, {
            toValue: 500,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onCloseRef.current?.();
            sheetDragY.setValue(0);
          });
        } else {
          // Snap back to original position
          RNAnimated.spring(sheetDragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // If gesture is interrupted, snap back
        RNAnimated.spring(sheetDragY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
      },
    }),
  ).current;

  // Ref to track isSaving for PanResponder (since PanResponder is created once)
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;

  // Photo support for logs (Phase L3 - single photo)
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  // Multi-photo support for logs (Phase L5)
  const [logPhotos, setLogPhotos] = useState<LogPhoto[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Photo Drop: hydrate logPhotos from initialLogPhotoUris for create-mode logs (once)
  const initialLogPhotosHydratedRef = useRef(false);

  // Keyboard height tracking: listen for keyboard show/hide events
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

  // Mood selector for journal logs (Phase L4) - now multi-select
  const [moods, setMoods] = useState<Mood[]>([]);

  // focus states for accessibility focus rings
  const [bodyFocused, setBodyFocused] = useState(false);
  // Expanded editor mode state
  const [isExpandedEditor, setIsExpandedEditor] = useState(false);
  // Preview mode: When opening a log from chat, show formatted read-only view first
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [commitmentFocused, setCommitmentFocused] = useState(false);
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
  const [spaces, setSpaces] = useState<any[]>([]);
  const [isResuggestingTags, setIsResuggestingTags] = useState(false);
  const [isResummarizingTitle, setIsResummarizingTitle] = useState(false);
  const [pendingTitleResummarize, setPendingTitleResummarize] = useState(false);
  // Track whether user has modified tags (to avoid overwriting Mind Drop AI tags on edit)
  const [tagsDirty, setTagsDirty] = useState(false);
  // local UI state for undo toast
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const saveToastTimerRef = useRef<number | null>(null);
  const dueToastTimerRef = useRef<number | null>(null);
  const createPrefillAppliedRef = useRef(false);
  const editAutoPrefillRanRef = useRef(false);
  const hasLocalScheduleChanges = useRef(false);
  // Snapshot of the user's local schedule edits so re-hydration can preserve them
  const localScheduleSnapshot = useRef<Partial<
    Pick<
      HabitState,
      | 'schedule'
      | 'frequency_json'
      | 'start_date'
      | 'end_date'
      | 'time_window'
      | 'time_estimate_minutes'
    >
  > | null>(null);
  const aiTitlePersistedRef = useRef(false);
  const textInputRef = useRef<TextInput | null>(null);
  const prevConversionMetaRef = useRef(conversionMeta);

  // CRITICAL: Reset prefill flags when overlay closes or conversionMeta changes
  // This prevents stale data from previous saves appearing in new saves
  useEffect(() => {
    if (!visible) {
      // Reset when overlay closes
      createPrefillAppliedRef.current = false;
      editAutoPrefillRanRef.current = false;
      hasLocalScheduleChanges.current = false;
      localScheduleSnapshot.current = null;
    } else if (conversionMeta !== prevConversionMetaRef.current) {
      // Reset when conversionMeta changes while visible (new save action)
      createPrefillAppliedRef.current = false;
      editAutoPrefillRanRef.current = false;
      hasLocalScheduleChanges.current = false;
      localScheduleSnapshot.current = null;
    }
    prevConversionMetaRef.current = conversionMeta;
  }, [visible, conversionMeta]);

  // feature flag for commitments (soft rollout)
  const commitmentsOn = process?.env?.EXPO_PUBLIC_FEATURE_COMMITMENTS === 'on';
  const currentTagsRef = useRef<TagKey[]>(state.tags);
  useEffect(() => {
    currentTagsRef.current = state.tags;
  }, [state.tags]);
  const hasLoadedEditTagsRef = useRef(false);

  // Reset all state when entity changes - MUST run before HYDRATE_EDIT effects
  useEffect(() => {
    const prev = prevEntityIdRef.current;
    const shouldReset = visible && currentEntityId !== prev;

    if (shouldReset && prev !== null) {
      // Entity changed while visible or overlay opened with new entity
      console.log('[UnifiedOverlayV2] Entity changed, full reset', { prev, new: currentEntityId });

      // Reset reducer state
      dispatch({ type: 'RESET' });

      // Reset all useState values that hold entity-specific data
      setReminders([]);
      setChecklistItems(null);
      setIsFavorite(false);
      setSourceNote(null);
      setShowTodoPreview(false);
      setExtractedItems([]);
      setViewModeEntity(null);
      setIsExpandedEditor(false);
      setIsPreviewMode(false);
      setTagsDirty(false);
      setSaveError(null);
      setShowSaveToast(false);
      setPhotoUri(null);
      setLogPhotos([]);
      setSelectedPhotoIndex(null);
      setMoods([]);
      setMoodPickerExpanded(false);

      // Reset refs
      createPrefillAppliedRef.current = false;
      editAutoPrefillRanRef.current = false;
      hasLoadedEditTagsRef.current = false;
      aiTitlePersistedRef.current = false;
      hasLocalScheduleChanges.current = false;
      localScheduleSnapshot.current = null;

      // Reset displayMode based on incoming mode prop and baseType
      const newStartedInView = mode === 'view' && baseType === 'habit';
      setDisplayMode(newStartedInView ? 'view' : 'edit');
    }

    // Always update the ref to track current entity
    prevEntityIdRef.current = currentEntityId;
  }, [visible, currentEntityId, mode, baseType]);

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

  // Open unified schedule modal with current habit state
  const openScheduleModal = useCallback(() => {
    const currentFreq = jsonToFrequency(state.habit.frequency_json);
    setScheduleModalState({
      frequencyTab: currentFreq.mode,
      frequencyJson: state.habit.frequency_json,
      selectedDays: currentFreq.mode === 'days' ? currentFreq.days : [],
      customCount: currentFreq.mode === 'custom' ? String(currentFreq.value.count) : '1',
      customUnit: currentFreq.mode === 'custom' ? currentFreq.value.unit : 'week',
      startDate: state.habit.start_date ?? null,
      endDate: state.habit.end_date ?? null,
      timeWindow: state.habit.time_window ?? null,
      timeEstimateMinutes: state.habit.time_estimate_minutes ?? null,
    });
    setShowScheduleStartDatePicker(false);
    setShowScheduleEndDatePicker(false);
    setShowScheduleModal(true);
  }, [state.habit]);

  // Apply all schedule changes at once from modal state
  const applyScheduleChanges = useCallback(() => {
    // Build frequency_json from modal state
    let newFrequencyJson;
    if (scheduleModalState.frequencyTab === 'simple') {
      newFrequencyJson = scheduleModalState.frequencyJson || { type: 'simple', value: 'daily' };
    } else if (scheduleModalState.frequencyTab === 'days') {
      newFrequencyJson = { type: 'days', days: scheduleModalState.selectedDays };
    } else {
      newFrequencyJson = {
        type: 'custom',
        value: {
          count: parseInt(scheduleModalState.customCount, 10) || 1,
          unit: scheduleModalState.customUnit,
        },
      };
    }

    // Dispatch all updates
    console.log('[Schedule] Applying:', JSON.stringify(newFrequencyJson));
    hasLocalScheduleChanges.current = true;
    localScheduleSnapshot.current = {
      frequency_json: newFrequencyJson,
      start_date: scheduleModalState.startDate,
      end_date: scheduleModalState.endDate,
      time_window: (scheduleModalState.timeWindow ?? null) as HabitState['time_window'],
      time_estimate_minutes: scheduleModalState.timeEstimateMinutes,
    };
    dispatch({ type: 'SET_HABIT_FREQUENCY', frequency_json: newFrequencyJson });
    dispatch({ type: 'SET_HABIT_START_DATE', date: scheduleModalState.startDate });
    dispatch({ type: 'SET_HABIT_END_DATE', date: scheduleModalState.endDate });
    dispatch({
      type: 'SET_HABIT_TIME_WINDOW',
      window: scheduleModalState.timeWindow as 'day' | 'any' | 'morning' | 'evening' | null,
    });
    dispatch({
      type: 'SET_HABIT_TIME_ESTIMATE',
      minutes: scheduleModalState.timeEstimateMinutes,
    });

    setShowScheduleModal(false);
  }, [scheduleModalState, dispatch]);

  // Sync spaces from store when details panel expands (replaces repo.listSpaces)
  useEffect(() => {
    if (!state.expanded) return;
    setSpaces(storeSpaces || []);
  }, [storeSpaces, state.expanded]);

  // Hydrate reminders from existing reminderAt field when overlay opens
  useEffect(() => {
    if (!visible) return;
    const hydrated = hydrateRemindersFromLegacy(state.reminderAt);
    setReminders(hydrated);
  }, [visible, state.reminderAt]);

  // Emit an 'opened' funnel event when the overlay becomes visible so analytics
  // can track funnel starts (best-effort, ignore telemetry errors).
  useEffect(() => {
    if (!visible) return;
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
  }, [visible, mode, state.baseType]);

  useEffect(() => {
    overlayEntryTypeRef.current = baseType;
  }, [baseType]);

  useEffect(() => {
    if (!visible) {
      openTelemetrySentRef.current = false;
      if (showSaveToast) setShowSaveToast(false);
      // Reset expanded editor when overlay closes
      if (isExpandedEditor) setIsExpandedEditor(false);
      // Reset preview mode when overlay closes
      setIsPreviewMode(false);
      // Reset Make Actionable state when overlay closes
      setChecklistItems(null);
      setIsFavorite(false);
      setSourceNote(null);
      setShowTodoPreview(false);
      setExtractedItems([]);
    }
  }, [visible, showSaveToast, isExpandedEditor]);

  // Auto-expand for journal logs when overlay opens
  useEffect(() => {
    if (visible && isLog && effectiveLogSubtype === 'journal' && !isExpandedEditor) {
      // Small delay to allow overlay animation to complete
      const timer = setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpandedEditor(true);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [visible, isLog, effectiveLogSubtype]);

  useEffect(() => {
    if (baseType !== 'todo' && dueToastMessage) {
      setDueToastMessage(null);
    }
  }, [baseType, dueToastMessage]);

  // Reset expanded editor when baseType changes to prevent stale views
  useEffect(() => {
    setIsExpandedEditor(false);
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

  // Initialize Make Actionable state from entity
  useEffect(() => {
    // Prefer the entity passed directly via openEdit (initialEntity) for has_list check
    // because the store (fullEntity) may have stale data
    const passedEntity = initialEntity as any;
    const entity = fullEntity || passedEntity;

    if (entity) {
      // Initialize favorite state
      setIsFavorite(entity.is_favorite ?? false);

      // Initialize checklist state if note has list - only on first load
      // CRITICAL: Check has_list from the passed entity first (freshest source)
      // The store may have stale list_items even after has_list was set to false
      const hasListFlag = passedEntity?.has_list ?? entity?.has_list;
      const listItems = passedEntity?.list_items ?? entity?.list_items;

      if (hasListFlag === true && listItems && Array.isArray(listItems) && listItems.length > 0) {
        setChecklistItems(listItems);
      } else if (hasListFlag === false) {
        // Explicitly clear if has_list is false (user reverted the checklist)
        setChecklistItems(null);
      }
    }
  }, [fullEntity, initialEntity]);

  // Fetch is_favorite fresh from store in view mode (list doesn't pass it)
  useEffect(() => {
    if (mode !== 'view' || baseType !== 'log') return;

    const entity = fullEntity || (initialEntity as any);
    const entityId = entity?.id;
    if (!entityId) return;

    const freshNote = getItemById(entityId);
    if (freshNote) {
      const favValue = (freshNote as any).is_favorite ?? false;
      setIsFavorite(favValue);
    }
  }, [mode, baseType, fullEntity, initialEntity, getItemById]);

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
   * Convert note to inline checklist
   */
  const handleConvertToChecklist = useCallback(async () => {
    // Get entity from fullEntity OR initialEntity (same pattern as body)
    const entity = fullEntity || (initialEntity as any);
    const entityId = entity?.id;

    if (!entityId) return;

    const items = extractListItems(noteBody);
    const listItems = toListItems(items);

    try {
      // Update via store mutation (notes have list_items)
      await updateNote(entityId, {
        list_items: listItems,
        has_list: true,
      } as any);

      // Update local state
      setChecklistItems(listItems);

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Emit event for other components
      eventBus.emit('ItemUpdated', { id: entityId });
    } catch (error) {
      console.error('[MakeActionable] Failed to convert to checklist:', error);
      Alert.alert('Error', 'Failed to convert to checklist');
    }
  }, [fullEntity, initialEntity, noteBody, updateNote]);

  /**
   * Show todo preview modal
   */
  const handleShowTodoPreview = useCallback(() => {
    const items = extractListItems(noteBody);
    setExtractedItems(items);
    setShowTodoPreview(true);
  }, [noteBody]);

  /**
   * Show action sheet with Make Actionable options
   */
  const handleMakeActionable = useCallback(() => {
    const options = ['Turn into checklist', 'Create todos', 'Cancel'];
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          title: 'Make Actionable',
          message: 'Choose how to use this list',
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleConvertToChecklist();
          } else if (buttonIndex === 1) {
            handleShowTodoPreview();
          }
        },
      );
    } else {
      // Android fallback using Alert
      Alert.alert('Make Actionable', 'Choose how to use this list', [
        { text: 'Turn into checklist', onPress: handleConvertToChecklist },
        { text: 'Create todos', onPress: handleShowTodoPreview },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [handleConvertToChecklist, handleShowTodoPreview]);

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
   * Revert checklist back to plain text
   */
  const handleRevertToText = useCallback(() => {
    const entity = fullEntity || (initialEntity as any);
    const entityId = entity?.id;

    if (!entityId) return;

    Alert.alert(
      'Revert to text?',
      'This will convert the checklist back to regular text. Your check marks will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revert',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateNote(entityId, {
                has_list: false,
                list_items: null,
              } as any);

              // Update local state
              setChecklistItems(null);

              // Haptic feedback
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

              // Emit event
              eventBus.emit('ItemUpdated', { id: entityId });
            } catch (error) {
              console.error('[Checklist] Failed to revert:', error);
              Alert.alert('Error', 'Failed to revert checklist');
            }
          },
        },
      ],
    );
  }, [fullEntity, initialEntity, updateNote]);

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
        setShowTodoPreview(false);

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

  const handleToggleDetails = useCallback(() => {
    if (!reduceMotion) {
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch (e) {
        // no-op if the platform doesn't support LayoutAnimation
      }
    }
    dispatch({ type: 'TOGGLE_EXPANDED' });
  }, [dispatch, reduceMotion]);

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
      dispatch({ type: 'SET_BASE_TYPE', to: next });
      try {
        eventBus.emit('OverlayTypeChanged', { from: prev, to: next });
      } catch (e) {
        // ignore telemetry errors
      }
    },
    [dispatch, state.baseType, state.habit, state.log, state.todo],
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

  // animation values for details panel, commitment and save pulse
  const detailsAnim = useSharedValue(state.expanded ? 1 : 0);
  const commitmentAnim = useSharedValue(state.commitment ? 1 : 0);
  const savePulse = useSharedValue(0);
  const headerPulse = useSharedValue(0);

  // View ↔ Edit mode crossfade animation values
  const viewModeOpacity = useSharedValue(isViewMode ? 1 : 0);
  const editModeOpacity = useSharedValue(!isViewMode ? 1 : 0);

  const sheetTranslateY = useRef(new RNAnimated.Value(16)).current;
  const sheetOpacity = useRef(new RNAnimated.Value(0)).current;
  const overlayEntryTypeRef = useRef<BaseType>(baseType);
  const openTelemetrySentRef = useRef(false);

  const detailsStyle = useAnimatedStyle(() => ({
    opacity: detailsAnim.value,
    transform: [{ translateY: interpolate(detailsAnim.value, [0, 1], [8, 0]) }],
  }));

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
    // Reset drag offset when opening
    sheetDragY.setValue(0);
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
  }, [visible, reduceMotion, sheetTranslateY, sheetOpacity, sheetDragY]);
  // animate details panel expand/collapse
  useEffect(() => {
    try {
      if (detailsAnim && typeof (detailsAnim as any).value !== 'undefined') {
        (detailsAnim as any).value = conditionalAnimation(
          withTiming(state.expanded ? 1 : 0, timingConfig.normal),
          state.expanded ? 1 : 0,
          reduceMotion,
        );
      }
    } catch (e) {
      // In some test environments reanimated is mocked incompletely; ignore
    }
  }, [state.expanded, detailsAnim, reduceMotion]);

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

  const getPrefillText = useCallback(() => {
    // Prefer the main text field if present
    const bodyText =
      baseType === 'log'
        ? state.log.body
        : baseType === 'todo'
          ? state.todo.details
          : state.habit.notes;

    if (bodyText && bodyText.trim().length > 0) {
      return bodyText;
    }

    // Fallback to the title if body/details/notes is empty
    const titleText =
      baseType === 'log'
        ? state.log.title
        : baseType === 'todo'
          ? state.todo.title
          : state.habit.title;

    return titleText || '';
  }, [
    baseType,
    state.log.body,
    state.log.title,
    state.todo.details,
    state.todo.title,
    state.habit.notes,
    state.habit.title,
  ]);

  function pushUndoEntry(kind: 'type' | 'tag' | 'commitment', prev: Partial<any>) {
    try {
      dispatch({ type: 'PUSH_UNDO', entry: { kind, prev } } as any);
    } catch (e) {
      // ignore dispatch typing in JS/TS mixed environments
    }
    setShowUndoToast(true);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current as any);
    }
    // auto hide after 3s
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    undoTimerRef.current = setTimeout(() => setShowUndoToast(false), 3000) as unknown as number;
  }

  function handleUndo() {
    try {
      dispatch({ type: 'UNDO_LAST' } as any);
    } catch (e) {
      // ignore
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

  useEffect(() => {
    if (mode !== 'create') return;
    if (createPrefillAppliedRef.current) return;

    const override = deriveBaseTypeFromInitial((initialEntity as any)?.type);
    const rawText = typeof initialText === 'string' ? initialText : '';
    const hasText = rawText.trim().length > 0;
    const hasLinkedEventId = !!(initialEntity as any)?.linked_event_id;

    // Check for conversionMeta prefill (Idea → Todo/Habit conversion, Space Chat)
    const hasConversionMeta =
      conversionMeta &&
      (conversionMeta.initialTitle ||
        conversionMeta.initialNote ||
        conversionMeta.initialTags?.length ||
        conversionMeta.initialListItems?.length ||
        conversionMeta.initialFrequency ||
        conversionMeta.initialDueDate); // ADD: Space Chat todo due date

    if (!override && !hasText && !defaultDueToday && !hasConversionMeta && !hasLinkedEventId) {
      createPrefillAppliedRef.current = true;
      return;
    }

    const payload: Partial<V2State> = {};
    if (override) payload.baseType = override;

    if (hasText) {
      const title = firstLine(rawText);
      payload.log = { ...initialV2State.log, body: rawText, title };
      payload.todo = { ...initialV2State.todo, details: rawText, title };
      payload.habit = { ...initialV2State.habit, notes: rawText, title };
    }

    // Apply conversionMeta prefill (Idea → Todo/Habit conversion)
    if (hasConversionMeta) {
      const { initialTitle, initialNote, initialTags, initialListItems, initialIsList } =
        conversionMeta as any;

      console.log('[UnifiedOverlayV2] conversionMeta dueDate:', conversionMeta?.initialDueDate);

      // Apply title and note
      if (initialTitle || initialNote) {
        const title = initialTitle || '';
        const note = initialNote || '';
        payload.todo = {
          ...(payload.todo || initialV2State.todo),
          title,
          details: note,
        };
        payload.habit = {
          ...(payload.habit || initialV2State.habit),
          title,
          notes: note,
        };
        // Also apply note to log body for notes
        payload.log = {
          ...(payload.log || initialV2State.log),
          title: title,
          body: note,
        };
      }

      // SPACE CHAT FIX: For todos/habits, if initialNote is falsy, explicitly clear details/notes
      // This prevents rawText from the hasText block from leaking into the details field
      // Space Chat passes the title separately - todos/habits don't need body text
      if (initialTitle && !initialNote) {
        payload.todo = {
          ...(payload.todo || initialV2State.todo),
          details: '',
        };
        payload.habit = {
          ...(payload.habit || initialV2State.habit),
          notes: '',
        };
      }

      // Apply todo due date from Space Chat detection
      if (conversionMeta.initialDueDate) {
        payload.todo = {
          ...(payload.todo || initialV2State.todo),
          due_day: conversionMeta.initialDueDate,
        };
      }

      // Apply habit frequency from Space Chat detection
      if (conversionMeta.initialFrequency) {
        const frequencyJson = buildFrequencyJsonFromDb(
          conversionMeta.initialFrequency,
          conversionMeta.initialFrequencyValue ?? 1,
        );
        // Map incoming frequency to valid schedule values (daily | weekly | custom)
        const freq = conversionMeta.initialFrequency.toLowerCase();
        const schedule: 'daily' | 'weekly' | 'custom' =
          freq === 'daily' ? 'daily' : freq === 'weekly' ? 'weekly' : 'custom';
        payload.habit = {
          ...(payload.habit || initialV2State.habit),
          schedule, // Maps to DB 'frequency' column
          frequency_json: frequencyJson, // Maps to DB 'frequency_json' column
        };
      }

      // Apply tags (filter out system tags)
      if (initialTags && Array.isArray(initialTags) && initialTags.length > 0) {
        const systemTags = ['idea', 'journal', 'general', 'list'];
        const filteredTags = initialTags.filter(
          (tag: string) => !systemTags.includes(tag.toLowerCase()),
        );
        if (filteredTags.length > 0) {
          payload.tags = filteredTags;
        }
      }

      // Apply list items
      if (
        initialIsList &&
        initialListItems &&
        Array.isArray(initialListItems) &&
        initialListItems.length > 0
      ) {
        payload.list = { items: initialListItems };
      }
    }

    // Default todo to due today when defaultDueToday is true (Now page)
    if (defaultDueToday && (override === 'todo' || !override)) {
      const todayISO = getTodayISO();
      payload.todo = {
        ...(payload.todo || initialV2State.todo),
        due_at: todayISO,
      };
    }

    // Apply linked_event_id from initialEntity (for "+ Add to-do" / "+ Add note" from events)
    const linkedEventIdFromInitial = (initialEntity as any)?.linked_event_id;
    if (linkedEventIdFromInitial) {
      payload.linkedEventId = linkedEventIdFromInitial;
    }

    // Apply target_date from initialEntity for todos (event date becomes todo deadline)
    const targetDateFromInitial = (initialEntity as any)?.target_date;
    if (targetDateFromInitial && override === 'todo') {
      payload.todo = {
        ...(payload.todo || initialV2State.todo),
        target_date: targetDateFromInitial,
      };
    }

    if (Object.keys(payload).length > 0) {
      dispatch({ type: 'HYDRATE_EDIT', payload });
    }

    createPrefillAppliedRef.current = true;
  }, [mode, initialEntity, initialText, defaultDueToday, conversionMeta, dispatch]);

  // Initial defaults (match brief: text-first; first line becomes title)
  // CRITICAL: Always get full entity from store to ensure commitment fields round-trip
  // Today/Now selectors may pass truncated entity shapes that lose commitment fields
  useEffect(() => {
    if (mode !== 'edit' || !initialEntity) return;

    const entityId = (initialEntity as any)?.id;
    let entityToUse = initialEntity;

    // Get fresh entity from store to get ALL fields including commitment
    if (entityId) {
      console.log('[UnifiedOverlayV2] Getting full entity from store:', entityId);
      const freshEntity = getItemById(entityId);
      if (freshEntity) {
        console.log('[UnifiedOverlayV2] Fresh entity from store:', {
          id: freshEntity.id,
          type: freshEntity.type,
          commitment: (freshEntity as any).commitment,
          commitmentNote: (freshEntity as any).commitmentNote,
        });
        entityToUse = freshEntity;
      } else {
        console.warn(
          '[UnifiedOverlayV2] Could not find entity in store, using initialEntity fallback',
        );
      }
    }

    const payload = buildDraftPayloadFromEntity(entityToUse);

    // Guard: if user has local schedule changes (from Schedule modal),
    // don't let re-hydration overwrite them
    if (hasLocalScheduleChanges.current && payload.habit && localScheduleSnapshot.current) {
      console.log('[UnifiedOverlayV2] Preserving local schedule changes during re-hydration');
      const {
        schedule,
        frequency_json,
        start_date,
        end_date,
        time_window,
        time_estimate_minutes,
        ...restHabit
      } = payload.habit;
      payload.habit = {
        ...restHabit, // non-schedule fields from store
        ...localScheduleSnapshot.current, // user's local schedule edits (from ref, never stale)
      };
    }

    console.log('[UnifiedOverlayV2] Hydrating with payload:', {
      commitment: payload.commitment,
      commitmentNote: payload.commitmentNote,
    });
    dispatch({ type: 'HYDRATE_EDIT', payload } as any);

    // Hydrate mood for journal logs (Phase L4) - now multi-select
    const entity = entityToUse as any;
    if (entity?.mood) {
      // Handle both array (new format) and single string (legacy)
      if (Array.isArray(entity.mood)) {
        const validMoods = entity.mood.filter(isValidMood);
        setMoods(validMoods);
      } else if (typeof entity.mood === 'string') {
        // Migrate legacy single mood to array
        const migrated = migrateLegacyMood(entity.mood);
        setMoods(migrated ? [migrated] : []);
      }
    }

    // Hydrate photo for logs (Phase L3)
    if (entity?.photo_uri) {
      setPhotoUri(entity.photo_uri);
    }
  }, [mode, initialEntity, getItemById]);

  // View mode: Get full entity from store for display
  // initialEntity from chat only has {id, type, logSubtype} - we need the full entity with body/title
  useEffect(() => {
    if (mode !== 'view' || !initialEntity) return;

    const entityId = (initialEntity as any)?.id;
    if (!entityId) return;

    console.log('[UnifiedOverlayV2] View mode: Getting full entity from store:', entityId);
    const freshEntity = getItemById(entityId);
    if (freshEntity) {
      console.log('[UnifiedOverlayV2] View mode: Entity from store:', {
        id: freshEntity.id,
        type: freshEntity.type,
        title: (freshEntity as any).title || (freshEntity as any).name,
        hasBody: !!(freshEntity as any).body,
      });
      setViewModeEntity(freshEntity);
    } else {
      console.warn('[UnifiedOverlayV2] View mode: Could not find entity in store');
    }
  }, [mode, initialEntity, getItemById]);

  // Load existing log photos from database (Phase L5)
  useEffect(() => {
    const loadLogPhotos = async () => {
      // Check entity type directly to avoid race condition with HYDRATE_EDIT
      // The entity's type field is 'note' for logs in the database
      const entityType = (initialEntity as any)?.type;
      const isNoteEntity = entityType === 'note' || entityType === 'log';

      console.log('[UnifiedOverlayV2] loadLogPhotos effect:', {
        mode,
        hasInitialEntity: !!initialEntity,
        entityType,
        isNoteEntity,
        noteId: (initialEntity as any)?.id,
      });

      // Only load photos for note/log entities in edit mode
      if (mode !== 'edit' || !initialEntity || !isNoteEntity) return;

      const noteId = (initialEntity as any)?.id;
      if (!noteId) return;

      try {
        console.log('[UnifiedOverlayV2] Loading photos for note:', noteId);
        const data = await listLogPhotos(noteId);

        console.log('[UnifiedOverlayV2] Loaded photos from store:', data);
        if (data && data.length > 0) {
          const photos: LogPhoto[] = data.map((row) => ({
            id: row.id,
            url: row.url,
            position: row.position,
            isNew: false,
            isDeleted: false,
          }));
          console.log('[UnifiedOverlayV2] Setting logPhotos state:', photos);
          setLogPhotos(photos);
        }
      } catch (err) {
        console.error('[UnifiedOverlayV2] Error loading log photos:', err);
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

        console.log('[MindDrop.FallbackRetry] Retry completed', { entityId: entity.id });
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
    if (baseType !== 'log') {
      setLogPhotos([]);
      setSelectedPhotoIndex(null);
    }
  }, [baseType]);

  useEffect(() => {
    return () => {
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
    if (mode !== 'edit') return;
    if (hasLoadedEditTagsRef.current) return;

    const inlineTags = extractTagKeysFromEntity(initialEntity);
    if (inlineTags.length > 0) {
      const merged = mergeTagKeys(currentTagsRef.current, inlineTags);
      if (merged.length !== currentTagsRef.current.length) {
        dispatch({ type: 'SET_TAGS', tags: merged });
      }
      hasLoadedEditTagsRef.current = true;
      return;
    }

    const entityId = (initialEntity as any)?.id;
    if (!entityId) {
      hasLoadedEditTagsRef.current = true;
      return;
    }

    // Get entity from store (synchronous)
    const entity = getItemById(entityId);
    if (entity) {
      const fetched = extractTagKeysFromEntity(entity);
      if (fetched.length > 0) {
        const merged = mergeTagKeys(currentTagsRef.current, fetched);
        if (merged.length !== currentTagsRef.current.length) {
          dispatch({ type: 'SET_TAGS', tags: merged });
        }
      }
      const metaPayload = buildDraftPayloadFromEntity(entity);
      if (
        Array.isArray((metaPayload as any).stickyTags) ||
        Array.isArray((metaPayload as any).tagTombstones)
      ) {
        dispatch({
          type: 'HYDRATE_EDIT',
          payload: {
            stickyTags: (metaPayload as any).stickyTags ?? [],
            tagTombstones: (metaPayload as any).tagTombstones ?? [],
          },
        } as any);
      }
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

  // Reset the override flag when the entity changes
  useEffect(() => {
    const entityId = (initialEntity as any)?.id;
    return () => {
      aiTagOverrideAppliedRef.current = false;
    };
  }, [(initialEntity as any)?.id]);

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
        dispatch({ type: 'SET_TAGS', tags: nextTags });
        dispatch({
          type: 'HYDRATE_EDIT',
          payload: { stickyTags: nextSticky, tagTombstones: nextTombstones },
        } as any);
        setTagsDirty(true); // Mark tags as user-modified
        return;
      }

      const nextTags = [...state.tags, normalized];
      const nextSticky = stickySnapshot;
      const nextTombstones = removeMetaTag(tombstoneSnapshot, metaSource);
      dispatch({ type: 'SET_TAGS', tags: nextTags });
      dispatch({
        type: 'HYDRATE_EDIT',
        payload: { stickyTags: nextSticky, tagTombstones: nextTombstones },
      } as any);
      setTagsDirty(true); // Mark tags as user-modified
    },
    [dispatch, state.list, state.mood, state.tags, state.stickyTags, state.tagTombstones],
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

      dispatch({ type: 'SET_TAGS', tags: nextTags });
      dispatch({
        type: 'HYDRATE_EDIT',
        payload: { stickyTags: nextSticky, tagTombstones: nextTombstones },
      } as any);

      setTagsDirty(true); // Mark tags as user-modified
    },
    [dispatch, state.list, state.mood, state.tags, state.stickyTags, state.tagTombstones],
  );

  const handleTelemetryTagAdd = useCallback((canonical: string) => {
    if (!canonical) return;
    void emitOverlayEvent({ type: 'overlay_tag_user_add', label: canonical });
  }, []);

  const handleTelemetryTagRemove = useCallback((canonical: string, wasAi: boolean) => {
    if (!canonical) return;
    void emitOverlayEvent({ type: 'overlay_tag_user_remove', label: canonical, wasAi });
  }, []);

  // Handler for edit icon - focuses the main text input
  const handleEditTitle = useCallback(() => {
    textInputRef.current?.focus();
  }, []);

  // Photo handlers for logs (Phase L3)
  const handleTakePhoto = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, []);

  const handleChoosePhoto = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'Photo library permission is required to choose photos.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error choosing photo:', error);
      Alert.alert('Error', 'Failed to choose photo. Please try again.');
    }
  }, []);

  const handleOpenPhotoActionSheet = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleTakePhoto();
          } else if (buttonIndex === 2) {
            handleChoosePhoto();
          }
        },
      );
    } else {
      // Android fallback
      Alert.alert(
        'Add Photo',
        'Choose an option',
        [
          { text: 'Take Photo', onPress: handleTakePhoto },
          { text: 'Choose from Library', onPress: handleChoosePhoto },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true },
      );
    }
  }, [handleTakePhoto, handleChoosePhoto]);

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

  const handleDeleteLogPhoto = useCallback((index: number) => {
    setLogPhotos((prev) =>
      prev.map((photo, i) => (i === index ? { ...photo, isDeleted: true } : photo)),
    );
  }, []);

  const handleViewLogPhoto = useCallback((index: number) => {
    setSelectedPhotoIndex(index);
  }, []);

  // Resummarize handlers for background AI prefill
  const handleResummarizeTitle = useCallback(async () => {
    if (!fullEntity || !currentText || isResummarizingTitle) return;

    setIsResummarizingTitle(true);
    try {
      const { title, updated } = await resummarizeTitle(fullEntity, currentText);

      if (updated && title) {
        // Update local state with new title
        dispatch({ type: 'SET_TEXT', text: title });
        console.log('[OverlayV2] Title resummarized', { entityId: fullEntity.id, title });
      }
    } catch (error) {
      console.error('[OverlayV2] Resummarize title failed', error);
    } finally {
      setIsResummarizingTitle(false);
    }
  }, [fullEntity, currentText, isResummarizingTitle]);

  const handleResuggestTags = useCallback(async () => {
    if (!currentText || isResuggestingTags) return;

    setIsResuggestingTags(true);
    try {
      // Determine subtype for tag extraction
      let extractionSubtype: string | undefined;
      if (baseType === 'log') {
        extractionSubtype = effectiveLogSubtype === 'general' ? undefined : effectiveLogSubtype;
      }

      // Extract tags deterministically
      const extractedTags = extractMeaningfulTags(currentText, extractionSubtype);

      if (extractedTags.length > 0) {
        // Convert to TagKeys
        const tagKeys = extractedTags
          .map((tag) => normalizeToTagKey(tag))
          .filter(Boolean) as TagKey[];
        dispatch({ type: 'SET_TAGS', tags: tagKeys });
        console.log('[OverlayV2] Tags re-extracted deterministically', {
          tagsCount: tagKeys.length,
        });
      }
    } catch (error) {
      console.error('[OverlayV2] Re-extract tags failed', error);
    } finally {
      setIsResuggestingTags(false);
    }
  }, [currentText, baseType, effectiveLogSubtype, isResuggestingTags]);

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

  // Handle log subtype chip press - open selector for manual override
  const handleLogSubtypeChipPress = useCallback(() => {
    if (!isLog) return;

    const options = ['Journal', 'Idea', 'General', 'Clear subtype', 'Cancel'];
    const destructiveButtonIndex = 3; // Clear subtype
    const cancelButtonIndex = 4;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
          title: 'Select log subtype',
        },
        (buttonIndex) => {
          if (buttonIndex === cancelButtonIndex) return;

          const subtypeMap: Record<number, 'journal' | 'idea' | 'general' | null> = {
            0: 'journal',
            1: 'idea',
            2: 'general',
            3: null, // Clear subtype
          };

          const value = subtypeMap[buttonIndex];
          dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value });
        },
      );
    } else {
      // Android: use Alert with buttons
      Alert.alert('Select log subtype', 'Choose a subtype or clear to use automatic detection', [
        {
          text: 'Journal',
          onPress: () => dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value: 'journal' }),
        },
        {
          text: 'Idea',
          onPress: () => dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value: 'idea' }),
        },
        {
          text: 'General',
          onPress: () => dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value: 'general' }),
        },
        {
          text: 'Clear subtype',
          onPress: () => dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value: null }),
          style: 'destructive',
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    }
  }, [isLog]);

  const handleTodoDueChange = useCallback(
    (dateOrNull: Date | null, options?: { label?: string }) => {
      // GREMLY TODO DATE MODEL:
      // Use due_day (YYYY-MM-DD) as the canonical source of truth.
      // Do NOT use due_at for Mind Drop / Today logic.
      // This avoids UTC timezone drift issues.

      if (dateOrNull) {
        // Compute due_day using local timezone helper
        const dueDay = getDateService().toDateString(dateOrNull);

        console.log('[handleTodoDueChange] Setting due_day:', dueDay);

        // Dispatch with due_day as source of truth, due_at = null (not used)
        dispatch({
          type: 'SET_TODO_DUE',
          due_at: null, // Explicitly null - we don't use due_at for all-day todos
          due_day: dueDay,
          due_time: null, // All-day todos have no specific time
        });

        const formatted = options?.label ?? format(dateOrNull, 'MMM d');
        showDueToast(`Due set for ${formatted}`);
        void emitOverlayEvent({ type: 'overlay_due_set' });
      } else {
        // Clear all due date fields - user pressed Clear
        console.log('[handleTodoDueChange] Clearing due date (due_day: null)');

        dispatch({
          type: 'SET_TODO_DUE',
          due_at: null,
          due_day: null,
          due_time: null,
        });
        showDueToast('Due cleared');
        void emitOverlayEvent({ type: 'overlay_due_clear' });
      }
    },
    [dispatch, showDueToast],
  );

  // Phase 2: Removed prefill suggestion normalization effect - overlay no longer runs AI prefill

  // theme / background for overlay (phase‑8 visual polish)
  const colorMode = useColorScheme();
  // Phase 6a: Overlay surface background - use brand cream color for warmth
  const sheetBackground = colorMode === 'dark' ? darkTokens.colors.linen : '#F9F6F1'; // linenCream
  // Footer bar keeps a clean white background for contrast with Save button
  const footerBackground = sheetBackground; // Match sheet background
  const sheetBorderColor = colorMode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const handleColor = colorMode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.16)';
  const typeTabActiveColor = colorMode === 'dark' ? darkTokens.colors.moss : '#2E5540';
  const typeTabInactiveColor =
    colorMode === 'dark' ? 'rgba(248,250,249,0.65)' : 'rgba(34,34,34,0.55)';
  const typeTabUnderlineColor =
    colorMode === 'dark' ? darkTokens.colors.moss : lightTokens.colors.moss;

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

  const canSave = currentText.trim().length > 0 && !isSaving;

  async function toCreateOrUpdateInput(
    baseType: BaseType,
    s: typeof initialV2State,
    spaceId: string | null,
    existingEntity?: any,
    photoUri?: string | null, // Phase L3: Photo support
    moodsParam?: Mood[], // Phase L4: Multi-select moods for journals
    effectiveLogSubtype?: 'journal' | 'idea' | 'general' | 'list' | 'event', // Phase L8: Manual log subtype
  ) {
    const isEditingMindDrop = mode === 'edit' && (existingEntity as any)?.origin === 'catchall';

    // For logs: if effectiveLogSubtype is 'general', use AI to classify the subtype
    // BUT: Skip AI classification for Mind Drop edits since buildCanonicalFromMindDrop already does it
    let aiClassifiedSubtype: 'journal' | 'idea' | 'general' | 'list' | undefined;

    if (
      baseType === 'log' &&
      effectiveLogSubtype === 'general' &&
      s.log.body &&
      !isEditingMindDrop
    ) {
      try {
        const aiResult = await getEffectiveLogSubtype(s.log.body);
        // Map AI result to simplified subtypes
        if (aiResult === 'journal' || aiResult === 'idea') {
          aiClassifiedSubtype = aiResult;
        } else {
          aiClassifiedSubtype = 'general';
        }
        console.log('[UnifiedOverlayV2] AI classified log subtype:', aiClassifiedSubtype);
      } catch (err) {
        console.warn(
          '[UnifiedOverlayV2] AI log subtype classification failed, using fallback',
          err,
        );
        aiClassifiedSubtype = 'general'; // Fallback to general on AI failure
      }
    }

    // Use AI-classified subtype if available, otherwise use the provided effectiveLogSubtype
    const finalLogSubtype = aiClassifiedSubtype ?? effectiveLogSubtype;

    const textForTags =
      baseType === 'log' ? s.log.body : baseType === 'todo' ? s.todo.details : s.habit.notes;
    const normalizeMetaValues = (values: string[] | undefined | null): string[] => {
      if (!Array.isArray(values)) return [];
      const normalized = values
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter(Boolean);
      return Array.from(new Set(normalized));
    };
    const normalizedStickyMeta = normalizeMetaValues(s.stickyTags);
    const normalizedTombstonesMeta = normalizeMetaValues(s.tagTombstones);

    const manualStickyKeys = normalizedStickyMeta
      .map((value) => {
        if (!value) return null;
        if (value.startsWith('#') || value.startsWith('@') || value.startsWith('*')) {
          const stripped = value.replace(/^[#@*]+/, '');
          return stripped || null;
        }
        return value;
      })
      .filter((value): value is string => !!value);

    // Use AI tag extraction with deterministic fallback
    const extractedTags = await getEffectiveTags(textForTags ?? '');

    // Combine AI-extracted tags with existing user tags
    const sanitized = sanitizeSuggestedTags(textForTags ?? '', Array.isArray(s.tags) ? s.tags : []);
    const combined = new Map<string, string>();

    // Add extracted tags first (preserving @ prefix for names)
    extractedTags.forEach((tag) => {
      // Tags from getEffectiveTags may have @ prefix for names
      const hasAtPrefix = tag.startsWith('@');
      const stripped = tag.replace(/^[@#]/, '');
      const key = stripped.toLowerCase();
      if (!combined.has(key)) {
        // Preserve @ prefix for names, use # for regular tags
        combined.set(key, hasAtPrefix ? `@${stripped}` : `#${stripped}`);
      }
    });

    // Add user-provided tags (preserving format)
    sanitized.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!combined.has(key)) combined.set(key, tag);
    });

    // Add sticky tags
    manualStickyKeys.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!combined.has(key)) combined.set(key, tag);
    });

    const combinedTags = Array.from(combined.values());
    const tags = stripJournalTags(combinedTags, baseType === 'log');

    // Prompt 3: Auto-add #list tag for list-type logs
    if (baseType === 'log') {
      const detection = detectListFromText(s.log.body);
      if (detection.kind === 'list') {
        // Remove conflicting subtype tags when list is detected
        const filtered = tags.filter((t) => {
          const lower = t.toLowerCase();
          return lower !== 'journal' && lower !== 'idea';
        });
        // Add list tag if not present
        if (!filtered.some((t) => t.toLowerCase() === 'list')) {
          filtered.push('list');
        }
        // Replace tags array with filtered version
        tags.length = 0;
        tags.push(...filtered);
      }
    }

    // Phase 2: Removed Mind Drop prefill marking logic - overlay no longer runs AI prefill

    // Build views object - preserve existing views from entity
    const entity = fullEntity || initialEntity;
    const existingViews = entity?.views || {};
    const viewsWithPrefillFlag = {
      ...(existingEntity?.views || existingViews || {}),
      // Persist title_user_edited flag so we know not to overwrite user's title on future opens
      title_user_edited:
        state.userEditedTitle || (existingEntity?.views as any)?.title_user_edited || false,
    };

    // Preserve existing tags_meta when available, only override if tags were modified
    const existingTagsMeta = existingEntity?.tags_meta ??
      entity?.tags_meta ?? { sticky: [], tombstones: [] };
    const tagsMeta = {
      sticky:
        normalizedStickyMeta.length > 0 ? normalizedStickyMeta : (existingTagsMeta.sticky ?? []),
      tombstones:
        normalizedTombstonesMeta.length > 0
          ? normalizedTombstonesMeta
          : (existingTagsMeta.tombstones ?? []),
    };

    // Determine if tags have changed by comparing current tags with original entity tags
    // Only send tags in the patch if they've actually changed
    const originalTags = Array.isArray(entity?.tags) ? entity.tags : [];
    const tagsHaveChanged = !areTagsEqual(originalTags, tags);

    // Conditionally include tags/tags_meta:
    // - Create mode: always include (mode !== 'edit')
    // - Edit mode: only include if tags have actually changed
    // This preserves Mind Drop AI-generated tags when user only edits title/due date
    const shouldIncludeTags = mode !== 'edit' || (tagsDirty && tagsHaveChanged);
    const tagsPayload = shouldIncludeTags
      ? { tags, tags_meta: tagsMeta }
      : { tags_meta: existingTagsMeta };

    if (baseType === 'todo') {
      // For Mind Drop edits, use canonical mapper for consistency
      const isMindDropEdit = mode === 'edit' && (initialEntity as any)?.origin === 'catchall';

      if (isMindDropEdit && s.todo.details) {
        // Use canonical mapper to ensure consistent title/body/tags
        const canonical = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: s.todo.details,
          aiTitle: s.todo.title || undefined,
          aiTags: shouldIncludeTags ? tags : undefined,
          existing: initialEntity,
        });

        // GREMLY TODO DATE MODEL: Use due_day (YYYY-MM-DD) as canonical source of truth
        // due_at is NOT used for todos - we only send due_day and due_date
        const dueDay = s.todo.due_day ?? null;
        // Resolve space_id: explicit null means "None" selected, undefined means use fallback
        const resolvedSpaceId = s.spaceId === undefined ? (spaceId ?? null) : s.spaceId;
        if (__DEV__ && s.spaceId === null) {
          console.log('[toCreateOrUpdateInput] Clearing space_id (user selected None)');
        }
        // Calculate buffers when time estimate changes
        const todoBuffers = calculateBuffers(
          (entity as any)?.energy_type ?? null,
          canonical.title || canonical.name || '',
          s.todo.time_estimate_minutes ?? 30,
        );
        return {
          type: 'todo' as const,
          ...canonical, // Spread canonical fields (title, name, body, tags, tags_meta, canonicalType, labels)
          due_at: null, // Explicitly null - we use due_day instead
          due_day: dueDay,
          due_date: dueDay, // Set due_date same as due_day for backwards compatibility
          undefined_due: !dueDay, // True if no due date is set
          time_estimate_minutes: s.todo.time_estimate_minutes ?? null,
          time_window: s.todo.time_window ?? null,
          energy_type: (entity as any)?.energy_type ?? 'administrative',
          prep_buffer_minutes: todoBuffers.prep_buffer_minutes,
          cooldown_buffer_minutes: todoBuffers.cooldown_buffer_minutes,
          space_id: resolvedSpaceId,
          origin: 'catchall' as const,
          views: {
            ...viewsWithPrefillFlag,
            // Date Intelligence fields in views
            target_date: s.todo.target_date ?? null,
            scheduled_date: s.todo.scheduled_date ?? null,
          },
          // Commitment fields (only for todos/habits)
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
          // Key Dates: Link to an event
          linked_event_id: s.linkedEventId ?? null,
        };
      }

      // For todos: title and details are strictly separate
      // - title should be the explicitly set short label (or empty)
      // - details is the long text field
      // Phase 2C: Use normalizeTodoTitle to ensure title doesn't duplicate details
      const rawDetails = (s.todo.details || '').trim();
      const overlayTitle = (s.todo.title || '').trim();
      const compactTitle = (s.compactTitle || '').trim();

      // Use overlay title if set, otherwise use compact title
      // Never fall back to full rawDetails as the title
      const effectiveTitle =
        overlayTitle || compactTitle || (rawDetails ? firstLine(rawDetails) : '');

      // GREMLY TODO DATE MODEL: Use due_day (YYYY-MM-DD) as canonical source of truth
      // due_at is NOT used for todos - we only send due_day and due_date
      const dueDay = s.todo.due_day ?? null;
      // Resolve space_id: explicit null means "None" selected, undefined means use fallback
      const resolvedSpaceId2 = s.spaceId === undefined ? (spaceId ?? null) : s.spaceId;
      if (__DEV__ && s.spaceId === null) {
        console.log('[toCreateOrUpdateInput] Clearing space_id (user selected None)');
      }
      // Calculate buffers when time estimate changes
      const todoBuffers2 = calculateBuffers(
        (entity as any)?.energy_type ?? null,
        effectiveTitle,
        s.todo.time_estimate_minutes ?? 30,
      );
      return {
        type: 'todo' as const,
        title: effectiveTitle,
        name: effectiveTitle,
        details: rawDetails || null,
        due_at: null, // Explicitly null - we use due_day instead
        due_day: dueDay,
        due_date: dueDay, // Set due_date same as due_day for backwards compatibility
        undefined_due: !dueDay, // True if no due date is set
        time_estimate_minutes: s.todo.time_estimate_minutes ?? null,
        time_window: s.todo.time_window ?? null,
        energy_type: (entity as any)?.energy_type ?? 'administrative',
        prep_buffer_minutes: todoBuffers2.prep_buffer_minutes,
        cooldown_buffer_minutes: todoBuffers2.cooldown_buffer_minutes,
        space_id: resolvedSpaceId2,
        origin: 'catchall' as const,
        views: {
          ...viewsWithPrefillFlag,
          // Date Intelligence fields in views
          target_date: s.todo.target_date ?? null,
          scheduled_date: s.todo.scheduled_date ?? null,
        },
        ...tagsPayload, // Conditionally include tags/tags_meta
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
        },
        // Key Dates: Link to an event
        linked_event_id: s.linkedEventId ?? null,
      };
    }
    if (baseType === 'habit') {
      // For Mind Drop edits, use canonical mapper for consistency
      const isMindDropEdit = mode === 'edit' && (initialEntity as any)?.origin === 'catchall';

      if (isMindDropEdit && s.habit.notes) {
        // Use canonical mapper to ensure consistent title/notes/tags
        const canonical = await buildCanonicalFromMindDrop({
          kind: 'habit',
          rawText: s.habit.notes,
          aiTitle: s.habit.title || undefined,
          aiTags: shouldIncludeTags ? tags : undefined,
          existing: initialEntity,
        });

        // Resolve space_id: explicit null means "None" selected, undefined means use fallback
        const resolvedSpaceId3 = s.spaceId === undefined ? (spaceId ?? null) : s.spaceId;
        if (__DEV__ && s.spaceId === null) {
          console.log('[toCreateOrUpdateInput] Clearing space_id (user selected None)');
        }
        const daysActiveFromJson = extractDaysActiveFromFrequencyJson(s.habit.frequency_json);
        console.log('[Save] FINAL frequency payload (edit):', {
          frequency: s.habit.schedule,
          frequency_json: s.habit.frequency_json,
          cadenceFields: frequencyJsonToCadenceFields(s.habit.frequency_json, s.habit.schedule),
          localScheduleDirty: hasLocalScheduleChanges.current,
          days_active: daysActiveFromJson,
        });
        // Calculate buffers when time estimate changes
        const habitBuffers = calculateBuffers(
          (entity as any)?.energy_type ?? null,
          canonical.title || canonical.name || '',
          s.habit.time_estimate_minutes ?? 30,
        );
        return {
          type: 'habit' as const,
          ...canonical, // Spread canonical fields (title, name, notes, tags, tags_meta, canonicalType, labels)
          frequency: s.habit.schedule ?? 'custom',
          frequency_value: s.habit.frequency_json ?? null, // Maps to frequency_json column
          ...frequencyJsonToCadenceFields(s.habit.frequency_json, s.habit.schedule), // Set cadence/target_per_period
          days_active: daysActiveFromJson, // Extract days from custom_days frequency
          subtype: s.habit.subtype ?? 'start_habit', // Build/Break habit mode
          space_id: resolvedSpaceId3,
          origin: 'catchall' as const,
          views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
          start_date: s.habit.start_date ?? null,
          end_date: s.habit.end_date ?? null,
          time_window: s.habit.time_window ?? null,
          time_estimate_minutes: s.habit.time_estimate_minutes ?? null,
          energy_type: (entity as any)?.energy_type ?? 'administrative',
          prep_buffer_minutes: habitBuffers.prep_buffer_minutes,
          cooldown_buffer_minutes: habitBuffers.cooldown_buffer_minutes,
          // Commitment fields (only for todos/habits)
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
          // Key Dates: Link to an event
          linked_event_id: s.linkedEventId ?? null,
        };
      }

      // Resolve space_id: explicit null means "None" selected, undefined means use fallback
      const resolvedSpaceId4 = s.spaceId === undefined ? (spaceId ?? null) : s.spaceId;
      if (__DEV__ && s.spaceId === null) {
        console.log('[toCreateOrUpdateInput] Clearing space_id (user selected None)');
      }
      const daysActiveFromJson2 = extractDaysActiveFromFrequencyJson(s.habit.frequency_json);
      console.log('[Save] FINAL frequency payload (create):', {
        frequency: s.habit.schedule,
        frequency_json: s.habit.frequency_json,
        cadenceFields: frequencyJsonToCadenceFields(s.habit.frequency_json, s.habit.schedule),
        localScheduleDirty: hasLocalScheduleChanges.current,
        days_active: daysActiveFromJson2,
      });
      // Calculate buffers when time estimate changes
      const habitBuffers2 = calculateBuffers(
        (entity as any)?.energy_type ?? null,
        s.habit.title || firstLine(s.habit.notes) || 'Untitled',
        s.habit.time_estimate_minutes ?? 30,
      );
      return {
        type: 'habit' as const,
        title: s.habit.title || firstLine(s.habit.notes) || 'Untitled',
        notes: s.habit.notes || null,
        frequency: s.habit.schedule ?? 'custom',
        frequency_value: s.habit.frequency_json ?? null, // Maps to frequency_json column
        ...frequencyJsonToCadenceFields(s.habit.frequency_json, s.habit.schedule), // Set cadence/target_per_period
        days_active: daysActiveFromJson2, // Extract days from custom_days frequency
        subtype: s.habit.subtype ?? 'start_habit', // Build/Break habit mode
        space_id: resolvedSpaceId4,
        origin: 'catchall' as const,
        views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
        start_date: s.habit.start_date ?? null,
        end_date: s.habit.end_date ?? null,
        time_window: s.habit.time_window ?? null,
        time_estimate_minutes: s.habit.time_estimate_minutes ?? null,
        energy_type: (entity as any)?.energy_type ?? 'administrative',
        prep_buffer_minutes: habitBuffers2.prep_buffer_minutes,
        cooldown_buffer_minutes: habitBuffers2.cooldown_buffer_minutes,
        ...tagsPayload, // Conditionally include tags/tags_meta
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
        },
        // Key Dates: Link to an event
        linked_event_id: s.linkedEventId ?? null,
      };
    }

    // For Mind Drop log edits, use canonical mapper for consistency
    const isMindDropEdit = mode === 'edit' && (initialEntity as any)?.origin === 'catchall';

    if (isMindDropEdit && s.log.body) {
      // Use canonical mapper to ensure consistent title/body/tags
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: s.log.body,
        aiTitle: s.log.title || undefined,
        aiTags: shouldIncludeTags ? tags : undefined,
        existing: initialEntity,
      });

      // Mood support for journal logs (Phase L4) - now multi-select array
      const moodPatch =
        s.log.kind === 'journal' && moodsParam && moodsParam.length > 0 ? { mood: moodsParam } : {};

      // fmt: list tag overrides explicit format
      // Only use valid fmt values: 'bullets', 'numbers', 'checkboxes'
      let fmtVal: any = null;
      if (s.tags.includes('list')) fmtVal = 'checkboxes';
      else if (s.format && s.format !== 'plain') fmtVal = s.format; // Skip 'plain' as it's invalid

      const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

      const reminderIso = coerceIsoTimestamp(s.reminderAt);
      const datePatch = reminderIso ? { date: reminderIso } : {};

      // Phase L8: Use effective log subtype for Mind Drop logs
      // For journal/idea, use the detected subtype
      // For general, use null (database allows null subtypes)
      const subtype = finalLogSubtype === 'general' ? null : finalLogSubtype;

      // For Mind Drop logs confirmed as logs, ensure canonicalType and labels are set
      // This clears catchall/needs_review labels and marks the item as a confirmed log
      const logConfirmationPatch = {
        canonicalType: 'log' as const,
        labels: ['log'] as const,
        subtype: subtype,
      };

      // Photo support for logs (Phase L3)
      const photoPatch = photoUri ? { photo_uri: photoUri } : {};

      // NOTE: 'private' column does NOT exist in notes table
      // Private flag is stored in views.private_journal instead (see below)

      // Phase L9: Private toggle for journal logs via views.private_journal
      const viewsWithPrivate =
        finalLogSubtype === 'journal'
          ? { ...viewsWithPrefillFlag, private_journal: !!s.logIsPrivate }
          : viewsWithPrefillFlag;

      // Add Date Intelligence fields to views
      const viewsWithDateIntelligence = {
        ...viewsWithPrivate,
        target_date: s.log.target_date ?? null,
        end_date: s.log.end_date ?? null,
        event_time: s.log.event_time ?? null,
      };

      // Resolve space_id: explicit null means "None" selected, undefined means use fallback
      const resolvedSpaceId5 = s.spaceId === undefined ? (spaceId ?? null) : s.spaceId;
      if (__DEV__ && s.spaceId === null) {
        console.log('[toCreateOrUpdateInput] Clearing space_id (user selected None)');
      }
      console.log('[DEBUG-CHECKLIST] Mind Drop save payload:', {
        isChecklistMode,
        checklistItems,
        stateIsChecklistMode: s.isChecklistMode,
        entityHasList: existingEntity?.has_list,
      });
      return {
        type: 'note' as const,
        ...canonical, // Spread canonical fields (title, body, tags, tags_meta, canonicalType, labels)
        ...logConfirmationPatch, // Override with confirmed log status and correct subtype
        space_id: resolvedSpaceId5,
        origin: 'catchall' as const,
        views: viewsWithDateIntelligence, // Add views with Date Intelligence, private_journal, and prefill flags
        ...moodPatch,
        ...fmtPatch,
        ...datePatch,
        ...photoPatch,
        // Checklist persistence - use isChecklistMode as the source of truth
        has_list: isChecklistMode,
        list_items: checklistItems,
        // Key Dates: Date Intelligence fields (direct on note, not just views)
        target_date: s.log.target_date ?? null,
        end_date: s.log.end_date ?? null,
        event_time: s.log.event_time ?? null,
        // Key Dates: Link to an event
        linked_event_id: s.linkedEventId ?? null,
      };
    }

    // Phase L8: Use effective log subtype for base note payload
    // For journal/idea, use the detected subtype
    // For general, use null (database allows null subtypes)
    const subtype2 = finalLogSubtype === 'general' ? null : finalLogSubtype;

    // Preserve AI-generated title when editing existing entities
    // Only use fallback (firstLine) for new entities or when user explicitly cleared title
    // Phase L10: For new logs from Mind Drop (create mode), always use full body as title
    const preserveExistingTitle =
      (mode === 'edit' || isViewMode) && initialEntity && (initialEntity as any)?.title;
    const isNewLogFromMindDrop = mode === 'create' && s.log.body && !s.log.title;
    const derivedTitle = isNewLogFromMindDrop
      ? s.log.body // Use full body for new Mind Drop logs
      : s.log.title ||
        (preserveExistingTitle ? (initialEntity as any).title : firstLine(s.log.body)) ||
        'Untitled note';

    // Resolve space_id: explicit null means "None" selected, undefined means use fallback
    const resolvedSpaceId6 = s.spaceId === undefined ? (spaceId ?? null) : s.spaceId;
    if (__DEV__ && s.spaceId === null) {
      console.log('[toCreateOrUpdateInput] Clearing space_id (user selected None)');
    }
    // base note payload (for non-Mind Drop logs or manual log creation)
    const base = {
      type: 'note' as const,
      subtype: subtype2,
      canonicalType: 'log' as const, // Mark as confirmed log
      labels: ['log'] as const, // Mark as confirmed log
      title: derivedTitle,
      body: s.log.body,
      space_id: resolvedSpaceId6,
      origin: 'catchall' as const,
      views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
      ...tagsPayload, // Conditionally include tags/tags_meta
    } as any;

    // Mood support for journal logs (Phase L4) - now multi-select array
    const moodPatch2 =
      s.log.kind === 'journal' && moodsParam && moodsParam.length > 0 ? { mood: moodsParam } : {};

    // fmt: list tag overrides explicit format
    // Only use valid fmt values: 'bullets', 'numbers', 'checkboxes'
    let fmtVal: any = null;
    if (s.tags.includes('list')) fmtVal = 'checkboxes';
    else if (s.format && s.format !== 'plain') fmtVal = s.format; // Skip 'plain' as it's invalid

    const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

    const reminderIso = coerceIsoTimestamp(s.reminderAt);
    const datePatch = reminderIso ? { date: reminderIso } : {};

    // Photo support for logs (Phase L3)
    const photoPatch = photoUri ? { photo_uri: photoUri } : {};

    // NOTE: 'private' column does NOT exist in notes table
    // Private flag is stored in views.private_journal instead (see below)

    // Phase L9: Private toggle for journal logs via views.private_journal
    const viewsWithPrivate2 =
      finalLogSubtype === 'journal'
        ? { ...viewsWithPrefillFlag, private_journal: !!s.logIsPrivate }
        : viewsWithPrefillFlag;

    console.log('[DEBUG-CHECKLIST] Base note save payload:', {
      isChecklistMode,
      checklistItems,
      stateIsChecklistMode: s.isChecklistMode,
      entityHasList: existingEntity?.has_list,
    });
    return {
      ...base,
      views: viewsWithPrivate2, // Override with views containing private_journal
      ...moodPatch2,
      ...fmtPatch,
      ...datePatch,
      ...photoPatch,
      // Checklist persistence - use isChecklistMode as the source of truth
      has_list: isChecklistMode,
      list_items: checklistItems,
      // Key Dates: Date Intelligence fields (direct on note)
      target_date: s.log.target_date ?? null,
      end_date: s.log.end_date ?? null,
      event_time: s.log.event_time ?? null,
      // Key Dates: Link to an event
      linked_event_id: s.linkedEventId ?? null,
    };
  }

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
    setIsSaving(true);
    try {
      // Map reminders array back to legacy reminderAt field before save
      const { reminderAt } = mapRemindersToLegacyFields(reminders);
      const stateWithReminder = { ...state, reminderAt };

      const input = await toCreateOrUpdateInput(
        baseType,
        stateWithReminder as any,
        initialSpaceId ?? null,
        fullEntity,
        photoUri, // Phase L3: Pass photo URI
        moods, // Phase L4: Pass multi-select moods for journals
        effectiveLogSubtype, // Phase L8: Pass effective log subtype
      );

      // Development logging for todo saves
      if (__DEV__ && baseType === 'todo') {
        console.log('[UnifiedOverlayV2.onSave] Todo state before save', {
          'state.todo.title': state.todo.title,
          'state.todo.details': state.todo.details,
          'state.compactTitle': state.compactTitle,
        });
        console.log('[UnifiedOverlayV2.onSave] Todo input payload', {
          title: (input as any).title,
          name: (input as any).name,
          details: (input as any).details,
        });
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

        if (__DEV__) {
          console.log('[OverlayTypeChange] Cross-table conversion detected', {
            oldId,
            dropId,
            originalFamily,
            targetFamily,
            from: originalEntityType,
            to: baseType,
          });
        }

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

        if (__DEV__) {
          console.log('[OverlayTypeChange] New record created', {
            newId: result?.id,
            newType: result?.type,
            dropId,
          });
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
      setIsSaving(false);
      setUserClearedChecklist(false);

      // Notify parent and close
      try {
        if (__DEV__) {
          console.log('[UnifiedOverlayV2] Closing immediately after save', {
            savedId,
            savedType,
          });
        }
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
              console.log('[UnifiedOverlayV2] Background: archived old entity by ID', {
                oldId: backgroundConversionOldId,
                entityType: backgroundConversionEntityType,
                source: 'edit-conversion',
              });
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
              console.log('[UnifiedOverlayV2] Background: archived source note from Sweep', {
                sourceNoteId: backgroundSweepSourceNoteId,
                source: 'sweep-conversion',
              });
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
            console.log('[UnifiedOverlayV2] Background: Processing log photos:', {
              noteId: backgroundResult.id,
              photoCount: backgroundLogPhotos.length,
            });
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
                    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
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
      setIsSaving(false);
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
    reminders,
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
    setShowEntityChat(true);
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
    const entityDueDay = state.todo.due_day;
    const entityCreatedAt = (entity as any).created_at;

    // Format due date for display
    const formattedDueDate = entityDueDay ? formatDueDay(entityDueDay) : null;

    // Format created date
    const formattedCreatedDate = entityCreatedAt
      ? format(parseISO(entityCreatedAt), 'MMM d, yyyy')
      : null;

    // Check if body has real content (not just duplicating the title)
    const bodyHasContent =
      entityBody && entityBody.trim() && entityBody.trim() !== entityTitle.trim();

    // Format event date for display
    const formatEventDate = () => {
      if (!state.log.target_date) return null;

      const targetDate = parseISO(state.log.target_date);
      const endDate = state.log.end_date ? parseISO(state.log.end_date) : null;
      const eventTime = state.log.event_time;
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Check if dates are same day
      const isToday = isSameDay(targetDate, today);
      const isTomorrow = isSameDay(targetDate, tomorrow);

      // Calculate days from now
      const daysFromNow = differenceInDays(targetDate, today);

      // Format the date part
      let dateStr: string;
      if (isToday) {
        dateStr = 'Today';
      } else if (isTomorrow) {
        dateStr = 'Tomorrow';
      } else if (daysFromNow > 0 && daysFromNow <= 7) {
        dateStr = format(targetDate, 'EEEE'); // Day name like "Friday"
      } else if (daysFromNow > 7 && daysFromNow <= 14) {
        dateStr = `In ${daysFromNow} days`;
      } else {
        dateStr = format(targetDate, 'MMM d, yyyy');
      }

      // Handle multi-day events
      if (endDate && !isSameDay(targetDate, endDate)) {
        const startStr = format(targetDate, 'MMM d');
        const endStr = format(
          endDate,
          targetDate.getFullYear() === endDate.getFullYear() ? 'd, yyyy' : 'MMM d, yyyy',
        );
        dateStr = `${startStr}–${endStr}`;
      }

      // Format time part
      let timeStr = 'All day';
      if (eventTime) {
        const [hours, minutes] = eventTime.split(':').map(Number);
        const timeDate = new Date();
        timeDate.setHours(hours, minutes, 0, 0);
        timeStr = format(timeDate, 'h:mm a');
      }

      return { dateStr, timeStr };
    };

    const eventDateInfo = effectiveLogSubtype === 'event' ? formatEventDate() : null;

    // Special rendering for event notes
    if (effectiveLogSubtype === 'event') {
      return (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
          scrollEnabled={true}
          bounces={true}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 24,
            paddingTop: 16,
          }}
        >
          {/* Title - Large, prominent display */}
          <Text
            style={{
              fontSize: 24,
              fontWeight: '600',
              color: colorMode === 'dark' ? '#FFFFFF' : '#1a1a1a',
              fontFamily: Platform.OS === 'ios' ? 'Plus Jakarta Sans' : undefined,
              marginBottom: 12,
              lineHeight: 32,
            }}
          >
            {entityTitle}
          </Text>

          {/* Event Date Row: Calendar icon + Date + Time ... Space name */}
          {eventDateInfo && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Calendar
                  size={16}
                  color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#2E5540'}
                />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '500',
                    color: colorMode === 'dark' ? 'rgba(255,255,255,0.9)' : '#333',
                  }}
                >
                  {eventDateInfo.dateStr}
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    color: colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666',
                  }}
                >
                  ·
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    color: colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666',
                  }}
                >
                  {eventDateInfo.timeStr}
                </Text>
              </View>
              {entitySpaceName && (
                <Text
                  style={{
                    fontSize: 13,
                    color: colorMode === 'dark' ? 'rgba(255,255,255,0.5)' : '#999',
                  }}
                >
                  {entitySpaceName}
                </Text>
              )}
            </View>
          )}

          {/* Divider between header and content */}
          <View
            style={{
              height: 1,
              backgroundColor: colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              marginBottom: 16,
            }}
          />

          {/* Tags row - read-only display */}
          {entityTags.length > 0 && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 16,
              }}
            >
              {entityTags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    backgroundColor:
                      colorMode === 'dark' ? 'rgba(94, 160, 138, 0.2)' : 'rgba(94, 160, 138, 0.15)',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 14,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: colorMode === 'dark' ? '#8FCBB4' : '#2E7D6A',
                      fontWeight: '500',
                    }}
                  >
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Body content - only show if it has real content different from title */}
          {bodyHasContent && (
            <View
              style={{
                backgroundColor:
                  colorMode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              {renderFormattedContent(entityBody, {
                textColor: colorMode === 'dark' ? 'rgba(255,255,255,0.9)' : '#333',
                fontSize: 16,
                lineHeight: 24,
              })}
            </View>
          )}

          {/* Photos grid (read-only) - for logs with photos */}
          {isLog && logPhotos.filter((p) => !p.isDeleted).length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {logPhotos
                  .filter((p) => !p.isDeleted)
                  .map((photo, index) => {
                    const actualIndex = logPhotos.findIndex((p) => p === photo);
                    return (
                      <Pressable
                        key={actualIndex}
                        onPress={() => handleViewLogPhoto(actualIndex)}
                        accessibilityLabel={`View photo ${index + 1}`}
                        accessibilityRole="button"
                      >
                        <Image
                          source={{ uri: photo.url }}
                          style={{
                            width: 100,
                            height: 100,
                            borderRadius: 8,
                          }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </View>
          )}

          {/* Linked Items section for event notes */}
          {currentEntityId && fullEntity?.space_id && (
            <LinkedItemsSection
              eventId={currentEntityId}
              spaceId={fullEntity.space_id}
              onItemPress={handleLinkedItemPress}
              onAddTodo={handleLinkedAddTodo}
              onAddNote={handleLinkedAddNote}
              onLinkExisting={handleLinkExisting}
            />
          )}

          {/* Chat with Gremly button */}
          {currentEntityId && (
            <View style={{ marginTop: 16 }}>
              <EntityChatButton
                entityId={currentEntityId}
                entityType="note"
                variant="overlay"
                onPress={() => setShowEntityChat(true)}
              />
            </View>
          )}

          {/* Created date - subtle footer info, very small */}
          {formattedCreatedDate && (
            <Text
              style={{
                fontSize: 11,
                color: colorMode === 'dark' ? 'rgba(255,255,255,0.3)' : '#bbb',
                marginTop: 24,
                textAlign: 'center',
              }}
            >
              Created {formattedCreatedDate}
            </Text>
          )}
        </ScrollView>
      );
    }

    // Default rendering for non-event entities
    return (
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
        scrollEnabled={true}
        bounces={true}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 24,
          paddingTop: 8,
        }}
      >
        {/* Title - Large, prominent display */}
        <Text
          style={{
            fontSize: 24,
            fontWeight: '600',
            color: colorMode === 'dark' ? '#FFFFFF' : '#1a1a1a',
            fontFamily: Platform.OS === 'ios' ? 'Plus Jakarta Sans' : undefined,
            marginBottom: 12,
            lineHeight: 32,
          }}
        >
          {entityTitle}
        </Text>

        {/* Subtitle row: Type badge + Space + Due date */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 16,
          }}
        >
          {/* Type badge */}
          <View
            style={{
              backgroundColor:
                colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(46, 85, 64, 0.08)',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#2E5540',
                textTransform: 'capitalize',
              }}
            >
              {BASE_LABEL[baseType]}
            </Text>
          </View>

          {/* Space badge */}
          {entitySpaceName && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor:
                  colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Folder size={12} color={colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666'} />
              <Text
                style={{
                  fontSize: 12,
                  color: colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666',
                }}
              >
                {entitySpaceName}
              </Text>
            </View>
          )}

          {/* Due date badge (for todos) */}
          {baseType === 'todo' && formattedDueDate && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor:
                  colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Calendar size={12} color={colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666'} />
              <Text
                style={{
                  fontSize: 12,
                  color: colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666',
                }}
              >
                {formattedDueDate}
              </Text>
            </View>
          )}

          {/* Source note reference - for todos created from notes */}
          {baseType === 'todo' && sourceNote && (
            <Pressable
              onPress={handleOpenSourceNote}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: 'rgba(107, 142, 107, 0.08)',
                borderRadius: 8,
                marginBottom: 12,
                alignSelf: 'flex-start',
              }}
            >
              <FileText size={14} color={lightTokens.colors.mossGreen} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: lightTokens.colors.mossGreen,
                }}
              >
                From: {sourceNote.title}
              </Text>
              <ChevronRight size={14} color="#999" />
            </Pressable>
          )}

          {/* Frequency badge (for habits) */}
          {baseType === 'habit' && state.habit.frequency_json && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor:
                  colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Calendar size={12} color={colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666'} />
              <Text
                style={{
                  fontSize: 12,
                  color: colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666',
                }}
              >
                {getFrequencyLabel(jsonToFrequency(state.habit.frequency_json))}
              </Text>
            </View>
          )}
        </View>

        {/* Tags row - read-only display */}
        {entityTags.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 20,
            }}
          >
            {entityTags.map((tag) => (
              <View
                key={tag}
                style={{
                  backgroundColor:
                    colorMode === 'dark' ? 'rgba(94, 160, 138, 0.2)' : 'rgba(94, 160, 138, 0.15)',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: colorMode === 'dark' ? '#8FCBB4' : '#2E7D6A',
                    fontWeight: '500',
                  }}
                >
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Body content - checklist or formatted text */}
        {baseType === 'log' && checklistItems && checklistItems.length > 0 ? (
          // Checklist mode - use local state as primary trigger
          <View
            style={{
              backgroundColor: colorMode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <ChecklistProgress items={checklistItems} />
            <ChecklistView items={checklistItems} onToggle={handleToggleChecklistItem} />
          </View>
        ) : entityBody ? (
          // Regular formatted content
          <View
            style={{
              backgroundColor: colorMode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
            }}
          >
            {renderFormattedContent(entityBody, {
              textColor: colorMode === 'dark' ? 'rgba(255,255,255,0.9)' : '#333',
              fontSize: 16,
              lineHeight: 24,
            })}
          </View>
        ) : null}

        {/* Make Actionable button - only for notes with lists that aren't already checklists */}
        {baseType === 'log' && showMakeActionable && (
          <MakeActionableButton onPress={handleMakeActionable} />
        )}

        {/* Revert to text button - only for notes that ARE checklists */}
        {baseType === 'log' && checklistItems && checklistItems.length > 0 && (
          <RevertToTextButton onPress={handleRevertToText} />
        )}

        {/* Photos grid (read-only) - for logs with photos */}
        {isLog && logPhotos.filter((p) => !p.isDeleted).length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {logPhotos
                .filter((p) => !p.isDeleted)
                .map((photo, index) => {
                  const actualIndex = logPhotos.findIndex((p) => p === photo);
                  return (
                    <Pressable
                      key={actualIndex}
                      onPress={() => handleViewLogPhoto(actualIndex)}
                      accessibilityLabel={`View photo ${index + 1}`}
                      accessibilityRole="button"
                    >
                      <Image
                        source={{ uri: photo.url }}
                        style={{
                          width: 100,
                          height: 100,
                          borderRadius: 8,
                        }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  );
                })}
            </ScrollView>
          </View>
        )}

        {/* Reminders display (read-only) */}
        {reminders.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
              paddingVertical: 8,
            }}
          >
            <Bell size={16} color={colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666'} />
            <Text
              style={{
                fontSize: 14,
                color: colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#555',
              }}
            >
              {formatReminderSummary(reminders)}
            </Text>
          </View>
        )}

        {/* Mood display (for journal logs) */}
        {isJournal && moods.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666',
              }}
            >
              Mood:
            </Text>
            <Text style={{ fontSize: 14, color: colorMode === 'dark' ? '#fff' : '#2E5540' }}>
              {moods.map((m) => MOOD_CONFIG[m]?.label ?? m).join(', ')}
            </Text>
          </View>
        )}

        {/* Created date - subtle footer info */}
        {formattedCreatedDate && (
          <Text
            style={{
              fontSize: 12,
              color: colorMode === 'dark' ? 'rgba(255,255,255,0.4)' : '#999',
              marginTop: 16,
            }}
          >
            Created {formattedCreatedDate}
          </Text>
        )}
      </ScrollView>
    );
  };

  console.log('[UnifiedOverlayV2] render', { visible, mode, baseType });

  if (!visible) return null;

  // Derive space name for modals
  const currentSpaceName = state.spaceId
    ? spaces.find((s) => s.id === state.spaceId)?.name || 'this Space'
    : 'this Space';

  return (
    <>
      <KeyboardAvoidingView
        style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.10)' }]}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={0}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            alignSelf: 'stretch',
          }}
        >
          {/* Backdrop tap area - only the visible backdrop above the sheet */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              // First tap: dismiss keyboard if open
              // Second tap: close overlay
              if (keyboardHeight > 0) {
                Keyboard.dismiss();
                return;
              }
              onClose?.();
            }}
          />
          {/* Bottom-anchored sheet: max 90% of viewport (or less when keyboard open), rounded top corners */}
          <RNAnimated.View
            style={{
              width: '100%',
              opacity: sheetOpacity,
              transform: [{ translateY: RNAnimated.add(sheetTranslateY, sheetDragY) }],
            }}
          >
            {/* Dynamic sheet height: when keyboard is open, shrink to fit available space */}
            {(() => {
              const screenHeight = Dimensions.get('window').height;
              const availableHeight = screenHeight - keyboardHeight - insets.top - 20; // 20px buffer
              const dynamicSheetHeight = Math.min(SHEET_MAX_H, availableHeight);
              return (
                <View
                  style={{
                    width: '100%',
                    alignSelf: 'stretch',
                    height: dynamicSheetHeight,
                    maxHeight: dynamicSheetHeight,
                    borderTopLeftRadius: tokenRadius.md,
                    borderTopRightRadius: tokenRadius.md,
                    overflow: 'hidden',
                    backgroundColor: sheetBackground,
                    // Lock In visual state: add green top border when locked
                    borderTopWidth: isLockedIn ? 3 : 0,
                    borderTopColor: isLockedIn ? lightTokens.colors.moss : 'transparent',
                    // subtle shadow to feel like a sheet of paper floating above the app
                    shadowColor: '#000',
                    shadowOpacity: 0.05,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 4,
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
                  {/* Grab handle for visual separation - drag here to dismiss */}
                  <View
                    {...panResponder.panHandlers}
                    style={{
                      alignItems: 'center',
                      paddingTop: 12,
                      paddingBottom: 8,
                      backgroundColor: sheetBackground,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: handleColor,
                      }}
                    />
                  </View>
                  {/* Header: contextual title - Phase 6b cleanup */}
                  <Box
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      // remove harsh bottom border on header to keep sheet soft
                      borderBottomWidth: 0,
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
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}
                        >
                          {(mode === 'edit' && initialEntity?.id) ||
                          (mode === 'create' && isLog) ? (
                            <TextInput
                              value={mode === 'create' ? state.compactTitle : state.compactTitle}
                              onChangeText={(text) =>
                                dispatch({ type: 'SET_COMPACT_TITLE', title: text })
                              }
                              placeholder={mode === 'create' ? 'Add title...' : 'Add title...'}
                              placeholderTextColor="#999999"
                              style={{
                                color: '#222222',
                                fontWeight: '500',
                                fontSize: 18,
                                flex: 1,
                                padding: 0,
                                margin: 0,
                              }}
                              maxLength={100}
                              selectTextOnFocus={false}
                              autoCorrect={false}
                            />
                          ) : (
                            // Hide "View" text for event notes in view mode - show empty space
                            !(isViewMode && isLog && effectiveLogSubtype === 'event') && (
                              <Text
                                variant="title"
                                style={{
                                  color: '#222222',
                                  fontWeight: '500',
                                  fontSize: 18,
                                  flex: 1,
                                }}
                                numberOfLines={1}
                              >
                                {headerFor(baseType, mode, overlaySubtitle)}
                              </Text>
                            )
                          )}
                          {/* Lock In badge */}
                          {isLockedIn ? (
                            <View
                              style={[
                                styles.lockedBadge,
                                { flexDirection: 'row', alignItems: 'center', gap: 4 },
                              ]}
                            >
                              <Diamond size={12} color="#2E5540" fill="#2E5540" />
                              <Text style={styles.lockedBadgeText}>Locked In</Text>
                            </View>
                          ) : null}
                          {/* Note chip - show before Event chip for event notes in view mode */}
                          {isLog && effectiveLogSubtype === 'event' && isViewMode ? (
                            <View
                              style={{
                                alignSelf: 'center',
                                marginLeft: 8,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 999,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor:
                                  colorMode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.15)'
                                    : 'rgba(0, 0, 0, 0.12)',
                                backgroundColor:
                                  colorMode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.04)'
                                    : 'rgba(46, 85, 64, 0.06)',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '500',
                                  color:
                                    colorMode === 'dark' ? 'rgba(255, 255, 255, 0.65)' : '#5a5a5a',
                                }}
                              >
                                Note
                              </Text>
                            </View>
                          ) : null}
                          {/* Log subtype chip - tappable for manual override */}
                          {isLog && logSubtypeLabel ? (
                            <Pressable
                              onPress={handleLogSubtypeChipPress}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`Log subtype: ${logSubtypeLabel}. Tap to change.`}
                              style={({ pressed }) => ({
                                alignSelf: 'center',
                                marginLeft: 8,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 999,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor:
                                  colorMode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.15)'
                                    : 'rgba(0, 0, 0, 0.12)',
                                backgroundColor:
                                  colorMode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.04)'
                                    : 'rgba(46, 85, 64, 0.06)',
                                opacity: pressed ? 0.6 : 1,
                              })}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '500',
                                  color:
                                    colorMode === 'dark' ? 'rgba(255, 255, 255, 0.65)' : '#5a5a5a',
                                }}
                              >
                                {logSubtypeLabel}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>

                        {/* Favorite star - view mode, notes only (not for events) */}
                        {isViewMode &&
                          baseType === 'log' &&
                          effectiveLogSubtype !== 'event' &&
                          (fullEntity?.id || (initialEntity as any)?.id) && (
                            <Pressable
                              onPress={handleToggleFavorite}
                              style={{ padding: 8, marginRight: 4 }}
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

                        {/* Back to View button - only for habits when in edit mode and started in view */}
                        {baseType === 'habit' && displayMode === 'edit' && startedInViewMode ? (
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
                            <Text
                              style={{
                                color: colorMode === 'dark' ? '#FFFFFF' : '#666666',
                                fontSize: 14,
                                fontWeight: '500',
                              }}
                            >
                              ← View
                            </Text>
                          </Pressable>
                        ) : null}

                        {/* Header Edit button - view mode only (not for habits or events - they have Edit button in footer) */}
                        {isViewMode &&
                        fullEntity &&
                        baseType !== 'habit' &&
                        effectiveLogSubtype !== 'event' ? (
                          <Pressable
                            onPress={() => {
                              if (initialEntity && (initialEntity as any).id) {
                                // Reopen in edit mode
                                globalOverlay.openEdit({
                                  record: initialEntity as any,
                                  spaceId: initialSpaceId,
                                });
                              }
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Edit"
                            style={({ pressed }) => ({
                              backgroundColor:
                                colorMode === 'dark'
                                  ? darkTokens.colors.moss
                                  : lightTokens.colors.moss,
                              paddingHorizontal: 16,
                              paddingVertical: 8,
                              borderRadius: 999,
                              opacity: pressed ? 0.8 : 1,
                            })}
                          >
                            <Text
                              style={{
                                color: '#FFFFFF',
                                fontSize: 14,
                                fontWeight: '600',
                              }}
                            >
                              Edit
                            </Text>
                          </Pressable>
                        ) : null}

                        {/* Title actions - edit + resummarize icons (only in edit mode) */}
                        {mode === 'edit' && fullEntity ? (
                          <View style={styles.titleActions}>
                            {/* Edit icon - focuses the text input */}
                            <Pressable
                              onPress={handleEditTitle}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel="Edit title"
                              style={({ pressed }) => ({
                                opacity: pressed ? 0.5 : 0.6,
                              })}
                            >
                              <Pencil
                                size={16}
                                color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'}
                              />
                            </Pressable>
                            {/* Resummarize icon - regenerates title via AI */}
                            {currentText ? (
                              <Pressable
                                onPress={handleResummarizeTitle}
                                disabled={isResummarizingTitle}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel="Re-summarize title"
                                style={({ pressed }) => ({
                                  opacity: pressed || isResummarizingTitle ? 0.5 : 0.6,
                                })}
                              >
                                <RotateCw
                                  size={16}
                                  color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'}
                                />
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      {/* Phase 6b: Removed subtitle to avoid duplication - title now shows in header */}
                    </View>
                    {/* Decorative title divider - hide for event notes in view mode */}
                    {!(isViewMode && isLog && effectiveLogSubtype === 'event') && (
                      <View
                        style={{
                          width: '35%',
                          height: 1,
                          backgroundColor: 'rgba(191, 216, 192, 0.9)',
                          marginTop: 4,
                          marginBottom: 4,
                        }}
                      />
                    )}
                  </Box>

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
                            paddingBottom: 8,
                            paddingTop: 0,
                          }}
                        >
                          {/* Sweep Status Chip - subtle system status */}
                          {sweepStatus.label && mode !== 'create' && (
                            <View
                              style={{
                                alignItems: 'flex-start',
                                marginBottom: 8,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                  backgroundColor:
                                    sweepStatus.type === 'archived'
                                      ? 'rgba(0, 0, 0, 0.06)'
                                      : sweepStatus.type === 'completed'
                                        ? 'rgba(46, 85, 64, 0.08)'
                                        : 'rgba(46, 85, 64, 0.06)',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '500',
                                    color:
                                      sweepStatus.type === 'archived'
                                        ? '#888888'
                                        : sweepStatus.type === 'completed'
                                          ? '#2E5540'
                                          : '#5a5a5a',
                                  }}
                                >
                                  {sweepStatus.label}
                                </Text>
                              </View>
                            </View>
                          )}

                          {/* Phase 6c: Type selector - segmented control */}
                          <View style={styles.tabsContainer}>
                            {(['log', 'todo', 'habit'] as BaseType[]).map((t) => {
                              const selected = baseType === t;
                              return (
                                <Pressable
                                  key={t}
                                  onPress={() => handleTypeSelect(t)}
                                  style={[styles.tab, selected && styles.tabActive]}
                                  accessibilityRole="tab"
                                  accessibilityState={{ selected }}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Text
                                    style={[styles.tabLabel, selected && styles.tabLabelActive]}
                                  >
                                    {BASE_LABEL[t]}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          {/* Build/Break Habit underline toggle - only for habits */}
                          {baseType === 'habit' && (
                            <View
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                marginTop: 0,
                                marginBottom: 12,
                                paddingHorizontal: 4,
                              }}
                            >
                              {/* Build option */}
                              <Pressable
                                onPress={() => {
                                  dispatch({
                                    type: 'SET_HABIT_SUBTYPE',
                                    subtype: 'start_habit',
                                  });
                                }}
                                style={({ pressed }) => ({
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 5,
                                  paddingVertical: 6,
                                  borderBottomWidth: !isBreakHabit ? 2 : 0,
                                  borderBottomColor: lightTokens.colors.moss,
                                  opacity: pressed ? 0.7 : 1,
                                })}
                              >
                                <TrendingUp
                                  size={14}
                                  color={!isBreakHabit ? lightTokens.colors.moss : '#999999'}
                                  strokeWidth={!isBreakHabit ? 2.5 : 2}
                                />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: !isBreakHabit ? '600' : '400',
                                    color: !isBreakHabit ? lightTokens.colors.moss : '#999999',
                                  }}
                                >
                                  Build a habit
                                </Text>
                              </Pressable>

                              {/* Break option */}
                              <Pressable
                                onPress={() => {
                                  dispatch({
                                    type: 'SET_HABIT_SUBTYPE',
                                    subtype: 'break_habit',
                                  });
                                }}
                                style={({ pressed }) => ({
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 5,
                                  paddingVertical: 6,
                                  borderBottomWidth: isBreakHabit ? 2 : 0,
                                  borderBottomColor: lightTokens.colors.moss,
                                  opacity: pressed ? 0.7 : 1,
                                })}
                              >
                                <TrendingDown
                                  size={14}
                                  color={isBreakHabit ? lightTokens.colors.moss : '#999999'}
                                  strokeWidth={isBreakHabit ? 2.5 : 2}
                                />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: isBreakHabit ? '600' : '400',
                                    color: isBreakHabit ? lightTokens.colors.moss : '#999999',
                                  }}
                                >
                                  Break a habit
                                </Text>
                              </Pressable>
                            </View>
                          )}

                          {/* Main text field - moved above tags */}
                          <Box style={{ marginBottom: 16 }}>
                            {isExpandedEditor ? (
                              /* Expanded editor mode */
                              <OverlayExpandedEditor
                                baseType={baseType}
                                effectiveLogSubtype={effectiveLogSubtype}
                                text={currentText}
                                onChangeText={(t) => dispatch({ type: 'SET_TEXT', text: t })}
                                colorMode={colorMode}
                                isLog={isLog}
                                onCollapse={() => {
                                  LayoutAnimation.configureNext(
                                    LayoutAnimation.Presets.easeInEaseOut,
                                  );
                                  setIsExpandedEditor(false);
                                }}
                                journalDateTime={
                                  effectiveLogSubtype === 'journal' ? new Date() : undefined
                                }
                                isChecklistMode={isChecklistMode}
                                onToggleChecklistMode={() => {
                                  console.log('[DEBUG-CHECKLIST] Before toggle:', {
                                    stateIsChecklistMode: state.isChecklistMode,
                                    checklistItems,
                                  });
                                  const newMode = !state.isChecklistMode;
                                  dispatch({ type: 'TOGGLE_CHECKLIST_MODE' });
                                  console.log(
                                    '[DEBUG-CHECKLIST] After toggle dispatch, newMode:',
                                    newMode,
                                  );
                                  if (!newMode && checklistItems && checklistItems.length > 0) {
                                    console.log('[DEBUG-CHECKLIST] Clearing checklist items');
                                    setUserClearedChecklist(true);
                                    setChecklistItems(null);
                                  }
                                }}
                              />
                            ) : isPreviewMode ? (
                              /* Preview mode: Formatted read-only content */
                              <View style={{ position: 'relative' }}>
                                <View
                                  style={[
                                    styles.textArea,
                                    {
                                      maxHeight: 200,
                                      backgroundColor:
                                        colorMode === 'dark' ? darkTokens.colors.deep : '#FAFAFA',
                                      borderWidth: 1,
                                      borderColor:
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
                                      paddingRight: 50,
                                    },
                                  ]}
                                >
                                  <ScrollView
                                    style={{ flex: 1 }}
                                    showsVerticalScrollIndicator={true}
                                    nestedScrollEnabled={true}
                                  >
                                    {renderFormattedContent(currentText, {
                                      textColor:
                                        colorMode === 'dark'
                                          ? 'rgba(255,255,255,0.9)'
                                          : lightTokens.colors.text,
                                      fontSize: 16,
                                      lineHeight: 24,
                                    })}
                                  </ScrollView>
                                </View>

                                {/* Edit button - top right */}
                                <Pressable
                                  onPress={() => {
                                    // Strip markdown and switch to edit mode
                                    const strippedText = stripMarkdown(currentText);
                                    dispatch({ type: 'SET_TEXT', text: strippedText });
                                    setIsPreviewMode(false);
                                  }}
                                  style={({ pressed }) => ({
                                    position: 'absolute',
                                    top: 10,
                                    right: 10,
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 14,
                                    backgroundColor:
                                      colorMode === 'dark'
                                        ? 'rgba(255,255,255,0.1)'
                                        : 'rgba(46, 85, 64, 0.1)',
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
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.8)' : '#2E5540',
                                    }}
                                  >
                                    Edit
                                  </Text>
                                </Pressable>
                              </View>
                            ) : (
                              /* Compact text area mode */
                              <View style={{ position: 'relative' }}>
                                {/* Standard text input for all log subtypes */}
                                <TextInput
                                  ref={textInputRef}
                                  value={currentText}
                                  onChangeText={(t) => dispatch({ type: 'SET_TEXT', text: t })}
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
                                  style={[
                                    styles.textArea,
                                    {
                                      maxHeight: 200,
                                      color: lightTokens.colors.text,
                                      backgroundColor:
                                        colorMode === 'dark' ? darkTokens.colors.deep : '#FAFAFA',
                                      borderWidth: 1,
                                      borderColor:
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
                                      shadowColor: '#000',
                                      shadowOpacity: 0.03,
                                      shadowOffset: { width: 0, height: 1 },
                                      shadowRadius: 2,
                                      paddingRight: isLog ? 56 : 16, // Extra padding for camera button in logs
                                    },
                                  ]}
                                />
                                {/* Expand button in top-right corner */}
                                <Pressable
                                  onPress={() => {
                                    LayoutAnimation.configureNext(
                                      LayoutAnimation.Presets.easeInEaseOut,
                                    );
                                    setIsExpandedEditor(true);
                                  }}
                                  style={({ pressed }) => ({
                                    position: 'absolute',
                                    top: 10,
                                    right: 10,
                                    width: 32,
                                    height: 32,
                                    borderRadius: 16,
                                    backgroundColor:
                                      colorMode === 'dark'
                                        ? 'rgba(255,255,255,0.1)'
                                        : 'rgba(46, 85, 64, 0.08)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: pressed ? 0.7 : 1,
                                  })}
                                  accessibilityLabel="Expand editor"
                                  accessibilityRole="button"
                                >
                                  <Maximize2
                                    size={16}
                                    color={
                                      colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#2E5540'
                                    }
                                  />
                                </Pressable>
                                {/* Camera button inside text area for logs only (hidden in view mode) */}
                                {isLog && !isViewMode && (
                                  <Pressable
                                    onPress={handleOpenMultiPhotoActionSheet}
                                    style={({ pressed }) => ({
                                      position: 'absolute',
                                      bottom: 14,
                                      right: 14,
                                      width: 40,
                                      height: 40,
                                      borderRadius: 20,
                                      backgroundColor:
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      shadowColor: '#000',
                                      shadowOpacity: 0.08,
                                      shadowOffset: { width: 0, height: 2 },
                                      shadowRadius: 4,
                                      opacity: pressed ? 0.7 : 1,
                                    })}
                                    accessibilityLabel="Add photo"
                                    accessibilityRole="button"
                                  >
                                    <Camera
                                      size={24}
                                      color={
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'
                                      }
                                    />
                                  </Pressable>
                                )}
                              </View>
                            )}
                          </Box>

                          {/* Multi-photo grid for logs (Phase L5) - only show when photos exist */}
                          {isLog && logPhotos.filter((p) => !p.isDeleted).length > 0 && (
                            <Box px={4} mt={2}>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.photoGridScroll}
                                contentContainerStyle={styles.photoGridContent}
                              >
                                {logPhotos
                                  .filter((p) => !p.isDeleted)
                                  .map((photo, index) => {
                                    const actualIndex = logPhotos.findIndex((p) => p === photo);
                                    return (
                                      <View
                                        key={actualIndex}
                                        style={styles.photoThumbnailContainer}
                                      >
                                        <Pressable
                                          onPress={() => handleViewLogPhoto(actualIndex)}
                                          accessibilityLabel={`View photo ${index + 1}`}
                                          accessibilityRole="button"
                                        >
                                          <Image
                                            source={{ uri: photo.url }}
                                            style={styles.photoGridThumbnail}
                                            resizeMode="cover"
                                          />
                                        </Pressable>
                                        <Pressable
                                          onPress={() => handleDeleteLogPhoto(actualIndex)}
                                          style={styles.photoGridDeleteButton}
                                          hitSlop={8}
                                          accessibilityLabel={`Remove photo ${index + 1}`}
                                          accessibilityRole="button"
                                        >
                                          <CloseIcon size={12} color="#666666" />
                                        </Pressable>
                                      </View>
                                    );
                                  })}
                                {logPhotos.filter((p) => !p.isDeleted).length < 5 && (
                                  <Pressable
                                    onPress={handleOpenMultiPhotoActionSheet}
                                    style={styles.addMorePhotosButton}
                                    accessibilityLabel="Add another photo"
                                    accessibilityRole="button"
                                  >
                                    <Camera size={16} color="#666666" />
                                    <Text style={styles.addMorePhotosText}>Add photo</Text>
                                  </Pressable>
                                )}
                              </ScrollView>
                            </Box>
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

                          {/* Entity Chat & Notes buttons - side by side (hide for events in edit mode) */}
                          {currentEntityId && (!isEventNote || isViewMode) && (
                            <View
                              style={{
                                flexDirection: 'row',
                                gap: 10,
                                paddingHorizontal: 16,
                                paddingVertical: 8,
                              }}
                            >
                              {/* Check progress button — habits only, not in create mode */}
                              {baseType === 'habit' && mode !== 'create' && (
                                <TouchableOpacity
                                  onPress={() => {
                                    onClose();
                                    setTimeout(() => {
                                      overlayNavigation.navigate('HabitDetail', {
                                        habitId: currentEntityId,
                                      });
                                    }, 300);
                                  }}
                                  style={{
                                    flex: 1,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    backgroundColor: 'rgba(191, 216, 192, 0.3)',
                                    borderRadius: 10,
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <BarChart3 size={16} color={lightTokens.colors.mossGreen} />
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      fontFamily: lightTokens.typography.fontFamily.medium,
                                      color: lightTokens.colors.mossGreen,
                                    }}
                                  >
                                    Check progress
                                  </Text>
                                </TouchableOpacity>
                              )}

                              {/* Chat with Gremly button */}
                              <EntityChatButton
                                entityId={currentEntityId}
                                entityType={entityTypeForChat}
                                variant="overlay"
                                onPress={() => setShowEntityChat(true)}
                                style={{ flex: 1 }}
                              />

                              {/* Notes button - secondary, takes less space */}
                              {entityChatNotes.length > 0 && (
                                <TouchableOpacity
                                  style={{
                                    flex: 1,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                    borderRadius: 10,
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                  }}
                                  onPress={() => setShowNotesModal(true)}
                                  activeOpacity={0.7}
                                >
                                  <FileText size={16} color={lightTokens.colors.mossGreen} />
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      fontFamily: lightTokens.typography.fontFamily.medium,
                                      color: lightTokens.colors.mossGreen,
                                    }}
                                  >
                                    Notes ({entityChatNotes.length})
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}

                          {/* Tags row - now directly below text field */}
                          <Box style={{ marginBottom: 16, paddingHorizontal: 16 }}>
                            <TagsRow
                              tags={activeTagChips}
                              suggested={[]}
                              onToggle={isViewMode ? () => {} : handleTagToggle}
                              onResuggest={
                                isViewMode
                                  ? undefined
                                  : mode === 'edit' && fullEntity
                                    ? handleResuggestTags
                                    : undefined
                              }
                              resuggesting={isResuggestingTags}
                              onAdd={isViewMode ? undefined : handleTagAdd}
                              onUserAdd={isViewMode ? undefined : handleTelemetryTagAdd}
                              onUserRemove={isViewMode ? undefined : handleTelemetryTagRemove}
                            />
                          </Box>

                          {/* Log meta row: timestamp + mood strip (Phase L4) - ONLY for journal logs */}
                          {isJournal ? (
                            <Box style={{ marginBottom: 16 }}>
                              <View style={styles.logMetaRow}>
                                {logTimestampLabel ? (
                                  <View
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                  >
                                    <Text style={styles.logTimestampText}>{logTimestampLabel}</Text>
                                    {state.log.private && (
                                      <Lock
                                        size={14}
                                        color={
                                          colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666'
                                        }
                                        style={{ opacity: 0.8 }}
                                      />
                                    )}
                                  </View>
                                ) : null}
                                {/* Mood picker - collapsed/expanded states */}
                                {!moodPickerExpanded ? (
                                  // Collapsed state
                                  moods.length > 0 ? (
                                    // Moods are set - show as chips with clear button
                                    <Pressable
                                      onPress={() => !isViewMode && setMoodPickerExpanded(true)}
                                      style={[
                                        styles.moodChip,
                                        {
                                          backgroundColor:
                                            colorMode === 'dark'
                                              ? 'rgba(255,255,255,0.1)'
                                              : '#E8F0EB',
                                        },
                                      ]}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Moods: ${moods.map((m) => MOOD_CONFIG[m]?.label ?? m).join(', ')}. Tap to change`}
                                    >
                                      <Text
                                        style={[
                                          styles.moodChipText,
                                          { color: colorMode === 'dark' ? '#fff' : '#2E5540' },
                                        ]}
                                      >
                                        {moods.map((m) => MOOD_CONFIG[m]?.label ?? m).join(', ')}
                                      </Text>
                                      {!isViewMode && (
                                        <Pressable
                                          onPress={(e) => {
                                            e.stopPropagation();
                                            setMoods([]);
                                            setMoodPickerExpanded(false);
                                          }}
                                          hitSlop={8}
                                          accessibilityLabel="Clear moods"
                                        >
                                          <CloseIcon
                                            size={14}
                                            color={
                                              colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.6)'
                                                : '#666'
                                            }
                                          />
                                        </Pressable>
                                      )}
                                    </Pressable>
                                  ) : (
                                    // No mood set - show "+ Mood" button
                                    !isViewMode && (
                                      <Pressable
                                        onPress={() => setMoodPickerExpanded(true)}
                                        style={[
                                          styles.moodChip,
                                          {
                                            backgroundColor:
                                              colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.05)'
                                                : '#F5F5F5',
                                          },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="Add mood"
                                      >
                                        <Plus
                                          size={14}
                                          color={
                                            colorMode === 'dark' ? 'rgba(255,255,255,0.5)' : '#888'
                                          }
                                        />
                                        <Text
                                          style={[
                                            styles.moodChipText,
                                            {
                                              color:
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.5)'
                                                  : '#888',
                                            },
                                          ]}
                                        >
                                          Mood
                                        </Text>
                                      </Pressable>
                                    )
                                  )
                                ) : (
                                  // Expanded state - show all mood options in a single wrapped group
                                  <View style={styles.moodPickerExpanded}>
                                    <View style={styles.moodOptionsRow}>
                                      {ALL_MOODS.map((moodValue) => {
                                        const moodConfig = MOOD_CONFIG[moodValue];
                                        const isSelected = moods.includes(moodValue);
                                        return (
                                          <Pressable
                                            key={moodValue}
                                            onPress={() => {
                                              // Toggle mood selection
                                              if (isSelected) {
                                                setMoods(moods.filter((m) => m !== moodValue));
                                              } else {
                                                setMoods([...moods, moodValue]);
                                              }
                                            }}
                                            style={[
                                              styles.moodOptionChip,
                                              isSelected && styles.moodOptionChipActive,
                                              {
                                                backgroundColor: isSelected
                                                  ? colorMode === 'dark'
                                                    ? 'rgba(255,255,255,0.2)'
                                                    : '#D4E8DA'
                                                  : colorMode === 'dark'
                                                    ? 'rgba(255,255,255,0.08)'
                                                    : '#F0F4F2',
                                              },
                                            ]}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${isSelected ? 'Remove' : 'Add'} ${moodConfig.label} mood`}
                                          >
                                            <Text
                                              style={[
                                                styles.moodOptionText,
                                                {
                                                  color: colorMode === 'dark' ? '#fff' : '#2E5540',
                                                },
                                              ]}
                                            >
                                              {moodConfig.label}
                                            </Text>
                                          </Pressable>
                                        );
                                      })}
                                    </View>
                                    {/* Done button to collapse */}
                                    <Pressable
                                      onPress={() => setMoodPickerExpanded(false)}
                                      style={[
                                        styles.moodDoneButton,
                                        {
                                          backgroundColor:
                                            colorMode === 'dark'
                                              ? 'rgba(255,255,255,0.1)'
                                              : '#E8F0EB',
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.moodDoneButtonText,
                                          { color: colorMode === 'dark' ? '#fff' : '#2E5540' },
                                        ]}
                                      >
                                        Done
                                      </Text>
                                    </Pressable>
                                  </View>
                                )}
                              </View>
                            </Box>
                          ) : null}

                          <Box>
                            {/* Event Date for Notes */}
                            {baseType === 'log' && (
                              <Box style={{ marginBottom: 16 }}>
                                <View style={styles.dueAndLockRow}>
                                  <View style={styles.dueDateLeft}>
                                    <Pressable
                                      style={styles.dueDatePill}
                                      onPress={() => {
                                        setMoodPickerExpanded(false);
                                        if (state.log.target_date) {
                                          const parsed = getDateService().fromDateString(
                                            state.log.target_date,
                                          );
                                          if (parsed) {
                                            setSelectedDate(parsed);
                                          }
                                        } else {
                                          setSelectedDate(new Date());
                                        }
                                        setDateModalTarget('note_event');
                                        setShowDateModal(true);
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={
                                        state.log.target_date
                                          ? `Event date: ${formatDueDay(state.log.target_date)}`
                                          : 'Add event date'
                                      }
                                    >
                                      <Calendar
                                        size={16}
                                        color={
                                          state.log.target_date
                                            ? colorMode === 'dark'
                                              ? 'rgba(255,255,255,0.7)'
                                              : '#666666'
                                            : colorMode === 'dark'
                                              ? 'rgba(255,255,255,0.5)'
                                              : '#777777'
                                        }
                                        style={styles.dueDateIcon}
                                      />
                                      <Text
                                        style={[
                                          styles.dueDateText,
                                          !state.log.target_date && {
                                            color:
                                              colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.5)'
                                                : '#777777',
                                            fontWeight: '400',
                                          },
                                        ]}
                                      >
                                        {state.log.target_date
                                          ? formatDueDay(state.log.target_date)
                                          : 'Add event date'}
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>

                                {/* End Date for multi-day events - only shown for event subtype when start date is set */}
                                {effectiveLogSubtype === 'event' && state.log.target_date && (
                                  <View style={[styles.dueAndLockRow, { marginTop: 8 }]}>
                                    <View style={styles.dueDateLeft}>
                                      <Pressable
                                        style={styles.dueDatePill}
                                        onPress={() => {
                                          setMoodPickerExpanded(false);
                                          if (state.log.end_date) {
                                            const parsed = getDateService().fromDateString(
                                              state.log.end_date,
                                            );
                                            if (parsed) {
                                              setSelectedDate(parsed);
                                            }
                                          } else {
                                            // Default to day after start date
                                            const startDate = getDateService().fromDateString(
                                              state.log.target_date!,
                                            );
                                            if (startDate) {
                                              const nextDay = new Date(startDate);
                                              nextDay.setDate(nextDay.getDate() + 1);
                                              setSelectedDate(nextDay);
                                            } else {
                                              setSelectedDate(new Date());
                                            }
                                          }
                                          setDateModalTarget('note_end_date');
                                          setShowDateModal(true);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          state.log.end_date
                                            ? `End date: ${formatDueDay(state.log.end_date)}`
                                            : 'Add end date'
                                        }
                                      >
                                        <Calendar
                                          size={16}
                                          color={
                                            state.log.end_date
                                              ? colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.7)'
                                                : '#666666'
                                              : colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.5)'
                                                : '#777777'
                                          }
                                          style={styles.dueDateIcon}
                                        />
                                        <Text
                                          style={[
                                            styles.dueDateText,
                                            !state.log.end_date && {
                                              color:
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.5)'
                                                  : '#777777',
                                              fontWeight: '400',
                                            },
                                          ]}
                                        >
                                          {state.log.end_date
                                            ? `End: ${formatDueDay(state.log.end_date)}`
                                            : '+ End date (optional)'}
                                        </Text>
                                      </Pressable>
                                      {/* Clear end date button */}
                                      {state.log.end_date && (
                                        <Pressable
                                          onPress={() =>
                                            dispatch({ type: 'SET_LOG_END_DATE', date: null })
                                          }
                                          style={{ marginLeft: 8, padding: 4 }}
                                          accessibilityRole="button"
                                          accessibilityLabel="Clear end date"
                                        >
                                          <X
                                            size={14}
                                            color={
                                              colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.5)'
                                                : '#999'
                                            }
                                          />
                                        </Pressable>
                                      )}
                                    </View>
                                  </View>
                                )}
                              </Box>
                            )}

                            {baseType === 'todo' || baseType === 'habit' ? (
                              <Box style={{ marginBottom: 0 }}>
                                {/* Deadline (target_date) + Lock In row */}
                                <View style={styles.dueAndLockRow}>
                                  {/* Left side: Deadline (target_date) */}
                                  <View style={styles.dueDateLeft}>
                                    {baseType === 'todo' ? (
                                      <Pressable
                                        style={styles.dueDatePill}
                                        onPress={() => {
                                          setMoodPickerExpanded(false);
                                          if (state.todo.target_date) {
                                            const parsed = getDateService().fromDateString(
                                              state.todo.target_date,
                                            );
                                            if (parsed) {
                                              setSelectedDate(parsed);
                                            }
                                          } else {
                                            setSelectedDate(new Date());
                                          }
                                          setDateModalTarget('todo_deadline');
                                          setShowDateModal(true);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          state.todo.target_date
                                            ? `Deadline: ${formatDueDay(state.todo.target_date)}`
                                            : 'Add deadline'
                                        }
                                      >
                                        <Calendar
                                          size={16}
                                          color={
                                            state.todo.target_date
                                              ? colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.7)'
                                                : '#666666'
                                              : colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.5)'
                                                : '#777777'
                                          }
                                          style={styles.dueDateIcon}
                                        />
                                        <Text
                                          style={[
                                            styles.dueDateText,
                                            !state.todo.target_date && {
                                              color:
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.5)'
                                                  : '#777777',
                                              fontWeight: '400',
                                            },
                                          ]}
                                        >
                                          {state.todo.target_date
                                            ? formatDueDay(state.todo.target_date)
                                            : 'Add deadline'}
                                        </Text>
                                      </Pressable>
                                    ) : null}
                                  </View>

                                  {/* Right side: Lock In toggle (for todos only) */}
                                  {commitmentsOn && baseType === 'todo' ? (
                                    <View style={styles.lockInRight}>
                                      <Diamond
                                        size={14}
                                        color={
                                          colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'
                                        }
                                        style={styles.lockIcon}
                                      />
                                      <Text style={styles.lockLabel}>Lock In</Text>
                                      <Switch
                                        value={isLockedIn}
                                        onValueChange={async () => {
                                          if (!state.commitment) {
                                            const ok = await canEnableCommitment();
                                            if (!ok) {
                                              console.log('[Lock In] Limit reached (3)');
                                              return;
                                            }
                                          }
                                          pushUndoEntry('commitment', {
                                            commitment: state.commitment,
                                            commitmentNote: state.commitmentNote,
                                            commitmentStartedAt: state.commitmentStartedAt,
                                          });
                                          dispatch({ type: 'TOGGLE_COMMITMENT' });
                                          try {
                                            eventBus.emit('OverlayCommitmentToggled', {
                                              on: !state.commitment,
                                            });
                                          } catch (e) {
                                            // ignore telemetry errors
                                          }
                                        }}
                                        trackColor={{
                                          false: colorMode === 'dark' ? '#3e3e3e' : '#E0E0E0',
                                          true: lightTokens.colors.moss,
                                        }}
                                        thumbColor="#FFFFFF"
                                      />
                                    </View>
                                  ) : null}
                                </View>
                                {dueToastMessage ? (
                                  <View
                                    style={{
                                      marginLeft: tokenSpacing.sm,
                                      paddingHorizontal: 10,
                                      paddingVertical: 4,
                                      borderRadius: 999,
                                      backgroundColor:
                                        colorMode === 'dark'
                                          ? 'rgba(255,255,255,0.08)'
                                          : 'rgba(46,125,106,0.12)',
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

                                {/* Do date (scheduled_date) row for todos */}
                                {baseType === 'todo' && (
                                  <View style={styles.dueAndLockRow}>
                                    <View style={styles.dueDateLeft}>
                                      <Pressable
                                        style={styles.dueDatePill}
                                        onPress={() => {
                                          setMoodPickerExpanded(false);
                                          if (state.todo.scheduled_date) {
                                            const parsed = getDateService().fromDateString(
                                              state.todo.scheduled_date,
                                            );
                                            if (parsed) {
                                              setSelectedDate(parsed);
                                            }
                                          } else {
                                            setSelectedDate(new Date());
                                          }
                                          setDateModalTarget('todo_dodate');
                                          setShowDateModal(true);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          state.todo.scheduled_date
                                            ? `Do date: ${formatDueDay(state.todo.scheduled_date)}`
                                            : 'Add do date'
                                        }
                                      >
                                        <Clock
                                          size={16}
                                          color={
                                            state.todo.scheduled_date
                                              ? colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.7)'
                                                : '#666666'
                                              : colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.5)'
                                                : '#777777'
                                          }
                                          style={styles.dueDateIcon}
                                        />
                                        <Text
                                          style={[
                                            styles.dueDateText,
                                            !state.todo.scheduled_date && {
                                              color:
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.5)'
                                                  : '#777777',
                                              fontWeight: '400',
                                            },
                                          ]}
                                        >
                                          {state.todo.scheduled_date
                                            ? formatDueDay(state.todo.scheduled_date)
                                            : 'Add do date'}
                                        </Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                )}

                                {/* Time estimate row for todos */}
                                {baseType === 'todo' && (
                                  <View style={styles.dueAndLockRow}>
                                    <View style={styles.dueDateLeft}>
                                      <Pressable
                                        style={styles.dueDatePill}
                                        onPress={() => {
                                          setTimeEstimateValue(
                                            state.todo.time_estimate_minutes ?? 30,
                                          );
                                          setShowTimeEstimateModal(true);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          state.todo.time_estimate_minutes
                                            ? `Time estimate: ${state.todo.time_estimate_minutes} minutes`
                                            : 'Add time estimate'
                                        }
                                      >
                                        <Clock
                                          size={16}
                                          color={
                                            state.todo.time_estimate_minutes
                                              ? colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.7)'
                                                : '#666666'
                                              : colorMode === 'dark'
                                                ? 'rgba(255,255,255,0.5)'
                                                : '#777777'
                                          }
                                          style={styles.dueDateIcon}
                                        />
                                        <Text
                                          style={[
                                            styles.dueDateText,
                                            !state.todo.time_estimate_minutes && {
                                              color:
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.5)'
                                                  : '#777777',
                                              fontWeight: '400',
                                            },
                                          ]}
                                        >
                                          {state.todo.time_estimate_minutes
                                            ? formatTimeEstimate(state.todo.time_estimate_minutes)
                                            : 'Add time estimate'}
                                        </Text>
                                      </Pressable>

                                      {/* Time Window Picker */}
                                      <Pressable
                                        style={[styles.dueDatePill, { marginLeft: 8 }]}
                                        onPress={() => setShowTimeWindowModal(true)}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          state.todo.time_window
                                            ? `Time window: ${state.todo.time_window}`
                                            : 'Set time window'
                                        }
                                      >
                                        <Text
                                          style={[
                                            styles.dueDateText,
                                            !state.todo.time_window && {
                                              color:
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.5)'
                                                  : '#777777',
                                              fontWeight: '400',
                                            },
                                          ]}
                                        >
                                          {state.todo.time_window
                                            ? TIME_WINDOW_OPTIONS.find(
                                                (o) => o.value === state.todo.time_window,
                                              )?.label || state.todo.time_window
                                            : 'Any time'}
                                        </Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                )}
                              </Box>
                            ) : null}

                            {/* LinkedEventPicker for todos - show when space has events */}
                            {baseType === 'todo' && showLinkedEventPicker && effectiveSpaceId && (
                              <Box mt={3} px={0}>
                                <LinkedEventPicker
                                  spaceId={effectiveSpaceId}
                                  currentEventId={state.linkedEventId}
                                  onChange={handleLinkedEventChange}
                                />
                              </Box>
                            )}

                            {/* Frequency row for habits */}
                            {baseType === 'habit' ? (
                              <Box mt={3} px={0}>
                                {/* Optional frequency label for break habits */}
                                {isBreakHabit && (
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      color:
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.5)' : '#888888',
                                      marginBottom: 4,
                                      marginLeft: 4,
                                    }}
                                  >
                                    Check-in frequency
                                  </Text>
                                )}

                                {/* Schedule Summary + Lock In row */}
                                <View style={styles.dueAndLockRow}>
                                  {/* Left side: Schedule summary pill */}
                                  <View style={styles.dueDateLeft}>
                                    <Pressable
                                      style={({ pressed }) => ({
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        paddingVertical: 10,
                                        paddingHorizontal: 14,
                                        paddingRight: 10,
                                        backgroundColor: pressed
                                          ? 'rgba(0,0,0,0.06)'
                                          : 'rgba(0,0,0,0.03)',
                                        borderRadius: 10,
                                        marginRight: 12,
                                        flex: 1,
                                      })}
                                      onPress={openScheduleModal}
                                      accessibilityRole="button"
                                      accessibilityLabel="Edit schedule"
                                    >
                                      <Calendar
                                        size={16}
                                        color={
                                          colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#888888'
                                        }
                                        style={{ marginRight: 10 }}
                                      />

                                      <View style={{ flex: 1 }}>
                                        <Text
                                          style={{
                                            fontSize: 14,
                                            fontWeight: '500',
                                            color: '#333333',
                                          }}
                                        >
                                          Schedule
                                        </Text>
                                        <Text
                                          style={{ fontSize: 12, color: '#888888', marginTop: 2 }}
                                        >
                                          {[
                                            getFrequencyLabel(
                                              jsonToFrequency(state.habit.frequency_json),
                                            ),
                                            state.habit.time_estimate_minutes &&
                                              `~${state.habit.time_estimate_minutes}m`,
                                            state.habit.start_date &&
                                              format(parseISO(state.habit.start_date), 'MMM d'),
                                          ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </Text>
                                      </View>

                                      <ChevronRight
                                        size={16}
                                        color={
                                          colorMode === 'dark' ? 'rgba(255,255,255,0.4)' : '#AAAAAA'
                                        }
                                      />
                                    </Pressable>
                                  </View>

                                  {/* Right side: Lock In toggle */}
                                  {commitmentsOn ? (
                                    <View style={styles.lockInRight}>
                                      <Diamond
                                        size={14}
                                        color={
                                          colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'
                                        }
                                        style={styles.lockIcon}
                                      />
                                      <Text style={styles.lockLabel}>Lock In</Text>
                                      <Switch
                                        value={isLockedIn}
                                        onValueChange={async () => {
                                          if (!state.commitment) {
                                            const ok = await canEnableCommitment();
                                            if (!ok) {
                                              console.log('[Lock In] Limit reached (3)');
                                              return;
                                            }
                                          }
                                          pushUndoEntry('commitment', {
                                            commitment: state.commitment,
                                            commitmentNote: state.commitmentNote,
                                            commitmentStartedAt: state.commitmentStartedAt,
                                          });
                                          dispatch({ type: 'TOGGLE_COMMITMENT' });
                                          try {
                                            eventBus.emit('OverlayCommitmentToggled', {
                                              on: !state.commitment,
                                            });
                                          } catch (e) {
                                            // ignore telemetry errors
                                          }
                                        }}
                                        trackColor={{
                                          false: colorMode === 'dark' ? '#3e3e3e' : '#E0E0E0',
                                          true: lightTokens.colors.moss,
                                        }}
                                        thumbColor="#FFFFFF"
                                      />
                                    </View>
                                  ) : null}
                                </View>
                              </Box>
                            ) : null}

                            {/* LinkedEventPicker for habits - show when space has events */}
                            {baseType === 'habit' && showLinkedEventPicker && effectiveSpaceId && (
                              <Box mt={3} px={0}>
                                <LinkedEventPicker
                                  spaceId={effectiveSpaceId}
                                  currentEventId={state.linkedEventId}
                                  onChange={handleLinkedEventChange}
                                />
                              </Box>
                            )}

                            <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 12 }}>
                              <Pressable
                                onPress={handleToggleDetails}
                                hitSlop={8}
                                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                              >
                                <Text
                                  style={{
                                    color: 'rgba(46, 85, 64, 0.75)',
                                    fontWeight: '500',
                                    fontSize: 14,
                                  }}
                                >
                                  {state.expanded ? 'Hide details' : 'Show details'}
                                </Text>
                              </Pressable>
                            </View>
                            {state.expanded ? (
                              <Reanimated.View style={[detailsStyle, { marginTop: 0 }]}>
                                <Box pb={2}>
                                  {/* To-Do Details */}
                                  {baseType === 'todo' ? (
                                    <View>
                                      {/* 1) Reminders row */}
                                      <Pressable
                                        onPress={() => {
                                          if (!isViewMode) setShowRemindersModal(true);
                                        }}
                                        disabled={isViewMode}
                                        style={({ pressed }) => [
                                          styles.detailsRow,
                                          pressed && styles.detailsRowPressed,
                                        ]}
                                      >
                                        <View style={styles.detailsRowLeft}>
                                          <View style={styles.detailsRowIcon}>
                                            <Bell
                                              size={18}
                                              color={
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.7)'
                                                  : '#666'
                                              }
                                            />
                                          </View>
                                          <Text style={styles.detailsRowLabel}>Reminders</Text>
                                        </View>
                                        <Text style={styles.detailsRowValue}>
                                          {formatReminderSummary(reminders)}
                                        </Text>
                                      </Pressable>

                                      {/* 2) Add to Space row */}
                                      <Pressable
                                        onPress={() => {
                                          if (!isViewMode) setShowSpaceModal(true);
                                        }}
                                        disabled={isViewMode}
                                        style={({ pressed }) => [
                                          styles.detailsRow,
                                          pressed && !isViewMode && styles.detailsRowPressed,
                                        ]}
                                      >
                                        <View style={styles.detailsRowLeft}>
                                          <View style={styles.detailsRowIcon}>
                                            <Folder
                                              size={18}
                                              color={
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.7)'
                                                  : '#666'
                                              }
                                            />
                                          </View>
                                          <Text style={styles.detailsRowLabel}>Add to Space</Text>
                                        </View>
                                        {state.spaceId ? (
                                          <Text style={styles.detailsRowValue}>
                                            {spaces.find((s) => s.id === state.spaceId)?.name ?? ''}
                                          </Text>
                                        ) : null}
                                      </Pressable>

                                      {/* 3) Delete To-Do row (only in edit mode) */}
                                      {mode === 'edit' && (initialEntity as any)?.id ? (
                                        <Pressable
                                          onPress={() => {
                                            Alert.alert(
                                              'Delete this to-do?',
                                              "This can't be undone.",
                                              [
                                                {
                                                  text: 'Cancel',
                                                  style: 'cancel',
                                                },
                                                {
                                                  text: 'Delete',
                                                  style: 'destructive',
                                                  onPress: async () => {
                                                    try {
                                                      const itemId = (initialEntity as any).id;
                                                      const itemSpaceId =
                                                        (initialEntity as any).space_id ??
                                                        state.spaceId ??
                                                        initialSpaceId;

                                                      // 1. Delete from store FIRST (store mutation)
                                                      await deleteTodo(itemId);
                                                      if (__DEV__) {
                                                        console.log(
                                                          '[UnifiedOverlayV2] Item deleted from store:',
                                                          itemId,
                                                        );
                                                      }

                                                      // 2. THEN emit event so reload gets fresh data
                                                      if (__DEV__) {
                                                        console.log(
                                                          '[UnifiedOverlayV2] Emitting entity:deleted',
                                                          {
                                                            id: itemId,
                                                            type: 'todo',
                                                            spaceId: itemSpaceId,
                                                          },
                                                        );
                                                      }
                                                      eventBus.emit('entity:deleted', {
                                                        id: itemId,
                                                        type: 'todo',
                                                        spaceId: itemSpaceId,
                                                      });

                                                      // 3. Close overlay last
                                                      onClose();
                                                    } catch (err) {
                                                      console.error(
                                                        '[UnifiedOverlayV2] Delete failed:',
                                                        err,
                                                      );
                                                      Alert.alert(
                                                        'Error',
                                                        'Failed to delete to-do. Please try again.',
                                                      );
                                                    }
                                                  },
                                                },
                                              ],
                                            );
                                          }}
                                          style={({ pressed }) => [
                                            styles.detailsRow,
                                            pressed && { opacity: 0.7 },
                                          ]}
                                        >
                                          <View style={styles.detailsRowLeft}>
                                            <View style={styles.detailsRowIcon}>
                                              <Trash2 size={18} color="#D9534F" />
                                            </View>
                                            <Text
                                              style={[styles.detailsRowLabel, styles.deleteText]}
                                            >
                                              Delete to-do
                                            </Text>
                                          </View>
                                        </Pressable>
                                      ) : null}
                                    </View>
                                  ) : null}

                                  {/* Habit Details */}
                                  {baseType === 'habit' ? (
                                    <View>
                                      {/* 1) Reminders row */}
                                      <Pressable
                                        onPress={() => {
                                          if (!isViewMode) setShowRemindersModal(true);
                                        }}
                                        disabled={isViewMode}
                                        style={({ pressed }) => [
                                          styles.detailsRow,
                                          pressed && !isViewMode && styles.detailsRowPressed,
                                        ]}
                                      >
                                        <View style={styles.detailsRowLeft}>
                                          <View style={styles.detailsRowIcon}>
                                            <Bell
                                              size={18}
                                              color={
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.7)'
                                                  : '#666'
                                              }
                                            />
                                          </View>
                                          <Text style={styles.detailsRowLabel}>Reminders</Text>
                                        </View>
                                        <Text style={styles.detailsRowValue}>
                                          {formatReminderSummary(reminders)}
                                        </Text>
                                      </Pressable>

                                      {/* 2) Add to Space row */}
                                      <Pressable
                                        onPress={() => {
                                          if (!isViewMode) setShowSpaceModal(true);
                                        }}
                                        disabled={isViewMode}
                                        style={({ pressed }) => [
                                          styles.detailsRow,
                                          { marginTop: 0 },
                                          pressed && !isViewMode && styles.detailsRowPressed,
                                        ]}
                                      >
                                        <View style={styles.detailsRowLeft}>
                                          <View style={styles.detailsRowIcon}>
                                            <Folder
                                              size={18}
                                              color={
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.7)'
                                                  : '#666'
                                              }
                                            />
                                          </View>
                                          <Text style={styles.detailsRowLabel}>Add to Space</Text>
                                        </View>
                                        {state.spaceId ? (
                                          <Text style={styles.detailsRowValue}>
                                            {spaces.find((s) => s.id === state.spaceId)?.name ?? ''}
                                          </Text>
                                        ) : null}
                                      </Pressable>

                                      {/* 3) Delete Habit row (only in edit mode) */}
                                      {mode === 'edit' && (initialEntity as any)?.id ? (
                                        <Pressable
                                          onPress={() => {
                                            Alert.alert(
                                              'Delete this habit?',
                                              "This can't be undone.",
                                              [
                                                {
                                                  text: 'Cancel',
                                                  style: 'cancel',
                                                },
                                                {
                                                  text: 'Delete',
                                                  style: 'destructive',
                                                  onPress: async () => {
                                                    try {
                                                      const itemId = (initialEntity as any).id;
                                                      const itemSpaceId =
                                                        (initialEntity as any).space_id ??
                                                        state.spaceId ??
                                                        initialSpaceId;

                                                      // 1. Delete from store FIRST (store mutation)
                                                      await deleteHabit(itemId);
                                                      if (__DEV__) {
                                                        console.log(
                                                          '[UnifiedOverlayV2] Item deleted from store:',
                                                          itemId,
                                                        );
                                                      }

                                                      // 2. THEN emit event so reload gets fresh data
                                                      if (__DEV__) {
                                                        console.log(
                                                          '[UnifiedOverlayV2] Emitting entity:deleted',
                                                          {
                                                            id: itemId,
                                                            type: 'habit',
                                                            spaceId: itemSpaceId,
                                                          },
                                                        );
                                                      }
                                                      eventBus.emit('entity:deleted', {
                                                        id: itemId,
                                                        type: 'habit',
                                                        spaceId: itemSpaceId,
                                                      });

                                                      // 3. Close overlay last
                                                      onClose();
                                                    } catch (err) {
                                                      console.error(
                                                        '[UnifiedOverlayV2] Delete failed:',
                                                        err,
                                                      );
                                                      Alert.alert(
                                                        'Error',
                                                        'Failed to delete habit. Please try again.',
                                                      );
                                                    }
                                                  },
                                                },
                                              ],
                                            );
                                          }}
                                          style={({ pressed }) => [
                                            styles.detailsRow,
                                            pressed && { opacity: 0.7 },
                                          ]}
                                        >
                                          <View style={styles.detailsRowLeft}>
                                            <View style={styles.detailsRowIcon}>
                                              <Trash2 size={18} color="#D9534F" />
                                            </View>
                                            <Text
                                              style={[styles.detailsRowLabel, styles.deleteText]}
                                            >
                                              Delete habit
                                            </Text>
                                          </View>
                                        </Pressable>
                                      ) : null}
                                    </View>
                                  ) : null}

                                  {/* Log Details */}
                                  {baseType === 'log' ? (
                                    <View>
                                      {/* 1) Reminders row */}
                                      <Pressable
                                        onPress={() => {
                                          if (!isViewMode) setShowRemindersModal(true);
                                        }}
                                        disabled={isViewMode}
                                        style={({ pressed }) => [
                                          styles.detailsRow,
                                          pressed && !isViewMode && styles.detailsRowPressed,
                                        ]}
                                      >
                                        <View style={styles.detailsRowLeft}>
                                          <View style={styles.detailsRowIcon}>
                                            <Bell
                                              size={18}
                                              color={
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.7)'
                                                  : '#666'
                                              }
                                            />
                                          </View>
                                          <Text style={styles.detailsRowLabel}>Reminders</Text>
                                        </View>
                                        <Text style={styles.detailsRowValue}>
                                          {formatReminderSummary(reminders)}
                                        </Text>
                                      </Pressable>

                                      {/* 2) Add to Space row */}
                                      <Pressable
                                        onPress={() => {
                                          if (!isViewMode) setShowSpaceModal(true);
                                        }}
                                        disabled={isViewMode}
                                        style={({ pressed }) => [
                                          styles.detailsRow,
                                          { marginTop: 0 },
                                          pressed && !isViewMode && styles.detailsRowPressed,
                                        ]}
                                      >
                                        <View style={styles.detailsRowLeft}>
                                          <View style={styles.detailsRowIcon}>
                                            <Folder
                                              size={18}
                                              color={
                                                colorMode === 'dark'
                                                  ? 'rgba(255,255,255,0.7)'
                                                  : '#666'
                                              }
                                            />
                                          </View>
                                          <Text style={styles.detailsRowLabel}>Add to Space</Text>
                                        </View>
                                        <Text style={styles.detailsRowValue}>
                                          {state.spaceId
                                            ? (spaces.find((s) => s.id === state.spaceId)?.name ??
                                              'Unassigned')
                                            : 'Unassigned'}
                                        </Text>
                                      </Pressable>

                                      {/* 3) Private toggle row (Phase L9: Only for journal logs) */}
                                      {showLogPrivateToggle ? (
                                        <View style={[styles.detailsRow, { marginTop: 0 }]}>
                                          <View style={styles.detailsRowLeft}>
                                            <View style={styles.detailsRowIcon}>
                                              <Lock
                                                size={18}
                                                color={
                                                  colorMode === 'dark'
                                                    ? 'rgba(255,255,255,0.7)'
                                                    : '#666'
                                                }
                                              />
                                            </View>
                                            <Text style={styles.detailsRowLabel}>Private</Text>
                                          </View>
                                          <Switch
                                            value={state.logIsPrivate}
                                            onValueChange={() =>
                                              dispatch({
                                                type: 'SET_LOG_IS_PRIVATE',
                                                value: !state.logIsPrivate,
                                              })
                                            }
                                            disabled={isViewMode}
                                            trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                                            thumbColor="#FFFFFF"
                                          />
                                        </View>
                                      ) : null}

                                      {/* Idea Conversion Section (hidden in view mode) */}
                                      {effectiveLogSubtype === 'idea' && mode === 'edit' ? (
                                        <View style={{ marginTop: 16 }}>
                                          <Text
                                            style={{
                                              fontSize: 13,
                                              color: '#888',
                                              marginBottom: 8,
                                            }}
                                          >
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

                                                // Close current overlay then open create todo overlay
                                                onClose();
                                                setTimeout(() => {
                                                  globalOverlay.openCreate({
                                                    type: 'todo',
                                                    conversionMeta: {
                                                      origin: 'idea_conversion',
                                                      initialTitle: ideaTitle,
                                                      initialNote: ideaBody,
                                                      initialTags: ideaTags,
                                                      initialListItems: ideaIsList
                                                        ? ideaListItems
                                                        : undefined,
                                                      initialIsList: ideaIsList,
                                                    },
                                                  });
                                                }, 100);

                                                // Archive the original idea
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
                                              <Text
                                                style={{
                                                  fontSize: 15,
                                                  fontWeight: '500',
                                                  color: '#333',
                                                }}
                                              >
                                                To-Do
                                              </Text>
                                            </Pressable>
                                            <Pressable
                                              onPress={() => {
                                                const ideaTitle = state.log.title || '';
                                                const ideaBody = state.log.body || '';
                                                const ideaTags = state.tags || [];
                                                const ideaListItems = state.list?.items;
                                                const ideaIsList = !!state.list?.items?.length;
                                                const ideaId = (initialEntity as any)?.id;

                                                // Close current overlay then open create habit overlay
                                                onClose();
                                                setTimeout(() => {
                                                  globalOverlay.openCreate({
                                                    type: 'habit',
                                                    conversionMeta: {
                                                      origin: 'idea_conversion',
                                                      initialTitle: ideaTitle,
                                                      initialNote: ideaBody,
                                                      initialTags: ideaTags,
                                                      initialListItems: ideaIsList
                                                        ? ideaListItems
                                                        : undefined,
                                                      initialIsList: ideaIsList,
                                                    },
                                                  });
                                                }, 100);

                                                // Archive the original idea
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
                                              <Text
                                                style={{
                                                  fontSize: 15,
                                                  fontWeight: '500',
                                                  color: '#333',
                                                }}
                                              >
                                                Habit
                                              </Text>
                                            </Pressable>
                                          </View>
                                        </View>
                                      ) : null}

                                      {/* 4) Delete log row (only in edit mode) */}
                                      {mode === 'edit' && (initialEntity as any)?.id ? (
                                        <Pressable
                                          onPress={() => {
                                            Alert.alert(
                                              'Delete this log?',
                                              "This can't be undone.",
                                              [
                                                {
                                                  text: 'Cancel',
                                                  style: 'cancel',
                                                },
                                                {
                                                  text: 'Delete',
                                                  style: 'destructive',
                                                  onPress: async () => {
                                                    try {
                                                      const itemId = (initialEntity as any).id;
                                                      const itemSpaceId =
                                                        (initialEntity as any).space_id ??
                                                        state.spaceId ??
                                                        initialSpaceId;

                                                      // 1. Delete from store FIRST (store mutation)
                                                      await deleteNote(itemId);
                                                      if (__DEV__) {
                                                        console.log(
                                                          '[UnifiedOverlayV2] Item deleted from store:',
                                                          itemId,
                                                        );
                                                      }

                                                      // 2. THEN emit event so reload gets fresh data
                                                      if (__DEV__) {
                                                        console.log(
                                                          '[UnifiedOverlayV2] Emitting entity:deleted',
                                                          {
                                                            id: itemId,
                                                            type: 'note',
                                                            spaceId: itemSpaceId,
                                                          },
                                                        );
                                                      }
                                                      eventBus.emit('entity:deleted', {
                                                        id: itemId,
                                                        type: 'note',
                                                        spaceId: itemSpaceId,
                                                      });

                                                      // 3. Close overlay last
                                                      onClose();
                                                    } catch (err) {
                                                      console.error(
                                                        '[UnifiedOverlayV2] Delete log failed:',
                                                        err,
                                                      );
                                                      Alert.alert(
                                                        'Error',
                                                        'Failed to delete log. Please try again.',
                                                      );
                                                    }
                                                  },
                                                },
                                              ],
                                            );
                                          }}
                                          style={({ pressed }) => [
                                            styles.detailsRow,
                                            pressed && { opacity: 0.7 },
                                          ]}
                                        >
                                          <View style={styles.detailsRowLeft}>
                                            <View style={styles.detailsRowIcon}>
                                              <Trash2 size={18} color="#D9534F" />
                                            </View>
                                            <Text
                                              style={[styles.detailsRowLabel, styles.deleteText]}
                                            >
                                              Delete log
                                            </Text>
                                          </View>
                                        </Pressable>
                                      ) : null}
                                    </View>
                                  ) : null}
                                </Box>
                              </Reanimated.View>
                            ) : null}

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
                                      handleTodoDueChange(new Date(), { label: 'Today' });
                                    } else if (d === '__token:tomorrow') {
                                      handleTodoDueChange(addDays(new Date(), 1), {
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
                                        setSelectedDate(new Date());
                                      }
                                      setDateModalTarget('todo_deadline');
                                      setShowDateModal(true);
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
                          </Box>
                        </ScrollView>
                      </Reanimated.View>
                    )}
                  </View>

                  <Modal visible={showDateModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => {
                        // Close modal when tapping outside
                        setShowDateModal(false);
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
                                  const today = new Date();
                                  setSelectedDate(today);
                                  setClearDateFlag(false);
                                  if (dateModalTarget === 'reminder') {
                                    dispatch({ type: 'SET_REMINDER', when: today.toISOString() });
                                    setShowDateModal(false);
                                    setDateModalTarget(null);
                                  }
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 14,
                                  paddingVertical: 7,
                                  borderRadius: 18,
                                  backgroundColor: pressed
                                    ? '#F5F5F5'
                                    : clearDateFlag === false &&
                                        selectedDate.toDateString() === new Date().toDateString()
                                      ? '#F0F4F1'
                                      : '#FAFAFA',
                                  borderWidth: 1,
                                  borderColor:
                                    clearDateFlag === false &&
                                    selectedDate.toDateString() === new Date().toDateString()
                                      ? '#2E5540'
                                      : '#E0E0E0',
                                })}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '500', color: '#222222' }}>
                                  Today
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  const tomorrow = addDays(new Date(), 1);
                                  setSelectedDate(tomorrow);
                                  setClearDateFlag(false);
                                  if (dateModalTarget === 'reminder') {
                                    dispatch({
                                      type: 'SET_REMINDER',
                                      when: tomorrow.toISOString(),
                                    });
                                    setShowDateModal(false);
                                    setDateModalTarget(null);
                                  }
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 14,
                                  paddingVertical: 7,
                                  borderRadius: 18,
                                  backgroundColor: pressed
                                    ? '#F5F5F5'
                                    : clearDateFlag === false &&
                                        selectedDate.toDateString() ===
                                          addDays(new Date(), 1).toDateString()
                                      ? '#F0F4F1'
                                      : '#FAFAFA',
                                  borderWidth: 1,
                                  borderColor:
                                    clearDateFlag === false &&
                                    selectedDate.toDateString() ===
                                      addDays(new Date(), 1).toDateString()
                                      ? '#2E5540'
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
                                    dispatch({ type: 'SET_REMINDER', when: null });
                                    setShowDateModal(false);
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
                                  borderColor: clearDateFlag ? '#2E5540' : '#E0E0E0',
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
                                    setSelectedDate(date);
                                    setClearDateFlag(false);
                                  }
                                }}
                                themeVariant={colorMode === 'dark' ? 'dark' : 'light'}
                                accentColor="#2E5540"
                              />
                            </Box>
                          )}

                          {/* Add time toggle */}
                          {!clearDateFlag && (
                            <Box mt={3} mb={4}>
                              <Box
                                row
                                style={{ alignItems: 'center', justifyContent: 'space-between' }}
                              >
                                <Text
                                  style={{
                                    fontSize: 15,
                                    fontWeight: '500',
                                    color: '#555555',
                                  }}
                                >
                                  Add time?
                                </Text>
                                <Switch
                                  value={showTimePicker}
                                  onValueChange={(value) => {
                                    setShowTimePicker(value);
                                    if (value) {
                                      // Default to 9 AM if no preset selected
                                      if (!selectedTimePreset) {
                                        setSelectedTimePreset(PRESET_TIMES[0].key);
                                        const defaultTime = setHours(setMinutes(new Date(), 0), 9);
                                        setSelectedTime(defaultTime);
                                      }
                                    } else {
                                      // Reset when toggling off
                                      setSelectedTimePreset(null);
                                      setShowCustomTimePicker(false);
                                    }
                                  }}
                                  trackColor={{
                                    false: '#E0E0E0',
                                    true: '#2E5540',
                                  }}
                                  thumbColor="#FFFFFF"
                                />
                              </Box>

                              {/* Preset Time Chips */}
                              {showTimePicker && (
                                <Box mt={3} style={{ marginBottom: 0, paddingBottom: 4 }}>
                                  <Box
                                    row
                                    style={{
                                      flexWrap: 'wrap',
                                      rowGap: 8,
                                      columnGap: 8,
                                    }}
                                  >
                                    {PRESET_TIMES.map((preset) => (
                                      <Pressable
                                        key={preset.key}
                                        onPress={() => {
                                          setSelectedTimePreset(preset.key);
                                          setShowCustomTimePicker(false);
                                          // Update selectedTime for use in Set button
                                          const newTime = setHours(
                                            setMinutes(new Date(), preset.minute),
                                            preset.hour,
                                          );
                                          setSelectedTime(newTime);
                                        }}
                                        style={({ pressed }) => ({
                                          paddingHorizontal: 14,
                                          paddingVertical: 8,
                                          borderRadius: 18,
                                          backgroundColor: pressed
                                            ? '#F5F5F5'
                                            : selectedTimePreset === preset.key
                                              ? '#F0F4F1'
                                              : '#FAFAFA',
                                          borderWidth: 1,
                                          borderColor:
                                            selectedTimePreset === preset.key
                                              ? '#2E5540'
                                              : '#E0E0E0',
                                        })}
                                      >
                                        <Text
                                          style={{
                                            fontSize: 13,
                                            fontWeight: '500',
                                            color:
                                              selectedTimePreset === preset.key
                                                ? '#2E5540'
                                                : '#222222',
                                          }}
                                        >
                                          {preset.label}
                                        </Text>
                                      </Pressable>
                                    ))}
                                    {/* Custom time chip */}
                                    <Pressable
                                      onPress={() => {
                                        setSelectedTimePreset('custom');
                                        setShowCustomTimePicker(true);
                                      }}
                                      style={({ pressed }) => ({
                                        paddingHorizontal: 14,
                                        paddingVertical: 8,
                                        borderRadius: 18,
                                        backgroundColor: pressed
                                          ? '#F5F5F5'
                                          : selectedTimePreset === 'custom'
                                            ? '#F0F4F1'
                                            : '#FAFAFA',
                                        borderWidth: 1,
                                        borderColor:
                                          selectedTimePreset === 'custom' ? '#2E5540' : '#E0E0E0',
                                      })}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 13,
                                          fontWeight: '500',
                                          color:
                                            selectedTimePreset === 'custom' ? '#2E5540' : '#222222',
                                        }}
                                      >
                                        {selectedTimePreset === 'custom'
                                          ? `Custom (${format(selectedTime, 'h:mm a')})`
                                          : 'Custom…'}
                                      </Text>
                                    </Pressable>
                                  </Box>

                                  {/* Custom Time Picker - shown inline when Custom is selected */}
                                  {showCustomTimePicker && (
                                    <Box mt={3}>
                                      <DateTimePicker
                                        value={selectedTime}
                                        mode="time"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(event, time) => {
                                          // On Android, event.type === 'dismissed' means the user cancelled
                                          if (
                                            Platform.OS === 'android' &&
                                            event.type === 'dismissed'
                                          ) {
                                            setShowCustomTimePicker(false);
                                            return;
                                          }

                                          if (time) {
                                            setSelectedTime(time);
                                            if (Platform.OS === 'android') {
                                              // Close picker after selection on Android
                                              setShowCustomTimePicker(false);
                                            }
                                          }
                                        }}
                                        themeVariant={colorMode === 'dark' ? 'dark' : 'light'}
                                        accentColor="#2E5540"
                                      />
                                    </Box>
                                  )}
                                </Box>
                              )}
                            </Box>
                          )}

                          {/* Action buttons - now inside ScrollView */}
                          <Box row style={{ gap: 12, marginTop: 12 }}>
                            <Button
                              variant="ghost"
                              onPress={() => {
                                setShowDateModal(false);
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
                                  let finalDate: Date | null = null;

                                  if (!clearDateFlag) {
                                    // Combine date and optional time
                                    finalDate = selectedDate;

                                    if (showTimePicker && selectedTime) {
                                      // Merge the selected time into the selected date
                                      finalDate = setHours(
                                        setMinutes(selectedDate, selectedTime.getMinutes()),
                                        selectedTime.getHours(),
                                      );
                                    } else {
                                      // No time selected, use the date as-is (all-day)
                                      finalDate = selectedDate;
                                    }
                                  }

                                  // Apply the change based on target type
                                  if (dateModalTarget === 'reminder') {
                                    // Reminders still use ISO timestamps
                                    dispatch({
                                      type: 'SET_REMINDER',
                                      when: finalDate?.toISOString() ?? null,
                                    });
                                  } else if (dateModalTarget === 'todo_deadline') {
                                    // Deadline (target_date) - when it's due
                                    if (finalDate) {
                                      const dateStr = getDateService().toDateString(finalDate);
                                      dispatch({ type: 'SET_TODO_TARGET_DATE', date: dateStr });
                                      showDueToast(
                                        `Deadline set for ${format(finalDate, 'MMM d')}`,
                                      );
                                    } else {
                                      dispatch({ type: 'SET_TODO_TARGET_DATE', date: null });
                                      showDueToast('Deadline cleared');
                                    }
                                  } else if (dateModalTarget === 'todo_dodate') {
                                    // Do date (scheduled_date) - when user will work on it
                                    if (finalDate) {
                                      const dateStr = getDateService().toDateString(finalDate);
                                      dispatch({ type: 'SET_TODO_SCHEDULED_DATE', date: dateStr });
                                      // Also update legacy due_day for backwards compatibility
                                      dispatch({
                                        type: 'SET_TODO_DUE',
                                        due_at: null,
                                        due_day: dateStr,
                                        due_time: null,
                                      });
                                      showDueToast(`Do date set for ${format(finalDate, 'MMM d')}`);
                                    } else {
                                      dispatch({ type: 'SET_TODO_SCHEDULED_DATE', date: null });
                                      dispatch({
                                        type: 'SET_TODO_DUE',
                                        due_at: null,
                                        due_day: null,
                                        due_time: null,
                                      });
                                      showDueToast('Do date cleared');
                                    }
                                  } else if (dateModalTarget === 'note_event') {
                                    // Event date for notes (target_date)
                                    if (finalDate) {
                                      const dateStr = getDateService().toDateString(finalDate);
                                      dispatch({ type: 'SET_LOG_TARGET_DATE', date: dateStr });
                                      showDueToast(
                                        `Event date set for ${format(finalDate, 'MMM d')}`,
                                      );
                                    } else {
                                      dispatch({ type: 'SET_LOG_TARGET_DATE', date: null });
                                      showDueToast('Event date cleared');
                                    }
                                  } else if (dateModalTarget === 'note_end_date') {
                                    // End date for multi-day events
                                    if (finalDate) {
                                      const dateStr = getDateService().toDateString(finalDate);
                                      dispatch({ type: 'SET_LOG_END_DATE', date: dateStr });
                                      showDueToast(
                                        `End date set for ${format(finalDate, 'MMM d')}`,
                                      );
                                    } else {
                                      dispatch({ type: 'SET_LOG_END_DATE', date: null });
                                      showDueToast('End date cleared');
                                    }
                                  }

                                  // Reset and close
                                  setShowDateModal(false);
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

                  {/* Time Estimate Modal - Hybrid Grid + Stepper */}
                  <Modal visible={showTimeEstimateModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => setShowTimeEstimateModal(false)}
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
                                setTimeEstimateValue((prev) =>
                                  Math.max(TIME_ESTIMATE_MIN, prev - TIME_ESTIMATE_STEP),
                                )
                              }
                              disabled={timeEstimateValue <= TIME_ESTIMATE_MIN}
                            >
                              <Minus
                                size={20}
                                color={
                                  timeEstimateValue <= TIME_ESTIMATE_MIN ? '#CCCCCC' : '#2E5540'
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
                                    ? '#2E5540'
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
                                setTimeEstimateValue((prev) =>
                                  Math.min(TIME_ESTIMATE_MAX, prev + TIME_ESTIMATE_STEP),
                                )
                              }
                              disabled={timeEstimateValue >= TIME_ESTIMATE_MAX}
                            >
                              <Plus
                                size={20}
                                color={
                                  timeEstimateValue >= TIME_ESTIMATE_MAX ? '#CCCCCC' : '#2E5540'
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
                                dispatch({ type: 'SET_HABIT_TIME_ESTIMATE', minutes: null });
                              } else {
                                dispatch({ type: 'SET_TODO_TIME_ESTIMATE', minutes: null });
                              }
                              setShowTimeEstimateModal(false);
                            }}
                          >
                            <Text style={{ fontSize: 14, color: '#666666' }}>Clear</Text>
                          </Pressable>

                          <Pressable
                            style={{
                              backgroundColor: '#2E5540',
                              paddingVertical: 12,
                              paddingHorizontal: 24,
                              borderRadius: 8,
                            }}
                            onPress={() => {
                              if (baseType === 'habit') {
                                dispatch({
                                  type: 'SET_HABIT_TIME_ESTIMATE',
                                  minutes: timeEstimateValue,
                                });
                              } else {
                                dispatch({
                                  type: 'SET_TODO_TIME_ESTIMATE',
                                  minutes: timeEstimateValue,
                                });
                              }
                              setShowTimeEstimateModal(false);
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
                  <Modal visible={showTimeWindowModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => setShowTimeWindowModal(false)}
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
                                    dispatch({
                                      type: 'SET_TODO_TIME_WINDOW',
                                      window: option.value,
                                    });
                                  } else {
                                    dispatch({
                                      type: 'SET_HABIT_TIME_WINDOW',
                                      window: option.value,
                                    });
                                  }
                                  setShowTimeWindowModal(false);
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

                  {/* Unified Schedule Modal for Habits */}
                  <Modal
                    visible={showScheduleModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowScheduleModal(false)}
                  >
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => setShowScheduleModal(false)}
                    >
                      <Pressable
                        style={styles.scheduleModalContent}
                        onPress={(e) => e.stopPropagation()}
                      >
                        <ScrollView showsVerticalScrollIndicator={false}>
                          {/* Header */}
                          <Text style={styles.scheduleModalTitle}>Schedule</Text>

                          {/* ===== FREQUENCY SECTION ===== */}
                          <Text style={styles.scheduleModalSectionLabel}>Frequency</Text>
                          <View style={styles.scheduleModalSection}>
                            {/* Frequency tabs: Simple | Days | Custom */}
                            <View style={styles.frequencyTabRow}>
                              {(['simple', 'days', 'custom'] as const).map((tab) => (
                                <Pressable
                                  key={tab}
                                  onPress={() =>
                                    setScheduleModalState((prev) => ({
                                      ...prev,
                                      frequencyTab: tab,
                                    }))
                                  }
                                  style={[
                                    styles.frequencyTab,
                                    scheduleModalState.frequencyTab === tab &&
                                      styles.frequencyTabActive,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.frequencyTabText,
                                      scheduleModalState.frequencyTab === tab &&
                                        styles.frequencyTabTextActive,
                                    ]}
                                  >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>

                            {/* Simple frequency options */}
                            {scheduleModalState.frequencyTab === 'simple' && (
                              <View style={styles.frequencyOptionsColumn}>
                                {['daily', 'weekly', 'monthly'].map((freq) => {
                                  const isSelected =
                                    scheduleModalState.frequencyJson?.type === 'simple' &&
                                    scheduleModalState.frequencyJson?.value === freq;
                                  return (
                                    <Pressable
                                      key={freq}
                                      style={[
                                        styles.frequencyOption,
                                        isSelected && styles.frequencyOptionSelected,
                                      ]}
                                      onPress={() =>
                                        setScheduleModalState((prev) => ({
                                          ...prev,
                                          frequencyJson: { type: 'simple', value: freq },
                                        }))
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.frequencyOptionText,
                                          isSelected && styles.frequencyOptionTextSelected,
                                        ]}
                                      >
                                        {freq.charAt(0).toUpperCase() + freq.slice(1)}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            )}

                            {/* Days frequency options */}
                            {scheduleModalState.frequencyTab === 'days' && (
                              <View style={styles.daysGrid}>
                                {DAY_LABELS.map(({ day, short }) => {
                                  const isSelected = scheduleModalState.selectedDays.includes(day);
                                  return (
                                    <Pressable
                                      key={day}
                                      style={[styles.dayChip, isSelected && styles.dayChipSelected]}
                                      onPress={() =>
                                        setScheduleModalState((prev) => ({
                                          ...prev,
                                          selectedDays: isSelected
                                            ? prev.selectedDays.filter((d) => d !== day)
                                            : [...prev.selectedDays, day].sort(),
                                        }))
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.dayChipText,
                                          isSelected && styles.dayChipTextSelected,
                                        ]}
                                      >
                                        {short}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            )}

                            {/* Custom frequency options */}
                            {scheduleModalState.frequencyTab === 'custom' && (
                              <View style={styles.customFrequencyRow}>
                                <TextInput
                                  style={styles.customCountInput}
                                  value={scheduleModalState.customCount}
                                  onChangeText={(text) =>
                                    setScheduleModalState((prev) => ({
                                      ...prev,
                                      customCount: text,
                                    }))
                                  }
                                  keyboardType="number-pad"
                                  maxLength={2}
                                />
                                <Text style={styles.customFrequencyLabel}>times per</Text>
                                <View style={styles.customUnitPicker}>
                                  {(['day', 'week', 'month'] as const).map((unit) => (
                                    <Pressable
                                      key={unit}
                                      style={[
                                        styles.customUnitOption,
                                        scheduleModalState.customUnit === unit &&
                                          styles.customUnitOptionSelected,
                                      ]}
                                      onPress={() =>
                                        setScheduleModalState((prev) => ({
                                          ...prev,
                                          customUnit: unit,
                                        }))
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.customUnitText,
                                          scheduleModalState.customUnit === unit &&
                                            styles.customUnitTextSelected,
                                        ]}
                                      >
                                        {unit}
                                      </Text>
                                    </Pressable>
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>

                          {/* ===== START DATE SECTION ===== */}
                          <Text style={styles.scheduleModalSectionLabel}>Start date</Text>
                          <Pressable
                            style={styles.scheduleModalDateRow}
                            onPress={() =>
                              setShowScheduleStartDatePicker(!showScheduleStartDatePicker)
                            }
                          >
                            <Text style={styles.scheduleModalDateText}>
                              {scheduleModalState.startDate
                                ? format(parseISO(scheduleModalState.startDate), 'MMM d, yyyy')
                                : 'Not set'}
                            </Text>
                            <Calendar size={18} color="#666666" />
                          </Pressable>

                          {/* Inline DateTimePicker for start date */}
                          {showScheduleStartDatePicker && (
                            <DateTimePicker
                              value={
                                scheduleModalState.startDate
                                  ? parseISO(scheduleModalState.startDate)
                                  : new Date()
                              }
                              mode="date"
                              display="inline"
                              onChange={(event, date) => {
                                if (date) {
                                  setScheduleModalState((prev) => ({
                                    ...prev,
                                    startDate: format(date, 'yyyy-MM-dd'),
                                  }));
                                }
                                setShowScheduleStartDatePicker(false);
                              }}
                              style={{ backgroundColor: 'white' }}
                            />
                          )}

                          {/* ===== END DATE SECTION ===== */}
                          <Text style={styles.scheduleModalSectionLabel}>End date</Text>
                          <Pressable
                            style={styles.scheduleModalDateRow}
                            onPress={() => setShowScheduleEndDatePicker(!showScheduleEndDatePicker)}
                          >
                            <Text
                              style={[
                                styles.scheduleModalDateText,
                                !scheduleModalState.endDate && { color: '#999999' },
                              ]}
                            >
                              {scheduleModalState.endDate
                                ? format(parseISO(scheduleModalState.endDate), 'MMM d, yyyy')
                                : 'No end date'}
                            </Text>
                            <Calendar size={18} color="#666666" />
                          </Pressable>

                          {showScheduleEndDatePicker && (
                            <View>
                              <DateTimePicker
                                value={
                                  scheduleModalState.endDate
                                    ? parseISO(scheduleModalState.endDate)
                                    : new Date()
                                }
                                mode="date"
                                display="inline"
                                onChange={(event, date) => {
                                  if (date) {
                                    setScheduleModalState((prev) => ({
                                      ...prev,
                                      endDate: format(date, 'yyyy-MM-dd'),
                                    }));
                                  }
                                  setShowScheduleEndDatePicker(false);
                                }}
                                style={{ backgroundColor: 'white' }}
                              />
                              <Pressable
                                onPress={() => {
                                  setScheduleModalState((prev) => ({
                                    ...prev,
                                    endDate: null,
                                  }));
                                  setShowScheduleEndDatePicker(false);
                                }}
                                style={{ alignSelf: 'center', paddingVertical: 8 }}
                              >
                                <Text style={{ color: '#888888', fontSize: 14 }}>
                                  Clear end date
                                </Text>
                              </Pressable>
                            </View>
                          )}

                          {/* ===== TIME OF DAY SECTION ===== */}
                          <Text style={styles.scheduleModalSectionLabel}>Time of day</Text>
                          <View style={styles.timeWindowGrid}>
                            {TIME_WINDOW_OPTIONS.map((option) => {
                              const isSelected = scheduleModalState.timeWindow === option.value;
                              return (
                                <Pressable
                                  key={option.value ?? 'null'}
                                  style={[
                                    styles.timeWindowChip,
                                    isSelected && styles.timeWindowChipSelected,
                                  ]}
                                  onPress={() =>
                                    setScheduleModalState((prev) => ({
                                      ...prev,
                                      timeWindow: option.value,
                                    }))
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.timeWindowChipText,
                                      isSelected && styles.timeWindowChipTextSelected,
                                    ]}
                                  >
                                    {option.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          {/* ===== DURATION SECTION ===== */}
                          <Text style={styles.scheduleModalSectionLabel}>Duration</Text>

                          {/* Quick select grid */}
                          <View style={styles.durationGrid}>
                            {TIME_ESTIMATE_QUICK_OPTIONS.map((minutes) => {
                              const isSelected = scheduleModalState.timeEstimateMinutes === minutes;
                              return (
                                <Pressable
                                  key={minutes}
                                  style={[
                                    styles.durationChip,
                                    isSelected && styles.durationChipSelected,
                                  ]}
                                  onPress={() =>
                                    setScheduleModalState((prev) => ({
                                      ...prev,
                                      timeEstimateMinutes: minutes,
                                    }))
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.durationChipText,
                                      isSelected && styles.durationChipTextSelected,
                                    ]}
                                  >
                                    {formatTimeEstimate(minutes)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          {/* Stepper for custom values */}
                          <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
                            <Text style={{ fontSize: 12, color: '#666666', marginBottom: 6 }}>
                              Custom
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Pressable
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 18,
                                  backgroundColor: '#F5F5F5',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  opacity:
                                    (scheduleModalState.timeEstimateMinutes ?? 30) <=
                                    TIME_ESTIMATE_MIN
                                      ? 0.5
                                      : 1,
                                }}
                                onPress={() =>
                                  setScheduleModalState((prev) => ({
                                    ...prev,
                                    timeEstimateMinutes: Math.max(
                                      TIME_ESTIMATE_MIN,
                                      (prev.timeEstimateMinutes ?? 30) - TIME_ESTIMATE_STEP,
                                    ),
                                  }))
                                }
                                disabled={
                                  (scheduleModalState.timeEstimateMinutes ?? 30) <=
                                  TIME_ESTIMATE_MIN
                                }
                              >
                                <Minus
                                  size={16}
                                  color={
                                    (scheduleModalState.timeEstimateMinutes ?? 30) <=
                                    TIME_ESTIMATE_MIN
                                      ? '#CCCCCC'
                                      : '#2E5540'
                                  }
                                />
                              </Pressable>

                              <View style={{ minWidth: 70, alignItems: 'center' }}>
                                <Text
                                  style={{
                                    fontSize: 16,
                                    fontWeight: '600',
                                    color: !TIME_ESTIMATE_QUICK_OPTIONS.includes(
                                      (scheduleModalState.timeEstimateMinutes ??
                                        30) as (typeof TIME_ESTIMATE_QUICK_OPTIONS)[number],
                                    )
                                      ? '#2E5540'
                                      : '#333333',
                                  }}
                                >
                                  {formatTimeEstimate(scheduleModalState.timeEstimateMinutes ?? 30)}
                                </Text>
                              </View>

                              <Pressable
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 18,
                                  backgroundColor: '#F5F5F5',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  opacity:
                                    (scheduleModalState.timeEstimateMinutes ?? 30) >=
                                    TIME_ESTIMATE_MAX
                                      ? 0.5
                                      : 1,
                                }}
                                onPress={() =>
                                  setScheduleModalState((prev) => ({
                                    ...prev,
                                    timeEstimateMinutes: Math.min(
                                      TIME_ESTIMATE_MAX,
                                      (prev.timeEstimateMinutes ?? 30) + TIME_ESTIMATE_STEP,
                                    ),
                                  }))
                                }
                                disabled={
                                  (scheduleModalState.timeEstimateMinutes ?? 30) >=
                                  TIME_ESTIMATE_MAX
                                }
                              >
                                <Plus
                                  size={16}
                                  color={
                                    (scheduleModalState.timeEstimateMinutes ?? 30) >=
                                    TIME_ESTIMATE_MAX
                                      ? '#CCCCCC'
                                      : '#2E5540'
                                  }
                                />
                              </Pressable>
                            </View>
                            <Text style={{ fontSize: 11, color: '#999999', marginTop: 4 }}>
                              5 min – 4 hrs
                            </Text>
                          </View>
                        </ScrollView>

                        {/* Footer buttons */}
                        <View style={styles.scheduleModalFooter}>
                          <Pressable
                            onPress={() => setShowScheduleModal(false)}
                            style={styles.scheduleModalCancelButton}
                          >
                            <Text style={styles.scheduleModalCancelText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={applyScheduleChanges}
                            style={styles.scheduleModalSetButton}
                          >
                            <Text style={styles.scheduleModalSetText}>Set</Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Habit Start Date Picker Modal */}
                  <Modal visible={showHabitStartDatePicker} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => setShowHabitStartDatePicker(false)}
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
                            state.habit.start_date ? parseISO(state.habit.start_date) : new Date()
                          }
                          mode="date"
                          display="spinner"
                          onChange={(event, date) => {
                            if (event.type === 'set' && date) {
                              dispatch({
                                type: 'SET_HABIT_START_DATE',
                                date: format(date, 'yyyy-MM-dd'),
                              });
                            }
                            setShowHabitStartDatePicker(false);
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
                              dispatch({ type: 'SET_HABIT_START_DATE', date: null });
                              setShowHabitStartDatePicker(false);
                            }}
                            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                          >
                            <Text style={{ color: '#888888', fontSize: 14 }}>Leave TBD</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              dispatch({
                                type: 'SET_HABIT_START_DATE',
                                date: format(new Date(), 'yyyy-MM-dd'),
                              });
                              setShowHabitStartDatePicker(false);
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
                  <Modal visible={showHabitEndDatePicker} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => setShowHabitEndDatePicker(false)}
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
                              : addDays(new Date(), 30)
                          }
                          mode="date"
                          display="spinner"
                          minimumDate={
                            state.habit.start_date ? parseISO(state.habit.start_date) : new Date()
                          }
                          onChange={(event, date) => {
                            if (event.type === 'set' && date) {
                              dispatch({
                                type: 'SET_HABIT_END_DATE',
                                date: format(date, 'yyyy-MM-dd'),
                              });
                            }
                            setShowHabitEndDatePicker(false);
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
                              dispatch({ type: 'SET_HABIT_END_DATE', date: null });
                              setShowHabitEndDatePicker(false);
                            }}
                            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                          >
                            <Text style={{ color: '#888888', fontSize: 14 }}>No end date</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setShowHabitEndDatePicker(false)}
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
                  <Modal visible={showSpaceModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => setShowSpaceModal(false)}
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
                            dispatch({ type: 'SET_SPACE', spaceId: null });
                            setShowSpaceModal(false);
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
                                dispatch({ type: 'SET_SPACE', spaceId: space.id });
                                setShowSpaceModal(false);
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

                  {/* Reminders Management Modal */}
                  <Modal visible={showRemindersModal} transparent animationType="fade">
                    <Pressable
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                      }}
                      onPress={() => {
                        if (!editingReminder) {
                          setShowRemindersModal(false);
                        }
                      }}
                    >
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                          width: '90%',
                          maxWidth: 400,
                          backgroundColor: '#FFFFFF',
                          padding: 20,
                          borderRadius: 16,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.1,
                          shadowRadius: 12,
                          elevation: 5,
                          maxHeight: '80%',
                        }}
                      >
                        {editingReminder ? (
                          /* Add/Edit Reminder Form */
                          <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Header */}
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 20,
                              }}
                            >
                              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                                {editingMode === 'add' ? 'Add Reminder' : 'Edit Reminder'}
                              </Text>
                              <Pressable
                                onPress={() => {
                                  setEditingReminder(null);
                                  setReminderValidationError(null);
                                }}
                                style={({ pressed }) => ({
                                  opacity: pressed ? 0.6 : 1,
                                  padding: 4,
                                })}
                              >
                                <CloseIcon size={24} color="#6B7280" />
                              </Pressable>
                            </View>

                            {/* Time Selector */}
                            <View style={{ marginBottom: 20 }}>
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: '500',
                                  color: '#374151',
                                  marginBottom: 8,
                                }}
                              >
                                Time
                              </Text>
                              <View
                                style={{ backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12 }}
                              >
                                <DateTimePicker
                                  value={reminderTimeValue}
                                  mode="time"
                                  display="spinner"
                                  onChange={(event, date) => {
                                    if (date) {
                                      setReminderTimeValue(date);
                                    }
                                  }}
                                  style={{ backgroundColor: 'transparent' }}
                                />
                              </View>
                            </View>

                            {/* Repeat Options */}
                            <View style={{ marginBottom: 20 }}>
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: '500',
                                  color: '#374151',
                                  marginBottom: 8,
                                }}
                              >
                                Repeat
                              </Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {(['once', 'daily', 'weekdays', 'weekends', 'custom'] as const).map(
                                  (option) => (
                                    <Pressable
                                      key={option}
                                      onPress={() => setReminderRepeat(option)}
                                      style={({ pressed }) => ({
                                        paddingHorizontal: 14,
                                        paddingVertical: 8,
                                        borderRadius: 8,
                                        backgroundColor:
                                          reminderRepeat === option
                                            ? lightTokens.colors.moss
                                            : pressed
                                              ? '#F3F4F6'
                                              : '#F9FAFB',
                                        borderWidth: 1,
                                        borderColor:
                                          reminderRepeat === option
                                            ? lightTokens.colors.moss
                                            : '#E5E7EB',
                                      })}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 14,
                                          fontWeight: '500',
                                          color: reminderRepeat === option ? '#FFFFFF' : '#374151',
                                          textTransform: 'capitalize',
                                        }}
                                      >
                                        {option}
                                      </Text>
                                    </Pressable>
                                  ),
                                )}
                              </View>
                            </View>

                            {/* Conditional: Date picker for "once" */}
                            {reminderRepeat === 'once' && (
                              <View style={{ marginBottom: 20 }}>
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: '500',
                                    color: '#374151',
                                    marginBottom: 8,
                                  }}
                                >
                                  Date
                                </Text>
                                <View
                                  style={{
                                    backgroundColor: '#F9FAFB',
                                    borderRadius: 8,
                                    padding: 12,
                                  }}
                                >
                                  <DateTimePicker
                                    value={reminderDateValue}
                                    mode="date"
                                    display="inline"
                                    onChange={(event, date) => {
                                      if (date) {
                                        setReminderDateValue(date);
                                      }
                                    }}
                                    style={{ backgroundColor: 'transparent' }}
                                  />
                                </View>
                              </View>
                            )}

                            {/* Conditional: Custom days selector */}
                            {reminderRepeat === 'custom' && (
                              <View style={{ marginBottom: 20 }}>
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: '500',
                                    color: '#374151',
                                    marginBottom: 8,
                                  }}
                                >
                                  Days
                                </Text>
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                  }}
                                >
                                  {SHORT_DAY_LABELS.map((label, index) => (
                                    <Pressable
                                      key={index}
                                      onPress={() => {
                                        setReminderCustomDays((prev) => {
                                          if (prev.includes(index)) {
                                            return prev.filter((d) => d !== index);
                                          } else {
                                            return [...prev, index].sort((a, b) => a - b);
                                          }
                                        });
                                      }}
                                      style={({ pressed }) => ({
                                        width: 32,
                                        height: 32,
                                        borderRadius: 16,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        backgroundColor: reminderCustomDays.includes(index)
                                          ? lightTokens.colors.moss
                                          : pressed
                                            ? '#F3F4F6'
                                            : 'transparent',
                                        borderWidth: 1,
                                        borderColor: reminderCustomDays.includes(index)
                                          ? lightTokens.colors.moss
                                          : '#D1D5DB',
                                      })}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 13,
                                          fontWeight: '500',
                                          color: reminderCustomDays.includes(index)
                                            ? '#FFFFFF'
                                            : '#6B7280',
                                        }}
                                      >
                                        {label}
                                      </Text>
                                    </Pressable>
                                  ))}
                                </View>
                                {reminderValidationError && (
                                  <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>
                                    {reminderValidationError}
                                  </Text>
                                )}
                              </View>
                            )}

                            {/* Buttons */}
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                              <Pressable
                                onPress={() => {
                                  setEditingReminder(null);
                                  setReminderValidationError(null);
                                }}
                                style={({ pressed }) => ({
                                  flex: 1,
                                  paddingVertical: 12,
                                  borderRadius: 8,
                                  backgroundColor: pressed ? '#F3F4F6' : 'transparent',
                                  borderWidth: 1,
                                  borderColor: '#D1D5DB',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  minHeight: 44,
                                })}
                              >
                                <Text style={{ fontSize: 15, fontWeight: '500', color: '#6B7280' }}>
                                  Cancel
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  // Validation
                                  if (
                                    reminderRepeat === 'custom' &&
                                    reminderCustomDays.length === 0
                                  ) {
                                    setReminderValidationError('Select at least one day');
                                    return;
                                  }

                                  // Build reminder object
                                  const hour = format(reminderTimeValue, 'HH');
                                  const minute = format(reminderTimeValue, 'mm');
                                  const time = `${hour}:${minute}`;

                                  const newReminder: OverlayReminder = {
                                    id: editingReminder.id,
                                    time,
                                    repeat: reminderRepeat,
                                    ...(reminderRepeat === 'once' && {
                                      date: format(reminderDateValue, 'yyyy-MM-dd'),
                                    }),
                                    ...(reminderRepeat === 'custom' && {
                                      days: reminderCustomDays,
                                    }),
                                  };

                                  // Check for duplicates
                                  const isDuplicate = reminders.some((r) => {
                                    if (editingMode === 'edit' && r.id === editingReminder.id)
                                      return false;
                                    return (
                                      r.time === newReminder.time &&
                                      r.repeat === newReminder.repeat &&
                                      r.date === newReminder.date &&
                                      JSON.stringify(r.days) === JSON.stringify(newReminder.days)
                                    );
                                  });

                                  if (isDuplicate) {
                                    setReminderValidationError('This reminder already exists');
                                    return;
                                  }

                                  // Add or update
                                  LayoutAnimation.configureNext(
                                    LayoutAnimation.Presets.easeInEaseOut,
                                  );
                                  if (editingMode === 'add') {
                                    setReminders((prev) => [...prev, newReminder]);
                                  } else {
                                    setReminders((prev) =>
                                      prev.map((r) =>
                                        r.id === editingReminder.id ? newReminder : r,
                                      ),
                                    );
                                  }

                                  // Clear and return to list
                                  setEditingReminder(null);
                                  setReminderValidationError(null);
                                }}
                                style={({ pressed }) => ({
                                  flex: 1,
                                  paddingVertical: 12,
                                  borderRadius: 8,
                                  backgroundColor: pressed ? '#244430' : lightTokens.colors.moss,
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  minHeight: 44,
                                })}
                              >
                                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
                                  {editingMode === 'add' ? 'Add' : 'Update'}
                                </Text>
                              </Pressable>
                            </View>
                          </ScrollView>
                        ) : (
                          /* Reminders List View */
                          <View>
                            {/* Header */}
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 16,
                              }}
                            >
                              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                                Set Reminders
                              </Text>
                              <Pressable
                                onPress={() => setShowRemindersModal(false)}
                                style={({ pressed }) => ({
                                  opacity: pressed ? 0.6 : 1,
                                  padding: 4,
                                })}
                              >
                                <CloseIcon size={24} color="#6B7280" />
                              </Pressable>
                            </View>

                            {/* Reminders List or Empty State */}
                            <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
                              {reminders.length === 0 ? (
                                <Text
                                  style={{
                                    textAlign: 'center',
                                    color: '#6B7280',
                                    paddingVertical: 40,
                                  }}
                                >
                                  No reminders set
                                </Text>
                              ) : (
                                reminders.map((reminder) => (
                                  <Pressable
                                    key={reminder.id}
                                    onPress={() => {
                                      // Open for editing
                                      setEditingReminder(reminder);
                                      setEditingMode('edit');
                                      // Hydrate form state
                                      const [hour, minute] = reminder.time.split(':').map(Number);
                                      const timeDate = new Date();
                                      timeDate.setHours(hour, minute, 0, 0);
                                      setReminderTimeValue(timeDate);
                                      setReminderRepeat(reminder.repeat);
                                      if (reminder.date) {
                                        setReminderDateValue(parseISO(reminder.date));
                                      }
                                      if (reminder.days) {
                                        setReminderCustomDays(reminder.days);
                                      }
                                      setReminderValidationError(null);
                                    }}
                                    style={({ pressed }) => ({
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      paddingVertical: 12,
                                      paddingHorizontal: 12,
                                      borderRadius: 8,
                                      backgroundColor: pressed ? '#F3F4F6' : 'transparent',
                                      marginBottom: 8,
                                      minHeight: 48,
                                    })}
                                  >
                                    <View
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 12,
                                        flex: 1,
                                      }}
                                    >
                                      <Bell size={20} color={lightTokens.colors.moss} />
                                      <Text
                                        style={{
                                          fontSize: 15,
                                          fontWeight: '500',
                                          color: '#111827',
                                        }}
                                      >
                                        {formatSingleReminder(reminder)}
                                      </Text>
                                    </View>
                                    <Pressable
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        // Delete reminder with animation
                                        LayoutAnimation.configureNext(
                                          LayoutAnimation.Presets.easeInEaseOut,
                                        );
                                        setReminders((prev) =>
                                          prev.filter((r) => r.id !== reminder.id),
                                        );
                                      }}
                                      style={({ pressed }) => ({
                                        padding: 4,
                                        opacity: pressed ? 0.6 : 1,
                                        minWidth: 24,
                                        minHeight: 24,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                      })}
                                    >
                                      <CloseIcon size={18} color="#6B7280" />
                                    </Pressable>
                                  </Pressable>
                                ))
                              )}
                            </ScrollView>

                            {/* Add Reminder Button */}
                            {reminders.length < 5 && (
                              <Pressable
                                onPress={() => {
                                  // Set smart defaults based on baseType and habit mode
                                  const isHabit = baseType === 'habit';
                                  const defaultTime = isHabit
                                    ? isBreakHabit
                                      ? '20:00'
                                      : '09:00'
                                    : '09:00';
                                  const defaultRepeat = isHabit ? 'daily' : 'once';

                                  const [hour, minute] = defaultTime.split(':').map(Number);
                                  const timeDate = new Date();
                                  timeDate.setHours(hour, minute, 0, 0);

                                  setReminderTimeValue(timeDate);
                                  setReminderRepeat(defaultRepeat);
                                  setReminderDateValue(
                                    baseType === 'todo' ? addDays(new Date(), 1) : new Date(),
                                  );
                                  setReminderCustomDays([]);
                                  setReminderValidationError(null);
                                  setEditingMode('add');
                                  setEditingReminder({
                                    id: `reminder-${Date.now()}`,
                                    time: defaultTime,
                                    repeat: defaultRepeat,
                                  });
                                }}
                                style={({ pressed }) => ({
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  paddingVertical: 14,
                                  borderRadius: 8,
                                  borderWidth: 1.5,
                                  borderStyle: 'dashed',
                                  borderColor: lightTokens.colors.moss,
                                  backgroundColor: pressed ? '#F0F4F1' : 'transparent',
                                  minHeight: 48,
                                })}
                              >
                                <Text
                                  style={{
                                    fontSize: 15,
                                    fontWeight: '500',
                                    color: lightTokens.colors.moss,
                                  }}
                                >
                                  + Add reminder
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </Pressable>
                    </Pressable>
                  </Modal>

                  {/* Frequency Builder Modal */}
                  <Modal
                    visible={showFrequencyModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => {
                      setShowFrequencyModal(false);
                    }}
                  >
                    <Box
                      flex={1}
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: 16,
                      }}
                    >
                      <Box
                        bg="bg"
                        style={{
                          padding: tokenSpacing.md,
                          borderRadius: tokenRadius.sm,
                          width: '100%',
                          maxWidth: 400,
                        }}
                      >
                        <Text variant="title">Set frequency</Text>

                        {/* Tab selector */}
                        <Box mt={3}>
                          <Box
                            row
                            gap={2}
                            style={{
                              borderBottomWidth: 1,
                              borderBottomColor:
                                colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : '#E0E0E0',
                            }}
                          >
                            {(['simple', 'days', 'custom'] as const).map((tab) => (
                              <Pressable
                                key={tab}
                                onPress={() =>
                                  setScheduleModalState((prev) => ({ ...prev, frequencyTab: tab }))
                                }
                                style={{
                                  paddingVertical: 8,
                                  paddingHorizontal: 16,
                                  borderBottomWidth: 2,
                                  borderBottomColor:
                                    scheduleModalState.frequencyTab === tab
                                      ? colorMode === 'dark'
                                        ? lightTokens.colors.moss
                                        : lightTokens.colors.moss
                                      : 'transparent',
                                }}
                              >
                                <Text
                                  style={{
                                    color:
                                      scheduleModalState.frequencyTab === tab
                                        ? colorMode === 'dark'
                                          ? '#FFFFFF'
                                          : '#222222'
                                        : colorMode === 'dark'
                                          ? 'rgba(255,255,255,0.6)'
                                          : 'rgba(34,34,34,0.6)',
                                    fontWeight:
                                      scheduleModalState.frequencyTab === tab ? '600' : '400',
                                  }}
                                >
                                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </Text>
                              </Pressable>
                            ))}
                          </Box>
                        </Box>

                        {/* Tab content */}
                        <Box mt={3} style={{ minHeight: 150 }}>
                          {/* Simple tab */}
                          {scheduleModalState.frequencyTab === 'simple' && (
                            <Box gap={2}>
                              {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                                <Button
                                  key={freq}
                                  variant="ghost"
                                  onPress={() => {
                                    const config: FrequencyConfig = { mode: 'simple', value: freq };
                                    const fjson = frequencyToJson(config);
                                    hasLocalScheduleChanges.current = true;
                                    localScheduleSnapshot.current = {
                                      ...localScheduleSnapshot.current,
                                      frequency_json: fjson,
                                    };
                                    dispatch({
                                      type: 'SET_HABIT_FREQUENCY',
                                      frequency_json: fjson,
                                    });
                                    setShowFrequencyModal(false);
                                  }}
                                  title={freq.charAt(0).toUpperCase() + freq.slice(1)}
                                />
                              ))}
                            </Box>
                          )}

                          {/* Days tab */}
                          {scheduleModalState.frequencyTab === 'days' && (
                            <Box>
                              <Text variant="label" style={{ marginBottom: 12 }}>
                                Select days
                              </Text>
                              <Box row gap={1} style={{ flexWrap: 'wrap' }}>
                                {DAY_LABELS.map(({ day, short, long }) => {
                                  const isSelected = scheduleModalState.selectedDays.includes(day);
                                  return (
                                    <Pressable
                                      key={day}
                                      onPress={() => {
                                        setScheduleModalState((prev) => ({
                                          ...prev,
                                          selectedDays: prev.selectedDays.includes(day)
                                            ? prev.selectedDays.filter((d) => d !== day)
                                            : [...prev.selectedDays, day],
                                        }));
                                      }}
                                      style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 22,
                                        backgroundColor: isSelected
                                          ? colorMode === 'dark'
                                            ? lightTokens.colors.moss
                                            : lightTokens.colors.moss
                                          : colorMode === 'dark'
                                            ? 'rgba(255,255,255,0.1)'
                                            : '#F5F5F5',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        marginBottom: 8,
                                      }}
                                      accessibilityLabel={long}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected: isSelected }}
                                    >
                                      <Text
                                        style={{
                                          color: isSelected
                                            ? '#FFFFFF'
                                            : colorMode === 'dark'
                                              ? 'rgba(255,255,255,0.7)'
                                              : '#666666',
                                          fontWeight: isSelected ? '600' : '400',
                                          fontSize: 16,
                                        }}
                                      >
                                        {short}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </Box>
                            </Box>
                          )}

                          {/* Custom tab */}
                          {scheduleModalState.frequencyTab === 'custom' && (
                            <Box>
                              <Text variant="label" style={{ marginBottom: 12 }}>
                                How often?
                              </Text>
                              <Box row gap={2} style={{ alignItems: 'center' }}>
                                <TextInput
                                  value={scheduleModalState.customCount}
                                  onChangeText={(text) => {
                                    const num = text.replace(/[^0-9]/g, '');
                                    setScheduleModalState((prev) => ({
                                      ...prev,
                                      customCount: num || '1',
                                    }));
                                  }}
                                  keyboardType="number-pad"
                                  placeholder="1"
                                  style={{
                                    backgroundColor:
                                      colorMode === 'dark' ? darkTokens.colors.deep : '#FAFAFA',
                                    borderWidth: 1,
                                    borderColor:
                                      colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : '#E0E0E0',
                                    borderRadius: 8,
                                    paddingHorizontal: 12,
                                    paddingVertical: 10,
                                    width: 80,
                                    color: colorMode === 'dark' ? '#FFFFFF' : '#222222',
                                    fontSize: 16,
                                  }}
                                />
                                <Text
                                  style={{
                                    color:
                                      colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666',
                                  }}
                                >
                                  times per
                                </Text>
                                <View style={{ flex: 1 }}>
                                  <Pressable
                                    onPress={() => {
                                      const units: ('day' | 'week' | 'month')[] = [
                                        'day',
                                        'week',
                                        'month',
                                      ];
                                      const currentIndex = units.indexOf(
                                        scheduleModalState.customUnit,
                                      );
                                      const nextIndex = (currentIndex + 1) % units.length;
                                      setScheduleModalState((prev) => ({
                                        ...prev,
                                        customUnit: units[nextIndex],
                                      }));
                                    }}
                                    style={{
                                      backgroundColor:
                                        colorMode === 'dark' ? darkTokens.colors.deep : '#FAFAFA',
                                      borderWidth: 1,
                                      borderColor:
                                        colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : '#E0E0E0',
                                      borderRadius: 8,
                                      paddingHorizontal: 12,
                                      paddingVertical: 10,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: colorMode === 'dark' ? '#FFFFFF' : '#222222',
                                        fontSize: 16,
                                      }}
                                    >
                                      {scheduleModalState.customUnit}
                                    </Text>
                                  </Pressable>
                                </View>
                              </Box>
                            </Box>
                          )}
                        </Box>

                        {/* Action buttons */}
                        <Box row mt={4}>
                          <Button
                            variant="ghost"
                            onPress={() => {
                              setShowFrequencyModal(false);
                            }}
                            title="Cancel"
                          />
                          <Box flex={1} />
                          <Button
                            variant="primary"
                            onPress={() => {
                              let config: FrequencyConfig;

                              if (scheduleModalState.frequencyTab === 'simple') {
                                config = { mode: 'simple', value: 'daily' }; // Default, but this won't be called in simple mode
                              } else if (scheduleModalState.frequencyTab === 'days') {
                                if (scheduleModalState.selectedDays.length === 0) {
                                  // Require at least one day
                                  return;
                                }
                                config = {
                                  mode: 'days',
                                  days: scheduleModalState.selectedDays as DayOfWeek[],
                                };
                              } else {
                                const count = parseInt(scheduleModalState.customCount) || 1;
                                config = {
                                  mode: 'custom',
                                  value: { count, unit: scheduleModalState.customUnit },
                                };
                              }

                              const fjson = frequencyToJson(config);
                              hasLocalScheduleChanges.current = true;
                              localScheduleSnapshot.current = {
                                ...localScheduleSnapshot.current,
                                frequency_json: fjson,
                              };
                              dispatch({
                                type: 'SET_HABIT_FREQUENCY',
                                frequency_json: fjson,
                              });
                              setShowFrequencyModal(false);
                            }}
                            title="Set"
                            disabled={
                              scheduleModalState.frequencyTab === 'days' &&
                              scheduleModalState.selectedDays.length === 0
                            }
                          />
                        </Box>
                      </Box>
                    </Box>
                  </Modal>

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

                  {/* Phase 6d: Footer with better spacing and clear primary action */}
                  <View
                    style={{
                      backgroundColor: footerBackground,
                      borderTopWidth: 1,
                      borderTopColor: 'rgba(191, 216, 192, 0.4)',
                    }}
                  >
                    <Box
                      style={{
                        paddingHorizontal: 20,
                        paddingTop: 20,
                        paddingBottom: 20,
                        backgroundColor: footerBackground,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Cancel button - text-only, subtle (hidden in view mode) */}
                      {!isViewMode && (
                        <Pressable
                          onPress={handleCancel}
                          disabled={isSaving}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel"
                          style={{
                            paddingVertical: 12,
                            minHeight: 44,
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: isSaving
                                ? colorMode === 'dark'
                                  ? 'rgba(255,255,255,0.3)'
                                  : 'rgba(34,34,34,0.3)'
                                : 'rgba(34,34,34,0.7)',
                              fontSize: 14,
                              fontWeight: '500',
                            }}
                          >
                            Cancel
                          </Text>
                        </Pressable>
                      )}

                      {/* Close button - view mode only (matches Cancel button styling) */}
                      {isViewMode && (
                        <Pressable
                          onPress={() => onClose?.()}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Close"
                          style={{
                            paddingVertical: 12,
                            minHeight: 44,
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: 'rgba(34,34,34,0.7)',
                              fontSize: 14,
                              fontWeight: '500',
                            }}
                          >
                            Close
                          </Text>
                        </Pressable>
                      )}

                      {/* View mode: Edit button to switch to edit mode */}
                      {isViewMode && (
                        <Pressable
                          onPress={() => {
                            // Switch to edit mode for this record
                            if (initialEntity && (initialEntity as any).id) {
                              globalOverlay.openEdit({
                                record: initialEntity as any,
                                spaceId: initialSpaceId,
                              });
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={
                            effectiveLogSubtype === 'event' ? 'Edit Details' : 'Edit'
                          }
                          style={{
                            backgroundColor:
                              colorMode === 'dark'
                                ? darkTokens.colors.moss
                                : lightTokens.colors.moss,
                            minWidth: 120,
                            paddingHorizontal: 20,
                            height: 44,
                            borderRadius: 999,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: '#FFFFFF',
                              fontSize: 15,
                              fontWeight: '600',
                            }}
                          >
                            {effectiveLogSubtype === 'event' ? 'Edit Details' : 'Edit'}
                          </Text>
                        </Pressable>
                      )}

                      {/* Save button - primary action (hidden in view mode) */}
                      {!isViewMode && (
                        <Reanimated.View style={saveStyle}>
                          <Pressable
                            onPress={onSave}
                            disabled={!canSave}
                            accessibilityRole="button"
                            accessibilityLabel={isSaving ? 'Saving' : 'Save'}
                            style={{
                              backgroundColor: !canSave
                                ? colorMode === 'dark'
                                  ? 'rgba(94, 160, 138, 0.3)'
                                  : 'rgba(46, 125, 106, 0.3)'
                                : colorMode === 'dark'
                                  ? darkTokens.colors.moss
                                  : lightTokens.colors.moss,
                              width: 120,
                              height: 44,
                              borderRadius: 999,
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            <Text
                              style={{
                                color: !canSave
                                  ? colorMode === 'dark'
                                    ? 'rgba(255,255,255,0.4)'
                                    : 'rgba(255,255,255,0.6)'
                                  : '#FFFFFF',
                                fontSize: 15,
                                fontWeight: '600',
                              }}
                            >
                              {isSaving ? 'Saving...' : isLockedIn ? 'Lock It In →' : 'Save'}
                            </Text>
                          </Pressable>
                        </Reanimated.View>
                      )}
                    </Box>
                  </View>
                </View>
              );
            })()}
          </RNAnimated.View>
        </View>

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
      {showEntityChat && currentEntityId && (
        <Modal visible={showEntityChat} animationType="slide" presentationStyle="fullScreen">
          <EntityChatScreen
            entityId={currentEntityId}
            entityType={entityTypeForChat}
            onClose={() => setShowEntityChat(false)}
          />
        </Modal>
      )}

      {/* TodoPreviewModal - for exploding notes to todos */}
      <TodoPreviewModal
        visible={showTodoPreview}
        items={extractedItems}
        spaceName={currentSpaceName}
        spaceId={fullEntity?.space_id || initialSpaceId || ''}
        onConfirm={handleExplodeToTodos}
        onCancel={() => setShowTodoPreview(false)}
        isLoading={isCreatingTodos}
      />

      {/* Entity Notes Modal - saved notes from chat */}
      <EntityNotesModal
        visible={showNotesModal}
        notes={entityChatNotes}
        onClose={() => setShowNotesModal(false)}
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

/**
 * Heuristic: detect if text looks like a simple comma-separated list.
 * Used to auto-enable checklist mode for logs like "Eggs, milk, bananas, yoghurt".
 * Only applied on initial hydration, user overrides always win.
 */
function looksLikeSimpleCommaList(text: string | null | undefined): boolean {
  if (!text) return false;
  if (text.includes('\n')) return false; // Multi-line, let existing logic handle it
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  // Require at least 3 items to reduce false positives (e.g. "A, B" won't trigger)
  if (parts.length < 3) return false;
  return true;
}

/**
 * Heuristic: detect if text is already formatted as checklist markup.
 * Matches lines like "[ ] Eggs" or "[x] Milk".
 * Used to re-enable checklist mode when re-opening a saved checklist.
 */
function looksLikeChecklistMarkup(text: string | null | undefined): boolean {
  if (!text) return false;

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;

  // Count lines that look like "[ ] something" or "[x] something"
  const checklistLines = lines.filter((line) => /^\[( |x|X)\]\s+.+/.test(line));

  // Require at least 2 checklist-ish lines to avoid false positives
  return checklistLines.length >= 2;
}

export function buildDraftPayloadFromEntity(entity: any): Partial<V2State> {
  if (!entity) return {};

  const type = (entity as any)?.type;
  const baseType: BaseType = type === 'todo' ? 'todo' : type === 'habit' ? 'habit' : 'log';

  // Use standardized helper to get raw Mind Drop text
  const mindDropRawText = getMindDropRawText(entity);

  // === Habit-specific long text and title computation ===
  if (type === 'habit') {
    // Long text for habits: prefer Mind Drop raw text, then notes, then body, then name
    const habitLongText =
      mindDropRawText ??
      (entity as any)?.notes ??
      (entity as any)?.body ??
      (entity as any)?.name ??
      '';

    // Short title for habits: prefer name, then title, then first line of long text
    const compactTitle =
      (entity as any)?.name ?? (entity as any)?.title ?? firstLine(habitLongText) ?? '';

    // Normalize tags from entity
    const extractedTags = extractTagKeysFromEntity(entity);

    const normalizeMetaValues = (values: unknown): string[] => {
      if (!Array.isArray(values)) return [];
      const normalized = values
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter(Boolean);
      return Array.from(new Set(normalized));
    };

    const tagsMeta = (entity as any)?.tags_meta ?? {};

    // Hydrate commitment fields from entity (Phase 6)
    const commitment = (entity as any)?.commitment === true;
    const commitmentNote = (entity as any)?.commitment_note ?? '';
    const commitmentStartedAt = (entity as any)?.commitment_started_at ?? null;

    // Build frequency_json from DB columns
    // Priority: cadence + target_per_period (canonical) > frequency + frequency_value (legacy)
    const dbCadence = (entity as any)?.cadence;
    const dbTargetPerPeriod = (entity as any)?.target_per_period;
    const dbFrequency = (entity as any)?.frequency;
    const dbFrequencyValue = (entity as any)?.frequency_value;
    const dbDaysActive = (entity as any)?.days_active;
    console.log('[UnifiedOverlay:DaysActive] 📥 Loading from entity:', {
      entityId: (entity as any)?.id,
      dbDaysActive,
      dbCadence,
      dbTargetPerPeriod,
    });
    const frequencyJson = buildFrequencyJsonFromDb(
      dbFrequency,
      dbFrequencyValue,
      dbCadence,
      dbTargetPerPeriod,
      dbDaysActive,
    );

    if (__DEV__) {
      console.log('[UnifiedOverlayV2.init] Loaded habit with:', {
        id: (entity as any)?.id,
        commitment,
        commitmentNote: commitmentNote?.slice?.(0, 30) || null,
        commitmentStartedAt,
        cadence: dbCadence,
        target_per_period: dbTargetPerPeriod,
        frequency: dbFrequency,
        frequency_value: dbFrequencyValue,
        frequencyJson,
      });
    }

    // Determine schedule from cadence (new) or frequency (legacy)
    const effectiveCadence = dbCadence || dbFrequency || 'daily';
    const scheduleFromCadence =
      effectiveCadence === 'daily'
        ? 'daily'
        : effectiveCadence === 'weekly' || effectiveCadence === 'week'
          ? 'weekly'
          : effectiveCadence === 'monthly' || effectiveCadence === 'month'
            ? 'weekly'
            : 'custom';

    return {
      baseType: 'habit',
      compactTitle,
      // Hydrate all type-specific states for symmetry (in case user switches types)
      habit: {
        title: compactTitle,
        notes: habitLongText,
        schedule: scheduleFromCadence,
        frequency_json: frequencyJson, // Built from cadence/target_per_period or frequency columns
        subtype:
          (entity as any)?.subtype === 'start_habit' || (entity as any)?.subtype === 'break_habit'
            ? (entity as any)?.subtype
            : 'start_habit', // Validate habit subtype (not log subtypes like 'journal')
        start_date: (entity as any)?.start_date ?? null,
        end_date: (entity as any)?.end_date ?? null,
        time_window: (entity as any)?.time_window ?? null,
        time_estimate_minutes: (entity as any)?.time_estimate_minutes ?? null,
      },
      todo: {
        title: compactTitle,
        details: habitLongText,
        due_at: null,
      },
      log: {
        title: compactTitle,
        body: habitLongText,
        kind: classifyLogKind(habitLongText),
        private: false, // Default for logs (Phase L7)
      },
      tags: extractedTags,
      stickyTags: normalizeMetaValues(tagsMeta?.sticky),
      tagTombstones: normalizeMetaValues(tagsMeta?.tombstones),
      // Commitment fields (Phase 6)
      commitment,
      commitmentNote,
      commitmentStartedAt,
      // Space and other fields
      spaceId: (entity as any)?.space_id ?? null,
      logSubtypeOverride: null, // Phase L8: Default for habits
      logIsPrivate: false, // Phase L9: Default for habits
      // Key Dates: Link to an event
      linkedEventId: (entity as any)?.linked_event_id ?? null,
    };
  }

  // === Todo/Log handling ===
  // Use Mind Drop raw text if available, otherwise fall back to standard fields
  const rawDetails =
    mindDropRawText ??
    (entity as any)?.details ??
    (entity as any)?.body ??
    (entity as any)?.notes ??
    '';
  const title = (entity as any)?.title ?? '';
  const name = (entity as any)?.name ?? '';

  // For todos: prefer name over title (name is the primary field for todos)
  // For logs: prefer title over name
  const todoTitle = name || title || '';
  const logTitle = title || name || '';

  // For todos: handle Mind Drop items
  // - Use Mind Drop raw text as the long text source (body/details mapping)
  // - If no Mind Drop text, fall back to name/title (backwards compatibility)
  // - title remains as the short label (possibly AI-generated)
  const todoDetails = rawDetails || name || title || '';

  // For notes/logs: handle Mind Drop items
  // - Use Mind Drop raw text as the long text source (body mapping)
  // - title remains as the short label (possibly AI-generated)
  const logBody = rawDetails || title || '';

  // Extract tags from entity for all types (not just habits)
  const extractedTags = extractTagKeysFromEntity(entity);

  const normalizeMetaValues = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const normalized = values
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };

  const tagsMeta = (entity as any)?.tags_meta ?? {};

  // Phase L8: Hydrate logSubtypeOverride from entity.subtype for logs
  const rawSubtype = (entity as any)?.subtype as string | undefined;
  let logSubtypeOverride: 'journal' | 'idea' | 'general' | 'list' | 'event' | null = null;
  if (baseType === 'log') {
    if (
      rawSubtype === 'journal' ||
      rawSubtype === 'idea' ||
      rawSubtype === 'list' ||
      rawSubtype === 'event'
    ) {
      logSubtypeOverride = rawSubtype;
    } else {
      logSubtypeOverride = 'general';
    }
  }

  // Phase L9: Hydrate logIsPrivate from entity.views.private_journal for logs
  const logIsPrivate =
    baseType === 'log'
      ? !!(entity?.views && (entity.views as any).private_journal === true)
      : false;

  // Hydrate commitment fields from entity (Phase 6)
  // Todos and notes can have commitment fields (habits use habit-specific path above)
  const commitment = (entity as any)?.commitment === true;
  const commitmentNote = (entity as any)?.commitment_note ?? '';
  const commitmentStartedAt = (entity as any)?.commitment_started_at ?? null;

  // Hydrate reminders from entity (used for journal entries and todos)
  const reminders = (entity as any)?.reminders ?? null;

  // Build frequency_json from DB columns (for habits loaded via todo/log path)
  // Priority: cadence + target_per_period (canonical) > frequency + frequency_value (legacy)
  const entityCadence = (entity as any)?.cadence;
  const entityTargetPerPeriod = (entity as any)?.target_per_period;
  const entityFrequency = (entity as any)?.frequency;
  const entityFrequencyValue = (entity as any)?.frequency_value;
  const entityDaysActive = (entity as any)?.days_active;
  const habitFrequencyJson = buildFrequencyJsonFromDb(
    entityFrequency,
    entityFrequencyValue,
    entityCadence,
    entityTargetPerPeriod,
    entityDaysActive,
  );

  if (__DEV__) {
    console.log('[UnifiedOverlayV2.init] Loaded entity with:', {
      id: (entity as any)?.id,
      type: baseType,
      commitment,
      commitmentNote: commitmentNote?.slice?.(0, 30) || null,
      commitmentStartedAt,
      reminders: reminders?.length ?? 0,
      due_day: (entity as any)?.due_day,
      due_time: (entity as any)?.due_time,
      mood: (entity as any)?.mood,
      frequency: entityFrequency,
      frequency_value: entityFrequencyValue,
    });
  }

  const payload: Partial<V2State> = {
    baseType,
    compactTitle: title || '', // Preserve entity title as compactTitle
    compactTitleSource: title || '', // Track source of title
    userEditedTitle: (entity?.views as any)?.title_user_edited ?? false, // Respect if user previously edited title
    log: {
      title: logTitle,
      body: logBody,
      kind: classifyLogKind(logBody),
      private: (entity as any)?.private ?? false, // Hydrate private field for logs (Phase L7)
      // Date Intelligence fields for notes
      target_date: (entity as any)?.target_date ?? (entity?.views as any)?.target_date ?? null,
      end_date: (entity as any)?.end_date ?? (entity?.views as any)?.end_date ?? null,
      event_time: (entity as any)?.event_time ?? (entity?.views as any)?.event_time ?? null,
    },
    todo: {
      title: todoTitle,
      details: todoDetails,
      // GREMLY TODO DATE MODEL:
      // Use due_day (YYYY-MM-DD) as the canonical source of truth.
      // due_at is NOT used for Mind Drop / Today logic.
      due_at: null, // Explicitly null - we don't rely on due_at
      // Prefer due_day, fallback to computing from due_date if needed
      due_day: (entity as any)?.due_day ?? null,
      due_time: (entity as any)?.due_time ?? null,
      time_estimate_minutes: (entity as any)?.time_estimate_minutes ?? null,
      time_window: (entity as any)?.time_window ?? null,
      // Date Intelligence fields for todos
      target_date: (entity as any)?.target_date ?? (entity?.views as any)?.target_date ?? null,
      scheduled_date:
        (entity as any)?.scheduled_date ?? (entity?.views as any)?.scheduled_date ?? null,
    },
    habit: {
      title: name || title || '',
      notes: rawDetails || '',
      schedule:
        entityFrequency === 'daily' ? 'daily' : entityFrequency === 'weekly' ? 'weekly' : 'custom',
      frequency_json: habitFrequencyJson, // Built from frequency + frequency_value columns
      subtype:
        (entity as any)?.subtype === 'start_habit' || (entity as any)?.subtype === 'break_habit'
          ? (entity as any)?.subtype
          : 'start_habit', // Validate habit subtype (not log subtypes)
      start_date: (entity as any)?.start_date ?? null,
      end_date: (entity as any)?.end_date ?? null,
      time_window: (entity as any)?.time_window ?? null,
    },
    tags: extractedTags, // Initialize tags from entity for all types
    stickyTags: normalizeMetaValues(tagsMeta?.sticky),
    tagTombstones: normalizeMetaValues(tagsMeta?.tombstones),
    mood: (entity as any)?.mood ?? null, // Hydrate mood for journal logs (Phase L2)
    logSubtypeOverride, // Phase L8: Manual log subtype override
    logIsPrivate, // Phase L9: Private flag for journal logs
    // Commitment fields (Phase 6) - for todos and notes
    commitment,
    commitmentNote,
    commitmentStartedAt,
    // Space and other common fields
    spaceId: (entity as any)?.space_id ?? null,
    // Reminder support (for journals and todos)
    reminderAt: reminders?.[0]?.when ?? null, // Map first reminder to reminderAt for backwards compat
    // Checklist mode: respect explicit has_list value from database, only auto-detect if not set
    isChecklistMode:
      baseType === 'log' &&
      (entity?.has_list === true || // User explicitly saved as list
        (entity?.has_list == null && // Not explicitly set yet - auto-detect
          (looksLikeSimpleCommaList(logBody) || looksLikeChecklistMarkup(logBody)))),
    // Key Dates: Link to an event
    linkedEventId: (entity as any)?.linked_event_id ?? null,
  };

  return payload;
}

function headerFor(base: BaseType, mode: 'create' | 'edit' | 'view', title?: string) {
  // Phase 6b: Show entity title in edit mode instead of generic "Edit"
  if ((mode === 'edit' || mode === 'view') && title) return title;
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

const styles = StyleSheet.create({
  // Phase 6c: Type selector - segmented control
  tabsContainer: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: 'rgba(191, 216, 192, 0.18)',
    padding: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8A8F8A',
  },
  tabActive: {
    backgroundColor: 'rgba(46, 85, 64, 0.08)',
  },
  tabLabelActive: {
    color: '#2E5540',
    fontWeight: '600',
  },
  textArea: {
    minHeight: 120,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    textAlignVertical: 'top',
  },

  /* Due date pill styling */
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  dueDateIcon: {
    marginRight: 6,
  },
  dueDateText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#222222',
  },

  /* Lock In feature styles */
  dueAndLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dueDateLeft: {
    flex: 1,
  },
  dueDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    minHeight: 44, // Ensure adequate touch target
  },
  lockInRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockIcon: {
    opacity: 0.7,
    marginRight: 2,
  },
  lockLabel: {
    fontSize: 13,
    color: '#222222',
    fontWeight: '500',
  },
  lockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#E0F0E5',
  },
  lockedBadgeText: {
    fontSize: 11,
    color: '#2E5540',
    fontWeight: '500',
  },

  /* Time estimate modal styles */
  timeEstimateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeEstimateOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    minWidth: '30%',
    alignItems: 'center',
  },
  timeEstimateOptionSelected: {
    backgroundColor: lightTokens.colors.moss,
  },
  timeEstimateOptionText: {
    fontSize: 14,
    color: '#333333',
  },
  timeEstimateOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timeEstimateClearButton: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  timeEstimateClearButtonText: {
    fontSize: 14,
    color: '#888888',
  },

  /* Habit date row styling */
  habitDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingLeft: 12,
  },
  habitDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  habitDateText: {
    fontSize: 13,
    color: '#666666',
  },

  /* Schedule Popover styles */
  schedulePopoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    minHeight: 44,
  },
  schedulePopoverLabel: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
  },
  schedulePopoverValue: {
    fontSize: 14,
    color: '#666666',
  },
  schedulePopoverDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },

  /* Title actions styling */
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  /* Details panel layout */
  detailsContainer: {
    paddingHorizontal: tokenSpacing.base,
    paddingVertical: tokenSpacing.sm,
    borderRadius: tokenRadius.md,
    backgroundColor: lightTokens.colors.surface || '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.border,
    // use token elevation for a subtle shadow
    ...lightTokens.elevation.lg,
  },

  controlButton: {
    minHeight: 36,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scopeSelector: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokenSpacing.md,
  },

  chip: {
    minHeight: 44,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
  },
  chipSmall: {
    minHeight: 44,
    paddingHorizontal: tokenSpacing.sm,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
    marginRight: tokenSpacing.sm,
    marginBottom: tokenSpacing.xs,
  },
  listItem: {
    alignItems: 'center',
    marginBottom: tokenSpacing.sm,
    minHeight: 44,
  },

  /* Detail row styles for redesigned To-Do details section */
  /* Details row styles - unified layout */
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 10,
  },
  detailsRowPressed: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  detailsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsRowIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailsRowLabel: {
    fontSize: 14,
    color: '#222222',
  },
  detailsRowValue: {
    fontSize: 14,
    color: '#8A8F8A',
  },
  deleteText: {
    color: '#D9534F',
    fontWeight: '500',
    fontSize: 14,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },

  /* Log meta row styles (Phase L2) */
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  logTimestampText: {
    fontSize: 13,
    color: '#666666',
  },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingVertical: 6,
    paddingLeft: 6,
  },
  moodButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F6F3', // subtle sage tint
  },
  moodButtonActive: {
    backgroundColor: '#CDE8D0', // deeper sage when selected
  },
  // New mood picker styles
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  moodChipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  moodPickerExpanded: {
    flexDirection: 'column',
    gap: 12,
    flex: 1,
  },
  moodCategoryRow: {
    flexDirection: 'column',
    gap: 6,
  },
  moodCategoryLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moodOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodOptionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  moodOptionChipActive: {
    // Active state handled inline
  },
  moodOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  moodDoneButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 4,
  },
  moodDoneButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  // Legacy mood pill styles (Phase L2, deprecated in L4)
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  moodPillText: {
    fontSize: 13,
  },

  /* Photo support styles (Phase L3) */
  photoContainer: {
    position: 'relative',
    width: '100%',
    marginTop: 12,
  },
  photoThumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  photoRemoveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  addPhotoButton: {
    alignSelf: 'flex-end',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  imageModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalImage: {
    width: '100%',
    height: '100%',
  },

  /* Multi-photo grid styles (Phase L5) */
  photoGridScroll: {
    marginBottom: 8,
  },
  photoGridContent: {
    gap: 8,
    paddingRight: 4,
  },
  photoThumbnailContainer: {
    position: 'relative',
    width: 80,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoGridThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
  },
  photoGridDeleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  addMorePhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    gap: 6,
  },
  addMorePhotosText: {
    fontSize: 14,
    color: '#666666',
  },

  /* ===== Schedule Modal Styles ===== */
  scheduleModalContent: {
    backgroundColor: '#FFFDF5',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 20,
    maxHeight: '85%',
  },
  scheduleModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 20,
  },
  scheduleModalSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
    marginTop: 16,
  },
  scheduleModalSection: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 12,
    padding: 12,
  },
  scheduleModalDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  scheduleModalDateText: {
    fontSize: 15,
    color: '#333333',
  },
  scheduleModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  scheduleModalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  scheduleModalCancelText: {
    fontSize: 16,
    color: '#333333',
  },
  scheduleModalSetButton: {
    backgroundColor: lightTokens.colors.moss,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  scheduleModalSetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  /* Frequency section styles */
  frequencyTabRow: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  frequencyTab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  frequencyTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: lightTokens.colors.moss,
  },
  frequencyTabText: {
    fontSize: 14,
    color: '#999999',
  },
  frequencyTabTextActive: {
    color: '#333333',
    fontWeight: '600',
  },
  frequencyOptionsColumn: {
    gap: 8,
  },
  frequencyOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  frequencyOptionSelected: {
    backgroundColor: lightTokens.colors.moss,
  },
  frequencyOptionText: {
    fontSize: 15,
    color: '#333333',
    textAlign: 'center',
  },
  frequencyOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  /* Days grid styles */
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  dayChipSelected: {
    backgroundColor: lightTokens.colors.moss,
  },
  dayChipText: {
    fontSize: 13,
    color: '#333333',
  },
  dayChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  /* Custom frequency styles */
  customFrequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customCountInput: {
    width: 50,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    textAlign: 'center',
    fontSize: 16,
  },
  customFrequencyLabel: {
    fontSize: 14,
    color: '#666666',
  },
  customUnitPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  customUnitOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  customUnitOptionSelected: {
    backgroundColor: lightTokens.colors.moss,
  },
  customUnitText: {
    fontSize: 13,
    color: '#333333',
  },
  customUnitTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  /* Time window grid */
  timeWindowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeWindowChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  timeWindowChipSelected: {
    backgroundColor: lightTokens.colors.moss,
  },
  timeWindowChipText: {
    fontSize: 13,
    color: '#333333',
  },
  timeWindowChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  /* Duration grid */
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  durationChipSelected: {
    backgroundColor: lightTokens.colors.moss,
  },
  durationChipText: {
    fontSize: 13,
    color: '#333333',
  },
  durationChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
