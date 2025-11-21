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
import { validateAiTitleForTodo } from './normalizeTodoTitle';
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

        // For todos: validate AI title before applying it
        // Only use AI title if it's short, not identical to body, and shorter than body
        if (aiTitle) {
          // Fetch the full todo to get body text and existing tags for validation
          const { data: fullTodo, error: fetchError } = await supabase
            .from('todos')
            .select('body, tags')
            .eq('id', entity.id)
            .single();

          if (!fetchError && fullTodo?.body) {
            const validation = validateAiTitleForTodo(fullTodo.body, aiTitle);
            if (validation.title) {
              updatePayload.name = validation.title;
              updatePayload.title = validation.title; // Backwards compatibility
              console.log('[BackgroundPrefill] Using validated AI title for todo', {
                entityId: entity.id,
                originalAiTitle: aiTitle,
                validatedTitle: validation.title,
              });
            } else {
              console.log('[BackgroundPrefill] Rejected aiTitle for todo', {
                entityId: entity.id,
                aiTitle,
                reason: validation.reason || 'unknown',
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
          } else {
            // Fallback if we can't fetch body: use AI title as-is (backward compatible)
            updatePayload.name = aiTitle;
            updatePayload.title = aiTitle;

            // Only update tags if AI returned some tags
            if (aiTags && aiTags.length > 0) {
              updatePayload.tags = filterAndNormalizeTags(aiTags);
            }
          }
        } else {
          // No AI title - just handle tags with fallback logic
          const { data: fullTodo, error: fetchError } = await supabase
            .from('todos')
            .select('tags')
            .eq('id', entity.id)
            .single();

          if (!fetchError && fullTodo) {
            const existingTags = applyTagQualityFilter(fullTodo.tags);
            // BackgroundPrefill: starting merge for todo tags (no AI title branch)
            // Phase 4A: When AI tags are empty, return [] (don't fall back to naive existing tags)
            const effectiveTags = aiTags && aiTags.length > 0 ? filterAndNormalizeTags(aiTags) : [];

            // Phase 4B: Apply theme tags (additive)
            // Apply theme tags based on rawSentence
            const text = rawSentence ?? '';
            const withThemeTags = applyThemeTags(text, effectiveTags);
            const finalTags = applyTagQualityFilter(withThemeTags);

            if (finalTags.length > 0) {
              updatePayload.tags = finalTags;
            }

            console.log('[BackgroundPrefill] Tags for todo (no AI title)', {
              entityId: entity.id,
              aiTagsCount: aiTags.length,
              existingTagsCount: existingTags.length,
              effectiveTagsCount: effectiveTags.length,
              source: aiTags.length > 0 ? 'ai' : existingTags.length > 0 ? 'fallback' : 'none',
            });
          }
        }
        break;
      case 'habit': {
        tableName = 'habits';
        if (aiTitle) {
          updatePayload.name = aiTitle;
        }

        // BackgroundPrefill: starting merge for habit tags
        // Tag fallback for habits: Use AI tags if present, otherwise preserve existing tags from source note
        const { data: fullHabit, error: fetchHabitError } = await supabase
          .from('habits')
          .select('tags')
          .eq('id', entity.id)
          .single();

        if (!fetchHabitError && fullHabit) {
          const existingHabitTags = applyTagQualityFilter(fullHabit.tags);
          // Phase 4A: When AI tags are empty, return [] (don't fall back to naive existing tags)
          const effectiveHabitTags =
            aiTags && aiTags.length > 0 ? filterAndNormalizeTags(aiTags) : [];

          // Phase 4B: Apply theme tags (additive - e.g., #running + #exercise)
          // Apply theme tags based on rawSentence or title
          const text = rawSentence ?? aiTitle ?? '';
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
        } else if (aiTags && aiTags.length > 0) {
          // Fallback if fetch fails: use AI tags if available
          updatePayload.tags = filterAndNormalizeTags(aiTags);
        }
        break;
      }
      case 'note': {
        tableName = 'notes';
        if (aiTitle) {
          updatePayload.title = aiTitle;
        }
        // BackgroundPrefill: starting merge for log tags
        // For notes/logs: fetch full entity to get subtype, labels, existing tags
        // Then merge AI tags with subtype tag (e.g., #idea, #journal)
        // Also filters out internal markers (*idea, *journal) and low-quality tags
        const { data: fullNote, error: fetchError } = await supabase
          .from('notes')
          .select('title, body, subtype, labels, tags, tags_meta')
          .eq('id', entity.id)
          .single();

        if (!fetchError && fullNote) {
          // Phase 4B: Pass text for theme tag detection in logs
          const text = rawSentence ?? aiTitle ?? fullNote.title ?? fullNote.body ?? '';
          const { tags, tags_meta } = mergeLogSubtypeTag(
            aiTags,
            fullNote.tags,
            fullNote.subtype,
            fullNote.labels,
            fullNote.tags_meta,
            text,
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
