/**
 * Gremly's guesses when a Chapter is started by hand (Worlds rebuild, stage
 * 3, cortex context/chapterGuess.js), as the sheet takes them: only a World
 * they see, their own things, and a Gremly the app can show. Null when there
 * was no guess, and the sheet is filled in by hand.
 */
import { callChapterGuess } from '../cortex/CortexClient';
import { MASCOT_ASSETS } from '../store/mascotRegistry';
import type { FiledItem } from './actions';
import { dayOf } from './model';

export interface ChapterGuess {
  title: string;
  worldId: string | null;
  newWorld: { name: string; gremly: string } | null;
  startDate: string | null;
  endDate: string | null;
  gremly: string | null;
  items: FiledItem[];
}

const TYPES: FiledItem['type'][] = ['todo', 'note', 'habit'];
const shows = (slug: unknown): string | null =>
  typeof slug === 'string' && MASCOT_ASSETS[slug] ? slug : null;

/** The guess for this line, or null. Never throws. */
export async function guessChapter(
  line: string,
  today: string,
  worldIds: string[],
): Promise<ChapterGuess | null> {
  const said = line.replace(/\s+/g, ' ').trim();
  if (!said) return null;
  try {
    const r = await callChapterGuess({ line: said, today });
    const g = r.ok ? r.data : null;
    if (!g?.guessed) return null;
    const worldId = g.world_id && worldIds.includes(g.world_id) ? g.world_id : null;
    const nw = !worldId && g.new_world?.name?.trim() ? g.new_world : null;
    return {
      title: String(g.title || said).trim() || said,
      worldId,
      newWorld: nw ? { name: nw.name.trim(), gremly: shows(nw.gremly) || 'gremly-mascot' } : null,
      startDate: dayOf(g.start_date ?? null),
      endDate: dayOf(g.end_date ?? null),
      gremly: shows(g.gremly),
      items: (g.items ?? [])
        .filter((i) => TYPES.includes(i?.type as FiledItem['type']) && typeof i?.id === 'string')
        .map((i) => ({ type: i.type as FiledItem['type'], id: i.id })),
    };
  } catch (err) {
    console.warn('[Worlds] Gremly could not guess:', err);
    return null;
  }
}
