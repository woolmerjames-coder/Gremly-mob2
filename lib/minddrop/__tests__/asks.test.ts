/**
 * asks.ts: the one set of rules for every question about a drop (Mind Drop
 * rethink stage 6). One strip at a time; a late relation never reaches the
 * card; Not now keeps the ask live but off the card; the wrap up shows asks
 * made that day and the quick sweep that day and the day before; once the
 * day after it was made is over, an ask is no longer live.
 */
import {
  askOf,
  askSinceOf,
  asksOf,
  cardDupeAsk,
  cardStripAsk,
  isAskLive,
  isOlderMulti,
  keptForSweep,
  liveAsksOf,
  sweepShowsAsk,
} from '../asks';
import { getDateService } from '../../date/DateService';

const ds = getDateService();
let today = '';
const day = (n: number) => ds.addDays(today, n);

beforeEach(() => {
  today = ds.today();
});

const entity = { id: 'vet', type: 'todo' as const, title: 'Call the vet about the booster' };
const classified = {
  bucket: 'todo' as const,
  subtype: null,
  habitSubtype: null,
  needsClarification: false,
  ambiguityType: null,
  clarificationQuestion: null,
  clarificationOptions: null,
};
const edit = (surface?: 'card' | 'sweep', status = 'pending') => ({
  kind: 'edit',
  intent: 'edit',
  entity,
  others: [],
  confidence: 90,
  change: { field: 'due_day', from: null, to: day(2) },
  status,
  classified,
  ...(surface ? { surface } : {}),
});
const same = (surface?: 'card' | 'sweep') => ({
  kind: 'same',
  intent: 'same',
  entity,
  others: [],
  confidence: 95,
  extra: null,
  status: 'pending',
  classified,
  ...(surface ? { surface } : {}),
});

const settled = (views: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  id: 'drop',
  created_at: `${today}T09:00:00`,
  ...more,
  views: { minddrop_stage: 'settled', ask_since: today, ...views },
});

describe('the asks an item carries', () => {
  it('reads each kind: a relation, a same, a question and a split', () => {
    expect(asksOf(settled({ relation: edit('card') })).map((a) => a.kind)).toEqual(['relation']);
    expect(asksOf(settled({ relation: same('card') })).map((a) => a.kind)).toEqual(['same']);
    expect(asksOf(settled({ needs_clarification: true })).map((a) => a.kind)).toEqual(['clarify']);
    expect(asksOf(settled({}, { needs_clarification: true })).map((a) => a.kind)).toEqual([
      'clarify',
    ]);
    expect(
      asksOf(settled({ split: { status: 'pending', pieces: [] } })).map((a) => a.kind),
    ).toEqual(['split']);
  });

  it('asks nothing once answered, resolved, kept or let go', () => {
    expect(asksOf(settled({ relation: edit('card', 'applied') }))).toEqual([]);
    expect(asksOf(settled({ relation: edit('card', 'kept') }))).toEqual([]);
    expect(asksOf(settled({ relation: edit('card', 'lapsed') }))).toEqual([]);
    expect(asksOf(settled({ needs_clarification: true, clarification_resolved: true }))).toEqual(
      [],
    );
    expect(asksOf(settled({ split: { status: 'kept' } }))).toEqual([]);
    expect(asksOf(null)).toEqual([]);
  });

  it('puts a relation before the question, as the card asks them', () => {
    const item = settled({ relation: edit('card'), needs_clarification: true });
    expect(asksOf(item).map((a) => a.kind)).toEqual(['relation', 'clarify']);
    expect(askOf(item)?.kind).toBe('relation');
  });

  it('counts an ask with no day of its own from the day the item was made', () => {
    const older = {
      id: 'old',
      created_at: `${day(-3)}T10:00:00`,
      views: { needs_clarification: true },
    };
    expect(askSinceOf(older)).toBe(day(-3));
    expect(askSinceOf(settled())).toBe(today);
  });
});

describe('live', () => {
  it('is live the day it was made and the day after, and lapses after that', () => {
    const made = (n: number) => askOf(settled({ needs_clarification: true, ask_since: day(n) }));
    expect(isAskLive(made(0))).toBe(true);
    expect(isAskLive(made(-1))).toBe(true);
    expect(isAskLive(made(-2))).toBe(false);
    expect(isAskLive(null)).toBe(false);
  });

  it('lets a pre-build question go by its item day', () => {
    const older = { id: 'old', created_at: `${day(-40)}T10:00:00`, needs_clarification: true };
    expect(asksOf(older)).toHaveLength(1);
    expect(liveAsksOf(older)).toEqual([]);
  });
});

