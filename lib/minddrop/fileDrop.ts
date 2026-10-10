/**
 * fileDrop.ts: a drop's saved item finds its place among the person's worlds,
 * chapters and life contexts (the Worker's assign-worlds), and where it went
 * is kept for the card (filing.ts). Fire and forget; a failure is only logged.
 * Moved out of dropPipeline.ts in Mind Drop rethink stage 7, so a split made
 * on a card (splitActions.ts) files its pieces the same way.
 */
import type { QueuedDrop } from './dropQueue';
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { filingFromReply } from './filing';
import { env } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';

/** File a drop's saved item into its worlds, chapters and life contexts (the pieces of a split one by one). */
export async function fileDropItem(drop: QueuedDrop): Promise<void> {
  // Guard: must have a saved entity id and a supported entity type
  if (!drop.supabaseId || !drop.entityType) return;
  if (!['todo', 'habit', 'note'].includes(drop.entityType)) return;

  // Guard: skip external calendar notes
  if (drop.entityType === 'note') {
    const note = useGremlyStore.getState().notes.find((n) => n.id === drop.supabaseId);
    if (note?.external_source != null) return;
  }

  const cortexUrl = typeof env.cortexUrl === 'string' ? env.cortexUrl : '';
  if (!cortexUrl) return;

  const sessionToken = await getSessionToken();
  if (!sessionToken) return;

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
      return;
    }

    try {
      const data = await res.json();
      // where it went, kept for the drop card's filing chip (lib/minddrop/filing.ts)
      const filing = filingFromReply(data, getDateService().now().toISOString());
      if (filing) useGremlyStore.getState().setDropFiling(drop.supabaseId, filing);
      console.log('[AssignDropToGraph] OK', {
        localId: drop.localId,
        by: filing?.by ?? null,
        world: filing?.world?.name ?? null,
        chapter: filing?.chapter?.title ?? null,
        starts_something: filing?.startsSomething ?? false,
        skipped: data.skipped,
        skipped_reason: data.skipped_reason,
      });
    } catch {
      console.log('[AssignDropToGraph] OK (unparsed)', { localId: drop.localId });
    }
  } catch (err) {
    console.warn('[AssignDropToGraph] error', { localId: drop.localId, error: String(err) });
  }
}
