/**
 * askActions.ts: what the ask rules write (Mind Drop rethink stage 6). The
 * rules themselves are in asks.ts, which stays pure so Sweep's selectors can
 * read it without the store.
 *
 * - notNow: the strip closes and the item stays exactly as it was saved.
 * - lapseAsk and lapseStaleAsks: an ask that was never answered is let go,
 *   with its plain outcome written.
 * - answerAsk: one answer path for the card and Sweep. A clarify answer goes
 *   through the store's resolveEntityClarification (as the popup's did,
 *   Something else included as free text); a relation through
 *   applyDropRelation or keepDropAsNew.
 */
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import { keepsHeldNote, type RelationEntity } from './dropRelation';
import { applyDropRelation, keepDropAsNew, type RelationOutcome } from './relationActions';
import { updateDropRow } from './dropSync';
import type { ClarificationOption, ClarificationWhen } from './clarification';
import { askOf, asksOf, isAskLive, isOlderMulti, type Ask, type AskItem } from './asks';

type Kind = 'todo' | 'habit' | 'note';

function findItem(id: string): { kind: Kind; item: AskItem & { id: string } } | null {
  const s = useGremlyStore.getState();
  const match = (x: { id: string; drop_id?: string | null }) => x.id === id || x.drop_id === id;
  const todo = (s.todos || []).find(match);
  if (todo) return { kind: 'todo', item: todo as unknown as AskItem & { id: string } };
  const habit = (s.habits || []).find(match);
  if (habit) return { kind: 'habit', item: habit as unknown as AskItem & { id: string } };
  const note = (s.notes || []).find(match);
  if (note) return { kind: 'note', item: note as unknown as AskItem & { id: string } };
  return null;
}

/**
 * Not now, on the card: the strip closes and the item stays exactly as saved.
 * Nothing is resolved or skipped; Sweep asks again (stage 8). The ask's day
 * starts again today, so it is live for tonight's Sweep and tomorrow's quick
 * sweep and the card's Sweep will ask again is true (final check item 9).
 * Written on the row as the database holds it, in turn with the pipeline's
 * own updates.
 */
export async function notNow(id: string): Promise<void> {
  const found = findItem(id);
  if (!found) return;
  await updateDropRow(found.kind, found.item.id, 'not_now', (row) => {
    const views = { ...((row.views as Record<string, unknown>) || {}) };
    views.ask_on_card = false;
    views.ask_since = getDateService().today();
    return { views };
  });
}

/** The ask of this kind the row still carries, or null once it has been answered. */
function stillAsks(row: AskItem, kind: Ask['kind']): Ask | null {
  return asksOf(row).find((a) => a.kind === kind) ?? null;
}

/**
 * Let an ask go, writing its plain outcome; the item stays as it is. Built on
 * the row as the database holds it now, so an ask answered since (here, on
 * another device, or by a write still on its way) is left alone. A drop an
 * older build held as a note is filed as it was classified, as keeping it
 * would. Resolves to whether anything was written.
 */
export async function lapseAsk(id: string, ask?: Ask | null): Promise<boolean> {
  const found = findItem(id);
  if (!found) return false;
  const which = ask ?? askOf(found.item);
  if (!which) return false;
  if ((which.kind === 'relation' || which.kind === 'same') && which.relation) {
    if (found.kind === 'note' && keepsHeldNote(which.relation)) {
      // an older build held the drop as a note until answered: file it as it was classified
      await keepDropAsNew(found.item.id, 'lapsed');
      return true;
    }
  }
  return updateDropRow(found.kind, found.item.id, `lapse_${which.kind}`, (row) => {
    const now = stillAsks(row as AskItem, which.kind);
    if (!now) return null;
    const views = { ...((row.views as Record<string, unknown>) || {}) };
    if (which.kind === 'clarify') {
      return {
        clarification_resolved: true,
        views: { ...views, clarification_resolved: true, clarification_lapsed: true },
      };
    }
    if (which.kind === 'split') {
      const split = (views.split as Record<string, unknown> | undefined) || {};
      const kept = { ...views, split: { ...split, status: 'kept', lapsed: true } };
      // an older build's note waiting on multi_items stays one note, as its keep as
      // one did (the store's resolveMultiDropAsSingle); multi_items stay for history
      if (isOlderMulti(row as AskItem)) {
        return { views: { ...kept, is_multi: false, minddrop_stage: 'enriched' } };
      }
      return { views: kept };
    }
    if (!now.relation) return null;
    return { views: { ...views, relation: { ...now.relation, status: 'lapsed' } } };
  });
}

/** Write the outcome of every ask that is no longer live (the store calls this as it loads). */
export async function lapseStaleAsks(today: string = getDateService().today()): Promise<number> {
  const s = useGremlyStore.getState();
  const items = [...(s.todos || []), ...(s.habits || []), ...(s.notes || [])] as unknown as Array<
    AskItem & { id: string }
  >;
  let lapsed = 0;
  for (const item of items) {
    if (!item || item.archived === true) continue;
    for (const ask of asksOf(item)) {
      if (isAskLive(ask, today)) continue;
      try {
        if (await lapseAsk(item.id, ask)) lapsed += 1;
      } catch (err) {
        console.warn('[Asks] could not let an old question go', {
          id: item.id,
          kind: ask.kind,
          error: String(err),
        });
      }
    }
  }
  if (lapsed) console.log('[Asks] let old questions go', { lapsed });
  return lapsed;
}

export type AskAnswer =
  | {
      kind: 'clarify';
      optionId: string;
      isFreeText?: boolean;
      when?: ClarificationWhen | null;
      fallbackOption?: ClarificationOption;
    }
  | { kind: 'relation'; yes: true; picked?: RelationEntity }
  | { kind: 'relation'; yes: false };

/**
 * Answer an ask, on the card or in Sweep. Resolves to the relation's outcome
 * after a yes (for the toast and the bubble), else null.
 */
export async function answerAsk(id: string, answer: AskAnswer): Promise<RelationOutcome | null> {
  if (answer.kind === 'clarify') {
    const resolve = useGremlyStore.getState().resolveEntityClarification;
    if (answer.fallbackOption) {
      await resolve(
        id,
        answer.optionId,
        answer.isFreeText === true,
        answer.when ?? null,
        answer.fallbackOption,
      );
    } else {
      await resolve(id, answer.optionId, answer.isFreeText === true, answer.when ?? null);
    }
    return null;
  }
  if (answer.yes) return applyDropRelation(id, answer.picked);
  await keepDropAsNew(id);
  return null;
}
