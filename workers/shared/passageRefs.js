/**
 * What was written from what (data fabric stage 2): for every sentence Gremly
 * stores, the facts, people and items it rests on, in public.passage_refs.
 *
 * A writer records its passages when it writes them, keyed by the table, row
 * and field that hold the sentence, so a rewrite replaces the old record. It is
 * what lets a correction find exactly the sentences resting on what changed
 * (stage 6). The writers that cite facts today record them now: the story's
 * items, and the weekly pass's Life Map threads and World and Chapter words.
 */

export const PASSAGE_KEY = 'row_table,row_id,field';

/** One passage record. Ids are kept as given; empty lists are stored as empty. */
export function passageRow({
  userId,
  surface,
  table,
  id,
  field,
  factIds = [],
  personIds = [],
  items = [],
  writer,
  model = null,
  promptVersion = null,
  at,
}) {
  return {
    user_id: userId,
    surface,
    row_table: table,
    row_id: String(id),
    field,
    fact_ids: [...new Set((factIds || []).filter(Boolean))],
    person_ids: [...new Set((personIds || []).filter(Boolean))],
    items: items || [],
    writer,
    model,
    prompt_version: promptVersion,
    written_at: at || new Date().toISOString(),
  };
}

/** Record passages, replacing any earlier record of the same table, row and field. */
export async function recordPassages(d, rows) {
  const list = (rows || []).filter((r) => r && r.row_id && r.field);
  if (!list.length) return 0;
  await d.upsert('passage_refs', list, PASSAGE_KEY);
  return list.length;
}
