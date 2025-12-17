/**
 * UnifiedDrop Type Definition
 * From: app/screens/CatchAllNotepad.tsx (lines 772-789)
 */

type UnifiedDrop = {
  id: string;
  kind: 'note' | 'todo' | 'habit';
  title: string;
  text: string;
  created_at: string;
  unsorted?: boolean; // for notes carrying the needs_review label
  noteSubtype?: string | null;
  due_date?: string | null; // ISO timestamp for todos (fallback)
  due_day?: string | null; // YYYY-MM-DD format - canonical, timezone-safe
  due_time?: string | null; // HH:mm format for specific time
  tags?: string[];
  optimisticKind?: 'note' | 'todo' | 'habit';
  drop_id?: string | null; // For deduplication: prefer canonical items over unsorted notes
  archived?: boolean; // Track archived status to filter out converted notes
  canonical_type?: string | null; // Canonical type from buildCanonicalFromMindDrop: 'todo', 'habit', 'log', 'journal'
  labels?: string[]; // Labels from backend: ['log'], ['habit'], ['todo'], ['catchall', 'needs_review'], etc.
  views?: any; // For ai_pending, ai_failed, and other view flags
};

/**
 * IMPORTANT NOTES:
 *
 * 1. UnifiedDrop does NOT have a `frequency` field for habits!
 *    - The habit's frequency is stored on the actual Habit entity in the database
 *    - When mapping habits to UnifiedDrop in the `load` function, frequency is NOT included
 *    - You would need to add: frequency?: string | null; to UnifiedDrop
 *
 * 2. For notes, subtype comes from:
 *    - noteSubtype (set from note.subtype in load function)
 *    - canonical_type (fallback)
 *
 * 3. The getContextualMeta function currently does (item as any).frequency
 *    which will always be undefined because frequency isn't mapped to UnifiedDrop
 */
