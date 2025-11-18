/**
 * EXAMPLE: How to use Mind Drop shared utilities in CatchAllNotepad.tsx
 *
 * This file demonstrates how the existing Mind Drop auto-create code
 * could be refactored to use the new shared utilities.
 *
 * NOT meant to be executed - just a reference for future refactoring.
 */

import { buildMindDropDerivedFields } from './minddropShared';
import { filterAndNormalizeTags } from '../tags/normalize';

// ============================================================================
// BEFORE: Manual field mapping (current code in CatchAllNotepad.tsx ~line 2255)
// ============================================================================

/*
// Compute combined AI tags from cortexDecide response
const engineTags = Array.isArray(decision.engineTags) ? decision.engineTags : [];
const classificationTagsRaw = Array.isArray(decision.meta?.classification?.tags)
  ? (decision.meta?.classification?.tags as string[])
  : [];
const combinedTags = filterAndNormalizeTags([...engineTags, ...classificationTagsRaw]);

for (const action of actions) {
  if (action.type === 'create.todo') {
    const rawTitle = (action.payload.title?.trim() || cleanedText).trim() || 'Quick task';
    const title = clampNoteLength(rawTitle);
    const due = action.payload.due ?? parsedIso ?? null;

    // Use AI tags or fallback to locally generated tags
    const todoTags =
      combinedTags.length > 0 ? combinedTags : buildFallbackTags(cleanedText, 'todo');

    mapped.push({
      bucket: 'todos',
      payload: {
        type: 'todo',
        title,
        name: title,
        due_date: due,
        undefined_due: !due,
        space_id: action.payload.spaceId ?? null,
        ai_placed: true,
        why_string: decision.explanation || 'Organized via Mind Drop',
        origin: 'catchall',
        sourceMessageId: validSourceMessageId,
        dropId,
        ...(todoTags.length > 0 && { tags: todoTags }),
      },
    });
  } else if (action.type === 'create.habit') {
    const rawName = action.payload.name?.trim() || cleanedText || trimmed;
    const name = clampNoteLength(rawName);
    const freqRaw = action.payload.freq;
    const frequency: 'daily' | 'weekly' | 'monthly' =
      freqRaw === 'weekly' ? 'weekly' : 'daily';

    // Use AI tags or fallback to locally generated tags
    const habitTags =
      combinedTags.length > 0 ? combinedTags : buildFallbackTags(cleanedText, 'habit');

    mapped.push({
      bucket: 'habits',
      payload: {
        type: 'habit',
        name,
        frequency,
        notes: trimmed,
        space_id: action.payload.spaceId ?? null,
        ai_placed: true,
        why_string: decision.explanation || 'Organized via Mind Drop',
        origin: 'catchall',
        sourceMessageId: validSourceMessageId,
        dropId,
        ...(habitTags.length > 0 && { tags: habitTags }),
      },
    });
  }
}
*/

// ============================================================================
// AFTER: Using shared utilities (potential refactor)
// ============================================================================

/*
// Compute combined AI tags from cortexDecide response
const engineTags = Array.isArray(decision.engineTags) ? decision.engineTags : [];
const classificationTagsRaw = Array.isArray(decision.meta?.classification?.tags)
  ? (decision.meta?.classification?.tags as string[])
  : [];
const aiTags = filterAndNormalizeTags([...engineTags, ...classificationTagsRaw]);

for (const action of actions) {
  if (action.type === 'create.todo') {
    // Use shared utility to build fields
    const fields = buildMindDropDerivedFields('todo', {
      rawText: trimmed,
      aiTags: aiTags.length > 0 ? aiTags : undefined,
    });

    const title = clampNoteLength(fields.title!);
    const due = action.payload.due ?? parsedIso ?? null;

    mapped.push({
      bucket: 'todos',
      payload: {
        type: 'todo',
        title,
        name: title,
        due_date: due,
        undefined_due: !due,
        space_id: action.payload.spaceId ?? null,
        ai_placed: true,
        why_string: decision.explanation || 'Organized via Mind Drop',
        origin: 'catchall',
        sourceMessageId: validSourceMessageId,
        dropId,
        ...(fields.tags.length > 0 && { tags: fields.tags }),
      },
    });
  } else if (action.type === 'create.habit') {
    // Use shared utility to build fields
    const fields = buildMindDropDerivedFields('habit', {
      rawText: trimmed,
      aiTags: aiTags.length > 0 ? aiTags : undefined,
    });

    const name = clampNoteLength(fields.name!);
    const freqRaw = action.payload.freq;
    const frequency: 'daily' | 'weekly' | 'monthly' =
      freqRaw === 'weekly' ? 'weekly' : 'daily';

    mapped.push({
      bucket: 'habits',
      payload: {
        type: 'habit',
        name,
        frequency,
        notes: fields.notes,  // Already contains full trimmed text
        space_id: action.payload.spaceId ?? null,
        ai_placed: true,
        why_string: decision.explanation || 'Organized via Mind Drop',
        origin: 'catchall',
        sourceMessageId: validSourceMessageId,
        dropId,
        ...(fields.tags.length > 0 && { tags: fields.tags }),
      },
    });
  }
}
*/

// ============================================================================
// Benefits of the refactor:
// ============================================================================
// 1. Single source of truth for tag cleaning
// 2. Consistent field mapping across all item types
// 3. Easier to test (unit tests for shared utility)
// 4. Less code duplication
// 5. Clear separation of concerns
// 6. Type-safe interfaces

export {};
