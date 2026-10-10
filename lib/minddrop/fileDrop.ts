/**
 * fileDrop.ts: a drop's saved item finds its place among the person's worlds,
 * chapters and life contexts (the Worker's assign-worlds), and where it went
 * is kept for the card (filing.ts). A failure is only logged. Moved out of
 * dropPipeline.ts in Mind Drop rethink stage 7, so a split made on a card
 * (splitActions.ts) files its pieces the same way.
 *
 * Stage 9: filing starts as soon as the drop is saved (startDropFiling, kept
 * by the drop's local id), so the card can settle with where it lives; it no
 * longer has the details' tags, people and date by then, only the drop's own
 * words, title and kind.
 */
import type { QueuedDrop } from './dropQueue';
import { keyedCalls, type StartedCall } from './dropCalls';
import type { DropFiling } from './filing';
import type { DropChapterLink, DropType, DropWorldLink } from '../supabase/types';
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { filingFromReply } from './filing';
import { env } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';

const filings = keyedCalls<DropFiling>('filing');

/** File the drop's saved item now, or the filing already started for it (by its local id). */
export function startDropFiling(drop: QueuedDrop): StartedCall<DropFiling> {
  return filings.start(drop.localId, () => fileDropItem(drop));
}

/** The filing started for this drop, if any (none after an app restart). */
export function startedDropFiling(localId: string): StartedCall<DropFiling> | null {
  return filings.get(localId);
}

/**
 * File a drop's saved item into its worlds, chapters and life contexts (the
 * pieces of a split one by one). Resolves to where it went, or null when it
 * was not filed (no reply, skipped, or nothing to file).
 */
export async function fileDropItem(drop: QueuedDrop): Promise<DropFiling | null> {
  // Guard: must have a saved entity id and a supported entity type
  if (!drop.supabaseId || !drop.entityType) return null;
  if (!['todo', 'habit', 'note'].includes(drop.entityType)) return null;

  // Guard: skip external calendar notes
  if (drop.entityType === 'note') {
    const note = useGremlyStore.getState().notes.find((n) => n.id === drop.supabaseId);
    if (note?.external_source != null) return null;
  }

  const cortexUrl = typeof env.cortexUrl === 'string' ? env.cortexUrl : '';
  if (!cortexUrl) return null;

  const sessionToken = await getSessionToken();
  if (!sessionToken) return null;

  const payload: Record<string, unknown> = {
    type: 'assign-worlds',
    entity_id: drop.supabaseId,
    entity_type: drop.entityType,
    text: drop.text,
  };
  if (drop.smartTitle) payload.smart_title = drop.smartTitle;
  if (drop.bucket) payload.bucket = drop.bucket;
  if (drop.subtype) payload.subtype = drop.subtype;
  if (Array.isArray(drop.tags) && drop.tags.length > 0) payload.tags = drop.tags;
  if (Array.isArray(drop.people) && drop.people.length > 0) payload.people = drop.people;
  if (drop.extractedDate) payload.extracted_date = drop.extractedDate;

  try {
    const res = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = (await res.text().catch(() => '')).substring(0, 200);
      console.warn('[AssignDropToGraph] non-OK', {
        localId: drop.localId,
        status: res.status,
        body: errText,
      });
      return null;
    }

    try {
      const data = await res.json();
      // where it went, kept for the drop card's filing chip (lib/minddrop/filing.ts)
      const filing = filingFromReply(data, getDateService().now().toISOString());
      if (filing) {
        useGremlyStore.getState().setDropFiling(drop.supabaseId, filing);
        mirrorFiling(drop.supabaseId, drop.entityType as DropType, filing);
      }
      console.log('[AssignDropToGraph] OK', {
        localId: drop.localId,
        by: filing?.by ?? null,
        world: filing?.world?.name ?? null,
        chapter: filing?.chapter?.title ?? null,
        starts_something: filing?.startsSomething ?? false,
        skipped: data.skipped,
        skipped_reason: data.skipped_reason,
      });
      return filing;
    } catch {
      console.log('[AssignDropToGraph] OK (unparsed)', { localId: drop.localId });
      return null;
    }
  } catch (err) {
    console.warn('[AssignDropToGraph] error', { localId: drop.localId, error: String(err) });
    return null;
  }
}

/**
 * Gremly's filing, as the database now has it, on the store's links too, so
 * the card's place (dropPlace.ts) and the place picker read the same as the
 * database (stage 9): Gremly's earlier filing of the drop is replaced, and the
 * person's own links are never touched.
 */
function mirrorFiling(id: string, type: DropType, filing: DropFiling): void {
  if (filing.by !== 'gremly' && filing.by !== null) return;
  const s = useGremlyStore.getState() as unknown as {
    userId?: string | null;
    dropWorldLinks: DropWorldLink[];
    dropChapterLinks: DropChapterLink[];
  };
  const at = getDateService().now().toISOString();
  const base = {
    drop_id: id,
    drop_type: type,
    owner_id: s.userId ?? '',
    relevance_score: 1,
    assigned_by: 'classifier' as const,
    reason: null,
    created_at: at,
    last_confirmed_at: null,
  };
  const gremlysOwn = (l: { drop_id: string; drop_type: string; assigned_by: string }) =>
    l.drop_id === id && l.drop_type === type && l.assigned_by === 'classifier';
  useGremlyStore.setState({
    dropWorldLinks: [
      ...s.dropWorldLinks.filter((l) => !gremlysOwn(l)),
      ...(filing.world ? [{ ...base, world_id: filing.world.id }] : []),
    ],
    dropChapterLinks: [
      ...s.dropChapterLinks.filter((l) => !gremlysOwn(l)),
      ...(filing.chapter ? [{ ...base, chapter_id: filing.chapter.id }] : []),
    ],
  } as never);
}
