/**
 * asks.ts: the one set of rules for every question about a drop (Mind Drop
 * rethink stage 6). The card follows them now; Sweep and the Worker's morning
 * count follow them fully from stage 8. Pure, so the card, Sweep's selectors
 * and the tests can read it without the store; what writes is in
 * askActions.ts.
 *
 * Four kinds of ask:
 * - relation: done, log, change, add, remove, or which one
 *   (views.relation.status pending);
 * - same: the drop is one they already have. Never a question on the card:
 *   a quiet line there (DupeLine), and a question in Sweep;
 * - clarify: an unclear drop (needs_clarification, not resolved);
 * - split: an unsure split (views.split.status pending), asked on its card
 *   from the sort (stage 7). An older note still waiting on multi_items is an
 *   unsure split made on its own day, never on the card, that lapses at the
 *   next load whatever its day, and stays one note.
 *
 * Every ask has the day it was made (views.ask_since, the person's day) and
 * whether it reached the card by the settle (views.ask_on_card): always for
 * clarify and split, and for a relation when stage 4 marked it surface
 * 'card'. An ask with no ask_since (made before this build) counts as made on
 * the item's own day.
 *
 * - One strip at a time on a card, in this order: a relation, then the
 *   question. A relation reaches the card before the settle and a question
 *   only at it, so the one showing stays and the other follows its answer. An
 *   ask that arrived after the settle never shows on the card.
 * - Not now (on the card): the strip closes and the item stays exactly as it
 *   was saved; ask_on_card becomes false. Nothing is resolved or skipped.
 * - In Sweep (stage 8): the evening wrap up shows live asks made that day, the
 *   morning quick sweep those made that day or the day before. Passing a
 *   question in Sweep lets it go.
 * - Lapse: once the day after ask_since is over (or when passed in Sweep), the
 *   ask lapses and the plain outcome is written: clarify becomes resolved with
 *   clarification_lapsed; split becomes kept as one; relation and same become
 *   status 'lapsed', and both items stay. isAskLive checks the day, so no
 *   timer is needed; the store writes the outcome when it next loads.
 */
import { getDateService } from '../date/DateService';
import { relationOf, type HeldRelation } from './dropRelation';

export type AskKind = 'relation' | 'same' | 'clarify' | 'split';

export interface Ask {
  kind: AskKind;
  /** the person's day the ask was made */
  since: string;
  /** reached the card by the settle, and not sent off with Not now */
  onCard: boolean;
  /** an older build's note waiting on multi_items: let go at the next load, whatever its day */
  lapsesNow?: boolean;
  relation?: HeldRelation;
}

/** The fields of a todo, habit or note the rules read. */
export interface AskItem {
  id?: string;
  created_at?: string | null;
  needs_clarification?: boolean | null;
  clarification_resolved?: boolean | null;
  archived?: boolean | null;
  views?: Record<string, any> | null;
}

const isTrue = (v: unknown) => v === true;
/** The stages a saved row is in while its details are still to come. */
const STILL_COMING = new Set(['saved', 'pending', 'enriching', 'streaming']);

/** The day an item's asks were made: views.ask_since, else the item's own day. */
export function askSinceOf(item: AskItem): string {
  const views = item.views || {};
  if (typeof views.ask_since === 'string' && views.ask_since) return views.ask_since.slice(0, 10);
  const ds = getDateService();
  return ds.dayOf(item.created_at ?? null) ?? ds.today();
}

/** The item has a question of its own that is still open. */
export function asksQuestion(item: AskItem): boolean {
  const views = item.views || {};
  const asks = isTrue(item.needs_clarification) || isTrue(views.needs_clarification);
  const resolved = isTrue(item.clarification_resolved) || isTrue(views.clarification_resolved);
  return asks && !resolved;
}

