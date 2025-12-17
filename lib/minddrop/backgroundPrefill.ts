/**
 * Background Mind Drop Prefill Pipeline - Phase 2A
 *
 * Runs AI enrichment (title + tags) AFTER entity creation, not in overlay.
 * Sets freeze flags to prevent re-running AI on subsequent opens.
 *
 * Flow:
 * 1. Entity created via RPC (no AI, just raw text)
 * 2. backgroundPrefill() called with entity + raw sentence
 * 3. Call Cortex to generate title + tags
 * 4. Update entity in DB with enriched data + freeze flags
 * 5. Future overlay opens skip AI (frozen)
 */

import { callEnrichPhase2, callClassify } from '../cortex/CortexClient';
import { supabase } from '../supabase/client';
import { mergeLogSubtypeTag } from './logSubtypeTags';
import { filterAndNormalizeTags } from '../tags/normalize';
import { applyTagQualityFilter } from '../tags/quality';
import { applyThemeTags } from '../tags/themes';
import { extractMeaningfulTags } from '../tags/extractTags';

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
  aiTitle?: string | null; // from Cortex
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
 * Run background AI prefill for Mind Drop entity
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

  console.log('[BackgroundPrefill] start', {
    entityId: entity.id,
    entityType: entity.type,
    textPreview: rawSentence.substring(0, 50),
  });

  try {
    // Step 1: Call Cortex to generate title + tags
    let cortexResult;
    let isNetworkError = false;

    try {
      // Determine bucket from entity type
      const bucket = entity.type === 'todo' ? 'todo' : entity.type === 'habit' ? 'habit' : 'log';

      cortexResult = await callEnrichPhase2({
        text: rawSentence,
        bucket,
        subtype: (entity as any).subtype || null,
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
        console.warn('[BackgroundPrefill] Network error - keeping ai_pending=true', {
          entityId: entity.id,
          error: errorMsg,
        });

        // Update views to keep ai_pending=true and return early
        const existingViews = entity.views ?? {};
        const { error: updateError } = await supabase
          .from(entity.type === 'note' ? 'notes' : entity.type === 'todo' ? 'todos' : 'habits')
          .update({
            views: {
              ...existingViews,
              ai_pending: true, // Keep pending state for retry
              ai_error: errorMsg, // Track error for debugging
            },
          })
          .eq('id', entity.id);

        if (updateError) {
          console.error('[BackgroundPrefill] Failed to update ai_pending on error', {
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
      console.warn('[BackgroundPrefill] Cortex call failed', {
        entityId: entity.id,
        error: cortexResult.error,
      });
      return;
    }

    const aiTitle = cortexResult.smart_title || null;
    const aiTags = Array.isArray(cortexResult.tags) ? cortexResult.tags.filter(Boolean) : [];
    const confirmationMessage = cortexResult.confirmation_message || null;

    console.log('[BackgroundPrefill] Cortex result', {
      entityId: entity.id,
      aiTitle,
      aiTags,
      confirmationMessage,
      elapsed: Date.now() - startTime,
    });

    // Step 2: Build update payload with freeze flags
    const existingViews = entity.views ?? {};
    const updatedViews = {
      ...existingViews,
      minddrop_prefilled_v1: true,
      minddrop_stage: 'prefilled', // Mark prefill stage complete
      ai_title_frozen: true,
      ai_tags_frozen: true,
      ai_pending: false, // AI processing complete
      ai_failed: false, // Success - clear any previous failure state
      confirmation_message: confirmationMessage, // AI-generated Gremly voice
    };

    // Step 3: Update entity in Supabase based on type
    let tableName: string;
    const updatePayload: any = {
      views: updatedViews,
    };

    switch (entity.type) {
      case 'todo': {
        tableName = 'todos';

        // Fetch the full todo to get body text, title, and existing tags
        const { data: fullTodo, error: fetchError } = await supabase
          .from('todos')
          .select('name, title, body, tags')
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
            console.log('[BackgroundPrefill] Computed title for todo', {
              entityId: entity.id,
              aiTitle,
              computedTitle: nextTitle,
              source: aiTitle ? 'ai' : 'fallback',
            });
          }

          // BackgroundPrefill: starting merge for todo tags
          // Tag fallback: Use AI tags if present, otherwise preserve existing tags from source note
          // Apply quality filter to both AI tags and existing tags to drop junk
          // Phase 4A: When AI tags are empty and existing tags filter to nothing, return []
          const existingTags = applyTagQualityFilter(fullTodo.tags);
          const effectiveTags = aiTags && aiTags.length > 0 ? filterAndNormalizeTags(aiTags) : [];

          // Phase 4B: Apply theme tags (additive - preserves specific tags like #running)
          // Apply theme tags based on rawSentence or title
          const text = rawSentence ?? aiTitle ?? fullTodo.body ?? '';
          const withThemeTags = applyThemeTags(text, effectiveTags);
          const finalTags = applyTagQualityFilter(withThemeTags);

          if (finalTags.length > 0) {
            updatePayload.tags = finalTags;
          }

          console.log('[BackgroundPrefill] Tags for todo', {
            entityId: entity.id,
            aiTagsCount: aiTags.length,
            existingTagsCount: existingTags.length,
            effectiveTagsCount: effectiveTags.length,
            finalTagsCount: finalTags.length,
            source: aiTags.length > 0 ? 'ai' : existingTags.length > 0 ? 'fallback' : 'none',
          });
        }
        break;
      }
      case 'habit': {
        tableName = 'habits';

        // Fetch the full habit to get name, title, notes, and existing tags
        const { data: fullHabit, error: fetchHabitError } = await supabase
          .from('habits')
          .select('name, title, notes, tags')
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
            console.log('[BackgroundPrefill] Computed title for habit', {
              entityId: entity.id,
              aiTitle,
              computedTitle: nextTitle,
              source: aiTitle ? 'ai' : 'fallback',
            });
          }

          // BackgroundPrefill: starting merge for habit tags
          // Tag fallback for habits: Use AI tags if present, otherwise preserve existing tags from source note
          const existingHabitTags = applyTagQualityFilter(fullHabit.tags);
          // Phase 4A: When AI tags are empty, return [] (don't fall back to naive existing tags)
          const effectiveHabitTags =
            aiTags && aiTags.length > 0 ? filterAndNormalizeTags(aiTags) : [];

          // Phase 4B: Apply theme tags (additive - e.g., #running + #exercise)
          // Apply theme tags based on rawSentence or title
          const text = rawSentence ?? aiTitle ?? fullHabit.notes ?? '';
          const withThemeTags = applyThemeTags(text, effectiveHabitTags);
          const finalHabitTags = applyTagQualityFilter(withThemeTags);

          if (finalHabitTags.length > 0) {
            updatePayload.tags = finalHabitTags;
          }

          console.log('[BackgroundPrefill] Tags for habit', {
            entityId: entity.id,
            aiTagsCount: aiTags.length,
            existingTagsCount: existingHabitTags.length,
            effectiveTagsCount: effectiveHabitTags.length,
            finalTagsCount: finalHabitTags.length,
            source: aiTags.length > 0 ? 'ai' : existingHabitTags.length > 0 ? 'fallback' : 'none',
          });
        }
        break;
      }
      case 'note': {
        tableName = 'notes';

        // Fetch full note to get title, body, subtype, labels, tags
        const { data: fullNote, error: fetchError } = await supabase
          .from('notes')
          .select('title, body, subtype, labels, tags, tags_meta')
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
          console.log('[BackgroundPrefill] Note title comparison', {
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
            console.log('[BackgroundPrefill] Computed title for note', {
              entityId: entity.id,
              aiTitle,
              computedTitle: nextTitle,
              source: aiTitle ? 'ai' : 'fallback',
            });
          }

          // BackgroundPrefill: merge tags for notes/logs
          // Merge AI tags with subtype tag (e.g., #idea, #journal)
          // Filters out internal markers (*idea, *journal) and low-quality tags
          const text = rawSentence ?? aiTitle ?? fullNote.title ?? fullNote.body ?? '';
          const { tags, tags_meta } = mergeLogSubtypeTag(
            aiTags,
            fullNote.tags,
            fullNote.subtype,
            fullNote.labels,
            fullNote.tags_meta,
            text,
          );

          // CP-TAG-4: Defensive guard - always update tags for notes/logs
          // Even if tags = ["#journal"] (subtype-only), this is valid and meaningful
          // The quality filtering in mergeLogSubtypeTag ensures no junk leaks through
          updatePayload.tags = tags;
          updatePayload.tags_meta = tags_meta;
        } else {
          // CP-TAG-4: Fallback if fetch fails - filter AI tags through unified junk filter
          // This removes stop words, low-quality tags, and normalizes format
          updatePayload.tags = filterAndNormalizeTags(aiTags ?? []);
        }
        break;
      }
      default:
        console.warn('[BackgroundPrefill] Unknown entity type', { type: entity.type });
        return;
    }

    // DEBUG: Log update payload before sending to database
    console.log('[BackgroundPrefill] Update payload before DB call', {
      entityId: entity.id,
      entityType: entity.type,
      tableName,
      hasTitle: 'title' in updatePayload,
      hasTags: 'tags' in updatePayload,
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
      console.error('[BackgroundPrefill] Save failed', {
        entityId: entity.id,
        error: error.message,
      });
      return;
    }

    const titleWasSet = 'title' in updatePayload || 'name' in updatePayload;
    const finalTitle = updatePayload.title ?? updatePayload.name ?? null;

    console.log('[BackgroundPrefill] Save success', {
      entityId: entity.id,
      freezeApplied: true,
      titleSet: titleWasSet,
      title: finalTitle,
      tagsCount: aiTags.length,
      totalElapsed: Date.now() - startTime,
    });

    if (titleWasSet && finalTitle) {
      console.log('[BackgroundPrefill] Title saved', {
        entityId: entity.id,
        title: finalTitle,
      });
    }
  } catch (error) {
    console.error('[BackgroundPrefill] Unexpected error', {
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
 * Resummarize tags for an existing entity
 * Calls AI to generate new tags, filters through junk filter, merges with subtype tags for logs.
 *
 * @param entity - Entity to resummarize tags for
 * @param rawText - Text to use for AI tag generation
 * @returns Promise<{ tags: string[]; updated: boolean }>
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
  console.log('[ResummarizeTags] start', {
    entityId: entity.id,
    entityType: entity.type,
  });

  try {
    // Try AI tag generation first
    let aiTags: string[] = [];
    let usedFallback = false;

    try {
      const cortexResult = await callClassify({
        text: rawText,
      });

      if (cortexResult.ok && Array.isArray(cortexResult.classification?.tags)) {
        aiTags = cortexResult.classification.tags.filter(Boolean);
      } else {
        console.warn(
          '[ResummarizeTags] Cortex call returned no tags, using deterministic fallback',
          {
            entityId: entity.id,
          },
        );
        usedFallback = true;
      }
    } catch (error) {
      console.warn('[ResummarizeTags] Cortex call failed, using deterministic fallback', {
        entityId: entity.id,
        error: error instanceof Error ? error.message : String(error),
      });
      usedFallback = true;
    }

    // Fallback to deterministic extraction if AI failed or returned no tags
    if (usedFallback || aiTags.length === 0) {
      const subtype =
        entity.type === 'note' && entity.subtype === 'journal' ? 'journal' : undefined;
      const extractedTags = extractMeaningfulTags(rawText, subtype);
      // Convert to # prefix format for backwards compatibility
      aiTags = extractedTags.map((tag) => {
        if (tag.startsWith('@') || tag.startsWith('*')) return tag;
        return `#${tag}`;
      });
      console.log('[ResummarizeTags] Using deterministic fallback tags', {
        entityId: entity.id,
        tagsCount: aiTags.length,
      });
    }

    // Build update based on entity type
    let tableName: string;
    const updatePayload: any = {};
    let finalTags: string[] = [];

    switch (entity.type) {
      case 'todo':
      case 'habit':
        tableName = entity.type === 'todo' ? 'todos' : 'habits';
        // CP-TAG-4: Filter and normalize AI tags - removes junk, normalizes format
        finalTags = filterAndNormalizeTags(aiTags);
        updatePayload.tags = finalTags;
        break;
      case 'note': {
        tableName = 'notes';
        // CP-TAG-4: For notes/logs - merge with subtype tag (#journal, #idea, etc.)
        // mergeLogSubtypeTag applies quality filtering to both AI and existing tags
        const { tags, tags_meta } = mergeLogSubtypeTag(
          aiTags,
          [], // Don't merge with existing tags - fresh regeneration
          entity.subtype,
          entity.labels,
          entity.tags_meta,
        );
        finalTags = tags;
        updatePayload.tags = tags;
        updatePayload.tags_meta = tags_meta;
        break;
      }
      default:
        return { tags: [], updated: false };
    }

    // Update entity
    const { error } = await supabase.from(tableName).update(updatePayload).eq('id', entity.id);

    if (error) {
      console.error('[ResummarizeTags] Update failed', {
        entityId: entity.id,
        error: error.message,
      });
      return { tags: finalTags, updated: false };
    }

    console.log('[ResummarizeTags] Success', {
      entityId: entity.id,
      tagsCount: finalTags.length,
      tags: finalTags,
    });

    return { tags: finalTags, updated: true };
  } catch (error) {
    console.error('[ResummarizeTags] Error', {
      entityId: entity.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { tags: [], updated: false };
  }
}