describe('the card', () => {
  it('shows one strip at a time: the relation first, then the question after it is answered', () => {
    const both = settled({ relation: edit('card'), needs_clarification: true, ask_on_card: true });
    expect(cardStripAsk(both)?.kind).toBe('relation');
    const answered = settled({
      relation: edit('card', 'kept'),
      needs_clarification: true,
      ask_on_card: true,
    });
    expect(cardStripAsk(answered)?.kind).toBe('clarify');
  });

  it('never shows a relation that came after the settle', () => {
    expect(cardStripAsk(settled({ relation: edit('sweep') }))).toBeNull();
    expect(cardDupeAsk(settled({ relation: same('sweep') }))).toBeNull();
    // still asked in Sweep
    expect(liveAsksOf(settled({ relation: edit('sweep') }))).toHaveLength(1);
  });

  it('shows a relation as soon as it lands, and a question only once the card has settled', () => {
    const sorted = { id: 'd', views: { minddrop_stage: 'saved', ask_since: today } };
    expect(
      cardStripAsk({ ...sorted, views: { ...sorted.views, relation: edit('card') } })?.kind,
    ).toBe('relation');
    expect(
      cardStripAsk({ ...sorted, views: { ...sorted.views, needs_clarification: true } }),
    ).toBeNull();
    expect(cardStripAsk(settled({ needs_clarification: true }))?.kind).toBe('clarify');
  });

  it('shows nothing while an answer is being filed', () => {
    expect(
      cardStripAsk(settled({ needs_clarification: true, clarification_processing: true })),
    ).toBeNull();
    expect(cardStripAsk(settled({ needs_clarification: true, ai_pending: true }))).toBeNull();
  });

  it('never asks a same with a strip: it is the quiet line', () => {
    const item = settled({ relation: same('card') });
    expect(cardStripAsk(item)).toBeNull();
    expect(cardDupeAsk(item)?.kind).toBe('same');
  });

  it('asks an unsure split on the card from the sort, before its details are in', () => {
    expect(cardStripAsk(settled({ split: { status: 'pending' }, ask_on_card: true }))?.kind).toBe(
      'split',
    );
    const sorted = {
      ...settled(),
      views: { minddrop_stage: 'saved', split: { status: 'pending' } },
    };
    expect(cardStripAsk(sorted)?.kind).toBe('split');
    expect(cardStripAsk(settled({ split: { status: 'pending' }, ask_on_card: false }))).toBeNull();
    expect(cardStripAsk(settled({ split: { status: 'kept' } }))).toBeNull();
  });

  it('reads an older build’s note still waiting to be split as a split made on its own day, never on the card', () => {
    const older = {
      id: 'old',
      created_at: `${day(-40)}T09:00:00`,
      views: { is_multi: true, minddrop_stage: 'multi_pending', multi_items: [{ text: 'a' }] },
    };
    expect(asksOf(older)).toEqual([
      { kind: 'split', since: day(-40), onCard: false, lapsesNow: true },
    ]);
    expect(isAskLive(askOf(older))).toBe(false);
    // one an older build made today lets go at the next load too
    const today = { ...older, created_at: `${day(0)}T09:00:00` };
    expect(askOf(today)?.since).toBe(day(0));
    expect(isAskLive(askOf(today))).toBe(false);
    expect(cardStripAsk(older)).toBeNull();
    // once it has an outcome it asks nothing
    expect(asksOf({ ...older, views: { ...older.views, split: { status: 'kept' } } })).toEqual([]);
    expect(isOlderMulti({ views: { is_multi: true, minddrop_stage: 'enriched' } })).toBe(false);
  });

  it('treats a relation an older build held as a note as one for the card', () => {
    expect(cardStripAsk(settled({ relation: edit() }))?.kind).toBe('relation');
  });

  it('after Not now: no strip, the ask stays live, and the card says Sweep will ask', () => {
    const later = settled({ needs_clarification: true, ask_on_card: false });
    expect(cardStripAsk(later)).toBeNull();
    expect(liveAsksOf(later)).toHaveLength(1);
    expect(keptForSweep(later)).toBe(true);
    // a same left alone is not "kept for Sweep" on the card
    expect(keptForSweep(settled({ relation: same('card'), ask_on_card: false }))).toBe(false);
    // and once it lapses, nothing says Sweep will ask
    expect(
      keptForSweep(settled({ needs_clarification: true, ask_on_card: false, ask_since: day(-2) })),
    ).toBe(false);
  });

  it('shows nothing that has lapsed', () => {
    expect(cardStripAsk(settled({ relation: edit('card'), ask_since: day(-2) }))).toBeNull();
    expect(cardDupeAsk(settled({ relation: same('card'), ask_since: day(-2) }))).toBeNull();
  });
});

describe('Sweep', () => {
  const made = (n: number) => settled({ needs_clarification: true, ask_since: day(n) });

  it('the evening wrap up shows only the asks made that day', () => {
    expect(sweepShowsAsk(made(0), today, 'wrapup')).toBe(true);
    expect(sweepShowsAsk(made(-1), today, 'wrapup')).toBe(false);
  });

  it('the morning quick sweep shows the asks made that day or the day before', () => {
    expect(sweepShowsAsk(made(0), today, 'quick')).toBe(true);
    expect(sweepShowsAsk(made(-1), today, 'quick')).toBe(true);
    expect(sweepShowsAsk(made(-2), today, 'quick')).toBe(false);
  });

  it('still shows an ask sent off the card with Not now', () => {
    const later = settled({ relation: edit('card'), ask_on_card: false });
    expect(sweepShowsAsk(later, today, 'wrapup')).toBe(true);
  });

  it('has nothing to show for an item that asks nothing', () => {
    expect(sweepShowsAsk(settled(), today, 'quick')).toBe(false);
  });
});