/** Every question the item carries, live or not, in the order the card asks them. */
export function asksOf(item: AskItem | null | undefined): Ask[] {
  if (!item) return [];
  const views = item.views || {};
  const since = askSinceOf(item);
  const offCard = views.ask_on_card === false;
  const asks: Ask[] = [];

  const relation = relationOf(views);
  if (relation?.status === 'pending') {
    // an older build's held note has no surface: it showed its line on the card
    const reached = relation.surface ? relation.surface === 'card' : true;
    asks.push({
      // a which one about a duplicate is a same too: never a question on the card
      kind: relation.intent === 'same' ? 'same' : 'relation',
      since,
      onCard: reached && !offCard,
      relation,
    });
  }
  if (asksQuestion(item)) asks.push({ kind: 'clarify', since, onCard: !offCard });
  const split = views.split as { status?: string } | undefined;
  if (split?.status === 'pending') {
    asks.push({ kind: 'split', since, onCard: !offCard });
  } else if (!split?.status && isOlderMulti(item)) {
    // an older build's note waiting on multi_items: made on its own day, never on
    // the card, and let go at the next load (even one made today), staying one note
    const day = getDateService().dayOf(item.created_at ?? null) ?? since;
    asks.push({ kind: 'split', since: day, onCard: false, lapsesNow: true });
  }
  return asks;
}

/** A note an older build saved holding several things, still waiting to be split. */
export function isOlderMulti(item: AskItem): boolean {
  const views = item.views || {};
  return views.is_multi === true && views.minddrop_stage === 'multi_pending';
}

/** The first question the item carries, or null. */
export function askOf(item: AskItem | null | undefined): Ask | null {
  return asksOf(item)[0] ?? null;
}

/** Still live today: made today or yesterday (the day after ask_since is not over). */
export function isAskLive(ask: Ask | null | undefined, today?: string): boolean {
  if (!ask || ask.lapsesNow) return false;
  const ds = getDateService();
  return ds.daysBetween(ask.since, today ?? ds.today()) <= 1;
}

/** The live asks only. */
export function liveAsksOf(item: AskItem | null | undefined, today?: string): Ask[] {
  return asksOf(item).filter((a) => isAskLive(a, today));
}

/**
 * The question strip the card shows, if any: one at a time, never one that
 * arrived after the settle or was sent off with Not now, never a same (that
 * is the quiet line), and a question only once the card has settled with its
 * words. An unsure split asks from the sort, as the prototype does.
 */
export function cardStripAsk(item: AskItem | null | undefined, today?: string): Ask | null {
  const views = item?.views || {};
  // an answer being filed: nothing to ask until it lands
  if (views.clarification_processing === true || views.ai_pending === true) return null;
  // as the card reads it (dropCardModel's dropCardStage): settled unless still on its way
  const settled = !STILL_COMING.has(views.minddrop_stage);
  for (const ask of liveAsksOf(item, today)) {
    if (ask.kind === 'same' || !ask.onCard) continue;
    if (ask.kind === 'clarify' && !settled) return null;
    return ask;
  }
  return null;
}

/** The quiet "You already have this" line, when a same reached the card by the settle. */
export function cardDupeAsk(item: AskItem | null | undefined, today?: string): Ask | null {
  // one item they already have; a which one about a duplicate waits for Sweep
  return (
    liveAsksOf(item, today).find(
      (a) => a.kind === 'same' && a.onCard && a.relation?.kind === 'same',
    ) ?? null
  );
}

/** A live ask sent off the card with Not now: the meta line says Sweep will ask. */
export function keptForSweep(item: AskItem | null | undefined, today?: string): boolean {
  if (item?.views?.ask_on_card !== false) return false;
  return liveAsksOf(item, today).some((a) => a.kind !== 'same');
}

/** Whether Sweep shows the item's ask: the wrap up those made today, the quick sweep today or yesterday. */
export function sweepShowsAsk(
  item: AskItem | null | undefined,
  today: string | undefined,
  when: 'wrapup' | 'quick',
): boolean {
  const ds = getDateService();
  const day = today ?? ds.today();
  return liveAsksOf(item, day).some((a) => {
    const age = ds.daysBetween(a.since, day);
    return when === 'wrapup' ? age === 0 : age <= 1;
  });
}
