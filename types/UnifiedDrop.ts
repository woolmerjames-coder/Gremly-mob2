import type { Mood } from '../lib/shared/moods';
import type { MultiDropItem } from '../lib/minddrop/types';

export type UnifiedDrop = {
  id: string;
  kind: 'note' | 'todo' | 'habit';
  title: string;
  text: string;
  created_at: string;
  unsorted?: boolean; // for notes carrying the needs_review label
  noteSubtype?: string | null;
  due_date?: string | null; // ISO timestamp for todos (fallback) - DEPRECATED, use target_date/scheduled_date
  due_day?: string | null; // YYYY-MM-DD format - canonical, timezone-safe - DEPRECATED
  due_time?: string | null; // HH:mm format for specific time
  // Date Intelligence fields (Phase C)
  target_date?: string | null; // When something IS or is DUE (external deadline/event) - YYYY-MM-DD
  scheduled_date?: string | null; // When user plans to DO the work - YYYY-MM-DD
  date_type_ambiguous?: boolean; // True if AI couldn't determine date meaning
  frequency?: string | null; // For habits: daily, weekly, monthly, custom
  cadence?: 'daily' | 'weekly' | 'monthly' | null; // Canonical cadence for habits
  target_per_period?: number | null; // Target count per period for habits
  tags?: string[];
  optimisticKind?: 'note' | 'todo' | 'habit';
  drop_id?: string | null; // For deduplication: prefer canonical items over unsorted notes
  archived?: boolean; // Track archived status to filter out converted notes
  canonical_type?: string | null; // Canonical type from buildCanonicalFromMindDrop: 'todo', 'habit', 'log', 'journal'
  labels?: string[]; // Labels from backend: ['log'], ['habit'], ['todo'], ['catchall', 'needs_review'], etc.
  views?: any; // For ai_pending, ai_failed, and other view flags
  hasPhotos?: boolean; // True if note has photo attachments
  time_estimate_minutes?: number | null; // Time estimate for todos from Phase 2 enrichment
  start_date?: string | null; // ISO date string for habit start date
  days_active?: number[] | null; // Day numbers (0=Sunday, 1=Monday, etc.) for habit scheduling
  mood?: Mood[] | null; // Multi-select moods for journal entries
  priority_kind?: string | null; // Classifier-assigned structural role for todos
  // Multi-entity support
  is_multi?: boolean; // True if this drop contains multiple items
  multi_items?: MultiDropItem[]; // The parsed items array
  multi_summary_title?: string; // Summary title for display (e.g., "Groceries + Running Habit")
  // Phase 2: Clarification fields
  needs_clarification?: boolean; // True if AI needs user to disambiguate
  clarification_resolved?: boolean; // True once user responds to clarification
  clarification_question?: string; // The question to ask the user
  clarification_options?: Array<{ id: string; label: string; action: any }>; // Available options
  clarification_type?: string; // Type of clarification needed
  reminders?: Array<{ id: string; date?: string; time: string; frequency: string }> | null;
};
