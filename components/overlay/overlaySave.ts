/**
 * overlaySave.ts — Save-payload builder extracted from UnifiedOverlayV2.tsx
 *
 * Contains:
 * - buildSavePayload (was toCreateOrUpdateInput)
 * - coerceIsoTimestamp, stripJournalTags, areTagsEqual, frequencyJsonToCadenceFields
 * - detectListFromText (also used by main component)
 */

import { getEffectiveTags } from '../../lib/tags/getEffectiveTags';
import { getEffectiveLogSubtype } from '../../lib/logs/getEffectiveLogSubtype';
import { calculateBuffers } from '../../lib/planning';
import { buildCanonicalFromMindDrop } from '../../lib/minddrop/buildCanonicalFromMindDrop';
import { sanitizeSuggestedTags } from './overlayV2.mapping';
import {
  firstLine,
  type BaseType,
  type TagKey,
  type V2State,
} from './overlayV2.state';
import { extractDaysActiveFromFrequencyJson } from './overlayHydration';
import {
  frequencyJsonToCanonical,
} from '../../lib/habits/frequencyUtils';
import type { Mood } from '../../lib/shared/moods';
import type { ListItem } from '../../lib/lists';

// ── Helpers (moved from UnifiedOverlayV2.tsx) ──────────────────────────────────

export function coerceIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
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

/**
 * Convert frequency_json back to canonical cadence/target_per_period fields.
 * Uses centralized frequencyUtils (SINGLE SOURCE OF TRUTH).
 *
 * @param frequencyJson - The frequency_json object from overlay state
 * @param schedule - The schedule string from overlay state (fallback)
 * @returns Object with cadence and target_per_period
 */
