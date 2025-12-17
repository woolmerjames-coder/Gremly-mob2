/**
 * Entity Type Definitions - Habit and Note
 * From: lib/types.ts
 */

// ============================================================================
// HABIT (lines 29-80)
// ============================================================================

export interface Habit {
  id: ID;
  type: 'habit';
  name: string; // The habit name/title
  frequency: Frequency; // ← THIS IS WHERE FREQUENCY IS STORED: 'daily' | 'weekly' | 'monthly' | 'custom'
  subtype: HabitSubtype; // Required: start_habit | break_habit | routine
  space_id?: ID | null;
  ai_placed: boolean;
  archived?: boolean;
  archived_at?: string | null;
  archived_reason?: string | null;
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | 'overlay' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType;
  labels?: string[];
  views?: {
    ai_pending?: boolean;
    ai_failed?: boolean;
    minddrop_stage?: 'pending' | 'classified' | 'prefilled';
    minddrop_prefilled_v1?: boolean;
    [key: string]: any;
  };
  drop_id?: string | null;
  created_at: string;
  updated_at: string;
  owner_id: ID;

  // Cadence tracking (Phase 10.10)
  cadence?: Cadence; // Defaults to 'daily' in DB
  target_per_period?: number;
  target_per_day?: number;
  days_active?: string[] | null;
  last_completed_at?: string | null;
  period_start_at?: string | null;

  commitment?: boolean;
  commitment_started_at?: string | null;
  commitment_note?: string | null;
  commitment_archived_at?: string | null;

  // Extended habit fields (Phase 7+)
  frequency_value?: any; // FrequencyValue JSON (daily, weekly, monthly, custom_days, n_per_period)
  reminders?: any[] | null;
  notes?: string | null;
  tags?: string[] | null;
  tags_meta?: TagsMeta | null;
  buddy_id?: ID | null;
  buddy_email?: string | null;
  stack_with_id?: ID | null;
  stack_position?: 'before' | 'after' | null;
  stack_offset_minutes?: number | null;
  start_date?: string | null;
}

// ============================================================================
// NOTE (lines 157-207)
// ============================================================================

export interface Note {
  id: ID;
  type: 'note';
  title?: string | null;
  body?: string | null;
  subtype: NoteSubtype; // ← THIS IS WHERE SUBTYPE IS STORED: 'journal' | 'idea' | 'list' | 'reference' | 'catchall'
  space_id?: ID | null;
  ai_placed: boolean;
  archived?: boolean;
  archived_at?: string | null;
  archived_reason?: string | null;
  why_string?: string | null;
  origin?: 'catchall' | 'space_chat' | 'manual' | 'overlay' | null;
  canonicalType?: CanonicalType | LegacyCanonicalType; // ← Also relevant: 'log', 'journal', 'idea', 'list'
  labels?: string[];
  views?: {
    ai_pending?: boolean;
    ai_failed?: boolean;
    minddrop_stage?: 'pending' | 'classified' | 'prefilled';
    minddrop_prefilled_v1?: boolean;
    [key: string]: any;
  };
  source_message_id?: string | null;
  drop_id?: string | null;
  created_at: string;
  updated_at: string;
  owner_id: ID;

  // Note formatting and organization (Phase 7+)
  fmt?: 'bullets' | 'numbers' | 'checkboxes' | null;
  tags?: string[] | null;

  // Journal-specific fields (Phase 7+) - only used when subtype='journal'
  date?: string | null;
  mood?: 'ecstatic' | 'happy' | 'neutral' | 'low' | 'sad' | 'tired' | null;
  reminders?: any[] | null;
  journal_subtype?: 'reflection' | 'gratitude' | 'dream' | 'review' | null;
  tags_meta?: TagsMeta | null;

  // Make Actionable feature fields
  is_favorite?: boolean;
  has_list?: boolean;
  list_items?: Array<{ id: string; text: string; checked: boolean }> | null;
  is_pinned?: boolean;
  skipped_in_sweep_at?: string | null;
}

// ============================================================================
// KEY TAKEAWAYS
// ============================================================================

/**
 * HABIT FREQUENCY:
 * - Stored in habit.frequency (string: 'daily' | 'weekly' | 'monthly' | 'custom')
 * - Also has frequency_value for more complex schedules
 *
 * NOTE SUBTYPE:
 * - Stored in note.subtype (NoteSubtype: 'journal' | 'idea' | 'list' | 'reference' | 'catchall')
 * - Also has canonicalType for broader categorization ('log', 'journal', etc.)
 *
 * THE PROBLEM:
 * When mapping to UnifiedDrop in CatchAllNotepad.tsx load() function:
 * - noteSubtype is mapped from note.subtype ✓
 * - frequency is NOT mapped from habit.frequency ✗
 *
 * FIX NEEDED:
 * Add frequency to UnifiedDrop type and map it in the habitDrops mapping:
 *
 * const habitDrops: UnifiedDrop[] = habits.map((h) => ({
 *   ...
 *   frequency: h.frequency,  // ADD THIS LINE
 * }));
 */
