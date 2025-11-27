/**
 * getMindDropRawText - Standardized extraction of raw Mind Drop sentence
 *
 * This helper provides a single source of truth for reading the original
 * Mind Drop text from any entity type (note, todo, habit).
 *
 * Used by:
 * - Overlay prefill logic (AI title + tag suggestions)
 * - Tag generation pipelines
 * - Any code that needs the raw user input from Mind Drop
 */

type AnyOverlayEntity = {
  type: 'note' | 'todo' | 'habit' | string;
  origin?: string | null;
  body?: string | null;
  title?: string | null;
  name?: string | null;
  notes?: string | null;
  [key: string]: any;
};

/**
 * Extract the raw Mind Drop sentence from an entity.
 *
 * Returns null if:
 * - Entity is not from Mind Drop (origin !== "catchall")
 * - No raw text is available
 *
 * Otherwise returns the original user input text based on entity type:
 * - note (log): body → title
 * - todo: body → title → name
 * - habit: notes → title → name
 *
 * @param entity - Any entity from the overlay or database
 * @returns The raw Mind Drop text or null
 */
export function getMindDropRawText(entity: AnyOverlayEntity | null | undefined): string | null {
  if (!entity) return null;
  if (entity.origin !== 'catchall') return null;

  const type = entity.type;

  switch (type) {
    case 'note': // unsorted/log
      return entity.body?.trim() || entity.title?.trim() || null;

    case 'todo':
      return entity.body?.trim() || entity.title?.trim() || entity.name?.trim() || null;

    case 'habit':
      return entity.notes?.trim() || entity.title?.trim() || entity.name?.trim() || null;

    default:
      return null;
  }
}

/**
 * Check if an entity has raw Mind Drop text available.
 *
 * Useful for determining if AI suggestions can be offered.
 */
export function hasMindDropRawText(entity: AnyOverlayEntity | null | undefined): boolean {
  return getMindDropRawText(entity) !== null;
}
