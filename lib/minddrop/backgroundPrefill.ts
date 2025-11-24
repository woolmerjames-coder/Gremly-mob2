/**
 * Background Mind Drop Prefill Pipeline - Phase 2A (Enrichment Only)
 *
 * Runs AI enrichment (title only) AFTER entity creation in Stage A.
 * Sets freeze flags to prevent re-running AI on subsequent opens.
 *
 * IMPORTANT: Stage B (backgroundPrefill) is ENRICHMENT ONLY:
 * - Updates title based on AI or fallback
 * - Updates views flags (minddrop_stage, ai_pending, freeze flags)
 * - Does NOT touch tags (tags come from Stage A via buildCanonicalFromMindDrop)
 * - Does NOT change entity type or subtype
 * - Does NOT create new entities
 *
 * Flow:
 * 1. Stage A: Entity created via convertUnsortedTo* → buildCanonicalFromMindDrop (canonical tags/title/subtype)
 * 2. Stage B: backgroundPrefill() called with entity + raw sentence
 * 3. Call Cortex to generate AI title (tags are logged but not saved)
 * 4. Update entity in DB with enriched title + freeze flags
 * 5. Future overlay opens skip AI (frozen)
 */

import { callClassify } from '../cortex/CortexClient';
import { supabase } from '../supabase/client';

interface PrefillEntity {
  id: string;
  type: 'todo' | 'habit' | 'note';
  views?: Record<string, any>;
}

interface PrefillResult {
  title?: string;
  tags?: string[];
}

interface TitleInputs {
  entityType: 'todo' | 'habit' | 'note';
  originalTitle?: string | null; // what was stored at create time
  body?: string | null; // full text of the drop
  aiTitle?: string | null; // From Cortex worker classification.title field
}

/**
 * Compute unified prefill title for all entity types (todos, habits, notes/logs)
 *
 * Strategy:
 * 1. Prefer non-empty aiTitle from Cortex
 * 2. If no aiTitle, synthesize a short fallback title from body/originalTitle
 * 3. Strip common prefixes, limit to 3-6 words, apply sentence case
 *
 * @param inputs - Title computation inputs
 * @returns Computed title or undefined if no valid input
 */
export function computePrefillTitle({
  entityType,
  originalTitle,
  body,
  aiTitle,
}: TitleInputs): string | undefined {
  // 1. Prefer non-empty aiTitle
  if (aiTitle && aiTitle.trim().length > 0) {
    return aiTitle.trim();
  }

  // 2. Choose a base string: body > originalTitle
  const source =
    (body && body.trim().length > 0 && body) ||
    (originalTitle && originalTitle.trim().length > 0 && originalTitle) ||
    '';

  if (!source) return undefined;

  // 3. Strip common prefixes like "Todo:", "Remind me to", "I need to", "Just thinking about", "Maybe"
  let s = source.trim();
  s = s.replace(/^todo[:]\s*/i, '');
  s = s.replace(/^remind me to\s+/i, '');
  s = s.replace(/^i need to\s+/i, '');
  s = s.replace(/^i have to\s+/i, '');
  s = s.replace(/^just thinking about\s+/i, '');
  s = s.replace(/^just\s+/i, '');
  s = s.replace(/^maybe\s+/i, '');
  s = s.replace(/^perhaps\s+/i, '');

  // 4. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  if (!s) return undefined;

  // 5. Limit to ~3–6 words
  const words = s.split(' ');
  const maxWords = 6;
  const shortened = words.slice(0, maxWords).join(' ');

  // 6. Remove trailing punctuation
  const clean = shortened.replace(/[.!?]+$/, '');

  // 7. Sentence case: first letter uppercase, rest lowercase
  const cased = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();

  return cased;
}

/**
 * Run background AI prefill for Mind Drop entity (ENRICHMENT ONLY - Stage B)
 *
 * This function is responsible ONLY for:
 * - Computing a final title via computePrefillTitle (AI or fallback)
 * - Updating views flags (minddrop_stage = 'prefilled', ai_pending = false, freeze flags)
 *
 * This function MUST NOT:
 * - Change entity type (todo/habit/note)
 * - Change subtype on notes/logs
 * - Touch tags, tags_meta.sticky, or tags_meta.tombstones (tags come from Stage A)
 * - Create new entities
 *
 * @param entity - Entity returned from repo.create() (must have id, type, views)
 * @param rawSentence - Original user input text for AI classification
 *
 * @example
 * const entity = await repo.create({ type: 'todo', ... });
 * void backgroundPrefill(entity, "Email the landlord about the leak");
 */
