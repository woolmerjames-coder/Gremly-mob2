/**
 * What the person took out of a World or a Chapter themselves, remembered so
 * Gremly's filing never puts it back there (drop_link_removals; read by
 * inngest-jobs context/filing.js). Placing it there again by hand forgets it.
 *
 * Best effort: a removal that could not be remembered is logged, and taking
 * it out still stands. Never throws.
 */
import { supabase } from '../supabase/client';
import { nowTimestamp } from '../date/DateService';
import type { FiledItem } from './actions';

export interface Place {
  type: 'world' | 'chapter';
  id: string;
}

/** The places an item was taken out of and put in, by hand, in one change. */
export interface PlaceChanges {
  out?: Place[];
  in?: Place[];
}

const key = (p: Place) => `${p.type}:${p.id}`;

/** Remember what was taken out, and forget what was put back in by hand. */
export async function noteTakenOut(
  ownerId: string | null | undefined,
  item: FiledItem,
  changes: PlaceChanges,
): Promise<void> {
  if (!ownerId || !item?.id) return;
  const back = new Set((changes.in ?? []).map(key));
  // something taken out and put back in the same change was not taken out
  const out = (changes.out ?? []).filter((p) => p.id && !back.has(key(p)));
  const into = (changes.in ?? []).filter((p) => p.id);
  try {
    if (out.length) {
      const now = nowTimestamp();
      const { error } = await supabase.from('drop_link_removals').upsert(
        out.map((p) => ({
          owner_id: ownerId,
          drop_id: item.id,
          drop_type: item.type,
          place_type: p.type,
          place_id: p.id,
          removed_at: now,
        })),
        { onConflict: 'owner_id,drop_id,drop_type,place_type,place_id' },
      );
      if (error) throw error;
    }
    for (const type of ['world', 'chapter'] as const) {
      const ids = into.filter((p) => p.type === type).map((p) => p.id);
      if (!ids.length) continue;
      const { error } = await supabase
        .from('drop_link_removals')
        .delete()
        .eq('owner_id', ownerId)
        .eq('drop_id', item.id)
        .eq('drop_type', item.type)
        .eq('place_type', type)
        .in('place_id', ids);
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[Worlds] could not remember what was taken out:', err);
  }
}
