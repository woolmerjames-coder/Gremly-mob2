/**
 * The shared cases (workers/shared/sweepAskCases.json): which questions the
 * wrap up and the quick sweep ask (Mind Drop rethink stage 8). The Worker runs
 * the same cases (workers/inngest-jobs/notifications/__tests__/
 * sweepAskCases.test.js), so the morning notification counts exactly the
 * cards the quick sweep shows.
 */
import { sweepShowsAsk } from '../asks';
import { sweepCandidatesAsOf } from '../../store/selectors';
import { quickSweepCards } from '../../sweep/quickSweep';
import { getDateService } from '../../date/DateService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const shared = require('../../../workers/shared/sweepAskCases.json') as {
  today: string;
  tz: string;
  dayEndHour: number;
  cases: Array<{
    name: string;
    kind: 'todo' | 'note' | 'habit';
    item: Record<string, unknown>;
    wrapup: boolean;
    quick: boolean;
  }>;
};

/** The case's item, otherwise not a Sweep card: a todo planned for later and decided, a swept note. */
function asItem(c: (typeof shared.cases)[number], i: number): Record<string, any> {
  const base = { id: `c${i}`, archived: false, ...c.item };
  if (c.kind === 'todo') {
    return {
      ...base,
      name: c.name,
      due_day: '2026-10-20',
      decided_at: '2026-09-01T10:00:00Z',
      completed_at: null,
    };
  }
  if (c.kind === 'note') {
    return { ...base, title: c.name, subtype: 'catchall', swept_at: '2026-09-01T10:00:00Z' };
  }
  return { ...base, name: c.name };
}

const items = shared.cases.map((c, i) => ({ c, item: asItem(c, i) }));
const of = (kind: string) => items.filter((x) => x.c.kind === kind).map((x) => x.item) as any[];
const ids = (cards: Array<{ candidate: { id: string } }>) =>
  cards.map((x) => x.candidate.id).sort();

// the person's zone and day end, as the Worker counts them
const ds = getDateService();
let was: { tz: string; hour: number };
beforeEach(() => {
  was = { tz: ds.getTimezone(), hour: ds.getDayBoundaryHour() };
  ds.setTimezone(shared.tz);
  ds.setDayBoundaryHour(shared.dayEndHour);
});
afterEach(() => {
  ds.setTimezone(was.tz);
  ds.setDayBoundaryHour(was.hour);
});

describe('the shared cases', () => {
  it.each(items.map((x) => [x.c.name, x] as const))('%s', (_name, { c, item }) => {
    expect(sweepShowsAsk(item, shared.today, 'wrapup')).toBe(c.wrapup);
    expect(sweepShowsAsk(item, shared.today, 'quick')).toBe(c.quick);
  });

  it('the wrap up and the quick sweep hold exactly the cards with a question they ask', () => {
    const wrap = sweepCandidatesAsOf(
      of('todo'),
      of('note'),
      [] as any,
      [] as any,
      shared.today,
      new Set(),
      { habits: of('habit'), asks: 'wrapup' },
    );
    expect(ids(wrap)).toEqual(
      items
        .filter((x) => x.c.wrapup)
        .map((x) => x.item.id)
        .sort(),
    );
    const base = sweepCandidatesAsOf(
      of('todo'),
      of('note'),
      [] as any,
      [] as any,
      shared.today,
      new Set(),
      { habits: of('habit'), asks: 'quick' },
    );
    expect(ids(quickSweepCards(base, shared.today))).toEqual(
      items
        .filter((x) => x.c.quick)
        .map((x) => x.item.id)
        .sort(),
    );
  });
});
