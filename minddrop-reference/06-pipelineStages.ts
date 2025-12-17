/**
 * Stage A: Classification (Phase 1)
 * From: lib/minddrop/pipelineStages.ts (lines 120-435)
 *
 * This runs when user submits a Mind Drop and AI decides what to create.
 */

export async function runMindDropStageAClassification(params: StageAParams): Promise<StageAResult> {
  const {
    repo,
    text,
    cleanedText,
    decision,
    dropId,
    sourceMessageId,
    parsedDue,
    unsortedNoteId,
    spaceId,
  } = params;

  // For TODOS:
  // - Converts unsorted note to todo via convertUnsortedToTodo()
  // - Sets views.minddrop_stage = 'classified'
  // - Sets views.ai_pending = true (still waiting for prefill)
  // - Due date comes from: firstAction.payload.due ?? parsedDue

  // For HABITS:
  // - Parses frequency from text using buildHabitFields(text)
  // - Creates habit via convertUnsortedToHabit(repo, unsortedNoteId, { frequency, frequencyValue })
  // - Sets views.minddrop_stage = 'classified'
  // - Sets views.ai_pending = true
  //
  // KEY: frequency is parsed here and passed to convertUnsortedToHabit:
  //   const { freq: parsedFreq, frequencyValue } = buildHabitFields(text);
  //   const frequency = parsedFreq;
  //   await convertUnsortedToHabit(repo, unsortedNoteId, { frequency, frequencyValue });

  // For NOTES (logs):
  // - Determines subtype from: firstAction.payload.subtype ?? decision.mindDropDecision?.logSubtype ?? 'everything_else'
  // - Maps to NoteSubtype: journal, idea, list, reference, or journal (default)
  // - Updates note with:
  //   - subtype (mapped to proper NoteSubtype)
  //   - canonicalType (e.g., 'log')
  //   - labels: adds 'log', removes 'catchall' and 'needs_review'
  //   - views.minddrop_stage = 'classified'
  //   - views.ai_pending = true
}

/**
 * Stage B: Prefill (Phase 2 Enrichment)
 * From: lib/minddrop/pipelineStages.ts (lines 461-565)
 *
 * This runs in the background AFTER Stage A completes.
 * Adds AI-generated title, tags, and other enrichment.
 */

export async function runMindDropStageBPrefill(params: StageBParams): Promise<StageBResult> {
  const { repo, entityIds, rawText } = params;

  // For each entity (todo, habit, note):
  // - Calls backgroundPrefill(entity, rawText)
  // - backgroundPrefill generates title and tags via AI
  //
  // On success:
  // - views.minddrop_stage = 'prefilled'
  // - views.minddrop_prefilled_v1 = true
  // - views.ai_pending = false
  // - views.ai_failed = false
  //
  // On failure:
  // - views.ai_pending = false
  // - views.ai_failed = true
  // - minddrop_stage stays 'classified'
}
