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
  Calendar,
  Pencil,
  RotateCw,
  Lock,
  Bell,
  Folder,
  ChevronRight,
  Trash2,
  Camera,
} from 'lucide-react-native';
import { useReducedMotion, conditionalAnimation, timingConfig } from '../../design/animations';
import { Box, Text, Button } from '../../ui';
import * as Haptics from 'expo-haptics';
import { Modal } from 'react-native';
import { format, parseISO, addDays, setHours, setMinutes } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import {
  lightTokens,
  darkTokens,
  spacing as tokenSpacing,
  borderRadius as tokenRadius,
} from '../../design/tokens';
import { useRepo } from '../../providers/RepoProvider';
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
} from './overlayV2.state';
import ToastUndo from './ToastUndo';
import {
  linkSelectedPerson,
  sanitizeSuggestedTags,
  filterMindDropTodoTags,
} from './overlayV2.mapping';
import { recordOverlayFeedback } from './overlayV2.feedback';
import { useOverlayV2Draft, readOverlayV2Draft, clearOverlayV2Draft } from './useOverlayV2Draft';
import { eventBus } from '../../lib/events/EventBus';
import { TagsRow, type TagsRowTag, type TagsRowSuggestion } from './fields/TagsRow';
// Phase 2B: useOverlayPrefill hook removed, but keep type for backward compatibility
import useOverlayPrefill, { type SuggestedTag as PrefillSuggestedTag } from './useOverlayPrefill';
import { normalizeTag, filterAndNormalizeTags } from '../../lib/tags/normalize';
import { extractMeaningfulTags } from '../../lib/tags/extractTags';
import { getEffectiveTags } from '../../lib/tags/getEffectiveTags';
import { getEffectiveLogSubtype } from '../../lib/logs/getEffectiveLogSubtype';
import { emitOverlayEvent } from '../../lib/telemetry/overlay';
import { getMindDropRawText } from './getMindDropRawText';
import { buildCanonicalFromMindDrop } from '../../lib/minddrop/buildCanonicalFromMindDrop';
import { resummarizeTitle } from '../../lib/minddrop/backgroundPrefill';
import {
  type FrequencyConfig,
  type DayOfWeek,
  frequencyToJson,
  jsonToFrequency,
  getFrequencyLabel,
  DAY_LABELS,
} from './frequencyHelpers';

const BASE_LABEL: Record<BaseType, string> = { log: 'Log', todo: 'To-Do', habit: 'Habit' };

// Preset time options for time picker
const PRESET_TIMES = [
  { label: '9:00 AM', hour: 9, minute: 0, key: '9:00-AM' },
  { label: '12:00 PM', hour: 12, minute: 0, key: '12:00-PM' },
  { label: '3:00 PM', hour: 15, minute: 0, key: '3:00-PM' },
  { label: '6:00 PM', hour: 18, minute: 0, key: '6:00-PM' },
  { label: '9:00 PM', hour: 21, minute: 0, key: '9:00-PM' },
] as const;

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
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, '');
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
 * Filter habit tags to keep only single-word, concrete activity tags (max 2).
 *
 * For Mind Drop → habit conversions, AI often returns multi-word phrases like
 * "morning routine" or generic tags. We want to keep only concrete, single-word
 * activity tags like "yoga", "exercise", "meditation".
 *
 * Rules:
 * - Keep only single-word tags (no spaces)
 * - Prioritize tags earlier in the list (AI confidence ordering)
 * - Maximum 2 tags to keep habits focused
 *
 * Example: ["yoga", "morning routine", "exercise"] → ["yoga", "exercise"]
 */
function filterHabitTags(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];

  const singleWordTags = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      // Remove tags with spaces (multi-word phrases)
      if (tag.includes(' ')) return false;
      // Remove empty tags
      if (!tag) return false;
      return true;
    });

  // Keep max 2 tags (prioritize earlier tags = higher AI confidence)
  return singleWordTags.slice(0, 2);
}

/**
 * Generic/placeholder tags that AI creates when it can't extract meaningful habits.
 * These are low-value tags that should be replaced with better AI suggestions.
 */
const GENERIC_HABIT_TAGS = new Set([
  'doing',
  'habit',
  'routine',
  'task',
  'activity',
  'action',
  'daily',
  'practice',
]);

/**
 * Check if a tag list contains ONLY generic/placeholder habit tags.
 * Returns true if all tags are generic (or empty), meaning we should replace them.
 */
