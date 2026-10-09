/**
 * @jest-environment node
 *
 * The day card's dated chips (workers/inngest-jobs/context/daily.js): a dated
 * thing is listed once, by its item when the facts are about one.
 */
import { upcomingAnchorFacts } from '../daily.js';

const TODAY = '2026-10-07';
const fact = (id, about_date, extra = {}) => ({
  id,
  statement: id,
  about_date,
  state: 'planned',
  private: false,
  ...extra,
});
const refsFor = (facts) => new Map(facts.map((f, i) => [`r${i + 1}`, { type: 'fact', id: f.id }]));

describe('the dated chips', () => {
  it('list two facts about the same item once', () => {
    const facts = [
      fact('a', '2026-10-10', { item_table: 'notes', item_id: 'n-1' }),
      fact('b', '2026-10-10', { item_table: 'notes', item_id: 'n-1' }),
      fact('c', '2026-10-12'),
    ];
    const out = upcomingAnchorFacts(['r1', 'r2', 'r3'], refsFor(facts), facts, TODAY);
    expect(out.map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('keep facts about different items, and facts about no item, apart', () => {
    const facts = [
      fact('a', '2026-10-10', { item_table: 'notes', item_id: 'n-1' }),
      fact('b', '2026-10-10', { item_table: 'todos', item_id: 'n-1' }),
      fact('c', '2026-10-10'),
      fact('d', '2026-10-10'),
    ];
    expect(
      upcomingAnchorFacts(['r1', 'r2', 'r3', 'r4'], refsFor(facts), facts, TODAY),
    ).toHaveLength(4);
  });

  it('leave out what is private, passed, past 30 days or not a plan', () => {
    const facts = [
      fact('a', '2026-10-10', { private: true }),
      fact('b', '2026-10-01'),
      fact('c', '2026-12-01'),
      fact('d', '2026-10-10', { state: 'unconfirmed' }),
      fact('e', '2026-10-10'),
    ];
    expect(
      upcomingAnchorFacts(['r1', 'r2', 'r3', 'r4', 'r5'], refsFor(facts), facts, TODAY).map(
        (f) => f.id,
      ),
    ).toEqual(['e']);
  });
});