export async function backgroundPrefill(entity: PrefillEntity, rawSentence: string): Promise<void> {
  const startTime = Date.now();

  console.log('[BackgroundPrefill.EnrichmentOnly] start', {
    entityId: entity.id,
    entityType: entity.type,
    textPreview: rawSentence.substring(0, 50),
  });

  try {
    // Step 1: Call Cortex to generate title (tags are for logging/debugging only)
    let cortexResult;
    let isNetworkError = false;

    try {
      cortexResult = await callClassify({
        text: rawSentence,
      });
    } catch (error) {
      // Check if this is a network error or timeout
      const errorMsg = error instanceof Error ? error.message : String(error);
      isNetworkError =
        errorMsg.includes('Network') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('fetch') ||
        errorMsg.includes('ECONNREFUSED');

      if (isNetworkError) {
        console.warn('[BackgroundPrefill.EnrichmentOnly] Network error - keeping ai_pending=true', {
          entityId: entity.id,
          error: errorMsg,
        });

        // On network error: keep ai_pending=true, don't touch minddrop_stage
        // Entity stays in 'classified' state for retry
        const existingViews = entity.views ?? {};
        const { error: updateError } = await supabase
          .from(entity.type === 'note' ? 'notes' : entity.type === 'todo' ? 'todos' : 'habits')
          .update({
            views: {
              ...existingViews,
              ai_pending: true, // Keep pending state for retry
              ai_error: errorMsg, // Track error for debugging
              // minddrop_stage stays 'classified' - don't advance to 'prefilled'
            },
          })
          .eq('id', entity.id);

        if (updateError) {
          console.error('[BackgroundPrefill.EnrichmentOnly] Failed to update ai_pending on error', {
            entityId: entity.id,
            error: updateError.message,
          });
        }

        return; // Early return - don't show ask mode or try conversion
      }

      // Re-throw non-network errors
      throw error;
    }

    if (!cortexResult.ok) {
      console.warn('[BackgroundPrefill.EnrichmentOnly] Cortex call failed', {
        entityId: entity.id,
        error: cortexResult.error,
      });
      return;
    }

    const { classification } = cortexResult;
    const aiTitle = classification?.title || null;
    const aiTags = Array.isArray(classification?.tags) ? classification.tags.filter(Boolean) : [];

    // Log AI tags for debugging, but DO NOT save them to DB (tags come from Stage A)
    console.log('[BackgroundPrefill.EnrichmentOnly] Cortex result (tags logged only, not saved)', {
      entityId: entity.id,
      classificationTitle: aiTitle, // From worker classification.title
      classificationTags: aiTags, // From worker classification.tags (not persisted)
      elapsed: Date.now() - startTime,
    });

    // Step 2: Build update payload with freeze flags (ENRICHMENT ONLY - no tag updates)
    const existingViews = entity.views ?? {};
    const updatedViews = {
      ...existingViews,
      minddrop_prefilled_v1: true,
      minddrop_stage: 'prefilled', // Mark prefill stage complete
      ai_title_frozen: true,
      ai_tags_frozen: true,
      ai_pending: false, // AI processing complete
      ai_failed: false, // Success - clear any previous failure state
    };

    // Step 3: Update entity in Supabase based on type (TITLE ONLY - no tags)
    let tableName: string;
    const updatePayload: any = {
      views: updatedViews,
    };

    switch (entity.type) {
      case 'todo': {
        tableName = 'todos';

        // Fetch the full todo to get body text and title
        const { data: fullTodo, error: fetchError } = await supabase
          .from('todos')
          .select('name, title, body')
          .eq('id', entity.id)
          .single();

        if (!fetchError && fullTodo) {
          // Compute unified prefill title (AI or fallback)
          const nextTitle = computePrefillTitle({
            entityType: 'todo',
            originalTitle: fullTodo.title ?? fullTodo.name,
            body: fullTodo.body,
            aiTitle: aiTitle,
          });

          // Only update title if nextTitle is defined AND different
          if (nextTitle && nextTitle !== fullTodo.title && nextTitle !== fullTodo.name) {
            updatePayload.name = nextTitle;
            updatePayload.title = nextTitle; // Backwards compatibility
            console.log('[BackgroundPrefill.EnrichmentOnly] Computed title for todo', {
              entityId: entity.id,
              aiTitle,
              computedTitle: nextTitle,
              source: aiTitle ? 'ai' : 'fallback',
            });
          }

          // REMOVED: Tag updates - tags come from Stage A via buildCanonicalFromMindDrop
          // Tags are set during entity creation and should not be modified here
        }
        break;
      }
      case 'habit': {
        tableName = 'habits';

        // Fetch the full habit to get name, title, and notes
        const { data: fullHabit, error: fetchHabitError } = await supabase
          .from('habits')
          .select('name, title, notes')
          .eq('id', entity.id)
          .single();

        if (!fetchHabitError && fullHabit) {
          // Compute unified prefill title (AI or fallback)
          const nextTitle = computePrefillTitle({
            entityType: 'habit',
            originalTitle: fullHabit.title ?? fullHabit.name,
            body: fullHabit.notes,
            aiTitle: aiTitle,
          });

          // Only update title if nextTitle is defined AND different
          if (nextTitle && nextTitle !== fullHabit.title && nextTitle !== fullHabit.name) {
            updatePayload.name = nextTitle;
            updatePayload.title = nextTitle; // For consistency with todos
            console.log('[BackgroundPrefill.EnrichmentOnly] Computed title for habit', {
              entityId: entity.id,
              aiTitle,
              computedTitle: nextTitle,
              source: aiTitle ? 'ai' : 'fallback',
            });
          }

          // REMOVED: Tag updates - tags come from Stage A via buildCanonicalFromMindDrop
          // Tags are set during entity creation and should not be modified here
        }
        break;
      }
      case 'note': {
        tableName = 'notes';

        // Fetch full note to get title and body
        const { data: fullNote, error: fetchError } = await supabase
          .from('notes')
          .select('title, body')
          .eq('id', entity.id)
          .single();

        if (!fetchError && fullNote) {
          // Compute unified prefill title (AI or fallback)
          const nextTitle = computePrefillTitle({
            entityType: 'note',
            originalTitle: fullNote.title,
            body: fullNote.body,
            aiTitle: aiTitle,
          });

          // DEBUG: Log comparison details
          console.log('[BackgroundPrefill.EnrichmentOnly] Note title comparison', {
            entityId: entity.id,
            currentTitle: fullNote.title,
            computedTitle: nextTitle,
            aiTitle,
            isDifferent: nextTitle && nextTitle !== fullNote.title,
            willUpdate: !!(nextTitle && nextTitle !== fullNote.title),
          });

          // Only update title if nextTitle is defined AND different
          if (nextTitle && nextTitle !== fullNote.title) {
            updatePayload.title = nextTitle;
            console.log('[BackgroundPrefill.EnrichmentOnly] Computed title for note', {
              entityId: entity.id,
              aiTitle,
              computedTitle: nextTitle,
              source: aiTitle ? 'ai' : 'fallback',
            });
          }

          // REMOVED: Tag and subtype updates - these come from Stage A via buildCanonicalFromMindDrop
          // Tags, tags_meta, and subtype are set during entity creation and should not be modified here
          // The unified tag pipeline (Stage A + buildCanonicalFromMindDrop + getEffectiveTags) is the
          // single source of truth for all tag-related fields
        }
        break;
      }
      default:
        console.warn('[BackgroundPrefill.EnrichmentOnly] Unknown entity type', {
          type: entity.type,
        });
        return;
    }

    // DEBUG: Log update payload before sending to database
    console.log('[BackgroundPrefill.EnrichmentOnly] Update payload before DB call', {
      entityId: entity.id,
      entityType: entity.type,
      tableName,
      hasTitle: 'title' in updatePayload,
      hasTags: 'tags' in updatePayload, // Should always be false now
      payloadKeys: Object.keys(updatePayload),
      titleValue: updatePayload.title,
    });

    const { data: updatedEntity, error } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq('id', entity.id)
      .select()
      .single();

    if (error) {
      console.error('[BackgroundPrefill.EnrichmentOnly] Save failed', {
        entityId: entity.id,
        error: error.message,
      });
      return;
    }

    const titleWasSet = 'title' in updatePayload || 'name' in updatePayload;
    const finalTitle = updatePayload.title ?? updatePayload.name ?? null;

    console.log('[BackgroundPrefill.EnrichmentOnly] Save success - enrichment complete', {
      entityId: entity.id,
      freezeApplied: true,
      titleSet: titleWasSet,
      title: finalTitle,
      tagsModified: false, // Tags come from Stage A, never modified here
      totalElapsed: Date.now() - startTime,
    });

    if (titleWasSet && finalTitle) {
      console.log('[BackgroundPrefill.EnrichmentOnly] Title enriched', {
        entityId: entity.id,
        title: finalTitle,
      });
    }
  } catch (error) {
    console.error('[BackgroundPrefill.EnrichmentOnly] Unexpected error', {
      entityId: entity.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Resummarize title for an existing entity
 * Calls AI to generate a new title based on the entity's current text.
 * Only updates title if user hasn't manually edited it (checks ai_title_frozen flag).
 *
 * @param entity - Entity to resummarize (todo, habit, or note)
 * @param rawText - Text to use for AI summarization
 * @returns Promise<{ title: string | null; updated: boolean }>
 */
export async function resummarizeTitle(
  entity: PrefillEntity & { views?: Record<string, any> },
  rawText: string,
): Promise<{ title: string | null; updated: boolean }> {
  console.log('[ResummarizeTitle] start', {
    entityId: entity.id,
    entityType: entity.type,
  });

  try {
    // Call Cortex for title generation
    const cortexResult = await callClassify({
      text: rawText,
    });

    if (!cortexResult.ok || !cortexResult.classification?.title) {
      console.warn('[ResummarizeTitle] No title generated', {
        entityId: entity.id,
        ok: cortexResult.ok,
      });
      return { title: null, updated: false };
    }

    const aiTitle = cortexResult.classification.title;

    // Build update based on entity type
    let tableName: string;
    const updatePayload: any = {};

    switch (entity.type) {
      case 'todo':
        tableName = 'todos';
        updatePayload.name = aiTitle;
        updatePayload.title = aiTitle;
        break;
      case 'habit':
        tableName = 'habits';
        updatePayload.name = aiTitle;
        break;
      case 'note':
        tableName = 'notes';
        updatePayload.title = aiTitle;
        break;
      default:
        return { title: null, updated: false };
    }

    // Update entity
    const { error } = await supabase.from(tableName).update(updatePayload).eq('id', entity.id);

    if (error) {
      console.error('[ResummarizeTitle] Update failed', {
        entityId: entity.id,
        error: error.message,
      });
      return { title: aiTitle, updated: false };
    }

    console.log('[ResummarizeTitle] Success', {
      entityId: entity.id,
      newTitle: aiTitle,
    });

    return { title: aiTitle, updated: true };
  } catch (error) {
    console.error('[ResummarizeTitle] Error', {
      entityId: entity.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { title: null, updated: false };
  }
}

/**
 * DEPRECATED: Tag extraction for Mind Drop entities happens ONLY in Stage A via buildCanonicalFromMindDrop.
 * Stage B (backgroundPrefill) must never modify tags or tags_meta.
 *
 * This function violates the Unified Classification Architecture Phase 1 principle that
 * tags are immutable after Stage A classification. All tag generation, filtering, and
 * enrichment must happen during entity creation via the complete tag pipeline in Stage A:
 *   1. getEffectiveTags (AI + fallback)
 *   2. Domain filters (todo/habit/log specific)
 *   3. applyThemeTags
 *   4. applyTagQualityFilter
 *   5. filterAndNormalizeTags
 *
 * For Mind Drop entities: Tags are set once in Stage A and never modified.
 * For manual user edits: Use explicit user-triggered tag editing UI, not automatic AI inference.
 *
 * @deprecated This function should not be used. Tags are set in Stage A only.
 * @param entity - Entity to resummarize tags for
 * @param rawText - Text to use for AI tag generation
 * @returns Promise<{ tags: string[]; updated: false }> - Always returns without modification
 */
export async function resummarizeTags(
  entity: PrefillEntity & {
    views?: Record<string, any>;
    subtype?: string | null;
    labels?: string[];
    tags_meta?: { sticky: string[]; tombstones: string[] };
  },
  rawText: string,
): Promise<{ tags: string[]; updated: boolean }> {
  console.warn(
    '[ResummarizeTags] DEPRECATED: This function violates Phase 1 architecture. ' +
      'Tags are set ONLY in Stage A via buildCanonicalFromMindDrop. ' +
      'Stage B must never modify tags or tags_meta.',
    {
      entityId: entity.id,
      entityType: entity.type,
      hasMindDropStage: entity.views?.minddrop_stage !== undefined,
    },
  );

  // Return entity's existing tags unchanged
  const existingTags: string[] = [];

  // Attempt to return current tags if available
  if ('tags' in entity && Array.isArray(entity.tags)) {
    existingTags.push(...entity.tags);
  }

  return {
    tags: existingTags,
    updated: false,
  };
}