function hasOnlyGenericHabitTags(tags: string[]): boolean {
  if (!tags || tags.length === 0) return true;

  const normalizedTags = tags.map((tag) =>
    tag
      .trim()
      .toLowerCase()
      .replace(/^[#@*]/, ''),
  );

  // Check if ALL tags are generic
  return normalizedTags.every((tag) => GENERIC_HABIT_TAGS.has(tag));
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

function mergeSuggestionEntries(
  base: PrefillSuggestedTag[],
  incoming: PrefillSuggestedTag[],
): PrefillSuggestedTag[] {
  if (incoming.length === 0 && base.length === 0) return base;
  const map = new Map<string, PrefillSuggestedTag>();

  const upsert = (entry: PrefillSuggestedTag | undefined | null) => {
    if (!entry || typeof entry.name !== 'string') return;
    const key = normalizeToTagKey(entry.name);
    if (!key) return;
    map.set(key, { name: key, lowConfidence: !!entry.lowConfidence });
  };

  base.forEach(upsert);
  incoming.forEach(upsert);

  return Array.from(map.values());
}

function areSuggestionListsEqual(
  a: PrefillSuggestedTag[] | null | undefined,
  b: PrefillSuggestedTag[] | null | undefined,
): boolean {
  if (a === b) return true;
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  if (arrA.length === 0) return true;
  for (let i = 0; i < arrA.length; i += 1) {
    const left = arrA[i];
    const right = arrB[i];
    if (left?.name !== right?.name) return false;
    if (!!left?.lowConfidence !== !!right?.lowConfidence) return false;
  }
  return true;
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

function normalizePrefillSuggestions(
  text: string,
  entries: PrefillSuggestedTag[] | null | undefined,
  tombstones: Set<string>,
): PrefillSuggestedTag[] {
  if (!entries || entries.length === 0) return [];

  const lookup = new Map<string, boolean>();
  entries.forEach((entry) => {
    if (!entry || typeof entry.name !== 'string') return;
    const key = normalizeToTagKey(entry.name);
    if (!key) return;
    if (!lookup.has(key)) lookup.set(key, !!entry.lowConfidence);
  });

  const sanitized = sanitizeSuggestedTags(
    text,
    entries.map((entry) => (typeof entry?.name === 'string' ? entry.name : '')),
  );

  const result: PrefillSuggestedTag[] = [];
  const seen = new Set<string>();
  for (const name of sanitized) {
    const key = normalizeToTagKey(name);
    if (!key) continue;
    if (tombstones.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name: key, lowConfidence: lookup.get(key) ?? false });
  }

  return result;
}

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
const SHEET_H = Math.round(Dimensions.get('window').height * 0.8);

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

// Mood options for journal logs (Phase L2)
const MOOD_OPTIONS = [
  { value: 'pos' as const, emoji: '😊', label: 'Good' },
  { value: 'neu' as const, emoji: '😐', label: 'Okay' },
  { value: 'neg' as const, emoji: '😔', label: 'Low' },
];

// Helper to format log timestamp (Phase L2)
function formatLogTimestamp(mode: 'create' | 'edit', entity: any | null): string {
  try {
    if (mode === 'edit' && entity) {
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
function getLogSubtypeChipLabel(
  subtype: 'journal' | 'list' | 'reference' | 'idea' | 'plain',
): string | null {
  switch (subtype) {
    case 'journal':
      return 'Journal';
    case 'list':
      return 'List';
    case 'reference':
      return 'Reference';
    case 'idea':
      return 'Idea';
    case 'plain':
    default:
      return null;
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
  } = props;

  // Extract full entity from props (passed by OverlayHost in edit mode)
  const fullEntity = (props as any).entity ?? null;

  const repo = useRepo();
  const [state, dispatch] = useReducer(v2Reducer, initialV2State);
  const baseType = state.baseType;
  const isBreakHabit = baseType === 'habit' && state.habit.subtype === 'break_habit';

  // Log kind detection (Phase L1)
  const isLog = baseType === 'log';
  const logKind = isLog ? state.log.kind : 'basic';
  const isJournalLog = isLog && logKind === 'journal';
  const isIdeaLog = isLog && logKind === 'idea';
  const isListLog = isLog && logKind === 'list';

  // Phase L8: Derive effective log subtype from manual override or entity subtype or detected tags
  // Priority order: manual override > tags > entity subtype > AI classification > fallback
  const effectiveLogSubtype: 'journal' | 'list' | 'reference' | 'idea' | 'plain' = useMemo(() => {
    if (!isLog) return 'plain';

    // 1. Manual override takes HIGHEST precedence (user explicitly chose)
    if (state.logSubtypeOverride) return state.logSubtypeOverride;

    // 2. Tag-based detection (auto-detection from #list, #journal, etc.)
    if (state.tags.includes('list')) return 'list';
    if (state.tags.includes('journal')) return 'journal';
    if (state.tags.includes('idea')) return 'idea';
    if (state.tags.includes('reference')) return 'reference';

    // 3. Fallback to entity.subtype if present (edit mode)
    const entity = initialEntity as any;
    const rawSubtype = entity?.subtype as string | undefined;
    if (
      rawSubtype === 'journal' ||
      rawSubtype === 'list' ||
      rawSubtype === 'reference' ||
      rawSubtype === 'idea'
    ) {
      return rawSubtype;
    }

    // For new logs or when entity has no subtype, AI classification will be used in toCreateOrUpdateInput
    // Return 'plain' here as placeholder - actual AI classification happens at save time
    return 'plain';
  }, [isLog, state.logSubtypeOverride, initialEntity, state.tags]);

  // Journal detection for mood selector (Phase L4) - now uses effectiveLogSubtype
  const isJournal = isLog && effectiveLogSubtype === 'journal';

  // Phase L9: Show Private toggle only for journal logs
  const showLogPrivateToggle = baseType === 'log' && effectiveLogSubtype === 'journal';

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
  const [dateModalTarget, setDateModalTarget] = useState<'todo' | 'reminder' | null>(null);
  const [showSpaceModal, setShowSpaceModal] = useState(false);

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
  // Frequency picker state
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [frequencyTab, setFrequencyTab] = useState<'simple' | 'days' | 'custom'>('simple');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [customCount, setCustomCount] = useState('1');
  const [customUnit, setCustomUnit] = useState<'day' | 'week' | 'month'>('week');
  // save error UI
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [dueToastMessage, setDueToastMessage] = useState<string | null>(null);

  // Photo support for logs (Phase L3 - single photo)
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  // Multi-photo support for logs (Phase L5)
  const [logPhotos, setLogPhotos] = useState<LogPhoto[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Photo Drop: hydrate logPhotos from initialLogPhotoUris for create-mode logs (once)
  const initialLogPhotosHydratedRef = useRef(false);

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

  // Mood selector for journal logs (Phase L4)
  const [mood, setMood] = useState<'happy' | 'neutral' | 'sad'>('neutral');

  // focus states for accessibility focus rings
  const [bodyFocused, setBodyFocused] = useState(false);
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
    repo,
    userId ?? '',
    null,
    baseType === 'todo' ? 'todo' : baseType === 'habit' ? 'habit' : 'note',
  );
  const [spaces, setSpaces] = useState<any[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<PrefillSuggestedTag[]>([]);
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
  const aiTitlePersistedRef = useRef(false);
  const textInputRef = useRef<TextInput | null>(null);
  // feature flag for commitments (soft rollout)
  const commitmentsOn = process?.env?.EXPO_PUBLIC_FEATURE_COMMITMENTS === 'on';
  const currentTagsRef = useRef<TagKey[]>(state.tags);
  useEffect(() => {
    currentTagsRef.current = state.tags;
  }, [state.tags]);
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

  // load spaces when details panel expands so selector can show options
  useEffect(() => {
    let mounted = true;
    if (!state.expanded) return;
    (async () => {
      try {
        const s = await repo.listSpaces();
        if (mounted) setSpaces(s || []);
      } catch (e) {
        if (__DEV__) console.warn('[UnifiedOverlayV2] listSpaces failed', e);
        if (mounted) setSpaces([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [repo, state.expanded]);

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
    }
  }, [visible, showSaveToast]);

  useEffect(() => {
    if (baseType !== 'todo' && dueToastMessage) {
      setDueToastMessage(null);
    }
  }, [baseType, dueToastMessage]);

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

  const handleTypeSelect = useCallback(
    (next: BaseType) => {
      if (state.baseType === next) return;
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

  const draftKey = useMemo(
    () => `overlayV2:draft:${mode}:${baseType}:${initialSpaceId ?? 'none'}`,
    [mode, baseType, initialSpaceId],
  );

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

  useEffect(() => {
    let mounted = true;
    readOverlayV2Draft(draftKey).then((v) => {
      if (mounted && v && !currentText) dispatch({ type: 'SET_TEXT', text: v });
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // autosave on change
  useOverlayV2Draft(draftKey, currentText);

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

  useEffect(() => {
    if (mode !== 'create') return;
    if (createPrefillAppliedRef.current) return;

    const override = deriveBaseTypeFromInitial((initialEntity as any)?.type);
    const rawText = typeof initialText === 'string' ? initialText : '';
    const hasText = rawText.trim().length > 0;

    if (!override && !hasText) {
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

    if (Object.keys(payload).length > 0) {
      dispatch({ type: 'HYDRATE_EDIT', payload });
    }

    createPrefillAppliedRef.current = true;
  }, [mode, initialEntity, initialText, dispatch]);

  // Initial defaults (match brief: text-first; first line becomes title)
  useEffect(() => {
    if (mode === 'edit' && initialEntity) {
      const payload = buildDraftPayloadFromEntity(initialEntity);
      dispatch({ type: 'HYDRATE_EDIT', payload } as any);

      // Hydrate mood for journal logs (Phase L4)
      const entity = initialEntity as any;
      if (
        entity?.mood &&
        (entity.mood === 'happy' || entity.mood === 'neutral' || entity.mood === 'sad')
      ) {
        setMood(entity.mood);
      }

      // Hydrate photo for logs (Phase L3)
      if (entity?.photo_uri) {
        setPhotoUri(entity.photo_uri);
      }
    }
  }, [mode, initialEntity]);

  // Load existing log photos from database (Phase L5)
  useEffect(() => {
    const loadLogPhotos = async () => {
      console.log('[UnifiedOverlayV2] loadLogPhotos effect:', {
        mode,
        hasInitialEntity: !!initialEntity,
        baseType,
        noteId: (initialEntity as any)?.id,
      });
      if (mode !== 'edit' || !initialEntity || baseType !== 'log') return;

      const noteId = (initialEntity as any)?.id;
      if (!noteId) return;

      try {
        console.log('[UnifiedOverlayV2] Loading photos for note:', noteId);
        const data = await repo.listLogPhotos(noteId);

        console.log('[UnifiedOverlayV2] Loaded photos from DB:', data);
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
  }, [mode, initialEntity, baseType, repo]);

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
        await repo.update({
          id: entity.id,
          patch: {
            views: {
              ...views,
              minddrop_retry_attempted: true,
            },
          },
        });

        console.log('[MindDrop.FallbackRetry] Retry completed', { entityId: entity.id });
      } catch (err) {
        console.error('[MindDrop.FallbackRetry] Retry failed', err);

        // Still mark as attempted to prevent infinite retries
        try {
          await repo.update({
            id: entity.id,
            patch: {
              views: {
                ...views,
                minddrop_retry_attempted: true,
                ai_failed: true, // Keep failure state
              },
            },
          });
        } catch (updateErr) {
          console.error('[MindDrop.FallbackRetry] Failed to mark retry attempt', updateErr);
        }
      }
    };

    attemptFallbackPrefill();
  }, [mode, initialEntity, repo]);

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
    const fetchableRepo = repo as any;
    if (!entityId || typeof fetchableRepo?.getById !== 'function') {
      hasLoadedEditTagsRef.current = true;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const entity = await fetchableRepo.getById(entityId);
        if (cancelled) return;
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
      } catch (err) {
        if (__DEV__) console.warn('[UnifiedOverlayV2] failed to preload edit tags', err);
      } finally {
        if (!cancelled) hasLoadedEditTagsRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, initialEntity, repo]);

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

  const prefillSuggestionsRef = useRef<PrefillSuggestedTag[]>([]);
  const suggestedTitleRef = useRef<string | null>(null);

  // Track previous title to detect manual edits after an AI suggestion was applied
  const prevTitleRef = useRef<string | null>(null);

  const tagTombstoneSet = useMemo(() => {
    const set = new Set<string>();
    (state.tagTombstones ?? []).forEach((entry) => {
      const key = normalizeToTagKey(entry);
      if (key) set.add(key);
    });
    return set;
  }, [state.tagTombstones]);

  const resuggestRequestIdRef = useRef(0);
  const resuggestAppliedIdRef = useRef(0);

  // Phase 3: Generate tag suggestions deterministically using extractMeaningfulTags
  const sanitizedTagSuggestions = useMemo<PrefillSuggestedTag[]>(() => {
    if (!currentText || currentText.trim().length === 0) return [];

    // Determine subtype for tag extraction
    let extractionSubtype: string | undefined;
    if (baseType === 'log') {
      // Use effectiveLogSubtype for logs
      extractionSubtype = effectiveLogSubtype === 'plain' ? undefined : effectiveLogSubtype;
    }

    // Extract meaningful tags deterministically
    const extractedTags = extractMeaningfulTags(currentText, extractionSubtype);

    // Filter out tags that are already added or tombstoned
    const results: PrefillSuggestedTag[] = [];
    for (const tag of extractedTags) {
      const key = normalizeToTagKey(tag);
      if (!key || tagTombstoneSet.has(key)) continue;
      if (state.tags.includes(key)) continue; // Skip if already added
      results.push({ name: key, lowConfidence: false });
    }

    return results;
  }, [currentText, baseType, effectiveLogSubtype, tagTombstoneSet, state.tags]);

  const filteredTagSuggestions = useMemo(() => {
    if (sanitizedTagSuggestions.length === 0) return [];

    let filtered = sanitizedTagSuggestions.filter((entry) => !state.tags.includes(entry.name));

    // For habits, filter to single-word, concrete activity tags (max 2)
    if (baseType === 'habit') {
      const tagNames = filtered.map((entry) => entry.name);
      const habitFiltered = filterHabitTags(tagNames);
      filtered = filtered.filter((entry) => habitFiltered.includes(entry.name));
    }

    return filtered;
  }, [sanitizedTagSuggestions, state.tags, baseType]);

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

  const suggestionChips = useMemo((): TagsRowSuggestion[] => {
    if (filteredTagSuggestions.length === 0) return [];
    const entries: TagsRowSuggestion[] = [];
    filteredTagSuggestions.forEach((entry) => {
      const { canonical, slug } = toCanonicalParts(entry.name);
      if (!canonical || !slug) return;
      entries.push({
        canonical,
        slug,
        provenance: 'AI',
        lowConfidence: entry.lowConfidence,
      });
    });
    return entries;
  }, [filteredTagSuggestions]);

  const hasLowConfidenceSuggestions = useMemo(
    () => suggestionChips.some((tag) => !!tag.lowConfidence),
    [suggestionChips],
  );

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

  const suggestionCanonicalMap = useMemo(() => {
    const map = new Map<string, string>();
    suggestionChips.forEach((chip) => {
      if (!map.has(chip.slug)) {
        map.set(chip.slug, chip.canonical);
      }
    });
    return map;
  }, [suggestionChips]);

  const activeTagChips = useMemo((): TagsRowTag[] => {
    if (!Array.isArray(state.tags)) return [];
    const entries: TagsRowTag[] = [];
    state.tags.forEach((slug) => {
      const canonicalCandidate =
        stickyCanonicalMap.get(slug) ??
        suggestionCanonicalMap.get(slug) ??
        toCanonicalParts(slug).canonical;
      if (!canonicalCandidate) return;
      const provenance = stickyCanonicalMap.has(slug)
        ? 'You'
        : suggestionCanonicalMap.has(slug)
          ? 'AI'
          : undefined;
      entries.push({
        canonical: canonicalCandidate,
        slug,
        provenance,
      });
    });
    return entries;
  }, [state.tags, stickyCanonicalMap, suggestionCanonicalMap]);

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

      setSuggestedTags((prev) =>
        prev.filter((entry) => normalizeToTagKey(entry.name) !== normalized),
      );

      setTagsDirty(true); // Mark tags as user-modified
    },
    [
      dispatch,
      state.list,
      state.mood,
      state.tags,
      state.stickyTags,
      state.tagTombstones,
      setSuggestedTags,
    ],
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
        extractionSubtype = effectiveLogSubtype === 'plain' ? undefined : effectiveLogSubtype;
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

    const options = ['Journal', 'List', 'Reference', 'Idea', 'Clear subtype', 'Cancel'];
    const destructiveButtonIndex = 4; // Clear subtype
    const cancelButtonIndex = 5;

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

          const subtypeMap: Record<number, 'journal' | 'list' | 'reference' | 'idea' | null> = {
            0: 'journal',
            1: 'list',
            2: 'reference',
            3: 'idea',
            4: null, // Clear subtype
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
          text: 'List',
          onPress: () => dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value: 'list' }),
        },
        {
          text: 'Reference',
          onPress: () => dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value: 'reference' }),
        },
        {
          text: 'Idea',
          onPress: () => dispatch({ type: 'SET_LOG_SUBTYPE_OVERRIDE', value: 'idea' }),
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
    (iso: string | null, options?: { label?: string }) => {
      dispatch({ type: 'SET_TODO_DUE', due_at: iso });
      if (iso) {
        const formatted = options?.label ?? (safeFormat(iso) || 'selected date');
        showDueToast(`Due set for ${formatted}`);
        void emitOverlayEvent({ type: 'overlay_due_set' });
      } else {
        showDueToast('Due cleared');
        void emitOverlayEvent({ type: 'overlay_due_clear' });
      }
    },
    [dispatch, showDueToast],
  );

  // Phase 2: Removed prefill suggestion normalization effect - overlay no longer runs AI prefill

  // theme / background for overlay (phase‑8 visual polish)
  const colorMode = useColorScheme();
  // Phase 6a: Overlay surface background - light mode should be pure white for a clean sheet look
  const sheetBackground = colorMode === 'dark' ? darkTokens.colors.linen : '#FFFFFF';
  const sheetBorderColor = colorMode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const handleColor = colorMode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.16)';
  const typeTabActiveColor =
    colorMode === 'dark' ? darkTokens.colors.charcoal : lightTokens.colors.charcoal;
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
    mood?: 'happy' | 'neutral' | 'sad', // Phase L4: Mood for journals
    effectiveLogSubtype?: 'journal' | 'list' | 'reference' | 'idea' | 'plain', // Phase L8: Manual log subtype
  ) {
    const isEditingMindDrop = mode === 'edit' && (existingEntity as any)?.origin === 'catchall';

    // For logs: if effectiveLogSubtype is 'plain', use AI to classify the subtype
    // BUT: Skip AI classification for Mind Drop edits since buildCanonicalFromMindDrop already does it
    let aiClassifiedSubtype: 'journal' | 'list' | 'reference' | 'idea' | 'plain' | undefined;

    if (baseType === 'log' && effectiveLogSubtype === 'plain' && s.log.body && !isEditingMindDrop) {
      try {
        aiClassifiedSubtype = await getEffectiveLogSubtype(s.log.body);
        console.log('[UnifiedOverlayV2] AI classified log subtype:', aiClassifiedSubtype);
      } catch (err) {
        console.warn(
          '[UnifiedOverlayV2] AI log subtype classification failed, using fallback',
          err,
        );
        aiClassifiedSubtype = 'journal'; // Fallback to journal on AI failure
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

    // Add extracted tags first
    extractedTags.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!combined.has(key)) combined.set(key, `#${tag}`);
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
    const viewsWithPrefillFlag = existingEntity?.views || existingViews;

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

        const dueAt = coerceIsoTimestamp(s.todo.due_at) ?? coerceIsoTimestamp(s.reminderAt);
        return {
          type: 'todo' as const,
          ...canonical, // Spread canonical fields (title, name, body, tags, tags_meta, canonicalType, labels)
          due_at: dueAt,
          space_id: s.spaceId ?? spaceId ?? null,
          origin: 'catchall' as const,
          views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
          // Commitment fields (only for todos/habits)
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
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

      const dueAt = coerceIsoTimestamp(s.todo.due_at) ?? coerceIsoTimestamp(s.reminderAt);
      return {
        type: 'todo' as const,
        title: effectiveTitle,
        name: effectiveTitle,
        details: rawDetails || null,
        due_at: dueAt,
        space_id: s.spaceId ?? spaceId ?? null,
        origin: 'catchall' as const,
        views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
        ...tagsPayload, // Conditionally include tags/tags_meta
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
        },
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

        return {
          type: 'habit' as const,
          ...canonical, // Spread canonical fields (title, name, notes, tags, tags_meta, canonicalType, labels)
          frequency: s.habit.schedule ?? 'custom',
          frequency_value: s.habit.frequency_json ?? null, // Maps to frequency_json column
          subtype: s.habit.subtype ?? 'start_habit', // Build/Break habit mode
          space_id: s.spaceId ?? spaceId ?? null,
          origin: 'catchall' as const,
          views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
          // Commitment fields (only for todos/habits)
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
        };
      }

      return {
        type: 'habit' as const,
        title: s.habit.title || firstLine(s.habit.notes) || 'Untitled',
        notes: s.habit.notes || null,
        frequency: s.habit.schedule ?? 'custom',
        frequency_value: s.habit.frequency_json ?? null, // Maps to frequency_json column
        subtype: s.habit.subtype ?? 'start_habit', // Build/Break habit mode
        space_id: s.spaceId ?? spaceId ?? null,
        origin: 'catchall' as const,
        views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
        ...tagsPayload, // Conditionally include tags/tags_meta
        // Commitment fields (only for todos/habits)
        ...{
          commitment: s.commitment,
          commitment_note: s.commitment ? s.commitmentNote || null : null,
          commitment_started_at: s.commitment ? coerceIsoTimestamp(s.commitmentStartedAt) : null,
        },
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

      // Mood support for journal logs (Phase L4)
      const moodPatch = s.log.kind === 'journal' && mood ? { mood } : {};

      // fmt: list tag overrides explicit format
      // Only use valid fmt values: 'bullets', 'numbers', 'checkboxes'
      let fmtVal: any = null;
      if (s.tags.includes('list')) fmtVal = 'checkboxes';
      else if (s.format && s.format !== 'plain') fmtVal = s.format; // Skip 'plain' as it's invalid

      const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

      const reminderIso = coerceIsoTimestamp(s.reminderAt);
      const datePatch = reminderIso ? { date: reminderIso } : {};

      // Phase L8: Use effective log subtype for Mind Drop logs
      // For list/journal/idea, use the detected subtype
      // For plain, use null (database allows null subtypes)
      const subtype = finalLogSubtype === 'plain' ? null : finalLogSubtype;

      // For Mind Drop logs confirmed as logs, ensure canonicalType and labels are set
      // This clears catchall/needs_review labels and marks the item as a confirmed log
      const logConfirmationPatch = {
        canonicalType: 'log' as const,
        labels: ['log'] as const,
        subtype: subtype,
      };

      // Photo support for logs (Phase L3)
      const photoPatch = photoUri ? { photo_uri: photoUri } : {};

      // Phase L7: Private mode support (deprecated - kept for compatibility)
      const privatePatch = { private: s.log.private };

      // Phase L9: Private toggle for journal logs via views.private_journal
      const viewsWithPrivate =
        finalLogSubtype === 'journal'
          ? { ...viewsWithPrefillFlag, private_journal: !!s.logIsPrivate }
          : viewsWithPrefillFlag;

      return {
        type: 'note' as const,
        ...canonical, // Spread canonical fields (title, body, tags, tags_meta, canonicalType, labels)
        ...logConfirmationPatch, // Override with confirmed log status and correct subtype
        space_id: s.spaceId ?? spaceId ?? null,
        origin: 'catchall' as const,
        views: viewsWithPrivate, // Add views with minddrop_prefilled_v1 and private_journal flags
        ...moodPatch,
        ...fmtPatch,
        ...datePatch,
        ...photoPatch,
        ...privatePatch,
      };
    }

    // Phase L8: Use effective log subtype for base note payload
    // For list/journal/idea, use the detected subtype
    // For plain, use null (database allows null subtypes)
    const subtype2 = finalLogSubtype === 'plain' ? null : finalLogSubtype;

    // Preserve AI-generated title when editing existing entities
    // Only use fallback (firstLine) for new entities or when user explicitly cleared title
    // Phase L10: For new logs from Mind Drop (create mode), always use full body as title
    const preserveExistingTitle = mode === 'edit' && initialEntity && (initialEntity as any)?.title;
    const isNewLogFromMindDrop = mode === 'create' && s.log.body && !s.log.title;
    const derivedTitle = isNewLogFromMindDrop
      ? s.log.body // Use full body for new Mind Drop logs
      : s.log.title ||
        (preserveExistingTitle ? (initialEntity as any).title : firstLine(s.log.body)) ||
        'Untitled note';

    // base note payload (for non-Mind Drop logs or manual log creation)
    const base = {
      type: 'note' as const,
      subtype: subtype2,
      canonicalType: 'log' as const, // Mark as confirmed log
      labels: ['log'] as const, // Mark as confirmed log
      title: derivedTitle,
      body: s.log.body,
      space_id: s.spaceId ?? spaceId ?? null,
      origin: 'catchall' as const,
      views: viewsWithPrefillFlag, // Add views with minddrop_prefilled_v1 flag
      ...tagsPayload, // Conditionally include tags/tags_meta
    } as any;

    // Mood support for journal logs (Phase L4)
    const moodPatch2 = s.log.kind === 'journal' && mood ? { mood } : {};

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

    // Phase L7: Private mode support (deprecated - kept for compatibility)
    const privatePatch = { private: s.log.private };

    // Phase L9: Private toggle for journal logs via views.private_journal
    const viewsWithPrivate2 =
      finalLogSubtype === 'journal'
        ? { ...viewsWithPrefillFlag, private_journal: !!s.logIsPrivate }
        : viewsWithPrefillFlag;

    return {
      ...base,
      views: viewsWithPrivate2, // Override with views containing private_journal
      ...moodPatch2,
      ...fmtPatch,
      ...datePatch,
      ...photoPatch,
      ...privatePatch,
    };
  }

  const onSave = useCallback(async () => {
    if (!canSave) return;
    // If offline, surface a small hint and keep the draft (enqueue behavior no-op here)
    if (isOffline) {
      setSaveError("You're offline — Save will keep the draft.");
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
        mood, // Phase L4: Pass mood for journals
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
      const result =
        mode === 'edit' && (initialEntity as any)?.id
          ? await repo.update({ id: (initialEntity as any).id, patch: input as any })
          : await repo.create(input as any);

      // Handle multi-photo uploads and deletions for logs (Phase L5)
      if (baseType === 'log' && result?.id && userId) {
        console.log('[UnifiedOverlayV2] Processing log photos:', {
          baseType,
          noteId: result.id,
          userId,
          photoCount: logPhotos.length,
          photos: logPhotos.map((p) => ({ url: p.url, isNew: p.isNew, isDeleted: p.isDeleted })),
        });
        try {
          const noteId = result.id;
          const { supabase } = await import('../../lib/supabase/client');

          // Process deletions first
          for (const photo of logPhotos) {
            if (photo.isDeleted && photo.id) {
              try {
                // Delete from database
                await repo.deleteLogPhoto(photo.id);

                // Try to delete from storage (best effort)
                if (photo.url && photo.url.includes('log-photos/')) {
                  const pathMatch = photo.url.match(/log-photos\/(.+)$/);
                  if (pathMatch) {
                    await supabase.storage.from('log-photos').remove([pathMatch[1]]);
                  }
                }
              } catch (err) {
                console.error('[UnifiedOverlayV2] Error deleting photo:', err);
              }
            }
          }

          // Process new photo uploads
          const activePhotos = logPhotos.filter((p) => !p.isDeleted);
          console.log('[UnifiedOverlayV2] Active photos to process:', activePhotos.length);
          for (let i = 0; i < activePhotos.length; i++) {
            const photo = activePhotos[i];
            console.log('[UnifiedOverlayV2] Processing photo', i, ':', {
              isNew: photo.isNew,
              url: photo.url.substring(0, 50),
            });
            if (photo.isNew && photo.url.startsWith('file://')) {
              try {
                console.log('[UnifiedOverlayV2] Uploading new photo...');
                // Generate unique storage path
                const fileExt = photo.url.split('.').pop() || 'jpg';
                const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
                const storagePath = `${userId}/${noteId}/${uniqueId}.${fileExt}`;
                console.log('[UnifiedOverlayV2] Storage path:', storagePath);

                // React Native: Create ArrayBuffer from file URI
                console.log('[UnifiedOverlayV2] Fetching file...');
                const response = await fetch(photo.url);
                console.log('[UnifiedOverlayV2] Converting to ArrayBuffer...');
                const arrayBuffer = await response.arrayBuffer();
                console.log('[UnifiedOverlayV2] ArrayBuffer size:', arrayBuffer.byteLength);

                // Upload to storage
                console.log('[UnifiedOverlayV2] Uploading to Supabase storage...');
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('log-photos')
                  .upload(storagePath, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: false,
                  });

                if (uploadError) {
                  console.error('[UnifiedOverlayV2] Failed to upload photo:', uploadError);
                  continue;
                }
                console.log('[UnifiedOverlayV2] Upload successful:', uploadData);

                // Get public URL
                const { data: urlData } = supabase.storage
                  .from('log-photos')
                  .getPublicUrl(storagePath);

                const publicUrl = urlData?.publicUrl || storagePath;
                console.log('[UnifiedOverlayV2] Public URL:', publicUrl);

                // Insert into database
                console.log('[UnifiedOverlayV2] Inserting photo record into log_photos table...');
                await repo.insertLogPhoto({
                  noteId,
                  url: publicUrl,
                  position: i,
                });
                console.log('[UnifiedOverlayV2] Photo record inserted successfully');
              } catch (err) {
                console.error('[UnifiedOverlayV2] Error uploading photo:', err);
              }
            } else if (!photo.isNew && photo.id) {
              // Update position for existing photos
              try {
                await repo.updateLogPhotoPosition(photo.id, i);
              } catch (err) {
                console.error('[UnifiedOverlayV2] Error updating photo position:', err);
              }
            }
          }
        } catch (err) {
          console.error('[UnifiedOverlayV2] Error processing log photos:', err);
        }
      }

      // After a successful create/update, link any pending Phase‑8 tags/people
      try {
        const itemType = baseType === 'todo' ? 'todo' : baseType === 'habit' ? 'habit' : 'note';

        // Link any pending tags first (non-blocking failures)
        if ((phase8Links as any)?.pendingTagIds?.length) {
          for (const tagId of (phase8Links as any).pendingTagIds) {
            try {
              // Cast to any for Phase 8 helpers
              await (repo as any).linkTag({ itemId: result.id, tagId, itemType });
            } catch (err) {
              console.error('[Phase8] Failed to link pending tag to item:', err);
            }
          }
        }

        // Link any pending people
        if ((phase8Links as any)?.pendingPeople?.length) {
          for (const person of (phase8Links as any).pendingPeople) {
            try {
              await (repo as any).linkPerson({
                itemId: result.id,
                itemType,
                personName: person.personName,
                personEmail: person.personEmail,
              });
            } catch (err) {
              console.error('[Phase8] Failed to link pending person to item:', err);
            }
          }
        }

        // If there are pendingPeople entries (temp links), try to persist them
        if ((phase8Links as any)?.pendingPeople?.length) {
          for (const p of (phase8Links as any).pendingPeople) {
            try {
              const pid = p.id; // temp id from usePhase8LinksState (e.g., temp-...)
              if (pid && typeof (repo as any).linkPersonToEntity === 'function') {
                await (repo as any).linkPersonToEntity({ entityId: result.id, personId: pid });
              } else if (
                pid &&
                (repo as any).entities &&
                typeof (repo as any).entities.linkPerson === 'function'
              ) {
                await (repo as any).entities.linkPerson({ entityId: result.id, personId: pid });
              } else if (
                pid &&
                (repo as any).people &&
                typeof (repo as any).people.linkToEntity === 'function'
              ) {
                await (repo as any).people.linkToEntity({ entityId: result.id, personId: pid });
              }
            } catch (err) {
              console.error('[Phase8] Failed to persist pending person link:', err);
            }
          }
        }

        // Clear any pending markers in the links state (UI cleanup)
        try {
          phase8Links.clearPendingPeople?.();
          phase8Links.clearPendingTags?.();
        } catch (err) {
          // ignore
        }
      } catch (err) {
        // Non-fatal: linking errors should not block the save flow
        console.error('[UnifiedOverlayV2] post-save linking failed', err);
      }
      // Attempt to link the explicitly selected person (non-blocking)
      try {
        await linkSelectedPerson(repo, result?.id, (state as any).person?.id);
      } catch (err) {
        console.error('[UnifiedOverlayV2] person link failed', err);
      }

      setIsSaving(false);
      await clearOverlayV2Draft(draftKey);

      // Fire a subtle header pulse and toast success without blocking the close flow
      if (!reduceMotion) {
        try {
          // fire a success haptic (non-blocking)
          Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType?.Success);
        } catch (err) {
          // ignore
        }
        try {
          headerPulse.value = conditionalAnimation(
            withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 220 })),
            0,
            reduceMotion,
          );
        } catch (err) {
          // ignore mocked reanimated environments
        }
      }

      setShowSaveToast(true);
      if (saveToastTimerRef.current) {
        clearTimeout(saveToastTimerRef.current as any);
      }
      saveToastTimerRef.current = setTimeout(() => {
        setShowSaveToast(false);
        saveToastTimerRef.current = null;
      }, 1500) as unknown as number;

      void emitOverlayEvent({
        type: 'overlay_save',
        entryType: baseType,
        titleLen: telemetryTitle.length,
        tagCount: telemetryTagCount,
        dueAt: telemetryDueAt ?? null,
      });

      // Emit overlay saved analytics and call parent onSaved if supplied
      try {
        const savedType = (result as any)?.type ?? baseType;
        eventBus.emit('OverlaySaved', { id: result?.id, type: savedType });
      } catch (e) {
        // ignore
      }
      try {
        // Notify parent (OverlayHost) so it can run its saved hooks
        onSaved?.({
          id: result?.id,
          type: (result as any)?.type ?? baseType,
          savedEntity: result,
        } as any);
      } catch (e) {
        // ignore
      }

      // show a quick save pulse before closing (respect reduced motion)
      const runClose = () => onClose?.();
      if (reduceMotion) {
        runClose();
      } else {
        // animate via reanimated shared value and call close after duration
        const dur = 200;
        try {
          if (typeof (savePulse as any)?.value !== 'undefined') {
            (savePulse as any).value = conditionalAnimation(
              withSequence(withTiming(1, { duration: dur }), withTiming(0, { duration: dur })),
              0,
              reduceMotion,
            );
          }
        } catch (err) {
          // ignore mocked reanimated environments
        }
        setTimeout(() => runClose(), dur * 2);
      }
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
    draftKey,
    onClose,
    isOffline,
    reduceMotion,
    headerPulse,
    reminders,
    photoUri, // Phase L3: Photo dependency
    mood, // Phase L4: Mood dependency
  ]);

  const handleCancel = useCallback(async () => {
    await clearOverlayV2Draft(draftKey);
    onClose?.();
  }, [draftKey, onClose]);

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          alignSelf: 'stretch',
        }}
      >
        {/* Bottom-anchored sheet: max 80% of viewport, rounded top corners */}
        <RNAnimated.View
          style={{
            width: '100%',
            opacity: sheetOpacity,
            transform: [{ translateY: sheetTranslateY }],
          }}
        >
          <View
            style={{
              width: '100%',
              alignSelf: 'stretch',
              height: SHEET_H,
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
                    colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(46, 125, 106, 0.12)',
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
            {/* Grab handle for visual separation */}
            <View
              style={{
                alignItems: 'center',
                paddingTop: tokenSpacing.sm,
                paddingBottom: 4,
                backgroundColor: sheetBackground,
              }}
            >
              <View
                style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: handleColor }}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
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
                    {/* Lock In badge */}
                    {isLockedIn ? (
                      <View style={styles.lockedBadge}>
                        <Text style={styles.lockedBadgeText}>⚡ Locked In</Text>
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
                            color: colorMode === 'dark' ? 'rgba(255, 255, 255, 0.65)' : '#5a5a5a',
                          }}
                        >
                          {logSubtypeLabel}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

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

                  {/* Close button - Phase 6b */}
                  <Pressable
                    onPress={handleCancel}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <CloseIcon
                      size={20}
                      color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'}
                    />
                  </Pressable>
                </View>
                {/* Phase 6b: Removed subtitle to avoid duplication - title now shows in header */}
              </View>
            </Box>

            {/* Body: entire form stack in a single scroll context */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 0 }}
            >
              {/* Phase 6c: Type selector - underline style directly below header */}
              <View style={[styles.typeTabsRow, { marginTop: 12, marginBottom: 10 }]}>
                {(['log', 'todo', 'habit'] as BaseType[]).map((t) => {
                  const selected = baseType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => handleTypeSelect(t)}
                      style={styles.typeTab}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text
                        style={[
                          styles.typeTabLabel,
                          {
                            color: selected ? typeTabActiveColor : typeTabInactiveColor,
                            fontWeight: selected ? '600' : '500',
                          },
                        ]}
                      >
                        {BASE_LABEL[t]}
                      </Text>
                      <View
                        style={[
                          styles.typeTabUnderline,
                          {
                            backgroundColor: selected ? getTypeAccentColor(t) : 'transparent',
                          },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>

              {/* Build/Break Habit toggle - only for habits */}
              {baseType === 'habit' && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    marginBottom: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14 }}>{isBreakHabit ? '↺' : '+'}</Text>
                    <Text style={{ fontSize: 14, color: '#444', fontWeight: '500' }}>
                      {isBreakHabit ? 'Break habit' : 'Build habit'}
                    </Text>
                  </View>
                  <Switch
                    value={isBreakHabit}
                    onValueChange={(next) => {
                      dispatch({
                        type: 'SET_HABIT_SUBTYPE',
                        subtype: next ? 'break_habit' : 'start_habit',
                      });
                    }}
                    trackColor={{
                      false: 'rgba(0,0,0,0.12)',
                      true: lightTokens.colors.moss,
                    }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              )}

              {/* Main text field - moved above tags */}
              <Box px={4} mt={3}>
                <View style={{ position: 'relative' }}>
                  {/* Conditional rendering: ChecklistInput for lists, TextInput otherwise */}
                  {effectiveLogSubtype === 'list' ? (
                    <ChecklistInput
                      text={currentText}
                      onChangeText={(t) => dispatch({ type: 'SET_TEXT', text: t })}
                      colorMode={colorMode}
                      onFocus={() => setBodyFocused(true)}
                      onBlur={() => setBodyFocused(false)}
                      hasCamera={isLog}
                    />
                  ) : (
                    <TextInput
                      ref={textInputRef}
                      value={currentText}
                      onChangeText={(t) => dispatch({ type: 'SET_TEXT', text: t })}
                      accessibilityLabel="Overlay content input"
                      onFocus={() => setBodyFocused(true)}
                      onBlur={() => setBodyFocused(false)}
                      placeholder="Add notes..."
                      placeholderTextColor={lightTokens.colors.subtle}
                      multiline
                      scrollEnabled={false}
                      autoFocus
                      textAlignVertical="top"
                      style={[
                        styles.textArea,
                        {
                          color: lightTokens.colors.text,
                          backgroundColor:
                            colorMode === 'dark' ? darkTokens.colors.deep : '#FAFAFA',
                          borderWidth: 1,
                          borderColor: colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
                          shadowColor: '#000',
                          shadowOpacity: 0.03,
                          shadowOffset: { width: 0, height: 1 },
                          shadowRadius: 2,
                          paddingRight: isLog ? 56 : 16, // Extra padding for camera button in logs
                        },
                      ]}
                    />
                  )}
                  {/* Camera button inside text area for logs only */}
                  {isLog && (
                    <Pressable
                      onPress={handleOpenMultiPhotoActionSheet}
                      style={({ pressed }) => ({
                        position: 'absolute',
                        bottom: 12,
                        right: 12,
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colorMode === 'dark' ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
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
                        color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'}
                      />
                    </Pressable>
                  )}
                </View>
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
                          <View key={actualIndex} style={styles.photoThumbnailContainer}>
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

              {/* Tags row - now directly below text field */}
              <Box px={4} mt={2.5}>
                <TagsRow
                  tags={activeTagChips}
                  suggested={suggestionChips}
                  onToggle={handleTagToggle}
                  onResuggest={mode === 'edit' && fullEntity ? handleResuggestTags : undefined}
                  resuggesting={isResuggestingTags}
                  onAdd={handleTagAdd}
                  onUserAdd={handleTelemetryTagAdd}
                  onUserRemove={handleTelemetryTagRemove}
                />
                {hasLowConfidenceSuggestions ? (
                  <Box mt={2}>
                    <Text variant="subtle">AI suggestions (low confidence)</Text>
                  </Box>
                ) : null}
              </Box>

              {/* Log meta row: timestamp + mood strip (Phase L4) - ONLY for journal logs */}
              {isJournal ? (
                <Box px={4} mt={3}>
                  <View style={styles.logMetaRow}>
                    {logTimestampLabel ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.logTimestampText}>{logTimestampLabel}</Text>
                        {state.log.private && (
                          <Lock
                            size={14}
                            color={colorMode === 'dark' ? 'rgba(255,255,255,0.6)' : '#666'}
                            style={{ opacity: 0.8 }}
                          />
                        )}
                      </View>
                    ) : null}
                    <View style={styles.moodRow}>
                      <Pressable
                        onPress={() => setMood('happy')}
                        hitSlop={8}
                        style={[styles.moodButton, mood === 'happy' && styles.moodButtonActive]}
                        accessibilityRole="button"
                        accessibilityLabel="Set mood to happy"
                      >
                        <Text style={{ fontSize: 20 }}>😊</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setMood('neutral')}
                        hitSlop={8}
                        style={[styles.moodButton, mood === 'neutral' && styles.moodButtonActive]}
                        accessibilityRole="button"
                        accessibilityLabel="Set mood to neutral"
                      >
                        <Text style={{ fontSize: 20 }}>😐</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setMood('sad')}
                        hitSlop={8}
                        style={[styles.moodButton, mood === 'sad' && styles.moodButtonActive]}
                        accessibilityRole="button"
                        accessibilityLabel="Set mood to sad"
                      >
                        <Text style={{ fontSize: 20 }}>😔</Text>
                      </Pressable>
                    </View>
                  </View>
                </Box>
              ) : null}

              <Box px={4}>
                {baseType === 'todo' || baseType === 'habit' ? (
                  <Box mt={3}>
                    {/* Due date + Lock In row */}
                    <View style={styles.dueAndLockRow}>
                      {/* Left side: Due date */}
                      <View style={styles.dueDateLeft}>
                        {baseType === 'todo' ? (
                          <Pressable
                            style={styles.dueDatePill}
                            onPress={() => {
                              setDateModalTarget('todo');
                              setShowDateModal(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              state.todo.due_at
                                ? `Due date: ${safeFormat(state.todo.due_at)}`
                                : 'Add due date'
                            }
                          >
                            <Calendar
                              size={16}
                              color={
                                state.todo.due_at
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
                                !state.todo.due_at && {
                                  color: colorMode === 'dark' ? 'rgba(255,255,255,0.5)' : '#777777',
                                  fontWeight: '400',
                                },
                              ]}
                            >
                              {state.todo.due_at ? safeFormat(state.todo.due_at) : 'Add due date'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {/* Right side: Lock In toggle (for todos only) */}
                      {commitmentsOn && baseType === 'todo' ? (
                        <View style={styles.lockInRight}>
                          <Lock
                            size={14}
                            color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'}
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
                  </Box>
                ) : null}

                {/* Frequency row for habits */}
                {baseType === 'habit' ? (
                  <Box mt={3} px={0}>
                    {/* Optional frequency label for break habits */}
                    {isBreakHabit && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: colorMode === 'dark' ? 'rgba(255,255,255,0.5)' : '#888888',
                          marginBottom: 4,
                          marginLeft: 4,
                        }}
                      >
                        Check-in frequency
                      </Text>
                    )}
                    {/* Frequency + Lock In row (matching todo structure) */}
                    <View style={styles.dueAndLockRow}>
                      {/* Left side: Frequency selector */}
                      <View style={styles.dueDateLeft}>
                        <Pressable
                          style={styles.dueDateRow}
                          onPress={() => {
                            // Initialize modal state from current habit frequency
                            const currentFreq = jsonToFrequency(state.habit.frequency_json);
                            setFrequencyTab(currentFreq.mode);
                            if (currentFreq.mode === 'days') {
                              setSelectedDays(currentFreq.days);
                            } else if (currentFreq.mode === 'custom') {
                              setCustomCount(String(currentFreq.value.count));
                              setCustomUnit(currentFreq.value.unit);
                            }
                            setShowFrequencyModal(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Set frequency"
                        >
                          <Calendar
                            size={16}
                            color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'}
                            style={styles.dueDateIcon}
                          />
                          <Text style={styles.dueDateText}>
                            {getFrequencyLabel(jsonToFrequency(state.habit.frequency_json))}
                          </Text>
                        </Pressable>
                      </View>

                      {/* Right side: Lock In toggle (same as todos) */}
                      {commitmentsOn ? (
                        <View style={styles.lockInRight}>
                          <Lock
                            size={14}
                            color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666'}
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

                <Box mt={3.5} row style={{ alignItems: 'center' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={handleToggleDetails}
                    title={state.expanded ? 'Hide details' : '+ Details'}
                  />
                  <Box flex={1} />
                </Box>
                {state.expanded ? (
                  <Reanimated.View style={[detailsStyle, { marginTop: tokenSpacing.sm }]}>
                    <Box pb={2}>
                      {/* To-Do Details */}
                      {baseType === 'todo' ? (
                        <View style={{ marginTop: 8 }}>
                          {/* 1) Reminders row */}
                          <Pressable
                            onPress={() => {
                              setShowRemindersModal(true);
                            }}
                            style={({ pressed }) => [
                              styles.detailRow,
                              pressed && styles.detailRowPressed,
                            ]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Bell
                                size={18}
                                color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666'}
                              />
                              <Text style={styles.detailRowText}>Reminders</Text>
                            </View>
                            <Text style={styles.detailRowValue}>
                              {formatReminderSummary(reminders)}
                            </Text>
                          </Pressable>

                          {/* 2) Add to Space row */}
                          <Pressable
                            onPress={() => setShowSpaceModal(true)}
                            style={({ pressed }) => [
                              styles.detailRow,
                              { marginTop: 8 },
                              pressed && styles.detailRowPressed,
                            ]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Folder
                                size={18}
                                color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666'}
                              />
                              <Text style={styles.detailRowText}>Add to Space</Text>
                            </View>
                            {state.spaceId ? (
                              <Text style={styles.detailRowValue}>
                                {spaces.find((s) => s.id === state.spaceId)?.name ?? ''}
                              </Text>
                            ) : null}
                          </Pressable>

                          {/* 3) Delete To-Do row (only in edit mode) */}
                          {mode === 'edit' && (initialEntity as any)?.id ? (
                            <View style={{ marginTop: 16 }}>
                              <View style={styles.detailDivider} />
                              <Pressable
                                onPress={() => {
                                  Alert.alert('Delete this to-do?', "This can't be undone.", [
                                    {
                                      text: 'Cancel',
                                      style: 'cancel',
                                    },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        try {
                                          await repo.remove((initialEntity as any).id);
                                          eventBus.emit('ItemUpdated', {
                                            id: (initialEntity as any).id,
                                          });
                                          onClose();
                                        } catch (err) {
                                          console.error('[UnifiedOverlayV2] Delete failed:', err);
                                          Alert.alert(
                                            'Error',
                                            'Failed to delete to-do. Please try again.',
                                          );
                                        }
                                      },
                                    },
                                  ]);
                                }}
                                style={({ pressed }) => [
                                  { paddingVertical: 12 },
                                  pressed && { opacity: 0.7 },
                                ]}
                              >
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                >
                                  <Trash2 size={16} color="#DC2626" />
                                  <Text
                                    style={{ color: '#DC2626', fontSize: 14, fontWeight: '500' }}
                                  >
                                    Delete to-do
                                  </Text>
                                </View>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Habit Details */}
                      {baseType === 'habit' ? (
                        <View style={{ marginTop: 8 }}>
                          {/* 1) Reminders row */}
                          <Pressable
                            onPress={() => {
                              setShowRemindersModal(true);
                            }}
                            style={({ pressed }) => [
                              styles.detailRow,
                              pressed && styles.detailRowPressed,
                            ]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Bell
                                size={18}
                                color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666'}
                              />
                              <Text style={styles.detailRowText}>Reminders</Text>
                            </View>
                            <Text style={styles.detailRowValue}>
                              {formatReminderSummary(reminders)}
                            </Text>
                          </Pressable>

                          {/* 2) Add to Space row */}
                          <Pressable
                            onPress={() => setShowSpaceModal(true)}
                            style={({ pressed }) => [
                              styles.detailRow,
                              { marginTop: 8 },
                              pressed && styles.detailRowPressed,
                            ]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Folder
                                size={18}
                                color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666'}
                              />
                              <Text style={styles.detailRowText}>Add to Space</Text>
                            </View>
                            {state.spaceId ? (
                              <Text style={styles.detailRowValue}>
                                {spaces.find((s) => s.id === state.spaceId)?.name ?? ''}
                              </Text>
                            ) : null}
                          </Pressable>

                          {/* 3) Delete Habit row (only in edit mode) */}
                          {mode === 'edit' && (initialEntity as any)?.id ? (
                            <View style={{ marginTop: 16 }}>
                              <View style={styles.detailDivider} />
                              <Pressable
                                onPress={() => {
                                  Alert.alert('Delete this habit?', "This can't be undone.", [
                                    {
                                      text: 'Cancel',
                                      style: 'cancel',
                                    },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        try {
                                          await repo.remove((initialEntity as any).id);
                                          eventBus.emit('ItemUpdated', {
                                            id: (initialEntity as any).id,
                                          });
                                          onClose();
                                        } catch (err) {
                                          console.error('[UnifiedOverlayV2] Delete failed:', err);
                                          Alert.alert(
                                            'Error',
                                            'Failed to delete habit. Please try again.',
                                          );
                                        }
                                      },
                                    },
                                  ]);
                                }}
                                style={({ pressed }) => [
                                  { paddingVertical: 12 },
                                  pressed && { opacity: 0.7 },
                                ]}
                              >
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                >
                                  <Trash2 size={16} color="#DC2626" />
                                  <Text
                                    style={{ color: '#DC2626', fontSize: 14, fontWeight: '500' }}
                                  >
                                    Delete habit
                                  </Text>
                                </View>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Log Details */}
                      {baseType === 'log' ? (
                        <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
                          {/* 1) Reminders row */}
                          <Pressable
                            onPress={() => {
                              setShowRemindersModal(true);
                            }}
                            style={({ pressed }) => [
                              styles.detailRow,
                              pressed && styles.detailRowPressed,
                            ]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Bell
                                size={18}
                                color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666'}
                              />
                              <Text style={styles.detailRowText}>Reminders</Text>
                            </View>
                            <Text style={styles.detailRowValue}>
                              {formatReminderSummary(reminders)}
                            </Text>
                          </Pressable>

                          {/* 2) Add to Space row */}
                          <Pressable
                            onPress={() => setShowSpaceModal(true)}
                            style={({ pressed }) => [
                              styles.detailRow,
                              { marginTop: 12 },
                              pressed && styles.detailRowPressed,
                            ]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <Folder
                                size={18}
                                color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666'}
                              />
                              <Text style={styles.detailRowText}>Add to Space</Text>
                            </View>
                            <Text style={styles.detailRowValue}>
                              {state.spaceId
                                ? (spaces.find((s) => s.id === state.spaceId)?.name ?? 'Unassigned')
                                : 'Unassigned'}
                            </Text>
                          </Pressable>

                          {/* 3) Private toggle row (Phase L9: Only for journal logs) */}
                          {showLogPrivateToggle ? (
                            <View style={[styles.detailRow, { marginTop: 12 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Lock
                                  size={18}
                                  color={colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666'}
                                />
                                <Text style={styles.detailRowText}>Private</Text>
                              </View>
                              <Switch
                                value={state.logIsPrivate}
                                onValueChange={() =>
                                  dispatch({
                                    type: 'SET_LOG_IS_PRIVATE',
                                    value: !state.logIsPrivate,
                                  })
                                }
                                trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                                thumbColor="#FFFFFF"
                              />
                            </View>
                          ) : null}

                          {/* 4) Divider before Delete */}
                          {mode === 'edit' && (initialEntity as any)?.id ? (
                            <>
                              <View style={[styles.detailDivider, { marginTop: 16 }]} />

                              {/* 5) Delete log row */}
                              <Pressable
                                onPress={() => {
                                  Alert.alert('Delete this log?', "This can't be undone.", [
                                    {
                                      text: 'Cancel',
                                      style: 'cancel',
                                    },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        try {
                                          await repo.remove((initialEntity as any).id);
                                          eventBus.emit('ItemUpdated', {
                                            id: (initialEntity as any).id,
                                          });
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
                                  ]);
                                }}
                                style={({ pressed }) => [
                                  { paddingVertical: 12 },
                                  pressed && { opacity: 0.7 },
                                ]}
                              >
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                >
                                  <Trash2 size={16} color="#DC2626" />
                                  <Text
                                    style={{ color: '#DC2626', fontSize: 14, fontWeight: '500' }}
                                  >
                                    Delete log
                                  </Text>
                                </View>
                              </Pressable>
                            </>
                          ) : null}
                        </View>
                      ) : null}
                    </Box>
                  </Reanimated.View>
                ) : null}

                {/* Mentions / Dates chips (inline suggestions) */}
                <Box mt={3} row gap={2} style={{ flexWrap: 'wrap', marginTop: tokenSpacing.md }}>
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
                          handleTodoDueChange(new Date().toISOString(), { label: 'Today' });
                        } else if (d === '__token:tomorrow') {
                          handleTodoDueChange(addDays(new Date(), 1).toISOString(), {
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
                          setDateModalTarget('todo');
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
                      Set due date
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
                              dispatch({ type: 'SET_REMINDER', when: tomorrow.toISOString() });
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
                              selectedDate.toDateString() === addDays(new Date(), 1).toDateString()
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
                        <Box row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
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
                                      selectedTimePreset === preset.key ? '#2E5540' : '#E0E0E0',
                                  })}
                                >
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      fontWeight: '500',
                                      color:
                                        selectedTimePreset === preset.key ? '#2E5540' : '#222222',
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
                                    color: selectedTimePreset === 'custom' ? '#2E5540' : '#222222',
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
                                    if (Platform.OS === 'android' && event.type === 'dismissed') {
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
                            let finalIso: string | null = null;

                            if (!clearDateFlag) {
                              // Combine date and optional time
                              let finalDate = selectedDate;

                              if (showTimePicker && selectedTime) {
                                // Merge the selected time into the selected date
                                finalDate = setHours(
                                  setMinutes(selectedDate, selectedTime.getMinutes()),
                                  selectedTime.getHours(),
                                );
                              } else {
                                // No time selected, use midnight
                                finalDate = setHours(setMinutes(selectedDate, 0), 0);
                              }

                              finalIso = finalDate.toISOString();
                            }

                            // Apply the change
                            if (dateModalTarget === 'reminder') {
                              dispatch({ type: 'SET_REMINDER', when: finalIso });
                            } else {
                              const label = finalIso
                                ? safeFormat(finalIso) || format(selectedDate, 'MMM d')
                                : '';
                              handleTodoDueChange(finalIso, { label });
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
                    style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}
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
                        <View style={{ backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12 }}>
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
                                    reminderRepeat === option ? lightTokens.colors.moss : '#E5E7EB',
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
                            style={{ backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12 }}
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
                            if (reminderRepeat === 'custom' && reminderCustomDays.length === 0) {
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
                              ...(reminderRepeat === 'custom' && { days: reminderCustomDays }),
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
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            if (editingMode === 'add') {
                              setReminders((prev) => [...prev, newReminder]);
                            } else {
                              setReminders((prev) =>
                                prev.map((r) => (r.id === editingReminder.id ? newReminder : r)),
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
                            style={{ textAlign: 'center', color: '#6B7280', paddingVertical: 40 }}
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
                                <Text style={{ fontSize: 15, fontWeight: '500', color: '#111827' }}>
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
                                  setReminders((prev) => prev.filter((r) => r.id !== reminder.id));
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
                          onPress={() => setFrequencyTab(tab)}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 16,
                            borderBottomWidth: 2,
                            borderBottomColor:
                              frequencyTab === tab
                                ? colorMode === 'dark'
                                  ? lightTokens.colors.moss
                                  : lightTokens.colors.moss
                                : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              color:
                                frequencyTab === tab
                                  ? colorMode === 'dark'
                                    ? '#FFFFFF'
                                    : '#222222'
                                  : colorMode === 'dark'
                                    ? 'rgba(255,255,255,0.6)'
                                    : 'rgba(34,34,34,0.6)',
                              fontWeight: frequencyTab === tab ? '600' : '400',
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
                    {frequencyTab === 'simple' && (
                      <Box gap={2}>
                        {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                          <Button
                            key={freq}
                            variant="ghost"
                            onPress={() => {
                              const config: FrequencyConfig = { mode: 'simple', value: freq };
                              dispatch({
                                type: 'SET_HABIT_FREQUENCY',
                                frequency_json: frequencyToJson(config),
                              });
                              setShowFrequencyModal(false);
                            }}
                            title={freq.charAt(0).toUpperCase() + freq.slice(1)}
                          />
                        ))}
                      </Box>
                    )}

                    {/* Days tab */}
                    {frequencyTab === 'days' && (
                      <Box>
                        <Text variant="label" style={{ marginBottom: 12 }}>
                          Select days
                        </Text>
                        <Box row gap={1} style={{ flexWrap: 'wrap' }}>
                          {DAY_LABELS.map(({ day, short, long }) => {
                            const isSelected = selectedDays.includes(day);
                            return (
                              <Pressable
                                key={day}
                                onPress={() => {
                                  setSelectedDays((prev) =>
                                    prev.includes(day)
                                      ? prev.filter((d) => d !== day)
                                      : [...prev, day],
                                  );
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
                    {frequencyTab === 'custom' && (
                      <Box>
                        <Text variant="label" style={{ marginBottom: 12 }}>
                          How often?
                        </Text>
                        <Box row gap={2} style={{ alignItems: 'center' }}>
                          <TextInput
                            value={customCount}
                            onChangeText={(text) => {
                              const num = text.replace(/[^0-9]/g, '');
                              setCustomCount(num || '1');
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
                              color: colorMode === 'dark' ? 'rgba(255,255,255,0.7)' : '#666666',
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
                                const currentIndex = units.indexOf(customUnit);
                                const nextIndex = (currentIndex + 1) % units.length;
                                setCustomUnit(units[nextIndex]);
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
                                {customUnit}
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

                        if (frequencyTab === 'simple') {
                          config = { mode: 'simple', value: 'daily' }; // Default, but this won't be called in simple mode
                        } else if (frequencyTab === 'days') {
                          if (selectedDays.length === 0) {
                            // Require at least one day
                            return;
                          }
                          config = { mode: 'days', days: selectedDays as DayOfWeek[] };
                        } else {
                          const count = parseInt(customCount) || 1;
                          config = { mode: 'custom', value: { count, unit: customUnit } };
                        }

                        dispatch({
                          type: 'SET_HABIT_FREQUENCY',
                          frequency_json: frequencyToJson(config),
                        });
                        setShowFrequencyModal(false);
                      }}
                      title="Set"
                      disabled={frequencyTab === 'days' && selectedDays.length === 0}
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
                style={{ backgroundColor: '#fce8e6', borderTopWidth: StyleSheet.hairlineWidth }}
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
            <SafeAreaView
              style={{
                backgroundColor: sheetBackground,
                paddingBottom: (insets?.bottom ?? 0) + 12,
              }}
            >
              <Box
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  paddingTop: 20,
                  // soften footer separation
                  borderTopWidth: 0,
                  paddingBottom: 0, // handled by SafeAreaView padding
                  backgroundColor: sheetBackground,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                {/* Cancel button - text-only, subtle */}
                <Pressable
                  onPress={handleCancel}
                  disabled={isSaving}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  style={{
                    paddingHorizontal: 12,
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
                        : '#666666',
                      fontSize: 14,
                      fontWeight: '400',
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>

                {/* Save button - primary action */}
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
              </Box>
            </SafeAreaView>
            <ToastUndo
              visible={showUndoToast}
              onUndo={handleUndo}
              onHide={() => setShowUndoToast(false)}
              message="Change saved"
            />
          </View>
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
  );
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

    return {
      baseType: 'habit',
      compactTitle,
      // Hydrate all type-specific states for symmetry (in case user switches types)
      habit: {
        title: compactTitle,
        notes: habitLongText,
        schedule: 'custom',
        frequency_json: (entity as any)?.frequency_value ?? null, // Load frequency_json from DB
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
      logSubtypeOverride: null, // Phase L8: Default for habits
      logIsPrivate: false, // Phase L9: Default for habits
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
  let logSubtypeOverride: 'journal' | 'list' | 'idea' | 'plain' | null = null;
  if (baseType === 'log') {
    if (rawSubtype === 'journal' || rawSubtype === 'list' || rawSubtype === 'idea') {
      logSubtypeOverride = rawSubtype;
    } else if (rawSubtype === null || rawSubtype === undefined || rawSubtype === 'catchall') {
      logSubtypeOverride = 'plain';
    }
  }

  // Phase L9: Hydrate logIsPrivate from entity.views.private_journal for logs
  const logIsPrivate =
    baseType === 'log'
      ? !!(entity?.views && (entity.views as any).private_journal === true)
      : false;

  const payload: Partial<V2State> = {
    baseType,
    compactTitle: title || '', // Preserve entity title as compactTitle
    compactTitleSource: title || '', // Track source of title
    log: {
      title: logTitle,
      body: logBody,
      kind: classifyLogKind(logBody),
      private: (entity as any)?.private ?? false, // Hydrate private field for logs (Phase L7)
    },
    todo: {
      title: todoTitle,
      details: todoDetails,
      due_at: (entity as any)?.due_at ?? (entity as any)?.due_date ?? null,
    },
    habit: {
      title: name || title || '',
      notes: rawDetails || '',
      schedule: 'custom',
    },
    tags: extractedTags, // Initialize tags from entity for all types
    stickyTags: normalizeMetaValues(tagsMeta?.sticky),
    tagTombstones: normalizeMetaValues(tagsMeta?.tombstones),
    mood: (entity as any)?.mood ?? null, // Hydrate mood for journal logs (Phase L2)
    logSubtypeOverride, // Phase L8: Manual log subtype override
    logIsPrivate, // Phase L9: Private flag for journal logs
  };

  return payload;
}

function headerFor(base: BaseType, mode: 'create' | 'edit', title?: string) {
  // Phase 6b: Show entity title in edit mode instead of generic "Edit"
  if (mode === 'edit' && title) return title;
  if (mode === 'edit') return 'Edit'; // Fallback if no title available
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

/**
 * ChecklistInput - Interactive checkbox list for list-type logs
 * Replaces plain TextInput when effectiveLogSubtype === 'list'
 */
type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

function ChecklistInput({
  text,
  onChangeText,
  colorMode,
  onFocus,
  onBlur,
  hasCamera = false,
}: {
  text: string;
  onChangeText: (text: string) => void;
  colorMode: 'light' | 'dark' | null | undefined;
  onFocus?: () => void;
  onBlur?: () => void;
  hasCamera?: boolean;
}) {
  const isDark = colorMode === 'dark';

  // Parse text into checklist items
  const items = useMemo(() => {
    const parsed: ChecklistItem[] = [];

    // Try inline format first: "- eggs - milk - cereal"
    if (text.includes(' - ')) {
      const parts = text.split(' - ').filter((part) => part.trim().length > 0);
      if (parts.length >= 2) {
        return parts.map((part, idx) => ({
          id: `item-${idx}`,
          text: part.trim().replace(/^-\s*/, ''), // Remove leading dash if present
          checked: false,
        }));
      }
    }

    // Try newline format: "- eggs\n- milk\n- cereal"
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length >= 2) {
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Check for checkbox format: [ ] or [x]
        const checkboxMatch = trimmed.match(/^\[([ xX])\]\s*(.+)$/);
        if (checkboxMatch) {
          parsed.push({
            id: `item-${idx}`,
            text: checkboxMatch[2],
            checked: checkboxMatch[1].toLowerCase() === 'x',
          });
        }
        // Check for dash format: - item
        else if (trimmed.startsWith('- ')) {
          parsed.push({
            id: `item-${idx}`,
            text: trimmed.substring(2),
            checked: false,
          });
        }
        // Check for bullet format: • item
        else if (trimmed.startsWith('• ')) {
          parsed.push({
            id: `item-${idx}`,
            text: trimmed.substring(2),
            checked: false,
          });
        }
      });
    }

    return parsed.length > 0 ? parsed : [{ id: 'item-0', text: text, checked: false }];
  }, [text]);

  const handleToggle = useCallback(
    (itemId: string) => {
      const itemIndex = parseInt(itemId.split('-')[1], 10);
      const newItems = [...items];
      newItems[itemIndex] = { ...newItems[itemIndex], checked: !newItems[itemIndex].checked };

      // Reconstruct text in checkbox format
      const newText = newItems
        .map((item) => `[${item.checked ? 'x' : ' '}] ${item.text}`)
        .join('\n');

      onChangeText(newText);
    },
    [items, onChangeText],
  );

  return (
    <View
      style={{
        backgroundColor: isDark ? darkTokens.colors.deep : '#FAFAFA',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
        borderRadius: tokenRadius.md,
        padding: 16,
        paddingRight: hasCamera ? 56 : 16,
        minHeight: 120,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
      }}
      onTouchStart={() => onFocus?.()}
      onTouchEnd={() => onBlur?.()}
    >
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => handleToggle(item.id)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 12,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.text}
        >
          {/* Checkbox */}
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: item.checked ? '#7C9885' : isDark ? 'rgba(255,255,255,0.3)' : '#CCCCCC',
              backgroundColor: item.checked ? '#7C9885' : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            {item.checked && (
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }}>✓</Text>
            )}
          </View>

          {/* Item text */}
          <Text
            style={{
              flex: 1,
              fontSize: 16,
              color: item.checked
                ? isDark
                  ? 'rgba(255,255,255,0.5)'
                  : '#999999'
                : isDark
                  ? darkTokens.colors.text
                  : lightTokens.colors.text,
              textDecorationLine: item.checked ? 'line-through' : 'none',
            }}
          >
            {item.text}
          </Text>
        </Pressable>
      ))}
    </View>
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
  // Phase 6c: Type selector - underline style
  typeTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  typeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  typeTabLabel: {
    fontSize: 12,
  },
  typeTabUnderline: {
    alignSelf: 'stretch',
    height: 2,
    marginTop: 4,
    borderRadius: tokenRadius.sm,
  },
  textArea: {
    minHeight: 120,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 0,
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

  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokenSpacing.sm,
    marginTop: tokenSpacing.sm,
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
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  detailRowPressed: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  detailRowText: {
    fontSize: 15,
    color: '#111827',
  },
  detailRowValue: {
    fontSize: 14,
    color: '#6B7280',
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
});
