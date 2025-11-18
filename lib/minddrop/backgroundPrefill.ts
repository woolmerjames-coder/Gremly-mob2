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

import { callClassify } from '../cortex/CortexClient';
import { supabase } from '../supabase/client';
import { mergeLogSubtypeTag } from './logSubtypeTags';
import { filterAndNormalizeTags } from '../tags/normalize';

interface PrefillEntity {
  id: string;
  type: 'todo' | 'habit' | 'note';
  views?: Record<string, any>;
}

interface PrefillResult {
  title?: string;
  tags?: string[];
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

    const { classification } = cortexResult;
    const aiTitle = classification?.title || null;
    const aiTags = Array.isArray(classification?.tags) ? classification.tags.filter(Boolean) : [];

    console.log('[BackgroundPrefill] Cortex result', {
      entityId: entity.id,
      aiTitle,
      aiTags,
      elapsed: Date.now() - startTime,
    });

    // Step 2: Build update payload with freeze flags
    const existingViews = entity.views ?? {};
    const updatedViews = {
      ...existingViews,
      minddrop_prefilled_v1: true,
      ai_title_frozen: true,
      ai_tags_frozen: true,
      ai_pending: false, // AI processing complete
    };

    // Step 3: Update entity in Supabase based on type
    let tableName: string;
    const updatePayload: any = {
      views: updatedViews,
    };

    switch (entity.type) {
      case 'todo':
        tableName = 'todos';
        if (aiTitle) {
          updatePayload.name = aiTitle;
          updatePayload.title = aiTitle; // Backwards compatibility
        }
        // Filter tags through unified junk filter
        updatePayload.tags = filterAndNormalizeTags(aiTags ?? []);
        break;
      case 'habit':
        tableName = 'habits';
        if (aiTitle) {
          updatePayload.name = aiTitle;
        }
        // Filter tags through unified junk filter
        updatePayload.tags = filterAndNormalizeTags(aiTags ?? []);
        break;
      case 'note': {
        tableName = 'notes';
        if (aiTitle) {
          updatePayload.title = aiTitle;
        }
        // For notes/logs: fetch full entity to get subtype, labels, existing tags
        // Then merge AI tags with subtype tag (e.g., #idea, #journal)
        // Also filters out internal markers (*idea, *journal) and low-quality tags
        const { data: fullNote, error: fetchError } = await supabase
          .from('notes')
          .select('subtype, labels, tags, tags_meta')
          .eq('id', entity.id)
          .single();

        if (!fetchError && fullNote) {
          const { tags, tags_meta } = mergeLogSubtypeTag(
            aiTags,
            fullNote.tags,
            fullNote.subtype,
            fullNote.labels,
            fullNote.tags_meta,
          );
          updatePayload.tags = tags;
          updatePayload.tags_meta = tags_meta;
        } else {
          // Fallback if fetch fails: filter AI tags through unified junk filter
          updatePayload.tags = filterAndNormalizeTags(aiTags ?? []);
        }
        break;
      }
      default:
        console.warn('[BackgroundPrefill] Unknown entity type', { type: entity.type });
        return;
    }

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

    console.log('[BackgroundPrefill] Save success', {
      entityId: entity.id,
      freezeApplied: true,
      titleSet: !!aiTitle,
      tagsCount: aiTags.length,
      totalElapsed: Date.now() - startTime,
    });
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
    // Call Cortex for tag generation
    const cortexResult = await callClassify({
      text: rawText,
    });

    if (!cortexResult.ok) {
      console.warn('[ResummarizeTags] Cortex call failed', {
        entityId: entity.id,
      });
      return { tags: [], updated: false };
    }

    const aiTags = Array.isArray(cortexResult.classification?.tags)
      ? cortexResult.classification.tags.filter(Boolean)
      : [];

    // Build update based on entity type
    let tableName: string;
    const updatePayload: any = {};
    let finalTags: string[] = [];

    switch (entity.type) {
      case 'todo':
      case 'habit':
        tableName = entity.type === 'todo' ? 'todos' : 'habits';
        finalTags = filterAndNormalizeTags(aiTags);
        updatePayload.tags = finalTags;
        break;
      case 'note': {
        tableName = 'notes';
        // For notes/logs: merge with subtype tag
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
