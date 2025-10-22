/**
 * Phase 8: Repository types for Tags and People linking
 * Updated Phase 10R: Aligned with schema (owner_id, entity_id/entity_type)
 */

export type ItemType = 'habit' | 'todo' | 'journal' | 'note' | 'catchall' | 'space';

// 10R: Aligned Tag fields with DB schema (owner_id, added color)
export interface Tag {
  id: string;
  owner_id: string; // 10R: was user_id
  name: string;
  color?: string | null; // 10R: added missing color field
  created_at: string;
  updated_at: string;
}

// 10R: Aligned TagMap fields with DB schema (owner_id, entity_id, entity_type)
export interface TagMap {
  id: string;
  owner_id: string; // 10R: was user_id
  entity_id: string; // 10R: was item_id
  tag_id: string;
  entity_type: ItemType; // 10R: was item_type
  created_at: string;
  updated_at: string;
}

// 10R: Aligned EntityPerson fields with DB schema (owner_id, entity_id, entity_type)
// Note: person_name/person_email are denormalized for convenience, actual FK is person_id
export interface EntityPerson {
  id: string; // 10R: now present in DB (unique index added)
  owner_id: string; // 10R: was user_id
  person_id: string; // 10R: FK to people table
  entity_id: string; // 10R: was item_id
  entity_type: ItemType; // 10R: was item_type
  person_name?: string | null; // Denormalized for convenience
  person_email?: string | null; // Denormalized for convenience
  created_at: string;
  updated_at: string;
}

/**
 * Phase 10.2: Cortex Primitives
 * Preferences, Lists, Events, Relations
 */

// Per-user behavior/tone settings for AI personalization
export interface CortexPreferences {
  owner_id: string;
  tone?: 'calm' | 'warm' | 'direct' | null;
  brevity?: 'short' | 'normal' | 'detailed' | null;
  encouragement?: 'low' | 'medium' | 'high' | null;
  morning_preview?: string | null; // time format 'HH:MM:SS'
  evening_review?: string | null; // time format 'HH:MM:SS'
  dnd?: Record<string, any> | null; // { start: '22:00', end: '07:00', days: [...] }
  updated_at?: string;
}

// Partial update type for preferences
export type CortexPreferencesUpdate = Partial<Omit<CortexPreferences, 'owner_id'>>;

// Named lists (shopping, reading, packing, custom)
export interface List {
  id: string;
  owner_id: string;
  key: 'shopping' | 'reading' | 'packing' | 'custom' | string;
  name: string;
  space_id?: string | null;
  created_at?: string;
}

// Insert type for lists (id auto-generated)
export type ListInsert = Omit<List, 'id' | 'created_at'>;

// Items within a list
export interface ListItem {
  id: string;
  list_id: string;
  label: string;
  qty?: number | null;
  unit?: string | null;
  meta_json?: Record<string, any> | null;
  created_at?: string;
}

// Insert type for list items
export type ListItemInsert = Omit<ListItem, 'id' | 'created_at'>;

// Event log for cortex decisions and user responses
export interface EventLog {
  id: string;
  owner_id: string;
  kind: string; // 'cortex_decision' | 'user_override' | ...
  payload_json: Record<string, any>;
  created_at?: string;
}

// Insert type for events
export type EventLogInsert = Omit<EventLog, 'id' | 'created_at'>;

// Optional: Generic relations graph
export interface Relation {
  id: string;
  owner_id: string;
  src_item_id: string;
  rel: string; // 'references' | 'contains' | 'belongs_to_space' | 'supersedes'
  dst_item_id?: string | null;
  dst_space_id?: string | null;
  created_at?: string;
}