export function frequencyJsonToCadenceFields(
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

// Smart list detection helper (Prompt 3)
export type ListDetectionResult =
  | { kind: 'plain' }
  | { kind: 'list'; items: Array<{ id: string; label: string; checked?: boolean }> };

export function detectListFromText(text: string): ListDetectionResult {
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

// ── Save Context ───────────────────────────────────────────────────────────────

export interface SaveContext {
  mode: 'create' | 'edit' | 'view';
  initialEntity: any;
  fullEntity: any;
  tagsDirty: boolean;
  isViewMode: boolean;
  isChecklistMode: boolean;
  checklistItems: ListItem[] | null;
  userEditedTitle: boolean;
}

// ── Main Save Payload Builder ──────────────────────────────────────────────────

export async function buildSavePayload(
  baseType: BaseType,
  s: V2State,
  spaceId: string | null,
  existingEntity: any,
  context: SaveContext,
  photoUri?: string | null,
  moodsParam?: Mood[],
  effectiveLogSubtype?: 'journal' | 'idea' | 'general' | 'list' | 'event',
): Promise<any> {
  const isEditingMindDrop = context.mode === 'edit' && (existingEntity as any)?.origin === 'catchall';

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
    const entity = context.fullEntity || context.initialEntity;
    const existingViews = entity?.views || {};
    const viewsWithPrefillFlag = {
      ...(existingEntity?.views || existingViews || {}),
      // Persist title_user_edited flag so we know not to overwrite user's title on future opens
      title_user_edited:
        context.userEditedTitle || (existingEntity?.views as any)?.title_user_edited || false,
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
    const shouldIncludeTags = context.mode !== 'edit' || (context.tagsDirty && tagsHaveChanged);
    const tagsPayload = shouldIncludeTags
      ? { tags, tags_meta: tagsMeta }
      : { tags_meta: existingTagsMeta };

    if (baseType === 'todo') {
      // For Mind Drop edits, use canonical mapper for consistency
      const isMindDropEdit = context.mode === 'edit' && (context.initialEntity as any)?.origin === 'catchall';

      if (isMindDropEdit && s.todo.details) {
        // Use canonical mapper to ensure consistent title/body/tags
        const canonical = await buildCanonicalFromMindDrop({
          kind: 'todo',
          rawText: s.todo.details,
          aiTitle: s.todo.title || undefined,
          aiTags: shouldIncludeTags ? tags : undefined,
          existing: context.initialEntity,
        });

        // GREMLY TODO DATE MODEL: Use due_day (YYYY-MM-DD) as canonical source of truth
        // due_at is NOT used for todos - we only send due_day and due_date
        // Fallback to scheduled_date if due_day is missing (belt-and-suspenders for schedule modal)
        const dueDay = s.todo.due_day ?? s.todo.scheduled_date ?? null;
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
          // Top-level DB columns for Date Intelligence
          scheduled_date: s.todo.scheduled_date ?? null,
          target_date: s.todo.target_date ?? null,
          time_estimate_minutes: s.todo.time_estimate_minutes ?? null,
          time_window: s.todo.time_window ?? null,
          energy_type: (entity as any)?.energy_type ?? 'administrative',
          prep_buffer_minutes: todoBuffers.prep_buffer_minutes,
          cooldown_buffer_minutes: todoBuffers.cooldown_buffer_minutes,
          space_id: resolvedSpaceId,
          origin: 'catchall' as const,
          views: {
            ...viewsWithPrefillFlag,
            // Keep in views too for backwards compat
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
      // Fallback to scheduled_date if due_day is missing (belt-and-suspenders for schedule modal)
      const dueDay = s.todo.due_day ?? s.todo.scheduled_date ?? null;
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
        // Top-level DB columns for Date Intelligence
        scheduled_date: s.todo.scheduled_date ?? null,
        target_date: s.todo.target_date ?? null,
        time_estimate_minutes: s.todo.time_estimate_minutes ?? null,
        time_window: s.todo.time_window ?? null,
        energy_type: (entity as any)?.energy_type ?? 'administrative',
        prep_buffer_minutes: todoBuffers2.prep_buffer_minutes,
        cooldown_buffer_minutes: todoBuffers2.cooldown_buffer_minutes,
        space_id: resolvedSpaceId2,
        origin: 'catchall' as const,
        views: {
          ...viewsWithPrefillFlag,
          // Keep in views too for backwards compat
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
      const isMindDropEdit = context.mode === 'edit' && (context.initialEntity as any)?.origin === 'catchall';

      if (isMindDropEdit && s.habit.notes) {
        // Use canonical mapper to ensure consistent title/notes/tags
        const canonical = await buildCanonicalFromMindDrop({
          kind: 'habit',
          rawText: s.habit.notes,
          aiTitle: s.habit.title || undefined,
          aiTags: shouldIncludeTags ? tags : undefined,
          existing: context.initialEntity,
        });

        // Resolve space_id: explicit null means "None" selected, undefined means use fallback
        const resolvedSpaceId3 = s.spaceId === undefined ? (spaceId ?? null) : s.spaceId;
        if (__DEV__ && s.spaceId === null) {
          console.log('[toCreateOrUpdateInput] Clearing space_id (user selected None)');
        }
        const effectiveFreqJson = s.habit.frequency_json;
        const effectiveSchedule = s.habit.schedule;
        const daysActiveFromJson = extractDaysActiveFromFrequencyJson(effectiveFreqJson);
        console.log('[Save] FINAL frequency payload (edit):', {
          frequency: effectiveSchedule,
          frequency_json: effectiveFreqJson,
          cadenceFields: frequencyJsonToCadenceFields(effectiveFreqJson, effectiveSchedule),
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
          ...canonical,
          frequency: effectiveSchedule ?? 'custom',
          frequency_value: effectiveFreqJson ?? null,
          ...frequencyJsonToCadenceFields(effectiveFreqJson, effectiveSchedule),
          days_active: daysActiveFromJson,
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
      const effectiveFreqJson2 = s.habit.frequency_json;
      const effectiveSchedule2 = s.habit.schedule;
      const daysActiveFromJson2 = extractDaysActiveFromFrequencyJson(effectiveFreqJson2);
      console.log('[Save] FINAL frequency payload (create):', {
        frequency: effectiveSchedule2,
        frequency_json: effectiveFreqJson2,
        cadenceFields: frequencyJsonToCadenceFields(effectiveFreqJson2, effectiveSchedule2),
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
        frequency: effectiveSchedule2 ?? 'custom',
        frequency_value: effectiveFreqJson2 ?? null,
        ...frequencyJsonToCadenceFields(effectiveFreqJson2, effectiveSchedule2),
        days_active: daysActiveFromJson2,
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
    const isMindDropEdit = context.mode === 'edit' && (context.initialEntity as any)?.origin === 'catchall';

    if (isMindDropEdit && s.log.body) {
      // Use canonical mapper to ensure consistent title/body/tags
      const canonical = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: s.log.body,
        aiTitle: s.log.title || undefined,
        aiTags: shouldIncludeTags ? tags : undefined,
        existing: context.initialEntity,
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
        isChecklistMode: context.isChecklistMode,
        checklistItems: context.checklistItems,
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
        has_list: context.isChecklistMode,
        list_items: context.checklistItems,
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
      (context.mode === 'edit' || context.isViewMode) && context.initialEntity && (context.initialEntity as any)?.title;
    const isNewLogFromMindDrop = context.mode === 'create' && s.log.body && !s.log.title;
    const derivedTitle = isNewLogFromMindDrop
      ? s.log.body // Use full body for new Mind Drop logs
      : s.log.title ||
        (preserveExistingTitle ? (context.initialEntity as any).title : firstLine(s.log.body)) ||
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
      isChecklistMode: context.isChecklistMode,
      checklistItems: context.checklistItems,
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
      has_list: context.isChecklistMode,
      list_items: context.checklistItems,
      // Key Dates: Date Intelligence fields (direct on note)
      target_date: s.log.target_date ?? null,
      end_date: s.log.end_date ?? null,
      event_time: s.log.event_time ?? null,
      // Key Dates: Link to an event
      linked_event_id: s.linkedEventId ?? null,
    };
}
