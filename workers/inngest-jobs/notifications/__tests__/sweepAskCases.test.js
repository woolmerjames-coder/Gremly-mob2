/**
 * The shared cases (workers/shared/sweepAskCases.json): which questions the
 * wrap up and the quick sweep ask (Mind Drop rethink stage 8). The app runs
 * the same cases (lib/minddrop/__tests__/sweepAskCases.test.ts), so the
 * morning notification counts exactly the cards the quick sweep shows.
 */
import { eveningItems, quickSweepItems, rowAsks } from '../sweepCount';
import shared from '../../../shared/sweepAskCases.json';

const { today, tz, dayEndHour } = shared;

/** The case's item as the Worker reads it from the database (sweepCount's columns). */
function asRow(c, i) {
  const { views = {}, ...cols } = c.item;
  const row = {
    id: `c${i}`,
    ...cols,
    v_needs: views.needs_clarification ?? null,
    v_resolved: views.clarification_resolved ?? null,
    relation: views.relation ?? null,
    ask_since: views.ask_since ?? null,
    split_status: views.split?.status ?? null,
  };
  // otherwise not a Sweep card: a todo planned for later and decided, a swept note
  if (c.kind === 'todo')
    return { ...row, due_day: '2026-10-20', decided_at: '2026-09-01T10:00:00Z' };
  if (c.kind === 'note') return { ...row, subtype: 'catchall', swept_at: '2026-09-01T10:00:00Z' };
  return row;
}

const rows = shared.cases.map((c, i) => ({ c, row: asRow(c, i) }));
const of = (kind) => rows.filter((x) => x.c.kind === kind).map((x) => x.row);

describe('the shared cases', () => {
  it.each(rows.map((x) => [x.c.name, x]))('%s', (_name, { c, row }) => {
    expect(rowAsks(row, today, 'wrapup', { tz, dayEndHour })).toBe(c.wrapup);
    expect(rowAsks(row, today, 'quick', { tz, dayEndHour })).toBe(c.quick);
  });

  it('the wrap up and the quick sweep count exactly the cards with a question they ask', () => {
    const input = {
      todos: of('todo'),
      notes: of('note'),
      habits: of('habit'),
      today,
      tz,
      dayEndHour,
    };
    const evening = eveningItems(input);
    const quick = quickSweepItems(input);
    const ids = (list) => list.map((r) => r.id).sort();
    expect(ids([...evening.todos, ...evening.notes, ...evening.habits])).toEqual(
      rows
        .filter((x) => x.c.wrapup)
        .map((x) => x.row.id)
        .sort(),
    );
    expect(
      ids([...quick.pastDay, ...quick.noDay, ...quick.other, ...quick.notes, ...quick.habits]),
    ).toEqual(
      rows
        .filter((x) => x.c.quick)
        .map((x) => x.row.id)
        .sort(),
    );
  });
});
