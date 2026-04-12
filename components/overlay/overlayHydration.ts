/**
 * overlayHydration.ts — Hydration logic extracted from UnifiedOverlayV2.tsx
 *
 * Contains:
 * - TYPE_FAMILY / SCHEDULE_PRESETS constants
 * - buildFrequencyJsonFromDb / extractDaysActiveFromFrequencyJson
 * - normalizeTagCandidate / normalizeToTagKey / extractTagKeysFromEntity
 * - deriveBaseTypeFromInitial / getInitialV2StateFromProps
 * - buildDraftPayloadFromEntity
 */

import {
  canonicalToFrequencyJson,
  parseFrequencyString,
} from '../../lib/habits/frequencyUtils';
import { filterAndNormalizeTags } from '../../lib/tags/normalize';
import { filterMindDropTodoTags } from './overlayV2.mapping';
import { getMindDropRawText } from './getMindDropRawText';
import {
  initialV2State,
  firstLine,
  classifyLogKind,
  type BaseType,
  type TagKey,
  type V2State,
} from './overlayV2.state';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';
import type { OverlayDraft } from './useOverlayDraft';
import { isValidMood, migrateLegacyMood } from '../../lib/shared/moods';

// ── Tag Normalization ──────────────────────────────────────────────────────────

export function normalizeTagCandidate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  // Preserve @ and # prefixes, only strip other leading chars
  if (/^[@#]/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/^[^a-z0-9]+/, '');
}

export function normalizeToTagKey(value: unknown): TagKey | null {
  const slug = normalizeTagCandidate(value);
  return slug || null;
}

// ── Frequency Helpers ──────────────────────────────────────────────────────────

/**
 * Constructs frequency_json from DB columns for the overlay's FrequencyConfig format.
 *
 * Uses centralized frequencyUtils for canonical schema, with fallback for legacy schema.
 * Priority: cadence/target_per_period > frequency_value > parsed frequency string
 */
export function buildFrequencyJsonFromDb(
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
export function extractDaysActiveFromFrequencyJson(frequencyJson: any): number[] | null {
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

// ── Tag Extraction ─────────────────────────────────────────────────────────────

export function extractTagKeysFromEntity(entity: any): TagKey[] {
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

// ── Constants ──────────────────────────────────────────────────────────────────

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
export type TypeFamily = 'note' | 'todo' | 'habit';
export const TYPE_FAMILY: Record<BaseType, TypeFamily> = {
  log: 'note',
  todo: 'todo',
  habit: 'habit',
};

export const SCHEDULE_PRESETS: {
  key: string;
  label: string;
  count: number;
  unit: 'day' | 'week' | 'month';
  days: number[];
}[] = [
  { key: 'every_day', label: 'Every day', count: 1, unit: 'day', days: [] },
  { key: 'weekdays', label: 'Weekdays', count: 5, unit: 'week', days: [1, 2, 3, 4, 5] },
  { key: 'weekly', label: 'Weekly', count: 1, unit: 'week', days: [] },
  { key: '3x_week', label: '3× / week', count: 3, unit: 'week', days: [] },
  { key: 'monthly', label: 'Monthly', count: 1, unit: 'month', days: [] },
];

// ── Derivation ─────────────────────────────────────────────────────────────────

export function deriveBaseTypeFromInitial(type: unknown): BaseType | null {
  if (!type) return null;
  const normalized = String(type).toLowerCase();
  if (normalized === 'todo') return 'todo';
  if (normalized === 'habit') return 'habit';
  return 'log';
}

/**
 * Derives the initial V2State from props, ensuring baseType is correct on first render.
 * This fixes the P0 bug where editing a todo/habit briefly shows an empty LOG overlay.
 *
 * For edit/view mode: derives baseType from initialEntity.type synchronously
 * For create mode: uses the default baseType from initialV2State ('log')
 */
export function getInitialV2StateFromProps(props: UnifiedCreateOverlayProps): V2State {
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

// ── Private Helpers ────────────────────────────────────────────────────────────

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

// ── Main Hydration ─────────────────────────────────────────────────────────────

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

// ── Hydration bridge for useOverlayDraft store ──────────────────────────────

export function hydrateEntityToDraft(
  entity: any | null,
  mode: 'create' | 'edit' | 'view',
  initialSpaceId?: string | null,
): Partial<OverlayDraft> {
  // Get existing V2State hydration
  const v2Payload = entity ? buildDraftPayloadFromEntity(entity) : {};

  // Extract entity data that was previously in separate useStates
  const entityData = entity
    ? {
        itemReminders: Array.isArray(entity.reminders)
          ? entity.reminders
          : Array.isArray(entity.reminders_json)
            ? entity.reminders_json
            : [],
        moods: (() => {
          const mood = entity?.mood;
          if (Array.isArray(mood)) return mood.filter(isValidMood);
          if (typeof mood === 'string') {
            const migrated = migrateLegacyMood(mood);
            return migrated ? [migrated] : [];
          }
          return [];
        })(),
        photoUri: entity?.photo_uri ?? null,
        chatNotes: entity?.views?.chat?.notes ?? [],
        isFavorite: (entity as any)?.is_favorite ?? false,
        checklistItems:
          (entity as any)?.has_list && Array.isArray((entity as any)?.list_items) && (entity as any).list_items.length > 0
            ? (entity as any).list_items
            : null,
      }
    : {};

  return {
    ...v2Payload,
    ...entityData,
    tagsDirty: false,
    userClearedChecklist: false,
  };
}
