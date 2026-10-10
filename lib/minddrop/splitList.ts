/**
 * splitList.ts: where a split's cards sit on Mind Drop's list (Mind Drop
 * rethink stage 7). Pure, so RecentDrops and the tests share it.
 *
 * - A split's pieces stay together, in their order, where the drop was; the
 *   note a split was kept as takes their place.
 * - A card split with Split on its card keeps its place until it has gone;
 *   its pieces come out of it then. Likewise the note a split was kept as
 *   waits while its pieces fold away, then comes in where they were.
 * - Split into 3 and Keep as one sit under a clear split's pieces while they
 *   are the newest cards and all still there.
 */

/** The fields of a card the list reads. */
export interface ListCard {
  id: string;
  drop_id?: string | null;
  created_at: string;
  views?: Record<string, any> | null;
}

/**
 * A card's place in a split: the group it belongs to and its order in it (the
 * note a split was kept as comes first), and where the group sits on the list
 * when that is not where its pieces were saved (a Split tapped on a card).
 */
export function splitPlaceOf(
  card: Pick<ListCard, 'views'>,
): { group: string; index: number; at: string | null } | null {
  const views = card.views || {};
  const g = views.split_group;
  if (g && typeof g.id === 'string') {
    return {
      group: g.id,
      index: typeof g.index === 'number' ? g.index : 0,
      at: typeof g.at === 'string' ? g.at : null,
    };
  }
  const k = views.kept_as_one;
  if (k && typeof k.group === 'string') {
    return { group: k.group, index: -1, at: typeof k.at === 'string' ? k.at : null };
  }
  return null;
}

/** Newest first, with each split's cards together and in their order. Sorts in place. */
export function orderDropList<T extends ListCard>(cards: T[]): T[] {
  const timeOf = (card: T) => new Date(card.created_at).getTime();
  const groupTime = new Map<string, number>();
  for (const card of cards) {
    const place = splitPlaceOf(card);
    if (!place) continue;
    const t = place.at ? new Date(place.at).getTime() : timeOf(card);
    const was = groupTime.get(place.group);
    if (was === undefined || t < was) groupTime.set(place.group, t);
  }
  const keys = new Map<T, { t: number; group: string; index: number }>();
  for (const card of cards) {
    const place = splitPlaceOf(card);
    keys.set(
      card,
      place
        ? { t: groupTime.get(place.group) ?? timeOf(card), group: place.group, index: place.index }
        : { t: timeOf(card), group: '', index: 0 },
    );
  }
  return cards.sort((a, b) => {
    const ka = keys.get(a)!;
    const kb = keys.get(b)!;
    if (kb.t !== ka.t) return kb.t - ka.t;
    if (ka.group !== kb.group) return ka.group < kb.group ? -1 : 1;
    return ka.index - kb.index;
  });
}

/**
 * The cards to show: a piece waits while the card it came out of is still on
 * the list, and the note a split was kept as waits while any of its pieces
 * is still going (`isGoing`).
 */
export function withoutPiecesOfCardsOnList<T extends ListCard>(
  cards: T[],
  isGoing: (card: T) => boolean = () => false,
): T[] {
  const onList = new Set<string>();
  const folding = new Set<string>();
  for (const card of cards) {
    const group = card.views?.split_group?.id;
    if (typeof group === 'string') {
      if (isGoing(card)) folding.add(group);
      continue;
    }
    onList.add(card.id);
    if (card.drop_id) onList.add(card.drop_id);
  }
  return cards.filter((card) => {
    const group = card.views?.split_group?.id;
    if (typeof group === 'string' && onList.has(group)) return false;
    const kept = card.views?.kept_as_one?.group;
    return !(typeof kept === 'string' && folding.has(kept));
  });
}

/**
 * Split into 3 and Keep as one: shown under the last piece of a clear split
 * while its pieces are the newest cards on the list, all still there and none
 * going. `isPending` and `isGoing` say which cards are still on their way in
 * or on their way out.
 */
export function splitBarFor<T extends ListCard>(
  cards: T[],
  isPending: (card: T) => boolean,
  isGoing: (card: T) => boolean,
): { groupId: string; count: number; lastId: string } | null {
  const first = cards[0];
  const g = first?.views?.split_group as
    | { id?: string; index?: number; count?: number; said?: string }
    | undefined;
  if (!first || !g?.id || isPending(first)) return null;
  // a split the classifier was unsure of was asked on its card; this is only for a clear one
  if (g.said && g.said !== 'clear') return null;
  const count = g.count ?? 0;
  if (count < 2) return null;
  const run = cards.slice(0, count);
  const whole =
    run.length === count &&
    run.every(
      (card, k) =>
        card.views?.split_group?.id === g.id &&
        card.views?.split_group?.index === k &&
        !isGoing(card),
    );
  return whole ? { groupId: g.id, count, lastId: run[count - 1].id } : null;
}
