/**
 * Phase 8: Repository types for Tags and People linking
 */

export type ItemType = 'habit' | 'todo' | 'journal' | 'note' | 'catchall' | 'space';

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TagMap {
  id: string;
  user_id: string;
  item_id: string;
  tag_id: string;
  item_type: ItemType;
  created_at: string;
  updated_at: string;
}

export interface EntityPerson {
  id: string;
  user_id: string;
  item_id: string;
  item_type: ItemType;
  person_name?: string | null;
  person_email?: string | null;
  created_at: string;
  updated_at: string;
}
