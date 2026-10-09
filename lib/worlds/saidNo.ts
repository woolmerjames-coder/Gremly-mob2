/**
 * A Chapter Gremly offered in a chat that the person said no to (Worlds
 * rebuild, stage 2, decision 4): they set the card aside, left its row
 * unticked, or undid the start. The no is kept with the brief's own
 * suggestions (cortex chapter-said-no), so no chat and no brief offers it
 * again. Nothing waits on it, and a failure only goes to the log.
 */
import type { Change } from '../changes/model';
import { callChapterSaidNo } from '../cortex/CortexClient';

export interface ChapterNo {
  title: string;
  world_id: string | null;
  start_date: string | null;
  end_date: string | null;
  items: { type: string; id: string }[];
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const orNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The Chapters these rows offered to start, as each no is kept. */
export function offeredChapters(rows: Change[]): ChapterNo[] {
  const out: ChapterNo[] = [];
  for (const c of rows) {
    if (c.type !== 'chapter' || c.op !== 'add') continue;
    const f = c.fields ?? {};
    const title = text(f.name) || text(c.title);
    if (!title) continue;
    out.push({
      title,
      world_id: orNull(f.world),
      start_date: orNull(f.start_day),
      end_date: orNull(f.end_day),
      items: (Array.isArray(f.items) ? (f.items as { type?: unknown; id?: unknown }[]) : [])
        .filter(
          (i): i is { type: string; id: string } =>
            typeof i?.type === 'string' && typeof i?.id === 'string',
        )
        .map((i) => ({ type: i.type, id: i.id })),
    });
  }
  return out;
}

/** Keep the no to each Chapter these rows offered. */
export function sayNoToChapters(rows: Change[]): void {
  const chapters = offeredChapters(rows);
  if (!chapters.length) return;
  callChapterSaidNo(chapters)
    .then((r) => {
      if (!r.ok) console.warn('[SaidNo] not kept:', r.error);
    })
    .catch((err) => console.warn('[SaidNo] not kept:', err));
}
