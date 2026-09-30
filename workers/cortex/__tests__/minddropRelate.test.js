/**
 * minddropRelate.js: is a Mind Drop about something the user already has?
 */
import {
  MINDDROP_RELATE_PROMPT,
  RELATE_CONFIDENCE_FLOOR,
  buildRelateInput,
  changeFor,
  decideRelation,
  shapeItems,
  withKeys,
} from '../minddropRelate.js';

const TODAY = '2026-09-30';
const items = withKeys([
  {
    id: 'todo-food-0001',
    type: 'todo',
    title: 'Order more of Bella’s food',
    due_day: null,
    due_time: null,
  },
  {
    id: 'todo-deck-0002',
    type: 'todo',
    title: 'Send Q3 deck',
    due_day: '2026-10-01',
    due_time: null,
  },
  {
    id: 'note-vet-00003',
    type: 'note',
    title: 'Bella vet appointment',
    due_day: '2026-10-02',
    due_time: null,
    target_date: '2026-10-02',
  },
  {
    id: 'note-doc-00004',
    type: 'note',
    title: 'Doctors appointment',
    due_day: null,
    due_time: null,
  },
  {
    id: 'habit-walk-005',
    type: 'habit',
    title: 'Walk Bella',
    habit_kind: 'build',
    frequency: 'daily',
    logged_days: ['2026-09-29'],
  },
  {
    id: 'habit-quit-006',
    type: 'habit',
    title: 'Quit smoking',
    habit_kind: 'break',
    frequency: 'daily',
    logged_days: [],
  },
  {
    id: 'note-vet2-0007',
    type: 'note',
    title: 'Vet: Milo check up',
    due_day: '2026-10-05',
    due_time: null,
    target_date: '2026-10-05',
  },
]);
const key = (id) => items.find((i) => i.id === id).key;
const answer = (o) => ({
  confidence: 90,
  considered: [],
  ask: false,
  candidates: [],
  change: null,
  ...o,
});

describe('prompt', () => {
  it('has no examples, no word lists and no dashes (house rules)', () => {
    expect(MINDDROP_RELATE_PROMPT).not.toMatch(/[–—]/);
    expect(MINDDROP_RELATE_PROMPT).not.toMatch(
      /\bexamples?\b|\be\.g\.|\bsuch as\b|\bfor instance\b|\bfor example\b/i,
    );
    const rules = MINDDROP_RELATE_PROMPT.split('Return ONLY JSON')[0];
    expect(rules).not.toMatch(/\([^)]*,[^)]*,[^)]*\)/);
    expect(rules).not.toMatch(/"[^"]+"\s*,\s*"[^"]+"\s*,\s*"[^"]+"/); // no quoted phrase lists
  });

  it('is the same for every user and day, so it can be cached', () => {
    expect(MINDDROP_RELATE_PROMPT).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it('puts today, the drop and every item in the user turn', () => {
    const input = buildRelateInput({ todayIso: TODAY, text: 'vet moved', candidates: items });
    expect(input).toContain('Today is Wednesday 2026-09-30.');
    expect(input).toContain('DROP:\nvet moved');
    for (const i of items) expect(input).toContain(`- id ${i.key} [${i.type}]`);
    expect(input).toContain('a habit to cut out');
  });
});

describe('items', () => {
  it('leaves out journal entries and drops still waiting on this step', () => {
    const shaped = shapeItems({
      notes: [
        { id: 'n1', title: 'Feeling low', subtype: 'journal' },
        {
          id: 'n2',
          title: 'Vet moved',
          subtype: 'catchall',
          views: { relation: { status: 'pending' } },
        },
        { id: 'n3', title: 'Trip ideas', subtype: 'idea' },
      ],
    });
    expect(shaped.map((i) => i.id)).toEqual(['n3']);
  });
});

