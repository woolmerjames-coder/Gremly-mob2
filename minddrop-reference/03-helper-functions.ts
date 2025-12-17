/**
 * Helper Functions for AnimatedMindDropCard
 * From: app/screens/CatchAllNotepad.tsx (lines 1107-1140)
 */

/**
 * Get contextual metadata string for Mind Drop card meta row
 */
function getContextualMeta(kind: 'note' | 'todo' | 'habit', item: UnifiedDrop): string | null {
  if (kind === 'todo') {
    if (item.due_date || item.due_day) {
      return formatDue({ dueDay: item.due_day, dueIso: item.due_date });
    }
    return 'no deadline yet';
  }
  if (kind === 'habit') {
    // ⚠️ PROBLEM: (item as any).frequency will be undefined!
    // UnifiedDrop doesn't have frequency mapped from the habit entity
    return (item as any).frequency || 'Habit';
  }
  // Notes/Logs - show the subtype
  const subtype = item.noteSubtype || item.canonical_type || 'log';
  if (subtype === 'journal') return 'Journal';
  if (subtype === 'idea') return 'Idea';
  if (subtype === 'list') return 'List';
  if (subtype === 'reference') return 'Reference';
  return 'Log';
}

/**
 * Get display kind for category chip - shows subtype for notes
 */
function getDisplayKindForChip(kind: 'note' | 'todo' | 'habit', item: UnifiedDrop): string {
  if (kind === 'todo') return 'Todo';
  if (kind === 'habit') return 'Habit';

  // For notes, show the specific subtype with proper capitalization
  const subtype = item.noteSubtype || item.canonical_type || 'log';
  if (subtype === 'journal') return 'Journal';
  if (subtype === 'idea') return 'Idea';
  if (subtype === 'list') return 'List';
  if (subtype === 'reference') return 'Reference';
  return 'Log';
}
