/**
 * lib/supabase/mappers.ts
 *
 * Mapping utilities to ensure app code conforms to live Supabase schema.
 * Source of truth: Database schema (owner_id, specific field names per table)
 */

import type { Database } from './types';

// Exported type aliases from generated schema
export type TodoRow = Database['public']['Tables']['todos']['Row'];
export type TodoInsert = Database['public']['Tables']['todos']['Insert'];
export type NoteRow = Database['public']['Tables']['notes']['Row'];
export type NoteInsert = Database['public']['Tables']['notes']['Insert'];
export type HabitRow = Database['public']['Tables']['habits']['Row'];
export type HabitInsert = Database['public']['Tables']['habits']['Insert'];
export type SpaceRow = Database['public']['Tables']['spaces']['Row'];
export type SpaceInsert = Database['public']['Tables']['spaces']['Insert'];
export type TagRow = Database['public']['Tables']['tags']['Row'];
export type TagInsert = Database['public']['Tables']['tags']['Insert'];
export type PersonRow = Database['public']['Tables']['people']['Row'];
export type PersonInsert = Database['public']['Tables']['people']['Insert'];
export type TagMapRow = Database['public']['Tables']['tag_map']['Row'];
export type TagMapInsert = Database['public']['Tables']['tag_map']['Insert'];
export type EntityPeopleRow = Database['public']['Tables']['entity_people']['Row'];
export type EntityPeopleInsert = Database['public']['Tables']['entity_people']['Insert'];

export type EntityType = 'todo' | 'note' | 'habit' | 'space';

/**
 * Map a create input to the correct database insert payload.
 *
 * Critical mappings:
 * - TODOS: Use 'name' field (NOT 'title')
 * - NOTES: Use 'title' field (NOT 'name')
 * - HABITS: Use both 'name' AND 'title' fields
 * - All tables: Use 'owner_id' (NOT 'user_id' - though some tables also track user_id for legacy)
 */
export function mapCreateInput(
  entityType: EntityType,
  value: string,
  ownerId: string,
): Partial<TodoInsert> | Partial<NoteInsert> | Partial<HabitInsert> {
  switch (entityType) {
    case 'todo':
      return {
        name: value, // DB expects 'name' for todos
        owner_id: ownerId,
        ai_placed: false,
      } as Partial<TodoInsert>;

    case 'note':
      return {
        title: value, // DB expects 'title' for notes
        subtype: 'catchall', // Required field
        owner_id: ownerId,
        ai_placed: false,
      } as Partial<NoteInsert>;

    case 'habit':
      return {
        name: value, // DB expects both 'name' and 'title'
        title: value,
        frequency: 'daily', // Required field
        subtype: 'start_habit', // Required field
        owner_id: ownerId,
        ai_placed: false,
      } as Partial<HabitInsert>;

    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

/**
 * Helper to ensure payload conforms to database Insert type.
 * This provides compile-time safety against sending unknown fields.
 */
export function validateTodoInsert(payload: unknown): TodoInsert {
  // Runtime validation happens in Zod schemas
  // This cast ensures TypeScript compile-time checking
  return payload as TodoInsert;
}

export function validateNoteInsert(payload: unknown): NoteInsert {
  return payload as NoteInsert;
}

export function validateHabitInsert(payload: unknown): HabitInsert {
  return payload as HabitInsert;
}

/**
 * Helper to log detailed Supabase errors with context.
 * Shows: code, message, details, hint for debugging.
 */
export function logSupabaseError(context: string, error: any, payload?: unknown, userId?: string) {
  console.error(`[SupabaseError] ${context}`, {
    code: error?.code,
    message: error?.message ?? String(error),
    details: error?.details,
    hint: error?.hint,
    userId,
    payload: payload ? JSON.stringify(payload, null, 2) : undefined,
  });
}

/**
 * Get user-friendly error message for common Supabase error codes.
 */
export function getUserFriendlyErrorMessage(error: any): string {
  const code = error?.code;
  const message = error?.message ?? String(error);

  switch (code) {
    case 'PGRST204':
      return `Schema mismatch: ${message}. Database schema may have changed.`;
    case '23502':
      return `Missing required field: ${message}`;
    case '42501':
      return `Permission denied: ${message}. Check RLS policies.`;
    case '23505':
      return `Duplicate entry: ${message}`;
    default:
      return message;
  }
}
