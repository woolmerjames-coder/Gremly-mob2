/**
 * splitList: where a split's cards sit on Mind Drop's list (stage 7).
 */
import {
  orderDropList,
  splitBarFor,
  splitPlaceOf,
  withoutPiecesOfCardsOnList,
  type ListCard,
} from '../splitList';

const card = (id: string, at: string, views: Record<string, unknown> = {}, drop_id?: string) =>
  ({ id, drop_id: drop_id ?? id, created_at: at, views }) as ListCard;
const piece = (id: string, at: string, index: number, more: Record<string, unknown> = {}) =>
  card(id, at, { split_group: { id: 'd1', index, count: 3, said: 'clear', ...more } });
const ids = (cards: ListCard[]) => cards.map((c) => c.id);

describe('the order of the list', () => {
  it('keeps a split’s pieces together and in their order, where the drop was', () => {
    // the pieces are saved one after another, so the later ones are newer
    const list = [
      card('older', '2026-10-09T08:00:00Z'),
      piece('p2', '2026-10-09T09:00:02Z', 2),
      card('newer', '2026-10-09T10:00:00Z'),
      piece('p0', '2026-10-09T09:00:00Z', 0),
      piece('p1', '2026-10-09T09:00:01Z', 1),
    ];
    expect(ids(orderDropList(list))).toEqual(['newer', 'p0', 'p1', 'p2', 'older']);
  });

  it('puts the pieces of a Split tapped later where the card was', () => {
    const at = '2026-10-09T08:30:00Z';
    const list = [
      card('older', '2026-10-09T08:00:00Z'),
      card('middle', '2026-10-09T09:00:00Z'),
      piece('p1', '2026-10-09T11:00:01Z', 1, { at }),
      piece('p0', '2026-10-09T11:00:00Z', 0, { at }),
    ];
    expect(ids(orderDropList(list))).toEqual(['middle', 'p0', 'p1', 'older']);
  });

  it('puts the note a split was kept as where the pieces were, before them while they fold', () => {
    const kept = card('kept', '2026-10-09T11:00:00Z', {
      kept_as_one: { group: 'd1', count: 2, at: '2026-10-09T09:00:00Z' },
    });
    const list = [
      card('older', '2026-10-09T08:00:00Z'),
      piece('p1', '2026-10-09T09:00:01Z', 1),
      card('newer', '2026-10-09T10:00:00Z'),
      piece('p0', '2026-10-09T09:00:00Z', 0),
      kept,
    ];
    expect(ids(orderDropList(list))).toEqual(['newer', 'kept', 'p0', 'p1', 'older']);
    expect(ids(orderDropList([card('older', '2026-10-09T08:00:00Z'), kept]))).toEqual([
      'kept',
      'older',
    ]);
  });

  it('leaves cards that are not a split in their order, newest first', () => {
    const list = [
      card('a', '2026-10-09T08:00:00Z'),
      card('b', '2026-10-09T10:00:00Z'),
      card('c', '2026-10-09T09:00:00Z'),
    ];
    expect(ids(orderDropList(list))).toEqual(['b', 'c', 'a']);
  });

  it('reads a card’s place in a split', () => {
    expect(splitPlaceOf(piece('p0', '', 0))).toEqual({ group: 'd1', index: 0, at: null });
    expect(splitPlaceOf({ views: { kept_as_one: { group: 'd1' } } })).toEqual({
      group: 'd1',
      index: -1,
      at: null,
    });
    expect(splitPlaceOf({ views: {} })).toBeNull();
  });
});

describe('a card being split', () => {
  it('keeps its pieces back while it is still on the list', () => {
    const original = card('t9', '2026-10-09T08:00:00Z', {}, 'd1');
    const pieces = [piece('p0', '2026-10-09T09:00:00Z', 0), piece('p1', '2026-10-09T09:00:01Z', 1)];
    expect(ids(withoutPiecesOfCardsOnList([original, ...pieces]))).toEqual(['t9']);
    expect(ids(withoutPiecesOfCardsOnList(pieces))).toEqual(['p0', 'p1']);
  });

  it('keeps the note a split was kept as back while its pieces fold away', () => {
    const kept = card('kept', '2026-10-09T11:00:00Z', { kept_as_one: { group: 'd1', count: 2 } });
    const pieces = [piece('p0', '2026-10-09T09:00:00Z', 0), piece('p1', '2026-10-09T09:00:01Z', 1)];
    expect(ids(withoutPiecesOfCardsOnList([kept, ...pieces], () => true))).toEqual(['p0', 'p1']);
    // a piece that stays (its archive did not go through) does not hold the note back
    expect(ids(withoutPiecesOfCardsOnList([kept, ...pieces], () => false))).toEqual([
      'kept',
      'p0',
      'p1',
    ]);
    expect(ids(withoutPiecesOfCardsOnList([kept]))).toEqual(['kept']);
  });
});

describe('Split into 3 and Keep as one', () => {
  const none = () => false;
  const pieces = () => [
    piece('p0', '2026-10-09T09:00:00Z', 0),
    piece('p1', '2026-10-09T09:00:01Z', 1),
    piece('p2', '2026-10-09T09:00:02Z', 2),
  ];

  it('sits under the last piece while the pieces are the newest cards', () => {
    expect(splitBarFor([...pieces(), card('older', '2026-10-09T08:00:00Z')], none, none)).toEqual({
      groupId: 'd1',
      count: 3,
      lastId: 'p2',
    });
  });

  it('goes once a newer drop lands, a piece is gone, or the pieces are going', () => {
    expect(
      splitBarFor([card('newer', '2026-10-09T10:00:00Z'), ...pieces()], none, none),
    ).toBeNull();
    expect(splitBarFor(pieces().slice(0, 2), none, none)).toBeNull();
    expect(splitBarFor(pieces(), none, (c) => c.id === 'p1')).toBeNull();
    expect(splitBarFor(pieces(), (c) => c.id === 'p0', none)).toBeNull();
  });

  it('is only for a split the classifier was clear about', () => {
    const unsure = pieces().map((p) => ({
      ...p,
      views: { split_group: { ...p.views!.split_group, said: 'unsure' } },
    }));
    expect(splitBarFor(unsure, none, none)).toBeNull();
  });
});