describe('decideRelation', () => {
  it('asks nothing for a new drop, an unsure answer or an unknown id', () => {
    expect(decideRelation(answer({ relation: 'new' }), items, TODAY)).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'same',
          entity_id: key('todo-food-0001'),
          confidence: RELATE_CONFIDENCE_FLOOR - 1,
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(answer({ relation: 'same', entity_id: 'nope' }), items, TODAY),
    ).toBeNull();
    expect(decideRelation(null, items, TODAY)).toBeNull();
    expect(
      decideRelation(
        answer({ relation: 'something else', entity_id: key('todo-food-0001') }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('proposes a day change, with a time when one comes with it', () => {
    const r = decideRelation(
      answer({
        relation: 'edit',
        entity_id: key('note-vet-00003'),
        change: { field: 'due_day', value: '2026-10-01', time: '16:00' },
      }),
      items,
      TODAY,
    );
    expect(r).toMatchObject({
      kind: 'edit',
      intent: 'edit',
      change: { field: 'due_day', from: '2026-10-02', to: '2026-10-01', time_to: '16:00' },
    });
    expect(r.entity).toMatchObject({
      id: 'note-vet-00003',
      type: 'note',
      title: 'Bella vet appointment',
    });
    expect(r.entity.key).toBeUndefined();
  });

  it('asks nothing when the item already has that value, or the value is not valid', () => {
    expect(
      decideRelation(
        answer({
          relation: 'edit',
          entity_id: key('note-vet-00003'),
          change: { field: 'due_day', value: '2026-10-02' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'edit',
          entity_id: key('note-vet-00003'),
          change: { field: 'due_day', value: 'Thursday' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'edit',
          entity_id: key('habit-walk-005'),
          change: { field: 'due_day', value: '2026-10-01' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('marks a todo done, and only a todo', () => {
    expect(
      decideRelation(
        answer({ relation: 'complete', entity_id: key('todo-deck-0002') }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'edit', change: { field: 'completed', to: 'done' } });
    expect(
      decideRelation(
        answer({ relation: 'complete', entity_id: key('note-doc-00004') }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('logs a habit for the day, never twice, never a habit to cut out, never the future', () => {
    expect(
      decideRelation(
        answer({
          relation: 'logged',
          entity_id: key('habit-walk-005'),
          change: { field: 'logged', value: TODAY },
        }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'edit', change: { field: 'logged', to: TODAY } });
    expect(
      decideRelation(
        answer({ relation: 'logged', entity_id: key('habit-walk-005'), change: null }),
        items,
        TODAY,
      ),
    ).toMatchObject({ change: { to: TODAY } });
    expect(
      decideRelation(
        answer({
          relation: 'logged',
          entity_id: key('habit-walk-005'),
          change: { field: 'logged', value: '2026-09-29' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({ relation: 'logged', entity_id: key('habit-quit-006') }),
        items,
        TODAY,
      ),
    ).toBeNull();
    expect(
      decideRelation(
        answer({
          relation: 'logged',
          entity_id: key('habit-walk-005'),
          change: { field: 'logged', value: '2026-10-03' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('adds a line to a note or a todo, never to a habit', () => {
    expect(
      decideRelation(
        answer({
          relation: 'add',
          entity_id: key('note-doc-00004'),
          change: { field: 'body_add', value: 'Cut back on coffee' },
        }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'edit', change: { field: 'body_add', to: 'Cut back on coffee' } });
    expect(
      decideRelation(
        answer({
          relation: 'add',
          entity_id: key('habit-walk-005'),
          change: { field: 'body_add', value: 'x' },
        }),
        items,
        TODAY,
      ),
    ).toBeNull();
  });

  it('offers the same thing with anything new the drop adds', () => {
    const r = decideRelation(
      answer({
        relation: 'same',
        entity_id: key('todo-food-0001'),
        change: { field: 'extra', value: 'the salmon one' },
      }),
      items,
      TODAY,
    );
    expect(r).toMatchObject({ kind: 'same', extra: 'the salmon one' });
    expect(
      decideRelation(answer({ relation: 'same', entity_id: key('todo-food-0001') }), items, TODAY)
        .extra,
    ).toBeNull();
  });

  it('offers removal of an item no longer happening', () => {
    expect(
      decideRelation(
        answer({ relation: 'remove', entity_id: key('note-vet-00003') }),
        items,
        TODAY,
      ),
    ).toMatchObject({ kind: 'remove', entity: { id: 'note-vet-00003' } });
  });

  it('lets the user pick when two fit, keeping only ones the change could apply to', () => {
    const r = decideRelation(
      answer({
        relation: 'edit',
        ask: true,
        candidates: [key('note-vet-00003'), key('note-vet2-0007')],
        change: { field: 'due_day', value: '2026-10-01' },
      }),
      items,
      TODAY,
    );
    expect(r.kind).toBe('choose');
    expect(r.candidates.map((c) => c.id)).toEqual(['note-vet-00003', 'note-vet2-0007']);
    expect(r.change).toMatchObject({ field: 'due_day', value: '2026-10-01' });
  });

  it('only offers a which-one when the change can be made to the items', () => {
    const r = decideRelation(
      answer({
        relation: 'edit',
        ask: true,
        candidates: [key('note-vet-00003'), key('note-vet2-0007')],
        change: { field: 'due_day', value: null },
        confidence: 60,
      }),
      items,
      TODAY,
    );
    expect(r).toBeNull();
  });

  it('tells the app which habits are ones to cut out', () => {
    const r = decideRelation(
      answer({ relation: 'same', entity_id: key('habit-quit-006') }),
      items,
      TODAY,
    );
    expect(r.entity.habit_kind).toBe('break');
  });

  it('keeps the other items it considered for "Not that one"', () => {
    const r = decideRelation(
      answer({
        relation: 'remove',
        entity_id: key('note-vet-00003'),
        considered: [key('note-vet-00003'), key('note-vet2-0007')],
      }),
      items,
      TODAY,
    );
    expect(r.others.map((o) => o.id)).toEqual(['note-vet2-0007']);
  });
});

describe('changeFor (after a pick)', () => {
  it('builds the change for the item the user picked', () => {
    const vet2 = items.find((i) => i.id === 'note-vet2-0007');
    expect(changeFor('edit', vet2, { field: 'due_day', value: '2026-10-01' }, TODAY)).toEqual({
      field: 'due_day',
      from: '2026-10-05',
      to: '2026-10-01',
    });
  });
});
