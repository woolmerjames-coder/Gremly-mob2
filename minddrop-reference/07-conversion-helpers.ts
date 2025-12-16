/**
 * Conversion Helpers
 * From: lib/conversion.ts (lines 352-530)
 */

// ============================================================================
// convertUnsortedToLog (lines 352-445)
// ============================================================================

export const convertUnsortedToLog = async (
  repo: IRepo,
  noteId: string,
  options: {
    subtype?: LogSubtype; // 'journal' | 'idea' | 'general'
    skipAI?: boolean;
  } = {},
): Promise<{ note: Note }> => {
  // Determines subtype:
  // 1. Manual override (options.subtype)
  // 2. AI classification via getEffectiveLogSubtype(rawText)
  // 3. Fallback to 'journal'
  // Updates note with:
  // - subtype: mapped to NoteSubtype (journal→journal, idea→idea, general→catchall)
  // - canonicalType: 'log'
  // - ai_placed: true
  // - labels: adds 'log', removes 'catchall' and 'needs_review'
  // - archived: false
};

// ============================================================================
// convertUnsortedToHabit (lines 459-560)
// ============================================================================

export const convertUnsortedToHabit = async (
  repo: IRepo,
  noteId: string,
  options: {
    frequency?: string; // ← FREQUENCY IS SET HERE
    frequencyValue?: number | null;
    nameOverride?: string;
  } = {},
): Promise<{ habit: Habit; updatedNote: Note }> => {
  // Gets note content
  const rawText = note.body ?? note.title ?? '';

  // Derives habit name from first line of text
  const firstLine = rawText.split('\n')[0].trim().slice(0, 80);
  const habitName = options.nameOverride ?? (firstLine || 'New habit');

  // Uses provided frequency or defaults to 'daily'
  const frequency = options.frequency ?? 'daily';

  // Creates habit with:
  const habitInput = {
    type: 'habit',
    name: habitName,
    frequency, // ← FREQUENCY IS STORED HERE
    frequency_value: options.frequencyValue ?? null,
    subtype: 'start_habit',
    notes: derived.notes, // Full Mind Drop text preserved
    space_id: note.space_id ?? null,
    ai_placed: !!note.ai_placed,
    canonicalType: 'habit',
    labels: ['habit'], // Removes catchall/needs_review, adds habit
    tags: derived.tags,
    dropId: note.drop_id,
    // ... other fields
  };

  const createdHabit = await repo.create(habitInput);

  // Archives the original unsorted note
  await repo.update({
    id: note.id,
    patch: {
      archived: true,
      archived_at: new Date().toISOString(),
      archived_reason: 'converted',
    },
  });

  return { habit: createdHabit, updatedNote };
};

// ============================================================================
// KEY INSIGHT
// ============================================================================

/**
 * When a habit is created via convertUnsortedToHabit:
 * 1. frequency comes from options.frequency (passed from Stage A)
 * 2. Stage A parses it from text: buildHabitFields(text) → { freq, frequencyValue }
 * 3. It's stored on the Habit entity as habit.frequency
 *
 * PROBLEM: This frequency is never mapped to UnifiedDrop in CatchAllNotepad.tsx
 *
 * SOLUTION: In the load() function where habitDrops is created, add:
 *   frequency: h.frequency,
 */
